import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Every KVK mapped to a Host Organisation (client request, 2026-09-24: a
 * Host Organisation login sees every KVK under it, not just one like a KVK
 * Admin). Callers feed the result into the same `{in: string[]}` shape
 * app/api/dashboard-stats/route.ts already uses for Super Admin's own
 * multi-KVK filter, so this generalizes an existing pattern rather than
 * inventing a new one.
 */
export async function getHostOrgKvkIds(hostOrgId: string): Promise<string[]> {
  const kvks = await prisma.kvk.findMany({
    where: { hostOrgId },
    select: { id: true },
  });
  return kvks.map((k) => k.id);
}

/**
 * The shared 3-way `kvkId`/`zoneId` scoping shape used across this app's
 * read/write routes, generalized to also cover a Host Organisation session:
 * KVK Admin/User (a single kvkId) keep their existing `{kvkId}` filter
 * unchanged; a Host Organisation (ORG_ADMIN, no kvkId of its own) gets
 * `{kvkId: {in: [...]}}` over every KVK mapped to it; Super Admin (neither)
 * falls back to `{zoneId}`, same as before this role existed.
 */
export async function resolveKvkScope(session: {
  kvkId: string | null;
  role: string;
  hostOrgId: string | null;
  zoneId: string;
}): Promise<{ kvkId: string } | { kvkId: { in: string[] } } | { zoneId: string }> {
  if (session.kvkId) return { kvkId: session.kvkId };
  if (session.role === "ORG_ADMIN" && session.hostOrgId) {
    return { kvkId: { in: await getHostOrgKvkIds(session.hostOrgId) } };
  }
  return { zoneId: session.zoneId };
}
