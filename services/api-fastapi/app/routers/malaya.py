import json
import os
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from groq import Groq

from app.auth import CurrentUser, get_current_user
from app.deps import get_supabase
from app.routers.summary import _compute_branch_summary, _compute_organization_summary, _today_bounds
from app.schemas import MalayaQueryRequest, MalayaQueryResponse

router = APIRouter(tags=["malaya"])

GROQ_MODEL = "llama-3.3-70b-versatile"

SYSTEM_PROMPT = """You are Malaya, the AI business analyst for Saint Michael Food Corp,
a multi-branch restaurant group. You answer questions about the branch(es) the
user manages, using ONLY the JSON data block provided in the user message —
never invent numbers that aren't in that data. If the data doesn't cover what
was asked, say so plainly instead of guessing.

Keep answers conversational and short (2-4 sentences), like a sharp analyst
briefing a busy manager, not a report. All monetary figures in the data are
Philippine pesos — write them like "₱2,505.00", not a bare number.

Respond with a JSON object with exactly these keys:
- "answer": string, your response in plain language.
- "chart": either null, or an object shaped like
  {"type": "bar" | "line", "title": string,
   "series": [{"name": string, "data": [{"label": string, "value": number}, ...]}]}
  Only include a chart when the question implies a comparison, trend, or
  breakdown (e.g. "compare branches", "show revenue by hour", "what's my
  biggest cost driver") — for a simple factual question, chart should be null.

DATA FIELD GUIDE — match the question to the right field before answering,
don't guess from the wrong one:
- todays_summary: revenue/COGS/losses/margin for TODAY ONLY.
- top_products_today / best_seller_today: units sold today per product,
  ranked descending. best_seller_today is just top_products_today[0] pulled
  out for convenience — use it for "what's my best seller" / "what's
  trending" style questions. This is today's sales only, not all-time.
- loss_analysis.accumulated_loss_total: total cost of EVERY loss ever logged
  for this scope (all-time, not just today) — use this for "accumulated
  loss" / "total loss" / "how much have we lost overall" questions.
- loss_analysis.top_loss_item: the single ingredient/item responsible for
  the most cumulative loss cost across all logged losses — use this to
  answer "what item generates the most loss", "biggest source of waste",
  "what's causing the most defects", etc. It already IS the answer to that
  question; don't try to recompute it from recent_losses (which is
  incomplete, just the 10 most recent rows).
- loss_analysis.by_reason: total loss cost grouped by cause (spoilage,
  breakage, comp, prep_error) — use for "why are we losing money" /
  "what's our biggest loss category" questions.
- recent_losses: the 10 most recent individual loss log entries, for
  "what was just logged" / recency-style questions — not a complete
  picture of all-time totals.
"""


def _branch_ids_for_context(supabase, user: CurrentUser) -> tuple[list[dict], bool, str]:
    """Returns (branches [{id, name}], is_org_wide, organization_id)."""
    if user.role == "executive":
        org_result = supabase.table("organizations").select("id").limit(1).execute()
        if not org_result.data:
            return [], True, ""
        organization_id = org_result.data[0]["id"]
        branches_result = (
            supabase.table("branches")
            .select("id, name")
            .eq("organization_id", organization_id)
            .execute()
        )
        return branches_result.data, True, organization_id

    if not user.branch_id:
        return [], False, ""
    branch_result = (
        supabase.table("branches").select("id, name").eq("id", user.branch_id).maybe_single().execute()
    )
    if not branch_result or not branch_result.data:
        return [], False, ""
    return [branch_result.data], False, ""


