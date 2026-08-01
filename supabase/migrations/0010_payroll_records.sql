-- Payroll persistence
-- Was documented as delivered in 0009 but never created; POST /hr/payroll,
-- GET /hr/payroll, and GET /hr/payroll/{id}/print depend on these tables
-- to persist a generated payroll run instead of only computing it ad-hoc.

create table payroll_records (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  total_hours numeric not null default 0,
  total_pay numeric not null default 0,
  employee_count integer not null default 0,
  generated_by uuid not null references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_payroll_records_branch on payroll_records(branch_id);
create index idx_payroll_records_period on payroll_records(period_start, period_end);

create table payroll_items (
  id uuid primary key default gen_random_uuid(),
  payroll_record_id uuid not null references payroll_records(id) on delete cascade,
  employee_id uuid not null references profiles(id) on delete cascade,
  employee_name text not null,
  position text,
  hours_worked numeric not null default 0,
  pay_rate numeric not null default 0,
  total_pay numeric not null default 0,
  created_at timestamptz not null default now()
);

create index idx_payroll_items_record on payroll_items(payroll_record_id);
create index idx_payroll_items_employee on payroll_items(employee_id);

-- RLS
alter table payroll_records enable row level security;
alter table payroll_items enable row level security;

create policy "Managers/Executives read payroll records for branch"
  on payroll_records for select
  using (
    branch_id = (select branch_id from profiles where id = auth.uid() and role = 'manager')
    or (select role from profiles where id = auth.uid()) = 'executive'
  );

create policy "Managers/Executives insert payroll records"
  on payroll_records for insert
  with check (
    branch_id = (select branch_id from profiles where id = auth.uid() and role = 'manager')
    or (select role from profiles where id = auth.uid()) = 'executive'
  );

create policy "Managers/Executives read payroll items for their branch's records"
  on payroll_items for select
  using (
    exists (
      select 1 from payroll_records pr
      where pr.id = payroll_record_id
      and (
        pr.branch_id = (select branch_id from profiles where id = auth.uid() and role = 'manager')
        or (select role from profiles where id = auth.uid()) = 'executive'
      )
    )
  );

create policy "Managers/Executives insert payroll items for their branch's records"
  on payroll_items for insert
  with check (
    exists (
      select 1 from payroll_records pr
      where pr.id = payroll_record_id
      and (
        pr.branch_id = (select branch_id from profiles where id = auth.uid() and role = 'manager')
        or (select role from profiles where id = auth.uid()) = 'executive'
      )
    )
  );
