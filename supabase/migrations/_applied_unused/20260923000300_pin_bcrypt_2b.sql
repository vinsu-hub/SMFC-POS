-- pgcrypto's crypt() cannot verify '$2b$' bcrypt hashes (what the Python backend writes; all existing
-- kiosk PINs use it). '$2b$' and '$2a$' are algorithmically identical for short ASCII secrets like PINs,
-- so normalise the prefix before comparing.
create or replace function public._verify_caller_pin(p_employee_number text, p_pin text) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare h text;
begin
  select regexp_replace(kiosk_pin_hash, '^\$2b\$', '$2a$') into h from profiles
  where id = auth.uid() and employee_number = p_employee_number and kiosk_pin_hash is not null;
  return h is not null and crypt(p_pin, h) = h;
end $$;
