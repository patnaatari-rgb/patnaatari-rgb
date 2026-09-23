import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { getHostOrgKvkIds } from "@/lib/host-org-scope";

/**
 * Real backend for the Notifications page (client-documented flow, see the
 * Notification model comment in schema.prisma): a Super Admin sends to all
 * KVKs or a chosen few; a KVK Admin sends to their own KVK's users only; a
 * KVK Admin's sends also surface to the Super Admin's "Received" list for
 * oversight. Also the delivery mechanism behind Target's real "notify the
 * KVK" behaviour (source="TARGET", created by /api/targets on a Super
 * Admin set/update - never created here directly).
 */

function toRow(n: {
  id: string;
  title: string;
  message: string;
  senderName: string;
  senderRole: string;
  senderKvkName: string | null;
  recipientKvkIds: string[];
  createdAt: Date;
}, kvkNamesById: Map<string, string>) {
  const recipient =
    n.senderRole === "KVK_ADMIN"
      ? `${n.senderKvkName ?? "KVK"} Users`
      : n.recipientKvkIds.length === 0
        ? "All KVKs"
        : n.recipientKvkIds.map((id) => kvkNamesById.get(id) ?? id).join(", ");
  const from = n.senderRole === "SUPER_ADMIN" ? "Super Admin" : `${n.senderKvkName ?? "KVK"} Admin`;
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    recipient,
    from,
    sentOn: n.createdAt.toISOString().slice(0, 10),
    createdAt: n.createdAt.toISOString(),
  };
}

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const isSuperAdmin = auth.session.role === "SUPER_ADMIN";
  const kvkId = auth.session.kvkId ?? undefined;
  /** A Host Organisation (ORG_ADMIN) has no kvkId of its own - "received" means addressed to any KVK mapped to its org. */
  const orgKvkIds =
    auth.session.role === "ORG_ADMIN" && auth.session.hostOrgId
      ? await getHostOrgKvkIds(auth.session.hostOrgId)
      : null;

  const [sent, received, kvks] = await Promise.all([
    prisma.notification.findMany({
      where: { senderId: auth.session.sub },
      orderBy: { createdAt: "desc" },
    }),
    isSuperAdmin
      ? prisma.notification.findMany({
          where: { zoneId: auth.session.zoneId, senderRole: "KVK_ADMIN" },
          orderBy: { createdAt: "desc" },
        })
      : orgKvkIds
        ? prisma.notification.findMany({
            where: {
              zoneId: auth.session.zoneId,
              senderId: { not: auth.session.sub },
              OR: [
                {
                  senderRole: "SUPER_ADMIN",
                  OR: [{ recipientKvkIds: { isEmpty: true } }, { recipientKvkIds: { hasSome: orgKvkIds } }],
                },
                { senderRole: "KVK_ADMIN", senderKvkId: { in: orgKvkIds } },
              ],
            },
            orderBy: { createdAt: "desc" },
          })
        : kvkId
          ? prisma.notification.findMany({
              where: {
                zoneId: auth.session.zoneId,
                senderId: { not: auth.session.sub },
                OR: [
                  {
                    senderRole: "SUPER_ADMIN",
                    OR: [{ recipientKvkIds: { isEmpty: true } }, { recipientKvkIds: { has: kvkId } }],
                  },
                  { senderRole: "KVK_ADMIN", senderKvkId: kvkId },
                ],
              },
              orderBy: { createdAt: "desc" },
            })
          : Promise.resolve([]),
    prisma.kvk.findMany({ where: { zoneId: auth.session.zoneId }, select: { id: true, name: true } }),
  ]);

  const kvkNamesById = new Map(kvks.map((k) => [k.id, k.name]));

  return NextResponse.json({
    sent: sent.map((n) => toRow(n, kvkNamesById)),
    received: received.map((n) => toRow(n, kvkNamesById)),
  });
}

export async function POST(request: Request) {
  const auth = await requireSession(["SUPER_ADMIN", "KVK_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!title || !message) {
    return NextResponse.json({ error: "Title and message are required." }, { status: 400 });
  }

  let recipientKvkIds: string[] = [];
  let senderKvkId: string | undefined;
  let senderKvkName: string | undefined;

  if (auth.session.role === "SUPER_ADMIN") {
    const kvkNames: string[] = Array.isArray(body?.kvkNames)
      ? body.kvkNames.filter((n: unknown): n is string => typeof n === "string")
      : [];
    if (kvkNames.length === 0) {
      return NextResponse.json({ error: "At least one recipient KVK is required." }, { status: 400 });
    }
    const allKvks = await prisma.kvk.findMany({ where: { zoneId: auth.session.zoneId }, select: { id: true, name: true } });
    const matched = allKvks.filter((k) => kvkNames.includes(k.name));
    // Every real KVK in the zone selected == a broadcast, stored as [] (same "empty = all" convention used everywhere else) so a KVK added later still resolves this notification as "for everyone" if ever re-queried at zone scope.
    recipientKvkIds = matched.length === allKvks.length ? [] : matched.map((k) => k.id);
  } else {
    if (!auth.session.kvkId) {
      return NextResponse.json({ error: "Your account has no assigned KVK." }, { status: 400 });
    }
    const kvk = await prisma.kvk.findUnique({ where: { id: auth.session.kvkId }, select: { id: true, name: true } });
    if (!kvk) return NextResponse.json({ error: "KVK not found." }, { status: 400 });
    senderKvkId = kvk.id;
    senderKvkName = kvk.name;
  }

  const senderUser = await prisma.user.findUnique({ where: { id: auth.session.sub }, select: { name: true, username: true } });

  const notification = await prisma.notification.create({
    data: {
      zoneId: auth.session.zoneId,
      title,
      message,
      senderId: auth.session.sub,
      senderName: senderUser?.name ?? senderUser?.username ?? "Unknown",
      senderRole: auth.session.role,
      senderKvkId,
      senderKvkName,
      recipientKvkIds,
      source: "MANUAL",
    },
  });

  return NextResponse.json({ ok: true, id: notification.id }, { status: 201 });
}
