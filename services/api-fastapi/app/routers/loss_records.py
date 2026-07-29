from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import CurrentUser, get_current_user, require_branch_access
from app.deps import get_supabase
from app.schemas import CreateLossRecordRequest, LossRecordResponse

router = APIRouter(tags=["loss-records"])


@router.post("/loss-records", response_model=LossRecordResponse)
def create_loss_record(
    body: CreateLossRecordRequest, user: CurrentUser = Depends(get_current_user)
):
    """Logs a loss/defect event and deducts the lost quantity from inventory.

    Logged separately from sale-driven consumption (docs/backend-execution-plan.md
    §2) so losses show up distinctly in the loss-to-profit margin calculation
    instead of silently looking like a sale.
    """
    require_branch_access(user, body.branch_id)
    if body.employee_id != user.id:
        raise HTTPException(status_code=403, detail="Cannot log a loss under another employee's id")

    supabase = get_supabase()

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

    if body.product_id:
        product_result = (
            supabase.table("products")
            .select("branch_id")
            .eq("id", body.product_id)
            .maybe_single()
            .execute()
        )
        if (
            not product_result
            or not product_result.data
            or product_result.data["branch_id"] != body.branch_id
        ):
            raise HTTPException(status_code=400, detail="Product does not belong to this branch")

    unit_cost = float(ingredient_result.data["unit_cost"])
    cost_impact = round(unit_cost * body.quantity, 2)

    new_stock = float(ingredient_result.data["current_stock"]) - body.quantity
    supabase.table("ingredients").update({"current_stock": new_stock}).eq(
        "id", body.ingredient_id
    ).execute()

    insert_result = (
        supabase.table("loss_records")
        .insert(
            {
                "branch_id": body.branch_id,
                "ingredient_id": body.ingredient_id,
                "product_id": body.product_id,
                "employee_id": body.employee_id,
                "reason": body.reason,
                "quantity": body.quantity,
                "cost_impact": cost_impact,
                "photo_url": body.photo_url,
            }
        )
        .execute()
    )
    return insert_result.data[0]


@router.get("/branches/{branch_id}/losses", response_model=list[LossRecordResponse])
def list_losses(
    branch_id: str,
    limit: int = Query(50, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    require_branch_access(user, branch_id)
    supabase = get_supabase()
    result = (
        supabase.table("loss_records")
        .select("*")
        .eq("branch_id", branch_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data
