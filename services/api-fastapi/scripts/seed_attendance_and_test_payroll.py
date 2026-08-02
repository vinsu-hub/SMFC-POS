"""Seeds ~2 weeks of realistic attendance_logs (+ lunch breaks) for one demo
employee, then generates a real payslip PDF via the same code path as
GET /branches/{id}/payroll/{employee}/receipt.pdf, saved to disk for a
manual look — a payroll "dry run" to confirm the PDF template renders
correctly against real-shaped data before relying on it live.

Run with: uv run python scripts/seed_attendance_and_test_payroll.py
"""

import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.deps import get_supabase
from app.attendance_utils import hr_table
from app.routers.hr import _build_employee_payslip_bytes, _compute_payroll_summary, _resolve_branch_and_company

TARGET_THEME_KEY = "danielito-agapita"
OUT_DIR = Path(__file__).resolve().parent / "_payroll_dry_run"

supabase = get_supabase()


def upsert_attendance_day(employee_id, branch_id, day, clock_in_hour, hours, break_minutes):
    clock_in = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=clock_in_hour)
    clock_out = clock_in + timedelta(hours=hours + break_minutes / 60)

    existing = (
        hr_table("attendance_logs")
        .select("id")
        .eq("employee_id", employee_id)
        .eq("date", day.isoformat())
        .execute()
        .data
    )
    if existing:
        log_id = existing[0]["id"]
        hr_table("attendance_logs").update(
            {
                "clock_in": clock_in.isoformat(),
                "clock_out": clock_out.isoformat(),
                "hours_worked": hours,
                "status": "completed",
            }
        ).eq("id", log_id).execute()
    else:
        log_id = (
            hr_table("attendance_logs")
            .insert(
                {
                    "employee_id": employee_id,
                    "branch_id": branch_id,
                    "clock_in": clock_in.isoformat(),
                    "clock_out": clock_out.isoformat(),
                    "date": day.isoformat(),
                    "hours_worked": hours,
                    "status": "completed",
                }
            )
            .execute()
            .data[0]["id"]
        )

    existing_break = (
        hr_table("attendance_breaks").select("id").eq("attendance_log_id", log_id).execute().data
    )
    if not existing_break and break_minutes > 0:
        break_start = clock_in + timedelta(hours=hours / 2)
        break_end = break_start + timedelta(minutes=break_minutes)
        hr_table("attendance_breaks").insert(
            {
                "attendance_log_id": log_id,
                "break_start": break_start.isoformat(),
                "break_end": break_end.isoformat(),
            }
        ).execute()

    return log_id


def main():
    branch_result = (
        supabase.table("branches").select("id, name").eq("theme_key", TARGET_THEME_KEY).single().execute()
    )
    branch = branch_result.data
    branch_id = branch["id"]

    profile_result = (
        supabase.table("profiles")
        .select("id, full_name, employee_number, position, pay_rate, branch_id")
        .eq("branch_id", branch_id)
        .eq("role", "employee")
        .limit(1)
        .single()
        .execute()
    )
    employee = profile_result.data
    print(f"Seeding attendance for {employee['full_name']} ({employee['employee_number']}) at {branch['name']}")

    if not employee.get("pay_rate"):
        supabase.table("profiles").update({"pay_rate": 75.0}).eq("id", employee["id"]).execute()
        employee["pay_rate"] = 75.0
        print("  pay_rate was unset - defaulted to PHP 75.00/hr for this dry run")

    today = date.today()
    period_end = today - timedelta(days=1)
    period_start = period_end - timedelta(days=13)

    seeded_days = 0
    d = period_start
    while d <= period_end:
        if d.weekday() < 6:  # skip Sundays, everything else is a work day for this dry run
            upsert_attendance_day(employee["id"], branch_id, d, clock_in_hour=9, hours=8.0, break_minutes=60)
            seeded_days += 1
        d += timedelta(days=1)
    print(f"  seeded {seeded_days} attendance days from {period_start} to {period_end}")

    summary = _compute_payroll_summary(supabase, branch_id, period_start, period_end)
    row = next((r for r in summary["rows"] if r["employee_id"] == employee["id"]), None)
    if not row:
        print("ERROR: no payroll row computed for this employee - aborting PDF generation")
        return
    print(f"  computed: {row['hours_worked']}h x PHP {row['pay_rate']}/hr = PHP {row['total_pay']}")

    branch_name, company_name = _resolve_branch_and_company(branch_id)
    pdf_bytes = _build_employee_payslip_bytes(
        employee=employee,
        branch_name=branch_name,
        company_name=company_name,
        period_start=period_start,
        period_end=period_end,
        hours_worked=row["hours_worked"],
        pay_rate=row["pay_rate"],
        total_pay=row["total_pay"],
    )

    OUT_DIR.mkdir(exist_ok=True)
    out_path = OUT_DIR / f"payslip_{employee['employee_number']}_{period_start}_{period_end}.pdf"
    out_path.write_bytes(pdf_bytes)
    print(f"  PDF generated OK: {len(pdf_bytes):,} bytes -> {out_path}")


if __name__ == "__main__":
    main()
