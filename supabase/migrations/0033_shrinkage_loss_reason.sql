-- Adds a loss reason specifically for count-driven shrinkage (unexplained
-- inventory drift discovered during a stock count), distinct from
-- spoilage/breakage/comp/prep_error which all describe a known cause.
-- Own migration/transaction, same reasoning as 0032.

alter type loss_reason add value 'shrinkage';
