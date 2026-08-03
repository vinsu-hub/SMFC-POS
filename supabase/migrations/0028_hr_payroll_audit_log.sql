-- Payroll-scoped audit trail (not a generic app-wide audit system) -- covers
-- holiday CRUD, pay-rule changes, engine toggle, override create/approve,
-- and pay-rate edits. Written only by the backend's service-role client;
-- clients never insert directly, so there is no insert policy for
-- authenticated/anon roles.

create table hr.payroll_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index idx_payroll_audit_log_branch on hr.payroll_audit_log(branch_id);
create index idx_payroll_audit_log_entity on hr.payroll_audit_log(entity_type, entity_id);
create index idx_payroll_audit_log_created on hr.payroll_audit_log(created_at);

alter table hr.payroll_audit_log enable row level security;

create policy "Managers/Executives read audit log"
  on hr.payroll_audit_log for select
  using (
    branch_id is null
    or branch_id = (select branch_id from public.profiles where id = auth.uid() and role = 'manager')
    or (select role from public.profiles where id = auth.uid()) = 'executive'
  );
