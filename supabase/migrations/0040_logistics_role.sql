-- New company-wide role for moving stock between branches (transfers / stock requests).
-- Separate migration: a new enum value must be committed before it can be referenced.
alter type public.user_role add value if not exists 'logistics';
