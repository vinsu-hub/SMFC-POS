"""Staff Clock kiosk endpoints.

The kiosk (apps/staff-clock) is a shared walk-up device with no logged-in
Supabase session, so it can't use get_current_user/RLS like the dashboard.
Every mutating call here re-derives the employee from employee_number+PIN
(verify) or an attendance_log_id already returned by a prior verify/clock-in
in the same kiosk visit, and writes via the service-role client. The PIN is
never returned to any client — only bcrypt-compared server-side.
"""

import bcrypt
from datetime import date, datetime, time, timezone
from fastapi import APIRouter, HTTPException
from postgrest.exceptions import APIError

from app.deps import get_supabase
from app.attendance_utils import auto_close_stale_attendance, compute_hours_worked, hr_table
from app.schemas import (
    AttendanceLogResponse,
    KioskBreakRequest,
    KioskClockInRequest,
    KioskClockOutRequest,
    KioskVerifyRequest,
    KioskVerifyResponse,
)

router = APIRouter(tags=["kiosk"])

_INVALID_CREDENTIALS = HTTPException(status_code=401, detail="Employee number or PIN is incorrect")

# No branch-hours schema exists to look up a real per-branch expected start
# time, so lateness detection uses one hardcoded default threshold (MVP scope,
# per the spec's own "simplest fix" framing).
LATE_THRESHOLD = time(9, 15)


def _get_open_attendance(employee_id: str) -> dict | None:
    result = (
        hr_table("attendance_logs")
        .select("*")
        .eq("employee_id", employee_id)
        .eq("date", date.today().isoformat())
        .in_("status", ["working", "on_break"])
        .maybe_single()
        .execute()
    )
    return result.data if result and result.data else None


def _get_completed_today(employee_id: str) -> dict | None:
    result = (
        hr_table("attendance_logs")
        .select("id")
        .eq("employee_id", employee_id)
        .eq("date", date.today().isoformat())
        .eq("status", "completed")
        .maybe_single()
        .execute()
    )
    return result.data if result and result.data else None


def _flag_lateness(employee_id: str, branch_id: str, clock_in_time: datetime) -> None:
    if clock_in_time.astimezone().time() <= LATE_THRESHOLD:
        return
    try:
        hr_table("hr_flags").insert(
            {
                "employee_id": employee_id,
                "branch_id": branch_id,
                "pattern_type": "lateness",
                "description": f"Clocked in at {clock_in_time.astimezone().strftime('%I:%M %p')}",
            }
        ).execute()
    except Exception:
        pass  # best-effort — must never block a real clock-in


@router.post("/kiosk/verify", response_model=KioskVerifyResponse)
def kiosk_verify(body: KioskVerifyRequest):
    supabase = get_supabase()
    result = (
        supabase.table("profiles")
        .select("id, full_name, position, branch_id, photo_url, kiosk_pin_hash")
        .eq("employee_number", body.employee_number)
        .maybe_single()
        .execute()
    )
    if not result or not result.data or not result.data.get("kiosk_pin_hash"):
        raise _INVALID_CREDENTIALS
    profile = result.data
    if not bcrypt.checkpw(body.pin.encode("utf-8"), profile["kiosk_pin_hash"].encode("utf-8")):
        raise _INVALID_CREDENTIALS

    branch_id = profile["branch_id"]

    hr_table("kiosks").upsert(
        {"id": body.kiosk_id, "branch_id": branch_id}, on_conflict="id"
    ).execute()

    auto_close_stale_attendance(branch_id)

    open_row = _get_open_attendance(profile["id"])
    if open_row:
        today_status = open_row["status"]
        attendance_log_id = open_row["id"]
    elif _get_completed_today(profile["id"]):
        today_status = "completed"
        attendance_log_id = None
    else:
        today_status = "not_started"
        attendance_log_id = None

    return {
        "id": profile["id"],
        "full_name": profile["full_name"],
        "photo_url": profile.get("photo_url"),
        "position": profile.get("position"),
        "branch_id": branch_id,
        "today_status": today_status,
        "attendance_log_id": attendance_log_id,
    }


