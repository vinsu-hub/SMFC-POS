-- Procurement/finance/executive can read profiles of procurement-team members
-- (to assign canvassers and show who signed a PO). Branch staff profiles stay private.
create policy "proc team reads proc team profiles" on public.profiles for select to authenticated
  using (public.is_role('procurement', 'finance_admin', 'executive')
         and role in ('procurement', 'finance_admin', 'canvasser'));
