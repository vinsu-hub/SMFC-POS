-- Void with stock reversal, kitchen/queue visibility for branch staff, and lock direct writes to
-- transactions (all sales now go through create_pos_transaction; kitchen status via set_kitchen_status).

create or replace function public.void_transaction(p_transaction uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare t transactions; ti record; ri record;
begin
  select * into t from transactions where id = p_transaction for update;
  if t.id is null or not can_see_branch(t.branch_id) or not is_role('manager', 'executive') then
    raise exception 'FORBIDDEN: manager or executive only'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'INVALID: a reason is required'; end if;
  if t.status = 'voided' then raise exception 'CONFLICT: order is already voided'; end if;
  update transactions set status = 'voided', voided_by = auth.uid(), voided_at = now(), void_reason = p_reason,
    fulfilled = true where id = p_transaction;
  -- put recipe stock back (held ingredients were never deducted)
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
grant execute on function public.void_transaction(uuid, text) to authenticated;

-- Kitchen display / order queue: branch staff see the branch's recent orders (not just their own)
create policy "branch staff read recent transactions" on public.transactions for select to authenticated
  using (public.can_see_branch(branch_id) and public.is_role('employee', 'manager', 'executive')
         and opened_at > now() - interval '2 days');
create policy "branch staff read recent items" on public.transaction_items for select to authenticated
  using (exists (select 1 from public.transactions t where t.id = transaction_id
    and public.can_see_branch(t.branch_id) and public.is_role('employee', 'manager', 'executive')
    and t.opened_at > now() - interval '2 days'));

-- Sales and kitchen updates now go through SECURITY DEFINER functions only
drop policy if exists "app insert own transaction" on public.transactions;
drop policy if exists "app close own transaction" on public.transactions;
drop policy if exists "app insert own transaction items" on public.transaction_items;
