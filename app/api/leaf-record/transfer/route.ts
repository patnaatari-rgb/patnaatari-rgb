import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";

/**
 * Real Transfer implementation (client spec, "Pointers for super admin 24
 * aug.pdf" - a precise state machine: manual only, Ongoing-only, the
 * original row stays visible under its real year marked Transferred, a new
 * Ongoing copy opens under reportingYear+1 carrying the same details). The
 * confirm dialog previously just closed itself with no backend call at all
 * - this route is what makes it real. `path` is the full recordPath every
 * form leaf submits (slug.join("/") - see forms/[...slug]/page.tsx), not
 * the bare nav slug, hence the full paths matched below rather than just
 * "oft"/"view-fld". Only OFT and FLD support Transfer (the other leaf that
 * gains a Transfer action, CFLD Technical Parameter, has its own dedicated
 * dialog/route and isn't handled here).
 */
export async function POST(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const kvkId = auth.session.kvkId;
  if (!kvkId) {
    return NextResponse.json({ error: "Only a KVK can transfer its own records." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : "";
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "Missing record id." }, { status: 400 });
  }

  if (path === "achievements/oft") {
    const original = await prisma.oft.findFirst({ where: { id, kvkId } });
    if (!original) return NextResponse.json({ error: "Record not found." }, { status: 404 });
    if (original.status !== "ONGOING") {
      return NextResponse.json({ error: "Only an Ongoing record can be transferred." }, { status: 400 });
    }
    const { id: _id, reportingYear, status: _status, createdAt: _c, updatedAt: _u, ...rest } = original;
    await prisma.$transaction([
      prisma.oft.update({ where: { id }, data: { status: "TRANSFERRED" } }),
      prisma.oft.create({ data: { ...rest, reportingYear: reportingYear + 1, status: "ONGOING" } }),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (path === "achievements/front-line-demonstration/view-fld") {
    const original = await prisma.fld.findFirst({ where: { id, kvkId } });
    if (!original) return NextResponse.json({ error: "Record not found." }, { status: 404 });
    if (original.status !== "ONGOING") {
      return NextResponse.json({ error: "Only an Ongoing record can be transferred." }, { status: 400 });
    }
    const { id: _id, reportingYear, status: _status, createdAt: _c, updatedAt: _u, ...rest } = original;
    await prisma.$transaction([
      prisma.fld.update({ where: { id }, data: { status: "TRANSFERRED" } }),
      prisma.fld.create({ data: { ...rest, reportingYear: reportingYear + 1, status: "ONGOING" } }),
    ]);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Transfer is not supported for this form." }, { status: 400 });
}
