import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { toClientRole } from "@/lib/auth";

/**
 * The signed-in identity, read from the verified (httpOnly) session cookie -
 * the real source of truth. The client keeps a per-tab sessionStorage copy
 * for instant role-dependent chrome, but that copy is missing in a brand-new
 * tab and can go stale; SessionGate calls this on mount to (re)sync it, so a
 * KVK Admin never briefly renders as Super Admin (the sessionStorage default).
 */
export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  // The KVK name normally rides in the token (set at login) so this route
  // stays DB-free - SessionGate calls it on every fresh load. Only cookies
  // issued before that field existed need the fallback lookup.
  let kvkName = auth.session.kvkName ?? undefined;
  if (kvkName === undefined && auth.session.kvkId) {
    const kvk = await prisma.kvk.findUnique({
      where: { id: auth.session.kvkId },
      select: { name: true },
    });
    kvkName = kvk?.name ?? undefined;
  }

  // Same fallback convention as kvkName above, for cookies issued before hostOrgName existed.
  let hostOrgName = auth.session.hostOrgName ?? undefined;
  if (hostOrgName === undefined && auth.session.hostOrgId) {
    const hostOrg = await prisma.hostOrganization.findUnique({
      where: { id: auth.session.hostOrgId },
      select: { name: true },
    });
    hostOrgName = hostOrg?.name ?? undefined;
  }

  return NextResponse.json({
    role: toClientRole(auth.session.role),
    kvkName,
    hostOrgName,
  });
}
