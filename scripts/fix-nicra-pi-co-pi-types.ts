/**
 * NICRA "Project Team Detail" role dropdown (MasterListItem type
 * NICRA_PI_CO_PI_TYPE, zone-scoped master data - not a hardcoded label).
 *
 * History: the original options were PI / Co-PI. Client pointer 15 Sep 2026
 * (point 5) replaced them with Nodal Officer, CCPI and Associate Member;
 * client direction 21 Sep 2026 asks for PI and Co-PI back alongside those
 * three. The final list is therefore all five.
 *
 * Additive only: adds whichever of the five a zone is missing, never removes
 * or renames a row, so records already saved against any existing option
 * (NicraPiCoPi.piCoPi stores the option's text) are left untouched.
 * Idempotent - safe to re-run.
 *
 * Run: npx tsx scripts/fix-nicra-pi-co-pi-types.ts            (dry run)
 *      npx tsx scripts/fix-nicra-pi-co-pi-types.ts --apply    (writes)
 */
import { config } from "dotenv";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

config({ path: ".env.local" });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const TYPES = ["PI", "Co-PI", "Nodal Officer", "CCPI", "Associate Member"];

async function main() {
  const apply = process.argv.includes("--apply");

  const zones = await prisma.zone.findMany({ select: { id: true, name: true } });

  for (const zone of zones) {
    const existing = await prisma.masterListItem.findMany({
      where: { zoneId: zone.id, type: "NICRA_PI_CO_PI_TYPE" },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((t) => t.name));
    const toAdd = TYPES.filter((t) => !existingNames.has(t));

    console.log(`\nZone: ${zone.name}`);
    console.log(`  Already present: ${[...existingNames].join(", ") || "(none)"}`);
    console.log(`  Add: ${toAdd.length ? toAdd.join(", ") : "(nothing to do)"}`);

    if (!apply) continue;

    for (const name of toAdd) {
      await prisma.masterListItem.create({ data: { zoneId: zone.id, type: "NICRA_PI_CO_PI_TYPE", name } });
    }
  }

  console.log(apply ? "\nApplied." : "\nDry run only - pass --apply to write these changes.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
