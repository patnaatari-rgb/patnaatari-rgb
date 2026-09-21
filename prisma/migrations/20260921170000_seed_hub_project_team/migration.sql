-- Adds the Project "Team" addon to Seed Hub Program (client direction,
-- 2026-09-21), which the earlier Team migrations had left out. Only Other
-- Programmes, the last Project section, now has no Team. Same shape as the
-- other Project Team tables.

-- CreateTable
CREATE TABLE "SeedHubProjectTeam" (
    "id" TEXT NOT NULL,
    "kvkId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "projectTeam" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedHubProjectTeam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeedHubProjectTeam_zoneId_idx" ON "SeedHubProjectTeam"("zoneId");
CREATE INDEX "SeedHubProjectTeam_kvkId_idx" ON "SeedHubProjectTeam"("kvkId");

-- AddForeignKey
ALTER TABLE "SeedHubProjectTeam" ADD CONSTRAINT "SeedHubProjectTeam_kvkId_fkey" FOREIGN KEY ("kvkId") REFERENCES "Kvk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
