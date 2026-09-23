-- Host Organisation login role (client request, 2026-09-24): org_admin was
-- seeded with authLevel KVK_USER as a safe-default placeholder (schema.prisma
-- comment on AuthLevel) since no scoped view existed for it. This adds the
-- real enforcement level; prisma/seed-roles.ts's org_admin entry is updated
-- to use it, and existing org_admin-role users (if any) are backfilled by a
-- one-off script, not by this migration (AuthLevel is denormalized onto
-- User.role at creation time, not re-derived from Role.authLevel).

-- AlterEnum
ALTER TYPE "AuthLevel" ADD VALUE 'ORG_ADMIN';
