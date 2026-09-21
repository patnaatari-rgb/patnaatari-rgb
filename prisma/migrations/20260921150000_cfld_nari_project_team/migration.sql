-- Extends the Project "Team" addon (migration 20260916170100) to CFLD and
-- NARI, which were missing it (client direction, 2026-09-21: Team on every
-- Project section up to, but not including, Seed Hub Program). Same shape
-- as the other Project Team tables.

-- CreateTable
CREATE TABLE "CfldProjectTeam" (
    "id" TEXT NOT NULL,
    "kvkId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "projectTeam" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CfldProjectTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NariProjectTeam" (
    "id" TEXT NOT NULL,
    "kvkId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "projectTeam" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NariProjectTeam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CfldProjectTeam_zoneId_idx" ON "CfldProjectTeam"("zoneId");
CREATE INDEX "CfldProjectTeam_kvkId_idx" ON "CfldProjectTeam"("kvkId");

CREATE INDEX "NariProjectTeam_zoneId_idx" ON "NariProjectTeam"("zoneId");
CREATE INDEX "NariProjectTeam_kvkId_idx" ON "NariProjectTeam"("kvkId");

-- AddForeignKey
ALTER TABLE "CfldProjectTeam" ADD CONSTRAINT "CfldProjectTeam_kvkId_fkey" FOREIGN KEY ("kvkId") REFERENCES "Kvk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NariProjectTeam" ADD CONSTRAINT "NariProjectTeam_kvkId_fkey" FOREIGN KEY ("kvkId") REFERENCES "Kvk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
