-- Client direction, 2026-09-13: Production and supply of Technological
-- products - "Category" field removed from the form (never a real
-- reference field), replaced by "Provided to number of farmers". The
-- column stays, now optional, so any value a KVK already entered is
-- preserved.
ALTER TABLE "TechnologyProductProduction" ALTER COLUMN "category" DROP NOT NULL;
ALTER TABLE "TechnologyProductProduction" ADD COLUMN "providedToFarmers" INTEGER;
