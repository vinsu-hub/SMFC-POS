-- Oishii POS parity on the flat SMFC schema (products.price, recipe_items.product_id).
-- Additive only. Server-side logic lives in 20260923000200_pos_rpcs.sql.
create extension if not exists pgcrypto with schema extensions;

create table public.business_settings (
  id smallint primary key default 1 check (id = 1),
  vat_rate numeric(5,4) not null default 0.12,
  block_unavailable boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
insert into public.business_settings (id) values (1) on conflict do nothing;

create table public.menu_addons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(12,2) not null check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.delivery_fees (
  id uuid primary key default gen_random_uuid(),
  barangay text not null unique,
  zone text not null default '',
  fee numeric(8,2) not null check (fee >= 0)
);

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  name text not null,
  pos_table_number int not null check (pos_table_number > 0),
  capacity int not null default 4 check (capacity > 0),
  capacity_max int,
  active boolean not null default true,
  unique (branch_id, pos_table_number)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  table_id uuid references public.tables (id) on delete set null,
  reservation_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','seated','completed','cancelled','no_show')),
  guest_count int not null default 2,
  customer_name text not null,
  customer_phone text,
  transaction_id uuid,
  seated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.transactions
  add column if not exists payment_method text check (payment_method in ('cash','gcash','card')),
  add column if not exists card_type text check (card_type in ('debit','credit')),
  add column if not exists force_vat_exempt boolean not null default false,
  add column if not exists order_number int,
  add column if not exists related_transaction_id uuid references public.transactions (id) on delete set null;

alter table public.reservations
  add constraint reservations_transaction_fk foreign key (transaction_id) references public.transactions (id) on delete set null;

create table public.reservation_overrides (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete restrict,
  table_id uuid not null references public.tables (id) on delete restrict,
  pos_table_number int not null,
  overridden_by uuid not null references public.profiles (id) on delete restrict,
  reason text not null,
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.transaction_item_addons (
  id uuid primary key default gen_random_uuid(),
  transaction_item_id uuid not null references public.transaction_items (id) on delete cascade,
  addon_id uuid not null references public.menu_addons (id) on delete restrict,
  quantity int not null check (quantity > 0),
  unit_price numeric(12,2) not null
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions (id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  address text,
  landmark text,
  barangay text,
  delivery_fee numeric(8,2)
);

create table public.business_days (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  business_date date not null,
  opened_at timestamptz not null default now(),
  opened_by uuid not null references public.profiles (id) on delete restrict,
  menu_confirmed boolean not null default false,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete restrict,
  cash_register_total numeric(12,2),
  system_eod_total numeric(12,2),
  unique (branch_id, business_date)
);

create table public.idempotency_keys (
  key uuid primary key,
  endpoint text not null,
  resource_id uuid not null,
  created_at timestamptz not null default now()
);

-- Per-branch daily order numbers (starts at 1001), assigned on insert
create table public.transaction_daily_counters (
  branch_id uuid not null references public.branches (id) on delete cascade,
  business_date date not null,
  last_number int not null,
  primary key (branch_id, business_date)
);

with numbered as (
  select id, 1000 + row_number() over (
    partition by branch_id, (opened_at at time zone 'Asia/Manila')::date order by opened_at, id) as n
  from public.transactions
)
update public.transactions t set order_number = numbered.n from numbered where numbered.id = t.id;

insert into public.transaction_daily_counters (branch_id, business_date, last_number)
select branch_id, (opened_at at time zone 'Asia/Manila')::date, max(order_number)
from public.transactions where order_number is not null group by 1, 2;

create or replace function public.assign_transaction_order_number() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare d date := (new.opened_at at time zone 'Asia/Manila')::date; n int;
begin
  insert into transaction_daily_counters (branch_id, business_date, last_number)
  values (new.branch_id, d, 1001)
  on conflict (branch_id, business_date) do update set last_number = transaction_daily_counters.last_number + 1
  returning last_number into n;
  new.order_number := n;
  return new;
end $$;

create trigger trg_assign_order_number before insert on public.transactions
  for each row when (new.order_number is null) execute function public.assign_transaction_order_number();

create unique index idx_transactions_branch_daily_order_number
  on public.transactions (branch_id, ((opened_at at time zone 'Asia/Manila')::date), order_number);
create index on public.reservations (branch_id, reservation_date);
create index on public.transaction_item_addons (transaction_item_id);

-- RLS: reads scoped by branch; writes only via SECURITY DEFINER functions (except manager-managed config)
alter table public.business_settings enable row level security;
alter table public.menu_addons enable row level security;
alter table public.delivery_fees enable row level security;
alter table public.tables enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_overrides enable row level security;
alter table public.transaction_item_addons enable row level security;
alter table public.deliveries enable row level security;
alter table public.business_days enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.transaction_daily_counters enable row level security;

create policy "read settings" on public.business_settings for select to authenticated using (true);
create policy "managers update settings" on public.business_settings for update to authenticated
  using (public.is_manager_plus()) with check (public.is_manager_plus());
create policy "read addons" on public.menu_addons for select to authenticated using (true);
create policy "managers manage addons" on public.menu_addons for all to authenticated
  using (public.is_manager_plus()) with check (public.is_manager_plus());
create policy "read delivery fees" on public.delivery_fees for select to authenticated using (true);
create policy "managers manage delivery fees" on public.delivery_fees for all to authenticated
  using (public.is_manager_plus()) with check (public.is_manager_plus());
create policy "read tables" on public.tables for select to authenticated using (public.can_see_branch(branch_id));
create policy "managers manage tables" on public.tables for all to authenticated
  using (public.is_manager_plus() and public.can_see_branch(branch_id))
  with check (public.is_manager_plus() and public.can_see_branch(branch_id));
create policy "read reservations" on public.reservations for select to authenticated using (public.can_see_branch(branch_id));
create policy "managers manage reservations" on public.reservations for all to authenticated
  using (public.is_manager_plus() and public.can_see_branch(branch_id))
  with check (public.is_manager_plus() and public.can_see_branch(branch_id));
create policy "managers read overrides" on public.reservation_overrides for select to authenticated
  using (public.is_manager_plus());
create policy "read item addons" on public.transaction_item_addons for select to authenticated
  using (exists (select 1 from public.transaction_items ti join public.transactions t on t.id = ti.transaction_id
                 where ti.id = transaction_item_id and public.can_see_branch(t.branch_id)));
create policy "read deliveries" on public.deliveries for select to authenticated
  using (exists (select 1 from public.transactions t where t.id = transaction_id and public.can_see_branch(t.branch_id)));
create policy "managers read business days" on public.business_days for select to authenticated
  using (public.is_manager_plus() and public.can_see_branch(branch_id));
