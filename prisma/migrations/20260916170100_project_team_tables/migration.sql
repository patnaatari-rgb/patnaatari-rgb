-- Client pointer, 2026-09-15 ("All Projects - New 'Team' Addon"): one new
-- table per Project section (except Seed Hub Program, and NICRA which
-- already has its own equivalent, NicraPiCoPi), same shape as NicraPiCoPi.

-- CreateTable
CREATE TABLE "AryaProjectTeam" (
    "id" TEXT NOT NULL,
    "kvkId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "projectTeam" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AryaProjectTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NfProjectTeam" (
    "id" TEXT NOT NULL,
    "kvkId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "projectTeam" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NfProjectTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TspScspProjectTeam" (
    "id" TEXT NOT NULL,
    "kvkId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "projectTeam" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TspScspProjectTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgriDroneProjectTeam" (
    "id" TEXT NOT NULL,
    "kvkId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "projectTeam" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgriDroneProjectTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FpoProjectTeam" (
    "id" TEXT NOT NULL,
    "kvkId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "projectTeam" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FpoProjectTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrmrProjectTeam" (
    "id" TEXT NOT NULL,
    "kvkId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "projectTeam" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrmrProjectTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CraProjectTeam" (
    "id" TEXT NOT NULL,
    "kvkId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "projectTeam" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CraProjectTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsisaProjectTeam" (
    "id" TEXT NOT NULL,
    "kvkId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "projectTeam" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsisaProjectTeam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AryaProjectTeam_zoneId_idx" ON "AryaProjectTeam"("zoneId");
CREATE INDEX "AryaProjectTeam_kvkId_idx" ON "AryaProjectTeam"("kvkId");

CREATE INDEX "NfProjectTeam_zoneId_idx" ON "NfProjectTeam"("zoneId");
CREATE INDEX "NfProjectTeam_kvkId_idx" ON "NfProjectTeam"("kvkId");

CREATE INDEX "TspScspProjectTeam_zoneId_idx" ON "TspScspProjectTeam"("zoneId");
CREATE INDEX "TspScspProjectTeam_kvkId_idx" ON "TspScspProjectTeam"("kvkId");

CREATE INDEX "AgriDroneProjectTeam_zoneId_idx" ON "AgriDroneProjectTeam"("zoneId");
CREATE INDEX "AgriDroneProjectTeam_kvkId_idx" ON "AgriDroneProjectTeam"("kvkId");

CREATE INDEX "FpoProjectTeam_zoneId_idx" ON "FpoProjectTeam"("zoneId");
CREATE INDEX "FpoProjectTeam_kvkId_idx" ON "FpoProjectTeam"("kvkId");

CREATE INDEX "DrmrProjectTeam_zoneId_idx" ON "DrmrProjectTeam"("zoneId");
CREATE INDEX "DrmrProjectTeam_kvkId_idx" ON "DrmrProjectTeam"("kvkId");

CREATE INDEX "CraProjectTeam_zoneId_idx" ON "CraProjectTeam"("zoneId");
CREATE INDEX "CraProjectTeam_kvkId_idx" ON "CraProjectTeam"("kvkId");

CREATE INDEX "CsisaProjectTeam_zoneId_idx" ON "CsisaProjectTeam"("zoneId");
CREATE INDEX "CsisaProjectTeam_kvkId_idx" ON "CsisaProjectTeam"("kvkId");

-- AddForeignKey
ALTER TABLE "AryaProjectTeam" ADD CONSTRAINT "AryaProjectTeam_kvkId_fkey" FOREIGN KEY ("kvkId") REFERENCES "Kvk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NfProjectTeam" ADD CONSTRAINT "NfProjectTeam_kvkId_fkey" FOREIGN KEY ("kvkId") REFERENCES "Kvk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TspScspProjectTeam" ADD CONSTRAINT "TspScspProjectTeam_kvkId_fkey" FOREIGN KEY ("kvkId") REFERENCES "Kvk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgriDroneProjectTeam" ADD CONSTRAINT "AgriDroneProjectTeam_kvkId_fkey" FOREIGN KEY ("kvkId") REFERENCES "Kvk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FpoProjectTeam" ADD CONSTRAINT "FpoProjectTeam_kvkId_fkey" FOREIGN KEY ("kvkId") REFERENCES "Kvk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DrmrProjectTeam" ADD CONSTRAINT "DrmrProjectTeam_kvkId_fkey" FOREIGN KEY ("kvkId") REFERENCES "Kvk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CraProjectTeam" ADD CONSTRAINT "CraProjectTeam_kvkId_fkey" FOREIGN KEY ("kvkId") REFERENCES "Kvk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CsisaProjectTeam" ADD CONSTRAINT "CsisaProjectTeam_kvkId_fkey" FOREIGN KEY ("kvkId") REFERENCES "Kvk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
