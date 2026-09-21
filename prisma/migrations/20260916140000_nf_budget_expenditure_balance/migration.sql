-- Adds auto-calculated Balance to NfBudgetExpenditure (client pointer,
-- 2026-09-15) - Balance = Budget Receipt (budgetSanction) - Budget
-- Expenditure, same diffOf pattern as CfldBudgetUtilization's own Balance
-- fields. No existing rows carry a value for it.
ALTER TABLE "NfBudgetExpenditure" ADD COLUMN "balance" DECIMAL(14, 2);
