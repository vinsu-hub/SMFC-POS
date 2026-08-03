import json
import os
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from groq import Groq

from app.auth import CurrentUser, get_current_user
from app.deps import get_supabase
from app.routers.hr import _compute_payroll_summary
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
- payroll_analysis: aggregate payroll for the CURRENT semimonthly pay
  period only (see period_start/period_end in this field) — total_payroll_cost,
  total_hours, employee_count, engine_enabled. Use top_overtime_holiday_driver
  for "who's costing the most in OT/holiday pay" questions. This is a summary,
  not a per-employee breakdown — don't invent individual pay figures beyond
  the one named driver.
- sales_trend_30d.daily_revenue: revenue per calendar day for the last 30
  days — use for trend / week-over-week / month-scale comparison questions,
  not todays_summary.
- sales_trend_30d.daily_top_product: best-selling product per day over the
  same 30-day window — distinct from best_seller_today, which is today only.
- inventory_analysis.total_valuation: current total peso value of all
  on-hand stock across the scope.
- inventory_analysis.low_stock_items: ingredients at or below their reorder
  threshold, worst shortage first, capped at 15 rows — use for "what needs
  restocking" questions. low_stock_count is the true total even if the list
  is capped.
- stock_movement_activity.pending_stock_requests: inter-branch stock
  requests that are still pending (not yet fulfilled or declined),
  capped at 15, most recent first — use for "what's pending between
  branches" / "what has X requested" / "what am I waiting on" questions.
  requesting_branch is who asked, source_branch is who'd send it.
- stock_movement_activity.recent_transfers: recent inter-branch stock
  transfers (any status: pending, confirmed, rejected), capped at 15,
  most recent first — use for "what's been sent/received between
  branches" / "did branch X send that stock yet" questions. Check
  `status` before answering — pending means it hasn't been confirmed by
  the receiving branch yet.
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


def _current_semimonthly_period(today: date | None = None) -> tuple[date, date]:
    """PH payroll runs semimonthly (1st-15th, 16th-end of month) — same
    cadence the DOLE holiday-pay engine and HR Payroll page already assume.
    """
    today = today or datetime.now(timezone.utc).date()
    if today.day <= 15:
        return today.replace(day=1), today.replace(day=15)
    start = today.replace(day=16)
    next_month = (today.replace(day=28) + timedelta(days=4)).replace(day=1)
    return start, next_month - timedelta(days=1)


def _payroll_analysis(supabase, branch_ids: list[str]) -> dict:
    """Aggregate-only payroll context for the current pay period — deliberately
    not a per-employee dump (see top_overtime_holiday_driver) so individual
    compensation figures don't flow into the LLM prompt/logs beyond one named
    driver, same restraint _loss_analysis applies to loss_records.
    """
    period_start, period_end = _current_semimonthly_period()
    if not branch_ids:
        return {
            "period_start": period_start.isoformat(), "period_end": period_end.isoformat(),
            "total_payroll_cost": 0, "total_hours": 0, "employee_count": 0,
            "engine_enabled": False, "top_overtime_holiday_driver": None,
        }

    summaries = [_compute_payroll_summary(supabase, bid, period_start, period_end) for bid in branch_ids]

    total_pay = round(sum(s["total_pay"] for s in summaries), 2)
    total_hours = round(sum(s["total_hours"] for s in summaries), 2)
    employee_count = sum(s["employee_count"] for s in summaries)
    engine_enabled = any(s["engine_enabled"] for s in summaries)

    top_driver = None
    top_extra = -1.0
    for s in summaries:
        for row in s["rows"]:
            extra = float(row.get("overtime_pay") or 0) + float(row.get("holiday_pay") or 0)
            if extra > top_extra:
                top_extra = extra
                top_driver = {"employee_name": row["employee_name"], "extra_pay": round(extra, 2)}
    if top_driver and top_extra <= 0:
        top_driver = None

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "total_payroll_cost": total_pay,
        "total_hours": total_hours,
        "employee_count": employee_count,
        "engine_enabled": engine_enabled,
        "top_overtime_holiday_driver": top_driver,
    }


