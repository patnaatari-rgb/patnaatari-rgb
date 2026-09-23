import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { MASTER_DELETE_REGISTRY } from "@/lib/masters-registry";
import { safeErrorMessage } from "@/lib/safe-error-message";

export async function POST(request: Request) {
  const auth = await requireSession(["SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : "";
  const id = typeof body?.id === "string" ? body.id : "";

  const remove = MASTER_DELETE_REGISTRY[path];
  if (!remove) {
    return NextResponse.json(
      { error: "This master is not yet connected to the database." },
      { status: 501 },
    );
  }
  if (!id) {
    return NextResponse.json({ error: "Missing record id." }, { status: 400 });
  }

  try {
    const result = await remove(id, auth.session.zoneId);
    if (result.count === 0) {
      return NextResponse.json({ error: "Record not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    /** Prisma P2003 - still referenced by child master rows (e.g. a Sector with Categories under it). */
    const isForeignKeyError =
      typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
    const message = isForeignKeyError
      ? "Can't delete - other master records still reference this one."
      : safeErrorMessage(error, "Could not delete this record.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
