from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import CurrentUser, get_current_user, require_branch_access
from app.deps import get_supabase
from app.schemas import (
    InventoryMovementCreate,
    InventoryMovementResponse,
    MovementType,
)

router = APIRouter(tags=["inventory-movements"])


@router.post("/inventory-movements", response_model=InventoryMovementResponse)
def create_inventory_movement(
    body: InventoryMovementCreate, user: CurrentUser = Depends(get_current_user)
):
    """Create an inventory movement (trans_in, trans_out, delivery, transfer_in, transfer_out).
    Adjusts ingredient current_stock accordingly.
    """
    require_branch_access(user, body.branch_id)
    if body.employee_id != user.id:
        raise HTTPException(status_code=403, detail="Cannot log movement under another employee's id")

    supabase = get_supabase()

    # Get ingredient
    ingredient_result = (
        supabase.table("ingredients")
        .select("branch_id, unit_cost, current_stock")
        .eq("id", body.ingredient_id)
        .maybe_single()
        .execute()
    )
    if not ingredient_result or not ingredient_result.data:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    if ingredient_result.data["branch_id"] != body.branch_id:
        raise HTTPException(status_code=400, detail="Ingredient does not belong to this branch")

    unit_cost = float(ingredient_result.data["unit_cost"])
    current_stock = float(ingredient_result.data["current_stock"])

    # Determine stock delta based on movement type
    delta = body.quantity
    if body.type in ("trans_out", "transfer_out"):
        delta = -body.quantity
        new_stock = current_stock - body.quantity
    elif body.type in ("trans_in", "delivery", "transfer_in"):
        new_stock = current_stock + body.quantity
    else:
        raise HTTPException(status_code=400, detail=f"Unknown movement type: {body.type}")

    # Update ingredient stock
    supabase.table("ingredients").update({"current_stock": new_stock}).eq(
        "id", body.ingredient_id
    ).execute()

    # Insert movement record
    insert_result = (
        supabase.table("inventory_movements")
        .insert(
            {
                "branch_id": body.branch_id,
                "ingredient_id": body.ingredient_id,
                "type": body.type,
                "quantity": body.quantity,
                "reason": body.reason,
                "reference_id": body.reference_id,
                "employee_id": body.employee_id,
                "unit_cost_snapshot": unit_cost,
            }
        )
        .execute()
    )
    return insert_result.data[0]


@router.get("/inventory-movements", response_model=list[InventoryMovementResponse])
def list_inventory_movements(
    branch_id: str = Query(...),
    ingredient_id: str | None = Query(None),
    type: MovementType | None = Query(None),
    limit: int = Query(100, le=500),
    user: CurrentUser = Depends(get_current_user),
):
    require_branch_access(user, branch_id)
    supabase = get_supabase()
    query = supabase.table("inventory_movements").select("*").eq("branch_id", branch_id)
    if ingredient_id:
        query = query.eq("ingredient_id", ingredient_id)
    if type:
        query = query.eq("type", type)
    result = query.order("created_at", desc=True).limit(limit).execute()
    return result.data


@router.get("/branches/{branch_id}/inventory-movements", response_model=list[InventoryMovementResponse])
def list_branch_inventory_movements(
    branch_id: str,
    limit: int = Query(50, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    require_branch_access(user, branch_id)
    supabase = get_supabase()
    result = (
        supabase.table("inventory_movements")
        .select("*")
        .eq("branch_id", branch_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data