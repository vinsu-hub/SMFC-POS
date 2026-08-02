from fastapi import APIRouter, Depends

from app.auth import CurrentUser, get_current_user
from app.deps import get_supabase
from app.schemas import BranchResponse

router = APIRouter(tags=["branches"])


@router.get("/branches", response_model=list[BranchResponse])
def list_branches(user: CurrentUser = Depends(get_current_user)):
    """All branches in the org — used for transfer destination/source pickers
    and resolving branch names in transfer/request tables. The frontend must
    not index BRANCH_CONFIG (keyed by theme_key) by branch UUID.
    """
    supabase = get_supabase()
    result = supabase.table("branches").select("id, name, theme_key").order("name").execute()
    return result.data
