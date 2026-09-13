-- Client direction, 2026-09-13: "No. of Participant" on Extension & Training
-- activities under FLD splits into real Male/Female fields. The existing
-- combined `participantCount` column stays exactly as-is (report/list
-- structure unchanged) - it's now server-computed as Male + Female on every
-- save instead of its own form input. No pre-existing row can be split
-- retroactively, so the two new columns start null on old rows.
ALTER TABLE "FldExtensionTraining" ADD COLUMN "participantCountMale" INTEGER;
ALTER TABLE "FldExtensionTraining" ADD COLUMN "participantCountFemale" INTEGER;
