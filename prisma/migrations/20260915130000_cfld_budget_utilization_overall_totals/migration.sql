-- Adds auto-calculated Overall Fund Received/Utilized/Balance to
-- CfldBudgetUtilization (client direction, 2026-09-15) - Received/Utilized
-- sum the 4 item rows' own Received/Utilization, Balance is Received -
-- Utilized. No existing rows at the time of this migration.
ALTER TABLE "CfldBudgetUtilization" ADD COLUMN "overallFundReceived" DECIMAL(14, 2);
ALTER TABLE "CfldBudgetUtilization" ADD COLUMN "overallFundUtilized" DECIMAL(14, 2);
ALTER TABLE "CfldBudgetUtilization" ADD COLUMN "overallBalance" DECIMAL(14, 2);
