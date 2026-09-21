-- Adds "Retirement" to Employee Details (client pointer, 2026-09-15) - a
-- plain date field only, no automated eligibility/notification workflow
-- (client's own note: that process is yet to be finalized separately).
ALTER TABLE "Staff" ADD COLUMN "dateOfRetirement" TIMESTAMP(3);
