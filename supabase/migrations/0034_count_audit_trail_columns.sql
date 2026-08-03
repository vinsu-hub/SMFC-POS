-- Audit-trail columns for stock counts.
--
-- inventory_movements gains previous_stock/counted_stock/variance: quantity
-- stays an unsigned magnitude (existing check (quantity > 0) constraint),
-- so a signed variance is needed to know whether a count_adjustment row
-- was an overage or a shortage.
--
-- loss_records gains reference_id, linking a shrinkage loss back to the
-- count_adjustment movement that produced it -- same unconstrained-uuid
-- pattern inventory_movements.reference_id already uses for transfers.

alter table inventory_movements
  add column previous_stock numeric,
  add column counted_stock numeric,
  add column variance numeric;

alter table loss_records
  add column reference_id uuid;
