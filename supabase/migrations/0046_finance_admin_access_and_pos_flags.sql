-- Finance admin becomes an executive-like, company-wide role; business-day lock becomes opt-in;
-- company-wide accounts can ring/void/advance sales for a chosen branch.

alter table public.business_settings add column if not exists require_business_day boolean not null default false;

create or replace function public.is_manager_plus() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() in ('manager', 'executive', 'finance_admin'), false) $$;

create or replace function public.can_see_branch(b uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() in ('executive', 'finance_admin') or public.my_branch_id() = b, false) $$;

create or replace function public.create_pos_transaction(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid(); prof profiles; br uuid; k uuid; existing uuid;
  otype order_type; tno text; guests int; pay text; ctype text; force_vat boolean;
  rel uuid; disc discount_types; vat_exempt boolean := false; vat numeric;
  it jsonb; ad jsonb; prod products; addon menu_addons; tid uuid; tiid uuid; qty numeric; held uuid[];
  subtotal numeric := 0; discount numeric := 0; total numeric; tax numeric := 0; dfee numeric := 0;
  tbl tables; blk reservations; ov reservation_overrides; ovid uuid; rsv uuid; rr reservations; dl jsonb;
  ri record; owner_req boolean;
begin
  select * into prof from profiles where id = uid;
  if prof.id is null or prof.role not in ('employee', 'manager', 'executive', 'finance_admin') then
    raise exception 'FORBIDDEN: not allowed to ring sales'; end if;
  br := prof.branch_id;
  -- company-wide accounts have no branch of their own: they ring sales for the branch they picked in the POS
  if prof.role in ('executive', 'finance_admin') then
    br := coalesce(nullif(p ->> 'branch_id', '')::uuid, br);
  end if;
  if br is null then raise exception 'INVALID: choose a branch first'; end if;

  k := nullif(p ->> 'idempotency_key', '')::uuid;
  if k is not null then
    select resource_id into existing from idempotency_keys where key = k and endpoint = 'create_pos_transaction';
    if existing is not null then
      return (select jsonb_build_object('id', t.id, 'order_number', t.order_number, 'total_amount', t.total_amount,
              'tax_amount', t.tax_amount, 'discount_amount', t.discount_amount, 'duplicate', true) from transactions t where t.id = existing);
    end if;
  end if;

  otype := coalesce(p ->> 'order_type', 'dine_in')::order_type;
  tno := nullif(trim(p ->> 'table_number'), '');
  guests := nullif(p ->> 'guest_count', '')::int;
  pay := p ->> 'payment_method';
  ctype := nullif(p ->> 'card_type', '');
  force_vat := coalesce((p ->> 'force_vat_exempt')::boolean, false);
  rel := nullif(p ->> 'related_transaction_id', '')::uuid;
  dl := p -> 'delivery';

  if otype = 'dine_in' and tno is null then raise exception 'INVALID: table number is required for dine-in'; end if;
  if otype = 'delivery' and (dl is null or coalesce(dl ->> 'customer_name', '') = '' or coalesce(dl ->> 'customer_phone', '') = '') then
    raise exception 'INVALID: delivery details are required'; end if;
  if pay is null or pay not in ('cash', 'gcash', 'card') then raise exception 'INVALID: payment method is required'; end if;
  if pay = 'card' and ctype is null then raise exception 'INVALID: card type is required for card payments'; end if;
  if jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb)) = 0 then raise exception 'INVALID: add at least one item'; end if;

  -- the lock is opt-in (business_settings.require_business_day) so the existing POS keeps working until it is switched on
  if prof.role not in ('executive', 'finance_admin')
     and coalesce((select require_business_day from business_settings where id = 1), false)
     and not exists (
      select 1 from business_days where branch_id = br and business_date = ph_today() and closed_at is null) then
    raise exception 'BUSINESS_DAY_CLOSED: open the business day before ringing sales';
  end if;

  owner_req := coalesce((p ->> 'is_owner_request')::boolean, false);
  if owner_req and not _verify_caller_pin(p ->> 'owner_request_employee_number', p ->> 'owner_request_pin') then
    raise exception 'BAD_PIN: owner request PIN is incorrect'; end if;

  if rel is not null and not exists (select 1 from transactions where id = rel and branch_id = br and status = 'closed') then
    raise exception 'INVALID: related order must be a completed order of this branch'; end if;

  -- reservation block for dine-in tables
  if otype = 'dine_in' and rel is null and tno ~ '^\d+$' then
    select * into tbl from tables where branch_id = br and pos_table_number = tno::int and active;
    if tbl.id is not null then
      if guests is not null and guests > coalesce(tbl.capacity_max, tbl.capacity) then
        raise exception 'INVALID: party of % exceeds table capacity %', guests, coalesce(tbl.capacity_max, tbl.capacity); end if;
      blk := _blocking_reservation(br, tbl.id);
      if blk.id is not null then
        ovid := nullif(p ->> 'reservation_override_id', '')::uuid;
        if ovid is null then raise exception 'RESERVED: table % is reserved for % (%)', tno, blk.customer_name, blk.start_time; end if;
        select * into ov from reservation_overrides where id = ovid;
        if ov.id is null or ov.table_id <> tbl.id or ov.reservation_id <> blk.id or ov.transaction_id is not null
           or ov.created_at < now() - interval '600 seconds' then
          raise exception 'FORBIDDEN: reservation override is invalid or expired'; end if;
      end if;
    end if;
  end if;

  if nullif(p ->> 'discount_type_id', '') is not null then
    select * into disc from discount_types where id = (p ->> 'discount_type_id')::uuid and branch_id = br;
    if disc.id is null then raise exception 'NOT_FOUND: discount not found'; end if;
    if not disc.active then raise exception 'INVALID: discount is inactive'; end if;
    vat_exempt := coalesce(disc.vat_exempt, false);
  end if;
  vat_exempt := vat_exempt or force_vat;
  select vat_rate into vat from business_settings where id = 1;

  -- price everything server-side
  for it in select * from jsonb_array_elements(p -> 'items') loop
    select * into prod from products where id = (it ->> 'product_id')::uuid and branch_id = br and active;
    if prod.id is null then raise exception 'NOT_FOUND: product not found or inactive'; end if;
    qty := (it ->> 'quantity')::numeric;
    if qty is null or qty <= 0 then raise exception 'INVALID: quantity must be positive'; end if;
    subtotal := subtotal + prod.price * qty;
    for ad in select * from jsonb_array_elements(coalesce(it -> 'addons', '[]'::jsonb)) loop
      select * into addon from menu_addons where id = (ad ->> 'addon_id')::uuid;
      if addon.id is null then raise exception 'NOT_FOUND: add-on not found'; end if;
      if not addon.active then raise exception 'INVALID: add-on % is inactive', addon.name; end if;
      -- add-on quantity is per line and is not multiplied by the line quantity (matches Oishii)
      subtotal := subtotal + addon.price * (ad ->> 'quantity')::numeric;
    end loop;
  end loop;

  if otype = 'delivery' then
    select fee into dfee from delivery_fees where barangay = dl ->> 'barangay';
    if dfee is null then raise exception 'INVALID: no delivery fee configured for that barangay'; end if;
  end if;

  discount := round(subtotal * coalesce(disc.percentage, 0) / 100, 2);
  total := subtotal - discount;
  tax := case when vat_exempt then 0 else round(total * coalesce(vat, 0.12), 2) end;

  insert into transactions (branch_id, employee_id, status, closed_at, total_amount, discount_type_id, discount_amount, tax_amount,
                            is_owner_request, owner_request_by, owner_request_note, order_type, table_number, guest_count,
                            payment_method, card_type, force_vat_exempt, related_transaction_id)
  values (br, uid, 'closed', now(), total, disc.id, discount, tax, owner_req, case when owner_req then uid end,
          p ->> 'owner_request_note', otype, tno, guests, pay, ctype, force_vat, rel)
  returning id into tid;

  for it in select * from jsonb_array_elements(p -> 'items') loop
    select * into prod from products where id = (it ->> 'product_id')::uuid;
    qty := (it ->> 'quantity')::numeric;
    held := coalesce(array(select jsonb_array_elements_text(coalesce(it -> 'held_ingredient_ids', '[]'::jsonb))::uuid), '{}');
    insert into transaction_items (transaction_id, product_id, quantity, unit_price, held_ingredient_ids, note)
    values (tid, prod.id, qty, prod.price, held, it ->> 'note') returning id into tiid;
    for ad in select * from jsonb_array_elements(coalesce(it -> 'addons', '[]'::jsonb)) loop
      select * into addon from menu_addons where id = (ad ->> 'addon_id')::uuid;
      insert into transaction_item_addons (transaction_item_id, addon_id, quantity, unit_price)
      values (tiid, addon.id, (ad ->> 'quantity')::int, addon.price);
    end loop;
    -- stock deduction from the recipe, skipping held ingredients
    for ri in select r.ingredient_id, r.quantity, i.unit_cost from recipe_items r
              join ingredients i on i.id = r.ingredient_id
              where r.product_id = prod.id and not (r.ingredient_id = any(held)) loop
      update ingredients set current_stock = greatest(current_stock - ri.quantity * qty, 0) where id = ri.ingredient_id;
      insert into inventory_movements (branch_id, ingredient_id, type, quantity, reason, reference_id, employee_id, unit_cost_snapshot)
      values (br, ri.ingredient_id, 'sale_consumption', ri.quantity * qty, 'Recipe sale -- transaction ' || tid, tid, uid, ri.unit_cost);
    end loop;
  end loop;

  if otype = 'delivery' then
    insert into deliveries (transaction_id, customer_name, customer_phone, address, landmark, barangay, delivery_fee)
    values (tid, dl ->> 'customer_name', dl ->> 'customer_phone', dl ->> 'address', dl ->> 'landmark', dl ->> 'barangay', dfee);
  end if;

  if ov.id is not null then update reservation_overrides set transaction_id = tid where id = ov.id; end if;
  rsv := nullif(p ->> 'reservation_id', '')::uuid;
  if rsv is not null and tbl.id is not null then
    select * into rr from reservations where id = rsv;
    if rr.id is not null and rr.status = 'confirmed' and rr.table_id = tbl.id and rr.reservation_date = ph_today() then
      update reservations set transaction_id = tid, seated_at = now() where id = rsv;
    end if;
  end if;

  if k is not null then insert into idempotency_keys (key, endpoint, resource_id) values (k, 'create_pos_transaction', tid); end if;

  return jsonb_build_object('id', tid, 'order_number', (select order_number from transactions where id = tid),
    'subtotal', subtotal, 'discount_amount', discount, 'total_amount', total, 'tax_amount', tax,
    'delivery_fee', dfee, 'payment_method', pay, 'duplicate', false);
