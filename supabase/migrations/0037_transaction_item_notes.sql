-- Free-text modifier note per line item (e.g. "Extra Sauce") -- distinct
-- from held_ingredient_ids, which removes a real recipe ingredient and
-- affects stock. A note has no inventory effect; it's informational only,
-- for cases the recipe-ingredient model can't represent (additions, not
-- removals).

alter table transaction_items add column note text;
