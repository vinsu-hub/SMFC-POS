-- Found via browser testing: two near-simultaneous clock-in requests for the
-- same employee (e.g. a kiosk's offline queue replaying after a flaky
-- reconnect fires the browser's 'online' event twice) can both pass the
-- application-level "no open shift today" check before either insert
-- commits, creating two attendance_logs rows for the same shift -- which
-- would double-count hours in payroll. Enforce it at the database level
-- instead of trusting the check-then-insert in kiosk.py alone.

create unique index attendance_logs_one_open_shift_per_day
  on hr.attendance_logs (employee_id, date)
  where status in ('working', 'on_break');
