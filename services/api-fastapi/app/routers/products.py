from fastapi import APIRouter, Depends, Query

from app.auth import CurrentUser, get_current_user, require_branch_access
from app.deps import get_supabase
from app.schemas import Product

router = APIRouter(tags=["products"])


@router.get("/products", response_model=list[Product])
def list_products(
    branch_id: str = Query(...),
    active_only: bool = True,
    user: CurrentUser = Depends(get_current_user),
):
    require_branch_access(user, branch_id)
    supabase = get_supabase()
    query = supabase.table("products").select("*").eq("branch_id", branch_id)
    if active_only:
        query = query.eq("active", True)
    result = query.execute()
    return result.data
