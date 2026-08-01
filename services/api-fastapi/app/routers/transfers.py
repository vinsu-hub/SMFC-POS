from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime

from app.auth import CurrentUser, get_current_user, require_branch_access
from app.deps import get_supabase
from app.schemas import TransferCreate, TransferResponse, TransferUpdate

router = APIRouter(tags=["transfers"])


@router.post("/transfers", response_model=TransferResponse)
def create_transfer(
    body: TransferCreate, user: CurrentUser = Depends(get_current_user)
):
    """Initiate an inter-branch transfer (source branch logs TransOUT).
    Creates a pending transfer record.
    """
    require_branch_access(user, body.from_branch_id)
    if body.initiated_by != user.id:
        raise HTTPException(status_code=403, detail="Cannot initiate transfer under another employee's id")

    supabase = get_supabase()

    # Validate ingredient exists and belongs to from_branch
    ingredient_result = (
        supabase.table("ingredients")
        .select("branch_id, unit_cost, current_stock")
        .eq("id", body.ingredient_id)
        .maybe_single()
        .execute()
    )
    if not ingredient_result or not ingredient_result.data:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    if ingredient_result.data["branch_id"] != body.from_branch_id:
        raise HTTPException(status_code=400, detail="Ingredient does not belong to source branch")

    # Validate to_branch exists and has this ingredient (or will receive it)
    to_ingredient = (
        supabase.table("ingredients")
        .select("id")
        .eq("branch_id", body.to_branch_id)
        .eq("name", ingredient_result.data.get("name", ""))
        .maybe_single()
        .execute()
    )
    # If ingredient doesn't exist in target branch, it will be created on receipt

    current_stock = float(ingredient_result.data["current_stock"])
    if current_stock < body.quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock for transfer")

    # Deduct from source branch immediately (TransOUT)
    new_stock = current_stock - body.quantity
    supabase.table("ingredients").update({"current_stock": new_stock}).eq(
        "id", body.ingredient_id
    ).execute()

    # Create transfer record (pending)
    insert_result = (
        supabase.table("transfers")
        .insert(
            {
                "from_branch_id": body.from_branch_id,
                "to_branch_id": body.to_branch_id,
                "ingredient_id": body.ingredient_id,
                "quantity": body.quantity,
                "status": "pending",
                "initiated_by": body.initiated_by,
                "notes": body.notes,
            }
        )
        .execute()
    )
    transfer = insert_result.data[0]

    # Log inventory movement for source branch (transfer_out)
    supabase.table("inventory_movements").insert(
        {
            "branch_id": body.from_branch_id,
            "ingredient_id": body.ingredient_id,
            "type": "transfer_out",
            "quantity": body.quantity,
            "reason": body.notes or "Inter-branch transfer",
            "reference_id": transfer["id"],
            "employee_id": body.initiated_by,
            "unit_cost_snapshot": float(ingredient_result.data["unit_cost"]),
        }
    ).execute()

    return transfer


@router.get("/transfers", response_model=list[TransferResponse])
def list_transfers(
    branch_id: str = Query(...),
    status: str | None = Query(None),
    limit: int = Query(100, le=500),
    user: CurrentUser = Depends(get_current_user),
):
    """List transfers where branch is either source or destination."""
    supabase = get_supabase()
    # Executive can see all
    if user.role == "executive":
        query = supabase.table("transfers").select("*")
    else:
        require_branch_access(user, branch_id)
        query = supabase.table("transfers").select("*").or_(f"from_branch_id.eq.{branch_id},to_branch_id.eq.{branch_id}")

    if status:
        query = query.eq("status", status)
    result = query.order("initiated_at", desc=True).limit(limit).execute()
    return result.data


