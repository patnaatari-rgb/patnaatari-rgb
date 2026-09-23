import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { resolveKvkScope } from "@/lib/host-org-scope";

/**
 * The KVK's own equipment master rows, for the "Equipment" dropdown on the
 * yearly Equipment Details (EquipmentStatus) form - the reference's own
 * /create-equipment-details form pulls the same per-KVK list. KVK-scoped
 * like /api/staff-options; a Super Admin session (no kvkId) gets the whole
 * zone's equipment.
 */
export async function GET() {
  const auth = await requireSession(["SUPER_ADMIN", "ORG_ADMIN", "KVK_ADMIN"]);
  if (!auth.ok) return auth.response;

  const equipment = await prisma.equipment.findMany({
    where: await resolveKvkScope(auth.session),
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      presentStatus: true,
      sourceOfFund: true,
      repairingCost: true,
    },
  });

  // Flattened so the Equipment Details form can auto-fill from the picked row
  // (MasterColumn.sourceMaster.autofill).
  const rows = equipment.map((e) => ({
    id: e.id,
    name: e.name,
    presentStatus: e.presentStatus ?? "",
    sourceOfFund: e.sourceOfFund ?? "",
    repairingCost: e.repairingCost != null ? String(e.repairingCost) : "",
  }));

  return NextResponse.json({ rows });
}
