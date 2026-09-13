import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";

/**
 * Real FLD names (Fld.technologyDemonstrated) for the "FLD Name"/"FLD"
 * dropdowns on "Extension & Training activities under FLD" and "Technical
 * Feedback on FLD" - both were plain free-text before (client direction,
 * 2026-09-13: connect all three FLD leaves so a name typed once when
 * creating an FLD is the only way it can be picked here, not re-typed).
 * KVK-scoped like /api/staff-options/vehicle-options/equipment-options; a
 * Super Admin session (no kvkId) gets the whole zone's FLD names.
 *
 * Fld is a transactional table (one row per trial, not a master catalog
 * like Vehicle/Equipment), so the same name can legitimately appear on
 * several records (re-run across years, etc.) - deduped by name here so
 * the dropdown doesn't repeat an option.
 */
export async function GET() {
  const auth = await requireSession(["SUPER_ADMIN", "KVK_ADMIN"]);
  if (!auth.ok) return auth.response;

  const flds = await prisma.fld.findMany({
    where: auth.session.kvkId ? { kvkId: auth.session.kvkId } : { zoneId: auth.session.zoneId },
    orderBy: { technologyDemonstrated: "asc" },
    select: { technologyDemonstrated: true },
  });

  const names = Array.from(
    new Set(flds.map((f) => f.technologyDemonstrated).filter((name): name is string => Boolean(name?.trim()))),
  ).sort((a, b) => a.localeCompare(b));

  return NextResponse.json({ rows: names.map((name) => ({ name })) });
}
