-- Per-sale cost snapshot + live margin views.
-- unit_cogs = recipe cost of one unit of the product at the moment of sale, using each
-- ingredient's current unit_cost (kept current by receive_purchase_order) and skipping held ingredients.

alter table public.transaction_items add column if not exists unit_cogs numeric not null default 0;

create or replace function public.recipe_cost(p_product uuid, p_held uuid[] default '{}')
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(ri.quantity * coalesce(i.unit_cost, 0)), 0)
  from recipe_items ri join ingredients i on i.id = ri.ingredient_id
  where ri.product_id = p_product and not (ri.ingredient_id = any(coalesce(p_held, '{}')))
$$;

create or replace function public.set_unit_cogs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.unit_cogs := public.recipe_cost(new.product_id, new.held_ingredient_ids);
  return new;
end $$;

drop trigger if exists transaction_items_cogs on public.transaction_items;
create trigger transaction_items_cogs before insert on public.transaction_items
  for each row execute function public.set_unit_cogs();

-- Backfill existing rows with today's recipe cost (best available estimate for history)
update public.transaction_items set unit_cogs = public.recipe_cost(product_id, held_ingredient_ids) where unit_cogs = 0;

-- Per-order live margin (RLS of the caller applies)
create or replace view public.transaction_margins with (security_invoker = on) as
select t.id, t.branch_id, b.name as branch_name, t.opened_at, t.status, t.order_type,
       t.total_amount as gross_revenue,
       t.tax_amount as vat,
       t.discount_amount as discount,
       coalesce(sum(ti.quantity * ti.unit_cogs), 0)::numeric(12,2) as cogs,
       (t.total_amount - t.tax_amount - coalesce(sum(ti.quantity * ti.unit_cogs), 0))::numeric(12,2) as gross_margin
from public.transactions t
join public.branches b on b.id = t.branch_id
left join public.transaction_items ti on ti.transaction_id = t.id
group by t.id, b.name;

-- Menu costing: recipe cost vs price
create or replace view public.product_costs with (security_invoker = on) as
select p.id as product_id, p.branch_id, p.name, p.category, p.price,
       public.recipe_cost(p.id)::numeric(12,2) as recipe_cost,
       (p.price - public.recipe_cost(p.id))::numeric(12,2) as margin,
       case when p.price > 0 then round((p.price - public.recipe_cost(p.id)) / p.price * 100, 1) else 0 end as margin_pct,
       exists (select 1 from recipe_items ri join ingredients i on i.id = ri.ingredient_id
               where ri.product_id = p.id and coalesce(i.unit_cost, 0) = 0) as missing_costs
from public.products p where p.active;

grant select on public.transaction_margins, public.product_costs to authenticated;

-- Realtime feed for the CEO view (postgres_changes respects RLS)
do $$ begin
  begin alter publication supabase_realtime add table public.transactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.transaction_items; exception when duplicate_object then null; end;
end $$;
