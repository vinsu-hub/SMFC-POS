-- Procurement pipeline: branch request -> canvass -> quote selection -> PO
-- (procurement + finance sign) -> receiving with receipt photo -> unit cost update.
-- All writes to orders/receipts go through SECURITY DEFINER functions.

-- ---------- role helpers ----------
create or replace function public.is_role(variadic roles public.user_role[]) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() = any(roles), false) $$;

create or replace function public.is_proc_team() returns boolean
language sql stable security definer set search_path = public as
$$ select public.is_role('procurement', 'finance_admin', 'canvasser', 'executive') $$;

-- ---------- tables ----------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_number text,
  location text,
  notes text,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index suppliers_name_key on public.suppliers (lower(name));

create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  requested_by uuid not null references public.profiles (id),
  week_of date not null default current_date,
  notes text,
  status text not null default 'submitted'
    check (status in ('submitted','canvassing','ready_for_po','po_issued','received','cancelled')),
  created_at timestamptz not null default now()
);

create table public.canvass_tickets (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  unit text not null,
  total_quantity numeric not null check (total_quantity > 0),
  week_of date not null default current_date,
  assigned_to uuid not null references public.profiles (id),
  status text not null default 'open'
    check (status in ('open','submitted','selected','ordered','cancelled')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.purchase_requests (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id),
  item_name text not null,
  unit text not null,
  quantity numeric not null check (quantity > 0),
  note text,
  ticket_id uuid references public.canvass_tickets (id)
);

create table public.canvass_quotes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.canvass_tickets (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id),
  unit_cost numeric not null check (unit_cost >= 0),
  notes text,
  selected boolean not null default false,
  submitted_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create sequence public.po_number_seq;

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  ticket_id uuid not null references public.canvass_tickets (id),
  quote_id uuid not null references public.canvass_quotes (id),
  supplier_id uuid not null references public.suppliers (id),
  item_name text not null,
  unit text not null,
  quantity numeric not null check (quantity > 0),
  unit_cost numeric not null check (unit_cost >= 0),
  total numeric generated always as (quantity * unit_cost) stored,
  status text not null default 'awaiting_signatures'
    check (status in ('awaiting_signatures','approved','received','cancelled')),
  procurement_signed_by uuid references public.profiles (id),
  procurement_signed_at timestamptz,
  finance_signed_by uuid references public.profiles (id),
  finance_signed_at timestamptz,
  printed_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.po_allocations (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  branch_id uuid not null references public.branches (id),
  request_item_id uuid not null references public.purchase_request_items (id),
  ingredient_id uuid references public.ingredients (id),
  quantity numeric not null check (quantity > 0)
);

create table public.po_receipts (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id),
  received_qty numeric not null check (received_qty > 0),
  actual_unit_cost numeric not null check (actual_unit_cost >= 0),
  received_at timestamptz not null default now(),
  received_by uuid not null references public.profiles (id),
  photo_path text not null,
  notes text
);

create table public.ingredient_price_history (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  unit_cost numeric not null,
  po_id uuid references public.purchase_orders (id),
  created_at timestamptz not null default now()
);

create index on public.purchase_requests (branch_id, created_at desc);
create index on public.purchase_request_items (request_id);
create index on public.canvass_tickets (assigned_to, status);
create index on public.canvass_quotes (ticket_id);
create index on public.po_allocations (po_id);
create index on public.po_receipts (po_id);
create index on public.ingredient_price_history (ingredient_id, created_at desc);

-- ---------- RLS ----------
alter table public.suppliers enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.purchase_request_items enable row level security;
alter table public.canvass_tickets enable row level security;
alter table public.canvass_quotes enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.po_allocations enable row level security;
alter table public.po_receipts enable row level security;
alter table public.ingredient_price_history enable row level security;

create policy "proc team reads suppliers" on public.suppliers for select to authenticated
  using (public.is_proc_team());
create policy "canvass/procurement manage suppliers" on public.suppliers for all to authenticated
  using (public.is_role('canvasser', 'procurement'))
  with check (public.is_role('canvasser', 'procurement'));

-- Requests: branch staff create/read for own branch; proc team reads all
create policy "read requests" on public.purchase_requests for select to authenticated
  using (public.can_see_branch(branch_id) or public.is_proc_team());
create policy "branch files request" on public.purchase_requests for insert to authenticated
  with check (requested_by = auth.uid() and branch_id = public.my_branch_id());
