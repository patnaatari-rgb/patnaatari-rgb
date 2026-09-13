-- Client direction, 2026-09-13: Training Type Master gains a real "Mark as
-- Other" flag - same isOther convention every other master already has -
-- so it can offer a working "Other" option (opening free text) like the
-- rest of the app, not a plain unflagged row.
ALTER TABLE "TrainingTypeMaster" ADD COLUMN "isOther" BOOLEAN NOT NULL DEFAULT false;