@router.get("/transfers/{transfer_id}", response_model=TransferResponse)
def get_transfer(
    transfer_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    supabase = get_supabase()
    result = supabase.table("transfers").select("*").eq("id", transfer_id).maybe_single().execute()
    if not result or not result.data:
        raise HTTPException(status_code=404, detail="Transfer not found")
    transfer = result.data

    # Check access
    if user.role != "executive":
        if transfer["from_branch_id"] != user.branch_id and transfer["to_branch_id"] != user.branch_id:
            raise HTTPException(status_code=403, detail="Access denied")
    return transfer


@router.post("/transfers/{transfer_id}/confirm", response_model=TransferResponse)
def confirm_transfer(
    transfer_id: str,
    body: TransferUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    """Destination branch confirms receipt (TransIN)."""
    supabase = get_supabase()

    transfer_result = (
        supabase.table("transfers")
        .select("*")
        .eq("id", transfer_id)
        .maybe_single()
        .execute()
    )
    if not transfer_result or not transfer_result.data:
        raise HTTPException(status_code=404, detail="Transfer not found")
    transfer = transfer_result.data

    if transfer["to_branch_id"] != user.branch_id and user.role != "executive":
        raise HTTPException(status_code=403, detail="Only destination branch can confirm")

    if transfer["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Transfer already {transfer['status']}")

    # Look up the source ingredient's name/unit to find (or create) its counterpart
    # in the destination branch. `transfers` has no `ingredient_name` column, so this
    # must be resolved via `ingredient_id` — looking it up any other way silently
    # matches nothing and creates a duplicate ingredient row on every transfer.
    src_ingredient = (
        supabase.table("ingredients")
        .select("name, unit, unit_cost, reorder_threshold")
        .eq("id", transfer["ingredient_id"])
        .maybe_single()
        .execute()
    )
    if not src_ingredient or not src_ingredient.data:
        raise HTTPException(status_code=500, detail="Source ingredient not found")

    ingredient_result = (
        supabase.table("ingredients")
        .select("id, current_stock")
        .eq("branch_id", transfer["to_branch_id"])
        .eq("name", src_ingredient.data["name"])
        .maybe_single()
        .execute()
    )

    if ingredient_result and ingredient_result.data:
        # Existing ingredient - update stock
        dest_ingredient_id = ingredient_result.data["id"]
        new_stock = float(ingredient_result.data["current_stock"]) + transfer["quantity"]
        supabase.table("ingredients").update({"current_stock": new_stock}).eq(
            "id", dest_ingredient_id
        ).execute()
    else:
        # Create ingredient in destination branch
        create_result = (
            supabase.table("ingredients")
            .insert(
                {
                    "branch_id": transfer["to_branch_id"],
                    "name": src_ingredient.data["name"],
                    "unit": src_ingredient.data["unit"],
                    "unit_cost": src_ingredient.data["unit_cost"],
                    "current_stock": transfer["quantity"],
                    "reorder_threshold": src_ingredient.data["reorder_threshold"],
                }
            )
            .execute()
        )
        dest_ingredient_id = create_result.data[0]["id"]

    # Log inventory movement for destination branch (transfer_in)
    supabase.table("inventory_movements").insert(
        {
            "branch_id": transfer["to_branch_id"],
            "ingredient_id": dest_ingredient_id,
            "type": "transfer_in",
            "quantity": transfer["quantity"],
            "reason": transfer["notes"] or "Inter-branch transfer received",
            "reference_id": transfer["id"],
            "employee_id": user.id,
            "unit_cost_snapshot": float(transfer.get("unit_cost_snapshot", 0)),
        }
    ).execute()

    # Update transfer status
    update_result = (
        supabase.table("transfers")
        .update(
            {
                "status": "confirmed",
                "confirmed_by": user.id,
                "confirmed_at": datetime.utcnow().isoformat(),
            }
        )
        .eq("id", transfer_id)
        .execute()
    )
    return update_result.data[0]


@router.post("/transfers/{transfer_id}/reject", response_model=TransferResponse)
def reject_transfer(
    transfer_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Destination branch rejects the transfer - stock returns to source."""
    supabase = get_supabase()

    transfer_result = (
        supabase.table("transfers")
        .select("*")
        .eq("id", transfer_id)
        .maybe_single()
        .execute()
    )
    if not transfer_result or not transfer_result.data:
        raise HTTPException(status_code=404, detail="Transfer not found")
    transfer = transfer_result.data

    if transfer["to_branch_id"] != user.branch_id and user.role != "executive":
        raise HTTPException(status_code=403, detail="Only destination branch can reject")

    if transfer["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Transfer already {transfer['status']}")

    # Return stock to source branch
    src_ingredient = (
        supabase.table("ingredients")
        .select("id, current_stock")
        .eq("id", transfer["ingredient_id"])
        .maybe_single()
        .execute()
    )
    if src_ingredient and src_ingredient.data:
        new_stock = float(src_ingredient.data["current_stock"]) + transfer["quantity"]
        supabase.table("ingredients").update({"current_stock": new_stock}).eq(
            "id", transfer["ingredient_id"]
        ).execute()

    # Log inventory movement for source branch (reversal of transfer_out)
    supabase.table("inventory_movements").insert(
        {
            "branch_id": transfer["from_branch_id"],
            "ingredient_id": transfer["ingredient_id"],
            "type": "trans_in",  # Reversal
            "quantity": transfer["quantity"],
            "reason": f"Transfer rejected by destination: {transfer.get('notes', '')}",
            "reference_id": transfer["id"],
            "employee_id": user.id,
            "unit_cost_snapshot": float(transfer.get("unit_cost_snapshot", 0)),
        }
    ).execute()

    # Update transfer status
    update_result = (
        supabase.table("transfers")
        .update(
            {
                "status": "rejected",
                "confirmed_by": user.id,
                "confirmed_at": datetime.utcnow().isoformat(),
            }
        )
        .eq("id", transfer_id)
        .execute()
    )
    return update_result.data[0]