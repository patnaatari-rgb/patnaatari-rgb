-- Client direction, 2026-09-13: Sell/Supply's own "Value (Rs)" - how much
-- money the sold/supplied quantity realized, mirroring Production's own
-- Value (Rs) field.
ALTER TABLE "TechnologyProductProduction" ADD COLUMN "supplyValue" DECIMAL(14,2);
