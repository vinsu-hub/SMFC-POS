-- HR never hand-edits a computed payroll amount -- they edit attendance or
-- create a logged override (reason + approver required) that feeds back
-- into _compute_payroll_summary. One row per corrected field per shift.

create table hr.payroll_overrides (
  id uuid primary key default gen_random_uuid(),
  attendance_log_id uuid not null references hr.attendance_logs(id) on delete cascade,
  field text not null check (field in ('regular_hours', 'overtime_hours', 'night_diff_hours', 'day_scenario')),
  old_value text,
  new_value text not null,
  reason text not null,
  requested_by uuid not null references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create index idx_payroll_overrides_log on hr.payroll_overrides(attendance_log_id);
create index idx_payroll_overrides_approved on hr.payroll_overrides(approved_by);

alter table hr.payroll_overrides enable row level security;

create policy "Managers/Executives read overrides for branch"
  on hr.payroll_overrides for select
  using (
    exists (
      select 1 from hr.attendance_logs al
      where al.id = attendance_log_id
      and (
        al.branch_id = (select branch_id from public.profiles where id = auth.uid() and role = 'manager')
        or (select role from public.profiles where id = auth.uid()) = 'executive'
      )
    )
  );

create policy "Managers/Executives create overrides for branch"
  on hr.payroll_overrides for insert
  with check (
    exists (
      select 1 from hr.attendance_logs al
      where al.id = attendance_log_id
      and (
        al.branch_id = (select branch_id from public.profiles where id = auth.uid() and role = 'manager')
        or (select role from public.profiles where id = auth.uid()) = 'executive'
      )
    )
  );

create policy "Executives approve overrides"
  on hr.payroll_overrides for update
  using ((select role from public.profiles where id = auth.uid()) = 'executive')
  with check ((select role from public.profiles where id = auth.uid()) = 'executive');
