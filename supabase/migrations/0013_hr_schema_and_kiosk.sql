-- Employee Attendance Kiosk rebuild: isolated `hr` schema, break tracking,
-- kiosk device tracking, and PIN-based punch integrity.
--
-- Moves attendance_logs, hr_flags, payroll_records, payroll_items out of
-- `public` into a new `hr` schema (per spec). Nothing in the dashboard
-- queries these tables directly via supabase-js -- everything goes through
-- FastAPI's service-role client -- so this move needs no new anon/authenticated
-- grants, only service_role grants here plus enabling `hr` in the Supabase
-- project's Data API "Exposed schemas" setting (Dashboard-only, not
-- scriptable -- see SESSION_HANDOFF / plan notes).

create schema if not exists hr;

grant usage on schema hr to service_role;
grant all on all tables in schema hr to service_role;
alter default privileges in schema hr grant all on tables to service_role;

-- Kiosk devices. Rows are lazily upserted by the backend the first time a
-- client-generated kiosk_id is seen -- not manually provisioned.
create table hr.kiosks (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  device_label text,
  created_at timestamptz not null default now()
);

create index idx_kiosks_branch on hr.kiosks(branch_id);

alter table hr.kiosks enable row level security;

create policy "Managers/Executives read kiosks for branch"
  on hr.kiosks for select
  using (
    branch_id = (select branch_id from public.profiles where id = auth.uid() and role = 'manager')
    or (select role from public.profiles where id = auth.uid()) = 'executive'
  );

-- Move existing HR-domain tables into the isolated schema. Data, indexes,
-- constraints, and RLS policies all move with the table.
alter table public.attendance_logs set schema hr;
alter table public.hr_flags set schema hr;
alter table public.payroll_records set schema hr;
alter table public.payroll_items set schema hr;

-- attendance_logs: kiosk traceability + auto-close flag + new status set.
alter table hr.attendance_logs add column kiosk_id uuid references hr.kiosks(id);
alter table hr.attendance_logs add column auto_closed boolean not null default false;

-- Sweep existing status values before tightening the constraint: 'active'
-- becomes the new 'working'; 'absent'/'late' were never actually written by
-- any code path (grep confirms) but are swept defensively so the migration
-- can't fail against unexpected data.
update hr.attendance_logs set status = 'working' where status = 'active';
update hr.attendance_logs set status = 'completed' where status in ('absent', 'late');

alter table hr.attendance_logs drop constraint attendance_logs_status_check;
alter table hr.attendance_logs add constraint attendance_logs_status_check
  check (status in ('working', 'on_break', 'completed'));

create index idx_attendance_logs_kiosk on hr.attendance_logs(kiosk_id);

-- Breaks: one-to-many per shift, so multiple breaks a day just work.
create table hr.attendance_breaks (
  id uuid primary key default gen_random_uuid(),
  attendance_log_id uuid not null references hr.attendance_logs(id) on delete cascade,
  break_start timestamptz not null default now(),
  break_end timestamptz,
  created_at timestamptz not null default now()
);

create index idx_attendance_breaks_log on hr.attendance_breaks(attendance_log_id);

alter table hr.attendance_breaks enable row level security;

create policy "Employees read own breaks"
  on hr.attendance_breaks for select
  using (
    exists (
      select 1 from hr.attendance_logs al
      where al.id = attendance_log_id
      and (
        al.employee_id = auth.uid()
        or al.branch_id = (select branch_id from public.profiles where id = auth.uid() and role = 'manager')
        or (select role from public.profiles where id = auth.uid()) = 'executive'
      )
    )
  );

create policy "Employees insert own breaks"
  on hr.attendance_breaks for insert
  with check (
    exists (
      select 1 from hr.attendance_logs al
      where al.id = attendance_log_id
      and al.employee_id = auth.uid()
      and (select role from public.profiles where id = auth.uid()) in ('employee', 'manager')
    )
  );

create policy "Employees update own breaks (break end)"
  on hr.attendance_breaks for update
  using (
    exists (
      select 1 from hr.attendance_logs al
      where al.id = attendance_log_id
      and (
        al.employee_id = auth.uid()
        or al.branch_id = (select branch_id from public.profiles where id = auth.uid() and role = 'manager')
        or (select role from public.profiles where id = auth.uid()) = 'executive'
      )
    )
  )
  with check (
    exists (
      select 1 from hr.attendance_logs al
      where al.id = attendance_log_id
      and (
        al.employee_id = auth.uid()
        or al.branch_id = (select branch_id from public.profiles where id = auth.uid() and role = 'manager')
        or (select role from public.profiles where id = auth.uid()) = 'executive'
      )
    )
  );

-- Punch integrity: rename the pin column to be kiosk-specific, add photo_url
-- for future use (no photo capture UI in this pass).
alter table public.profiles rename column pin_hash to kiosk_pin_hash;
alter table public.profiles add column if not exists photo_url text;

comment on column public.profiles.kiosk_pin_hash is 'bcrypt hash of the employee''s kiosk PIN, checked in POST /kiosk/verify. Never exposed to any client.';
comment on column public.profiles.photo_url is 'Optional employee photo shown on the kiosk confirmation screen. Not yet populated by any upload flow.';
