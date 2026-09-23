import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { getHostOrgKvkIds } from "@/lib/host-org-scope";

/**
 * Real counts for the Dashboard's stat cards and progress-chart summaries.
 * Training/Extension Activity have no status column anywhere in the schema
 * (confirmed against schema.prisma), so their progress cards only ever get
 * a total + "KVKs with entries" breakdown, not an ongoing/completed split -
 * OFT and FLD do carry a real TrialStatus, so those get the full split.
 *
 * Every scalar total/count/kvksWithEntries below is DERIVED from the same
 * five groupBy queries the chart rows already need - it used to also run a
 * separate count()/count(status)/findMany(distinct) per metric (23 queries
 * total). Each Prisma call here is a real network round trip to Neon, so
 * cutting 23 down to 8 is a real latency win independent of anything about
 * function region - don't reintroduce the separate count queries.
 *
 * `?scope=oft|fld|training|extension` (used by the 4 dashboard analytics
 * detail pages, which each only ever read one of these) skips every query
 * the other sections would need - those pages were paying for all ~10
 * queries (main Dashboard's full payload) just to read one section's worth
 * of fields. No `scope` = unchanged full payload, still used by the main
 * Dashboard page itself.
 */
export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const scopeParam = url.searchParams.get("scope");
  const needs = (key: "oft" | "fld" | "training" | "extension") => !scopeParam || scopeParam === key;

  const isKvkAdmin = auth.session.role !== "SUPER_ADMIN";
  /**
   * A Host Organisation session (ORG_ADMIN) has no kvkId of its own - it's
   * scoped to every KVK mapped to its org instead. `kvkId` below widens from
   * "a single KVK id" to "a single id, or {in: [...]} for every KVK under a
   * Host Org" - every existing site that spreads `{kvkId}`/`kvkId ?? ...`
   * already accepts that shape (same convention as filterKvkIdFilter further
   * down), so a KVK Admin/User's single-id behaviour is unchanged.
   */
  const orgKvkIds =
    auth.session.role === "ORG_ADMIN" && auth.session.hostOrgId
      ? await getHostOrgKvkIds(auth.session.hostOrgId)
      : null;
  const kvkId: string | { in: string[] } | undefined = orgKvkIds
    ? { in: orgKvkIds }
    : isKvkAdmin
      ? auth.session.kvkId ?? undefined
      : undefined;

  /**
   * A KVK Admin's payload must not carry zone-wide lists - their dashboard
   * only ever shows their own KVK. `optionScope` narrows the "which years
   * exist" dropdown queries (and the KVK count) to their own KVK; the
   * State/District/Institute option lists are derived from their single
   * scoped KVK row further down instead of a zone query.
   */
  const optionScope = kvkId ? { kvkId } : { zoneId: auth.session.zoneId };

  /**
   * Super Admin's own Year/State/District/KVK filter dropdowns - real query
   * params now instead of the always-"All" placeholder they used to be. A
   * KVK Admin is already scoped to their own single KVK, so none of these
   * apply to them. A Host Organisation (ORG_ADMIN) DOES get to use these -
   * unlike KVK Admin/User it manages several KVKs, so narrowing by a
   * specific KVK/State/District/Institute among its own is genuinely
   * useful - `filterKvks`/`filterStates`/etc. below constrain every
   * resolved id to this org's own KVKs regardless of what name was
   * submitted, so a tampered param can only ever narrow within its
   * existing scope, never escape it. Dropdowns show names (not internal
   * ids), so each resolves the selected name back to an id via the real
   * State/District/Kvk tables - no guessed slugs.
   */
  const isRestrictedToOwnKvk = auth.session.role === "KVK_ADMIN" || auth.session.role === "KVK_USER";
  const yearParam = url.searchParams.get("year");
  /**
   * Year and KVK are comma-separated multi-selects (main Dashboard's real
   * checkbox dropdowns, 2026-08-28) - purely additive on top of the
   * existing single-value contract the 4 analytics detail pages already
   * depend on (a single value with no comma behaves exactly as before,
   * their own filter bar never sends more than one).
   */
  const yearValues = yearParam && yearParam !== "All" ? yearParam.split(",").map((v) => v.trim()).filter(Boolean) : [];
  const reportingYears = yearValues.map(Number).filter((n) => Number.isFinite(n));
  const reportingYearFilter: number | { in: number[] } | undefined =
    reportingYears.length === 0 ? undefined : reportingYears.length === 1 ? reportingYears[0] : { in: reportingYears };
  const kvkParam = !isRestrictedToOwnKvk ? url.searchParams.get("kvk") : null;
  const kvkValues = kvkParam && kvkParam !== "All" ? kvkParam.split(",").map((v) => v.trim()).filter(Boolean) : [];
  /** State/District/Institute are comma-separated multi-selects too (analytics-page real checkbox dropdowns, 2026-08-28) - same additive contract as Year/KVK above. */
  const stateParam = !isRestrictedToOwnKvk ? url.searchParams.get("state") : null;
  const stateValues = stateParam && stateParam !== "All" ? stateParam.split(",").map((v) => v.trim()).filter(Boolean) : [];
  const districtParam = !isRestrictedToOwnKvk ? url.searchParams.get("district") : null;
  const districtValues = districtParam && districtParam !== "All" ? districtParam.split(",").map((v) => v.trim()).filter(Boolean) : [];
  /** Real now (2026-08-27) - Kvk.instituteId was added (client request) after the real "Create KVK" reference form turned out to already have a required Institute field that was never wired to the backend. Existing KVKs seeded before that stay instituteless until edited. */
  const instituteParam = !isRestrictedToOwnKvk ? url.searchParams.get("institute") : null;
  const instituteValues = instituteParam && instituteParam !== "All" ? instituteParam.split(",").map((v) => v.trim()).filter(Boolean) : [];
  /** "Group By" on the analytics detail pages - re-buckets the same per-KVK counts by a different real dimension (Zone/State/District/Institute/KVK) instead of a new query per dimension. */
  const groupByParam = url.searchParams.get("groupBy");
  const groupBy: "zone" | "state" | "district" | "institute" | "kvk" =
    groupByParam === "zone" || groupByParam === "state" || groupByParam === "district" || groupByParam === "institute"
      ? groupByParam
      : "kvk";
  /** OFT/FLD "Breakdown" filter (real TrialStatus) - Training/Extension have no status column, so this only ever applies to those two scopes. "notStarted" isn't a real TrialStatus value (it's the absence of any record), so it's handled separately below rather than as a DB-level status filter. */
  const breakdownParam = url.searchParams.get("breakdown");
  const breakdown: "ongoing" | "completed" | "notStarted" | null =
    breakdownParam === "ongoing" || breakdownParam === "completed" || breakdownParam === "notStarted"
      ? breakdownParam
      : null;

  /**
   * A Host Organisation's own state/district/institute/KVK picks must
   * resolve only among its own mapped KVKs' rows - constraining State/
   * District/Institute by `kvks: { some: { hostOrgId } }` (rather than
   * trusting the submitted name alone) means a tampered param naming
   * another org's state/district/institute simply resolves to nothing,
   * same fail-closed convention as every other adversarial check this
   * feature adds.
   */
  const orgScope = orgKvkIds ? { hostOrgId: auth.session.hostOrgId! } : {};
  const [filterKvks, filterStates, filterDistricts, filterInstitutes] = await Promise.all([
    kvkValues.length > 0
      ? prisma.kvk.findMany({ where: { zoneId: auth.session.zoneId, name: { in: kvkValues }, ...orgScope }, select: { id: true } })
      : Promise.resolve([]),
    stateValues.length > 0
      ? prisma.state.findMany({ where: { zoneId: auth.session.zoneId, name: { in: stateValues }, ...(orgKvkIds ? { kvks: { some: orgScope } } : {}) }, select: { id: true } })
      : Promise.resolve([]),
    districtValues.length > 0
      ? prisma.district.findMany({ where: { zoneId: auth.session.zoneId, name: { in: districtValues }, ...(orgKvkIds ? { kvks: { some: orgScope } } : {}) }, select: { id: true } })
      : Promise.resolve([]),
    instituteValues.length > 0
      ? prisma.institute.findMany({ where: { zoneId: auth.session.zoneId, name: { in: instituteValues }, ...(orgKvkIds ? { kvks: { some: orgScope } } : {}) }, select: { id: true } })
      : Promise.resolve([]),
  ]);
  const filterKvkIds = filterKvks.map((k) => k.id);
  /** Single id (existing behaviour, unchanged) or a real `{in: [...]}` for a multi-selection. Same pattern applied to State/District/Institute below. */
  const filterKvkIdFilter: string | { in: string[] } | undefined =
    filterKvkIds.length === 0 ? undefined : filterKvkIds.length === 1 ? filterKvkIds[0] : { in: filterKvkIds };
  const filterStateIds = filterStates.map((s) => s.id);
  const filterStateIdFilter: string | { in: string[] } | undefined =
    filterStateIds.length === 0 ? undefined : filterStateIds.length === 1 ? filterStateIds[0] : { in: filterStateIds };
  const filterDistrictIds = filterDistricts.map((d) => d.id);
  const filterDistrictIdFilter: string | { in: string[] } | undefined =
    filterDistrictIds.length === 0 ? undefined : filterDistrictIds.length === 1 ? filterDistrictIds[0] : { in: filterDistrictIds };
  const filterInstituteIds = filterInstitutes.map((i) => i.id);
  const filterInstituteIdFilter: string | { in: string[] } | undefined =
    filterInstituteIds.length === 0 ? undefined : filterInstituteIds.length === 1 ? filterInstituteIds[0] : { in: filterInstituteIds };
  const hasLocationFilter =
    filterStateIdFilter !== undefined || filterDistrictIdFilter !== undefined || filterInstituteIdFilter !== undefined;

  /** Kvk-relation filter shared by every model below - flat `kvkId` when a KVK Admin or specific KVK(s) are picked (fastest, no join), otherwise a `kvk: {...}` relation filter once State/District/Institute narrows things, otherwise just the zone. */
  const kvkWhere: Record<string, unknown> =
    kvkId || filterKvkIdFilter !== undefined
      ? { kvkId: kvkId ?? filterKvkIdFilter }
      : hasLocationFilter
        ? {
            kvk: {
              zoneId: auth.session.zoneId,
              ...(filterStateIdFilter !== undefined ? { stateId: filterStateIdFilter } : {}),
              ...(filterDistrictIdFilter !== undefined ? { districtId: filterDistrictIdFilter } : {}),
              ...(filterInstituteIdFilter !== undefined ? { instituteId: filterInstituteIdFilter } : {}),
            },
          }
        : { zoneId: auth.session.zoneId };

  const baseScope = kvkWhere;
  const scope = reportingYearFilter !== undefined ? { ...baseScope, reportingYear: reportingYearFilter } : baseScope;

  /**
   * The OFT/FLD stat-card aggregates (Cost/Quantity/Farmers Covered/
   * Locations/Replications/Demonstrations) honour the "Breakdown" status
   * filter exactly the way the status chart already does: "Ongoing" keeps
   * ONGOING rows only, "Completed" keeps COMPLETED + TRANSFERRED (the same
   * "anything not ongoing" rule buildStatusRows/filterGroupsByBreakdown
   * use), and "Not Started" means those KVKs have no OFT/FLD row at all -
   * so every sum is 0 and the aggregate query is skipped entirely below.
   */
  const breakdownStatusWhere: Record<string, unknown> =
    breakdown === "ongoing"
      ? { status: "ONGOING" }
      : breakdown === "completed"
        ? { status: { not: "ONGOING" } }
        : {};
  const aggScope = { ...scope, ...breakdownStatusWhere };

  /**
   * Real per-card filters on the Dashboard's own Training Progress /
   * Extension Activities Progress charts (client request, 2026-08-30) -
   * `training-clientele` and Training's own real `onCampusOffCampus` field
   * (Venue) for Training; the real `extension-activity` master's
   * `natureOfExtensionActivity` for Extension. Comma-separated multi-selects,
   * same "empty = no filter" contract as year/kvk/state/district/institute
   * above. Deliberately narrower than `scope`: they only ever apply to the
   * one model each is named after, never touching OFT/FLD/Staff, and the
   * Extension filter only narrows the real `ExtensionActivity` rows - the
   * separate `OtherExtensionActivity` model has no `natureOfExtensionActivity`
   * sourced from the same master, so it's intentionally left unfiltered by
   * this control rather than guessing an equivalent.
   */
  const trainingClienteleValues = (url.searchParams.get("trainingClientele") ?? "")
    .split(",").map((v) => v.trim()).filter(Boolean);
  const trainingVenueValues = (url.searchParams.get("trainingVenue") ?? "")
    .split(",").map((v) => v.trim()).filter(Boolean);
  const extensionNatureValues = (url.searchParams.get("extensionNature") ?? "")
    .split(",").map((v) => v.trim()).filter(Boolean);
  const trainingScope = {
    ...scope,
    ...(trainingClienteleValues.length > 0 ? { clientele: { in: trainingClienteleValues } } : {}),
    ...(trainingVenueValues.length > 0 ? { onCampusOffCampus: { in: trainingVenueValues } } : {}),
  };
  const extensionScope = {
    ...scope,
    ...(extensionNatureValues.length > 0 ? { natureOfExtensionActivity: { in: extensionNatureValues } } : {}),
  };
  /** `kvks` (row-building, narrowed by every active filter including the selected KVK(s)) vs `kvkOptions` (the KVK dropdown's own option list - narrowed by State/District/Institute so picking Bihar only lists Bihar's KVKs, but never by the currently-selected KVK itself, otherwise picking one KVK would hide every other KVK from the dropdown). */
  const kvkListWhere = {
    ...(kvkId
      ? { id: kvkId }
      : filterKvkIdFilter !== undefined
        ? { id: filterKvkIdFilter }
        : { zoneId: auth.session.zoneId }),
    ...(filterStateIdFilter !== undefined ? { stateId: filterStateIdFilter } : {}),
    ...(filterDistrictIdFilter !== undefined ? { districtId: filterDistrictIdFilter } : {}),
    ...(filterInstituteIdFilter !== undefined ? { instituteId: filterInstituteIdFilter } : {}),
  };
  const kvkOptionsWhere = {
    ...(kvkId ? { id: kvkId } : { zoneId: auth.session.zoneId }),
    ...(filterStateIdFilter !== undefined ? { stateId: filterStateIdFilter } : {}),
    ...(filterDistrictIdFilter !== undefined ? { districtId: filterDistrictIdFilter } : {}),
    ...(filterInstituteIdFilter !== undefined ? { instituteId: filterInstituteIdFilter } : {}),
  };

  const [
    kvks,
    kvkOptions,
    totalKvks,
    oftByKvkStatus,
    fldByKvkStatus,
    trainingByKvk,
    extensionByKvk,
    otherExtensionByKvk,
    staffByRoleGroups,
    oftAgg,
    fldAgg,
    oftYears,
    fldYears,
    trainingYears,
    extensionYears,
    zone,
    states,
    districts,
    institutes,
  ] = await Promise.all([
    prisma.kvk.findMany({
      where: kvkListWhere,
      select: {
        id: true,
        name: true,
        zoneId: true,
        stateId: true,
        districtId: true,
        instituteId: true,
        zone: { select: { name: true } },
        state: { select: { name: true } },
        district: { select: { name: true } },
        institute: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    /** The KVK dropdown's own option list - every KVK in the zone (narrowed by State/District, never by the currently-selected KVK itself, otherwise picking a KVK would make every other KVK disappear from the dropdown). Also used by the `?scope=` analytics detail pages' own KVK filter, so this always runs regardless of scope. Carries each KVK's State/District/Institute so the analytics filter bar can auto-select the parents when a KVK is picked. */
    prisma.kvk.findMany({
      where: kvkOptionsWhere,
      select: {
        id: true,
        name: true,
        state: { select: { name: true } },
        district: { select: { name: true } },
        institute: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    // Reflects the active KVK / State / District / Institute filter (not year -
    // a KVK exists regardless of year), so the "KVK" stat card tracks the
    // dashboard's own scope instead of always showing the whole zone.
    scopeParam ? Promise.resolve(0) : prisma.kvk.count({ where: kvkListWhere }),
    needs("oft") ? prisma.oft.groupBy({ by: ["kvkId", "status"], where: scope, _count: { _all: true } }) : Promise.resolve([]),
    needs("fld") ? prisma.fld.groupBy({ by: ["kvkId", "status"], where: scope, _count: { _all: true } }) : Promise.resolve([]),
    needs("training") ? prisma.training.groupBy({ by: ["kvkId"], where: trainingScope, _count: { _all: true } }) : Promise.resolve([]),
    needs("extension") ? prisma.extensionActivity.groupBy({ by: ["kvkId"], where: extensionScope, _count: { _all: true } }) : Promise.resolve([]),
    needs("extension") ? prisma.otherExtensionActivity.groupBy({ by: ["kvkId"], where: scope, _count: { _all: true } }) : Promise.resolve([]),
    scopeParam
      ? Promise.resolve([])
      : prisma.staff.groupBy({
          by: ["sanctionedPost"],
          where: {
            dateOfRetirement: null,
            ...(kvkId || filterKvkIdFilter !== undefined
              ? { kvkId: kvkId ?? filterKvkIdFilter }
              : { zoneId: auth.session.zoneId }),
          },
          _count: { _all: true },
        }),
    /** Real per-OFT fields (not just the ongoing/completed status split) for the "OFT - detailed analytics" page's Cost/Quantity/Replications stat cards. Scoped by the Breakdown status filter too (see aggScope); "Not Started" has no rows, so the query is skipped and every sum falls back to 0. */
    needs("oft") && breakdown !== "notStarted"
      ? prisma.oft.aggregate({
          where: aggScope,
          _sum: {
            quantity: true,
            costOfOft: true,
            noOfLocation: true,
            noOfTrialReplicationFarmer: true,
            generalMale: true,
            generalFemale: true,
            obcMale: true,
            obcFemale: true,
            scMale: true,
            scFemale: true,
            stMale: true,
            stFemale: true,
          },
        })
      : Promise.resolve({
          _sum: {
            quantity: null,
            costOfOft: null,
            noOfLocation: null,
            noOfTrialReplicationFarmer: null,
            generalMale: null,
            generalFemale: null,
            obcMale: null,
            obcFemale: null,
            scMale: null,
            scFemale: null,
            stMale: null,
            stFemale: null,
          },
        }),
    /**
     * Real per-FLD fields for the "FLD - detailed analytics" page's
     * Demonstrations / Farmers Covered / Quantity cards. These live directly
     * on the Fld row (noOfDemonstration, quantity, and the same General/OBC/
     * SC/ST x M/F breakdown Oft carries) - the child FldDemonstrationDetail
     * model exists only for the Form Summary report's per-crop breakdown and
     * is not populated in the operational dataset, so aggregating it here
     * left all three cards reading zero. Mirrors the oftAgg block above,
     * Breakdown status scoping included.
     */
    needs("fld") && breakdown !== "notStarted"
      ? prisma.fld.aggregate({
          where: aggScope,
          _sum: {
            noOfDemonstration: true,
            quantity: true,
            generalMale: true,
            generalFemale: true,
            obcMale: true,
            obcFemale: true,
            scMale: true,
            scFemale: true,
            stMale: true,
            stFemale: true,
          },
        })
      : Promise.resolve({
          _sum: {
            noOfDemonstration: null,
            quantity: null,
            generalMale: null,
            generalFemale: null,
            obcMale: null,
            obcFemale: null,
            scMale: null,
            scFemale: null,
            stMale: null,
            stFemale: null,
          },
        }),
    /**
     * Real distinct reporting years for the Year filter dropdown - merged
     * across the 4 models that carry one, rather than guessing a static
     * range. Unscoped by year (the dropdown itself must list every year
     * regardless of what's currently selected), but scoped to the caller's
     * own KVK for a KVK Admin (`optionScope`) so their Year dropdown only
     * offers years their KVK actually has data in. This used to skip
     * entirely for `?scope=` requests (the 4 analytics detail pages) -
     * real bug, since those pages' own Year dropdown needs exactly this
     * and was showing only "All" as a result.
     */
    prisma.oft.findMany({ where: optionScope, select: { reportingYear: true }, distinct: ["reportingYear"] }),
    prisma.fld.findMany({ where: optionScope, select: { reportingYear: true }, distinct: ["reportingYear"] }),
    prisma.training.findMany({ where: optionScope, select: { reportingYear: true }, distinct: ["reportingYear"] }),
    prisma.extensionActivity.findMany({ where: optionScope, select: { reportingYear: true }, distinct: ["reportingYear"] }),
    /** Real Zone/State/District/Institute option lists for the analytics detail pages' filter bar - all scoped to the Super Admin's own zone (a session only ever belongs to one zone). A KVK Admin never sees these dropdowns, and their payload must not carry the whole zone's names, so the queries are skipped for that role and the response derives the single-KVK values from `kvks` instead. Institute filters/groups real KVK-derived data via `Kvk.instituteId` (see `filterInstituteIdFilter` above). */
    prisma.zone.findUnique({ where: { id: auth.session.zoneId }, select: { name: true } }),
    isKvkAdmin
      ? Promise.resolve([])
      : prisma.state.findMany({ where: { zoneId: auth.session.zoneId }, select: { name: true }, orderBy: { name: "asc" } }),
    isKvkAdmin
      ? Promise.resolve([])
      : prisma.district.findMany({ where: { zoneId: auth.session.zoneId }, select: { name: true }, orderBy: { name: "asc" } }),
    isKvkAdmin
      ? Promise.resolve([])
      : prisma.institute.findMany({ where: { zoneId: auth.session.zoneId }, select: { name: true }, orderBy: { name: "asc" } }),
  ]);

  /**
   * Only keep sane calendar years - nothing past the current one (no data
   * exists for a future year) and nothing before 2000 (a stray typo or an
   * epoch/empty-date artifact keyed as e.g. "2030" or "1970" must never
   * reach the Year dropdown) - client report, 2026-09-04.
   */
  const thisYear = new Date().getFullYear();
  const years = Array.from(
    new Set([...oftYears, ...fldYears, ...trainingYears, ...extensionYears].map((r) => r.reportingYear)),
  )
    .filter((y) => y >= 2000 && y <= thisYear)
    .sort((a, b) => b - a);

  const staffByRole = Object.fromEntries(
    staffByRoleGroups.map((g) => [g.sanctionedPost, g._count._all]),
  );
  const staffTotal = staffByRoleGroups.reduce((sum, g) => sum + g._count._all, 0);

  /** Breakdown="ongoing"/"completed" narrows the raw status groups before they're summarized or bucketed into rows - "notStarted" isn't a real TrialStatus value (it's the absence of any record), so it's applied after buildStatusRows instead, against the full KVK list. */
  function filterGroupsByBreakdown(groups: { kvkId: string; status: string; _count: { _all: number } }[]) {
    if (breakdown === "ongoing") return groups.filter((g) => g.status === "ONGOING");
    if (breakdown === "completed") return groups.filter((g) => g.status !== "ONGOING");
    return groups;
  }

  /** Ongoing/completed/total/kvksWithEntries, all read off one status-split groupBy result. "Not Started" can't be read off the groups at all (a KVK with zero entries never appears in a groupBy result) - it's the count of real KVKs in scope that have no entry here, checked against the full `kvks` list instead. */
  function statusSummary(groups: { kvkId: string; status: string; _count: { _all: number } }[]) {
    if (breakdown === "notStarted") {
      const withEntries = new Set(groups.map((g) => g.kvkId));
      const notStarted = kvks.filter((k) => !withEntries.has(k.id)).length;
      return { total: notStarted, ongoing: 0, completed: 0, kvksWithEntries: 0 };
    }
    let ongoing = 0;
    let completed = 0;
    const kvkSet = new Set<string>();
    for (const g of filterGroupsByBreakdown(groups)) {
      if (g.status === "ONGOING") ongoing += g._count._all;
      else completed += g._count._all;
      kvkSet.add(g.kvkId);
    }
    return { total: ongoing + completed, ongoing, completed, kvksWithEntries: kvkSet.size };
  }

  /** Real dimension key/label for a KVK under the current "Group By" - Zone/State/District/Institute bucket several KVKs into one row; the default keeps one row per KVK. A KVK without an Institute set (most existing ones, seeded before this link existed) buckets under "Not set" rather than being silently dropped from the chart. */
  function dimension(k: (typeof kvks)[number]) {
    if (groupBy === "zone") return { id: k.zoneId, label: k.zone.name };
    if (groupBy === "state") return { id: k.stateId, label: k.state.name };
    if (groupBy === "district") return { id: k.districtId, label: k.district.name };
    if (groupBy === "institute") return { id: k.instituteId ?? "none", label: k.institute?.name ?? "Not set" };
    return { id: k.id, label: k.name };
  }

  /**
   * One row per KVK in scope (even KVKs with zero entries), sorted
   * busiest-first for the Bar/List/Area chart views, then re-bucketed by
   * the current Group By dimension. TrialStatus has a real third value
   * (TRANSFERRED, folded into "completed" the same way statusSummary above
   * does) - this must accumulate (+=) rather than assign (=), since a KVK
   * can have both a COMPLETED and a TRANSFERRED group and an assignment
   * would silently drop whichever is processed first (a real bug found
   * live: a KVK with COMPLETED=2 and TRANSFERRED=3 was showing
   * "completed: 3", not the real 5).
   */
  function buildStatusRows(groups: { kvkId: string; status: string; _count: { _all: number } }[]) {
    const byKvk = new Map<string, { ongoing: number; completed: number }>();
    for (const g of filterGroupsByBreakdown(groups)) {
      const row = byKvk.get(g.kvkId) ?? { ongoing: 0, completed: 0 };
      if (g.status === "ONGOING") row.ongoing += g._count._all;
      else row.completed += g._count._all;
      byKvk.set(g.kvkId, row);
    }
    const byDimension = new Map<string, { id: string; label: string; ongoing: number; completed: number }>();
    for (const k of kvks) {
      const dim = dimension(k);
      const counts = byKvk.get(k.id) ?? { ongoing: 0, completed: 0 };
      const row = byDimension.get(dim.id) ?? { id: dim.id, label: dim.label, ongoing: 0, completed: 0 };
      row.ongoing += counts.ongoing;
      row.completed += counts.completed;
      byDimension.set(dim.id, row);
    }
    /** "Not Started" isn't a real TrialStatus, so it's not something filterGroupsByBreakdown can select at the group level - it means "this dimension bucket has zero real entries", checked here once every KVK's real ongoing/completed counts are already folded in. */
    const rows = Array.from(byDimension.values());
    const filtered = breakdown === "notStarted" ? rows.filter((r) => r.ongoing + r.completed === 0) : rows;
    return filtered.sort((a, b) => b.ongoing + b.completed - (a.ongoing + a.completed));
  }

  function toCountMap(groups: { kvkId: string; _count: { _all: number } }[]) {
    return new Map(groups.map((g) => [g.kvkId, g._count._all]));
  }

  function buildTotalRows(...maps: Map<string, number>[]) {
    const combined = new Map<string, number>();
    for (const m of maps) for (const [id, count] of m) combined.set(id, (combined.get(id) ?? 0) + count);
    const byDimension = new Map<string, { id: string; label: string; total: number }>();
    for (const k of kvks) {
      const dim = dimension(k);
      const row = byDimension.get(dim.id) ?? { id: dim.id, label: dim.label, total: 0 };
      row.total += combined.get(k.id) ?? 0;
      byDimension.set(dim.id, row);
    }
    return Array.from(byDimension.values()).sort((a, b) => b.total - a.total);
  }

  /** Total entries + distinct-KVK count read off a plain groupBy(["kvkId"]) result, optionally merged with a second one (Extension = extensionActivity + otherExtensionActivity combined). */
  function countSummary(...groupsList: { kvkId: string; _count: { _all: number } }[][]) {
    let total = 0;
    const kvkSet = new Set<string>();
    for (const groups of groupsList) {
      for (const g of groups) {
        total += g._count._all;
        kvkSet.add(g.kvkId);
      }
    }
    return { total, kvksWithEntries: kvkSet.size };
  }

  const oft = statusSummary(oftByKvkStatus);
  const fld = statusSummary(fldByKvkStatus);
  const training = countSummary(trainingByKvk);
  const extension = countSummary(extensionByKvk, otherExtensionByKvk);

  return NextResponse.json({
    totalKvks,
    years,
    kvkOptions: kvkOptions.map((k) => ({
      id: k.id,
      name: k.name,
      state: k.state?.name ?? null,
      district: k.district?.name ?? null,
      institute: k.institute?.name ?? null,
    })),
    zoneName: zone?.name ?? null,
    /** A KVK Admin gets only their own KVK's State/District/Institute (from the single scoped `kvks` row); Super Admin gets the whole zone's list. */
    stateOptions: isKvkAdmin
      ? Array.from(new Set(kvks.map((k) => k.state.name)))
      : states.map((s) => s.name),
    districtOptions: isKvkAdmin
      ? Array.from(new Set(kvks.map((k) => k.district.name)))
      : districts.map((d) => d.name),
    instituteOptions: isKvkAdmin
      ? Array.from(new Set(kvks.map((k) => k.institute?.name).filter((n): n is string => Boolean(n))))
      : institutes.map((i) => i.name),
    oft: {
      ...oft,
      quantity: Number(oftAgg._sum.quantity ?? 0),
      cost: Number(oftAgg._sum.costOfOft ?? 0),
      locations: oftAgg._sum.noOfLocation ?? 0,
      replications: oftAgg._sum.noOfTrialReplicationFarmer ?? 0,
      /** Real "Farmers Details" breakdown (General/OBC/SC/ST x M/F) summed - the field the "OFT - detailed analytics" page's Farmers Covered card was missing before those columns existed on Oft. */
      farmersCovered:
        (oftAgg._sum.generalMale ?? 0) +
        (oftAgg._sum.generalFemale ?? 0) +
        (oftAgg._sum.obcMale ?? 0) +
        (oftAgg._sum.obcFemale ?? 0) +
        (oftAgg._sum.scMale ?? 0) +
        (oftAgg._sum.scFemale ?? 0) +
        (oftAgg._sum.stMale ?? 0) +
        (oftAgg._sum.stFemale ?? 0),
    },
    fld: {
      ...fld,
      demonstrations: fldAgg._sum.noOfDemonstration ?? 0,
      quantity: Number(fldAgg._sum.quantity ?? 0),
      /** Same "Farmers Details" breakdown sum as OFT above - the field the FLD detail page's Farmers Covered card reads. */
      farmersCovered:
        (fldAgg._sum.generalMale ?? 0) +
        (fldAgg._sum.generalFemale ?? 0) +
        (fldAgg._sum.obcMale ?? 0) +
        (fldAgg._sum.obcFemale ?? 0) +
        (fldAgg._sum.scMale ?? 0) +
        (fldAgg._sum.scFemale ?? 0) +
        (fldAgg._sum.stMale ?? 0) +
        (fldAgg._sum.stFemale ?? 0),
    },
    training,
    extension,
    staff: { total: staffTotal },
    staffByRole,
    charts: {
      oft: buildStatusRows(oftByKvkStatus),
      fld: buildStatusRows(fldByKvkStatus),
      training: buildTotalRows(toCountMap(trainingByKvk)),
      extension: buildTotalRows(toCountMap(extensionByKvk), toCountMap(otherExtensionByKvk)),
    },
  });
}
