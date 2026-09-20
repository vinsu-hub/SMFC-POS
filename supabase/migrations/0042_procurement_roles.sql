-- New roles for the procurement pipeline. Separate migration: new enum values
-- must be committed before they can be referenced by policies/functions.
alter type public.user_role add value if not exists 'procurement';
alter type public.user_role add value if not exists 'finance_admin';
alter type public.user_role add value if not exists 'canvasser';