def _sales_trend(supabase, branch_ids: list[str], days: int = 30) -> dict:
    """Daily revenue + daily top product over a rolling window — one query
    per table across the whole range/branch set (not one query per day),
    same voided/owner-request exclusion _compute_branch_summary uses for
    today's revenue in summary.py.
    """
    if not branch_ids:
        return {"daily_revenue": [], "daily_top_product": []}

    end = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    start = end - timedelta(days=days)

    transactions_result = (
        supabase.table("transactions")
        .select("id, total_amount, opened_at, is_owner_request")
        .in_("branch_id", branch_ids)
        .neq("status", "voided")
        .gte("opened_at", start.isoformat())
        .lt("opened_at", end.isoformat())
        .execute()
    )
    transactions = [t for t in transactions_result.data if not t.get("is_owner_request")]

    revenue_by_day: dict[str, float] = defaultdict(float)
    txn_ids_by_day: dict[str, list[str]] = defaultdict(list)
    for t in transactions:
        day_key = datetime.fromisoformat(t["opened_at"]).astimezone(timezone.utc).date().isoformat()
        revenue_by_day[day_key] += float(t["total_amount"])
        txn_ids_by_day[day_key].append(t["id"])

    all_txn_ids = [t["id"] for t in transactions]
    items_by_txn: dict[str, list[dict]] = defaultdict(list)
    product_names: dict[str, str] = {}
    if all_txn_ids:
        items_result = (
            supabase.table("transaction_items")
            .select("transaction_id, product_id, quantity")
            .in_("transaction_id", all_txn_ids)
            .execute()
        )
        for item in items_result.data:
            items_by_txn[item["transaction_id"]].append(item)
        product_ids = {item["product_id"] for item in items_result.data}
        if product_ids:
            products_result = supabase.table("products").select("id, name").in_("id", list(product_ids)).execute()
            product_names = {p["id"]: p["name"] for p in products_result.data}

    daily_revenue = []
    daily_top_product = []
    day = start.date()
    while day < end.date():
        key = day.isoformat()
        daily_revenue.append({"date": key, "revenue": round(revenue_by_day.get(key, 0.0), 2)})

        qty_by_product: dict[str, float] = defaultdict(float)
        for txn_id in txn_ids_by_day.get(key, []):
            for item in items_by_txn.get(txn_id, []):
                qty_by_product[item["product_id"]] += float(item["quantity"])
        if qty_by_product:
            top_id, top_qty = max(qty_by_product.items(), key=lambda kv: kv[1])
            daily_top_product.append({"date": key, "product": product_names.get(top_id, "Unknown"), "units": top_qty})

        day += timedelta(days=1)

    return {"daily_revenue": daily_revenue, "daily_top_product": daily_top_product}


def _inventory_analysis(supabase, branch_ids: list[str], low_stock_limit: int = 15) -> dict:
    """Total on-hand stock valuation + a bounded, worst-first low-stock list.
    No summary function existed for inventory before this — list_inventory
    in inventory.py is a raw passthrough with no aggregation.
    """
    if not branch_ids:
        return {"total_valuation": 0, "low_stock_count": 0, "low_stock_items": []}

    ingredients_result = (
        supabase.table("ingredients")
        .select("name, unit, unit_cost, current_stock, reorder_threshold")
        .in_("branch_id", branch_ids)
        .execute()
    )
    rows = ingredients_result.data
    total_valuation = sum(float(r["current_stock"]) * float(r["unit_cost"]) for r in rows)

    low_stock = [r for r in rows if float(r["current_stock"]) <= float(r["reorder_threshold"])]
    low_stock.sort(key=lambda r: float(r["current_stock"]) - float(r["reorder_threshold"]))

    return {
        "total_valuation": round(total_valuation, 2),
        "low_stock_count": len(low_stock),
        "low_stock_items": [
            {
                "ingredient": r["name"],
                "unit": r["unit"],
                "current_stock": r["current_stock"],
                "reorder_threshold": r["reorder_threshold"],
            }
            for r in low_stock[:low_stock_limit]
        ],
    }


