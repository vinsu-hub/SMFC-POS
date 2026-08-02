from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.auth import CurrentUser, get_current_user, require_branch_access
from app.deps import get_supabase
from app.schemas import BranchSummary, HourlyRevenuePoint, OrganizationSummary

router = APIRouter(tags=["summary"])


def _today_bounds() -> tuple[str, str]:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start.isoformat(), end.isoformat()


def _compute_branch_summary(supabase, branch_id: str, branch_name: str) -> BranchSummary:
    """Live-aggregates today's revenue/COGS/losses for one branch.

    Computed on the fly from transactions/transaction_items/recipe_items/
    ingredients/loss_records rather than a daily_summaries table — cheap
    enough at this data volume, and it means the Executive Overview
    reflects a sale or a logged loss the moment it happens instead of
    waiting on a nightly job that doesn't exist yet.
    """
    start, end = _today_bounds()

    transactions_result = (
        supabase.table("transactions")
        .select("id, total_amount, opened_at, is_owner_request")
        .eq("branch_id", branch_id)
        .neq("status", "voided")
        .gte("opened_at", start)
        .lt("opened_at", end)
        .execute()
    )
    # Voided orders are excluded at the query level; owner's-request orders
    # (comped, not paid sales) are excluded here so revenue only reflects
    # actual customer transactions.
    transactions = [t for t in transactions_result.data if not t.get("is_owner_request")]

    revenue = sum(float(t["total_amount"]) for t in transactions)

    hourly_totals: dict[int, float] = defaultdict(float)
    for t in transactions:
        hour = datetime.fromisoformat(t["opened_at"]).astimezone(timezone.utc).hour
        hourly_totals[hour] += float(t["total_amount"])
    hourly_revenue = [
        HourlyRevenuePoint(hour=hour, revenue=round(hourly_totals.get(hour, 0.0), 2))
        for hour in range(24)
    ]

    transaction_ids = [t["id"] for t in transactions]
    product_qty: dict[str, float] = defaultdict(float)
    if transaction_ids:
        items_result = (
            supabase.table("transaction_items")
            .select("product_id, quantity")
            .in_("transaction_id", transaction_ids)
            .execute()
        )
        for item in items_result.data:
            product_qty[item["product_id"]] += float(item["quantity"])

    cogs = 0.0
    if product_qty:
        recipe_result = (
            supabase.table("recipe_items")
            .select("product_id, ingredient_id, quantity")
            .in_("product_id", list(product_qty.keys()))
            .execute()
        )
        ingredient_ids = {r["ingredient_id"] for r in recipe_result.data}
        cost_by_ingredient: dict[str, float] = {}
        if ingredient_ids:
            ingredients_result = (
                supabase.table("ingredients")
                .select("id, unit_cost")
                .in_("id", list(ingredient_ids))
                .execute()
            )
            cost_by_ingredient = {i["id"]: float(i["unit_cost"]) for i in ingredients_result.data}
        for recipe_item in recipe_result.data:
            qty_sold = product_qty[recipe_item["product_id"]]
            unit_cost = cost_by_ingredient.get(recipe_item["ingredient_id"], 0.0)
            cogs += qty_sold * float(recipe_item["quantity"]) * unit_cost

    losses_result = (
        supabase.table("loss_records")
        .select("cost_impact")
        .eq("branch_id", branch_id)
        .gte("created_at", start)
        .lt("created_at", end)
        .execute()
    )
    losses = sum(float(l["cost_impact"]) for l in losses_result.data)

    margin = revenue - cogs - losses
    margin_percent = (margin / revenue * 100) if revenue > 0 else 0.0

    return BranchSummary(
        branch_id=branch_id,
        branch_name=branch_name,
        revenue=round(revenue, 2),
        cogs=round(cogs, 2),
        losses=round(losses, 2),
        margin=round(margin, 2),
        margin_percent=round(margin_percent, 1),
        hourly_revenue=hourly_revenue,
    )


@router.get("/branches/{branch_id}/summary", response_model=BranchSummary)
def get_branch_summary(branch_id: str, user: CurrentUser = Depends(get_current_user)):
    require_branch_access(user, branch_id)
    supabase = get_supabase()

    branch_result = (
        supabase.table("branches").select("name").eq("id", branch_id).maybe_single().execute()
    )
    if not branch_result or not branch_result.data:
        raise HTTPException(status_code=404, detail="Branch not found")

    return _compute_branch_summary(supabase, branch_id, branch_result.data["name"])


def _compute_organization_summary(supabase, organization_id: str, branches: list[dict]) -> OrganizationSummary:
    branch_summaries = [_compute_branch_summary(supabase, b["id"], b["name"]) for b in branches]

    total_revenue = round(sum(b.revenue for b in branch_summaries), 2)
    total_cogs = round(sum(b.cogs for b in branch_summaries), 2)
    total_losses = round(sum(b.losses for b in branch_summaries), 2)
    total_margin = round(total_revenue - total_cogs - total_losses, 2)
    total_margin_percent = round((total_margin / total_revenue * 100) if total_revenue > 0 else 0.0, 1)

    combined_hourly: dict[int, float] = defaultdict(float)
    for b in branch_summaries:
        for point in b.hourly_revenue:
            combined_hourly[point.hour] += point.revenue
    hourly_revenue = [
        HourlyRevenuePoint(hour=hour, revenue=round(combined_hourly.get(hour, 0.0), 2))
        for hour in range(24)
    ]

    return OrganizationSummary(
        organization_id=organization_id,
        branches=branch_summaries,
        total_revenue=total_revenue,
        total_cogs=total_cogs,
        total_losses=total_losses,
        total_margin=total_margin,
        total_margin_percent=total_margin_percent,
        hourly_revenue=hourly_revenue,
    )


@router.get("/organizations/summary", response_model=OrganizationSummary)
def get_my_organization_summary(user: CurrentUser = Depends(get_current_user)):
    """Convenience route for the Executive Overview: resolves the caller's
    own organization instead of requiring the frontend to already know an
    organization_id, which nothing in `profiles` currently exposes.
    `organizations` is a single row today (see docs/backend-execution-plan.md
    §2 — "future-proofs multi-corp"), so this just takes that row.
    """
    if user.role != "executive":
        raise HTTPException(status_code=403, detail="Only executives can view org-wide summaries")

    supabase = get_supabase()
    org_result = supabase.table("organizations").select("id").limit(1).execute()
    if not org_result.data:
        raise HTTPException(status_code=404, detail="No organization configured")
    organization_id = org_result.data[0]["id"]

    branches_result = (
        supabase.table("branches").select("id, name").eq("organization_id", organization_id).execute()
    )
    return _compute_organization_summary(supabase, organization_id, branches_result.data)


@router.get("/organizations/{organization_id}/summary", response_model=OrganizationSummary)
def get_organization_summary(organization_id: str, user: CurrentUser = Depends(get_current_user)):
    if user.role != "executive":
        raise HTTPException(status_code=403, detail="Only executives can view org-wide summaries")

    supabase = get_supabase()
    branches_result = (
        supabase.table("branches")
        .select("id, name")
        .eq("organization_id", organization_id)
        .execute()
    )
    if not branches_result.data:
        raise HTTPException(status_code=404, detail="Organization not found or has no branches")

    return _compute_organization_summary(supabase, organization_id, branches_result.data)
