/**
 * Client change request (ATARI_Updation_Pointers_15Sep2026.docx, point 15):
 * "Celebration of important days" needs an "Other" option in the
 * "Important Days" dropdown. Same mechanism as fix-cra-master-data.ts - the
 * "Others" mechanic already exists in code (MasterFormFields passes
 * enableOtherOption={recordKind === "form"} for every Form Management leaf);
 * the IMPORTANT_DAY master just has no row flagged isOther yet (confirmed
 * 2026-09-16: zero such rows across 39 existing Important Day values), so
 * this is a one-off data fix, not a code change.
 *
 * Confirmed 2026-09-16: zero CelebrationDay records exist yet, so there is
 * nothing already saved that this could affect.
 *
 * Run: npx tsx scripts/fix-important-day-others.ts            (dry run)
 *      npx tsx scripts/fix-important-day-others.ts --apply    (writes)
 */
import { config } from "dotenv";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

config({ path: ".env.local" });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const apply = process.argv.includes("--apply");

  const zones = await prisma.zone.findMany({ select: { id: true, name: true } });

  for (const zone of zones) {
    const existing = await prisma.masterListItem.findMany({ where: { zoneId: zone.id, type: "IMPORTANT_DAY" } });
    const hasOther = existing.some((r) => r.isOther || r.name.trim().toLowerCase() === "others");

    console.log(`\nZone: ${zone.name}`);
    console.log(`  Add "Others": ${hasOther ? "already present" : "yes"}`);

    if (!apply || hasOther) continue;

    await prisma.masterListItem.create({ data: { zoneId: zone.id, type: "IMPORTANT_DAY", name: "Others", isOther: true } });
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
