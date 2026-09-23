import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { percentIncreaseInYield, yieldGapMinimizedPercent } from "@/lib/cfld-formulas";
import { leafCategoryLabel, syncModuleImages } from "@/lib/leaf-record-registry";
import { resolveKvkScope } from "@/lib/host-org-scope";

/** The two CFLD Technical Parameter photo cards each store through ModuleImage under their own slot, so every photo carries a caption and flows to Module Images + Reports. */
const CFLD_LEAF_PATH = "projects/cfld/technical-parameter";
const CFLD_TRAINING_SLOT = "cfld-training";
const CFLD_ACTION_SLOT = "cfld-action";

const str = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);
const reqStr = (v: string | undefined) => v?.trim() ?? "";
const reqInt = (v: string | undefined) => parseInt(v ?? "0", 10) || 0;
const dec = (v: string | undefined) => (v?.trim() ? Number(v) : undefined);
const reqDec = (v: string | undefined) => Number(v) || 0;
const numStr = (v: unknown) => (v === null || v === undefined ? "" : String(v));
/** `<input type="date">` needs "YYYY-MM-DD" - Date#toISOString()'s own leading slice, not a real formatting library, matching every other real date-input field already in this codebase. */
const dateStr = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : "");

/** Loads one CFLD Technical Parameter record (+ its Economic/Perception children) shaped exactly like CfldTechnicalParameterPage's own state, for the Edit flow. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession(["KVK_ADMIN", "ORG_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const record = await prisma.cfldTechnicalParameter.findFirst({
    where: { id, ...(await resolveKvkScope(auth.session)) },
    include: { economicParameters: true, farmersPerceptions: true, socioEconomicImpacts: true },
  });
  if (!record) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const economic = record.economicParameters[0];
  const perception = record.farmersPerceptions[0];
  const socioEconomicImpact = record.socioEconomicImpacts[0];
  const demographics = (record.farmersByCategory as Record<string, string> | null) ?? {};

  const photos = await prisma.moduleImage.findMany({
    where: { formRecordId: id, slot: { in: [CFLD_TRAINING_SLOT, CFLD_ACTION_SLOT] } },
    orderBy: { createdAt: "asc" },
    select: { imageUrl: true, caption: true, slot: true },
  });
  const photosForSlot = (slot: string) =>
    photos.filter((p) => p.slot === slot).map((p) => ({ url: p.imageUrl, caption: p.caption }));

  return NextResponse.json({
    trainingPhotos: photosForSlot(CFLD_TRAINING_SLOT),
    actionPhotos: photosForSlot(CFLD_ACTION_SLOT),
    technical: {
      reportingYear: numStr(record.reportingYear),
      reportingDate: dateStr(record.reportingDate),
      month: record.month ?? "",
      season: record.season,
      cropType: record.cropType ?? "",
      crop: record.crop,
      variety: record.variety ?? "",
      areaHa: numStr(record.areaHa),
      targetAreaHa: numStr(record.targetAreaHa),
      targetDemonstrations: numStr(record.targetDemonstrations),
      technologyDemonstrated: record.detailOfTechnologyDemonstrated,
      existingFarmerPractice: record.existingFarmerPractice ?? "",
      farmerYield: numStr(record.yieldFarmerFieldQha),
      demoYieldMax: numStr(record.yieldDemoMaxQha),
      demoYieldMin: numStr(record.yieldDemoMinQha),
      demoYieldAvg: numStr(record.yieldDemoAvgQha),
      districtYield: numStr(record.districtYield),
      stateYield: numStr(record.stateYield),
      potentialYield: numStr(record.potentialYield),
      numberOfFarmers: numStr(record.numberOfFarmers),
    },
    economic: economic
      ? {
          costDemo: numStr(economic.demoGrossCost),
          costFarmer: numStr(economic.farmerGrossCost),
          grossReturnDemo: numStr(economic.demoGrossReturn),
          grossReturnFarmer: numStr(economic.farmerGrossReturn),
          netReturnDemo: numStr(economic.demoNetReturn),
          netReturnFarmer: numStr(economic.farmerNetReturn),
          bcRatioDemo: numStr(economic.demoBcRatio),
          bcRatioFarmer: numStr(economic.farmerBcRatio),
          additionalIncome: numStr(economic.additionalIncome),
        }
      : {},
    demographics,
    socioEconomic: socioEconomicImpact
      ? {
          totalProduceObtainedKg: numStr(socioEconomicImpact.totalProduceObtainedKg),
          produceSoldKgPerHousehold: numStr(socioEconomicImpact.produceSoldKgPerHousehold),
          sellingRatePerKg: numStr(socioEconomicImpact.sellingRatePerKg),
          produceUsedOwnFarmKg: numStr(socioEconomicImpact.produceUsedOwnFarmKg),
          produceDistributedToOthersKg: numStr(socioEconomicImpact.produceDistributedToOthersKg),
          employmentGeneratedMandays: numStr(socioEconomicImpact.employmentGeneratedMandays),
          purposeOfIncomeUtilized: socioEconomicImpact.purposeOfIncomeUtilized ?? "",
        }
      : {},
    perception: perception
      ? {
          suitability: perception.suitability ?? "",
          likingsPreference: perception.liking ?? "",
          affordability: numStr(perception.affordabilityPercent),
          negativeEffect: perception.negativeEffect ?? "",
          acceptableToAll: perception.acceptableToGroup ?? "",
          suggestions: perception.suggestions ?? "",
          farmerFeedback: perception.farmerFeedback ?? "",
        }
      : {},
    status: record.status,
  });
}

/** Updates the parent record's own fields, and replaces its Economic/Perception children wholesale (simpler and just as correct as a partial merge, since the dialog always submits the full tab state). */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession(["KVK_ADMIN", "ORG_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const existing = await prisma.cfldTechnicalParameter.findFirst({
    where: { id, ...(await resolveKvkScope(auth.session)) },
  });
  if (!existing) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const technical = body?.technical ?? {};
  const economic = body?.economic ?? {};
  const demographics = body?.demographics ?? {};
  const socioEconomic = body?.socioEconomic ?? {};
  const perception = body?.perception ?? {};
  const status = body?.status === "COMPLETED" ? "COMPLETED" : "ONGOING";

  if (!technical.crop || !technical.technologyDemonstrated) {
    return NextResponse.json({ error: "Crop and Technology Demonstrated are required." }, { status: 400 });
  }
  const reportingDateRaw = str(technical.reportingDate);
  const reportingDate = reportingDateRaw ? new Date(reportingDateRaw) : undefined;
  if (!reportingDate || Number.isNaN(reportingDate.getTime())) {
    return NextResponse.json({ error: "Reporting Year is required." }, { status: 400 });
  }

  const farmerYield = dec(technical.farmerYield);
  const demoYieldAvg = dec(technical.demoYieldAvg);
  const districtYield = dec(technical.districtYield);
  const stateYield = dec(technical.stateYield);
  const potentialYield = dec(technical.potentialYield);

  const hasEconomic = Object.values(economic).some((v) => v !== "" && v != null);
  const farmerGrossCost = dec(economic.costFarmer);
  const farmerGrossReturn = dec(economic.grossReturnFarmer);
  const demoGrossCost = dec(economic.costDemo);
  const demoGrossReturn = dec(economic.grossReturnDemo);

  const hasPerception = Object.values(perception).some((v) => v !== "" && v != null);
  const hasSocioEconomic = Object.values(socioEconomic).some((v) => v !== "" && v != null);

  // Parent update + the 3 children's replace-wholesale (delete then
  // conditionally recreate) all commit together - previously 5-7 separate
  // awaits, so a failure partway through (e.g. the DB connection dropping
  // between the economic delete and its recreate) could leave the record
  // half-updated. $transaction makes it all-or-nothing.
  await prisma.$transaction([
    prisma.cfldTechnicalParameter.update({
      where: { id },
      data: {
        // reportingYear is ALWAYS derived from reportingDate - see the create
        // route's matching comment for why the old reqInt(technical.
        // reportingYear) fallback let the two silently drift apart.
        reportingYear: reportingDate.getFullYear(),
        reportingDate,
        month: str(technical.month),
        season: reqStr(technical.season),
        cropType: str(technical.cropType),
        crop: reqStr(technical.crop),
        cropDemonstrated: reqStr(technical.crop),
        variety: str(technical.variety),
        areaHa: reqDec(technical.areaHa),
        targetAreaHa: dec(technical.targetAreaHa),
        targetDemonstrations: technical.targetDemonstrations?.trim() ? parseInt(technical.targetDemonstrations, 10) : undefined,
        numberOfFarmers: reqInt(technical.numberOfFarmers),
        farmersByCategory: demographics,
        detailOfTechnologyDemonstrated: reqStr(technical.technologyDemonstrated),
        existingFarmerPractice: str(technical.existingFarmerPractice),
        yieldFarmerFieldQha: farmerYield,
        yieldDemoMaxQha: dec(technical.demoYieldMax),
        yieldDemoMinQha: dec(technical.demoYieldMin),
        yieldDemoAvgQha: demoYieldAvg,
        districtYield,
        stateYield,
        potentialYield,
        percentIncrease: percentIncreaseInYield(demoYieldAvg, farmerYield),
        yieldGapMinimizedPercentDistrict: yieldGapMinimizedPercent(districtYield, demoYieldAvg),
        yieldGapMinimizedPercentState: yieldGapMinimizedPercent(stateYield, demoYieldAvg),
        yieldGapMinimizedPercentPotential: yieldGapMinimizedPercent(potentialYield, demoYieldAvg),
        status,
      },
    }),
    prisma.cfldEconomicParameter.deleteMany({ where: { cfldTechnicalParameterId: id } }),
    ...(hasEconomic
      ? [
          prisma.cfldEconomicParameter.create({
            data: {
              cfldTechnicalParameterId: id,
              zoneId: auth.session.zoneId,
              detailOfTechnology: reqStr(technical.technologyDemonstrated),
              farmerGrossCost,
              demoGrossCost,
              farmerGrossReturn,
              demoGrossReturn,
              // Real reference (atari-client.vercel.app, 2026-09-01): Net Return and
              // B:C ratio are shown as "Auto-calculated" (Gross Return - Gross
              // Cost, Gross Return / Gross Cost), not independently entered - the
              // old dialog let them be typed in directly, which no longer matches.
              farmerNetReturn:
                farmerGrossReturn !== undefined && farmerGrossCost !== undefined
                  ? farmerGrossReturn - farmerGrossCost
                  : undefined,
              demoNetReturn:
                demoGrossReturn !== undefined && demoGrossCost !== undefined
                  ? demoGrossReturn - demoGrossCost
                  : undefined,
              farmerBcRatio:
                farmerGrossReturn !== undefined && farmerGrossCost
                  ? farmerGrossReturn / farmerGrossCost
                  : undefined,
              demoBcRatio:
                demoGrossReturn !== undefined && demoGrossCost
                  ? demoGrossReturn / demoGrossCost
                  : undefined,
              additionalIncome: dec(economic.additionalIncome),
            },
          }),
        ]
      : []),
    prisma.cfldFarmersPerception.deleteMany({ where: { cfldTechnicalParameterId: id } }),
    ...(hasPerception
      ? [
          prisma.cfldFarmersPerception.create({
            data: {
              cfldTechnicalParameterId: id,
              zoneId: auth.session.zoneId,
              technologyDetail: reqStr(technical.technologyDemonstrated),
              suitability: str(perception.suitability),
              liking: str(perception.likingsPreference),
              affordabilityPercent: dec(perception.affordability),
              negativeEffect: str(perception.negativeEffect),
              acceptableToGroup: str(perception.acceptableToAll),
              suggestions: str(perception.suggestions),
              farmerFeedback: str(perception.farmerFeedback),
            },
          }),
        ]
      : []),
    prisma.cfldSocioEconomicImpact.deleteMany({ where: { cfldTechnicalParameterId: id } }),
    ...(hasSocioEconomic
      ? [
          prisma.cfldSocioEconomicImpact.create({
            data: {
              cfldTechnicalParameterId: id,
              zoneId: auth.session.zoneId,
              cropDemonstrated: reqStr(technical.crop),
              totalProduceObtainedKg: dec(socioEconomic.totalProduceObtainedKg),
              produceSoldKgPerHousehold: dec(socioEconomic.produceSoldKgPerHousehold),
              sellingRatePerKg: dec(socioEconomic.sellingRatePerKg),
              produceUsedOwnFarmKg: dec(socioEconomic.produceUsedOwnFarmKg),
              produceDistributedToOthersKg: dec(socioEconomic.produceDistributedToOthersKg),
              purposeOfIncomeUtilized: str(socioEconomic.purposeOfIncomeUtilized),
              employmentGeneratedMandays: dec(socioEconomic.employmentGeneratedMandays),
            },
          }),
        ]
      : []),
  ]);

  const photoYear = reportingDate ? reportingDate.getFullYear() : reqInt(technical.reportingYear) || new Date().getFullYear();
  const photoDate = reportingDate ?? new Date();
  const photoBase = {
    kvkId: existing.kvkId,
    zoneId: auth.session.zoneId,
    categoryPath: CFLD_LEAF_PATH,
    categoryLabel: leafCategoryLabel(CFLD_LEAF_PATH),
    reportingYear: photoYear,
    activityDate: photoDate,
    formRecordId: id,
    uploadedById: auth.session.sub,
  };
  const asJson = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v ?? []));
  await syncModuleImages(asJson(body?.trainingPhotos), { ...photoBase, slot: CFLD_TRAINING_SLOT });
  await syncModuleImages(asJson(body?.actionPhotos), { ...photoBase, slot: CFLD_ACTION_SLOT });

  return NextResponse.json({ ok: true });
}
