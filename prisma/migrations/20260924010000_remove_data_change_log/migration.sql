-- Data Audit Log feature removed entirely (client direction, 2026-09-24) -
-- reverses 20260922120000_data_change_log.

-- DropForeignKey
ALTER TABLE "DataChangeLog" DROP CONSTRAINT IF EXISTS "DataChangeLog_userId_fkey";
ALTER TABLE "DataChangeLog" DROP CONSTRAINT IF EXISTS "DataChangeLog_roleId_fkey";
ALTER TABLE "DataChangeLog" DROP CONSTRAINT IF EXISTS "DataChangeLog_kvkId_fkey";

-- DropTable
DROP TABLE IF EXISTS "DataChangeLog";

-- DropEnum
DROP TYPE IF EXISTS "DataChangeAction";
