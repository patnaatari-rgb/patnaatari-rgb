-- Splits CfldExtensionActivity's single "activitiesOrganized" text field into
-- a real Name dropdown (sourced from the Extension Activity Master, same as
-- the sibling "Extension Activities" leaf's own Name field) plus a separate
-- numeric count - client direction, 2026-09-15. No existing rows at the time
-- of this migration, so the type change carries no data-loss risk.
ALTER TABLE "CfldExtensionActivity" ADD COLUMN "activityName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CfldExtensionActivity" ALTER COLUMN "activitiesOrganized" TYPE INTEGER USING 0;
ALTER TABLE "CfldExtensionActivity" ALTER COLUMN "activityName" DROP DEFAULT;
