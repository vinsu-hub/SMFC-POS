-- Gas (tank/canister) becomes a loggable utility type alongside electricity
-- and water. ALTER TYPE ... ADD VALUE must run in its own migration,
-- separate from anything that uses it (see 0012, 0015).

alter type utility_type add value if not exists 'gas';
