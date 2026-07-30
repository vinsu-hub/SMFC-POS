def test_branch_summary_reflects_a_sale_and_a_logged_loss(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario
    headers = {"Authorization": f"Bearer {scenario['access_token']}"}

    sale_response = client.post(
        "/transactions",
        json={
            "branch_id": scenario["branch_id"],
            "employee_id": scenario["employee_id"],
            "items": [{"product_id": scenario["product_id"], "quantity": 1}],
        },
        headers=headers,
    )
    assert sale_response.status_code == 200, sale_response.text

    loss_response = client.post(
        "/loss-records",
        json={
            "branch_id": scenario["branch_id"],
            "employee_id": scenario["employee_id"],
            "ingredient_id": scenario["matcha_id"],
            "reason": "spoilage",
            "quantity": 5,
        },
        headers=headers,
    )
    assert loss_response.status_code == 200, loss_response.text

    summary_response = client.get(f"/branches/{scenario['branch_id']}/summary", headers=headers)
    assert summary_response.status_code == 200, summary_response.text
    summary = summary_response.json()

    # Matcha Latte: price 150, recipe is 2g matcha (@2.5/g) + 3g syrup (@0.1/g) -> cogs 5.30
    assert summary["revenue"] == 150
    assert summary["cogs"] == 5.3
    # 5g matcha spoiled @2.5/g
    assert summary["losses"] == 12.5
    assert summary["margin"] == 150 - 5.3 - 12.5
    assert sum(point["revenue"] for point in summary["hourly_revenue"]) == 150
