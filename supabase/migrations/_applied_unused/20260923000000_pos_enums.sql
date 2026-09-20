-- Enum values needed by the ported Oishii POS (separate migration: must be committed before use)
alter type public.order_type add value if not exists 'delivery';
alter type public.movement_type add value if not exists 'sale_consumption';
