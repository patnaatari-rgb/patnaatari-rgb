import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { safeErrorMessage } from "@/lib/safe-error-message";
import { resolveKvkScope } from "@/lib/host-org-scope";

/**
 * Transfer a staff member to another KVK. Records the hop in StaffTransfer
 * (from = the staff's current KVK, to = the chosen KVK) and moves the staff
 * row to the destination: it leaves the source KVK's Employee Details and
 * appears under the destination KVK's Employee Details (marked "Transferred").
 * The transfer shows in "Details of Staff Transferred" for the SOURCE KVK
 * (that list, the Form Summary count and report 1.2.B are all scoped by
 * fromKvkId) - it sits beside that KVK's own Employee Details, since that KVK
 * is the one that transferred the staff out. (client direction, 2026-09-10)
 */
export async function POST(request: Request) {
  const auth = await requireSession(["KVK_ADMIN", "ORG_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const staffId = typeof body?.staffId === "string" ? body.staffId : "";
  const toKvkName = typeof body?.toKvkName === "string" ? body.toKvkName.trim() : "";
  const transferDate = typeof body?.transferDate === "string" ? body.transferDate : "";

  if (!staffId || !toKvkName || !transferDate) {
    return NextResponse.json({ error: "Staff, destination KVK and date of relieving are all required." }, { status: 400 });
  }

  try {
    const staff = await prisma.staff.findFirst({
      where: { id: staffId, dateOfRetirement: null, ...(await resolveKvkScope(auth.session)) },
      select: { id: true, kvkId: true, name: true, kvk: { select: { name: true } } },
    });
    if (!staff) {
      return NextResponse.json({ error: "Staff not found, or not in your scope." }, { status: 404 });
    }

    const toKvk = await prisma.kvk.findFirst({
      where: { name: toKvkName, zoneId: auth.session.zoneId },
      select: { id: true, zoneId: true },
    });
    if (!toKvk) {
      return NextResponse.json({ error: "Destination KVK not found in your zone." }, { status: 400 });
    }
    if (toKvk.id === staff.kvkId) {
      return NextResponse.json({ error: "The staff member is already at that KVK." }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.staffTransfer.create({
        data: {
          staffId: staff.id,
          fromKvkId: staff.kvkId,
          toKvkId: toKvk.id,
          zoneId: toKvk.zoneId,
          transferDate: new Date(transferDate),
        },
      }),
      prisma.staff.update({
        where: { id: staff.id },
        data: {
          kvkId: toKvk.id,
          // Client direction, 2026-09-12: at the destination KVK, "Date of
          // Joining" means joined *this* KVK, not the staff member's original
          // hire date - the transfer date is that join date. Transfer Status
          // names the KVK they came from instead of a bare "Transferred", so
          // the destination KVK's own Employee Details answers "where did
          // this person come from" without opening Staff Transferred.
          dateOfJoining: new Date(transferDate),
          transferStatus: `Transferred from ${staff.kvk.name}`,
        },
      }),
      // The staff photo's own Module Images row (2026-09-24) moves with them -
      // otherwise it stays filed under the KVK they left, invisible at the one they joined.
      prisma.moduleImage.updateMany({
        where: { formRecordId: staff.id, slot: "staff-photo" },
        data: { kvkId: toKvk.id },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error, "Could not complete the transfer.") }, { status: 400 });
  }
}
