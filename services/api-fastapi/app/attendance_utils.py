"""Shared helpers for the hr-schema attendance/payroll tables.

`.schema("hr")` returns an independent postgrest client per call (verified
against the installed supabase-py==2.31.0 — it does not mutate the cached
get_supabase() singleton), so calling it per-request here is safe under
FastAPI's threaded concurrency.
"""

from datetime import datetime, timedelta, timezone

from app.deps import get_supabase

AUTO_CLOSE_STALE_AFTER = timedelta(hours=16)
AUTO_CLOSE_SHIFT_CAP = timedelta(hours=12)

NIGHT_DIFF_START_HOUR = 22  # 10pm
NIGHT_DIFF_END_HOUR = 6  # 6am
REGULAR_HOURS_THRESHOLD = 8.0


def hr_table(name: str):
    return get_supabase().schema("hr").table(name)


def _parse_ts(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def compute_hours_worked(attendance_log_id: str, clock_in_time: datetime, clock_out_time: datetime) -> float:
    """(clock_out - clock_in) minus every completed break on this shift, in hours."""
    breaks = (
        hr_table("attendance_breaks")
        .select("break_start, break_end")
        .eq("attendance_log_id", attendance_log_id)
        .execute()
        .data
    )
    break_seconds = 0.0
    for b in breaks:
        if not b.get("break_end"):
            continue
        break_seconds += (_parse_ts(b["break_end"]) - _parse_ts(b["break_start"])).total_seconds()

    total_seconds = (clock_out_time - clock_in_time).total_seconds() - break_seconds
    return round(max(total_seconds, 0) / 3600, 4)


PH_UTC_OFFSET = timedelta(hours=8)


def split_regular_and_overtime(hours: float) -> tuple[float, float]:
    """First 8 worked hours are regular; anything beyond is overtime."""
    regular = min(hours, REGULAR_HOURS_THRESHOLD)
    overtime = max(hours - REGULAR_HOURS_THRESHOLD, 0.0)
    return round(regular, 4), round(overtime, 4)


def _night_window_overlap_hours(start: datetime, end: datetime) -> float:
    """Hours of [start, end) that fall within 22:00-06:00 Philippine local
    time. Every timestamp in this codebase is stored/compared as true UTC
    (no Asia/Manila conversion exists anywhere else), but night-differential
    hours are legally defined against local clock time, so this is the one
    place that shifts to PH local time before comparing against the window.
    """
    if end <= start:
        return 0.0
    local_start = start + PH_UTC_OFFSET
    local_end = end + PH_UTC_OFFSET

    overlap_seconds = 0.0
    cursor = local_start.replace(hour=0, minute=0, second=0, microsecond=0)
    while cursor <= local_end:
        window_start = cursor.replace(hour=NIGHT_DIFF_START_HOUR, minute=0, second=0, microsecond=0)
        window_end = window_start + timedelta(hours=(24 - NIGHT_DIFF_START_HOUR) + NIGHT_DIFF_END_HOUR)
        overlap_start = max(local_start, window_start)
        overlap_end = min(local_end, window_end)
        if overlap_end > overlap_start:
            overlap_seconds += (overlap_end - overlap_start).total_seconds()
        cursor += timedelta(days=1)
    return overlap_seconds / 3600


def compute_night_diff_hours(attendance_log_id: str, clock_in_time: datetime, clock_out_time: datetime) -> float:
    """Overlap of the worked interval (minus completed breaks) with
    22:00-06:00 Philippine local time, in hours. Handles shifts crossing
    midnight by scanning each day boundary the shift touches."""
    breaks = (
        hr_table("attendance_breaks")
        .select("break_start, break_end")
        .eq("attendance_log_id", attendance_log_id)
        .execute()
        .data
    )
    total = _night_window_overlap_hours(clock_in_time, clock_out_time)
    for b in breaks:
        if not b.get("break_end"):
            continue
        total -= _night_window_overlap_hours(_parse_ts(b["break_start"]), _parse_ts(b["break_end"]))
    return round(max(total, 0.0), 4)


def resolve_day_scenario(branch_id: str, log_date, is_rest_day: bool) -> tuple[str, str | None]:
    """Looks up hr.holidays for log_date (a branch-specific row wins over a
    global row on the same date), then combines with is_rest_day to pick the
    compound scenario key stored in hr.pay_multiplier_rules."""
    holiday_result = (
        hr_table("holidays")
        .select("id, holiday_type, branch_scope")
        .eq("holiday_date", log_date.isoformat() if hasattr(log_date, "isoformat") else log_date)
        .or_(f"branch_scope.eq.{branch_id},branch_scope.is.null")
        .execute()
    )
    rows = holiday_result.data or []
    branch_row = next((r for r in rows if r["branch_scope"] == branch_id), None)
    holiday_row = branch_row or (rows[0] if rows else None)

    if not holiday_row:
        return ("rest_day" if is_rest_day else "regular_day"), None
    return scenario_key_for_holiday_type(holiday_row["holiday_type"], is_rest_day), holiday_row["id"]


def scenario_key_for_holiday_type(holiday_type: str, is_rest_day: bool) -> str:
    """Pure mapping from a hr.holidays.holiday_type + rest-day flag to the
    hr.pay_multiplier_rules.scenario_key it resolves to. Split out from
    resolve_day_scenario so it's unit-testable without a holidays lookup."""
    if holiday_type == "regular_holiday":
        return "regular_holiday_rest_day" if is_rest_day else "regular_holiday"
    if holiday_type == "special_non_working":
        return "special_non_working_rest_day" if is_rest_day else "special_non_working"
    return "special_working"


def compute_attendance_breakdown(
    attendance_log_id: str,
    clock_in_time: datetime,
    clock_out_time: datetime,
    branch_id: str,
    is_rest_day: bool,
) -> dict:
    """Single entry point called from clock_out/_force_close. Reuses
    compute_hours_worked() for gross hours (does not duplicate the break-
    subtraction logic), then layers scenario + OT + night-diff on top."""
    hours_worked = compute_hours_worked(attendance_log_id, clock_in_time, clock_out_time)
    regular_hours, overtime_hours = split_regular_and_overtime(hours_worked)
    night_diff_hours = compute_night_diff_hours(attendance_log_id, clock_in_time, clock_out_time)
    day_scenario, holiday_id = resolve_day_scenario(branch_id, clock_in_time.date(), is_rest_day)
    return {
        "hours_worked": hours_worked,
        "regular_hours": regular_hours,
        "overtime_hours": overtime_hours,
        "night_diff_hours": night_diff_hours,
        "day_scenario": day_scenario,
        "holiday_id": holiday_id,
    }


def _force_close(row: dict) -> None:
    clock_in_time = _parse_ts(row["clock_in"])
    clock_out_time = clock_in_time + AUTO_CLOSE_SHIFT_CAP

    open_break = (
        hr_table("attendance_breaks")
        .select("id")
        .eq("attendance_log_id", row["id"])
        .is_("break_end", "null")
        .maybe_single()
        .execute()
    )
    if open_break and open_break.data:
        hr_table("attendance_breaks").update({"break_end": clock_out_time.isoformat()}).eq(
            "id", open_break.data["id"]
        ).execute()

    breakdown = compute_attendance_breakdown(
        row["id"], clock_in_time, clock_out_time, row["branch_id"], row.get("is_rest_day", False)
    )

    hr_table("attendance_logs").update(
        {
            "clock_out": clock_out_time.isoformat(),
            "status": "completed",
            "auto_closed": True,
            **breakdown,
        }
    ).eq("id", row["id"]).execute()


def auto_close_stale_attendance(branch_id: str) -> None:
    """Force-close any shift left open past a safety cutoff, flagged auto_closed
    so a manager reviews it before it's trusted in a payroll run. No branch-hours
    schema exists to know a real "closing time", so this uses a fixed 16h-stale /
    12h-cap heuristic rather than the spec's "branch closing time + 1 hour".

    Called at every read/write path that could otherwise treat a stuck-open shift
    as contributing 0 hours (payroll) or block a legitimate next clock-in.
    """
    cutoff = (datetime.now(timezone.utc) - AUTO_CLOSE_STALE_AFTER).isoformat()
    stale = (
        hr_table("attendance_logs")
        .select("*")
        .eq("branch_id", branch_id)
        .in_("status", ["working", "on_break"])
        .lt("clock_in", cutoff)
        .execute()
    )
    for row in stale.data:
        _force_close(row)
