import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { resolveKvkScope } from "@/lib/host-org-scope";

/**
 * Carry-forward for the yearly Equipment Details (EquipmentStatus) Add
 * form: given an equipment name, return the fields to pre-fill from that
 * equipment's MOST RECENT year's status, falling back to the Equipment
 * master's own current values on a first-ever entry. Source of Funding is a
 * read-only column derived from the master, so it is not carried here.
 */
export async function GET(request: Request) {
  const auth = await requireSession(["SUPER_ADMIN", "ORG_ADMIN", "KVK_ADMIN"]);
  if (!auth.ok) return auth.response;

  const value = new URL(request.url).searchParams.get("value")?.trim() ?? "";
  if (!value) return NextResponse.json({ fields: {} });

  const scope = await resolveKvkScope(auth.session);

  const equipment = await prisma.equipment.findFirst({
    where: { ...scope, name: value },
    select: { id: true, presentStatus: true, repairingCost: true },
  });
  if (!equipment) return NextResponse.json({ fields: {} });

  const last = await prisma.equipmentStatus.findFirst({
    where: { equipmentId: equipment.id },
    orderBy: { reportingYear: "desc" },
  });

  // Equipment sent to auction is retired - its details do NOT carry forward
  // into a new year (client direction, 2026-09-11 - revises the 2026-09-10
  // rule, which stopped carry-forward for "Condemned"; condemned equipment
  // now carries forward normally, only "Auction" stops it). "Repairing"
  // still carries forward so the user just edits the repairing cost.
  const latestStatus = (last?.presentStatus ?? equipment.presentStatus ?? "").trim().toLowerCase();
  if (latestStatus === "auction") return NextResponse.json({ fields: {} });

  const num = (v: unknown) => (v == null ? "" : String(v));

  const fields = last
    ? {
        presentStatus: last.presentStatus ?? "",
        repairingCost: num(last.repairingCost),
      }
    : {
        presentStatus: equipment.presentStatus ?? "",
        repairingCost: num(equipment.repairingCost),
      };

  return NextResponse.json({ fields });
}
