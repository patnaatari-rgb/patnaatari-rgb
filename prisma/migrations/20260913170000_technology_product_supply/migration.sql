-- Client direction, 2026-09-13: "Sell/Supply" - a separate leaf tracking
-- when a KVK-produced product is supplied/sold, alongside the existing
-- Production record.
CREATE TABLE "TechnologyProductSupply" (
    "id" TEXT NOT NULL,
    "kvkId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "supplyDate" TIMESTAMP(3),
    "product" TEXT NOT NULL,
    "unit" TEXT,
    "quantitySupplied" DECIMAL(14,2) NOT NULL,
    "providedToFarmers" INTEGER,
    "amountRealized" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnologyProductSupply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TechnologyProductSupply_zoneId_idx" ON "TechnologyProductSupply"("zoneId");

CREATE INDEX "TechnologyProductSupply_kvkId_idx" ON "TechnologyProductSupply"("kvkId");

ALTER TABLE "TechnologyProductSupply" ADD CONSTRAINT "TechnologyProductSupply_kvkId_fkey" FOREIGN KEY ("kvkId") REFERENCES "Kvk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
