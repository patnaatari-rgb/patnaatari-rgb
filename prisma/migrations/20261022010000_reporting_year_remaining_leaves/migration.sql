-- Reporting Year added to leaves that had no year or date column, so their
-- year filter and year-wise report scoping work. Existing rows take the year
-- they were created in.

-- DistrictMonthlyWeather exists in the live database but no earlier migration
-- ever created it. Guarded so a fresh database built from migrations alone
-- gets the table too, and the existing database is left untouched.
CREATE TABLE IF NOT EXISTS "DistrictMonthlyWeather" (
    "id" TEXT NOT NULL,
    "kvkId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "rainfallMm" DECIMAL(10,2),
    "maxTempC" DECIMAL(6,2),
    "minTempC" DECIMAL(6,2),
    "maxRhPct" DECIMAL(6,2),
    "minRhPct" DECIMAL(6,2),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistrictMonthlyWeather_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DistrictMonthlyWeather_zoneId_idx" ON "DistrictMonthlyWeather"("zoneId");
CREATE INDEX IF NOT EXISTS "DistrictMonthlyWeather_kvkId_idx" ON "DistrictMonthlyWeather"("kvkId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DistrictMonthlyWeather_kvkId_fkey') THEN
        ALTER TABLE "DistrictMonthlyWeather" ADD CONSTRAINT "DistrictMonthlyWeather_kvkId_fkey" FOREIGN KEY ("kvkId") REFERENCES "Kvk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "DistrictCropProductivity" ADD COLUMN "reportingYear" INTEGER;
UPDATE "DistrictCropProductivity" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "DistrictCropProductivity" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "DistrictCropProductivity_kvkId_reportingYear_idx" ON "DistrictCropProductivity"("kvkId", "reportingYear");

ALTER TABLE "DistrictMonthlyWeather" ADD COLUMN "reportingYear" INTEGER;
UPDATE "DistrictMonthlyWeather" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "DistrictMonthlyWeather" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "DistrictMonthlyWeather_kvkId_reportingYear_idx" ON "DistrictMonthlyWeather"("kvkId", "reportingYear");

ALTER TABLE "DistrictLivestockProduction" ADD COLUMN "reportingYear" INTEGER;
UPDATE "DistrictLivestockProduction" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "DistrictLivestockProduction" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "DistrictLivestockProduction_kvkId_reportingYear_idx" ON "DistrictLivestockProduction"("kvkId", "reportingYear");

ALTER TABLE "RainWaterHarvesting" ADD COLUMN "reportingYear" INTEGER;
UPDATE "RainWaterHarvesting" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "RainWaterHarvesting" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "RainWaterHarvesting_kvkId_reportingYear_idx" ON "RainWaterHarvesting"("kvkId", "reportingYear");

ALTER TABLE "CfldBudgetUtilization" ADD COLUMN "reportingYear" INTEGER;
UPDATE "CfldBudgetUtilization" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "CfldBudgetUtilization" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "CfldBudgetUtilization_kvkId_reportingYear_idx" ON "CfldBudgetUtilization"("kvkId", "reportingYear");

ALTER TABLE "CfldCropWiseImage" ADD COLUMN "reportingYear" INTEGER;
UPDATE "CfldCropWiseImage" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "CfldCropWiseImage" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "CfldCropWiseImage_kvkId_reportingYear_idx" ON "CfldCropWiseImage"("kvkId", "reportingYear");

ALTER TABLE "NicraDetails" ADD COLUMN "reportingYear" INTEGER;
UPDATE "NicraDetails" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "NicraDetails" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "NicraDetails_kvkId_reportingYear_idx" ON "NicraDetails"("kvkId", "reportingYear");

ALTER TABLE "NicraCustomHiringFarmImplement" ADD COLUMN "reportingYear" INTEGER;
UPDATE "NicraCustomHiringFarmImplement" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "NicraCustomHiringFarmImplement" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "NicraCustomHiringFarmImplement_kvkId_reportingYear_idx" ON "NicraCustomHiringFarmImplement"("kvkId", "reportingYear");

ALTER TABLE "NfDemonstrationInfo" ADD COLUMN "reportingYear" INTEGER;
UPDATE "NfDemonstrationInfo" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "NfDemonstrationInfo" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "NfDemonstrationInfo_kvkId_reportingYear_idx" ON "NfDemonstrationInfo"("kvkId", "reportingYear");

ALTER TABLE "NfSoilData" ADD COLUMN "reportingYear" INTEGER;
UPDATE "NfSoilData" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "NfSoilData" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "NfSoilData_kvkId_reportingYear_idx" ON "NfSoilData"("kvkId", "reportingYear");

ALTER TABLE "NfBudgetExpenditure" ADD COLUMN "reportingYear" INTEGER;
UPDATE "NfBudgetExpenditure" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "NfBudgetExpenditure" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "NfBudgetExpenditure_kvkId_reportingYear_idx" ON "NfBudgetExpenditure"("kvkId", "reportingYear");

ALTER TABLE "SubPlanActivity" ADD COLUMN "reportingYear" INTEGER;
UPDATE "SubPlanActivity" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "SubPlanActivity" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "SubPlanActivity_kvkId_reportingYear_idx" ON "SubPlanActivity"("kvkId", "reportingYear");

ALTER TABLE "NariNutritionGarden" ADD COLUMN "reportingYear" INTEGER;
UPDATE "NariNutritionGarden" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "NariNutritionGarden" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "NariNutritionGarden_kvkId_reportingYear_idx" ON "NariNutritionGarden"("kvkId", "reportingYear");

ALTER TABLE "NariBioFortified" ADD COLUMN "reportingYear" INTEGER;
UPDATE "NariBioFortified" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "NariBioFortified" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "NariBioFortified_kvkId_reportingYear_idx" ON "NariBioFortified"("kvkId", "reportingYear");

ALTER TABLE "NariValueAddition" ADD COLUMN "reportingYear" INTEGER;
UPDATE "NariValueAddition" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "NariValueAddition" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "NariValueAddition_kvkId_reportingYear_idx" ON "NariValueAddition"("kvkId", "reportingYear");

ALTER TABLE "NariTraining" ADD COLUMN "reportingYear" INTEGER;
UPDATE "NariTraining" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "NariTraining" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "NariTraining_kvkId_reportingYear_idx" ON "NariTraining"("kvkId", "reportingYear");

ALTER TABLE "NariExtension" ADD COLUMN "reportingYear" INTEGER;
UPDATE "NariExtension" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "NariExtension" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "NariExtension_kvkId_reportingYear_idx" ON "NariExtension"("kvkId", "reportingYear");

ALTER TABLE "FpoCbboDetail" ADD COLUMN "reportingYear" INTEGER;
UPDATE "FpoCbboDetail" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "FpoCbboDetail" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "FpoCbboDetail_kvkId_reportingYear_idx" ON "FpoCbboDetail"("kvkId", "reportingYear");

ALTER TABLE "DrmrDetail" ADD COLUMN "reportingYear" INTEGER;
UPDATE "DrmrDetail" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "DrmrDetail" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "DrmrDetail_kvkId_reportingYear_idx" ON "DrmrDetail"("kvkId", "reportingYear");

ALTER TABLE "CraDetail" ADD COLUMN "reportingYear" INTEGER;
UPDATE "CraDetail" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "CraDetail" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "CraDetail_kvkId_reportingYear_idx" ON "CraDetail"("kvkId", "reportingYear");

ALTER TABLE "SeedHubProgram" ADD COLUMN "reportingYear" INTEGER;
UPDATE "SeedHubProgram" SET "reportingYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "SeedHubProgram" ALTER COLUMN "reportingYear" SET NOT NULL;
CREATE INDEX "SeedHubProgram_kvkId_reportingYear_idx" ON "SeedHubProgram"("kvkId", "reportingYear");