create policy "read request items" on public.purchase_request_items for select to authenticated
  using (exists (select 1 from public.purchase_requests r where r.id = request_id
    and (public.can_see_branch(r.branch_id) or public.is_proc_team())));
create policy "branch adds request items" on public.purchase_request_items for insert to authenticated
  with check (exists (select 1 from public.purchase_requests r where r.id = request_id
    and r.requested_by = auth.uid() and r.branch_id = public.my_branch_id()));

-- Tickets/quotes: procurement + executive + finance see all; canvasser sees assigned
create policy "read tickets" on public.canvass_tickets for select to authenticated
  using (public.is_role('procurement', 'finance_admin', 'executive')
         or (public.is_role('canvasser') and assigned_to = auth.uid()));
create policy "read quotes" on public.canvass_quotes for select to authenticated
  using (public.is_role('procurement', 'finance_admin', 'executive')
         or exists (select 1 from public.canvass_tickets t where t.id = ticket_id and t.assigned_to = auth.uid()));

-- Purchase orders: readable by proc team (canvasser only approved/received ones)
create policy "read purchase orders" on public.purchase_orders for select to authenticated
  using (public.is_role('procurement', 'finance_admin', 'executive')
         or (public.is_role('canvasser') and status in ('approved','received')));
create policy "read po allocations" on public.po_allocations for select to authenticated
  using (exists (select 1 from public.purchase_orders p where p.id = po_id)
         and (public.is_role('procurement', 'finance_admin', 'executive', 'canvasser')
              or public.can_see_branch(branch_id)));
create policy "read po receipts" on public.po_receipts for select to authenticated
  using (public.is_proc_team());
create policy "read price history" on public.ingredient_price_history for select to authenticated
  using (public.is_proc_team()
         or exists (select 1 from public.ingredients i where i.id = ingredient_id and public.can_see_branch(i.branch_id)));

-- Procurement team can read ingredients across branches (for request form context/cost)
create policy "proc team reads ingredients" on public.ingredients for select to authenticated
  using (public.is_role('procurement', 'finance_admin', 'canvasser'));

