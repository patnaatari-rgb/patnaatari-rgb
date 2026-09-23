import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { resolveKvkScope } from "@/lib/host-org-scope";

const numStr = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const dateStr = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : "");

/** Loads one FLD record's full field set (richer than the list table's columns) for FldForm - mirrors /api/oft/[id]. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession(["KVK_ADMIN", "ORG_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const record = await prisma.fld.findFirst({
    where: { id, ...(await resolveKvkScope(auth.session)) },
  });
  if (!record) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const moduleImages = await prisma.moduleImage.findMany({
    where: { formRecordId: id, slot: "" },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    reportingYear: numStr(record.reportingYear),
    startDate: dateStr(record.startDate),
    endDate: dateStr(record.endDate),
    staff: record.staff ?? "",
    season: record.season ?? "",
    sector: record.sector ?? "",
    thematicArea: record.thematicArea ?? "",
    category: record.category,
    subCategory: record.subCategory,
    cropAnimalEnterprise: record.cropAnimalEnterprise ?? "",
    technologyDemonstrated: record.technologyDemonstrated,
    noOfDemonstration: numStr(record.noOfDemonstration),
    unit: record.unit ?? "",
    quantity: numStr(record.quantity),
    status: record.status === "COMPLETED" ? "Completed" : "Ongoing",
    generalMale: numStr(record.generalMale),
    generalFemale: numStr(record.generalFemale),
    obcMale: numStr(record.obcMale),
    obcFemale: numStr(record.obcFemale),
    scMale: numStr(record.scMale),
    scFemale: numStr(record.scFemale),
    stMale: numStr(record.stMale),
    stFemale: numStr(record.stFemale),
    moduleImages: moduleImages.map((m) => ({ url: m.imageUrl, caption: m.caption })),
  });
}
