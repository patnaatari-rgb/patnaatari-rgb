-- Client screenshot, 2026-09-13: the real reference's own Production and
-- Supply list table has a "Reporting Year" column - server-derived from
-- Reporting Date's own year, same precedent as Trainings/Extension
-- Activities. Backfill existing rows from their own reportingDate so
-- already-entered records don't show a blank year.
ALTER TABLE "TechnologyProductProduction" ADD COLUMN "reportingYear" INTEGER;

UPDATE "TechnologyProductProduction"
SET "reportingYear" = EXTRACT(YEAR FROM "reportingDate")::INTEGER
WHERE "reportingDate" IS NOT NULL;
