from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import CurrentUser, get_current_user, require_branch_access, verify_employee_pin
from app.deps import get_supabase
from app.schemas import (
    CreateTransactionRequest,
    KitchenStatusUpdateRequest,
    KitchenSummaryResponse,
    TransactionResponse,
    UpdateTransactionItemRequest,
    VoidTransactionRequest,
)

router = APIRouter(tags=["transactions"])

VAT_RATE = 0.12

KITCHEN_STATUS_ORDER = ["queued", "preparing", "ready", "completed"]
# Elapsed time (seconds) in the current state before it counts as "delayed"
# on Kitchen Display / Order Queue. Hardcoded for v1 -- a per-branch
# settings surface for these is a reasonable future addition, not required
# now.
DELAYED_THRESHOLD_SECONDS = {"queued": 15 * 60, "preparing": 15 * 60, "ready": 10 * 60}


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

    # Discount: validated server-side from discount_type_id, never trusts a
    # client-sent amount/percentage.
    discount_amount = 0.0
    vat_exempt = False
    if body.discount_type_id:
        discount_result = (
            supabase.table("discount_types")
            .select("branch_id, percentage, vat_exempt, active")
            .eq("id", body.discount_type_id)
            .maybe_single()
            .execute()
        )
        if not discount_result or not discount_result.data:
            raise HTTPException(status_code=404, detail="Discount type not found")
        discount = discount_result.data
        if discount["branch_id"] != body.branch_id:
            raise HTTPException(status_code=400, detail="Discount does not belong to this branch")
        if not discount["active"]:
            raise HTTPException(status_code=400, detail="Discount type is not active")
        vat_exempt = discount["vat_exempt"]

    # Owner's Request: the acting employee must re-verify their own kiosk
    # credentials (not just type a name) so this is a provable trace, not a
    # self-reported one.
    owner_request_by = None
    if body.is_owner_request:
        if not body.owner_request_employee_number or not body.owner_request_pin:
            raise HTTPException(status_code=400, detail="Owner's Request requires employee number and PIN")
        profile = verify_employee_pin(body.owner_request_employee_number, body.owner_request_pin)
        if not profile or profile["id"] != user.id:
            raise HTTPException(status_code=403, detail="Employee ID/PIN did not match your logged-in account")
        owner_request_by = profile["id"]

    transaction_insert = (
        supabase.table("transactions")
        .insert(
            {
                "branch_id": body.branch_id,
                "employee_id": body.employee_id,
                "status": "open",
                "opened_at": datetime.now(timezone.utc).isoformat(),
                "total_amount": 0,
                "is_owner_request": body.is_owner_request,
                "owner_request_by": owner_request_by,
                "owner_request_note": body.owner_request_note,
                "order_type": body.order_type,
                "table_number": body.table_number,
                "guest_count": body.guest_count,
            }
        )
        .execute()
    )
    transaction = transaction_insert.data[0]
    transaction_id = transaction["id"]

    subtotal = 0.0
    item_rows = []
    for item in body.items:
        product = products_by_id[item.product_id]
        unit_price = float(product["price"])
        subtotal += unit_price * item.quantity
        item_rows.append(
            {
                "transaction_id": transaction_id,
                "product_id": item.product_id,
                "quantity": item.quantity,
                "unit_price": unit_price,
                "note": item.note,
            }
        )

    items_insert = supabase.table("transaction_items").insert(item_rows).execute()

    _adjust_ingredients(supabase, body.items, sign=-1)

    if body.discount_type_id:
        discount_amount = subtotal * (discount["percentage"] / 100)
    discounted_subtotal = subtotal - discount_amount
    tax_amount = 0.0 if vat_exempt else discounted_subtotal * VAT_RATE

    updated = (
        supabase.table("transactions")
        .update(
            {
                "total_amount": discounted_subtotal,
                "discount_type_id": body.discount_type_id,
                "discount_amount": discount_amount,
                "tax_amount": tax_amount,
            }
        )
        .eq("id", transaction_id)
        .execute()
    )
    transaction = updated.data[0]

    return TransactionResponse(**transaction, items=items_insert.data)


