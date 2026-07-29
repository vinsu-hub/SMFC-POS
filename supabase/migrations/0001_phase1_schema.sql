-- Phase 1 schema per docs/backend-execution-plan.md §2 and §8
-- Tables: organizations, branches, profiles, products, ingredients,
-- recipe_items, transactions, transaction_items.

create extension if not exists "pgcrypto";

-- organizations ---------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- branches ---------------------------------------------------------------
create type branch_type as enum ('fine_dining', 'cafe', 'bar');

create table branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  type branch_type not null,
  theme_key text not null,
  created_at timestamptz not null default now()
);

-- profiles -----------------------------------------------------------------
-- Extends auth.users with role/branch. id must equal auth.users.id.
create type user_role as enum ('employee', 'manager', 'executive');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null, -- nullable for execs
  role user_role not null default 'employee',
  full_name text,
  created_at timestamptz not null default now()
);

-- products -----------------------------------------------------------------
create table products (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null,
  category text not null,
  price numeric(10, 2) not null check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ingredients ----------------------------------------------------------------
create table ingredients (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null,
  unit text not null,
  unit_cost numeric(10, 4) not null default 0 check (unit_cost >= 0),
  current_stock numeric(12, 4) not null default 0,
  reorder_threshold numeric(12, 4) not null default 0,
  expiry_date date,
  created_at timestamptz not null default now()
);

-- recipe_items ---------------------------------------------------------------
-- Bill-of-materials link: one product is made of N ingredients in given quantities.
create table recipe_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  quantity numeric(12, 4) not null check (quantity > 0),
  unique (product_id, ingredient_id)
);

-- transactions -----------------------------------------------------------------
create type transaction_status as enum ('open', 'closed', 'voided');

create table transactions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  employee_id uuid not null references profiles(id),
  status transaction_status not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  total_amount numeric(12, 2) not null default 0
);

-- transaction_items ---------------------------------------------------------------
create table transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric(10, 2) not null check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0)
);

create index idx_branches_org on branches(organization_id);
create index idx_profiles_branch on profiles(branch_id);
create index idx_products_branch on products(branch_id);
create index idx_ingredients_branch on ingredients(branch_id);
create index idx_recipe_items_product on recipe_items(product_id);
create index idx_recipe_items_ingredient on recipe_items(ingredient_id);
create index idx_transactions_branch on transactions(branch_id);
create index idx_transaction_items_transaction on transaction_items(transaction_id);
create index idx_transaction_items_product on transaction_items(product_id);
