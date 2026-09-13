-- Client direction, 2026-09-13: "Training Program" removed from the
-- Trainings form entirely (fully redundant with Clientele/Training Type -
-- real data showed the same underlying category captured three ways). The
-- column stays, now optional, so every pre-existing row's value is
-- preserved - the report's own Clientele column already falls back to it
-- for an old row with a blank Clientele.
ALTER TABLE "Training" ALTER COLUMN "program" DROP NOT NULL;
