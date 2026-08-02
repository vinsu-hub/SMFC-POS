-- Gas is tank/canister consumption logged in 1-7 day batches, not a meter
-- reading delta like electricity/water — reading_start/reading_end don't
-- apply. Add nullable columns for gas instead of a separate table so gas
-- still feeds the existing utility_consumption view / summary endpoints.

alter table utility_logs add column quantity numeric;
alter table utility_logs add column unit_label text;
alter table utility_logs add column days_covered int check (days_covered is null or (days_covered >= 1 and days_covered <= 7));

-- Gas logs have no meter start reading.
alter table utility_logs alter column reading_start drop not null;

-- The original unique constraint assumed one reading per branch/type/day,
-- which doesn't hold for gas (a single entry can cover up to 7 days, and
-- multiple gas logs may share a business_date). Replace it with a partial
-- unique index scoped to electricity/water only.
alter table utility_logs drop constraint utility_logs_branch_id_utility_type_business_date_key;

create unique index utility_logs_meter_unique
  on utility_logs (branch_id, utility_type, business_date)
  where utility_type in ('electricity', 'water');

-- Recompute the view so gas rows (which use `quantity` directly) compute
-- consumption/cost alongside electricity/water (reading_end - reading_start).
-- New columns must be appended after the original set, in the original
-- order — CREATE OR REPLACE VIEW errors if an existing column's ordinal
-- position changes (Postgres error 42P16).
create or replace view utility_consumption as
select
  ul.id,
  ul.branch_id,
  b.name as branch_name,
  ul.utility_type,
  ul.business_date,
  ul.reading_start,
  ul.reading_end,
  coalesce(ul.reading_end - ul.reading_start, ul.quantity) as consumption,
  ul.unit_cost,
  coalesce(ul.reading_end - ul.reading_start, ul.quantity) * ul.unit_cost as cost,
  ul.recorded_by,
  ul.created_at,
  ul.updated_at,
  ul.quantity,
  ul.unit_label,
  ul.days_covered
from utility_logs ul
join branches b on b.id = ul.branch_id
where ul.reading_end is not null or ul.quantity is not null;
