-- Client pointer, 2026-09-15 (Celebration of Important Days):
-- 1) "Event Date" -> real Start/End Date pair (renames the old column,
--    zero existing CelebrationDay rows at the time of this migration, so a
--    plain NOT NULL add for endDate needs no backfill).
-- 2) A third beneficiary category - "Public Representative/Other VIPs/
--    Dignitaries/Government Officials" - same breakdown shape as
--    Farmers/Extension Officials, plus a combined Name/Designation/Address
--    field.
ALTER TABLE "CelebrationDay" RENAME COLUMN "eventDate" TO "startDate";
ALTER TABLE "CelebrationDay" ADD COLUMN "endDate" TIMESTAMP(3) NOT NULL;

ALTER TABLE "CelebrationDay" ADD COLUMN "vipGeneralMale" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CelebrationDay" ADD COLUMN "vipGeneralFemale" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CelebrationDay" ADD COLUMN "vipObcMale" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CelebrationDay" ADD COLUMN "vipObcFemale" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CelebrationDay" ADD COLUMN "vipScMale" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CelebrationDay" ADD COLUMN "vipScFemale" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CelebrationDay" ADD COLUMN "vipStMale" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CelebrationDay" ADD COLUMN "vipStFemale" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CelebrationDay" ADD COLUMN "vipNameDesignationAddress" TEXT;
