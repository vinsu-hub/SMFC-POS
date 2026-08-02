"""Functional test for the Order Queue edit feature: creates a real order
for a multi-ingredient product, holds one ingredient via the actual
update_transaction_item endpoint logic, and asserts stock/movement/total
math is correct. Exercises the real router functions directly (no HTTP
layer needed - they're plain functions once you supply a CurrentUser).

Run with: uv run python scripts/test_order_edit.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.auth import CurrentUser
from app.deps import get_supabase
from app.schemas import CreateTransactionRequest, TransactionItemRequest, UpdateTransactionItemRequest
from app.routers.transactions import create_transaction, update_transaction_item, void_transaction
from app.schemas import VoidTransactionRequest

supabase = get_supabase()

FAILURES = []


def check(label, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {label}" + (f" — {detail}" if detail and not condition else ""))
    if not condition:
        FAILURES.append(label)


def main():
    branch = (
        supabase.table("branches").select("id, name").eq("theme_key", "malaya-agapita").single().execute().data
    )
    branch_id = branch["id"]

    employee = (
        supabase.table("profiles")
        .select("id, full_name, employee_number")
        .eq("branch_id", branch_id)
        .eq("role", "employee")
        .limit(1)
        .single()
        .execute()
        .data
    )
    other_employee = (
        supabase.table("profiles")
        .select("id, full_name")
        .eq("branch_id", branch_id)
        .eq("role", "manager")
        .limit(1)
        .single()
        .execute()
        .data
    )
    user = CurrentUser(id=employee["id"], role="employee", branch_id=branch_id)
    manager_user = CurrentUser(id=other_employee["id"], role="manager", branch_id=branch_id)

    product = (
        supabase.table("products")
        .select("id, name, price")
        .eq("branch_id", branch_id)
        .eq("name", "Matcha Latte")
        .single()
        .execute()
        .data
    )
    print(f"Testing with product: {product['name']} (PHP {product['price']}) at {branch['name']}")

    recipe = (
        supabase.table("recipe_items")
        .select("ingredient_id, quantity, ingredients(id, name)")
        .eq("product_id", product["id"])
        .execute()
        .data
    )
    recipe_by_ingredient = {r["ingredient_id"]: r for r in recipe}
    matcha = next(r for r in recipe if r["ingredients"]["name"] == "Matcha")
    syrup = next(r for r in recipe if r["ingredients"]["name"] == "Liquid Sugar")
    print(f"Recipe: {matcha['quantity']}g Matcha + {syrup['quantity']}g Liquid Sugar per unit")

    def stock(ingredient_id):
        return float(
            supabase.table("ingredients").select("current_stock").eq("id", ingredient_id).single().execute().data[
                "current_stock"
            ]
        )

    matcha_before = stock(matcha["ingredient_id"])
    syrup_before = stock(syrup["ingredient_id"])

    # --- 1. Create a 2x order, confirm both ingredients deducted ---
    print("\n1. Creating order for 2x Matcha Latte...")
    body = CreateTransactionRequest(
        branch_id=branch_id,
        employee_id=employee["id"],
        items=[TransactionItemRequest(product_id=product["id"], quantity=2)],
    )
    transaction = create_transaction(body, user)
    item = transaction.items[0]

    matcha_after_sale = stock(matcha["ingredient_id"])
    syrup_after_sale = stock(syrup["ingredient_id"])
    check("Matcha deducted by 2x recipe qty", abs((matcha_before - matcha_after_sale) - matcha["quantity"] * 2) < 0.001)
    check("Liquid Sugar deducted by 2x recipe qty", abs((syrup_before - syrup_after_sale) - syrup["quantity"] * 2) < 0.001)
    check("total_amount == price * 2", abs(transaction.total_amount - float(product["price"]) * 2) < 0.01)

    # --- 2. Hold Liquid Sugar, confirm it's returned to stock (positive variance) ---
    print("\n2. Editing order: hold Liquid Sugar...")
    updated = update_transaction_item(
        transaction.id,
        item.id,
        UpdateTransactionItemRequest(held_ingredient_ids=[syrup["ingredient_id"]]),
        user,
    )
    syrup_after_hold = stock(syrup["ingredient_id"])
    matcha_after_hold = stock(matcha["ingredient_id"])
    check(
        "Liquid Sugar fully returned to stock after hold",
        abs(syrup_after_hold - syrup_before) < 0.001,
        f"before={syrup_before} after_hold={syrup_after_hold}",
    )
    check("Matcha stock unaffected by holding Liquid Sugar", abs(matcha_after_hold - matcha_after_sale) < 0.001)
    check(
        "held_ingredient_ids persisted on the item",
        updated.items[0].held_ingredient_ids == [syrup["ingredient_id"]],
    )
    check("total_amount unchanged by a hold (price doesn't change)", abs(updated.total_amount - transaction.total_amount) < 0.01)

    movement = (
        supabase.table("inventory_movements")
        .select("*")
        .eq("reference_id", transaction.id)
        .eq("ingredient_id", syrup["ingredient_id"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    check("inventory_movements row logged for the hold", len(movement) == 1)
    if movement:
        check("movement type is trans_in", movement[0]["type"] == "trans_in")
        check("movement reason mentions the ingredient and product", "Liquid Sugar" in movement[0]["reason"] and "Matcha Latte" in movement[0]["reason"])

    # --- 3. Reduce quantity from 2 to 1, confirm matcha partially returned ---
    print("\n3. Editing order: reduce quantity 2 -> 1...")
    updated2 = update_transaction_item(transaction.id, item.id, UpdateTransactionItemRequest(quantity=1), user)
    matcha_after_reduce = stock(matcha["ingredient_id"])
    check(
        "Matcha stock increases by 1x recipe qty when quantity drops 2->1",
        abs((matcha_after_reduce - matcha_after_hold) - matcha["quantity"]) < 0.001,
    )
    check("total_amount recomputed for new quantity", abs(updated2.total_amount - float(product["price"]) * 1) < 0.01)

    # --- 4. Permission check: another employee (well, a manager here) CAN edit; a different employee CANNOT ---
    print("\n4. Permission checks...")
    try:
        # Simulate a different employee (not the order's owner) trying to edit.
        stranger = CurrentUser(id="00000000-0000-0000-0000-000000000000", role="employee", branch_id=branch_id)
        update_transaction_item(transaction.id, item.id, UpdateTransactionItemRequest(quantity=1), stranger)
        check("employee cannot edit another employee's order", False, "no exception raised")
    except Exception as e:
        check("employee cannot edit another employee's order", "403" in str(e) or "own orders" in str(e).lower(), str(e))

    try:
        updated3 = update_transaction_item(transaction.id, item.id, UpdateTransactionItemRequest(quantity=1), manager_user)
        check("manager CAN edit another employee's order", True)
    except Exception as e:
        check("manager CAN edit another employee's order", False, str(e))

    # --- 5. Void rejection after edit still works, and editing a voided order is rejected ---
    print("\n5. Void + post-void edit rejection...")
    void_transaction(transaction.id, VoidTransactionRequest(reason="test cleanup"), user)
    try:
        update_transaction_item(transaction.id, item.id, UpdateTransactionItemRequest(quantity=1), user)
        check("editing a voided order is rejected", False, "no exception raised")
    except Exception as e:
        check("editing a voided order is rejected", "voided" in str(e).lower(), str(e))

    print(f"\n{'='*50}")
    if FAILURES:
        print(f"{len(FAILURES)} CHECK(S) FAILED: {FAILURES}")
        sys.exit(1)
    else:
        print("ALL CHECKS PASSED")


if __name__ == "__main__":
    main()
