-- Additive RLS so the browser (publishable key + logged-in user) can run the POS.
-- Helpers are SECURITY DEFINER to avoid recursive policy lookups on profiles.

create or replace function public.my_branch_id() returns uuid
language sql stable security definer set search_path = public as
$$ select branch_id from public.profiles where id = auth.uid() $$;

create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.can_see_branch(b uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() = 'executive' or public.my_branch_id() = b, false) $$;

create or replace function public.is_manager_plus() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() in ('manager', 'executive'), false) $$;

-- READ
create policy "app read products" on public.products for select to authenticated
  using (public.can_see_branch(branch_id));
create policy "app read ingredients" on public.ingredients for select to authenticated
  using (public.can_see_branch(branch_id));
create policy "app read recipe items" on public.recipe_items for select to authenticated
  using (exists (select 1 from public.products p where p.id = product_id and public.can_see_branch(p.branch_id)));
create policy "app read transactions" on public.transactions for select to authenticated
  using (public.can_see_branch(branch_id) and (public.is_manager_plus() or employee_id = auth.uid()));
create policy "app read transaction items" on public.transaction_items for select to authenticated
  using (exists (select 1 from public.transactions t where t.id = transaction_id
    and public.can_see_branch(t.branch_id) and (public.is_manager_plus() or t.employee_id = auth.uid())));
create policy "app read loss records" on public.loss_records for select to authenticated
  using (public.can_see_branch(branch_id) and (public.is_manager_plus() or employee_id = auth.uid()));
create policy "app read branch profiles" on public.profiles for select to authenticated
  using (public.is_manager_plus() and public.can_see_branch(branch_id));

-- WRITE (employees act on their own branch, as themselves)
create policy "app insert own transaction" on public.transactions for insert to authenticated
  with check (employee_id = auth.uid() and branch_id = public.my_branch_id());
create policy "app close own transaction" on public.transactions for update to authenticated
  using (employee_id = auth.uid() and branch_id = public.my_branch_id())
  with check (employee_id = auth.uid() and branch_id = public.my_branch_id());
create policy "app insert own transaction items" on public.transaction_items for insert to authenticated
  with check (exists (select 1 from public.transactions t
    where t.id = transaction_id and t.employee_id = auth.uid() and t.branch_id = public.my_branch_id()));
create policy "app insert own loss" on public.loss_records for insert to authenticated
  with check (employee_id = auth.uid() and branch_id = public.my_branch_id());
create policy "app insert own count movement" on public.inventory_movements for insert to authenticated
  with check (employee_id = auth.uid() and branch_id = public.my_branch_id());
create policy "app read own movements" on public.inventory_movements for select to authenticated
  using (employee_id = auth.uid() and public.can_see_branch(branch_id));
create policy "managers update ingredients" on public.ingredients for update to authenticated
  using (public.is_manager_plus() and public.can_see_branch(branch_id))
  with check (public.is_manager_plus() and public.can_see_branch(branch_id));
