-- D'Venue Events Place and Isabela's Signature Caterer replace the old
-- catch-all "Catering" branch as two distinct companies. branch_type is
-- purely descriptive (no Python/RLS code reads it), but each new company
-- gets its own value for accuracy. ALTER TYPE ... ADD VALUE must run in its
-- own migration/transaction, separate from anything that uses it (see 0012).

alter type branch_type add value if not exists 'events_venue';
alter type branch_type add value if not exists 'catering_service';
