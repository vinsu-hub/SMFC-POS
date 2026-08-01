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

    hours_worked = compute_hours_worked(row["id"], clock_in_time, clock_out_time)

    hr_table("attendance_logs").update(
        {
            "clock_out": clock_out_time.isoformat(),
            "hours_worked": hours_worked,
            "status": "completed",
            "auto_closed": True,
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
