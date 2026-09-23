import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { resolveKvkScope } from "@/lib/host-org-scope";

/**
 * The Module Images already filed against one leaf record, in FormPhotosField's
 * own `{ url, caption }[]` shape - so a generic Edit form can preload its
 * Photographs section without every leaf's list page having to hand the images
 * down through its rows. Scoped to the caller's own KVK (or, for a Super
 * Admin, their zone) so it can't read another tenant's photos.
 */
export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const recordId = new URL(request.url).searchParams.get("recordId");
  if (!recordId) return NextResponse.json({ photos: [] });

  const scope = await resolveKvkScope(auth.session);

  const rows = await prisma.moduleImage.findMany({
    // slot "" is the primary end-of-form Photographs section every generic
    // leaf uses; other slots ("oft-result", "cfld-*") belong to bespoke forms.
    where: { formRecordId: recordId, slot: "", ...scope },
    orderBy: { createdAt: "asc" },
    select: { imageUrl: true, caption: true },
  });

  return NextResponse.json({
    photos: rows.map((row) => ({ url: row.imageUrl, caption: row.caption })),
  });
}
