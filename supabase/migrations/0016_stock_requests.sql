-- Stock requests: a branch can ask another branch for stock without moving
-- inventory immediately. Deliberately NOT modeled as a transfers.status value
-- because creating a transfers row immediately deducts stock (see
-- routers/transfers.py create_transfer) — a request must not touch stock
-- until the source branch approves and converts it into a real transfer.

create table stock_requests (
  id uuid primary key default gen_random_uuid(),
  requesting_branch_id uuid not null references branches(id) on delete cascade,
  source_branch_id uuid not null references branches(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  status text not null default 'pending' check (status in ('pending','fulfilled','declined','cancelled')),
  requested_by uuid not null references profiles(id) on delete restrict,
  notes text,
  transfer_id uuid references transfers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_stock_requests_source on stock_requests(source_branch_id);
create index idx_stock_requests_requesting on stock_requests(requesting_branch_id);
create index idx_stock_requests_status on stock_requests(status);

alter table stock_requests enable row level security;

create policy "Branch members read own or source-side requests"
  on stock_requests for select
  using (
    requesting_branch_id = (select branch_id from profiles where id = auth.uid())
    or source_branch_id = (select branch_id from profiles where id = auth.uid())
    or (select role from profiles where id = auth.uid()) = 'executive'
  );

create policy "Branch members create requests from own branch"
  on stock_requests for insert
  with check (
    requesting_branch_id = (select branch_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('employee','manager')
  );

create policy "Source branch updates request status"
  on stock_requests for update
  using (source_branch_id = (select branch_id from profiles where id = auth.uid()))
  with check (source_branch_id = (select branch_id from profiles where id = auth.uid()));

alter publication supabase_realtime add table stock_requests;
