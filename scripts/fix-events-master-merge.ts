/**
 * Client pointer, 2026-09-25: entries Super Admin adds under Events Master
 * (Training & Extension Masters) weren't appearing in the "Important Days"
 * dropdown on the "Celebration of important days" form, because the two were
 * separate master lists (EVENTS_MASTER vs IMPORTANT_DAY) with no connection
 * between them. lib/navigation.ts now points that dropdown at EVENTS_MASTER
 * instead, and the "Important Day Master" admin page (which only ever fed
 * IMPORTANT_DAY) has been removed. This is the one-off data side of that
 * fix: copies every IMPORTANT_DAY row (including any row flagged "Others")
 * into EVENTS_MASTER per zone, skipping names that already exist there
 * (case-insensitive), so no dropdown option already in production is lost.
 * IMPORTANT_DAY rows themselves are left in place, just no longer read by
 * any form - safe to re-run.
 *
 * Run: npx tsx scripts/fix-events-master-merge.ts            (dry run)
 *      npx tsx scripts/fix-events-master-merge.ts --apply    (writes)
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
    const [importantDays, events] = await Promise.all([
      prisma.masterListItem.findMany({ where: { zoneId: zone.id, type: "IMPORTANT_DAY" } }),
      prisma.masterListItem.findMany({ where: { zoneId: zone.id, type: "EVENTS_MASTER" } }),
    ]);
    const existingNames = new Set(events.map((e) => e.name.trim().toLowerCase()));
    const toCopy = importantDays.filter((d) => !existingNames.has(d.name.trim().toLowerCase()));

    console.log(`\nZone: ${zone.name}`);
    console.log(`  Important Days: ${importantDays.length}, already in Events Master: ${importantDays.length - toCopy.length}`);
    console.log(`  To copy: ${toCopy.length}${toCopy.length ? ` (${toCopy.map((d) => d.name).join(", ")})` : ""}`);

    if (!apply || toCopy.length === 0) continue;

    await prisma.masterListItem.createMany({
      data: toCopy.map((d) => ({ zoneId: zone.id, type: "EVENTS_MASTER" as const, name: d.name, isOther: d.isOther })),
    });
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
