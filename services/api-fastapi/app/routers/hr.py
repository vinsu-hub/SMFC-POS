import bcrypt
import io
import re
import secrets
import zipfile
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from datetime import date, datetime, timezone
from typing import Optional

from app.auth import CurrentUser, get_current_user, require_branch_access
from app.deps import get_supabase
from app.attendance_utils import auto_close_stale_attendance, compute_attendance_breakdown, compute_hours_worked, hr_table
from app.payroll_pdf import build_payslip_pdf
from app.schemas import (
    ClockInRequest,
    ClockOutRequest,
    AttendanceLogResponse,
    EmployeeCreate,
    EmployeeCreatedResponse,
    EmployeeResponse,
    EmployeeUpdate,
    HolidayCreate,
    HolidayResponse,
    HolidayUpdate,
    PayMultiplierRuleResponse,
    PayMultiplierRuleUpdate,
    PayrollAuditLogResponse,
    PayrollOverrideCreate,
    PayrollOverrideResponse,
    PayrollRow,
    PayrollRuleSettingsResponse,
    PayrollRuleSettingsUpdate,
    PayrollSummary,
    PayrollGenerateRequest,
    PayrollRecordResponse,
    SetPinRequest,
)

router = APIRouter(tags=["hr"])

# Same defaults used across scripts/seed_demo.py and the kiosk - this system
# hands out a shared demo password/PIN convention rather than one-off random
# credentials, so a manager-created account behaves identically to a seeded one.
_DEFAULT_PASSWORD = "demo1234"
_DEFAULT_PIN = "1234"
_DEFAULT_PIN_HASH = bcrypt.hashpw(_DEFAULT_PIN.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


@router.post("/attendance/clock-in", response_model=AttendanceLogResponse)
def clock_in(
    body: ClockInRequest, user: CurrentUser = Depends(get_current_user)
):
    """Employee clocks in for their shift."""
    # Employee can only clock in for themselves (unless manager/executive)
    if body.employee_id != user.id and user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Cannot clock in another employee")

    require_branch_access(user, body.branch_id)

    auto_close_stale_attendance(body.branch_id)

    # Check if already clocked in today
    existing = (
        hr_table("attendance_logs")
        .select("id")
        .eq("employee_id", body.employee_id)
        .eq("date", date.today().isoformat())
        .in_("status", ["working", "on_break"])
        .maybe_single()
        .execute()
    )
    if existing and existing.data:
        raise HTTPException(status_code=400, detail="Already clocked in today")

    insert_result = (
        hr_table("attendance_logs")
        .insert(
            {
                "employee_id": body.employee_id,
                "branch_id": body.branch_id,
                "clock_in": datetime.now(timezone.utc).isoformat(),
                "date": date.today().isoformat(),
                "status": "working",
            }
        )
        .execute()
    )
    return insert_result.data[0]


@router.post("/attendance/clock-out", response_model=AttendanceLogResponse)
def clock_out(
    body: ClockOutRequest, user: CurrentUser = Depends(get_current_user)
):
    """Employee clocks out."""
    if body.employee_id != user.id and user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Cannot clock out another employee")

    # Find open attendance log
    existing = (
        hr_table("attendance_logs")
        .select("*")
        .eq("employee_id", body.employee_id)
        .eq("date", date.today().isoformat())
        .in_("status", ["working", "on_break"])
        .maybe_single()
        .execute()
    )
    if not existing or not existing.data:
        raise HTTPException(status_code=400, detail="No active clock-in found for today")

    if user.role == "manager":
        require_branch_access(user, existing.data["branch_id"])

    if existing.data["status"] == "on_break":
        raise HTTPException(status_code=400, detail="End your break before clocking out")

    clock_in_time = datetime.fromisoformat(existing.data["clock_in"].replace("Z", "+00:00"))
    if clock_in_time.tzinfo is None:
        clock_in_time = clock_in_time.replace(tzinfo=timezone.utc)
    clock_out_time = datetime.now(timezone.utc)
    breakdown = compute_attendance_breakdown(
        existing.data["id"],
        clock_in_time,
        clock_out_time,
        existing.data["branch_id"],
        existing.data.get("is_rest_day", False),
    )

    update_result = (
        hr_table("attendance_logs")
        .update(
            {
                "clock_out": clock_out_time.isoformat(),
                "status": "completed",
                **breakdown,
            }
        )
        .eq("id", existing.data["id"])
        .execute()
    )
    return update_result.data[0]


@router.get("/attendance/me", response_model=AttendanceLogResponse | None)
def get_my_attendance(
    user: CurrentUser = Depends(get_current_user),
):
    """Get current user's active attendance log (for time clock face)."""
    result = (
        hr_table("attendance_logs")
        .select("*")
        .eq("employee_id", user.id)
        .eq("date", date.today().isoformat())
        .order("created_at", desc=True)
        .limit(1)
        .maybe_single()
        .execute()
    )
    return result.data


@router.get("/branches/{branch_id}/attendance", response_model=list[AttendanceLogResponse])
def get_branch_attendance(
    branch_id: str,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    user: CurrentUser = Depends(get_current_user),
):
    """Manager/Executive view of branch attendance."""
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")
    if user.role == "manager":
        require_branch_access(user, branch_id)

    auto_close_stale_attendance(branch_id)

    query = hr_table("attendance_logs").select("*").eq("branch_id", branch_id)
    if date_from:
        query = query.gte("date", date_from.isoformat())
    if date_to:
        query = query.lte("date", date_to.isoformat())
    result = query.order("clock_in", desc=True).execute()
    return result.data


def _get_engine_enabled() -> bool:
    result = hr_table("payroll_rule_settings").select("engine_enabled").limit(1).maybe_single().execute()
    return bool(result and result.data and result.data.get("engine_enabled"))


def _get_pay_multiplier_rules() -> dict[str, dict]:
    result = hr_table("pay_multiplier_rules").select("*").execute()
    return {r["scenario_key"]: r for r in (result.data or [])}


_FLAT_RULE = {"first_8hr_pct": 100.0, "ot_addon_pct": 0.0, "night_diff_addon_pct": 0.0}


def _compute_pay_breakdown(
    regular_hours: float, overtime_hours: float, night_diff_hours: float, pay_rate: float, rule: dict
) -> dict:
    """DOLE-style breakdown for one attendance log. regular_pay already bakes
    in the scenario's holiday/rest-day premium (first_8hr_pct); holiday_pay is
    reported separately as just the premium portion above a flat 100% rate,
    for display on the summary card / payslip line item."""
    first_8hr_pct = float(rule.get("first_8hr_pct", 100))
    ot_addon_pct = float(rule.get("ot_addon_pct", 0))
    night_diff_addon_pct = float(rule.get("night_diff_addon_pct", 0))

    regular_pay = regular_hours * pay_rate * (first_8hr_pct / 100)
    overtime_pay = overtime_hours * pay_rate * (first_8hr_pct / 100) * (1 + ot_addon_pct / 100)
    night_diff_pay = night_diff_hours * pay_rate * (night_diff_addon_pct / 100)
    holiday_pay = max(regular_pay - (regular_hours * pay_rate), 0.0)
    total_pay = regular_pay + overtime_pay + night_diff_pay

    return {
        "regular_pay": round(regular_pay, 2),
        "overtime_pay": round(overtime_pay, 2),
        "night_diff_pay": round(night_diff_pay, 2),
        "holiday_pay": round(holiday_pay, 2),
        "total_pay": round(total_pay, 2),
    }


def _compute_payroll_summary(supabase, branch_id: str, date_from: date, date_to: date) -> dict:
    """Aggregate attendance hours x pay_rate for a branch over a date range.
    Shared by the read-only summary endpoint and payroll generation (POST /hr/payroll),
    which persists the same computation into payroll_records/payroll_items.

    Runs the auto-close sweep first: an open (working/on_break) row has
    hours_worked=null, which the sum below silently treats as 0 — without
    this, a stuck-open shift quietly underpays that employee with no error,
    instead of being flagged auto_closed for a manager to review.

    When hr.payroll_rule_settings.engine_enabled is false, this reproduces
    the original flat hours*rate calculation exactly (zero regression risk).
    When true, it applies the DOLE holiday/OT/night-diff multiplier engine
    using each log's persisted day_scenario/regular_hours/overtime_hours/
    night_diff_hours (pre-migration rows with these columns still null are
    treated as regular_day / all-hours-regular, matching pre-engine output).
    """
    auto_close_stale_attendance(branch_id)
    engine_enabled = _get_engine_enabled()
    rules = _get_pay_multiplier_rules() if engine_enabled else {}

    attendance_result = (
        hr_table("attendance_logs")
        .select("*")
        .eq("branch_id", branch_id)
        .gte("date", date_from.isoformat())
        .lte("date", date_to.isoformat())
        .execute()
    )
    attendance_logs = attendance_result.data

    overrides_by_log: dict[str, list[dict]] = {}
    pending_overrides = 0
    if engine_enabled and attendance_logs:
        log_ids = [log["id"] for log in attendance_logs]
        overrides_result = hr_table("payroll_overrides").select("*").in_("attendance_log_id", log_ids).execute()
        for o in overrides_result.data or []:
            overrides_by_log.setdefault(o["attendance_log_id"], []).append(o)
            if not o.get("approved_by"):
                pending_overrides += 1

    employees_result = (
        supabase.table("profiles")
        .select("id, full_name, pay_rate, position, branch_id")
        .eq("branch_id", branch_id)
        .execute()
    )
    employees = {e["id"]: e for e in employees_result.data}

    attendance_complete = all(log.get("hours_worked") is not None for log in attendance_logs)
    holiday_configured = True
    if engine_enabled:
        holiday_check = (
            hr_table("holidays")
            .select("id")
            .gte("holiday_date", date_from.isoformat())
            .lte("holiday_date", date_to.isoformat())
            .execute()
        )
        holiday_configured = bool(holiday_check.data) or not any(
            log.get("day_scenario") in ("regular_holiday", "regular_holiday_rest_day", "special_non_working", "special_non_working_rest_day", "special_working")
            for log in attendance_logs
        )

    employee_agg: dict[str, dict] = {}
    for log in attendance_logs:
        emp_id = log["employee_id"]
        agg = employee_agg.setdefault(
            emp_id, {"hours": 0.0, "regular_hours": 0.0, "overtime_hours": 0.0, "night_diff_hours": 0.0,
                      "regular_pay": 0.0, "overtime_pay": 0.0, "night_diff_pay": 0.0, "holiday_pay": 0.0, "total_pay": 0.0}
        )
        hours = float(log.get("hours_worked", 0) or 0)
        agg["hours"] += hours

        emp = employees.get(emp_id, {})
        rate = float(emp.get("pay_rate", 0) or 0)

        if not engine_enabled:
            agg["total_pay"] += round(hours * rate, 2)
            continue

        applied = dict(log)
        for override in overrides_by_log.get(log["id"], []):
            if override.get("approved_by"):
                applied[override["field"]] = override["new_value"]

        regular_hours = float(applied.get("regular_hours") if applied.get("regular_hours") is not None else hours)
        overtime_hours = float(applied.get("overtime_hours") or 0)
        night_diff_hours = float(applied.get("night_diff_hours") or 0)
        scenario = applied.get("day_scenario") or "regular_day"
        rule = rules.get(scenario, _FLAT_RULE)

        breakdown = _compute_pay_breakdown(regular_hours, overtime_hours, night_diff_hours, rate, rule)
        agg["regular_hours"] += regular_hours
        agg["overtime_hours"] += overtime_hours
        agg["night_diff_hours"] += night_diff_hours
        agg["regular_pay"] += breakdown["regular_pay"]
        agg["overtime_pay"] += breakdown["overtime_pay"]
        agg["night_diff_pay"] += breakdown["night_diff_pay"]
        agg["holiday_pay"] += breakdown["holiday_pay"]
        agg["total_pay"] += breakdown["total_pay"]

    rows = []
    total_pay = 0.0
    total_hours = 0.0
    for emp_id, agg in employee_agg.items():
        emp = employees.get(emp_id, {})
        rate = float(emp.get("pay_rate", 0) or 0)
        row = {
            "employee_id": emp_id,
            "employee_name": emp.get("full_name") or "Unknown",
            "position": emp.get("position") or "",
            "branch_id": branch_id,
            "hours_worked": round(agg["hours"], 2),
            "pay_rate": rate,
            "total_pay": round(agg["total_pay"], 2),
            "period_start": date_from.isoformat(),
            "period_end": date_to.isoformat(),
        }
        if engine_enabled:
            row.update(
                {
                    "regular_hours": round(agg["regular_hours"], 2),
                    "overtime_hours": round(agg["overtime_hours"], 2),
                    "night_diff_hours": round(agg["night_diff_hours"], 2),
                    "holiday_pay": round(agg["holiday_pay"], 2),
                    "overtime_pay": round(agg["overtime_pay"], 2),
                    "night_diff_pay": round(agg["night_diff_pay"], 2),
                    "regular_pay": round(agg["regular_pay"], 2),
                }
            )
        rows.append(row)
        total_pay += row["total_pay"]
        total_hours += agg["hours"]

    return {
        "branch_id": branch_id,
        "period_start": date_from.isoformat(),
        "period_end": date_to.isoformat(),
        "rows": rows,
        "total_hours": round(total_hours, 2),
        "total_pay": round(total_pay, 2),
        "employee_count": len(rows),
        "engine_enabled": engine_enabled,
        "validation": {
            "attendance_complete": attendance_complete,
            "holiday_configured": holiday_configured,
            "pending_overrides": pending_overrides,
        },
    }


@router.get("/branches/{branch_id}/attendance/summary", response_model=PayrollSummary)
def get_payroll_summary(
    branch_id: str,
    date_from: date = Query(...),
    date_to: date = Query(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Preview payroll for a branch over a date range (not persisted)."""
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")
    if user.role == "manager":
        require_branch_access(user, branch_id)

    supabase = get_supabase()
    return _compute_payroll_summary(supabase, branch_id, date_from, date_to)


def _resolve_branch_and_company(branch_id: str) -> tuple[str, str]:
    supabase = get_supabase()
    branch_result = (
        supabase.table("branches")
        .select("name, organization_id")
        .eq("id", branch_id)
        .maybe_single()
        .execute()
    )
    if not branch_result or not branch_result.data:
        raise HTTPException(status_code=404, detail="Branch not found")
    branch_name = branch_result.data["name"]

    company_name = branch_name
    org_id = branch_result.data.get("organization_id")
    if org_id:
        org_result = supabase.table("organizations").select("name").eq("id", org_id).maybe_single().execute()
        if org_result and org_result.data:
            company_name = org_result.data["name"]
    return branch_name, company_name


def _fetch_employee_attendance_rows(employee_id: str, date_from: date, date_to: date) -> list[dict]:
    """Daily attendance_logs + attendance_breaks for one employee/period, shaped
    for build_payslip_pdf. payroll_records/items never persist this detail —
    it's always recomputed live from hr.attendance_logs/attendance_breaks.
    """
    logs = (
        hr_table("attendance_logs")
        .select("*")
        .eq("employee_id", employee_id)
        .gte("date", date_from.isoformat())
        .lte("date", date_to.isoformat())
        .order("date")
        .execute()
        .data
    )
    log_ids = [l["id"] for l in logs]
    breaks_by_log: dict[str, list[dict]] = {lid: [] for lid in log_ids}
    if log_ids:
        breaks = hr_table("attendance_breaks").select("*").in_("attendance_log_id", log_ids).execute().data
        for b in breaks:
            breaks_by_log.setdefault(b["attendance_log_id"], []).append(b)

    return [
        {
            "date": log["date"],
            "clock_in": log["clock_in"],
            "clock_out": log["clock_out"],
            "hours_worked": log["hours_worked"],
            "status": log["status"],
            "auto_closed": log["auto_closed"],
            "breaks": breaks_by_log.get(log["id"], []),
        }
        for log in logs
    ]


def _compute_employee_breakdown(employee_id: str, period_start: date, period_end: date, pay_rate: float) -> dict:
    """Same engine-flag-aware breakdown as _compute_payroll_summary, scoped to
    one employee's own attendance logs -- used by the single-receipt and
    bulk-ZIP payslip PDF endpoints so payslips reflect the same math as the
    Payroll page."""
    logs = (
        hr_table("attendance_logs")
        .select("*")
        .eq("employee_id", employee_id)
        .gte("date", period_start.isoformat())
        .lte("date", period_end.isoformat())
        .execute()
        .data
    )
    hours_worked = round(sum(float(l.get("hours_worked") or 0) for l in logs), 2)

    engine_enabled = _get_engine_enabled()
    if not engine_enabled:
        return {"hours_worked": hours_worked, "total_pay": round(hours_worked * pay_rate, 2)}

    rules = _get_pay_multiplier_rules()
    overrides_by_log: dict[str, list[dict]] = {}
    log_ids = [l["id"] for l in logs]
    if log_ids:
        overrides_result = hr_table("payroll_overrides").select("*").in_("attendance_log_id", log_ids).execute()
        for o in overrides_result.data or []:
            overrides_by_log.setdefault(o["attendance_log_id"], []).append(o)

    totals = {"regular_hours": 0.0, "overtime_hours": 0.0, "night_diff_hours": 0.0,
              "regular_pay": 0.0, "overtime_pay": 0.0, "night_diff_pay": 0.0, "holiday_pay": 0.0, "total_pay": 0.0}
    for log in logs:
        applied = dict(log)
        for override in overrides_by_log.get(log["id"], []):
            if override.get("approved_by"):
                applied[override["field"]] = override["new_value"]
        hours = float(log.get("hours_worked") or 0)
        regular_hours = float(applied.get("regular_hours") if applied.get("regular_hours") is not None else hours)
        overtime_hours = float(applied.get("overtime_hours") or 0)
        night_diff_hours = float(applied.get("night_diff_hours") or 0)
        rule = rules.get(applied.get("day_scenario") or "regular_day", _FLAT_RULE)
        breakdown = _compute_pay_breakdown(regular_hours, overtime_hours, night_diff_hours, pay_rate, rule)
        totals["regular_hours"] += regular_hours
        totals["overtime_hours"] += overtime_hours
        totals["night_diff_hours"] += night_diff_hours
        totals["regular_pay"] += breakdown["regular_pay"]
        totals["overtime_pay"] += breakdown["overtime_pay"]
        totals["night_diff_pay"] += breakdown["night_diff_pay"]
        totals["holiday_pay"] += breakdown["holiday_pay"]
        totals["total_pay"] += breakdown["total_pay"]

    return {"hours_worked": hours_worked, **{k: round(v, 2) for k, v in totals.items()}}


def _fetch_hr_signatory() -> tuple[str | None, bytes | None]:
    """HR approving signatory name + e-signature image for the payslip
    template (PayrollSettings -> Payslip Layout). Missing row/path/download
    failure all degrade to (None, None) -- the payslip still prints fine
    with a blank signature line, same as before this feature existed.
    """
    settings = (
        hr_table("payroll_rule_settings")
        .select("hr_signatory_name, hr_signature_path")
        .limit(1)
        .maybe_single()
        .execute()
    )
    data = settings.data if settings else None
    if not data:
        return None, None
    name = data.get("hr_signatory_name")
    path = data.get("hr_signature_path")
    if not path:
        return name, None
    try:
        image_bytes = get_supabase().storage.from_("payroll-signatures").download(path)
    except Exception:
        image_bytes = None
    return name, image_bytes


def _build_employee_payslip_bytes(
    employee: dict,
    branch_name: str,
    company_name: str,
    period_start: date,
    period_end: date,
    hours_worked: float,
    pay_rate: float,
    total_pay: float,
    breakdown: dict | None = None,
    hr_signatory_name: str | None = None,
    hr_signature_image: bytes | None = None,
) -> bytes:
    attendance_rows = _fetch_employee_attendance_rows(employee["id"], period_start, period_end)
    breakdown = breakdown or {}
    return build_payslip_pdf(
        employee=employee,
        branch_name=branch_name,
        company_name=company_name,
        period_start=period_start,
        period_end=period_end,
        hours_worked=hours_worked,
        pay_rate=pay_rate,
        total_pay=total_pay,
        attendance_rows=attendance_rows,
        overtime_hours=breakdown.get("overtime_hours"),
        overtime_pay=breakdown.get("overtime_pay"),
        night_diff_hours=breakdown.get("night_diff_hours"),
        night_diff_pay=breakdown.get("night_diff_pay"),
        holiday_pay=breakdown.get("holiday_pay"),
        hr_signatory_name=hr_signatory_name,
        hr_signature_image=hr_signature_image,
    )


@router.get("/branches/{branch_id}/payroll/{employee_id}/receipt.pdf")
def get_payroll_receipt_pdf(
    branch_id: str,
    employee_id: str,
    period_start: date = Query(...),
    period_end: date = Query(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Real PDF payslip for one employee: header, pay summary, and a full
    daily time-log table (clock in/out, breaks, auto-closed flag). Branch and
    company name are resolved from branch_id here, not the caller's own
    branch, so an executive printing another branch's receipt gets that
    branch's real name rather than their own.
    """
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")
    if user.role == "manager":
        require_branch_access(user, branch_id)

    supabase = get_supabase()
    auto_close_stale_attendance(branch_id)

    profile_result = (
        supabase.table("profiles")
        .select("id, full_name, employee_number, position, pay_rate, branch_id")
        .eq("id", employee_id)
        .maybe_single()
        .execute()
    )
    if not profile_result or not profile_result.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    profile = profile_result.data
    if profile["branch_id"] != branch_id:
        raise HTTPException(status_code=400, detail="Employee does not belong to this branch")

    branch_name, company_name = _resolve_branch_and_company(branch_id)
    attendance_rows = _fetch_employee_attendance_rows(employee_id, period_start, period_end)
    pay_rate = float(profile.get("pay_rate") or 0)
    breakdown = _compute_employee_breakdown(employee_id, period_start, period_end, pay_rate)
    signatory_name, signature_image = _fetch_hr_signatory()

    pdf_bytes = build_payslip_pdf(
        employee=profile,
        branch_name=branch_name,
        company_name=company_name,
        period_start=period_start,
        period_end=period_end,
        hours_worked=breakdown["hours_worked"],
        pay_rate=pay_rate,
        total_pay=breakdown["total_pay"],
        attendance_rows=attendance_rows,
        overtime_hours=breakdown.get("overtime_hours"),
        overtime_pay=breakdown.get("overtime_pay"),
        night_diff_hours=breakdown.get("night_diff_hours"),
        night_diff_pay=breakdown.get("night_diff_pay"),
        holiday_pay=breakdown.get("holiday_pay"),
        hr_signatory_name=signatory_name,
        hr_signature_image=signature_image,
    )
    safe_name = (profile.get("full_name") or "employee").replace(" ", "_")
    filename = f"payslip_{safe_name}_{period_start}_{period_end}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/branches/{branch_id}/payroll/receipts.zip")
def get_payroll_receipts_zip(
    branch_id: str,
    period_start: date = Query(...),
    period_end: date = Query(...),
    user: CurrentUser = Depends(get_current_user),
):
    """One PDF payslip per employee for a branch/period, bundled into a ZIP —
    replaces the old client-side loop that opened a window.open popup per
    employee, which browsers block after the first one in the same tick.
    """
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")
    if user.role == "manager":
        require_branch_access(user, branch_id)

    supabase = get_supabase()
    summary = _compute_payroll_summary(supabase, branch_id, period_start, period_end)
    branch_name, company_name = _resolve_branch_and_company(branch_id)

    employee_ids = [row["employee_id"] for row in summary["rows"]]
    employee_numbers: dict[str, str | None] = {}
    if employee_ids:
        profiles_result = (
            supabase.table("profiles").select("id, employee_number").in_("id", employee_ids).execute()
        )
        employee_numbers = {p["id"]: p.get("employee_number") for p in profiles_result.data}

    signatory_name, signature_image = _fetch_hr_signatory()
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for row in summary["rows"]:
            employee = {
                "id": row["employee_id"],
                "full_name": row["employee_name"],
                "position": row["position"],
                "employee_number": employee_numbers.get(row["employee_id"]),
            }
            pdf_bytes = _build_employee_payslip_bytes(
                employee=employee,
                branch_name=branch_name,
                company_name=company_name,
                period_start=period_start,
                period_end=period_end,
                hours_worked=row["hours_worked"],
                pay_rate=row["pay_rate"],
                total_pay=row["total_pay"],
                breakdown=row,
                hr_signatory_name=signatory_name,
                hr_signature_image=signature_image,
            )
            safe_name = row["employee_name"].replace(" ", "_")
            zf.writestr(f"payslip_{safe_name}.pdf", pdf_bytes)

    filename = f"payroll_receipts_{branch_name.replace(' ', '_')}_{period_start}_{period_end}.zip"
    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/payroll", response_model=PayrollRecordResponse)
def generate_payroll(
    body: PayrollGenerateRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Generate and persist a payroll run for a branch/period."""
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")
    if user.role == "manager":
        require_branch_access(user, body.branch_id)

    supabase = get_supabase()
    summary = _compute_payroll_summary(supabase, body.branch_id, body.period_start, body.period_end)

    record_result = (
        hr_table("payroll_records")
        .insert(
            {
                "branch_id": body.branch_id,
                "period_start": body.period_start.isoformat(),
                "period_end": body.period_end.isoformat(),
                "total_hours": summary["total_hours"],
                "total_pay": summary["total_pay"],
                "employee_count": summary["employee_count"],
                "generated_by": user.id,
            }
        )
        .execute()
    )
    record = record_result.data[0]

    items = []
    if summary["rows"]:
        items_result = (
            hr_table("payroll_items")
            .insert(
                [
                    {
                        "payroll_record_id": record["id"],
                        "employee_id": row["employee_id"],
                        "employee_name": row["employee_name"],
                        "position": row["position"],
                        "hours_worked": row["hours_worked"],
                        "pay_rate": row["pay_rate"],
                        "total_pay": row["total_pay"],
                        "regular_hours": row.get("regular_hours"),
                        "overtime_hours": row.get("overtime_hours"),
                        "night_diff_hours": row.get("night_diff_hours"),
                        "regular_pay": row.get("regular_pay"),
                        "overtime_pay": row.get("overtime_pay"),
                        "holiday_pay": row.get("holiday_pay"),
                        "night_diff_pay": row.get("night_diff_pay"),
                    }
                    for row in summary["rows"]
                ]
            )
            .execute()
        )
        items = items_result.data

    record["items"] = items
    return record


@router.get("/payroll", response_model=list[PayrollRecordResponse])
def list_payroll_records(
    branch_id: str = Query(...),
    limit: int = Query(50, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    """List past payroll runs for a branch."""
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")
    if user.role == "manager":
        require_branch_access(user, branch_id)

    result = (
        hr_table("payroll_records")
        .select("*")
        .eq("branch_id", branch_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    records = result.data
    for record in records:
        record["items"] = []
    return records


@router.get("/payroll/{payroll_id}/print", response_model=PayrollRecordResponse)
def get_payroll_for_print(
    payroll_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Fetch a payroll run with its line items for receipt printing."""
    record_result = (
        hr_table("payroll_records")
        .select("*")
        .eq("id", payroll_id)
        .maybe_single()
        .execute()
    )
    if not record_result or not record_result.data:
        raise HTTPException(status_code=404, detail="Payroll record not found")
    record = record_result.data

    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")
    if user.role == "manager":
        require_branch_access(user, record["branch_id"])

    items_result = (
        hr_table("payroll_items")
        .select("*")
        .eq("payroll_record_id", payroll_id)
        .execute()
    )
    record["items"] = items_result.data
    return record


def _write_audit_log(
    actor_id: str,
    branch_id: str | None,
    action: str,
    entity_type: str,
    entity_id: str | None,
    old_value: dict | None = None,
    new_value: dict | None = None,
    reason: str | None = None,
) -> None:
    """Payroll-scoped audit trail -- called from every holiday/pay-rule/
    settings/override write below. Backend-only insert (service-role client);
    no client ever writes this table directly."""
    hr_table("payroll_audit_log").insert(
        {
            "actor_id": actor_id,
            "branch_id": branch_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "old_value": old_value,
            "new_value": new_value,
            "reason": reason,
        }
    ).execute()


# --- Holiday calendar ---


@router.get("/hr/holidays", response_model=list[HolidayResponse])
def list_holidays(
    year: int = Query(...),
    branch_id: str | None = Query(None),
    user: CurrentUser = Depends(get_current_user),
):
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")

    result = (
        hr_table("holidays")
        .select("*")
        .gte("holiday_date", f"{year}-01-01")
        .lte("holiday_date", f"{year}-12-31")
        .order("holiday_date")
        .execute()
    )
    rows = result.data or []
    if user.role == "manager":
        rows = [r for r in rows if r["branch_scope"] is None or r["branch_scope"] == user.branch_id]
    elif branch_id:
        rows = [r for r in rows if r["branch_scope"] is None or r["branch_scope"] == branch_id]
    return rows


@router.post("/hr/holidays", response_model=HolidayResponse)
def create_holiday(body: HolidayCreate, user: CurrentUser = Depends(get_current_user)):
    if user.role != "executive":
        raise HTTPException(status_code=403, detail="Executive access required")

    payload = body.model_dump(mode="json")
    result = hr_table("holidays").insert(payload).execute()
    row = result.data[0]
    _write_audit_log(user.id, body.branch_scope, "create", "holiday", row["id"], new_value=payload)
    return row


@router.patch("/hr/holidays/{holiday_id}", response_model=HolidayResponse)
def update_holiday(holiday_id: str, body: HolidayUpdate, user: CurrentUser = Depends(get_current_user)):
    if user.role != "executive":
        raise HTTPException(status_code=403, detail="Executive access required")

    existing = hr_table("holidays").select("*").eq("id", holiday_id).maybe_single().execute()
    if not existing or not existing.data:
        raise HTTPException(status_code=404, detail="Holiday not found")

    payload = {k: v for k, v in body.model_dump(mode="json").items() if v is not None}
    result = hr_table("holidays").update(payload).eq("id", holiday_id).execute()
    row = result.data[0]
    _write_audit_log(user.id, row.get("branch_scope"), "update", "holiday", holiday_id, old_value=existing.data, new_value=payload)
    return row


@router.delete("/hr/holidays/{holiday_id}")
def delete_holiday(holiday_id: str, user: CurrentUser = Depends(get_current_user)):
    if user.role != "executive":
        raise HTTPException(status_code=403, detail="Executive access required")

    existing = hr_table("holidays").select("*").eq("id", holiday_id).maybe_single().execute()
    if not existing or not existing.data:
        raise HTTPException(status_code=404, detail="Holiday not found")

    hr_table("holidays").delete().eq("id", holiday_id).execute()
    _write_audit_log(user.id, existing.data.get("branch_scope"), "delete", "holiday", holiday_id, old_value=existing.data)
    return {"deleted": True}


# --- Pay multiplier rules + engine settings ---


@router.get("/hr/pay-rules", response_model=list[PayMultiplierRuleResponse])
def list_pay_rules(user: CurrentUser = Depends(get_current_user)):
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")
    result = hr_table("pay_multiplier_rules").select("*").order("scenario_key").execute()
    return result.data


@router.patch("/hr/pay-rules/{scenario_key}", response_model=PayMultiplierRuleResponse)
def update_pay_rule(scenario_key: str, body: PayMultiplierRuleUpdate, user: CurrentUser = Depends(get_current_user)):
    if user.role != "executive":
        raise HTTPException(status_code=403, detail="Executive access required")

    existing = hr_table("pay_multiplier_rules").select("*").eq("scenario_key", scenario_key).maybe_single().execute()
    if not existing or not existing.data:
        raise HTTPException(status_code=404, detail="Scenario not found")

    payload = {k: v for k, v in body.model_dump(mode="json").items() if v is not None}
    payload["updated_by"] = user.id
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = hr_table("pay_multiplier_rules").update(payload).eq("scenario_key", scenario_key).execute()
    row = result.data[0]
    _write_audit_log(user.id, None, "update", "pay_multiplier_rule", row["id"], old_value=existing.data, new_value=payload, reason=f"scenario={scenario_key}")
    return row


@router.get("/hr/payroll-settings", response_model=PayrollRuleSettingsResponse)
def get_payroll_settings(user: CurrentUser = Depends(get_current_user)):
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")
    result = (
        hr_table("payroll_rule_settings")
        .select("engine_enabled, hr_signatory_name, hr_signature_path")
        .limit(1)
        .maybe_single()
        .execute()
    )
    return result.data or {"engine_enabled": False}


@router.patch("/hr/payroll-settings", response_model=PayrollRuleSettingsResponse)
def update_payroll_settings(body: PayrollRuleSettingsUpdate, user: CurrentUser = Depends(get_current_user)):
    if user.role != "executive":
        raise HTTPException(status_code=403, detail="Executive access required")

    existing = hr_table("payroll_rule_settings").select("*").limit(1).maybe_single().execute()
    if not existing or not existing.data:
        raise HTTPException(status_code=404, detail="Payroll settings row missing")

    payload = {k: v for k, v in body.model_dump(mode="json").items() if v is not None}
    payload["updated_by"] = user.id
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = hr_table("payroll_rule_settings").update(payload).eq("id", existing.data["id"]).execute()
    row = result.data[0]
    _write_audit_log(user.id, None, "update", "payroll_rule_settings", row["id"], old_value=existing.data, new_value=payload)
    return row


# --- Payroll overrides ---


@router.post("/hr/payroll-overrides", response_model=PayrollOverrideResponse)
def create_payroll_override(body: PayrollOverrideCreate, user: CurrentUser = Depends(get_current_user)):
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")

    log_result = hr_table("attendance_logs").select("*").eq("id", body.attendance_log_id).maybe_single().execute()
    if not log_result or not log_result.data:
        raise HTTPException(status_code=404, detail="Attendance log not found")
    log = log_result.data
    if user.role == "manager":
        require_branch_access(user, log["branch_id"])

    old_value = log.get(body.field)
    payload = {
        "attendance_log_id": body.attendance_log_id,
        "field": body.field,
        "old_value": str(old_value) if old_value is not None else None,
        "new_value": body.new_value,
        "reason": body.reason,
        "requested_by": user.id,
    }
    result = hr_table("payroll_overrides").insert(payload).execute()
    row = result.data[0]
    _write_audit_log(user.id, log["branch_id"], "create", "payroll_override", row["id"], old_value={body.field: old_value}, new_value={body.field: body.new_value}, reason=body.reason)
    return row


@router.patch("/hr/payroll-overrides/{override_id}/approve", response_model=PayrollOverrideResponse)
def approve_payroll_override(override_id: str, user: CurrentUser = Depends(get_current_user)):
    if user.role != "executive":
        raise HTTPException(status_code=403, detail="Executive access required")

    existing = hr_table("payroll_overrides").select("*").eq("id", override_id).maybe_single().execute()
    if not existing or not existing.data:
        raise HTTPException(status_code=404, detail="Override not found")

    payload = {"approved_by": user.id, "approved_at": datetime.now(timezone.utc).isoformat()}
    result = hr_table("payroll_overrides").update(payload).eq("id", override_id).execute()
    row = result.data[0]
    log = hr_table("attendance_logs").select("branch_id").eq("id", row["attendance_log_id"]).maybe_single().execute()
    _write_audit_log(user.id, (log.data or {}).get("branch_id"), "approve", "payroll_override", override_id, new_value=payload)
    return row


# --- Audit log ---


@router.get("/hr/payroll-audit-log", response_model=list[PayrollAuditLogResponse])
def list_payroll_audit_log(
    branch_id: str | None = Query(None),
    entity_type: str | None = Query(None),
    limit: int = Query(100, le=500),
    user: CurrentUser = Depends(get_current_user),
):
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")

    query = hr_table("payroll_audit_log").select("*")
    if user.role == "manager":
        query = query.or_(f"branch_id.eq.{user.branch_id},branch_id.is.null")
    elif branch_id:
        query = query.or_(f"branch_id.eq.{branch_id},branch_id.is.null")
    if entity_type:
        query = query.eq("entity_type", entity_type)
    result = query.order("created_at", desc=True).limit(limit).execute()
    return result.data


def _attach_emails(profiles: list[dict]) -> list[dict]:
    """profiles has no email column — it lives on auth.users. EmployeeResponse
    requires email, so merge it in from the auth admin API rather than selecting
    a column that doesn't exist (get_employees previously did `select(...email...)`
    and 500'd on every call).
    """
    if not profiles:
        return profiles
    supabase = get_supabase()
    ids = {p["id"] for p in profiles}
    users_by_id = {u.id: u.email for u in supabase.auth.admin.list_users() if u.id in ids}
    for p in profiles:
        p["email"] = users_by_id.get(p["id"], "")
    return profiles


@router.get("/employees", response_model=list[EmployeeResponse])
def get_employees(
    branch_id: str = Query(...),
    user: CurrentUser = Depends(get_current_user),
):
    """List employees for a branch (manager/executive)."""
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")
    if user.role == "manager":
        require_branch_access(user, branch_id)

    supabase = get_supabase()
    result = (
        supabase.table("profiles")
        .select("id, full_name, role, branch_id, pay_rate, position, payroll_schedule")
        .eq("branch_id", branch_id)
        .execute()
    )
    return _attach_emails(result.data)


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", ".", name.lower()).strip(".")
    return slug or "employee"


@router.post("/employees", response_model=EmployeeCreatedResponse)
def create_employee(
    body: EmployeeCreate,
    user: CurrentUser = Depends(get_current_user),
):
    """Manager/executive creates a new employee or manager account for a
    branch - reuses the same Supabase Auth admin-user-creation pattern as
    scripts/seed_demo.py's upsert_user (get_supabase() is a service-role
    client with .auth.admin access from a router the same as from a script).
    """
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")
    require_branch_access(user, body.branch_id)

    supabase = get_supabase()

    branch_result = (
        supabase.table("branches").select("theme_key").eq("id", body.branch_id).maybe_single().execute()
    )
    if not branch_result or not branch_result.data:
        raise HTTPException(status_code=404, detail="Branch not found")
    theme_key = branch_result.data["theme_key"]

    # Generate a unique login email, retrying with a numeric suffix if the
    # branch already has an employee with the same name-derived slug.
    slug = _slugify(body.full_name)
    email = None
    for attempt in range(10):
        candidate = f"{slug}@{theme_key}.com" if attempt == 0 else f"{slug}{attempt + 1}@{theme_key}.com"
        existing_user = next(
            (u for u in supabase.auth.admin.list_users() if u.email == candidate), None
        )
        if not existing_user:
            email = candidate
            break
    if email is None:
        raise HTTPException(status_code=500, detail="Could not generate a unique login email")

    created = supabase.auth.admin.create_user(
        {"email": email, "password": _DEFAULT_PASSWORD, "email_confirm": True}
    )
    user_id = created.user.id

    # Generate a unique employee_number, retrying on conflict.
    employee_number = None
    for _ in range(5):
        candidate = f"EMP-{theme_key.upper()}-{secrets.token_hex(2).upper()}"
        conflict = (
            supabase.table("profiles").select("id").eq("employee_number", candidate).maybe_single().execute()
        )
        if not conflict or not conflict.data:
            employee_number = candidate
            break
    if employee_number is None:
        raise HTTPException(status_code=500, detail="Could not generate a unique employee number")

    supabase.table("profiles").insert(
        {
            "id": user_id,
            "branch_id": body.branch_id,
            "role": body.role,
            "full_name": body.full_name,
            "employee_number": employee_number,
            "kiosk_pin_hash": _DEFAULT_PIN_HASH,
            "position": body.position,
            "pay_rate": body.pay_rate or 0,
        }
    ).execute()

    profile_result = (
        supabase.table("profiles")
        .select("id, full_name, role, branch_id, pay_rate, position, payroll_schedule")
        .eq("id", user_id)
        .single()
        .execute()
    )
    profile = profile_result.data
    profile["email"] = email
    profile["default_password"] = _DEFAULT_PASSWORD
    profile["default_pin"] = _DEFAULT_PIN
    return profile


@router.patch("/employees/{employee_id}", response_model=EmployeeResponse)
def update_employee(
    employee_id: str,
    body: EmployeeUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    """Update employee pay rate, position, etc."""
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")

    supabase = get_supabase()
    # Verify employee exists and belongs to user's branch (if manager)
    existing = (
        supabase.table("profiles")
        .select("branch_id")
        .eq("id", employee_id)
        .maybe_single()
        .execute()
    )
    if not existing or not existing.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    if user.role == "manager" and existing.data["branch_id"] != user.branch_id:
        raise HTTPException(status_code=403, detail="Cannot edit employee from another branch")

    update_data = body.model_dump(exclude_unset=True)
    result = (
        supabase.table("profiles")
        .update(update_data)
        .eq("id", employee_id)
        .execute()
    )
    return _attach_emails(result.data)[0]


@router.get("/hr-flags", response_model=list[dict])
def get_hr_flags(
    branch_id: str | None = Query(None),
    resolved: bool | None = Query(None),
    user: CurrentUser = Depends(get_current_user),
):
    """Get HR flags (manager/executive)."""
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")

    query = hr_table("hr_flags").select("*")
    if branch_id:
        if user.role == "manager":
            require_branch_access(user, branch_id)
        query = query.eq("branch_id", branch_id)
    elif user.role == "manager":
        require_branch_access(user, user.branch_id)
        query = query.eq("branch_id", user.branch_id)
    if resolved is not None:
        query = query.eq("resolved", resolved)
    result = query.order("created_at", desc=True).execute()
    return result.data


@router.post("/hr-flags", response_model=dict)
def create_hr_flag(
    body: dict,
    user: CurrentUser = Depends(get_current_user),
):
    """Create an HR flag (manager/executive)."""
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")

    branch_id = body.get("branch_id")
    if user.role == "manager":
        require_branch_access(user, branch_id)

    result = (
        hr_table("hr_flags")
        .insert(
            {
                "employee_id": body["employee_id"],
                "branch_id": branch_id,
                "pattern_type": body["pattern_type"],
                "description": body["description"],
            }
        )
        .execute()
    )
    return result.data[0]


@router.patch("/hr-flags/{flag_id}/resolve", response_model=dict)
def resolve_hr_flag(
    flag_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Mark an HR flag as resolved."""
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")

    result = (
        hr_table("hr_flags")
        .update({"resolved": True, "resolved_at": datetime.utcnow().isoformat(), "resolved_by": user.id})
        .eq("id", flag_id)
        .execute()
    )
    return result.data[0]


@router.patch("/employees/{employee_id}/pin", response_model=dict)
def set_employee_pin(
    employee_id: str,
    body: SetPinRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Manager/executive sets or resets an employee's kiosk PIN."""
    if user.role not in ("manager", "executive"):
        raise HTTPException(status_code=403, detail="Manager or Executive access required")

    supabase = get_supabase()
    existing = (
        supabase.table("profiles")
        .select("branch_id")
        .eq("id", employee_id)
        .maybe_single()
        .execute()
    )
    if not existing or not existing.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    if user.role == "manager" and existing.data["branch_id"] != user.branch_id:
        raise HTTPException(status_code=403, detail="Cannot edit employee from another branch")

    kiosk_pin_hash = bcrypt.hashpw(body.pin.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    supabase.table("profiles").update({"kiosk_pin_hash": kiosk_pin_hash}).eq("id", employee_id).execute()
    return {"status": "ok"}