-- RLS for the 'product-images' storage bucket (created via
-- services/api-fastapi/scripts/create_product_images_bucket.py).
--
-- Unlike loss-photos/payroll-signatures, this bucket is public (read-heavy,
-- rendered on every POS product card, and product photos aren't sensitive
-- the way loss evidence or signatures are) -- so no SELECT policy is
-- needed, the bucket's public flag serves reads directly. Writes are still
-- restricted: product photos are a managed asset, not something an
-- employee uploads mid-shift.
--
-- Path convention: {branch_id}/{product_id}.{ext}, matching the
-- {branch_id}/... convention loss-photos already uses.

create policy "Managers/Executives upload product images for own branch"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and (
      (
        (storage.foldername(name))[1] = (
          select branch_id::text from profiles where id = auth.uid()
        )
        and (select role from profiles where id = auth.uid()) = 'manager'
      )
      or (select role from profiles where id = auth.uid()) = 'executive'
    )
  );

create policy "Managers/Executives replace product images for own branch"
  on storage.objects for update
  using (
    bucket_id = 'product-images'
    and (
      (
        (storage.foldername(name))[1] = (
          select branch_id::text from profiles where id = auth.uid()
        )
        and (select role from profiles where id = auth.uid()) = 'manager'
      )
      or (select role from profiles where id = auth.uid()) = 'executive'
    )
  );

-- Item-level notes (transaction_items) need to reach Kitchen Display/Order
-- Queue live -- transactions is already on the realtime publication
-- (migration 0005), transaction_items was not.
alter publication supabase_realtime add table transaction_items;
