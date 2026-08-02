from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import CurrentUser, get_current_user, require_branch_access
from app.deps import get_supabase
from app.routers.transfers import _do_transfer
from app.schemas import StockRequestCreate, StockRequestResponse

router = APIRouter(tags=["stock-requests"])

_SELECT = "*, ingredient:ingredients(name), requester:profiles!requested_by(full_name)"


def _flatten(row: dict) -> dict:
    row = dict(row)
    ingredient = row.pop("ingredient", None)
    requester = row.pop("requester", None)
    row["ingredient_name"] = ingredient["name"] if ingredient else None
    row["requested_by_name"] = requester["full_name"] if requester else None
    return row


@router.post("/stock-requests", response_model=StockRequestResponse)
def create_stock_request(
    body: StockRequestCreate, user: CurrentUser = Depends(get_current_user)
):
    """Ask another branch for stock. Does NOT move inventory — only the
    source branch's fulfill action (below) deducts stock, via the same
    _do_transfer logic real transfers use.
    """
    require_branch_access(user, body.requesting_branch_id)
    if body.requested_by != user.id:
        raise HTTPException(status_code=403, detail="Cannot request stock under another employee's id")

    supabase = get_supabase()
    insert_result = (
        supabase.table("stock_requests")
        .insert(
            {
                "requesting_branch_id": body.requesting_branch_id,
                "source_branch_id": body.source_branch_id,
                "ingredient_id": body.ingredient_id,
                "quantity": body.quantity,
                "status": "pending",
                "requested_by": body.requested_by,
                "notes": body.notes,
            }
        )
        .execute()
    )
    return _flatten(insert_result.data[0])


@router.get("/stock-requests", response_model=list[StockRequestResponse])
def list_stock_requests(
    branch_id: str = Query(...),
    status: str | None = Query(None),
    user: CurrentUser = Depends(get_current_user),
):
    """List requests where branch is either the requester or the source."""
    supabase = get_supabase()
    if user.role != "executive":
        require_branch_access(user, branch_id)
    query = (
        supabase.table("stock_requests")
        .select(_SELECT)
        .or_(f"requesting_branch_id.eq.{branch_id},source_branch_id.eq.{branch_id}")
    )
    if status:
        query = query.eq("status", status)
    result = query.order("created_at", desc=True).execute()
    return [_flatten(row) for row in result.data]


def _get_request_or_404(supabase, request_id: str) -> dict:
    result = (
        supabase.table("stock_requests").select("*").eq("id", request_id).maybe_single().execute()
    )
    if not result or not result.data:
        raise HTTPException(status_code=404, detail="Stock request not found")
    return result.data


@router.post("/stock-requests/{request_id}/fulfill", response_model=StockRequestResponse)
def fulfill_stock_request(
    request_id: str, user: CurrentUser = Depends(get_current_user)
):
    """Source branch approves the request and converts it into a real
    transfer (stock deducted now, via _do_transfer)."""
    supabase = get_supabase()
    stock_request = _get_request_or_404(supabase, request_id)

    if stock_request["source_branch_id"] != user.branch_id and user.role != "executive":
        raise HTTPException(status_code=403, detail="Only the source branch can fulfill this request")
    if stock_request["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request already {stock_request['status']}")

    transfer = _do_transfer(
        from_branch_id=stock_request["source_branch_id"],
        to_branch_id=stock_request["requesting_branch_id"],
        ingredient_id=stock_request["ingredient_id"],
        quantity=stock_request["quantity"],
        initiated_by=user.id,
        notes=stock_request.get("notes"),
    )

    update_result = (
        supabase.table("stock_requests")
        .update({"status": "fulfilled", "transfer_id": transfer["id"]})
        .eq("id", request_id)
        .execute()
    )
    return _flatten(update_result.data[0])


@router.post("/stock-requests/{request_id}/decline", response_model=StockRequestResponse)
def decline_stock_request(
    request_id: str, user: CurrentUser = Depends(get_current_user)
):
    supabase = get_supabase()
    stock_request = _get_request_or_404(supabase, request_id)

    if stock_request["source_branch_id"] != user.branch_id and user.role != "executive":
        raise HTTPException(status_code=403, detail="Only the source branch can decline this request")
    if stock_request["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request already {stock_request['status']}")

    update_result = (
        supabase.table("stock_requests")
        .update({"status": "declined"})
        .eq("id", request_id)
        .execute()
    )
    return _flatten(update_result.data[0])