@router.post("/kiosk/clock-in", response_model=AttendanceLogResponse)
def kiosk_clock_in(body: KioskClockInRequest):
    profile_result = (
        get_supabase()
        .table("profiles")
        .select("id, branch_id")
        .eq("id", body.employee_id)
        .maybe_single()
        .execute()
    )
    if not profile_result or not profile_result.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    profile = profile_result.data

    # Double-tap safety: an already-open shift is returned as a no-op.
    existing_open = _get_open_attendance(body.employee_id)
    if existing_open:
        return existing_open

    # Single shift per employee per day — matches the kiosk's terminal
    # "already completed" state, which offers no further action.
    if _get_completed_today(body.employee_id):
        raise HTTPException(status_code=409, detail="Already completed a shift today")

    clock_in_time = datetime.now(timezone.utc)
    try:
        insert_result = (
            hr_table("attendance_logs")
            .insert(
                {
                    "employee_id": body.employee_id,
                    "branch_id": profile["branch_id"],
                    "kiosk_id": body.kiosk_id,
                    "clock_in": clock_in_time.isoformat(),
                    "date": date.today().isoformat(),
                    "status": "working",
                }
            )
            .execute()
        )
    except APIError as e:
        if e.code == "23505":
            # Lost a race against a concurrent clock-in for the same employee
            # (e.g. a flaky kiosk reconnect firing the offline queue twice) —
            # attendance_logs_one_open_shift_per_day caught it. Treat it the
            # same as the double-tap no-op above rather than 500ing.
            existing = _get_open_attendance(body.employee_id)
            if existing:
                return existing
        raise
    row = insert_result.data[0]
    _flag_lateness(body.employee_id, profile["branch_id"], clock_in_time)
    return row


@router.post("/kiosk/break/start", response_model=AttendanceLogResponse)
def kiosk_break_start(body: KioskBreakRequest):
    log_result = (
        hr_table("attendance_logs")
        .select("*")
        .eq("id", body.attendance_log_id)
        .maybe_single()
        .execute()
    )
    if not log_result or not log_result.data:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    row = log_result.data

    if row["status"] == "on_break":
        return row  # double-tap safety
    if row["status"] != "working":
        raise HTTPException(status_code=400, detail=f"Cannot start a break from status '{row['status']}'")

    hr_table("attendance_breaks").insert({"attendance_log_id": row["id"]}).execute()
    update_result = (
        hr_table("attendance_logs")
        .update({"status": "on_break"})
        .eq("id", row["id"])
        .execute()
    )
    return update_result.data[0]


@router.post("/kiosk/break/end", response_model=AttendanceLogResponse)
def kiosk_break_end(body: KioskBreakRequest):
    log_result = (
        hr_table("attendance_logs")
        .select("*")
        .eq("id", body.attendance_log_id)
        .maybe_single()
        .execute()
    )
    if not log_result or not log_result.data:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    row = log_result.data

    open_break = (
        hr_table("attendance_breaks")
        .select("id")
        .eq("attendance_log_id", row["id"])
        .is_("break_end", "null")
        .maybe_single()
        .execute()
    )
    if not open_break or not open_break.data:
        return row  # double-tap safety — no open break to end

    hr_table("attendance_breaks").update(
        {"break_end": datetime.now(timezone.utc).isoformat()}
    ).eq("id", open_break.data["id"]).execute()

    update_result = (
        hr_table("attendance_logs")
        .update({"status": "working"})
        .eq("id", row["id"])
        .execute()
    )
    return update_result.data[0]


@router.post("/kiosk/clock-out", response_model=AttendanceLogResponse)
def kiosk_clock_out(body: KioskClockOutRequest):
    log_result = (
        hr_table("attendance_logs")
        .select("*")
        .eq("id", body.attendance_log_id)
        .maybe_single()
        .execute()
    )
    if not log_result or not log_result.data:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    row = log_result.data

    if row["status"] == "on_break":
        raise HTTPException(status_code=400, detail="End your break before clocking out")
    if row["status"] != "working":
        raise HTTPException(status_code=400, detail=f"Cannot clock out from status '{row['status']}'")

    clock_in_time = datetime.fromisoformat(row["clock_in"].replace("Z", "+00:00"))
    if clock_in_time.tzinfo is None:
        clock_in_time = clock_in_time.replace(tzinfo=timezone.utc)
    clock_out_time = datetime.now(timezone.utc)

    hours_worked = compute_hours_worked(row["id"], clock_in_time, clock_out_time)

    update_result = (
        hr_table("attendance_logs")
        .update(
            {
                "clock_out": clock_out_time.isoformat(),
                "hours_worked": hours_worked,
                "status": "completed",
            }
        )
        .eq("id", row["id"])
        .execute()
    )
    return update_result.data[0]
