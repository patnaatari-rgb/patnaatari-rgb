/**
 * Client change request (ATARI_Updation_Pointers_15Sep2026.docx, point 13):
 * the "Bank Account Type" master's dropdown needs "KVK Main Account" and
 * "KVK Revolving Fund" added, and the existing "Saving" option removed. This
 * is zone-scoped MasterListItem data (type BANK_ACCOUNT_TYPE), not a
 * hardcoded label, so the fix is a one-off data migration across every zone
 * rather than a code change - same convention as scripts/import-bank-accounts.ts.
 *
 * Deleting the "Saving" master row does not touch any BankAccount record
 * that already has accountType: "Saving" (that column is a plain string
 * snapshot from whichever master row was picked at entry time, not a
 * foreign key) - it only removes "Saving" from the dropdown for new/edited
 * entries going forward. This script reports how many existing rows carry
 * it so that's a visible, informed decision rather than a guess.
 *
 * Run: npx tsx scripts/fix-bank-account-types.ts            (dry run)
 *      npx tsx scripts/fix-bank-account-types.ts --apply    (writes)
 */
import { config } from "dotenv";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

config({ path: ".env.local" });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const NEW_TYPES = ["KVK Main Account", "KVK Revolving Fund"];
const REMOVED_TYPE = "Saving";

async function main() {
  const apply = process.argv.includes("--apply");

  const zones = await prisma.zone.findMany({ select: { id: true, name: true } });

  for (const zone of zones) {
    const existing = await prisma.masterListItem.findMany({
      where: { zoneId: zone.id, type: "BANK_ACCOUNT_TYPE" },
    });
    const existingNames = new Set(existing.map((t) => t.name));
    const toAdd = NEW_TYPES.filter((t) => !existingNames.has(t));
    const savingRow = existing.find((t) => t.name === REMOVED_TYPE);

    const usageCount = savingRow
      ? await prisma.bankAccount.count({ where: { zoneId: zone.id, accountType: REMOVED_TYPE } })
      : 0;

    console.log(`\nZone: ${zone.name}`);
    console.log(`  Add: ${toAdd.length ? toAdd.join(", ") : "(already present)"}`);
    console.log(
      savingRow
        ? `  Remove: "${REMOVED_TYPE}" (currently used by ${usageCount} existing bank account record(s) - those rows keep their value, only the dropdown option goes away)`
        : `  Remove: "${REMOVED_TYPE}" not present, nothing to do`,
    );

    if (!apply) continue;

    for (const name of toAdd) {
      await prisma.masterListItem.create({ data: { zoneId: zone.id, type: "BANK_ACCOUNT_TYPE", name } });
    }
    if (savingRow) {
      await prisma.masterListItem.delete({ where: { id: savingRow.id } });
    }
  }

  if (!apply) {
    console.log("\nDry run only - pass --apply to write these changes.");
  } else {
    console.log("\nApplied.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
