/**
 * One-off import: adds Staff Transfer history from the live reference's
 * "Download Excel Report" on https://atariams.org/transfer-staff
 * (downloaded 2026-09-03 - 72 rows: Staff Name, Previous KVK, Current KVK).
 * StaffTransfer is a KVK-scoped leaf with no Super Admin "add on a KVK's
 * behalf" flow (see app/api/leaf-record/route.ts), so this writes directly
 * via Prisma - same approach as the other scripts/import-*.ts /
 * scripts/sync-*.ts scripts in this repo.
 *
 * KVK name resolution: this sheet's KVK names already match this app's own
 * Kvk.name almost everywhere ("KVK Araria", "KVK Bhojpur", ...) - only 3
 * known variants need an explicit override (same ones found reconciling
 * View KVKs and Bank Account Details against the same reference site).
 *
 * Staff name resolution: matched by normalized name only (not also by
 * current KVK) - a staff member's *current* Staff.kvkId only reflects their
 * latest placement, but a person who was transferred more than once (this
 * sheet has real multi-hop cases, e.g. staff transferred Jamtara->Latehar
 * then Latehar->Dumka) needs every hop attached to the same staffId
 * regardless of which hop is "current". Reports any name that doesn't
 * resolve to exactly one Staff row instead of guessing.
 *
 * Run: npx tsx scripts/import-staff-transfers.ts <path-to-xlsx>            (dry run)
 *      npx tsx scripts/import-staff-transfers.ts <path-to-xlsx> --apply    (writes)
 */
import { config } from "dotenv";
import ExcelJS from "exceljs";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

config({ path: ".env.local" });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const KVK_NAME_OVERRIDES: Record<string, string> = {
  "krishi vigyan kendra, dumka,": "KVK Dumka",
  "krishi vigyan kendra, dumka": "KVK Dumka",
  "kvk rohtas": "KVK Rohtas",
  "rpcau-kvk saran": "KVK Saran",
  "kvk manpur gaya": "KVK Manpur Gaya-I",
};

function normalizeName(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
}

function looseName(v: string): string {
  return v.toLowerCase().replace(/[^a-z]/g, "");
}

type Row = { staffName: string; fromKvkName: string; toKvkName: string };

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "text" in (v as object)) return String((v as { text: unknown }).text);
  if (typeof v === "object" && "result" in (v as object)) return String((v as { result: unknown }).result);
  return String(v).trim();
}

async function readRows(xlsxPath: string): Promise<Row[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
  const sheet = workbook.worksheets[0];
  const rows: Row[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const v = (row.values as unknown[]).map(cellText);
    // idx: 1 S.No, 2 Staff Name, 3 Previous KVK, 4 Current KVK
    const staffName = v[2];
    const fromKvkName = v[3];
    const toKvkName = v[4];
    if (!staffName || !fromKvkName || !toKvkName) return;
    rows.push({ staffName, fromKvkName, toKvkName });
  });
  return rows;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const xlsxPath = process.argv[2];
  if (!xlsxPath || xlsxPath === "--apply") {
    throw new Error("Usage: npx tsx scripts/import-staff-transfers.ts <path-to-xlsx> [--apply]");
  }

  const refRows = await readRows(xlsxPath);

  const zone = await prisma.zone.findFirst();
  if (!zone) throw new Error("No zone found.");

  const kvks = await prisma.kvk.findMany({ where: { zoneId: zone.id } });
  const kvkIdByName = new Map(kvks.map((k) => [normalizeName(k.name), k.id]));
  function resolveKvkId(rawName: string): string | undefined {
    const norm = normalizeName(rawName);
    return kvkIdByName.get(norm) ?? kvkIdByName.get(normalizeName(KVK_NAME_OVERRIDES[norm] ?? ""));
  }

  const staff = await prisma.staff.findMany({ where: { zoneId: zone.id } });
  const staffByNormName = new Map<string, typeof staff>();
  const staffByLooseName = new Map<string, typeof staff>();
  for (const s of staff) {
    const norm = normalizeName(s.name);
    staffByNormName.set(norm, [...(staffByNormName.get(norm) ?? []), s]);
    const loose = looseName(s.name);
    staffByLooseName.set(loose, [...(staffByLooseName.get(loose) ?? []), s]);
  }
  /**
   * When more than one Staff row shares a name (real, common in this data -
   * e.g. 3 different people sharing the same name), prefer whichever
   * one's *current* kvkId is this row's "to" KVK - that's the specific
   * person who ended up there, which is exactly the placement a transfer
   * record is describing. Falls back to reporting real ambiguity only if
   * that still doesn't narrow it to one.
   */
  function resolveStaffId(rawName: string, toKvkId: string | undefined): { id: string } | { error: string } {
    const norm = normalizeName(rawName);
    let matches = staffByNormName.get(norm) ?? [];
    if (matches.length === 0) matches = staffByLooseName.get(looseName(rawName)) ?? [];
    if (matches.length === 0) return { error: `no Staff named "${rawName}"` };
    if (matches.length === 1) return { id: matches[0].id };
    if (toKvkId) {
      const atTarget = matches.filter((s) => s.kvkId === toKvkId);
      if (atTarget.length === 1) return { id: atTarget[0].id };
    }
    return { error: `${matches.length} Staff rows named "${rawName}" - ambiguous` };
  }

  const existing = await prisma.staffTransfer.findMany({ where: { zoneId: zone.id } });
  const existingKeys = new Set(existing.map((t) => `${t.staffId}::${t.fromKvkId}::${t.toKvkId}`));

  let toCreate = 0;
  let alreadyPresent = 0;
  const problems: string[] = [];
  const creates: { staffId: string; fromKvkId: string; toKvkId: string; zoneId: string; transferDate: Date }[] = [];

  for (const row of refRows) {
    const fromKvkId = resolveKvkId(row.fromKvkName);
    const toKvkId = resolveKvkId(row.toKvkName);
    const staffResult = resolveStaffId(row.staffName, toKvkId);

    if (!fromKvkId) problems.push(`"${row.staffName}": unknown "from" KVK "${row.fromKvkName}"`);
    if (!toKvkId) problems.push(`"${row.staffName}": unknown "to" KVK "${row.toKvkName}"`);
    if ("error" in staffResult) problems.push(`"${row.staffName}" (${row.fromKvkName} -> ${row.toKvkName}): ${staffResult.error}`);
    if (!fromKvkId || !toKvkId || "error" in staffResult) continue;

    const key = `${staffResult.id}::${fromKvkId}::${toKvkId}`;
    if (existingKeys.has(key)) {
      alreadyPresent += 1;
      continue;
    }
    existingKeys.add(key);
    toCreate += 1;
    creates.push({ staffId: staffResult.id, fromKvkId, toKvkId, zoneId: zone.id, transferDate: new Date() });
  }

  console.log(`Reference rows: ${refRows.length}`);
  console.log(`Already present (skipped): ${alreadyPresent}`);
  console.log(`To create: ${toCreate}`);
  if (problems.length) {
    console.log(`\n${problems.length} row(s) could not be resolved:`);
    problems.forEach((p) => console.log(`  ${p}`));
  }

  if (!apply) {
    console.log("\nDry run only - pass --apply to write these changes.");
    return;
  }
  if (creates.length) {
    await prisma.staffTransfer.createMany({ data: creates });
  }
  console.log(`\nApplied: ${creates.length} staff transfer(s) created.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
