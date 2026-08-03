-- RLS for the 'payroll-signatures' storage bucket (created via
-- services/api-fastapi/scripts/create_payroll_signatures_bucket.py).
--
-- Single global e-signature image for the HR signatory printed on payslips.
-- Executive-only: same role that can toggle the payroll engine and edit
-- multiplier rules manages this.

create policy "Executives manage payroll signature"
  on storage.objects for all
  using (
    bucket_id = 'payroll-signatures'
    and (select role from profiles where id = auth.uid()) = 'executive'
  )
  with check (
    bucket_id = 'payroll-signatures'
    and (select role from profiles where id = auth.uid()) = 'executive'
  );

create policy "Managers/Executives view payroll signature"
  on storage.objects for select
  using (
    bucket_id = 'payroll-signatures'
    and (select role from profiles where id = auth.uid()) in ('manager', 'executive')
  );
