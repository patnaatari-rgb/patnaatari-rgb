import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";

/**
 * Data-change audit trail (security review, 2026-09-22 - see DataChangeLog
 * in schema.prisma for what it does and does not capture). Super Admin
 * only, same reasoning as All Masters/Role Management/User Management: this
 * shows every KVK's activity in the zone, not just the caller's own.
 */
export async function GET(request: Request) {
  const auth = await requireSession(["SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  // Same "load everything, filter/sort/page client-side" convention as
  // /api/log-history, and the same reason: a truncated audit log that
  // doesn't say so is worse than a slow one.
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 5000) : 500;
  const kvkFilter = searchParams.get("kvk");
  const actionFilter = searchParams.get("action");

  const where: { zoneId: string; kvkId?: string | null; action?: "CREATE" | "UPDATE" | "DELETE" } = {
    zoneId: auth.session.zoneId,
  };
  if (kvkFilter === "super-admin") {
    where.kvkId = null;
  } else if (kvkFilter && kvkFilter !== "all") {
    const kvk = await prisma.kvk.findFirst({ where: { zoneId: auth.session.zoneId, name: kvkFilter }, select: { id: true } });
    where.kvkId = kvk?.id ?? "__no_match__";
  }
  if (actionFilter === "CREATE" || actionFilter === "UPDATE" || actionFilter === "DELETE") {
    where.action = actionFilter;
  }

  const rows = await prisma.dataChangeLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      kvkName: true,
      username: true,
      action: true,
      formPath: true,
      formLabel: true,
      recordId: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    rows: rows.map((row) => ({
      id: row.id,
      kvkName: row.kvkName ?? "Super Admin",
      username: row.username,
      action: row.action,
      form: row.formLabel ?? row.formPath,
      recordId: row.recordId ?? "-",
      createdAt: row.createdAt.toISOString(),
    })),
  });
}
