import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";

/**
 * Real "Mark Completed" implementation (client reference, On Farm Trials
 * dropdown, 2026-09-01) - a direct Ongoing -> Completed flip with no form,
 * separate from Edit Result (OFT's own Add/Edit Result dialog is still a
 * placeholder pending its dynamic-table feature). FLD already marks
 * Completed for real inside FldResultDialog (PUT /api/fld-result/[id] with
 * markCompleted:true) and isn't handled here - only OFT needs this
 * standalone action. `path` is the full recordPath every form leaf submits
 * (slug.join("/")), matching the same convention as /api/leaf-record/transfer.
 */
export async function POST(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const kvkId = auth.session.kvkId;
  if (!kvkId) {
    return NextResponse.json({ error: "Only a KVK can mark its own records completed." }, { status: 400 });
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
      return NextResponse.json({ error: "Only an Ongoing record can be marked Completed." }, { status: 400 });
    }
    await prisma.oft.update({ where: { id }, data: { status: "COMPLETED" } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Mark Completed is not supported for this form." }, { status: 400 });
}
