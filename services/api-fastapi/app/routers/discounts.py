from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import CurrentUser, get_current_user, require_branch_access
from app.deps import get_supabase
from app.schemas import DiscountType, DiscountTypeCreate, DiscountTypeUpdate

router = APIRouter(tags=["discounts"])


@router.get("/discount-types", response_model=list[DiscountType])
def list_discount_types(
    branch_id: str = Query(...),
    active_only: bool = Query(False),
    user: CurrentUser = Depends(get_current_user),
):
    """Any branch member can read - POS checkout needs these to render the
    discount buttons, not just managers."""
    require_branch_access(user, branch_id)
    supabase = get_supabase()
    query = supabase.table("discount_types").select("*").eq("branch_id", branch_id)
    if active_only:
        query = query.eq("active", True)
    result = query.order("name").execute()
    return result.data


@router.post("/discount-types", response_model=DiscountType)
def create_discount_type(
    body: DiscountTypeCreate, user: CurrentUser = Depends(get_current_user)
):
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")
    require_branch_access(user, body.branch_id)

    supabase = get_supabase()
    result = (
        supabase.table("discount_types")
        .insert(
            {
                "branch_id": body.branch_id,
                "name": body.name,
                "percentage": body.percentage,
                "vat_exempt": body.vat_exempt,
            }
        )
        .execute()
    )
    return result.data[0]


@router.patch("/discount-types/{discount_type_id}", response_model=DiscountType)
def update_discount_type(
    discount_type_id: str,
    body: DiscountTypeUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")

    supabase = get_supabase()
    existing = (
        supabase.table("discount_types")
        .select("branch_id")
        .eq("id", discount_type_id)
        .maybe_single()
        .execute()
    )
    if not existing or not existing.data:
        raise HTTPException(status_code=404, detail="Discount type not found")
    require_branch_access(user, existing.data["branch_id"])

    update_data = body.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = (
        supabase.table("discount_types")
        .update(update_data)
        .eq("id", discount_type_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Discount type not found")
    return result.data[0]
