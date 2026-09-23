import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { resolveKvkScope } from "@/lib/host-org-scope";

/**
 * Carry-forward for the yearly Vehicle Details (VehicleStatus) Add form:
 * given a vehicle name, return the fields to pre-fill from that vehicle's
 * MOST RECENT year's status - so a new year starts as a copy of the last
 * one, editable. Falls back to the Vehicle master's own current values when
 * there is no prior year (a first-ever entry). Keyed by the form's own
 * field keys (see the vehicle-details leaf in lib/navigation.ts).
 */
export async function GET(request: Request) {
  const auth = await requireSession(["SUPER_ADMIN", "ORG_ADMIN", "KVK_ADMIN"]);
  if (!auth.ok) return auth.response;

  const value = new URL(request.url).searchParams.get("value")?.trim() ?? "";
  if (!value) return NextResponse.json({ fields: {} });

  const scope = await resolveKvkScope(auth.session);

  const vehicle = await prisma.vehicle.findFirst({
    where: { ...scope, name: value },
    select: {
      id: true,
      totalRun: true,
      presentStatus: true,
      sourceOfFunding: true,
      repairingCost: true,
    },
  });
  if (!vehicle) return NextResponse.json({ fields: {} });

  const last = await prisma.vehicleStatus.findFirst({
    where: { vehicleId: vehicle.id },
    orderBy: { reportingYear: "desc" },
  });

  // A vehicle sent to auction is retired - its details do NOT carry forward
  // into a new year (client direction, 2026-09-11 - revises the 2026-09-10
  // rule, which stopped carry-forward for "Condemned"; a condemned vehicle
  // now carries forward normally, only "Auction" stops it). Selecting it for
  // a new year starts blank; a "Repairing" vehicle still carries forward
  // normally so the user can just edit the repairing cost.
  const latestStatus = (last?.presentStatus ?? vehicle.presentStatus ?? "").trim().toLowerCase();
  if (latestStatus === "auction") return NextResponse.json({ fields: {} });

  const num = (v: unknown) =>
    v == null ? "" : String(v);

  const fields = last
    ? {
        totalRunKms: num(last.totalRunKmHrs),
        presentStatus: last.presentStatus ?? "",
        fundingSource: last.fundingSource ?? "",
        repairingCost: num(last.repairingCost),
      }
    : {
        totalRunKms: num(vehicle.totalRun),
        presentStatus: vehicle.presentStatus ?? "",
        fundingSource: vehicle.sourceOfFunding ?? "",
        repairingCost: num(vehicle.repairingCost),
      };

  return NextResponse.json({ fields });
}
