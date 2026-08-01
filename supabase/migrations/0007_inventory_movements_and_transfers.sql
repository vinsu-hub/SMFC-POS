-- Inventory movements (trans_in, trans_out, delivery, transfer_in, transfer_out)
-- and inter-branch transfers (docs/backend-execution-plan.md §2 + extended).

create type movement_type as enum (
  'trans_in',      -- received from supplier / external
  'trans_out',     -- removed / written off / donated
  'delivery',      -- internal delivery received
  'transfer_in',   -- received from another branch (paired with transfer_out)
  'transfer_out'   -- sent to another branch (paired with transfer_in)
);

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  type movement_type not null,
  quantity numeric not null check (quantity > 0),
  reason text,
  reference_id uuid, -- links to transfers.id for transfer_in/out
  employee_id uuid not null references profiles(id) on delete restrict,
  unit_cost_snapshot numeric, -- cost at time of movement for valuation
  created_at timestamptz not null default now()
);

create index idx_inventory_movements_branch on inventory_movements(branch_id);
create index idx_inventory_movements_ingredient on inventory_movements(ingredient_id);
create index idx_inventory_movements_type on inventory_movements(type);
create index idx_inventory_movements_reference on inventory_movements(reference_id);

-- Inter-branch transfers
create table transfers (
  id uuid primary key default gen_random_uuid(),
  from_branch_id uuid not null references branches(id) on delete cascade,
  to_branch_id uuid not null references branches(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  status text not null default 'pending' check (status in ('pending','confirmed','rejected','cancelled')),
  initiated_by uuid not null references profiles(id) on delete restrict,
  confirmed_by uuid references profiles(id) on delete set null,
  initiated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  notes text
);

create index idx_transfers_from_branch on transfers(from_branch_id);
create index idx_transfers_to_branch on transfers(to_branch_id);
create index idx_transfers_status on transfers(status);
create index idx_transfers_ingredient on transfers(ingredient_id);

-- RLS: branch-scoped access (managers see their branch, executives see all)
alter table inventory_movements enable row level security;
alter table transfers enable row level security;

-- inventory_movements policies
create policy "Managers read own branch movements"
  on inventory_movements for select
  using (
    branch_id in (
      select id from branches where id = branch_id
    ) and
    auth.uid() in (
      select id from profiles where role = 'manager' and branch_id = inventory_movements.branch_id
      union
      select id from profiles where role = 'executive'
    )
  );

create policy "Managers insert movements for own branch"
  on inventory_movements for insert
  with check (
    auth.uid() in (
      select id from profiles where role in ('employee','manager') and branch_id = inventory_movements.branch_id
      union
      select id from profiles where role = 'executive'
    )
  );

-- transfers policies
create policy "Managers read transfers involving own branch"
  on transfers for select
  using (
    (from_branch_id = (select branch_id from profiles where id = auth.uid()) and (select role from profiles where id = auth.uid()) = 'manager')
    or (to_branch_id = (select branch_id from profiles where id = auth.uid()) and (select role from profiles where id = auth.uid()) = 'manager')
    or (select role from profiles where id = auth.uid()) = 'executive'
  );

create policy "Managers initiate transfers from own branch"
  on transfers for insert
  with check (
    from_branch_id = (select branch_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('employee','manager')
  );

create policy "Managers confirm transfers to own branch"
  on transfers for update
  using (
    to_branch_id = (select branch_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('employee','manager')
  )
  with check (
    to_branch_id = (select branch_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('employee','manager')
  );

-- Realtime publication
alter publication supabase_realtime add table inventory_movements;
alter publication supabase_realtime add table transfers;