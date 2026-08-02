-- Lets a line item record which of its recipe ingredients the customer
-- asked to hold (e.g. "Oysters, no rice"). The unused ingredient stock for
-- a held ingredient is returned to inventory (see routers/transactions.py's
-- new PATCH /transactions/{id}/items/{item_id}), logged via the existing
-- inventory_movements table rather than a new "variance" table.
alter table transaction_items add column held_ingredient_ids uuid[] not null default '{}';
