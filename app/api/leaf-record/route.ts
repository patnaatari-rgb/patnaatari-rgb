import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { LEAF_RECORD_REGISTRY, syncLeafModuleImages } from "@/lib/leaf-record-registry";
import { safeErrorMessage } from "@/lib/safe-error-message";

export async function POST(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : "";
  const values = body?.values && typeof body.values === "object" ? body.values : {};

  const create = LEAF_RECORD_REGISTRY[path];
  if (!create) {
    return NextResponse.json(
      { error: "This form is not yet connected to the database." },
      { status: 501 },
    );
  }

  // These forms add a record to one specific KVK. A KVK Admin's own KVK is
  // implicit; Super Admin adding on a KVK's behalf needs a KVK-selection
  // step this generic form doesn't have yet, so that flow is scoped out
  // for now rather than guessed at.
  const kvkId = auth.session.kvkId;
  if (!kvkId) {
    return NextResponse.json(
      {
        error:
          "Adding records as Super Admin isn't available on this form yet - sign in as the KVK to add its data.",
      },
      { status: 400 },
    );
  }

  try {
    const record = await create(values, { kvkId, zoneId: auth.session.zoneId });
    const recordId = (record as { id?: string } | null)?.id;
    if (recordId) {
      // Every generic leaf form now carries an end-of-form Photographs (with
      // caption) section; whatever is attached flows into Module Images ->
      // Reports, keyed by this new record's id.
      await syncLeafModuleImages(path, values.moduleImages, {
        kvkId,
        zoneId: auth.session.zoneId,
        formRecordId: recordId,
        values,
        uploadedById: auth.session.sub,
      });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = safeErrorMessage(error, "Could not save this record.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