-- ---------- functions ----------
-- Branch files a request. p_items: [{ingredient_id?, item_name, unit, quantity, note?}]
create or replace function public.submit_purchase_request(p_week date, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; it jsonb;
begin
  if my_branch_id() is null or not is_role('employee','manager') then
    raise exception 'Only branch staff can file stock requests';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one item';
  end if;
  insert into purchase_requests (branch_id, requested_by, week_of, notes)
  values (my_branch_id(), auth.uid(), coalesce(p_week, current_date), p_notes) returning id into rid;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into purchase_request_items (request_id, ingredient_id, item_name, unit, quantity, note)
    values (rid, nullif(it ->> 'ingredient_id', '')::uuid, trim(it ->> 'item_name'), trim(it ->> 'unit'),
            (it ->> 'quantity')::numeric, it ->> 'note');
  end loop;
  return rid;
end $$;

-- Procurement groups request items (same item+unit) into one canvass ticket for a canvasser
create or replace function public.create_canvass_tickets(p_request_item_ids uuid[], p_canvasser uuid)
returns int language plpgsql security definer set search_path = public as $$
declare g record; tid uuid; n int := 0;
begin
  if not is_role('procurement') then raise exception 'Procurement only'; end if;
  if not exists (select 1 from profiles where id = p_canvasser and role = 'canvasser') then
    raise exception 'Assignee is not a canvasser';
  end if;
  for g in
    select lower(item_name) k, min(item_name) item_name, unit, sum(quantity) qty, array_agg(id) ids
    from purchase_request_items where id = any(p_request_item_ids) and ticket_id is null
    group by lower(item_name), unit
  loop
    insert into canvass_tickets (item_name, unit, total_quantity, assigned_to, created_by)
    values (g.item_name, g.unit, g.qty, p_canvasser, auth.uid()) returning id into tid;
    update purchase_request_items set ticket_id = tid where id = any(g.ids);
    n := n + 1;
  end loop;
  update purchase_requests r set status = 'canvassing'
  where status = 'submitted' and exists (select 1 from purchase_request_items i where i.request_id = r.id and i.ticket_id is not null);
  return n;
end $$;

-- Canvasser submits quotes. p_quotes: [{supplier_id?, supplier_name, contact_number, location, unit_cost, notes?}]
create or replace function public.submit_canvass(p_ticket_id uuid, p_quotes jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare q jsonb; sid uuid; n int := 0; t canvass_tickets;
begin
  select * into t from canvass_tickets where id = p_ticket_id;
  if t.id is null or t.assigned_to <> auth.uid() or not is_role('canvasser') then
    raise exception 'Ticket not assigned to you';
  end if;
  if t.status not in ('open','submitted') then raise exception 'Ticket is closed for canvassing'; end if;
  if jsonb_array_length(coalesce(p_quotes, '[]'::jsonb)) = 0 then raise exception 'Add at least one quote'; end if;
  for q in select * from jsonb_array_elements(p_quotes) loop
    sid := nullif(q ->> 'supplier_id', '')::uuid;
    if sid is null then
      select id into sid from suppliers where lower(name) = lower(trim(q ->> 'supplier_name'));
      if sid is null then
        insert into suppliers (name, contact_number, location, created_by)
        values (trim(q ->> 'supplier_name'), q ->> 'contact_number', q ->> 'location', auth.uid())
        returning id into sid;
      end if;
    end if;
    insert into canvass_quotes (ticket_id, supplier_id, unit_cost, notes, submitted_by)
    values (p_ticket_id, sid, (q ->> 'unit_cost')::numeric, q ->> 'notes', auth.uid());
    n := n + 1;
  end loop;
  update canvass_tickets set status = 'submitted' where id = p_ticket_id;
  return n;
end $$;

-- Procurement picks the winning quote
create or replace function public.select_quote(p_quote_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  if not is_role('procurement') then raise exception 'Procurement only'; end if;
  select ticket_id into tid from canvass_quotes where id = p_quote_id;
  if tid is null then raise exception 'Quote not found'; end if;
  if exists (select 1 from canvass_tickets where id = tid and status in ('ordered','cancelled')) then
    raise exception 'Ticket already ordered';
  end if;
  update canvass_quotes set selected = (id = p_quote_id) where ticket_id = tid;
  update canvass_tickets set status = 'selected' where id = tid;
  update purchase_requests r set status = 'ready_for_po'
  where r.status = 'canvassing'
    and exists (select 1 from purchase_request_items i where i.request_id = r.id and i.ticket_id = tid)
    and not exists (select 1 from purchase_request_items i join canvass_tickets t on t.id = i.ticket_id
                    where i.request_id = r.id and t.status not in ('selected','ordered'))
    and not exists (select 1 from purchase_request_items i where i.request_id = r.id and i.ticket_id is null);
end $$;

-- Compile one PO per selected ticket (per item category). p_ticket_ids null = all selected tickets.
create or replace function public.compile_purchase_orders(p_ticket_ids uuid[] default null)
returns setof public.purchase_orders language plpgsql security definer set search_path = public as $$
declare t canvass_tickets; qt canvass_quotes; po purchase_orders; pid uuid;
begin
  if not is_role('procurement') then raise exception 'Procurement only'; end if;
  for t in select * from canvass_tickets
           where status = 'selected' and (p_ticket_ids is null or id = any(p_ticket_ids)) order by created_at
  loop
    select * into qt from canvass_quotes where ticket_id = t.id and selected limit 1;
    insert into purchase_orders (po_number, ticket_id, quote_id, supplier_id, item_name, unit, quantity, unit_cost, created_by)
    values ('PO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('po_number_seq')::text, 4, '0'),
            t.id, qt.id, qt.supplier_id, t.item_name, t.unit, t.total_quantity, qt.unit_cost, auth.uid())
    returning id into pid;
    insert into po_allocations (po_id, branch_id, request_item_id, ingredient_id, quantity)
    select pid, r.branch_id, i.id, i.ingredient_id, i.quantity
    from purchase_request_items i join purchase_requests r on r.id = i.request_id where i.ticket_id = t.id;
    update canvass_tickets set status = 'ordered' where id = t.id;
    update purchase_requests r set status = 'po_issued'
    where r.status = 'ready_for_po'
      and not exists (select 1 from purchase_request_items i join canvass_tickets ct on ct.id = i.ticket_id
                      where i.request_id = r.id and ct.status <> 'ordered');
    select * into po from purchase_orders where id = pid;
    return next po;
  end loop;
end $$;

-- Procurement head and finance admin each sign; approved once both have signed
create or replace function public.sign_purchase_order(p_po_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare po purchase_orders; r user_role := my_role();
begin
  select * into po from purchase_orders where id = p_po_id for update;
  if po.id is null then raise exception 'PO not found'; end if;
  if po.status not in ('awaiting_signatures') then raise exception 'PO is %', po.status; end if;
  if r = 'procurement' then
    update purchase_orders set procurement_signed_by = auth.uid(), procurement_signed_at = now() where id = p_po_id;
  elsif r = 'finance_admin' then
    update purchase_orders set finance_signed_by = auth.uid(), finance_signed_at = now() where id = p_po_id;
  else raise exception 'Only procurement or finance admin can sign'; end if;
  update purchase_orders set status = 'approved'
  where id = p_po_id and procurement_signed_by is not null and finance_signed_by is not null;
  select status into po.status from purchase_orders where id = p_po_id;
  return po.status;
end $$;

create or replace function public.mark_po_printed(p_po_id uuid) returns void
language sql security definer set search_path = public as $$
  update purchase_orders set printed_at = now()
  where id = p_po_id and public.is_role('procurement', 'finance_admin') $$;

-- Canvasser receives the goods: photo of receipt + actual unit price. Updates stock and unit cost.
create or replace function public.receive_purchase_order(p_po_id uuid, p_qty numeric, p_actual_cost numeric, p_photo_path text, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare po purchase_orders; a record; total_alloc numeric; share numeric; done numeric; remaining numeric; ing uuid; got numeric;
begin
  if not is_role('canvasser', 'procurement') then raise exception 'Not allowed to receive'; end if;
  if coalesce(p_photo_path, '') = '' then raise exception 'A photo of the receipt is required'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be positive'; end if;
  select * into po from purchase_orders where id = p_po_id for update;
  if po.id is null then raise exception 'PO not found'; end if;
  if po.status <> 'approved' then raise exception 'PO must be signed by procurement and finance first (status: %)', po.status; end if;
  select coalesce(sum(received_qty), 0) into got from po_receipts where po_id = p_po_id;
  if got + p_qty > po.quantity * 1.10 then raise exception 'Receiving more than 110%% of the ordered quantity'; end if;

  insert into po_receipts (po_id, received_qty, actual_unit_cost, received_by, photo_path, notes)
  values (p_po_id, p_qty, p_actual_cost, auth.uid(), p_photo_path, p_notes);

  select sum(quantity) into total_alloc from po_allocations where po_id = p_po_id;
  remaining := p_qty;
  for a in select * from po_allocations where po_id = p_po_id order by id loop
    share := round(p_qty * a.quantity / total_alloc, 4);
    -- last allocation absorbs rounding remainder
    if a.id = (select id from po_allocations where po_id = p_po_id order by id desc limit 1) then share := remaining; end if;
    remaining := remaining - share;
    ing := a.ingredient_id;
    if ing is null then
      select id into ing from ingredients where branch_id = a.branch_id and lower(name) = lower(po.item_name) limit 1;
    end if;
    if ing is not null and share > 0 then
      update ingredients set current_stock = current_stock + share, unit_cost = p_actual_cost where id = ing;
      insert into inventory_movements (branch_id, ingredient_id, type, quantity, reason, reference_id, employee_id, unit_cost_snapshot)
      values (a.branch_id, ing, 'delivery', share, 'PO ' || po.po_number, po.id, auth.uid(), p_actual_cost);
      insert into ingredient_price_history (ingredient_id, unit_cost, po_id) values (ing, p_actual_cost, po.id);
    end if;
  end loop;

  if got + p_qty >= po.quantity then
    update purchase_orders set status = 'received' where id = p_po_id;
    update purchase_requests r set status = 'received'
    where exists (select 1 from purchase_request_items i join po_allocations pa on pa.request_item_id = i.id
                  where i.request_id = r.id and pa.po_id = p_po_id)
      and not exists (select 1 from purchase_request_items i join canvass_tickets ct on ct.id = i.ticket_id
                      left join purchase_orders p2 on p2.ticket_id = ct.id
                      where i.request_id = r.id and coalesce(p2.status, 'x') <> 'received');
  end if;
end $$;

grant execute on function
  public.submit_purchase_request(date, text, jsonb),
  public.create_canvass_tickets(uuid[], uuid),
  public.submit_canvass(uuid, jsonb),
  public.select_quote(uuid),
  public.compile_purchase_orders(uuid[]),
  public.sign_purchase_order(uuid),
  public.mark_po_printed(uuid),
  public.receive_purchase_order(uuid, numeric, numeric, text, text)
to authenticated;

-- ---------- receipts bucket (private) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "proc team uploads receipts" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_role('canvasser', 'procurement'));
create policy "proc team reads receipts" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_proc_team());
