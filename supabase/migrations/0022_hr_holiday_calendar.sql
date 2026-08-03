-- Holiday calendar for the payroll holiday-pay multiplier engine.
-- branch_scope null = applies org-wide; a branch-specific row lets one
-- branch observe a local closure day without affecting the rest.

create table hr.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  name text not null,
  holiday_type text not null check (holiday_type in ('regular_holiday', 'special_non_working', 'special_working')),
  is_recurring boolean not null default false,
  branch_scope uuid references public.branches(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (holiday_date, branch_scope)
);

create index idx_hr_holidays_date on hr.holidays(holiday_date);
create index idx_hr_holidays_branch on hr.holidays(branch_scope);

alter table hr.holidays enable row level security;

create policy "Managers/Executives read holidays"
  on hr.holidays for select
  using (
    branch_scope is null
    or branch_scope = (select branch_id from public.profiles where id = auth.uid() and role = 'manager')
    or (select role from public.profiles where id = auth.uid()) = 'executive'
  );

create policy "Executives manage holidays"
  on hr.holidays for all
  using ((select role from public.profiles where id = auth.uid()) = 'executive')
  with check ((select role from public.profiles where id = auth.uid()) = 'executive');
