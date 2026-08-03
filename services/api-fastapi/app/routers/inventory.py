from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import CurrentUser, get_current_user, require_branch_access
from app.deps import get_supabase
from app.schemas import Ingredient, InventoryCountRequest, InventoryCountResponse

router = APIRouter(tags=["inventory"])


@router.get("/inventory", response_model=list[Ingredient])
def list_inventory(branch_id: str = Query(...), user: CurrentUser = Depends(get_current_user)):
    require_branch_access(user, branch_id)
    supabase = get_supabase()
    result = supabase.table("ingredients").select("*").eq("branch_id", branch_id).execute()
    return result.data


@router.post("/inventory/{ingredient_id}/count", response_model=InventoryCountResponse)
def count_inventory(
    ingredient_id: str,
    body: InventoryCountRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Records a physical stock count. Unlike a manual movement, a count sets
    current_stock directly to what was actually counted rather than applying
    a delta -- and, when the counted value differs from what the system
    expected, logs a count_adjustment movement (previous/counted/signed
    variance) so the discrepancy has a real audit trail instead of silently
    vanishing into an overwrite. A zero-variance count logs nothing; there's
    no discrepancy to record.
    """
    supabase = get_supabase()

    existing = (
        supabase.table("ingredients")
        .select("branch_id, current_stock, unit_cost")
        .eq("id", ingredient_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    require_branch_access(user, existing.data["branch_id"])
    if body.employee_id != user.id:
        raise HTTPException(status_code=403, detail="Cannot log a count under another employee's id")

    previous_stock = float(existing.data["current_stock"])
    variance = round(body.counted_stock - previous_stock, 4)

    result = (
        supabase.table("ingredients")
        .update({"current_stock": body.counted_stock})
        .eq("id", ingredient_id)
        .execute()
    )
    updated_ingredient = result.data[0]

    movement = None
    if variance != 0:
        movement_result = (
            supabase.table("inventory_movements")
            .insert(
                {
                    "branch_id": existing.data["branch_id"],
                    "ingredient_id": ingredient_id,
                    "type": "count_adjustment",
                    "quantity": abs(variance),
                    "employee_id": body.employee_id,
                    "unit_cost_snapshot": existing.data["unit_cost"],
                    "previous_stock": previous_stock,
                    "counted_stock": body.counted_stock,
                    "variance": variance,
                }
            )
            .execute()
        )
        movement = movement_result.data[0]

    return {"ingredient": updated_ingredient, "movement": movement, "variance": variance}
