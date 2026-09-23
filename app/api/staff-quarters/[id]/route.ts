import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { parseStaffQuartersBody, writeOccupancy } from "../shared";
import { resolveKvkScope } from "@/lib/host-org-scope";

type RouteParams = { params: Promise<{ id: string }> };

/** Load one Staff Quarters record (plus its occupancy grid) for the bespoke Edit form. */
export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSession(["SUPER_ADMIN", "ORG_ADMIN", "KVK_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const record = await prisma.staffQuarters.findFirst({
    where: { id, ...(await resolveKvkScope(auth.session)) },
    include: { occupancy: true },
  });
  if (!record) return NextResponse.json({ error: "Staff Quarters not found." }, { status: 404 });

  return NextResponse.json({
    dateOfCompletion: record.dateOfCompletion
      ? record.dateOfCompletion.toISOString().slice(0, 10)
      : "",
    whetherCompleted: record.whetherCompleted == null ? "" : record.whetherCompleted ? "Yes" : "No",
    numberOfQuarters: String(record.numberOfQuarters),
    occupancyDetails: record.occupancyDetails ?? "",
    remark: record.remark ?? "",
    occupancy: record.occupancy.map((o) => ({
      month: o.month,
      quarter: o.quarterNumber,
      value: o.occupied ? "Yes" : "No",
    })),
  });
}

/** Update the record's summary fields and replace its occupancy grid. */
export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireSession(["SUPER_ADMIN", "ORG_ADMIN", "KVK_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const existing = await prisma.staffQuarters.findFirst({
    where: { id, ...(await resolveKvkScope(auth.session)) },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Staff Quarters not found." }, { status: 404 });

  const parsed = parseStaffQuartersBody(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    await prisma.staffQuarters.update({
      where: { id },
      data: {
        dateOfCompletion: parsed.dateOfCompletion,
        whetherCompleted: parsed.whetherCompleted,
        numberOfQuarters: parsed.numberOfQuarters,
        occupancyDetails: parsed.occupancyDetails,
        remark: parsed.remark,
      },
    });
    await writeOccupancy(id, parsed.occupancy);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("staff-quarters update failed", err);
    return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
  }
}
