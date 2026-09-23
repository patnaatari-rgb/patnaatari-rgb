import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { getHostOrgKvkIds } from "@/lib/host-org-scope";

/**
 * Real counts for the sections of the Technical Achievement Summary matrix
 * report that map unambiguously to an operational table (OFT/FLD counts,
 * trial/area totals, Training/Extension Activity/Soil-Water-Analysis
 * counts), plus the real OFT/FLD/Training/Extension Activity Target values
 * (client-confirmed 2026-08-29 - the Target model/`/targets` page landed
 * after this route's own comment first said "no target-setting feature",
 * which was true then but is stale now). The General/OBC/SC/ST x M/F
 * demographic breakdown still has no real data source anywhere in this
 * schema (no per-record caste/gender capture on these models) - those stay
 * 0 rather than fabricated, same honest-empty-state principle as before.
 */
export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const reportingYear = Number(url.searchParams.get("year")) || new Date().getFullYear();
  /** Checkbox multi-select (client request, 2026-08-25) - repeated ?kvk=A&kvk=B params, empty means "All KVKs". */
  const kvkNameFilters = url.searchParams.getAll("kvk");

  let kvkId: string | undefined;
  let kvkIds: string[] | undefined;
  if (auth.session.role !== "SUPER_ADMIN" && auth.session.kvkId) {
    kvkId = auth.session.kvkId;
  } else if (auth.session.role === "ORG_ADMIN" && auth.session.hostOrgId) {
    kvkIds = await getHostOrgKvkIds(auth.session.hostOrgId);
  } else if (kvkNameFilters.length === 1) {
    const kvk = await prisma.kvk.findFirst({
      where: { zoneId: auth.session.zoneId, name: kvkNameFilters[0] },
    });
    kvkId = kvk?.id;
  } else if (kvkNameFilters.length > 1) {
    const kvks = await prisma.kvk.findMany({
      where: { zoneId: auth.session.zoneId, name: { in: kvkNameFilters } },
      select: { id: true },
    });
    kvkIds = kvks.map((k) => k.id);
  }

  const scope = kvkId ? { kvkId } : kvkIds ? { kvkId: { in: kvkIds } } : { zoneId: auth.session.zoneId };

  const [
    oftCount,
    oftKvkCount,
    oftTrialSum,
    fldCount,
    fldAreaSum,
    trainingCount,
    extensionCount,
    soilWaterCount,
    targetsByCategory,
  ] = await Promise.all([
    prisma.oft.count({ where: { ...scope, reportingYear } }),
    prisma.oft
      .findMany({ where: { ...scope, reportingYear }, select: { kvkId: true }, distinct: ["kvkId"] })
      .then((rows) => rows.length),
    prisma.oft.aggregate({
      where: { ...scope, reportingYear },
      _sum: { noOfTrialReplicationFarmer: true },
    }),
    prisma.fld.count({ where: { ...scope, reportingYear } }),
    prisma.fldDemonstrationDetail.aggregate({
      where: kvkId
        ? { fld: { kvkId, reportingYear } }
        : kvkIds
          ? { fld: { kvkId: { in: kvkIds }, reportingYear } }
          : { zoneId: auth.session.zoneId, fld: { reportingYear } },
      _sum: { areaHa: true },
    }),
    prisma.training.count({ where: { ...scope, reportingYear } }),
    prisma.extensionActivity.count({ where: { ...scope, reportingYear } }),
    prisma.soilWaterPlantAnalysis.count({ where: scope }),
    /** Real Target values (client-confirmed 2026-08-29) - summed across every KVK in scope, same real Target rows /targets itself reads. */
    prisma.target.groupBy({
      by: ["category"],
      where: { ...scope, reportingYear },
      _sum: { targetValue: true },
    }),
  ]);

  const targetFor = (category: string) =>
    targetsByCategory.find((t) => t.category === category)?._sum.targetValue ?? 0;

  const zeroMatrix = Array(11).fill(0);

  return NextResponse.json({
    reportingYear,
    sections: {
      "oft-fld-0": {
        metrics: [targetFor("OFT"), oftCount, oftKvkCount, oftTrialSum._sum.noOfTrialReplicationFarmer ?? 0],
        leadColumn: 0,
        matrix: zeroMatrix,
      },
      "oft-fld-1": {
        metrics: [targetFor("FLD"), fldCount, Number(fldAreaSum._sum.areaHa ?? 0)],
        leadColumn: 0,
        matrix: zeroMatrix,
      },
      "training-extension-0": {
        metrics: [targetFor("Training"), trainingCount],
        leadColumn: 0,
        matrix: zeroMatrix,
      },
      "training-extension-1": {
        metrics: [targetFor("Extension Activity"), extensionCount],
        leadColumn: 0,
        matrix: zeroMatrix,
      },
      "seed-planting-0": { metrics: [0, 0, 0], leadColumn: 0, matrix: zeroMatrix },
      "seed-planting-1": { metrics: [0, 0, 0], leadColumn: 0, matrix: zeroMatrix },
      "livestock-soil-0": { metrics: [0, 0, 0], leadColumn: 0, matrix: zeroMatrix },
      "livestock-soil-1": {
        metrics: [0, soilWaterCount],
        leadColumn: 0,
        matrix: zeroMatrix,
      },
    },
  });
}