def _adjust_ingredients(supabase, items, sign: int):
    """Applies recipe-based stock changes for a list of sold items.
    sign=-1 deducts (a sale), sign=1 restores (a void)."""
    for item in items:
        recipe_result = (
            supabase.table("recipe_items")
            .select("ingredient_id, quantity")
            .eq("product_id", item.product_id)
            .execute()
        )
        for recipe_item in recipe_result.data:
            ingredient_id = recipe_item["ingredient_id"]
            delta_qty = float(recipe_item["quantity"]) * item.quantity * sign

            ingredient_result = (
                supabase.table("ingredients")
                .select("current_stock")
                .eq("id", ingredient_id)
                .single()
                .execute()
            )
            current_stock = float(ingredient_result.data["current_stock"])
            new_stock = current_stock + delta_qty

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


def _attach_held_ingredient_names(supabase, items: list[dict]) -> list[dict]:
    """Resolves held_ingredient_ids -> real ingredient names, in one batched
    query across every item passed in, so Order Queue and Kitchen Display
    can render "No Rice"-style tags on the order card itself instead of only
    inside the Edit dialog (the only place that previously looked these up).
    """
    all_ingredient_ids = {iid for item in items for iid in (item.get("held_ingredient_ids") or [])}
    if not all_ingredient_ids:
        for item in items:
            item["held_ingredient_names"] = []
        return items

    ingredients_result = (
        supabase.table("ingredients").select("id, name").in_("id", list(all_ingredient_ids)).execute()
    )
    name_by_id = {i["id"]: i["name"] for i in ingredients_result.data}
    for item in items:
        item["held_ingredient_names"] = [
            name_by_id.get(iid, "Unknown") for iid in (item.get("held_ingredient_ids") or [])
        ]
    return items


def _fetch_transaction_with_items(supabase, transaction_id: str) -> dict | None:
    result = (
        supabase.table("transactions").select("*").eq("id", transaction_id).maybe_single().execute()
    )
    if not result or not result.data:
        return None
    transaction = result.data
    items_result = (
        supabase.table("transaction_items").select("*").eq("transaction_id", transaction_id).execute()
    )
    transaction["items"] = _attach_held_ingredient_names(supabase, items_result.data)
    return transaction


@router.get("/transactions", response_model=list[TransactionResponse])
def list_transactions(
    branch_id: str = Query(...),
    on_date: date | None = Query(None, alias="date"),
    user: CurrentUser = Depends(get_current_user),
):
    """Today's (or a given date's) orders for a branch, for the Order Queue."""
    require_branch_access(user, branch_id)
    supabase = get_supabase()

    target_date = on_date or datetime.now(timezone.utc).date()
    start = datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc)
    end = datetime.combine(target_date, datetime.max.time(), tzinfo=timezone.utc)

    transactions_result = (
        supabase.table("transactions")
        .select("*")
        .eq("branch_id", branch_id)
        .gte("opened_at", start.isoformat())
        .lte("opened_at", end.isoformat())
        .order("opened_at", desc=True)
        .execute()
    )
    transactions = transactions_result.data
    if not transactions:
        return []

    transaction_ids = [t["id"] for t in transactions]
    items_result = (
        supabase.table("transaction_items").select("*").in_("transaction_id", transaction_ids).execute()
    )
    items_with_names = _attach_held_ingredient_names(supabase, items_result.data)
    items_by_transaction: dict[str, list] = {}
    for item in items_with_names:
        items_by_transaction.setdefault(item["transaction_id"], []).append(item)

    return [
        TransactionResponse(**t, items=items_by_transaction.get(t["id"], []))
        for t in transactions
    ]


