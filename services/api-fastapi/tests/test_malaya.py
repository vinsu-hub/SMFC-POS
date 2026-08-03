from datetime import date, datetime, timezone

from app.deps import get_supabase
from app.routers.malaya import (
    _current_semimonthly_period,
    _inventory_analysis,
    _payroll_analysis,
    _sales_trend,
)


def _promote_to_manager(employee_id: str):
    """matcha_latte_scenario seeds an employee-role profile (the acting
    barista for the sale) -- Malaya is manager/executive only now, so tests
    that query it need to promote that user first rather than touching the
    shared fixture, which other test files also depend on staying employee.
    """
    get_supabase().table("profiles").update({"role": "manager"}).eq("id", employee_id).execute()


def test_malaya_query_answers_from_real_data(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario
    headers = {"Authorization": f"Bearer {scenario['access_token']}"}
    _promote_to_manager(scenario["employee_id"])

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


def test_malaya_query_denies_employee_role(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario
    headers = {"Authorization": f"Bearer {scenario['access_token']}"}

    response = client.post("/malaya/query", json={"question": "What is my revenue today?"}, headers=headers)
    assert response.status_code == 403, response.text


def test_current_semimonthly_period_first_half():
    start, end = _current_semimonthly_period(date(2026, 8, 5))
    assert (start, end) == (date(2026, 8, 1), date(2026, 8, 15))


def test_current_semimonthly_period_second_half():
    start, end = _current_semimonthly_period(date(2026, 2, 20))
    assert (start, end) == (date(2026, 2, 16), date(2026, 2, 28))


def test_payroll_analysis_empty_branch_returns_zeroed_aggregate(matcha_latte_scenario):
    scenario = matcha_latte_scenario
    supabase = get_supabase()

    result = _payroll_analysis(supabase, [scenario["branch_id"]])

    assert result["total_payroll_cost"] == 0
    assert result["employee_count"] == 0
    assert result["top_overtime_holiday_driver"] is None
    assert result["period_start"] and result["period_end"]


def test_sales_trend_includes_todays_sale(client, matcha_latte_scenario):
    scenario = matcha_latte_scenario
    headers = {"Authorization": f"Bearer {scenario['access_token']}"}
    supabase = get_supabase()

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

    trend = _sales_trend(supabase, [scenario["branch_id"]], days=30)

    assert len(trend["daily_revenue"]) == 30
    # _sales_trend buckets by UTC date -- use the same clock the backend
    # uses, not the test machine's local date, which can differ near
    # midnight UTC (this test flaked exactly that way once already).
    today_key = datetime.now(timezone.utc).date().isoformat()
    today_row = next(r for r in trend["daily_revenue"] if r["date"] == today_key)
    assert today_row["revenue"] >= 150.0
    today_top = next((r for r in trend["daily_top_product"] if r["date"] == today_key), None)
    assert today_top is not None
    assert today_top["product"] == "Matcha Latte"


def test_inventory_analysis_flags_low_stock(matcha_latte_scenario):
    scenario = matcha_latte_scenario
    supabase = get_supabase()
    supabase.table("ingredients").insert(
        {
            "branch_id": scenario["branch_id"],
            "name": "Oat Milk",
            "unit": "ml",
            "unit_cost": 0.05,
            "current_stock": 5,
            "reorder_threshold": 50,
        }
    ).execute()

    result = _inventory_analysis(supabase, [scenario["branch_id"]])

    assert result["low_stock_count"] >= 1
    assert any(item["ingredient"] == "Oat Milk" for item in result["low_stock_items"])
    assert result["total_valuation"] > 0
