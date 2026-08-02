-- Order fulfillment status (kitchen/counter "done", e.g. served/handed off)
-- is separate from payment status (open/closed/voided) - a closed
-- (paid) transaction can still be sitting unfulfilled in the queue.
-- Marking an order fulfilled is what removes it from the active Order
-- Queue view.
alter table transactions add column fulfilled boolean not null default false;
alter table transactions add column fulfilled_at timestamptz;
