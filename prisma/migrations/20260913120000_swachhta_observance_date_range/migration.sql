-- Client direction, 2026-09-13: Swachhta hi Sewa / Swachta Pakhwada's single
-- "Date Duration of Observation" text field is replaced by a real From/To
-- date range on the form. The old column stays (now optional) so every
-- pre-existing row's original value is preserved, not dropped - it's just
-- no longer written by the form. Existing rows are backfilled separately
-- (fromDate = toDate = the old single date) so no row is left with a blank
-- range.
ALTER TABLE "SwachhtaObservance" ALTER COLUMN "dateDurationOfObservation" DROP NOT NULL;
ALTER TABLE "SwachhtaObservance" ADD COLUMN "fromDate" TIMESTAMP(3);
ALTER TABLE "SwachhtaObservance" ADD COLUMN "toDate" TIMESTAMP(3);
