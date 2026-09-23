import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { safeErrorMessage } from "@/lib/safe-error-message";
import { resolveKvkScope } from "@/lib/host-org-scope";

/**
 * Mark a staff member as retired. Only the date of retirement is recorded
 * (Staff.dateOfRetirement); a staff row with that date set leaves Employee
 * Details and shows in "Staff Retired" instead, the same way a transfer moves
 * the row out of the source KVK's list. (client direction, 2026-09-19)
 */
export async function POST(request: Request) {
  const auth = await requireSession(["KVK_ADMIN", "ORG_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const staffId = typeof body?.staffId === "string" ? body.staffId : "";
  const dateOfRetirement = typeof body?.dateOfRetirement === "string" ? body.dateOfRetirement : "";

  if (!staffId || !dateOfRetirement) {
    return NextResponse.json({ error: "Staff and date of retirement are both required." }, { status: 400 });
  }
  const retiredOn = new Date(dateOfRetirement);
  if (Number.isNaN(retiredOn.getTime())) {
    return NextResponse.json({ error: "Enter a valid date of retirement." }, { status: 400 });
  }

  try {
    const result = await prisma.staff.updateMany({
      where: {
        id: staffId,
        dateOfRetirement: null,
        ...(await resolveKvkScope(auth.session)),
      },
      data: { dateOfRetirement: retiredOn },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Staff not found, already retired, or not in your scope." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error, "Could not mark the staff member as retired.") }, { status: 400 });
  }
}
