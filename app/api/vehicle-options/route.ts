import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { resolveKvkScope } from "@/lib/host-org-scope";

/**
 * The KVK's own vehicle master rows, for the "Vehicle" dropdown on the
 * yearly Vehicle Details (VehicleStatus) form - the reference's own
 * /create-vehicle-details form pulls the same per-KVK list rather than
 * letting the user re-type a vehicle name. KVK-scoped like /api/staff-options;
 * a Super Admin session (no kvkId) gets the whole zone's vehicles.
 */
export async function GET() {
  const auth = await requireSession(["SUPER_ADMIN", "ORG_ADMIN", "KVK_ADMIN"]);
  if (!auth.ok) return auth.response;

  const vehicles = await prisma.vehicle.findMany({
    where: await resolveKvkScope(auth.session),
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      registrationNo: true,
      vehicleType: true,
      totalRun: true,
      presentStatus: true,
      sourceOfFunding: true,
      repairingCost: true,
    },
  });

  // Flattened so the Vehicle Details form can auto-fill from the picked row
  // (MasterColumn.sourceMaster.autofill).
  const rows = vehicles.map((v) => ({
    id: v.id,
    name: v.name,
    registrationNo: v.registrationNo,
    vehicleType: v.vehicleType ?? "",
    totalRun: v.totalRun != null ? String(v.totalRun) : "",
    presentStatus: v.presentStatus ?? "",
    sourceOfFunding: v.sourceOfFunding ?? "",
    repairingCost: v.repairingCost != null ? String(v.repairingCost) : "",
  }));

  return NextResponse.json({ rows });
}
