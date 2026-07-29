from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.auth import CurrentUser, get_current_user, require_branch_access
from app.deps import get_supabase
from app.schemas import CreateTransactionRequest, TransactionResponse

router = APIRouter(tags=["transactions"])


@router.post("/transactions", response_model=TransactionResponse)
def create_transaction(body: CreateTransactionRequest, user: CurrentUser = Depends(get_current_user)):
    """Create a sale and deduct recipe ingredients from inventory.

    For each item sold: look up its recipe_items (bill of materials) and
    decrement ingredients.current_stock by recipe quantity * items sold.
    """
    require_branch_access(user, body.branch_id)
    if body.employee_id != user.id:
        raise HTTPException(status_code=403, detail="Cannot record a sale under another employee's id")

    supabase = get_supabase()

    if not body.items:
        raise HTTPException(status_code=400, detail="Transaction must have at least one item")

    product_ids = [item.product_id for item in body.items]
    products_result = (
        supabase.table("products")
        .select("*")
        .eq("branch_id", body.branch_id)
        .in_("id", product_ids)
        .execute()
    )
    products_by_id = {p["id"]: p for p in products_result.data}

    missing = [pid for pid in product_ids if pid not in products_by_id]
    if missing:
        raise HTTPException(status_code=404, detail=f"Products not found on this branch: {missing}")

    transaction_insert = (
        supabase.table("transactions")
        .insert(
            {
                "branch_id": body.branch_id,
                "employee_id": body.employee_id,
                "status": "open",
                "opened_at": datetime.now(timezone.utc).isoformat(),
                "total_amount": 0,
            }
        )
        .execute()
    )
    transaction = transaction_insert.data[0]
    transaction_id = transaction["id"]

    total_amount = 0.0
    item_rows = []
    for item in body.items:
        product = products_by_id[item.product_id]
        unit_price = float(product["price"])
        total_amount += unit_price * item.quantity
        item_rows.append(
            {
                "transaction_id": transaction_id,
                "product_id": item.product_id,
                "quantity": item.quantity,
                "unit_price": unit_price,
            }
        )

    items_insert = supabase.table("transaction_items").insert(item_rows).execute()

    _deduct_ingredients(supabase, body.items)

    updated = (
        supabase.table("transactions")
        .update({"total_amount": total_amount})
        .eq("id", transaction_id)
        .execute()
    )
    transaction = updated.data[0]

    return TransactionResponse(**transaction, items=items_insert.data)


def _deduct_ingredients(supabase, items):
    for item in items:
        recipe_result = (
            supabase.table("recipe_items")
            .select("ingredient_id, quantity")
            .eq("product_id", item.product_id)
            .execute()
        )
        for recipe_item in recipe_result.data:
            ingredient_id = recipe_item["ingredient_id"]
            deduct_qty = float(recipe_item["quantity"]) * item.quantity

            ingredient_result = (
                supabase.table("ingredients")
                .select("current_stock")
                .eq("id", ingredient_id)
                .single()
                .execute()
            )
            current_stock = float(ingredient_result.data["current_stock"])
            new_stock = current_stock - deduct_qty

            supabase.table("ingredients").update({"current_stock": new_stock}).eq(
                "id", ingredient_id
            ).execute()


@router.post("/transactions/{transaction_id}/close", response_model=TransactionResponse)
def close_transaction(transaction_id: str, user: CurrentUser = Depends(get_current_user)):
    supabase = get_supabase()

    existing = (
        supabase.table("transactions")
        .select("branch_id")
        .eq("id", transaction_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Transaction not found")
    require_branch_access(user, existing.data["branch_id"])

    updated = (
        supabase.table("transactions")
        .update({"status": "closed", "closed_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", transaction_id)
        .execute()
    )
    if not updated.data:
        raise HTTPException(status_code=404, detail="Transaction not found")
    transaction = updated.data[0]

    items_result = (
        supabase.table("transaction_items")
        .select("*")
        .eq("transaction_id", transaction_id)
        .execute()
    )
    return TransactionResponse(**transaction, items=items_result.data)
