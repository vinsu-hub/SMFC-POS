-- DOLE Labor Advisory 12-25 pay-multiplier rules, editable so future DOLE
-- rate changes don't need a deploy, plus the global engine on/off flag
-- (payroll_rule_settings is a deliberate single-row table -- no config-table
-- precedent exists in this codebase, so this is the lightest thing that
-- could work rather than a generic key/value settings table).

create table hr.pay_multiplier_rules (
  id uuid primary key default gen_random_uuid(),
  scenario_key text not null unique check (scenario_key in (
    'regular_day', 'regular_holiday', 'regular_holiday_rest_day',
    'special_non_working', 'special_non_working_rest_day',
    'special_working', 'rest_day'
  )),
  not_worked_pct numeric not null default 0,
  first_8hr_pct numeric not null default 100,
  ot_addon_pct numeric not null default 25,
  night_diff_addon_pct numeric not null default 10,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table hr.payroll_rule_settings (
  id uuid primary key default gen_random_uuid(),
  engine_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into hr.payroll_rule_settings (engine_enabled) values (false);

alter table hr.pay_multiplier_rules enable row level security;
alter table hr.payroll_rule_settings enable row level security;

create policy "Managers/Executives read pay rules"
  on hr.pay_multiplier_rules for select
  using ((select role from public.profiles where id = auth.uid()) in ('manager', 'executive'));

create policy "Executives manage pay rules"
  on hr.pay_multiplier_rules for all
  using ((select role from public.profiles where id = auth.uid()) = 'executive')
  with check ((select role from public.profiles where id = auth.uid()) = 'executive');

create policy "Managers/Executives read payroll settings"
  on hr.payroll_rule_settings for select
  using ((select role from public.profiles where id = auth.uid()) in ('manager', 'executive'));

create policy "Executives manage payroll settings"
  on hr.payroll_rule_settings for all
  using ((select role from public.profiles where id = auth.uid()) = 'executive')
  with check ((select role from public.profiles where id = auth.uid()) = 'executive');
