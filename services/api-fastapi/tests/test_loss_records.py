from app.deps import get_supabase


def test_logging_a_loss_deducts_stock_and_computes_cost_impact(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario

    response = client.post(
        "/loss-records",
        json={
            "branch_id": scenario["branch_id"],
            "employee_id": scenario["employee_id"],
            "ingredient_id": scenario["syrup_id"],
            "reason": "spoilage",
            "quantity": 4,
        },
        headers={"Authorization": f"Bearer {scenario['access_token']}"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    # Liquid Sugar seeded at unit_cost 0.1 in conftest -> 0.1 * 4 = 0.4
    assert body["cost_impact"] == 0.4
    assert body["reason"] == "spoilage"

    supabase = get_supabase()
    syrup = (
        supabase.table("ingredients")
        .select("current_stock")
        .eq("id", scenario["syrup_id"])
        .single()
        .execute()
        .data
    )
    # Started at 100g, loss of 4g logged.
    assert float(syrup["current_stock"]) == 96


def test_cannot_log_loss_for_ingredient_on_another_branch(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario

    response = client.post(
        "/loss-records",
        json={
            "branch_id": scenario["branch_id"],
            "employee_id": scenario["employee_id"],
            # A random, non-existent ingredient id, standing in for "not on this branch".
            "ingredient_id": "00000000-0000-0000-0000-000000000000",
            "reason": "breakage",
            "quantity": 1,
        },
        headers={"Authorization": f"Bearer {scenario['access_token']}"},
    )

    assert response.status_code == 404
