import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { buildReportSections } from "@/lib/report-data";
import { zoneReportLabel } from "@/lib/reports";
import { reportPeriodLabel } from "@/lib/report-types";
import {
  pruneToLeafPaths,
  pruneToSubsection,
  reportSubsectionForLeaf,
  type ReportSubsectionRef,
} from "@/lib/report-section-map";
import { leafModelFor } from "@/lib/form-summary-data";
import { getHostOrgKvkIds } from "@/lib/host-org-scope";

/**
 * Real report data for the "Download Report" PDF - the exact section tree
 * from the client's own "ATARI AMS REPORT" export. KVK Admin/User are always
 * scoped to their own KVK; Super Admin gets every KVK in the zone by
 * default, or one specific KVK via ?kvk=<name> (matches the Reports filter's
 * existing KVK dropdown).
 *
 * `?subsection=<form-management leaf path>` prunes the tree to just that
 * leaf's report subsection (see lib/report-section-map.ts) - the download a
 * Form Management list page offers is that same slice of the big report, not
 * a flat one-table export. `matched: false` on the response means the leaf
 * has no report subsection and the caller should fall back to its own flat
 * export.
 */
export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const kvkNameFilter = url.searchParams.get("kvk");
  const subsectionLeaf = url.searchParams.get("subsection");
  /** The Reports screen's "Select Form" checklist - a comma list of Form Management leaf paths. When present, the report is scoped to just those forms' subsections/tables. */
  const formPaths = (url.searchParams.get("forms") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  /** Inclusive YYYY-MM-DD reporting-period bounds - the Reports filter's own From/To, and the Form Management list's date range. Ignored unless well-formed. */
  const isoDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const fromDate = isoDate(url.searchParams.get("from"));
  const toDate = isoDate(url.searchParams.get("to"));
  /** "Reporting Year" checkbox multi-select - a comma list of 4-digit years, possibly non-contiguous. Wins over from/to when present (client request, 2026-09-07). */
  const years = Array.from(
    new Set(
      (url.searchParams.get("years") ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter((v) => /^\d{4}$/.test(v))
        .map(Number),
    ),
  ).sort((a, b) => a - b);
  const yearsArg = years.length > 0 ? years : undefined;
  /**
   * The list's own search box + per-column value checklist (real bug fix,
   * 2026-09-14: only reaches the few `blocks`-shaped builders that opt into
   * reading it via `applyListFilter` - every other builder is already
   * narrowed client-side by scopeReportSectionsToFilters, so passing this
   * along for them too is harmless, just unused).
   */
  const searchArg = url.searchParams.get("search")?.trim() || undefined;
  const colfRaw = url.searchParams.get("colf");
  let columnValuesArg: Record<string, string[]> | undefined;
  if (colfRaw) {
    try {
      const parsed = JSON.parse(colfRaw);
      if (parsed && typeof parsed === "object") columnValuesArg = parsed;
    } catch {
      // Malformed/tampered param - ignore rather than fail the whole download.
    }
  }
  const listFilterArg =
    searchArg || (columnValuesArg && Object.keys(columnValuesArg).length > 0)
      ? { search: searchArg, columnValues: columnValuesArg }
      : undefined;
  /**
   * KVK Admin/User are always scoped to their own single KVK. A Host
   * Organisation (ORG_ADMIN) - client direction, 2026-09-24 - gets a report
   * combined across every KVK mapped to its org, structured exactly like a
   * KVK's own report (buildReportSections picks KVK_TREE off `scope.kvkId`
   * being truthy, which `{in: [...]}` satisfies same as a plain string).
   * Super Admin gets every KVK in the zone by default, or one specific KVK
   * via ?kvk=<name>.
   */
  const isRestrictedToOwnKvk = auth.session.role === "KVK_ADMIN" || auth.session.role === "KVK_USER";
  const isOrgAdmin = auth.session.role === "ORG_ADMIN" && !!auth.session.hostOrgId;

  let kvkId: string | { in: string[] } | undefined = isRestrictedToOwnKvk
    ? auth.session.kvkId ?? undefined
    : isOrgAdmin
      ? { in: await getHostOrgKvkIds(auth.session.hostOrgId!) }
      : undefined;
  if (!isRestrictedToOwnKvk && !isOrgAdmin && kvkNameFilter && kvkNameFilter !== "All") {
    const match = await prisma.kvk.findFirst({
      where: { zoneId: auth.session.zoneId, name: kvkNameFilter },
      select: { id: true },
    });
    kvkId = match?.id;
  }

  const [zone, kvks] = await Promise.all([
    prisma.zone.findUnique({ where: { id: auth.session.zoneId }, select: { name: true } }),
    prisma.kvk.findMany({
      where: kvkId ? { id: kvkId } : { zoneId: auth.session.zoneId },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Resolve which subsection(s) this request could possibly need *before*
  // building the report, so a single-form/subsection download doesn't pay
  // for the other ~100 tables it's just going to prune away (perf fix,
  // 2026-09-18). `leafRef`/`formRefs` feed buildReportSections' restriction;
  // the actual pruning below is unchanged.
  const leafRef = subsectionLeaf ? reportSubsectionForLeaf(subsectionLeaf) : undefined;
  const formRefs = formPaths.length > 0
    ? formPaths.map(reportSubsectionForLeaf).filter((r): r is ReportSubsectionRef => !!r)
    : undefined;
  const restrictRefs = leafRef ? [leafRef] : formRefs;

  let sections = await buildReportSections(
    {
      kvkId,
      zoneId: auth.session.zoneId,
      fromDate,
      toDate,
      years: yearsArg,
      listFilter: listFilterArg,
    },
    restrictRefs,
  );

  let matched: boolean | undefined;
  if (subsectionLeaf) {
    if (leafRef) {
      const pruned = pruneToSubsection(sections, leafRef, leafModelFor(subsectionLeaf));
      matched = pruned.length > 0;
      if (matched) sections = pruned;
    } else {
      matched = false;
    }
  } else if (formPaths.length > 0) {
    // "Select Form" checklist on the Reports screen - keep only the checked
    // forms' subsections, each narrowed to its own table(s).
    const pruned = pruneToLeafPaths(sections, formPaths, reportSubsectionForLeaf, leafModelFor);
    if (pruned.length > 0) sections = pruned;
  }

  return NextResponse.json({
    zoneLabel: zone?.name ? zoneReportLabel(zone.name) : "ATARI",
    kvkNames: kvks.map((k) => k.name),
    periodLabel: reportPeriodLabel(fromDate, toDate, yearsArg),
    sections,
    ...(matched === undefined ? {} : { matched }),
  });
}
