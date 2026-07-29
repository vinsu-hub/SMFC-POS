from app.deps import get_supabase


def test_selling_one_matcha_latte_deducts_matcha_and_syrup(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario

    response = client.post(
        "/transactions",
        json={
            "branch_id": scenario["branch_id"],
            "employee_id": scenario["employee_id"],
            "items": [{"product_id": scenario["product_id"], "quantity": 1}],
        },
        headers={"Authorization": f"Bearer {scenario['access_token']}"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total_amount"] == 150
    assert len(body["items"]) == 1

    supabase = get_supabase()
    matcha = (
        supabase.table("ingredients")
        .select("current_stock")
        .eq("id", scenario["matcha_id"])
        .single()
        .execute()
        .data
    )
    syrup = (
        supabase.table("ingredients")
        .select("current_stock")
        .eq("id", scenario["syrup_id"])
        .single()
        .execute()
        .data
    )

    # Started at 100g each; recipe is 2g matcha + 3g liquid sugar per latte.
    assert float(matcha["current_stock"]) == 98
    assert float(syrup["current_stock"]) == 97
