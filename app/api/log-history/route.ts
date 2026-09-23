import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { getHostOrgKvkIds } from "@/lib/host-org-scope";

/**
 * Real login activity for the "View Users Log Activity" page and the
 * Dashboard's Recent Log History card. KVK Admin/User always get their own
 * KVK's rows only - the `kvk` filter only applies for Super Admin, who can
 * additionally narrow to "super-admin" (their own zone-level logins, which
 * have no kvkId) or a specific KVK name.
 */
export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  /**
   * The "View Users Log Activity" page loads the whole log and does its own
   * search / sort / pagination client-side, so the cap has to clear the real
   * row count or the page silently hides the oldest entries (an audit log
   * must never truncate without saying so). 5000 covers this system's
   * foreseeable login volume; a larger log would need real server-side
   * pagination here and on the page. The Dashboard's Recent card asks for
   * limit=6 and is unaffected.
   */
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 5000) : 100;
  const kvkFilter = searchParams.get("kvk");

  /**
   * A Host Organisation (ORG_ADMIN) has no kvkId of its own, unlike KVK
   * Admin/User - real bug fixed 2026-09-24: the old single `isKvkScoped`
   * branch resolved to `{ kvkId: undefined }` for such a session, which
   * Prisma treats as no filter at all (every zone's rows, not even this
   * one's) rather than failing closed. Scoped to every KVK mapped to its
   * org instead, same {in: [...]} shape used everywhere else this feature
   * touches; its own `kvk` name filter (if any) is additionally constrained
   * to that same set, so a tampered name outside its org simply matches
   * nothing rather than escaping scope.
   */
  const orgKvkIds =
    auth.session.role === "ORG_ADMIN" && auth.session.hostOrgId
      ? await getHostOrgKvkIds(auth.session.hostOrgId)
      : null;
  const isKvkScoped = auth.session.role === "KVK_ADMIN" || auth.session.role === "KVK_USER";
  const where = isKvkScoped
    ? { kvkId: auth.session.kvkId ?? "__none__" }
    : orgKvkIds
      ? await (async () => {
          if (!kvkFilter || kvkFilter === "all" || kvkFilter === "super-admin") {
            return { zoneId: auth.session.zoneId, kvkId: { in: orgKvkIds } };
          }
          const kvk = await prisma.kvk.findFirst({
            where: { zoneId: auth.session.zoneId, name: kvkFilter, id: { in: orgKvkIds } },
            select: { id: true },
          });
          return { zoneId: auth.session.zoneId, kvkId: kvk?.id ?? "__no_match__" };
        })()
      : await (async () => {
          if (!kvkFilter || kvkFilter === "all") return { zoneId: auth.session.zoneId };
          if (kvkFilter === "super-admin") return { zoneId: auth.session.zoneId, kvkId: null };
          const kvk = await prisma.kvk.findFirst({
            where: { zoneId: auth.session.zoneId, name: kvkFilter },
            select: { id: true },
          });
          return { zoneId: auth.session.zoneId, kvkId: kvk?.id ?? "__no_match__" };
        })();

  const rows = await prisma.loginActivity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      kvkName: true,
      username: true,
      activity: true,
      ipAddress: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    rows: rows.map((row) => ({
      id: row.id,
      kvkName: row.kvkName ?? "Super Admin",
      nameOfUser: row.username,
      activity: row.activity,
      ipAddress: row.ipAddress ?? "-",
      loginTime: row.createdAt.toISOString(),
    })),
  });
}
