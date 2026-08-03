-- Same additive breakdown columns on payroll_items so a persisted payroll
-- run keeps an accurate line-item record even if pay_multiplier_rules
-- change later.

alter table hr.payroll_items
  add column regular_pay numeric,
  add column overtime_pay numeric,
  add column holiday_pay numeric,
  add column night_diff_pay numeric,
  add column regular_hours numeric,
  add column overtime_hours numeric,
  add column night_diff_hours numeric;
