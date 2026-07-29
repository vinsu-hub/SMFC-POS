from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import CurrentUser, get_current_user, require_branch_access
from app.deps import get_supabase
from app.schemas import Ingredient, InventoryCountRequest

router = APIRouter(tags=["inventory"])


@router.get("/inventory", response_model=list[Ingredient])
def list_inventory(branch_id: str = Query(...), user: CurrentUser = Depends(get_current_user)):
    require_branch_access(user, branch_id)
    supabase = get_supabase()
    result = supabase.table("ingredients").select("*").eq("branch_id", branch_id).execute()
    return result.data


@router.post("/inventory/{ingredient_id}/count", response_model=Ingredient)
def count_inventory(
    ingredient_id: str,
    body: InventoryCountRequest,
    user: CurrentUser = Depends(get_current_user),
):
    supabase = get_supabase()

    existing = (
        supabase.table("ingredients")
        .select("branch_id")
        .eq("id", ingredient_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    require_branch_access(user, existing.data["branch_id"])

    result = (
        supabase.table("ingredients")
        .update({"current_stock": body.counted_stock})
        .eq("id", ingredient_id)
        .execute()
    )
    return result.data[0]
