-- Discount types, configurable per branch by managers/executives, applied
-- as POS checkout buttons. Senior/PWD are legally VAT-exempt (RA 9994 /
-- RA 10754) in addition to the percentage off, so vat_exempt is a first
-- class flag rather than something inferred from the discount's name.
create table discount_types (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null,
  percentage numeric not null check (percentage >= 0 and percentage <= 100),
  vat_exempt boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, name)
);

create index idx_discount_types_branch on discount_types(branch_id);

alter table discount_types enable row level security;

create policy "Branch members read own branch discount types"
  on discount_types for select
  using (
    branch_id = (select branch_id from profiles where id = auth.uid())
    or (select role from profiles where id = auth.uid()) = 'executive'
  );

create policy "Managers create own branch discount types"
  on discount_types for insert
  with check (
    (
      branch_id = (select branch_id from profiles where id = auth.uid())
      and (select role from profiles where id = auth.uid()) = 'manager'
    )
    or (select role from profiles where id = auth.uid()) = 'executive'
  );

create policy "Managers update own branch discount types"
  on discount_types for update
  using (
    (
      branch_id = (select branch_id from profiles where id = auth.uid())
      and (select role from profiles where id = auth.uid()) = 'manager'
    )
    or (select role from profiles where id = auth.uid()) = 'executive'
  );

alter publication supabase_realtime add table discount_types;

-- Transactions: discount, owner's-request, and void audit trail.
-- transaction_status already has an unused 'voided' value (0001) - reused
-- here rather than adding a new enum value.
alter table transactions add column discount_type_id uuid references discount_types(id) on delete set null;
alter table transactions add column discount_amount numeric not null default 0;
-- tax was previously never persisted anywhere (only computed client-side) -
-- stored here for receipts/audit only, deliberately NOT folded into
-- total_amount so existing revenue math in summary.py doesn't shift.
alter table transactions add column tax_amount numeric not null default 0;
alter table transactions add column is_owner_request boolean not null default false;
alter table transactions add column owner_request_by uuid references profiles(id) on delete set null;
alter table transactions add column owner_request_note text;
alter table transactions add column voided_by uuid references profiles(id) on delete set null;
alter table transactions add column voided_at timestamptz;
alter table transactions add column void_reason text;
