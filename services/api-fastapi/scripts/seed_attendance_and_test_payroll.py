"""Seeds ~2 weeks of realistic attendance_logs (+ lunch breaks) for every
employee and manager across all real branches, then generates a real
payslip PDF for one of them via the same code path as
GET /branches/{id}/payroll/{employee}/receipt.pdf, saved to disk for a
manual look — a payroll "dry run" to confirm the PDF template renders
correctly against real-shaped data, and that every branch has something to
show when an executive picks it in HR Attendance/Payroll.

Run with: uv run python scripts/seed_attendance_and_test_payroll.py
"""

import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.deps import get_supabase
from app.attendance_utils import hr_table
from app.routers.hr import _build_employee_payslip_bytes, _compute_payroll_summary, _resolve_branch_and_company

OUT_DIR = Path(__file__).resolve().parent / "_payroll_dry_run"
PDF_SAMPLE_THEME_KEYS = {"danielito-agapita", "malaya-pitx", "isabelas-agapita"}

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


def seed_employee(employee, branch_id, period_start, period_end, pay_rate_default):
    if not employee.get("pay_rate"):
        supabase.table("profiles").update({"pay_rate": pay_rate_default}).eq("id", employee["id"]).execute()
        employee["pay_rate"] = pay_rate_default

    seeded_days = 0
    d = period_start
    while d <= period_end:
        if d.weekday() < 6:  # skip Sundays
            upsert_attendance_day(employee["id"], branch_id, d, clock_in_hour=9, hours=8.0, break_minutes=60)
            seeded_days += 1
        d += timedelta(days=1)
    return seeded_days


def main():
    branches = (
        supabase.table("branches")
        .select("id, name, theme_key")
        .not_.is_("theme_key", "null")
        .execute()
        .data
    )
    # Only the 12 real post-restructure locations (theme_key has a hyphen,
    # e.g. "danielito-agapita") - skip legacy pre-restructure rows.
    branches = [b for b in branches if "-" in (b["theme_key"] or "")]

    today = date.today()
    period_end = today - timedelta(days=1)
    period_start = period_end - timedelta(days=13)

    OUT_DIR.mkdir(exist_ok=True)
    pdf_count = 0

    for branch in branches:
        branch_id = branch["id"]
        profiles = (
            supabase.table("profiles")
            .select("id, full_name, employee_number, position, pay_rate, branch_id, role")
            .eq("branch_id", branch_id)
            .in_("role", ["employee", "manager"])
            .execute()
            .data
        )
        if not profiles:
            print(f"SKIP {branch['name']} - no employee/manager profiles found")
            continue

        print(f"{branch['name']} ({len(profiles)} staff)")
        for profile in profiles:
            default_rate = 90.0 if profile["role"] == "manager" else 75.0
            days = seed_employee(profile, branch_id, period_start, period_end, default_rate)
            print(f"  {profile['full_name']} ({profile['employee_number']}, {profile['role']}) - {days} days seeded")

        summary = _compute_payroll_summary(supabase, branch_id, period_start, period_end)
        print(f"  branch total: {summary['total_hours']}h, PHP {summary['total_pay']}, {summary['employee_count']} staff")

        if branch["theme_key"] in PDF_SAMPLE_THEME_KEYS and summary["rows"]:
            row = summary["rows"][0]
            employee = next(p for p in profiles if p["id"] == row["employee_id"])
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
            out_path = OUT_DIR / f"payslip_{employee['employee_number']}_{period_start}_{period_end}.pdf"
            out_path.write_bytes(pdf_bytes)
            print(f"  PDF sample generated: {len(pdf_bytes):,} bytes -> {out_path}")
            pdf_count += 1

    print(f"\nDone. Seeded {len(branches)} branches, generated {pdf_count} sample PDFs.")


if __name__ == "__main__":
    main()
