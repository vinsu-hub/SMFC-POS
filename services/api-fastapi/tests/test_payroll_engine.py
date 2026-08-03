import os
import uuid
from datetime import date

import pytest
from supabase import create_client

from app.attendance_utils import hr_table
from app.deps import get_supabase
from app.routers.hr import _compute_payroll_summary

PERIOD_START = date(2026, 1, 1)
PERIOD_END = date(2026, 1, 1)


@pytest.fixture
def payroll_scenario():
    """One branch, one employee (pay_rate=100), a branch-scoped regular
    holiday on 2026-01-01, and an attendance log with a pre-computed
    breakdown (8 regular hours + 2 overtime hours on that holiday). Toggles
    the global engine_enabled flag on for the duration of the test and
    restores its original value afterward, since it's a single shared row.
    """
    supabase = get_supabase()
    suffix = uuid.uuid4().hex[:8]

    org = supabase.table("organizations").insert({"name": f"Payroll Test Org {suffix}"}).execute().data[0]
    branch = (
        supabase.table("branches")
        .insert({"organization_id": org["id"], "name": f"Payroll Test Branch {suffix}", "type": "cafe", "theme_key": f"payroll-test-{suffix}"})
        .execute()
        .data[0]
    )

    email = f"payroll-test-{suffix}@saintmichael.test"
    password = "Test1234!!"
    auth_user = supabase.auth.admin.create_user({"email": email, "password": password, "email_confirm": True})
    employee_id = auth_user.user.id
    supabase.table("profiles").insert(
        {"id": employee_id, "branch_id": branch["id"], "role": "employee", "full_name": "Test Employee", "pay_rate": 100}
    ).execute()

    holiday = (
        hr_table("holidays")
        .insert({"holiday_date": PERIOD_START.isoformat(), "name": f"Test Holiday {suffix}", "holiday_type": "regular_holiday", "branch_scope": branch["id"]})
        .execute()
        .data[0]
    )

    attendance_log = (
        hr_table("attendance_logs")
        .insert(
            {
                "employee_id": employee_id,
                "branch_id": branch["id"],
                "clock_in": f"{PERIOD_START.isoformat()}T00:00:00Z",
                "clock_out": f"{PERIOD_START.isoformat()}T10:00:00Z",
                "date": PERIOD_START.isoformat(),
                "hours_worked": 10,
                "regular_hours": 8,
                "overtime_hours": 2,
                "night_diff_hours": 0,
                "day_scenario": "regular_holiday",
                "holiday_id": holiday["id"],
                "status": "completed",
            }
        )
        .execute()
        .data[0]
    )

    settings_row = hr_table("payroll_rule_settings").select("*").limit(1).maybe_single().execute().data
    original_engine_enabled = settings_row["engine_enabled"]
    hr_table("payroll_rule_settings").update({"engine_enabled": True}).eq("id", settings_row["id"]).execute()

    yield {"branch_id": branch["id"], "employee_id": employee_id, "attendance_log_id": attendance_log["id"]}

    hr_table("payroll_rule_settings").update({"engine_enabled": original_engine_enabled}).eq("id", settings_row["id"]).execute()
    hr_table("payroll_overrides").delete().eq("attendance_log_id", attendance_log["id"]).execute()
    hr_table("attendance_logs").delete().eq("id", attendance_log["id"]).execute()
    hr_table("holidays").delete().eq("id", holiday["id"]).execute()
    supabase.table("branches").delete().eq("id", branch["id"]).execute()
    supabase.table("organizations").delete().eq("id", org["id"]).execute()
    supabase.auth.admin.delete_user(employee_id)


def test_regular_holiday_worked_matches_dole_math(payroll_scenario):
    supabase = get_supabase()
    summary = _compute_payroll_summary(supabase, payroll_scenario["branch_id"], PERIOD_START, PERIOD_END)

    assert summary["engine_enabled"] is True
    row = next(r for r in summary["rows"] if r["employee_id"] == payroll_scenario["employee_id"])

    # regular_holiday: first_8hr_pct=200, ot_addon_pct=25.
    # regular_pay = 8 * 100 * 2.00 = 1600; overtime_pay = 2 * 100 * 2.00 * 1.25 = 500.
    assert row["regular_hours"] == 8
    assert row["overtime_hours"] == 2
    assert row["holiday_pay"] == 800  # premium portion: 1600 - (8 * 100)
    assert row["total_pay"] == 2100


def test_engine_disabled_reproduces_flat_calc(payroll_scenario):
    supabase = get_supabase()
    settings_id = hr_table("payroll_rule_settings").select("id").limit(1).maybe_single().execute().data["id"]
    hr_table("payroll_rule_settings").update({"engine_enabled": False}).eq("id", settings_id).execute()

    summary = _compute_payroll_summary(supabase, payroll_scenario["branch_id"], PERIOD_START, PERIOD_END)
    row = next(r for r in summary["rows"] if r["employee_id"] == payroll_scenario["employee_id"])

    assert summary["engine_enabled"] is False
    assert row["total_pay"] == 1000  # 10 hours_worked * 100 pay_rate, flat
    assert row.get("regular_hours") is None  # breakdown fields omitted on the flat path

    hr_table("payroll_rule_settings").update({"engine_enabled": True}).eq("id", settings_id).execute()


def test_approved_override_changes_computed_total(payroll_scenario):
    supabase = get_supabase()
    hr_table("payroll_overrides").insert(
        {
            "attendance_log_id": payroll_scenario["attendance_log_id"],
            "field": "overtime_hours",
            "old_value": "2",
            "new_value": "3",
            "reason": "Manual correction for test",
            "requested_by": payroll_scenario["employee_id"],
            "approved_by": payroll_scenario["employee_id"],
        }
    ).execute()

    summary = _compute_payroll_summary(supabase, payroll_scenario["branch_id"], PERIOD_START, PERIOD_END)
    row = next(r for r in summary["rows"] if r["employee_id"] == payroll_scenario["employee_id"])

    # overtime_pay = 3 * 100 * 2.00 * 1.25 = 750; total = 1600 (regular) + 750 = 2350.
    assert row["overtime_hours"] == 3
    assert row["total_pay"] == 2350