def _stock_movement_activity(supabase, branch_ids: list[str], known_branch_names: dict[str, str]) -> dict:
    """Pending inter-branch stock requests + recent transfers involving this
    scope (either side) — same either-side-OR pattern list_stock_requests/
    list_transfers already use, generalized from one branch to the full
    branch_ids list so it covers both a manager's single branch and an
    executive's org-wide scope in one query.

    known_branch_names is seeded from the caller's own branches list, which
    for a manager only contains their own branch -- the other side of a
    cross-branch row is very often NOT in that list, so any unresolved ids
    get one extra lookup here rather than leaking raw uuids to the LLM.
    """
    if not branch_ids:
        return {"pending_stock_requests": [], "recent_transfers": []}

    branch_filter = ",".join(branch_ids)

    requests_result = (
        supabase.table("stock_requests")
        .select("requesting_branch_id, source_branch_id, ingredient_id, quantity, requested_by, created_at")
        .or_(f"requesting_branch_id.in.({branch_filter}),source_branch_id.in.({branch_filter})")
        .eq("status", "pending")
        .order("created_at", desc=True)
        .limit(15)
        .execute()
    )
    transfers_result = (
        supabase.table("transfers")
        .select("from_branch_id, to_branch_id, ingredient_id, quantity, status, initiated_at")
        .or_(f"from_branch_id.in.({branch_filter}),to_branch_id.in.({branch_filter})")
        .order("initiated_at", desc=True)
        .limit(15)
        .execute()
    )

    unresolved_branch_ids = set()
    for r in requests_result.data:
        unresolved_branch_ids.add(r["requesting_branch_id"])
        unresolved_branch_ids.add(r["source_branch_id"])
    for t in transfers_result.data:
        unresolved_branch_ids.add(t["from_branch_id"])
        unresolved_branch_ids.add(t["to_branch_id"])
    unresolved_branch_ids -= set(known_branch_names.keys())
    if unresolved_branch_ids:
        extra_branches = supabase.table("branches").select("id, name").in_("id", list(unresolved_branch_ids)).execute()
        for b in extra_branches.data:
            known_branch_names[b["id"]] = b["name"]

    ingredient_ids = {r["ingredient_id"] for r in requests_result.data} | {t["ingredient_id"] for t in transfers_result.data}
    ingredient_names: dict[str, str] = {}
    if ingredient_ids:
        ingredients_result = supabase.table("ingredients").select("id, name").in_("id", list(ingredient_ids)).execute()
        ingredient_names = {i["id"]: i["name"] for i in ingredients_result.data}

    pending_stock_requests = [
        {
            "requesting_branch": known_branch_names.get(r["requesting_branch_id"], "Unknown"),
            "source_branch": known_branch_names.get(r["source_branch_id"], "Unknown"),
            "ingredient": ingredient_names.get(r["ingredient_id"], "Unknown"),
            "quantity": r["quantity"],
            "requested_at": r["created_at"],
        }
        for r in requests_result.data
    ]
    recent_transfers = [
        {
            "from_branch": known_branch_names.get(t["from_branch_id"], "Unknown"),
            "to_branch": known_branch_names.get(t["to_branch_id"], "Unknown"),
            "ingredient": ingredient_names.get(t["ingredient_id"], "Unknown"),
            "quantity": t["quantity"],
            "status": t["status"],
            "initiated_at": t["initiated_at"],
        }
        for t in transfers_result.data
    ]

    return {"pending_stock_requests": pending_stock_requests, "recent_transfers": recent_transfers}


@router.post("/malaya/query", response_model=MalayaQueryResponse)
def query_malaya(body: MalayaQueryRequest, user: CurrentUser = Depends(get_current_user)):
    if user.role == "employee":
        raise HTTPException(status_code=403, detail="Malaya is available to managers and executives only")

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
        "payroll_analysis": _payroll_analysis(supabase, branch_ids),
        "sales_trend_30d": _sales_trend(supabase, branch_ids),
        "inventory_analysis": _inventory_analysis(supabase, branch_ids),
        "stock_movement_activity": _stock_movement_activity(
            supabase, branch_ids, {b["id"]: b["name"] for b in branches}
        ),
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
