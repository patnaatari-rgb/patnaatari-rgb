import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { LEAF_UPDATE_REGISTRY, syncLeafModuleImages, syncStaffPhotoModuleImage } from "@/lib/leaf-record-registry";
import { safeErrorMessage } from "@/lib/safe-error-message";
import { getHostOrgKvkIds } from "@/lib/host-org-scope";

export async function POST(request: Request) {
  const auth = await requireSession(["KVK_ADMIN", "ORG_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : "";
  const id = typeof body?.id === "string" ? body.id : "";
  const values = body?.values && typeof body.values === "object" ? body.values : {};

  const update = LEAF_UPDATE_REGISTRY[path];
  if (!update) {
    return NextResponse.json(
      { error: "This form is not yet connected to the database." },
      { status: 501 },
    );
  }
  if (!id) {
    return NextResponse.json({ error: "Missing record id." }, { status: 400 });
  }

  try {
    const kvkIds =
      auth.session.role === "ORG_ADMIN" && auth.session.hostOrgId
        ? await getHostOrgKvkIds(auth.session.hostOrgId)
        : undefined;
    const result = await update(id, values, { kvkId: auth.session.kvkId, kvkIds, zoneId: auth.session.zoneId });
    if (result.count === 0) {
      return NextResponse.json(
        { error: "Record not found, or it doesn't belong to your KVK." },
        { status: 404 },
      );
    }
    // A KVK Admin editing its own record reconciles that record's Module
    // Images (add/remove in the form's Photographs section) - keyed by the
    // record id so other records' images are untouched.
    if (auth.session.kvkId) {
      await syncLeafModuleImages(path, values.moduleImages, {
        kvkId: auth.session.kvkId,
        zoneId: auth.session.zoneId,
        formRecordId: id,
        values,
        uploadedById: auth.session.sub,
      });
      if (path === "about-kvk/employee/employee-details") {
        await syncStaffPhotoModuleImage(values, {
          kvkId: auth.session.kvkId,
          zoneId: auth.session.zoneId,
          formRecordId: id,
          uploadedById: auth.session.sub,
        });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = safeErrorMessage(error, "Could not update this record.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
