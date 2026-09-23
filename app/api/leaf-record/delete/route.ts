import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { LEAF_DELETE_REGISTRY } from "@/lib/leaf-record-registry";
import { safeErrorMessage } from "@/lib/safe-error-message";

export async function POST(request: Request) {
  const auth = await requireSession(["KVK_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : "";
  const id = typeof body?.id === "string" ? body.id : "";

  const remove = LEAF_DELETE_REGISTRY[path];
  if (!remove) {
    return NextResponse.json(
      { error: "This form is not yet connected to the database." },
      { status: 501 },
    );
  }
  if (!id) {
    return NextResponse.json({ error: "Missing record id." }, { status: 400 });
  }

  try {
    const result = await remove(id, { kvkId: auth.session.kvkId, zoneId: auth.session.zoneId });
    if (result.count === 0) {
      return NextResponse.json(
        { error: "Record not found, or it doesn't belong to your KVK." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = safeErrorMessage(error, "Could not delete this record.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
