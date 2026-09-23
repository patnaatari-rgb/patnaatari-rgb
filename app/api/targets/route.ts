import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { getHostOrgKvkIds, resolveKvkScope } from "@/lib/host-org-scope";

const CATEGORIES = ["OFT", "FLD", "Training", "Extension Activity"] as const;
type Category = (typeof CATEGORIES)[number];

/** Real submitted count for one KVK+year+category - the live "Achieved" figure, never a second manually-entered number. */
async function achievedCount(kvkId: string, reportingYear: number, category: Category) {
  switch (category) {
    case "OFT":
      return prisma.oft.count({ where: { kvkId, reportingYear } });
    case "FLD":
      return prisma.fld.count({ where: { kvkId, reportingYear } });
    case "Training":
      return prisma.training.count({ where: { kvkId, reportingYear } });
    case "Extension Activity": {
      const [a, b] = await Promise.all([
        prisma.extensionActivity.count({ where: { kvkId, reportingYear } }),
        prisma.otherExtensionActivity.count({ where: { kvkId, reportingYear } }),
      ]);
      return a + b;
    }
  }
}

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const targets = await prisma.target.findMany({
    where: await resolveKvkScope(auth.session),
    include: { kvk: { select: { name: true } } },
    orderBy: [{ reportingYear: "desc" }, { kvk: { name: "asc" } }],
  });

  const rows = await Promise.all(
    targets.map(async (t) => {
      const achieved = await achievedCount(t.kvkId, t.reportingYear, t.category as Category);
      const progress = t.targetValue > 0 ? Math.round((achieved / t.targetValue) * 100) : 0;
      return {
        id: t.id,
        reportingYear: String(t.reportingYear),
        kvk: t.kvk.name,
        category: t.category,
        target: String(t.targetValue),
        achieved: String(achieved),
        progress: `${progress}%`,
        status: achieved >= t.targetValue ? "Achieved" : "In Progress",
      };
    }),
  );

  return NextResponse.json({ rows });
}

export async function POST(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const reportingYear = Number(body?.reportingYear);
  const category = typeof body?.category === "string" ? body.category : "";
  const targetValue = Number(body?.targetValue);
  /**
   * Super Admin picks one or more KVKs from a checklist (client request,
   * 2026-09-04: "dropdown mai multiple checkbox jaise report mai") - the
   * same target value is then set for every checked KVK in one save.
   * `kvkName` (single string) is still accepted for older callers.
   */
  const kvkNames: string[] = Array.isArray(body?.kvkNames)
    ? body.kvkNames.filter((n: unknown): n is string => typeof n === "string" && n.trim() !== "")
    : typeof body?.kvkName === "string" && body.kvkName.trim() !== ""
      ? [body.kvkName]
      : [];

  if (!reportingYear || !CATEGORIES.includes(category as Category) || !targetValue || targetValue <= 0) {
    return NextResponse.json({ error: "Reporting year, category and a positive target value are required." }, { status: 400 });
  }
  if (!auth.session.roleId) {
    return NextResponse.json({ error: "Your account has no assigned role." }, { status: 403 });
  }

  // KVK Admin/User can only ever set their own KVK's target; Super Admin picks
  // any KVK(s) in the zone; a Host Organisation (ORG_ADMIN) picks among its
  // own mapped KVKs only - resolved by id so a tampered name outside its org
  // simply fails to match, same fail-closed pattern used everywhere else.
  let kvkIds: string[];
  if (auth.session.role === "SUPER_ADMIN" || auth.session.role === "ORG_ADMIN") {
    if (kvkNames.length === 0) return NextResponse.json({ error: "Select at least one KVK." }, { status: 400 });
    const allowedKvkIds =
      auth.session.role === "ORG_ADMIN" && auth.session.hostOrgId
        ? await getHostOrgKvkIds(auth.session.hostOrgId)
        : null;
    const kvks = await prisma.kvk.findMany({
      where: {
        zoneId: auth.session.zoneId,
        name: { in: kvkNames },
        ...(allowedKvkIds ? { id: { in: allowedKvkIds } } : {}),
      },
      select: { id: true, name: true },
    });
    const missing = kvkNames.filter((n) => !kvks.some((k) => k.name === n));
    if (missing.length > 0) return NextResponse.json({ error: `Unknown KVK: ${missing.join(", ")}` }, { status: 400 });
    kvkIds = kvks.map((k) => k.id);
  } else {
    if (!auth.session.kvkId) return NextResponse.json({ error: "No KVK to assign this target to." }, { status: 400 });
    kvkIds = [auth.session.kvkId];
  }

  const targets = await Promise.all(
    kvkIds.map((kvkId) =>
      prisma.target.upsert({
        where: { kvkId_reportingYear_category: { kvkId, reportingYear, category } },
        create: { kvkId, zoneId: auth.session.zoneId, reportingYear, category, targetValue, roleId: auth.session.roleId! },
        update: { targetValue, roleId: auth.session.roleId! },
      }),
    ),
  );

  /** Real auto-notification to each target KVK (client-confirmed 2026-08-29) - only a Super Admin setting/updating another KVK's target triggers this; a KVK Admin/User setting their own target has no one to notify. */
  if (auth.session.role === "SUPER_ADMIN") {
    const senderUser = await prisma.user.findUnique({ where: { id: auth.session.sub }, select: { name: true, username: true } });
    await prisma.notification.create({
      data: {
        zoneId: auth.session.zoneId,
        title: `New ${category} Target - ${reportingYear}`,
        message: `Your ${category} target for ${reportingYear} has been set to ${targetValue}.`,
        senderId: auth.session.sub,
        senderName: senderUser?.name ?? senderUser?.username ?? "Super Admin",
        senderRole: "SUPER_ADMIN",
        recipientKvkIds: kvkIds,
        source: "TARGET",
      },
    });
  }

  return NextResponse.json({ ok: true, count: targets.length }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing target id." }, { status: 400 });

  const result = await prisma.target.deleteMany({
    where: { id, ...(await resolveKvkScope(auth.session)) },
  });
  if (result.count === 0) return NextResponse.json({ error: "Target not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