@router.post("/transactions/{transaction_id}/void", response_model=TransactionResponse)
def void_transaction(
    transaction_id: str,
    body: VoidTransactionRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Voids an order and restores the inventory it actually consumed.
    Employees may only void their own orders; manager/executive may void
    any in-branch."""
    supabase = get_supabase()

    transaction = _fetch_transaction_with_items(supabase, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    require_branch_access(user, transaction["branch_id"])
    if user.role == "employee" and transaction["employee_id"] != user.id:
        raise HTTPException(status_code=403, detail="Employees may only void their own orders")
    if transaction["status"] == "voided":
        raise HTTPException(status_code=400, detail="Transaction is already voided")

    # Restore only what was actually effectively consumed (recipe qty minus
    # anything held) - not the item's full recipe, since a held ingredient's
    # stock was already returned when it was held (see update_transaction_item).
    # Using the blind full-recipe restore here would double-credit it.
    for row in transaction["items"]:
        consumption = _effective_consumption(
            supabase, row["product_id"], float(row["quantity"]), row.get("held_ingredient_ids") or []
        )
        for ingredient_id, qty in consumption.items():
            if qty == 0:
                continue
            ingredient_result = (
                supabase.table("ingredients").select("current_stock").eq("id", ingredient_id).single().execute()
            )
            new_stock = float(ingredient_result.data["current_stock"]) + qty
            supabase.table("ingredients").update({"current_stock": new_stock}).eq("id", ingredient_id).execute()

    updated = (
        supabase.table("transactions")
        .update(
            {
                "status": "voided",
                "voided_by": user.id,
                "voided_at": datetime.now(timezone.utc).isoformat(),
                "void_reason": body.reason,
            }
        )
        .eq("id", transaction_id)
        .execute()
    )
    return TransactionResponse(**updated.data[0], items=transaction["items"])


def _set_kitchen_status(supabase, transaction: dict, new_status: str, user: CurrentUser, allow_skip: bool) -> dict:
    require_branch_access(user, transaction["branch_id"])
    if user.role == "employee" and transaction["employee_id"] != user.id:
        raise HTTPException(status_code=403, detail="Employees may only update their own orders")
    if transaction["status"] == "voided":
        raise HTTPException(status_code=400, detail="Cannot update a voided order")

    current = transaction.get("kitchen_status", "queued")
    if new_status == current:
        raise HTTPException(status_code=400, detail=f"Order is already {new_status}")

    if not allow_skip:
        current_index = KITCHEN_STATUS_ORDER.index(current)
        new_index = KITCHEN_STATUS_ORDER.index(new_status)
        if new_index != current_index + 1:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot move directly from {current} to {new_status}",
            )

    updated = (
        supabase.table("transactions")
        .update({"kitchen_status": new_status, "kitchen_status_updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", transaction["id"])
        .execute()
    )
    return updated.data[0]


@router.patch("/transactions/{transaction_id}/kitchen-status", response_model=TransactionResponse)
def update_kitchen_status(
    transaction_id: str,
    body: KitchenStatusUpdateRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Drives Kitchen Display's per-column buttons (Accept/Mark as Ready/
    Ready for Pickup) — strict single forward step only, 400 on an invalid
    jump. Order Queue's "Mark as Done" uses /fulfill below instead, which
    allows jumping straight to completed from any state (front-of-house may
    close out an order without ever touching Kitchen Display that shift)."""
    supabase = get_supabase()
    transaction = _fetch_transaction_with_items(supabase, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    updated = _set_kitchen_status(supabase, transaction, body.kitchen_status, user, allow_skip=False)
    return TransactionResponse(**updated, items=transaction["items"])


@router.post("/transactions/{transaction_id}/fulfill", response_model=TransactionResponse)
def fulfill_transaction(
    transaction_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Marks an order done (served/handed off) - separate from payment
    status (open/closed/voided). This is what removes it from the active
    Order Queue view. Sets kitchen_status='completed' directly (allowed to
    skip queued/preparing/ready) since front-of-house may close an order
    out without the kitchen ever having tracked it through those states.
    fulfilled/fulfilled_at are no longer written here — kitchen_status is
    the single source of truth going forward."""
    supabase = get_supabase()

    transaction = _fetch_transaction_with_items(supabase, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    updated = _set_kitchen_status(supabase, transaction, "completed", user, allow_skip=True)
    return TransactionResponse(**updated, items=transaction["items"])


@router.get("/branches/{branch_id}/kitchen-summary", response_model=KitchenSummaryResponse)
def get_kitchen_summary(branch_id: str, user: CurrentUser = Depends(get_current_user)):
    """One computation, consumed by both Order Queue's "Today's Overview"
    cards and Kitchen Display's stat cards, so the two pages can never
    disagree about a count."""
    require_branch_access(user, branch_id)
    supabase = get_supabase()

    now = datetime.now(timezone.utc)
    today_start = datetime.combine(now.date(), datetime.min.time(), tzinfo=timezone.utc)

    active_result = (
        supabase.table("transactions")
        .select("id, kitchen_status, kitchen_status_updated_at, opened_at, is_owner_request")
        .eq("branch_id", branch_id)
        .neq("status", "voided")
        .neq("kitchen_status", "completed")
        .execute()
    )
    active = active_result.data

    completed_today_result = (
        supabase.table("transactions")
        .select("id, kitchen_status_updated_at, opened_at")
        .eq("branch_id", branch_id)
        .eq("kitchen_status", "completed")
        .gte("kitchen_status_updated_at", today_start.isoformat())
        .execute()
    )
    completed_today = completed_today_result.data

    owner_request_result = (
        supabase.table("transactions")
        .select("id", count="exact")
        .eq("branch_id", branch_id)
        .eq("is_owner_request", True)
        .neq("status", "voided")
        .neq("kitchen_status", "completed")
        .execute()
    )

    counts = {"queued": 0, "preparing": 0, "ready": 0}
    delayed_count = 0
    longest_order_id = None
    longest_order_elapsed = -1.0

    for t in active:
        status = t["kitchen_status"]
        counts[status] = counts.get(status, 0) + 1

        state_elapsed = (now - datetime.fromisoformat(t["kitchen_status_updated_at"])).total_seconds()
        if state_elapsed > DELAYED_THRESHOLD_SECONDS.get(status, float("inf")):
            delayed_count += 1

        opened_elapsed = (now - datetime.fromisoformat(t["opened_at"])).total_seconds()
        if opened_elapsed > longest_order_elapsed:
            longest_order_elapsed = opened_elapsed
            longest_order_id = t["id"]

    avg_prep_time_seconds = None
    if completed_today:
        durations = [
            (datetime.fromisoformat(t["kitchen_status_updated_at"]) - datetime.fromisoformat(t["opened_at"])).total_seconds()
            for t in completed_today
        ]
        avg_prep_time_seconds = sum(durations) / len(durations)

    return KitchenSummaryResponse(
        queued_count=counts["queued"],
        preparing_count=counts["preparing"],
        ready_count=counts["ready"],
        completed_today_count=len(completed_today),
        delayed_count=delayed_count,
        owner_request_pending_count=owner_request_result.count or 0,
        avg_prep_time_seconds=avg_prep_time_seconds,
        longest_order_id=longest_order_id,
        longest_order_elapsed_seconds=longest_order_elapsed if longest_order_id else None,
    )


def _effective_consumption(supabase, product_id: str, quantity: float, held_ingredient_ids: list[str]) -> dict:
    """recipe_qty * quantity per ingredient, 0 for any held ingredient -
    used to diff old vs. new state when a line item is edited."""
    recipe_result = (
        supabase.table("recipe_items")
        .select("ingredient_id, quantity")
        .eq("product_id", product_id)
        .execute()
    )
    held = set(held_ingredient_ids or [])
    consumption: dict[str, float] = {}
    for recipe_item in recipe_result.data:
        ingredient_id = recipe_item["ingredient_id"]
        consumption[ingredient_id] = 0.0 if ingredient_id in held else float(recipe_item["quantity"]) * quantity
    return consumption


@router.patch("/transactions/{transaction_id}/items/{item_id}", response_model=TransactionResponse)
def update_transaction_item(
    transaction_id: str,
    item_id: str,
    body: UpdateTransactionItemRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Edits a line item's quantity and/or held ingredients. Any ingredient
    no longer effectively consumed (quantity reduced, or newly held) has its
    unused stock returned and logged as a trans_in inventory movement - a
    positive variance, since it was deducted at checkout but never used."""
    supabase = get_supabase()

    transaction = _fetch_transaction_with_items(supabase, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    require_branch_access(user, transaction["branch_id"])
    if user.role == "employee" and transaction["employee_id"] != user.id:
        raise HTTPException(status_code=403, detail="Employees may only edit their own orders")
    if transaction["status"] == "voided":
        raise HTTPException(status_code=400, detail="Cannot edit a voided order")

    item = next((i for i in transaction["items"] if i["id"] == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Order item not found")

    old_quantity = float(item["quantity"])
    old_held = item.get("held_ingredient_ids") or []
    new_quantity = body.quantity if body.quantity is not None else old_quantity
    new_held = body.held_ingredient_ids if body.held_ingredient_ids is not None else old_held
    new_note = body.note if body.note is not None else item.get("note")

    if new_quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    old_consumption = _effective_consumption(supabase, item["product_id"], old_quantity, old_held)
    new_consumption = _effective_consumption(supabase, item["product_id"], new_quantity, new_held)

    product_result = (
        supabase.table("products").select("name").eq("id", item["product_id"]).maybe_single().execute()
    )
    product_name = product_result.data["name"] if product_result and product_result.data else "item"

    for ingredient_id in set(old_consumption) | set(new_consumption):
        delta = old_consumption.get(ingredient_id, 0.0) - new_consumption.get(ingredient_id, 0.0)
        if delta == 0:
            continue

        ingredient_result = (
            supabase.table("ingredients")
            .select("name, unit_cost, current_stock")
            .eq("id", ingredient_id)
            .single()
            .execute()
        )
        ingredient = ingredient_result.data
        new_stock = float(ingredient["current_stock"]) + delta
        supabase.table("ingredients").update({"current_stock": new_stock}).eq("id", ingredient_id).execute()

        if delta > 0:
            # Net return to stock - deducted at checkout, never actually used.
            was_newly_held = ingredient_id in new_held and ingredient_id not in old_held
            reason = (
                f"Held from order — {ingredient['name']} not used ({product_name})"
                if was_newly_held
                else f"Quantity reduced — {ingredient['name']} returned ({product_name})"
            )
            supabase.table("inventory_movements").insert(
                {
                    "branch_id": transaction["branch_id"],
                    "ingredient_id": ingredient_id,
                    "type": "trans_in",
                    "quantity": delta,
                    "reason": reason,
                    "reference_id": transaction_id,
                    "employee_id": user.id,
                    "unit_cost_snapshot": float(ingredient["unit_cost"]),
                }
            ).execute()

    supabase.table("transaction_items").update(
        {"quantity": new_quantity, "held_ingredient_ids": new_held, "note": new_note}
    ).eq("id", item_id).execute()

    # Recompute the transaction's totals from all its items, same formula create_transaction uses.
    items_result = (
        supabase.table("transaction_items").select("*").eq("transaction_id", transaction_id).execute()
    )
    items = items_result.data
    subtotal = sum(float(i["unit_price"]) * float(i["quantity"]) for i in items)

    discount_amount = 0.0
    vat_exempt = False
    if transaction.get("discount_type_id"):
        discount_result = (
            supabase.table("discount_types")
            .select("percentage, vat_exempt")
            .eq("id", transaction["discount_type_id"])
            .maybe_single()
            .execute()
        )
        if discount_result and discount_result.data:
            discount_amount = subtotal * (discount_result.data["percentage"] / 100)
            vat_exempt = discount_result.data["vat_exempt"]

    discounted_subtotal = subtotal - discount_amount
    tax_amount = 0.0 if vat_exempt else discounted_subtotal * VAT_RATE

    updated = (
        supabase.table("transactions")
        .update(
            {
                "total_amount": discounted_subtotal,
                "discount_amount": discount_amount,
                "tax_amount": tax_amount,
            }
        )
        .eq("id", transaction_id)
        .execute()
    )
    return TransactionResponse(**updated.data[0], items=items)
