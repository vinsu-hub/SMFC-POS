from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import date

from app.auth import CurrentUser, get_current_user, require_branch_access
from app.deps import get_supabase
from app.schemas import (
    UtilityLogCreate,
    UtilityLogResponse,
    UtilitySummary,
    UtilityType,
)

router = APIRouter(tags=["utility"])


def _compute_totals(logs_list: list[dict]) -> tuple[float, float]:
    total_consumption = 0.0
    total_cost = 0.0
    for l in logs_list:
        if l["reading_end"] is not None:
            consumption = float(l["reading_end"]) - float(l["reading_start"])
            total_consumption += consumption
            total_cost += consumption * float(l["unit_cost"])
    return total_consumption, total_cost


def _build_summary(
    branch_id: str,
    branch_name: str,
    logs: list[dict],
    from_date: date | None,
    to_date: date | None,
) -> dict:
    electricity_logs = [l for l in logs if l["utility_type"] == "electricity"]
    water_logs = [l for l in logs if l["utility_type"] == "water"]

    elec_consumption, elec_cost = _compute_totals(electricity_logs)
    water_consumption, water_cost = _compute_totals(water_logs)

    return {
        "branch_id": branch_id,
        "branch_name": branch_name,
        "period_start": from_date.isoformat() if from_date else None,
        "period_end": to_date.isoformat() if to_date else None,
        "electricity": {
            "consumption": elec_consumption,
            "cost": round(elec_cost, 2),
            "readings_count": len([l for l in electricity_logs if l["reading_end"] is not None]),
        },
        "water": {
            "consumption": water_consumption,
            "cost": round(water_cost, 2),
            "readings_count": len([l for l in water_logs if l["reading_end"] is not None]),
        },
        "total_cost": round(elec_cost + water_cost, 2),
    }


@router.post("/utility-logs", response_model=UtilityLogResponse)
def create_utility_log(
    body: UtilityLogCreate, user: CurrentUser = Depends(get_current_user)
):
    """Record a utility meter reading (start or end of business day)."""
    require_branch_access(user, body.branch_id)
    if body.recorded_by != user.id and user.role != "executive":
        raise HTTPException(status_code=403, detail="Cannot log for another employee")

    supabase = get_supabase()

    # Upsert: insert or update the record for this branch/utility/date
    result = (
        supabase.table("utility_logs")
        .upsert(
            {
                "branch_id": body.branch_id,
                "utility_type": body.utility_type,
                "business_date": body.business_date.isoformat(),
                "reading_start": body.reading_start,
                "reading_end": body.reading_end,
                "unit_cost": body.unit_cost,
                "recorded_by": body.recorded_by,
            },
            on_conflict="branch_id,utility_type,business_date",
        )
        .execute()
    )
    return result.data[0]


@router.get("/utility-logs", response_model=list[UtilityLogResponse])
def list_utility_logs(
    branch_id: str = Query(...),
    utility_type: UtilityType | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    user: CurrentUser = Depends(get_current_user),
):
    require_branch_access(user, branch_id)
    supabase = get_supabase()
    query = supabase.table("utility_logs").select("*").eq("branch_id", branch_id)
    if utility_type:
        query = query.eq("utility_type", utility_type)
    if from_date:
        query = query.gte("business_date", from_date.isoformat())
    if to_date:
        query = query.lte("business_date", to_date.isoformat())
    result = query.order("business_date", desc=True).execute()
    return result.data


@router.get("/branches/{branch_id}/utility-summary", response_model=UtilitySummary)
def get_utility_summary(
    branch_id: str,
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    user: CurrentUser = Depends(get_current_user),
):
    require_branch_access(user, branch_id)
    supabase = get_supabase()

    branch_result = (
        supabase.table("branches").select("name").eq("id", branch_id).maybe_single().execute()
    )
    if not branch_result or not branch_result.data:
        raise HTTPException(status_code=404, detail="Branch not found")
    branch_name = branch_result.data["name"]

    query = supabase.table("utility_logs").select("*").eq("branch_id", branch_id)
    if from_date:
        query = query.gte("business_date", from_date.isoformat())
    if to_date:
        query = query.lte("business_date", to_date.isoformat())

    logs = query.execute().data
    return _build_summary(branch_id, branch_name, logs, from_date, to_date)


@router.get("/organizations/utility-summary", response_model=list[UtilitySummary])
def get_org_utility_summary(
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    user: CurrentUser = Depends(get_current_user),
):
    """Executive view: utility summary across all branches."""
    if user.role != "executive":
        raise HTTPException(status_code=403, detail="Executive access required")

    supabase = get_supabase()
    branches_result = supabase.table("branches").select("id, name").execute()
    branches = branches_result.data
    branch_ids = [b["id"] for b in branches]
    if not branch_ids:
        return []

    query = supabase.table("utility_logs").select("*").in_("branch_id", branch_ids)
    if from_date:
        query = query.gte("business_date", from_date.isoformat())
    if to_date:
        query = query.lte("business_date", to_date.isoformat())
    all_logs = query.execute().data

    logs_by_branch: dict[str, list[dict]] = {bid: [] for bid in branch_ids}
    for log in all_logs:
        logs_by_branch[log["branch_id"]].append(log)

    return [
        _build_summary(b["id"], b["name"], logs_by_branch[b["id"]], from_date, to_date)
        for b in branches
    ]