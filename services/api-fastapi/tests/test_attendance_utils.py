from datetime import datetime, timezone

from app.attendance_utils import (
    _night_window_overlap_hours,
    scenario_key_for_holiday_type,
    split_regular_and_overtime,
)


def _utc(y, m, d, h, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=timezone.utc)


def test_split_regular_and_overtime_under_8_hours():
    regular, overtime = split_regular_and_overtime(6.5)
    assert regular == 6.5
    assert overtime == 0.0


def test_split_regular_and_overtime_over_8_hours():
    regular, overtime = split_regular_and_overtime(10.25)
    assert regular == 8.0
    assert overtime == 2.25


def test_night_diff_overlap_fully_within_window():
    # 23:00-01:00 UTC == 07:00-09:00 PH local -- not in the 22:00-06:00 PH window.
    # Shift by -8h so the PH-local time actually lands in the night window.
    start = _utc(2026, 1, 1, 14)  # 22:00 PH
    end = _utc(2026, 1, 1, 22)  # 06:00 PH next day boundary
    assert _night_window_overlap_hours(start, end) == 8.0


def test_night_diff_overlap_no_overlap_during_daytime():
    start = _utc(2026, 1, 1, 1)  # 09:00 PH
    end = _utc(2026, 1, 1, 9)  # 17:00 PH
    assert _night_window_overlap_hours(start, end) == 0.0


def test_night_diff_overlap_partial_shift_crossing_midnight():
    # 20:00 PH to 02:00 PH next day (6h shift): only 22:00-02:00 (4h) is night-diff.
    start = _utc(2026, 1, 1, 12)  # 20:00 PH
    end = _utc(2026, 1, 1, 18)  # 02:00 PH next day
    assert _night_window_overlap_hours(start, end) == 4.0


def test_scenario_key_for_holiday_type_regular_holiday():
    assert scenario_key_for_holiday_type("regular_holiday", False) == "regular_holiday"
    assert scenario_key_for_holiday_type("regular_holiday", True) == "regular_holiday_rest_day"


def test_scenario_key_for_holiday_type_special_non_working():
    assert scenario_key_for_holiday_type("special_non_working", False) == "special_non_working"
    assert scenario_key_for_holiday_type("special_non_working", True) == "special_non_working_rest_day"


def test_scenario_key_for_holiday_type_special_working():
    assert scenario_key_for_holiday_type("special_working", False) == "special_working"
    assert scenario_key_for_holiday_type("special_working", True) == "special_working"