end $$;


create or replace function public.void_transaction(p_transaction uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare t transactions; ti record; ri record;
begin
  select * into t from transactions where id = p_transaction for update;
  if t.id is null or not can_see_branch(t.branch_id) or not is_role('manager', 'executive', 'finance_admin') then
    raise exception 'FORBIDDEN: manager or executive only'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'INVALID: a reason is required'; end if;
  if t.status = 'voided' then raise exception 'CONFLICT: order is already voided'; end if;
  update transactions set status = 'voided', voided_by = auth.uid(), voided_at = now(), void_reason = p_reason,
    fulfilled = true where id = p_transaction;
  for ti in select * from transaction_items where transaction_id = p_transaction loop
    for ri in select r.ingredient_id, r.quantity, i.unit_cost from recipe_items r
              join ingredients i on i.id = r.ingredient_id
              where r.product_id = ti.product_id and not (r.ingredient_id = any(ti.held_ingredient_ids)) loop
      update ingredients set current_stock = current_stock + ri.quantity * ti.quantity where id = ri.ingredient_id;
      insert into inventory_movements (branch_id, ingredient_id, type, quantity, reason, reference_id, employee_id, unit_cost_snapshot)
      values (t.branch_id, ri.ingredient_id, 'trans_in', ri.quantity * ti.quantity,
              'Void reversal -- transaction ' || p_transaction, p_transaction, auth.uid(), ri.unit_cost);
    end loop;
  end loop;
end $$;

create or replace function public.set_kitchen_status(p_transaction uuid, p_status kitchen_status) returns void
language plpgsql security definer set search_path = public as $$
declare t transactions; order_ kitchen_status[] := array['queued','preparing','ready','completed']::kitchen_status[];
begin
  select * into t from transactions where id = p_transaction for update;
  if t.id is null or not can_see_branch(t.branch_id) or not is_role('employee', 'manager', 'executive', 'finance_admin') then
    raise exception 'FORBIDDEN: not allowed'; end if;
  if array_position(order_, p_status) < array_position(order_, t.kitchen_status) then
    raise exception 'INVALID: kitchen status cannot move backwards'; end if;
  update transactions set kitchen_status = p_status, kitchen_status_updated_at = now(),
    fulfilled = (p_status = 'completed'), fulfilled_at = case when p_status = 'completed' then now() else fulfilled_at end
  where id = p_transaction;
end $$;
