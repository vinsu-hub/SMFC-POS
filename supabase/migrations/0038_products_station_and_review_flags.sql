-- Kitchen station routing for products (which Kitchen Display column an
-- order's items show up on), a stored product photo path, and review
-- flags for data seeded without real numbers (menu import had no prices,
-- no recipe quantities, and stations were only a best-guess heuristic --
-- each flag makes that visible in the UI rather than silently treating
-- placeholder data as production-ready).

create type kitchen_station as enum ('grill', 'fryer', 'bar', 'coffee', 'dessert');

alter table products
  add column station kitchen_station,
  add column needs_station_review boolean not null default false,
  add column needs_pricing boolean not null default false,
  add column image_path text;

alter table recipe_items
  add column needs_quantity_review boolean not null default false;

alter table ingredients
  add column needs_review boolean not null default false;
