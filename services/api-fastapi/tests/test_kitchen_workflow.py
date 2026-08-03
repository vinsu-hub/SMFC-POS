from datetime import datetime, timedelta, timezone

from app.deps import get_supabase


def _create_order(client, scenario, **extra):
    return client.post(
        "/transactions",
        json={
            "branch_id": scenario["branch_id"],
            "employee_id": scenario["employee_id"],
            "items": [{"product_id": scenario["product_id"], "quantity": 1}],
            **extra,
        },
        headers={"Authorization": f"Bearer {scenario['access_token']}"},
    )


def test_new_order_defaults_to_queued_and_dine_in(client, matcha_latte_scenario):
    response = _create_order(client, matcha_latte_scenario)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["kitchen_status"] == "queued"
    assert body["order_type"] == "dine_in"
    assert body["table_number"] is None
    assert body["guest_count"] is None


def test_take_out_order_persists_type_without_table(client, matcha_latte_scenario):
    response = _create_order(
        client, matcha_latte_scenario, order_type="take_out", guest_count=None
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["order_type"] == "take_out"


def test_dine_in_order_persists_table_and_guest_count(client, matcha_latte_scenario):
    response = _create_order(
        client, matcha_latte_scenario, order_type="dine_in", table_number="12", guest_count=3
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["table_number"] == "12"
    assert body["guest_count"] == 3


def test_kitchen_status_valid_forward_step_succeeds(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario
    headers = {"Authorization": f"Bearer {scenario['access_token']}"}
    order_id = _create_order(client, scenario).json()["id"]

    response = client.patch(
        f"/transactions/{order_id}/kitchen-status",
        json={"kitchen_status": "preparing"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["kitchen_status"] == "preparing"


def test_kitchen_status_invalid_jump_returns_400(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario
    headers = {"Authorization": f"Bearer {scenario['access_token']}"}
    order_id = _create_order(client, scenario).json()["id"]

    # queued -> ready skips preparing.
    response = client.patch(
        f"/transactions/{order_id}/kitchen-status",
        json={"kitchen_status": "ready"},
        headers=headers,
    )
    assert response.status_code == 400


def test_kitchen_status_same_status_returns_400(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario
    headers = {"Authorization": f"Bearer {scenario['access_token']}"}
    order_id = _create_order(client, scenario).json()["id"]

    response = client.patch(
        f"/transactions/{order_id}/kitchen-status",
        json={"kitchen_status": "queued"},
        headers=headers,
    )
    assert response.status_code == 400


def test_fulfill_allows_skipping_straight_to_completed(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario
    headers = {"Authorization": f"Bearer {scenario['access_token']}"}
    order_id = _create_order(client, scenario).json()["id"]

    # Still "queued" -- /fulfill should succeed anyway (front-of-house may
    # close an order without ever routing it through Kitchen Display).
    response = client.post(f"/transactions/{order_id}/fulfill", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["kitchen_status"] == "completed"


def test_kitchen_summary_counts_active_orders_by_status(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario
    headers = {"Authorization": f"Bearer {scenario['access_token']}"}

    queued_id = _create_order(client, scenario).json()["id"]

    preparing_id = _create_order(client, scenario).json()["id"]
    client.patch(f"/transactions/{preparing_id}/kitchen-status", json={"kitchen_status": "preparing"}, headers=headers)

    completed_id = _create_order(client, scenario).json()["id"]
    client.post(f"/transactions/{completed_id}/fulfill", headers=headers)

    response = client.get(f"/branches/{scenario['branch_id']}/kitchen-summary", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["queued_count"] >= 1
    assert body["preparing_count"] >= 1
    assert body["completed_today_count"] >= 1
    assert body["avg_prep_time_seconds"] is not None


def test_kitchen_summary_flags_delayed_orders(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario
    headers = {"Authorization": f"Bearer {scenario['access_token']}"}
    order_id = _create_order(client, scenario).json()["id"]

    # Backdate kitchen_status_updated_at past the 15-minute queued threshold
    # directly via the DB -- the API has no way to backdate a real order,
    # and this is exactly the kind of state only a test should manufacture.
    supabase = get_supabase()
    stale_time = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
    supabase.table("transactions").update({"kitchen_status_updated_at": stale_time}).eq("id", order_id).execute()

    response = client.get(f"/branches/{scenario['branch_id']}/kitchen-summary", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["delayed_count"] >= 1


def test_product_availability_reflects_ingredient_stock(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario
    headers = {"Authorization": f"Bearer {scenario['access_token']}"}
    supabase = get_supabase()

    # Matcha Latte needs 2g matcha + 3g liquid sugar; both seeded at 100g
    # with reorder_threshold 10 -- comfortably available at full stock.
    response = client.get(f"/products?branch_id={scenario['branch_id']}", headers=headers)
    assert response.status_code == 200, response.text
    product = next(p for p in response.json() if p["id"] == scenario["product_id"])
    assert product["availability"] == "available"

    # Drop matcha to below its reorder threshold -> low_stock.
    supabase.table("ingredients").update({"current_stock": 5}).eq("id", scenario["matcha_id"]).execute()
    response = client.get(f"/products?branch_id={scenario['branch_id']}", headers=headers)
    product = next(p for p in response.json() if p["id"] == scenario["product_id"])
    assert product["availability"] == "low_stock"

    # Drop matcha to zero -> unavailable (can't cover one more unit).
    supabase.table("ingredients").update({"current_stock": 0}).eq("id", scenario["matcha_id"]).execute()
    response = client.get(f"/products?branch_id={scenario['branch_id']}", headers=headers)
    product = next(p for p in response.json() if p["id"] == scenario["product_id"])
    assert product["availability"] == "unavailable"
