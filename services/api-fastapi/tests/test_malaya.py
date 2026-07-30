def test_malaya_query_answers_from_real_data(client, matcha_latte_scenario):
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

    query_response = client.post(
        "/malaya/query",
        json={"question": "What is my revenue today?"},
        headers=headers,
    )
    assert query_response.status_code == 200, query_response.text
    body = query_response.json()
    assert isinstance(body["answer"], str)
    assert len(body["answer"]) > 0
    assert body["chart"] is None or isinstance(body["chart"], dict)
