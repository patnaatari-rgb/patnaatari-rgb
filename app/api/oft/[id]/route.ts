import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { resolveKvkScope } from "@/lib/host-org-scope";

const numStr = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const dateStr = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : "");

/** Loads one OFT record's full field set (richer than the list table's 6 columns) for OftEditForm - the generic EditLeafPage's sessionStorage bridge only ever carries what the list row itself has, which isn't enough for this leaf's real, richer Edit form. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession(["KVK_ADMIN", "ORG_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const record = await prisma.oft.findFirst({
    where: { id, ...(await resolveKvkScope(auth.session)) },
    include: { technologyOptions: { orderBy: { id: "asc" } } },
  });
  if (!record) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const moduleImages = await prisma.moduleImage.findMany({
    // slot "" is this form's own end-of-form Photographs section; the OFT
    // Result tab keeps its photos under slot "oft-result" on the same record.
    where: { formRecordId: id, slot: "" },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    reportingYear: numStr(record.reportingYear),
    season: record.season ?? "",
    oftSubject: record.oftSubject ?? "",
    discipline: record.discipline,
    staff: record.staff,
    thematicArea: record.thematicArea,
    trialOnForm: record.trialOnForm,
    problemDiagnosed: record.problemDiagnosed ?? "",
    sourceOfTechnology: record.sourceOfTechnology ?? "",
    sourceOfFunding: record.sourceOfFunding ?? "",
    productionSystem: record.productionSystem ?? "",
    performanceIndicators: record.performanceIndicators ?? "",
    finalRecommendation: record.finalRecommendation ?? "",
    constraintsIdentified: record.constraintsIdentified ?? "",
    farmersParticipationProcess: record.farmersParticipationProcess ?? "",
    quantity: numStr(record.quantity),
    unit: record.unit ?? "",
    noOfLocation: numStr(record.noOfLocation),
    noOfTrialReplicationFarmer: numStr(record.noOfTrialReplicationFarmer),
    startMonth: dateStr(record.startMonth),
    endMonth: dateStr(record.endMonth),
    criticalInput: record.criticalInput ?? "",
    costOfOft: numStr(record.costOfOft),
    fundingAgency: record.fundingAgency ?? "",
    status: record.status === "COMPLETED" ? "Completed" : "Ongoing",
    generalMale: numStr(record.generalMale),
    generalFemale: numStr(record.generalFemale),
    obcMale: numStr(record.obcMale),
    obcFemale: numStr(record.obcFemale),
    scMale: numStr(record.scMale),
    scFemale: numStr(record.scFemale),
    stMale: numStr(record.stMale),
    stFemale: numStr(record.stFemale),
    technologyOptions: record.technologyOptions.map((t) => ({ label: t.label, description: t.description })),
    moduleImages: moduleImages.map((m) => ({ url: m.imageUrl, caption: m.caption })),
  });
}
