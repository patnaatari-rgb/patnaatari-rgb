-- Audit trail for data changes (security review, 2026-09-22): Log History
-- covered sign-ins only. Written centrally from the 8 generic create/update/
-- delete routes, not from inside each leaf handler - see the model's own
-- comment in schema.prisma for what "values" does and does not capture.

-- CreateEnum
CREATE TYPE "DataChangeAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "DataChangeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "username" TEXT NOT NULL,
    "roleId" TEXT,
    "kvkId" TEXT,
    "kvkName" TEXT,
    "zoneId" TEXT NOT NULL,
    "action" "DataChangeAction" NOT NULL,
    "formPath" TEXT NOT NULL,
    "formLabel" TEXT,
    "recordId" TEXT,
    "values" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataChangeLog_zoneId_createdAt_idx" ON "DataChangeLog"("zoneId", "createdAt");
CREATE INDEX "DataChangeLog_kvkId_idx" ON "DataChangeLog"("kvkId");
CREATE INDEX "DataChangeLog_formPath_idx" ON "DataChangeLog"("formPath");

-- AddForeignKey
ALTER TABLE "DataChangeLog" ADD CONSTRAINT "DataChangeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DataChangeLog" ADD CONSTRAINT "DataChangeLog_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DataChangeLog" ADD CONSTRAINT "DataChangeLog_kvkId_fkey" FOREIGN KEY ("kvkId") REFERENCES "Kvk"("id") ON DELETE SET NULL ON UPDATE CASCADE;
