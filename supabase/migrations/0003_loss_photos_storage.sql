-- RLS for the 'loss-photos' storage bucket (created via
-- services/api-fastapi/scripts/create_loss_photos_bucket.py).
--
-- Path convention: {branch_id}/{uuid}.{ext} -- the first folder segment is
-- the branch the photo belongs to. Employees/managers can only upload and
-- view photos under their own branch's folder; executives can view any.
-- Photos are immutable once uploaded (no update/delete policy) since they
-- serve as loss/defect evidence.

create policy "Branch members can upload loss photos to their branch folder"
  on storage.objects for insert
  with check (
    bucket_id = 'loss-photos'
    and (
      (storage.foldername(name))[1] = (
        select branch_id::text from profiles where id = auth.uid()
      )
      or (select role from profiles where id = auth.uid()) = 'executive'
    )
  );

create policy "Branch members can view their branch's loss photos"
  on storage.objects for select
  using (
    bucket_id = 'loss-photos'
    and (
      (storage.foldername(name))[1] = (
        select branch_id::text from profiles where id = auth.uid()
      )
      or (select role from profiles where id = auth.uid()) = 'executive'
    )
  );
