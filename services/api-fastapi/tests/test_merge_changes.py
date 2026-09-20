"""Regression tests for the fixes made while merging procurement/logistics into SMFC-POS."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date

from app.auth import CurrentUser, is_company_wide
from app.deps import get_supabase


def _user(role: str) -> CurrentUser:
    return CurrentUser(id="u", role=role, branch_id=None)


def test_company_wide_roles_are_executive_and_logistics_only():
    assert is_company_wide(_user("executive"))
    assert is_company_wide(_user("logistics"))
    for role in ("employee", "manager", "procurement", "finance_admin", "canvasser"):
        assert not is_company_wide(_user(role)), role


def test_electricity_reading_can_be_saved_and_updated_the_same_day(client, matcha_latte_scenario):
    """migration 0018 replaced the unique constraint with a partial index, which broke the old
    on_conflict upsert (Postgres 42P10 -> HTTP 500). Saving twice must update, not fail or duplicate."""
    s = matcha_latte_scenario
    headers = {"Authorization": f"Bearer {s['access_token']}"}
    body = {
        "branch_id": s["branch_id"],
        "utility_type": "electricity",
        "business_date": date.today().isoformat(),
        "reading_start": 100,
        "unit_cost": 12,
        "recorded_by": s["employee_id"],
    }
    first = client.post("/utility-logs", json=body, headers=headers)
    assert first.status_code == 200, first.text

    second = client.post("/utility-logs", json={**body, "reading_end": 150}, headers=headers)
    assert second.status_code == 200, second.text
    assert second.json()["id"] == first.json()["id"]  # updated in place
    assert second.json()["reading_end"] == 150

    rows = (
        get_supabase()
        .table("utility_logs")
        .select("id")
        .eq("branch_id", s["branch_id"])
        .eq("utility_type", "electricity")
        .execute()
        .data
    )
    assert len(rows) == 1
    get_supabase().table("utility_logs").delete().eq("branch_id", s["branch_id"]).execute()


def test_parallel_requests_do_not_fail_on_the_shared_supabase_client(client, matcha_latte_scenario):
    """The shared client used HTTP/2; concurrent requests intermittently died with ConnectionTerminated
    (surfacing as 500s or false 401s)."""
    s = matcha_latte_scenario
    headers = {"Authorization": f"Bearer {s['access_token']}"}

    def call(_):
        return client.get(f"/inventory?branch_id={s['branch_id']}", headers=headers).status_code

    with ThreadPoolExecutor(max_workers=12) as pool:
        codes = list(pool.map(call, range(96)))
    assert codes.count(200) == len(codes), {c: codes.count(c) for c in set(codes)}
