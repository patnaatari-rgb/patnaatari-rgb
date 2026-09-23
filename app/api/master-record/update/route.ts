import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { MASTER_UPDATE_REGISTRY } from "@/lib/masters-registry";
import { safeErrorMessage } from "@/lib/safe-error-message";

export async function POST(request: Request) {
  const auth = await requireSession(["SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : "";
  const id = typeof body?.id === "string" ? body.id : "";
  const values = body?.values && typeof body.values === "object" ? body.values : {};

  const update = MASTER_UPDATE_REGISTRY[path];
  if (!update) {
    return NextResponse.json(
      { error: "This master is not yet connected to the database." },
      { status: 501 },
    );
  }
  if (!id) {
    return NextResponse.json({ error: "Missing record id." }, { status: 400 });
  }

  try {
    const result = await update(id, values, auth.session.zoneId);
    if (result.count === 0) {
      return NextResponse.json({ error: "Record not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = safeErrorMessage(error, "Could not update this record.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
