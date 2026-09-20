These five migrations were applied to the shared Supabase project (2026-09-20/21) while a Supabase-only
POS port was prototyped in the `saint_michael_pos` repo (business days, `create_pos_transaction`, order numbers,
add-ons, delivery, reservations, `void_transaction`, bcrypt `$2b$` PIN fix).
The production dashboard uses the FastAPI POS instead, so nothing here is used by this app. They are kept only so the
repo matches the database. Decide later whether to drop these objects. Do not re-run them.
Note `20260923000000_pos_schema.sql` also added columns to `transactions` (payment_method, card_type, force_vat_exempt,
order_number, related_transaction_id) and an order_number trigger; FastAPI inserts still work (verified).
