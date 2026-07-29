-- Minimal RLS so a logged-in user can read their own profile + branch name
-- during login. Full branch/role scoping (managers -> own branch, execs ->
-- all branches) is Phase 3 per docs/backend-execution-plan.md §8 step 9;
-- this is just enough to unblock the login flow built in Phase 1.

alter table profiles enable row level security;

create policy "Users can read their own profile"
  on profiles for select
  using (auth.uid() = id);

alter table branches enable row level security;

create policy "Authenticated users can read branches"
  on branches for select
  using (auth.role() = 'authenticated');
