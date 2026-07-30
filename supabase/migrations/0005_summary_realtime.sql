-- Enables Supabase Realtime broadcast for the tables the Executive Command
-- Center subscribes to (see apps/dashboard-web/client/src/pages/CommandCenter.tsx).
-- Without this, postgres_changes subscriptions on these tables silently
-- receive nothing — INSERTs happen but never reach the client, even though
-- the client-side subscription code is otherwise correct. Supabase's
-- `supabase_realtime` publication is empty by default; tables must be added
-- explicitly.

alter publication supabase_realtime add table transactions;
alter publication supabase_realtime add table loss_records;
