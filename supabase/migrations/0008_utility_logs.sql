-- Utility meter readings per branch per business day
-- (docs/backend-execution-plan.md §2 + extended for start/end readings)

create type utility_type as enum ('electricity', 'water');

create table utility_logs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  utility_type utility_type not null,
  business_date date not null,
  reading_start numeric not null,
  reading_end numeric,
  unit_cost numeric not null, -- cost per unit (kWh, cubic meter, etc.)
  recorded_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  unique (branch_id, utility_type, business_date)
);

create index idx_utility_logs_branch on utility_logs(branch_id);
create index idx_utility_logs_date on utility_logs(business_date);
create index idx_utility_logs_type on utility_logs(utility_type);

-- Computed consumption view
create view utility_consumption as
select
  ul.id,
  ul.branch_id,
  b.name as branch_name,
  ul.utility_type,
  ul.business_date,
  ul.reading_start,
  ul.reading_end,
  (ul.reading_end - ul.reading_start) as consumption,
  ul.unit_cost,
  ((ul.reading_end - ul.reading_start) * ul.unit_cost) as cost,
  ul.recorded_by,
  ul.created_at,
  ul.updated_at
from utility_logs ul
join branches b on b.id = ul.branch_id
where ul.reading_end is not null;

-- RLS
alter table utility_logs enable row level security;

create policy "Managers read own branch utility logs"
  on utility_logs for select
  using (
    branch_id = (select branch_id from profiles where id = auth.uid() and role = 'manager')
    or (select role from profiles where id = auth.uid()) = 'executive'
  );

create policy "Managers insert utility logs for own branch"
  on utility_logs for insert
  with check (
    branch_id = (select branch_id from profiles where id = auth.uid() and role = 'manager')
    or (select role from profiles where id = auth.uid()) = 'executive'
  );

create policy "Managers update utility logs for own branch"
  on utility_logs for update
  using (
    branch_id = (select branch_id from profiles where id = auth.uid() and role = 'manager')
    or (select role from profiles where id = auth.uid()) = 'executive'
  );

-- Realtime
alter publication supabase_realtime add table utility_logs;