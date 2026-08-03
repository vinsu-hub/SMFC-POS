from app.deps import get_supabase


def test_count_with_overage_creates_movement_with_positive_variance(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario

    response = client.post(
        f"/inventory/{scenario['matcha_id']}/count",
        json={"counted_stock": 120, "employee_id": scenario["employee_id"]},
        headers={"Authorization": f"Bearer {scenario['access_token']}"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["variance"] == 20
    assert body["ingredient"]["current_stock"] == 120
    movement = body["movement"]
    assert movement is not None
    assert movement["type"] == "count_adjustment"
    assert movement["quantity"] == 20
    assert movement["variance"] == 20
    assert movement["previous_stock"] == 100
    assert movement["counted_stock"] == 120


def test_count_with_shortage_creates_movement_with_negative_variance(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario

    response = client.post(
        f"/inventory/{scenario['syrup_id']}/count",
        json={"counted_stock": 90, "employee_id": scenario["employee_id"]},
        headers={"Authorization": f"Bearer {scenario['access_token']}"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["variance"] == -10
    movement = body["movement"]
    assert movement is not None
    assert movement["quantity"] == 10
    assert movement["variance"] == -10


def test_count_with_no_change_creates_no_movement(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario

    response = client.post(
        f"/inventory/{scenario['matcha_id']}/count",
        json={"counted_stock": 100, "employee_id": scenario["employee_id"]},
        headers={"Authorization": f"Bearer {scenario['access_token']}"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["variance"] == 0
    assert body["movement"] is None


def test_count_employee_id_mismatch_returns_403(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario

    response = client.post(
        f"/inventory/{scenario['matcha_id']}/count",
        json={"counted_stock": 90, "employee_id": "00000000-0000-0000-0000-000000000000"},
        headers={"Authorization": f"Bearer {scenario['access_token']}"},
    )

    assert response.status_code == 403


def test_loss_record_with_skip_stock_deduction_does_not_double_deduct(client, matcha_latte_scenario):
    """Regression test: Count Stock already sets current_stock to the true
    physical count, so logging the shortage as a loss afterward must NOT
    deduct stock a second time.
    """
    scenario = matcha_latte_scenario
    headers = {"Authorization": f"Bearer {scenario['access_token']}"}

    count_response = client.post(
        f"/inventory/{scenario['syrup_id']}/count",
        json={"counted_stock": 90, "employee_id": scenario["employee_id"]},
        headers=headers,
    )
    assert count_response.status_code == 200, count_response.text
    movement_id = count_response.json()["movement"]["id"]

    loss_response = client.post(
        "/loss-records",
        json={
            "branch_id": scenario["branch_id"],
            "employee_id": scenario["employee_id"],
            "ingredient_id": scenario["syrup_id"],
            "reason": "shrinkage",
            "quantity": 10,
            "reference_id": movement_id,
            "skip_stock_deduction": True,
        },
        headers=headers,
    )
    assert loss_response.status_code == 200, loss_response.text
    loss_body = loss_response.json()
    assert loss_body["reason"] == "shrinkage"
    assert loss_body["reference_id"] == movement_id
    # Liquid Sugar unit_cost 0.1 -> 0.1 * 10 = 1.0
    assert loss_body["cost_impact"] == 1.0

    supabase = get_supabase()
    syrup = (
        supabase.table("ingredients")
        .select("current_stock")
        .eq("id", scenario["syrup_id"])
        .single()
        .execute()
        .data
    )
    # Still 90 (the counted value) -- NOT 80, which would mean the loss
    # record deducted a second time on top of the count.
    assert float(syrup["current_stock"]) == 90
