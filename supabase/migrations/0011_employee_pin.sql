-- Employee PIN for the Staff Clock kiosk app.
-- The kiosk has no Supabase session (it's a shared walk-up device), so it can't
-- rely on RLS/auth.uid() like the main dashboard. Instead the FastAPI backend
-- verifies employee_number + pin_hash with its service-role key and performs
-- clock-in/out on the employee's behalf via dedicated /attendance/kiosk/* routes.

alter table profiles add column if not exists employee_number text unique;
alter table profiles add column if not exists pin_hash text;

comment on column profiles.employee_number is 'Short numeric/ID code employees enter on the Staff Clock kiosk (distinct from their login email).';
comment on column profiles.pin_hash is 'bcrypt hash of the employee''s kiosk PIN. Never exposed to any client; only compared server-side in FastAPI.';