def _top_products(supabase, branch_ids: list[str], limit: int = 5) -> list[dict]:
    if not branch_ids:
        return []
    start, end = _today_bounds()

    transactions_result = (
        supabase.table("transactions")
        .select("id")
        .in_("branch_id", branch_ids)
        .gte("opened_at", start)
        .lt("opened_at", end)
        .execute()
    )
    transaction_ids = [t["id"] for t in transactions_result.data]
    if not transaction_ids:
        return []

    items_result = (
        supabase.table("transaction_items")
        .select("product_id, quantity")
        .in_("transaction_id", transaction_ids)
        .execute()
    )
    qty_by_product: dict[str, float] = defaultdict(float)
    for item in items_result.data:
        qty_by_product[item["product_id"]] += float(item["quantity"])
    if not qty_by_product:
        return []

    products_result = (
        supabase.table("products").select("id, name").in_("id", list(qty_by_product.keys())).execute()
    )
    name_by_id = {p["id"]: p["name"] for p in products_result.data}

    ranked = sorted(qty_by_product.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [{"product": name_by_id.get(pid, "Unknown"), "units_sold_today": qty} for pid, qty in ranked]


def _recent_losses(supabase, branch_ids: list[str], limit: int = 10) -> list[dict]:
    if not branch_ids:
        return []
    losses_result = (
        supabase.table("loss_records")
        .select("ingredient_id, reason, quantity, cost_impact, created_at")
        .in_("branch_id", branch_ids)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    rows = losses_result.data
    if not rows:
        return []

    ingredient_ids = {r["ingredient_id"] for r in rows}
    ingredients_result = (
        supabase.table("ingredients").select("id, name").in_("id", list(ingredient_ids)).execute()
    )
    name_by_id = {i["id"]: i["name"] for i in ingredients_result.data}

    return [
        {
            "ingredient": name_by_id.get(r["ingredient_id"], "Unknown"),
            "reason": r["reason"],
            "quantity": r["quantity"],
            "cost_impact": r["cost_impact"],
            "logged_at": r["created_at"],
        }
        for r in rows
    ]


def _loss_analysis(supabase, branch_ids: list[str]) -> dict:
    """All-time loss aggregation — the deterministic 'harness' that answers
    accumulated-loss and biggest-loss-driver questions correctly instead of
    leaving the LLM to guess from a partial recent-losses list.
    """
    if not branch_ids:
        return {"accumulated_loss_total": 0, "top_loss_item": None, "by_reason": {}}

    losses_result = (
        supabase.table("loss_records")
        .select("ingredient_id, reason, cost_impact")
        .in_("branch_id", branch_ids)
        .execute()
    )
    rows = losses_result.data
    if not rows:
        return {"accumulated_loss_total": 0, "top_loss_item": None, "by_reason": {}}

    total = sum(float(r["cost_impact"]) for r in rows)

    cost_by_ingredient: dict[str, float] = defaultdict(float)
    cost_by_reason: dict[str, float] = defaultdict(float)
    for r in rows:
        cost_by_ingredient[r["ingredient_id"]] += float(r["cost_impact"])
        cost_by_reason[r["reason"]] += float(r["cost_impact"])

    top_ingredient_id, top_cost = max(cost_by_ingredient.items(), key=lambda kv: kv[1])
    ingredient_result = (
        supabase.table("ingredients").select("name").eq("id", top_ingredient_id).maybe_single().execute()
    )
    top_name = ingredient_result.data["name"] if ingredient_result and ingredient_result.data else "Unknown"

    return {
        "accumulated_loss_total": round(total, 2),
        "top_loss_item": {"ingredient": top_name, "total_cost": round(top_cost, 2)},
        "by_reason": {reason: round(cost, 2) for reason, cost in cost_by_reason.items()},
    }


@router.post("/malaya/query", response_model=MalayaQueryResponse)
def query_malaya(body: MalayaQueryRequest, user: CurrentUser = Depends(get_current_user)):
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Malaya isn't configured (missing GROQ_API_KEY)")

    supabase = get_supabase()
    branches, is_org_wide, organization_id = _branch_ids_for_context(supabase, user)
    if not branches:
        raise HTTPException(status_code=404, detail="No branch data available for this account")

    branch_ids = [b["id"] for b in branches]

    if is_org_wide:
        summary = _compute_organization_summary(supabase, organization_id, branches)
        summary_context = summary.model_dump()
    else:
        summary = _compute_branch_summary(supabase, branches[0]["id"], branches[0]["name"])
        summary_context = summary.model_dump()

    top_products = _top_products(supabase, branch_ids)

    context = {
        "scope": "organization (all branches)" if is_org_wide else f"branch: {branches[0]['name']}",
        "todays_summary": summary_context,
        "top_products_today": top_products,
        "best_seller_today": top_products[0] if top_products else None,
        "loss_analysis": _loss_analysis(supabase, branch_ids),
        "recent_losses": _recent_losses(supabase, branch_ids),
    }

    client = Groq(api_key=api_key)
    try:
        completion = client.chat.completions.create(
            model=GROQ_MODEL,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"DATA:\n{json.dumps(context, default=str)}\n\nQUESTION: {body.question}",
                },
            ],
        )
        raw = completion.choices[0].message.content
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Malaya is unavailable right now: {exc}")

    try:
        parsed = json.loads(raw)
        result = MalayaQueryResponse(answer=parsed.get("answer", raw), chart=parsed.get("chart"))
    except Exception:
        result = MalayaQueryResponse(answer=raw, chart=None)

    try:
        supabase.table("malaya_query_log").insert(
            {"user_id": user.id, "question": body.question, "answer": result.answer}
        ).execute()
    except Exception:
        # Audit logging is best-effort — don't fail the user-facing answer
        # if malaya_query_log hasn't been created yet (see migration 0006).
        pass

    return result
