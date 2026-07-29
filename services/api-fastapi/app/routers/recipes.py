from fastapi import APIRouter, Depends, HTTPException

from app.auth import CurrentUser, get_current_user, require_branch_access
from app.deps import get_supabase

router = APIRouter(tags=["recipes"])


@router.get("/products/{product_id}/recipe")
def get_recipe(product_id: str, user: CurrentUser = Depends(get_current_user)):
    supabase = get_supabase()

    product_result = (
        supabase.table("products").select("branch_id").eq("id", product_id).single().execute()
    )
    if not product_result.data:
        raise HTTPException(status_code=404, detail="Product not found")
    require_branch_access(user, product_result.data["branch_id"])

    result = (
        supabase.table("recipe_items")
        .select("*, ingredients(id, name, unit)")
        .eq("product_id", product_id)
        .execute()
    )
    return result.data
