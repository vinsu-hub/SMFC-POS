-- HR Attendance, Payroll, and Flags
-- (docs/backend-execution-plan.md §2 tables: attendance_logs, hr_flags)
-- Plus profiles extensions for pay_rate

-- Extend profiles for payroll
alter table profiles add column if not exists pay_rate numeric default 0;
alter table profiles add column if not exists position text;
alter table profiles add column if not exists payroll_schedule text default 'biweekly';

-- Attendance logs
create table attendance_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  clock_in timestamptz not null,
  clock_out timestamptz,
  date date not null default current_date,
  hours_worked numeric,
  status text default 'active' check (status in ('active','completed','absent','late')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_attendance_employee on attendance_logs(employee_id);
create index idx_attendance_branch on attendance_logs(branch_id);
create index idx_attendance_date on attendance_logs(date);
create index idx_attendance_status on attendance_logs(status);

-- HR flags (planned in backend-execution-plan.md line 61)
create table hr_flags (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  pattern_type text not null check (pattern_type in ('lateness','absence','overtime','other')),
  description text not null,
  resolved boolean default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null
);

create index idx_hr_flags_employee on hr_flags(employee_id);
create index idx_hr_flags_branch on hr_flags(branch_id);
create index idx_hr_flags_resolved on hr_flags(resolved);

-- RLS
alter table attendance_logs enable row level security;
alter table hr_flags enable row level security;

-- attendance_logs policies
create policy "Employees read own attendance"
  on attendance_logs for select
  using (
    employee_id = auth.uid()
    or branch_id = (select branch_id from profiles where id = auth.uid() and role = 'manager')
    or (select role from profiles where id = auth.uid()) = 'executive'
  );

create policy "Employees clock in/out for themselves"
  on attendance_logs for insert
  with check (
    employee_id = auth.uid()
    and (select role from profiles where id = auth.uid()) in ('employee','manager')
  );

create policy "Employees update own attendance (clock out)"
  on attendance_logs for update
  using (
    employee_id = auth.uid()
    or branch_id = (select branch_id from profiles where id = auth.uid() and role = 'manager')
    or (select role from profiles where id = auth.uid()) = 'executive'
  )
  with check (
    employee_id = auth.uid()
    or branch_id = (select branch_id from profiles where id = auth.uid() and role = 'manager')
    or (select role from profiles where id = auth.uid()) = 'executive'
  );

-- hr_flags policies
create policy "Managers/Executives read HR flags for branch"
  on hr_flags for select
  using (
    branch_id = (select branch_id from profiles where id = auth.uid() and role = 'manager')
    or (select role from profiles where id = auth.uid()) = 'executive'
  );

create policy "Managers/Executives insert HR flags"
  on hr_flags for insert
  with check (
    branch_id = (select branch_id from profiles where id = auth.uid() and role = 'manager')
    or (select role from profiles where id = auth.uid()) = 'executive'
  );

create policy "Managers/Executives update HR flags"
  on hr_flags for update
  using (
    branch_id = (select branch_id from profiles where id = auth.uid() and role = 'manager')
    or (select role from profiles where id = auth.uid()) = 'executive'
  );

-- Realtime
alter publication supabase_realtime add table attendance_logs;
alter publication supabase_realtime add table hr_flags;