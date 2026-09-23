import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { resolveKvkScope } from "@/lib/host-org-scope";

/**
 * Real staff names for the "Name of SMS/KVK Head" dropdown that recurs
 * across several Achievements forms (OFT, FLD, Extension Activities,
 * Trainings, ...) in the real reference (atari-client.vercel.app, confirmed
 * 2026-08-15 screenshots) - was a plain free-text field before, letting a
 * KVK Admin type any name instead of picking a real employee. KVK-scoped
 * (a KVK Admin only ever sees their own KVK's staff) rather than zone-wide
 * like the All Masters options endpoint, since staff genuinely belong to
 * one KVK, not the whole zone - a Super Admin session (no kvkId) gets every
 * staff member in the zone instead, same "aggregate view" convention used
 * elsewhere in this app for Super Admin.
 */
/**
 * Client direction, 2026-09-13: OFT's and FLD's own "Name of SMS/KVK Head"
 * field really does mean only SMS or KVK Head, not any staff member (a
 * Driver/Assistant/Stenographer showing up there was a real gap) - every
 * other caller of this endpoint (Extension Activities' Staff, Training's
 * Course Co-ordinator, HRD, ...) still wants the full roster, so this is an
 * opt-in `?role=sms-head` filter, not a change to the default. Matched
 * against the real Sanctioned Post values (Staff.sanctionedPost, sourced
 * from the Sanctioned Post master) rather than free text.
 */
const SMS_HEAD_POSTS = ["SMS (Subject Matter Specialist)", "Senior Scientist & Head"];

export async function GET(request: Request) {
  const auth = await requireSession(["SUPER_ADMIN", "ORG_ADMIN", "KVK_ADMIN"]);
  if (!auth.ok) return auth.response;

  const role = new URL(request.url).searchParams.get("role");

  const rows = await prisma.staff.findMany({
    where: {
      ...(await resolveKvkScope(auth.session)),
      dateOfRetirement: null,
      ...(role === "sms-head" ? { sanctionedPost: { in: SMS_HEAD_POSTS } } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return NextResponse.json({ rows });
}
