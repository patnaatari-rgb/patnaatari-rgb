/**
 * Client change request (ATARI_Updation_Pointers_15Sep2026.docx, point 10):
 * CRA Details' "Cropping System" and "Farming System" dropdowns need an
 * "Others" choice, and every option's text needs to start with a capital
 * letter, consistently.
 *
 * The "Others" mechanic already exists in code (MasterFormFields passes
 * enableOtherOption={recordKind === "form"} for every Form Management leaf,
 * and treats any master row flagged isOther, or literally named "Other"/
 * "Others", as the free-text escape hatch - see other-aware-select.tsx /
 * master-form-fields.tsx). Neither CroppingSystemMaster nor
 * FarmingSystemMaster has such a row yet (confirmed 2026-09-16: zero rows
 * with isOther: true in either table), so this is a one-off data fix, not a
 * code change - same convention as fix-bank-account-types.ts.
 *
 * Capitalization: only the first character of each cropName/
 * farmingSystemName is touched (client's literal ask is "start with a
 * capital letter" - not a full re-casing of every word), so e.g.
 * "pearl millet- Mustard- Maize" becomes "Pearl millet- Mustard- Maize" but
 * "PADDY-LENTIL-GREENGRAM(Ongoing)" is left as-is (it already starts with a
 * capital letter).
 *
 * Confirmed 2026-09-16: zero CraDetail records exist yet, so there is
 * nothing already saved against the old (lowercase-starting) option text to
 * break.
 *
 * Run: npx tsx scripts/fix-cra-master-data.ts            (dry run)
 *      npx tsx scripts/fix-cra-master-data.ts --apply    (writes)
 */
import { config } from "dotenv";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

config({ path: ".env.local" });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function capitalizeFirst(s: string): string | null {
  if (!s) return null;
  const first = s[0];
  const upper = first.toUpperCase();
  return upper === first ? null : upper + s.slice(1);
}

async function main() {
  const apply = process.argv.includes("--apply");

  const zones = await prisma.zone.findMany({ select: { id: true, name: true } });

  for (const zone of zones) {
    console.log(`\nZone: ${zone.name}`);

    // --- Cropping System Master ---
    const cropRows = await prisma.croppingSystemMaster.findMany({ where: { zoneId: zone.id } });
    const hasCropOther = cropRows.some((r) => r.isOther || r.cropName.trim().toLowerCase() === "others");
    console.log(`  Cropping System - Add "Others": ${hasCropOther ? "already present" : "yes"}`);
    const cropFixes = cropRows
      .map((r) => ({ id: r.id, from: r.cropName, to: capitalizeFirst(r.cropName) }))
      .filter((f) => f.to);
    for (const f of cropFixes) console.log(`  Cropping System - Capitalize: "${f.from}" -> "${f.to}"`);

    // --- Farming System Master ---
    const farmRows = await prisma.farmingSystemMaster.findMany({ where: { zoneId: zone.id } });
    const hasFarmOther = farmRows.some((r) => r.isOther || r.farmingSystemName.trim().toLowerCase() === "others");
    console.log(`  Farming System - Add "Others": ${hasFarmOther ? "already present" : "yes"}`);
    const farmFixes = farmRows
      .map((r) => ({ id: r.id, from: r.farmingSystemName, to: capitalizeFirst(r.farmingSystemName) }))
      .filter((f) => f.to);
    for (const f of farmFixes) console.log(`  Farming System - Capitalize: "${f.from}" -> "${f.to}"`);

    if (!apply) continue;

    if (!hasCropOther) {
      await prisma.croppingSystemMaster.create({
        data: { zoneId: zone.id, season: "Rabi", cropName: "Others", isOther: true },
      });
    }
    for (const f of cropFixes) {
      await prisma.croppingSystemMaster.update({ where: { id: f.id }, data: { cropName: f.to! } });
    }

    if (!hasFarmOther) {
      await prisma.farmingSystemMaster.create({
        data: { zoneId: zone.id, season: "Rabi", farmingSystemName: "Others", isOther: true },
      });
    }
    for (const f of farmFixes) {
      await prisma.farmingSystemMaster.update({ where: { id: f.id }, data: { farmingSystemName: f.to! } });
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
