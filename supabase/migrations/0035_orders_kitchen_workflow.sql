-- Kitchen workflow status for orders (Queued/Preparing/Ready/Completed),
-- distinct from transactions.status (payment state: open/closed/voided).
-- Replaces the old fulfilled/fulfilled_at boolean as the single source of
-- truth for "is this order done" -- fulfilled/fulfilled_at are left in
-- place, just no longer written to by application code, rather than
-- dropped outright.

create type kitchen_status as enum ('queued', 'preparing', 'ready', 'completed');

alter table transactions
  add column kitchen_status kitchen_status not null default 'queued',
  add column kitchen_status_updated_at timestamptz not null default now();

update transactions
  set kitchen_status = 'completed',
      kitchen_status_updated_at = coalesce(fulfilled_at, now())
  where fulfilled = true;

create index idx_transactions_kitchen_status on transactions(branch_id, kitchen_status);
