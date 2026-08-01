import bcrypt
import io
import zipfile
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from datetime import date, datetime, timezone
from typing import Optional

from app.auth import CurrentUser, get_current_user, require_branch_access
from app.deps import get_supabase
from app.attendance_utils import auto_close_stale_attendance, compute_hours_worked, hr_table
from app.payroll_pdf import build_payslip_pdf
from app.schemas import (
    ClockInRequest,
    ClockOutRequest,
    AttendanceLogResponse,
    EmployeeResponse,
    EmployeeUpdate,
    PayrollRow,
    PayrollSummary,
    PayrollGenerateRequest,
    PayrollRecordResponse,
    SetPinRequest,
)

router = APIRouter(tags=["hr"])


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
    hours_worked = compute_hours_worked(existing.data["id"], clock_in_time, clock_out_time)

    update_result = (
        hr_table("attendance_logs")
        .update(
            {
                "clock_out": clock_out_time.isoformat(),
                "hours_worked": hours_worked,
                "status": "completed",
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


def _compute_payroll_summary(supabase, branch_id: str, date_from: date, date_to: date) -> dict:
    """Aggregate attendance hours x pay_rate for a branch over a date range.
    Shared by the read-only summary endpoint and payroll generation (POST /hr/payroll),
    which persists the same computation into payroll_records/payroll_items.

    Runs the auto-close sweep first: an open (working/on_break) row has
    hours_worked=null, which the sum below silently treats as 0 — without
    this, a stuck-open shift quietly underpays that employee with no error,
    instead of being flagged auto_closed for a manager to review.
    """
    auto_close_stale_attendance(branch_id)

    attendance_result = (
        hr_table("attendance_logs")
        .select("*")
        .eq("branch_id", branch_id)
        .gte("date", date_from.isoformat())
        .lte("date", date_to.isoformat())
        .execute()
    )
    attendance_logs = attendance_result.data

    employees_result = (
        supabase.table("profiles")
        .select("id, full_name, pay_rate, position, branch_id")
        .eq("branch_id", branch_id)
        .execute()
    )
    employees = {e["id"]: e for e in employees_result.data}

    employee_hours = {}
    for log in attendance_logs:
        emp_id = log["employee_id"]
        hours = float(log.get("hours_worked", 0) or 0)
        if emp_id not in employee_hours:
            employee_hours[emp_id] = 0
        employee_hours[emp_id] += hours

    rows = []
    total_pay = 0.0
    total_hours = 0.0
    for emp_id, hours in employee_hours.items():
        emp = employees.get(emp_id, {})
        rate = float(emp.get("pay_rate", 0) or 0)
        pay = round(hours * rate, 2)
        rows.append(
            {
                "employee_id": emp_id,
                "employee_name": emp.get("full_name") or "Unknown",
                "position": emp.get("position") or "",
                "branch_id": branch_id,
                "hours_worked": round(hours, 2),
                "pay_rate": rate,
                "total_pay": pay,
                "period_start": date_from.isoformat(),
                "period_end": date_to.isoformat(),
            }
        )
        total_pay += pay
        total_hours += hours

    return {
        "branch_id": branch_id,
        "period_start": date_from.isoformat(),
        "period_end": date_to.isoformat(),
        "rows": rows,
        "total_hours": round(total_hours, 2),
        "total_pay": round(total_pay, 2),
        "employee_count": len(rows),
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

    company_name = "Saint Michael Food Corp"
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


def _build_employee_payslip_bytes(
    employee: dict,
    branch_name: str,
    company_name: str,
    period_start: date,
    period_end: date,
    hours_worked: float,
    pay_rate: float,
    total_pay: float,
) -> bytes:
    attendance_rows = _fetch_employee_attendance_rows(employee["id"], period_start, period_end)
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
    hours_worked = round(sum(float(r["hours_worked"] or 0) for r in attendance_rows), 2)
    pay_rate = float(profile.get("pay_rate") or 0)
    total_pay = round(hours_worked * pay_rate, 2)

    pdf_bytes = build_payslip_pdf(
        employee=profile,
        branch_name=branch_name,
        company_name=company_name,
        period_start=period_start,
        period_end=period_end,
        hours_worked=hours_worked,
        pay_rate=pay_rate,
        total_pay=total_pay,
        attendance_rows=attendance_rows,
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