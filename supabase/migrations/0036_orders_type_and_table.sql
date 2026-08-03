-- Dine In / Take Out distinction for orders, plus the table number and
-- guest count a dine-in order needs (both null for take-out).

create type order_type as enum ('dine_in', 'take_out');

alter table transactions
  add column order_type order_type not null default 'dine_in',
  add column table_number text,
  add column guest_count integer;
