-- Breakdown columns for the holiday-pay multiplier engine, populated once
-- at clock-out/auto-close time by attendance_utils.compute_attendance_breakdown
-- (same pattern as hours_worked already is -- frozen at write time, not
-- recomputed live). Existing rows stay null and are treated as
-- 'regular_day' by payroll generation, so nothing retroactively changes.

alter table hr.attendance_logs
  add column regular_hours numeric,
  add column overtime_hours numeric,
  add column night_diff_hours numeric,
  add column is_rest_day boolean not null default false,
  add column holiday_id uuid references hr.holidays(id) on delete set null,
  add column day_scenario text check (day_scenario in (
    'regular_day', 'regular_holiday', 'regular_holiday_rest_day',
    'special_non_working', 'special_non_working_rest_day',
    'special_working', 'rest_day'
  ));

create index idx_attendance_logs_holiday on hr.attendance_logs(holiday_id);

comment on column hr.attendance_logs.day_scenario is
  'Snapshotted at clock-out/auto-close time from hr.holidays + is_rest_day, resolving which hr.pay_multiplier_rules row applies. Pre-existing rows are left null and are treated as regular_day by payroll generation for backward compatibility.';
