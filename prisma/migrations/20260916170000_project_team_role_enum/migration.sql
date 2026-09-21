-- AlterEnum
-- Client pointer, 2026-09-15 ("All Projects - New 'Team' Addon"): the role
-- dropdown for the new "Team" leaf, shared across every Project section.
-- Kept in its own migration (not combined with the table-creation migration
-- below) since Postgres won't let a new enum value be used in the same
-- transaction it was added in.
ALTER TYPE "MasterListType" ADD VALUE 'PROJECT_TEAM_ROLE';
