-- The Catering branch was added to the frontend's BRANCH_CONFIG and referenced
-- throughout the session, but branch_type (0001) only defines
-- 'fine_dining' | 'cafe' | 'bar' — inserting a branch with type 'catering'
-- fails with "invalid input value for enum branch_type". ALTER TYPE ... ADD VALUE
-- must run in its own migration/transaction, separate from anything that uses it.

alter type branch_type add value if not exists 'catering';
