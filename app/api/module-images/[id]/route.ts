import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { resolveKvkScope } from "@/lib/host-org-scope";

/**
 * Publish/unpublish toggle. Governance split confirmed in lib/module-images.ts's
 * own header comment: a KVK owns its photographs and decides when one goes
 * live, but Super Admin holds final authority and can flip either way too -
 * so this allows both roles, KVK Admin scoped to their own KVK's rows.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession(["KVK_ADMIN", "ORG_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  if (typeof body?.published !== "boolean") {
    return NextResponse.json({ error: "published (boolean) is required." }, { status: 400 });
  }

  const where = { id, ...(await resolveKvkScope(auth.session)) };

  const result = await prisma.moduleImage.updateMany({ where, data: { published: body.published } });
  if (result.count === 0) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/** A KVK can remove its own upload; Super Admin can remove any (moderation). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession(["KVK_ADMIN", "ORG_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const where = { id, ...(await resolveKvkScope(auth.session)) };

  const result = await prisma.moduleImage.deleteMany({ where });
  if (result.count === 0) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
