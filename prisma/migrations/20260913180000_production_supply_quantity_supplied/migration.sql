-- Correction, 2026-09-13: Sell/Supply is NOT a separate leaf/table after all
-- (client direction: "sell/supply production ke andar hi banega") - real
-- reference screenshot confirmed the "Quantity Sold/Supplied" field sits
-- directly on the same Production and Supply form, right after Value (Rs).
-- Drop the separate table from the previous migration; add the field here
-- instead.
DROP TABLE "TechnologyProductSupply";

ALTER TABLE "TechnologyProductProduction" ADD COLUMN "quantitySupplied" DECIMAL(14,2);
