-- Adds a movement type for stock counts so a count produces a real audit
-- row (previous stock, counted stock, signed variance) in inventory_movements
-- instead of a silent overwrite. Own migration/transaction: Postgres
-- requires a newly added enum value to be committed before it's usable
-- elsewhere.

alter type movement_type add value 'count_adjustment';
