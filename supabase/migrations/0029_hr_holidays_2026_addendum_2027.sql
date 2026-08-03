-- Follow-up to 0024: adds the now-proclaimed 2026 Eid dates and the
-- previously-omitted special_working observance days, plus the full 2027
-- PH holiday calendar. special_working rows carry no pay premium (see
-- attendance_utils.scenario_key_for_holiday_type -> 'special_working' ->
-- pay_multiplier_rules row with first_8hr_pct=100) -- they're seeded for
-- Holiday Calendar visibility/record-keeping, not because they change payroll math.

insert into hr.holidays (holiday_date, name, holiday_type, is_recurring) values
  -- 2026 additions
  ('2026-03-20', 'Eid''l Fitr', 'regular_holiday', false),
  ('2026-05-27', 'Eid''l Adha', 'regular_holiday', false),
  ('2026-01-23', 'First Philippine Republic Day', 'special_working', false),
  ('2026-07-27', 'Founding Anniversary of Iglesia ni Cristo', 'special_working', false),
  ('2026-09-03', 'Surrender of General Yamashita Day', 'special_working', false),
  ('2026-09-08', 'Feast of the Nativity of Mary', 'special_working', true),
  ('2026-11-07', 'Sheikh Karim''ul Makhdum Day', 'special_working', false),

  -- 2027 regular holidays
  ('2027-01-01', 'New Year''s Day', 'regular_holiday', true),
  ('2027-03-09', 'Eid''l Fitr', 'regular_holiday', false),
  ('2027-03-25', 'Maundy Thursday', 'regular_holiday', false),
  ('2027-03-26', 'Good Friday', 'regular_holiday', false),
  ('2027-04-09', 'Araw ng Kagitingan', 'regular_holiday', true),
  ('2027-05-01', 'Labor Day', 'regular_holiday', true),
  ('2027-05-16', 'Eid''l Adha', 'regular_holiday', false),
  ('2027-06-12', 'Independence Day', 'regular_holiday', true),
  ('2027-08-30', 'National Heroes Day', 'regular_holiday', false),
  ('2027-11-30', 'Bonifacio Day', 'regular_holiday', true),
  ('2027-12-25', 'Christmas Day', 'regular_holiday', true),
  ('2027-12-30', 'Rizal Day', 'regular_holiday', true),

  -- 2027 special non-working days
  ('2027-02-06', 'Chinese New Year', 'special_non_working', false),
  ('2027-03-27', 'Black Saturday', 'special_non_working', false),
  ('2027-08-21', 'Ninoy Aquino Day', 'special_non_working', true),
  ('2027-11-01', 'All Saints'' Day', 'special_non_working', true),
  ('2027-11-02', 'All Souls'' Day', 'special_non_working', true),
  ('2027-12-08', 'Feast of the Immaculate Conception', 'special_non_working', true),
  ('2027-12-24', 'Christmas Eve', 'special_non_working', true),
  ('2027-12-31', 'Last Day of the Year', 'special_non_working', true),

  -- 2027 special working days / observances
  ('2027-01-23', 'First Philippine Republic Day', 'special_working', false),
  ('2027-02-25', 'EDSA People Power Anniversary', 'special_working', false),
  ('2027-07-27', 'Founding Anniversary of Iglesia ni Cristo', 'special_working', false),
  ('2027-09-03', 'Surrender of General Yamashita Day', 'special_working', false),
  ('2027-09-08', 'Feast of the Nativity of Mary', 'special_working', true),
  ('2027-11-07', 'Sheikh Karim''ul Makhdum Day', 'special_working', false);
