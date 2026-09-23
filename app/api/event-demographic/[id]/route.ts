import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { resolveKvkScope } from "@/lib/host-org-scope";

const reqStr = (v: string | undefined) => v?.trim() ?? "";
const reqInt = (v: string | undefined) => parseInt(v ?? "0", 10) || 0;
const str = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);
const reqDate = (v: string | undefined) => new Date(v ?? Date.now());
const int = (v: string | undefined) => (v?.trim() ? parseInt(v, 10) || 0 : undefined);
const numStr = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const dateStr = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : "");

/** DemographicBreakdown's own key convention - shared write side, mirrors app/api/event-demographic/route.ts. */
function demographicData(v: Record<string, string>) {
  return {
    generalMale: reqInt(v.generalMale),
    generalFemale: reqInt(v.generalFemale),
    obcMale: reqInt(v.obcMale),
    obcFemale: reqInt(v.obcFemale),
    scMale: reqInt(v.scMale),
    scFemale: reqInt(v.scFemale),
    stMale: reqInt(v.stMale),
    stFemale: reqInt(v.stFemale),
  };
}

/** Read side - same 8 keys, back out as strings for the dialog's own DemographicValues state. */
function demographicValues(record: {
  generalMale: number; generalFemale: number; obcMale: number; obcFemale: number;
  scMale: number; scFemale: number; stMale: number; stFemale: number;
}) {
  return {
    generalMale: numStr(record.generalMale),
    generalFemale: numStr(record.generalFemale),
    obcMale: numStr(record.obcMale),
    obcFemale: numStr(record.obcFemale),
    scMale: numStr(record.scMale),
    scFemale: numStr(record.scFemale),
    stMale: numStr(record.stMale),
    stFemale: numStr(record.stFemale),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession(["KVK_ADMIN", "ORG_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const slug = new URL(request.url).searchParams.get("slug");
  const kvkScope = await resolveKvkScope(auth.session);

  if (slug === "technology-week-celebration") {
    const record = await prisma.technologyWeekCelebration.findFirst({
      where: { id, ...kvkScope },
    });
    if (!record) return NextResponse.json({ error: "Record not found." }, { status: 404 });
    return NextResponse.json({
      values: {
        startDate: dateStr(record.startDate),
        endDate: dateStr(record.endDate),
        typeOfActivities: record.typeOfActivities,
        noOfActivities: numStr(record.noOfActivities),
        relatedCropTechnology: record.relatedCropTechnology ?? "",
        numberOfParticipants: numStr(record.numberOfParticipants),
        ...demographicValues(record),
      },
    });
  }

  if (slug === "world-soil-day") {
    const record = await prisma.worldSoilDay.findFirst({
      where: { id, ...kvkScope },
    });
    if (!record) return NextResponse.json({ error: "Record not found." }, { status: 404 });
    return NextResponse.json({
      values: {
        reportingYear: numStr(record.reportingYear ?? ""),
        noOfActivitiesConducted: numStr(record.noOfActivitiesConducted),
        soilHealthCardsDistributed: numStr(record.soilHealthCardsDistributed),
        noOfVip: numStr(record.noOfVip),
        vipNames: record.vipNames ?? "",
        totalParticipants: numStr(record.totalParticipants),
        ...demographicValues(record),
      },
    });
  }

  return NextResponse.json({ error: "Unknown event type." }, { status: 400 });
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
  const slug = body?.slug;
  const v: Record<string, string> = body?.values ?? {};

  if (slug === "technology-week-celebration") {
    const demographics = demographicData(v);
    const result = await prisma.technologyWeekCelebration.updateMany({
      where: { id, ...kvkScope },
      data: {
        startDate: reqDate(v.startDate),
        endDate: reqDate(v.endDate),
        typeOfActivities: reqStr(v.typeOfActivities),
        noOfActivities: reqInt(v.noOfActivities),
        relatedCropTechnology: str(v.relatedCropTechnology),
        /** Server-computed, never trusted from the client - see app/api/event-demographic/route.ts's POST for why. */
        numberOfParticipants: Object.values(demographics).reduce((sum, n) => sum + n, 0),
        ...demographics,
      },
    });
    if (result.count === 0) return NextResponse.json({ error: "Record not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (slug === "world-soil-day") {
    const result = await prisma.worldSoilDay.updateMany({
      where: { id, ...kvkScope },
      data: {
        reportingYear: int(v.reportingYear),
        noOfActivitiesConducted: reqInt(v.noOfActivitiesConducted),
        soilHealthCardsDistributed: reqInt(v.soilHealthCardsDistributed),
        noOfVip: reqInt(v.noOfVip),
        vipNames: str(v.vipNames),
        totalParticipants: reqInt(v.totalParticipants),
        ...demographicData(v),
      },
    });
    if (result.count === 0) return NextResponse.json({ error: "Record not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown event type." }, { status: 400 });
}
