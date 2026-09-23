import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { parseResultTables, type OftResultTable } from "@/lib/oft-result-tables";
import { leafCategoryLabel, syncModuleImages } from "@/lib/leaf-record-registry";
import { resolveKvkScope } from "@/lib/host-org-scope";

/** The Edit OFT Result "Photographs" section stores through ModuleImage (like every other form's photos) under this slot, so each photo carries a caption and flows to Module Images + Reports without colliding with the main OFT form's own Photographs section (same formRecordId, slot ""). */
const OFT_RESULT_PHOTO_SLOT = "oft-result";
const OFT_LEAF_PATH = "achievements/oft";

const str = (v: string | undefined) => (v?.trim() ? v.trim() : null);

/**
 * Real "Edit OFT Result" page (atari-client.vercel.app, confirmed
 * 2026-09-02) - Final Recommendation/Constraints Identified/Process of
 * Farmers Participation/Result/Remark, Photographs + Supplementary
 * Datasheets uploads, and the Dynamic Result Tables (lib/oft-result-tables.ts).
 * Replaces the earlier single-textarea placeholder dialog entirely.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession(["KVK_ADMIN", "ORG_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const kvkScope = await resolveKvkScope(auth.session);

  const record = await prisma.oft.findFirst({
    where: { id, ...kvkScope },
    include: { technologyOptions: { orderBy: { id: "asc" } } },
  });
  if (!record) return NextResponse.json({ error: "Record not found." }, { status: 404 });

  const photos = await prisma.moduleImage.findMany({
    where: { formRecordId: id, slot: OFT_RESULT_PHOTO_SLOT },
    orderBy: { createdAt: "asc" },
    select: { imageUrl: true, caption: true },
  });

  return NextResponse.json({
    finalRecommendation: record.finalRecommendation ?? "",
    constraintsIdentified: record.constraintsIdentified ?? "",
    farmersParticipationProcess: record.farmersParticipationProcess ?? "",
    resultSummary: record.resultSummary ?? "",
    remark: record.remark ?? "",
    photographs: photos.map((p) => ({ url: p.imageUrl, caption: p.caption })),
    supplementaryDatasheetUrls: record.supplementaryDatasheetUrls,
    resultTables: parseResultTables(
      record.resultTablesJson,
      record.technologyOptions.map((t) => t.label),
    ),
    status: record.status,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession(["KVK_ADMIN", "ORG_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const kvkScope = await resolveKvkScope(auth.session);

  const body = await request.json().catch(() => null);
  const markCompleted = body?.markCompleted === true;
  const resultTables: OftResultTable[] = Array.isArray(body?.resultTables) ? body.resultTables : [];
  const supplementaryDatasheetUrls: string[] = Array.isArray(body?.supplementaryDatasheetUrls)
    ? body.supplementaryDatasheetUrls
    : [];
  /** FormPhotosField's own value - a JSON-stringified `{ url, caption }[]`. */
  const rawPhotographs = typeof body?.photographs === "string" ? body.photographs : JSON.stringify(body?.photographs ?? []);

  const record = await prisma.oft.findFirst({
    where: { id, ...kvkScope },
    select: { id: true, kvkId: true, zoneId: true, reportingYear: true, startMonth: true },
  });
  if (!record) return NextResponse.json({ error: "Record not found." }, { status: 404 });

  await prisma.oft.update({
    where: { id: record.id },
    data: {
      finalRecommendation: str(body?.finalRecommendation),
      constraintsIdentified: str(body?.constraintsIdentified),
      farmersParticipationProcess: str(body?.farmersParticipationProcess),
      resultSummary: str(body?.resultSummary),
      remark: str(body?.remark),
      supplementaryDatasheetUrls,
      resultTablesJson: resultTables.length > 0 ? JSON.stringify(resultTables) : null,
      ...(markCompleted ? { status: "COMPLETED" } : {}),
    },
  });

  await syncModuleImages(rawPhotographs, {
    kvkId: record.kvkId,
    zoneId: record.zoneId,
    categoryPath: OFT_LEAF_PATH,
    categoryLabel: leafCategoryLabel(OFT_LEAF_PATH),
    reportingYear: record.reportingYear,
    activityDate: record.startMonth ?? new Date(),
    formRecordId: record.id,
    slot: OFT_RESULT_PHOTO_SLOT,
    uploadedById: auth.session.sub,
  });

  return NextResponse.json({ ok: true });
}
