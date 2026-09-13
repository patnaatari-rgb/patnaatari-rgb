/**
 * Maps a Form Management leaf (its recordPath = URL slug segments joined by
 * "/") to the big "ATARI AMS REPORT" subsection it feeds. When such a leaf's
 * list page offers a report download, that download produces this
 * subsection's whole subtree - exactly what the Super Admin report shows for
 * that part (e.g. "2.2 On Farm Trial" with its 2.2.A / 2.2.B / 2.2.C tables)
 * - instead of a flat one-table export of just the list's own rows.
 *
 * `nums` are the subsection numbers in the two report trees (Super Admin and
 * the KVK-scoped variant share most numbering; a few section-5 subsections
 * differ, so more than one is listed). `titleIncludes` is an
 * order-independent title match used first, so a rename or a cross-tree
 * numbering drift still resolves. A subsection matches when its title
 * contains `titleIncludes` (case-insensitive) OR its number is in `nums`.
 */
export type ReportSubsectionRef = { nums: string[]; titleIncludes: string; label: string; tableIncludes?: string };

const G = (nums: string[], titleIncludes: string, label: string): ReportSubsectionRef => ({ nums, titleIncludes, label });
/** Like G, but the download is narrowed to just the one table in that subsection whose title contains `tableIncludes` (e.g. Employee Details -> only "All KVK Staff", not the whole "Employee Information" subsection). */
const GT = (nums: string[], titleIncludes: string, label: string, tableIncludes: string): ReportSubsectionRef => ({ nums, titleIncludes, label, tableIncludes });

export const REPORT_SUBSECTION_BY_LEAF: Record<string, ReportSubsectionRef> = {
  // 1. About KVK
  // Each narrows to its own table(s) inside subsection 1.1 - a download from
  // either leaf used to dump the whole "Basic Information" subsection (KVK
  // address + Host Org address + Bank Account together), so downloading from
  // View KVKs showed Bank Account Details bundled in (client report,
  // 2026-09-13). Same GT pattern as Employee Details / Land Details below.
  "about-kvk/basic/view-kvks": GT(["1.1"], "Basic Information", "Basic Information", "Name and address of"),
  "about-kvk/basic/bank-account-details": GT(["1.1"], "Basic Information", "Basic Information", "Bank Account Details"),
  "about-kvk/employee/employee-details": GT(["1.2"], "Employee Information", "Employee Information", "All KVK Staff"),
  "about-kvk/employee/staff-transferred": GT(["1.2"], "Employee Information", "Employee Information", "Staff Transferred"),
  // Each narrows to its own table inside subsection 1.3 - a download from
  // one of these leaves used to dump the entire "Land & Infrastructure"
  // subsection (Infrastructure + Land + Staff Quarters together), so e.g.
  // the Land Details download "showed another form instead" (client report,
  // 2026-09-04). Same GT pattern as Employee Details / Staff Transferred.
  "about-kvk/land-infrastructure/infrastructure-details": GT(["1.3"], "Infrastructure Information", "Land & Infrastructure Information", "Infrastructure Details"),
  "about-kvk/land-infrastructure/land-details": GT(["1.3"], "Infrastructure Information", "Land & Infrastructure Information", "Land Details"),
  "about-kvk/land-infrastructure/staff-quarters": GT(["1.3"], "Infrastructure Information", "Land & Infrastructure Information", "Staff Quarters"),
  "about-kvk/vehicles/view-vehicles": G(["1.4"], "Vehicles Information", "Vehicles Information"),
  "about-kvk/vehicles/vehicle-details": G(["1.4"], "Vehicles Information", "Vehicles Information"),
  "about-kvk/equipments/view-equipments": G(["1.5"], "Equipments Information", "Equipments Information"),
  "about-kvk/equipments/equipment-details": G(["1.5"], "Equipments Information", "Equipments Information"),

  // 2. Achievements
  "achievements/technical-achievement": G(["2.1"], "Technical Achievement", "Technical Achievement"),
  "achievements/oft": G(["2.2"], "On Farm Trial", "On Farm Trial"),
  "achievements/front-line-demonstration/view-fld": G(["2.3"], "Front Line Demonstration", "Front Line Demonstration"),
  "achievements/front-line-demonstration/fld-extension-training": G(["2.3"], "Front Line Demonstration", "Front Line Demonstration"),
  "achievements/front-line-demonstration/fld-technical-feedback": G(["2.3"], "Front Line Demonstration", "Front Line Demonstration"),
  "achievements/trainings": G(["2.4"], "Training", "Training"),
  "achievements/extension/extension-activities": G(["2.5"], "Extension", "Extension"),
  "achievements/extension/other-extension-activities": G(["2.5"], "Extension", "Extension"),
  "achievements/special-days/technology-week-celebration": G(["2.6"], "Special Days", "Special Days"),
  "achievements/special-days/celebration-days": G(["2.6"], "Special Days", "Special Days"),
  "achievements/special-days/world-soil-day": G(["2.6"], "Special Days", "Special Days"),
  "achievements/special-days/poshan-maaha": G(["2.6"], "Special Days", "Special Days"),
  "achievements/swachhta-bharat-abhiyaan/sewa": G(["2.7"], "Swacha", "Swacha Bharat Abhiyan"),
  "achievements/swachhta-bharat-abhiyaan/pakhwada": G(["2.7"], "Swacha", "Swacha Bharat Abhiyan"),
  "achievements/swachhta-bharat-abhiyaan/budget-expenditure": G(["2.7"], "Swacha", "Swacha Bharat Abhiyan"),
  "achievements/production-supply": G(["2.8"], "Production", "Production & Supply"),
  "achievements/soil-water/soil-water-testing": G(["2.9"], "Soil and Water Testing", "Soil and Water Testing"),
  "achievements/publications": G(["2.10"], "Publications", "Publications"),
  "achievements/hrd": G(["2.11"], "Human Resources Development", "Human Resources Development"),
  "achievements/awards/kvk": G(["2.12"], "Award and Recognition", "Award and Recognition"),
  "achievements/awards/scientist": G(["2.12"], "Award and Recognition", "Award and Recognition"),
  "achievements/awards/farmer": G(["2.12"], "Award and Recognition", "Award and Recognition"),

  // 3. Projects
  "projects/cfld/technical-parameter": G(["3.1"], "CFLD", "CFLD"),
  "projects/cfld/extension-activity-cfld": G(["3.1"], "CFLD", "CFLD"),
  "projects/cfld/budget-utilization": G(["3.1"], "CFLD", "CFLD"),
  "projects/cfld/crop-wise-images": G(["3.1"], "CFLD", "CFLD"),
  "projects/nicra/basic-information": G(["3.2"], "NICRA", "NICRA"),
  "projects/nicra/details": G(["3.2"], "NICRA", "NICRA"),
  "projects/nicra/training": G(["3.2"], "NICRA", "NICRA"),
  "projects/nicra/extension-activity-nicra": G(["3.2"], "NICRA", "NICRA"),
  "projects/nicra/others/intervention": G(["3.3"], "NICRA Others", "NICRA Others"),
  "projects/nicra/others/revenue-generated": G(["3.3"], "NICRA Others", "NICRA Others"),
  "projects/nicra/others/custom-hiring-farm-implement": G(["3.3"], "NICRA Others", "NICRA Others"),
  "projects/nicra/others/village-wise-vcrmc": G(["3.3"], "NICRA Others", "NICRA Others"),
  "projects/nicra/others/soil-health-card": G(["3.3"], "NICRA Others", "NICRA Others"),
  "projects/nicra/others/convergence-programme": G(["3.3"], "NICRA Others", "NICRA Others"),
  "projects/nicra/others/dignitaries-visited-nicra-villages": G(["3.3"], "NICRA Others", "NICRA Others"),
  "projects/nicra/others/pi-co-pi-list": G(["3.3"], "NICRA Others", "NICRA Others"),
  "projects/arya-safal/arya-safal-current-year": G(["3.4"], "ARYA", "ARYA / SARAL"),
  "projects/arya-safal/arya-safal-previous-year": G(["3.4"], "ARYA", "ARYA / SARAL"),
  "projects/natural-farming/nf-geographical": G(["3.5"], "Natural Farming", "Natural Farming"),
  "projects/natural-farming/nf-physical": G(["3.5"], "Natural Farming", "Natural Farming"),
  "projects/natural-farming/nf-demonstration": G(["3.5"], "Natural Farming", "Natural Farming"),
  "projects/natural-farming/nf-already-practicing": G(["3.5"], "Natural Farming", "Natural Farming"),
  "projects/natural-farming/nf-beneficiaries": G(["3.5"], "Natural Farming", "Natural Farming"),
  "projects/natural-farming/nf-soil-data": G(["3.5"], "Natural Farming", "Natural Farming"),
  "projects/natural-farming/nf-budget-expenditure": G(["3.5"], "Natural Farming", "Natural Farming"),
  "projects/tsp-scsp/view-sub-plan-activity": G(["3.6"], "TSP/SCSP", "TSP/SCSP"),
  "projects/nari/nari-nutrition-garden": G(["3.7"], "NARI", "NARI"),
  "projects/nari/nari-bio-fortified": G(["3.7"], "NARI", "NARI"),
  "projects/nari/nari-value-addition": G(["3.7"], "NARI", "NARI"),
  "projects/nari/nari-training": G(["3.7"], "NARI", "NARI"),
  "projects/nari/nari-extension": G(["3.7"], "NARI", "NARI"),
  "projects/agri-drone/agri-drone-introduction": G(["3.8"], "Agri-Drone", "Agri-Drone"),
  "projects/agri-drone/agri-drone-demonstration": G(["3.8"], "Agri-Drone", "Agri-Drone"),
  "projects/fpo-cbbo/fpo-cbbo-details": G(["3.9"], "FPO and CBBO", "FPO and CBBO"),
  "projects/fpo-cbbo/fpo-management": G(["3.9"], "FPO and CBBO", "FPO and CBBO"),
  "projects/drmr/drmr-details": G(["3.10"], "DRMR", "DRMR"),
  "projects/drmr/drmr-activity": G(["3.10"], "DRMR", "DRMR"),
  "projects/cra/cra-details": G(["3.11"], "Climate Resilient Agriculture", "Climate Resilient Agriculture (CRA)"),
  "projects/cra/cra-extension-activity": G(["3.11"], "Climate Resilient Agriculture", "Climate Resilient Agriculture (CRA)"),
  "projects/csisa/csisa-details": G(["3.12"], "CSISA", "CSISA"),
  "projects/seed-hub/seed-hub-program": G(["3.13"], "Seed Hub Program", "Seed Hub Program"),
  "projects/other-programmes/other-programme": G(["3.14"], "Other Programmes", "Other Programmes"),

  // 4. Performance
  "performance/impact/impact-of-kvk-activities": G(["4.1"], "Impact", "Impact"),
  "performance/impact/entrepreneurship-details": G(["4.1"], "Impact", "Impact"),
  "performance/impact/success-stories": G(["4.1"], "Impact", "Impact"),
  "performance/district-village-performance/district-level-data": G(["4.2"], "District and Village Performance", "District and Village Performance"),
  "performance/district-village-performance/district-crop-productivity": G(["4.2"], "District and Village Performance", "District and Village Performance"),
  "performance/district-village-performance/district-livestock-production": G(["4.2"], "District and Village Performance", "District and Village Performance"),
  "performance/district-village-performance/operational-area-details": G(["4.2"], "District and Village Performance", "District and Village Performance"),
  "performance/district-village-performance/village-adoption-programme": G(["4.2"], "District and Village Performance", "District and Village Performance"),
  "performance/district-village-performance/priority-thrust-area": G(["4.2"], "District and Village Performance", "District and Village Performance"),
  "performance/infrastructure-performance/demonstration-units": G(["4.3"], "Infrastructure Performance", "Infrastructure Performance"),
  "performance/infrastructure-performance/instructional-farm-crops": G(["4.3"], "Infrastructure Performance", "Infrastructure Performance"),
  "performance/infrastructure-performance/production-units": G(["4.3"], "Infrastructure Performance", "Infrastructure Performance"),
  "performance/infrastructure-performance/instructional-farm-livestock": G(["4.3"], "Infrastructure Performance", "Infrastructure Performance"),
  "performance/infrastructure-performance/hostel-utilization": G(["4.3"], "Infrastructure Performance", "Infrastructure Performance"),
  "performance/infrastructure-performance/rain-water-harvesting": G(["4.3"], "Infrastructure Performance", "Infrastructure Performance"),
  "performance/infrastructure-performance/staff-quarters-performance": G(["4.3"], "Infrastructure Performance", "Infrastructure Performance"),
  "performance/financial-performance/budget-details": G(["4.4"], "Financial Performance", "Financial Performance"),
  "performance/financial-performance/project-wise-budget-performance": G(["4.4"], "Financial Performance", "Financial Performance"),
  "performance/financial-performance/revolving-fund": G(["4.4"], "Financial Performance", "Financial Performance"),
  "performance/financial-performance/revenue-generation": G(["4.4"], "Financial Performance", "Financial Performance"),
  "performance/financial-performance/resource-generation": G(["4.4"], "Financial Performance", "Financial Performance"),
  "performance/linkages/functional-linkage": G(["4.5"], "Linkages", "Linkages"),
  "performance/linkages/special-programmes": G(["4.5"], "Linkages", "Linkages"),

  // 5. Miscellaneous  (Super Admin and KVK trees number these differently - the
  // title match is tried first, so numbers are only a Super-Admin fallback)
  "miscellaneous/prevalent-diseases-crops": G([], "Prevalent Diseases", "Prevalent Diseases"),
  "miscellaneous/prevalent-diseases-livestock": G([], "Prevalent Diseases", "Prevalent Diseases"),
  "miscellaneous/ppv-fra-sensitization/ppv-fra-training-programme": G([], "PPV & FRA Sensitization", "PPV & FRA Sensitization"),
  "miscellaneous/ppv-fra-sensitization/ppv-fra-farmer-details": G([], "PPV & FRA Sensitization", "PPV & FRA Sensitization"),
  "miscellaneous/rawe-fet-fit-programme": G(["5.3"], "RAWE", "RAWE/FET & VIP Visitors"),
  "miscellaneous/vip-visitors": G(["5.3"], "VIP Visitors", "RAWE/FET & VIP Visitors"),
  "miscellaneous/digital-information/digital-mobile-app": G(["5.3"], "Digital Information", "Digital Information"),
  "miscellaneous/digital-information/digital-web-portal": G(["5.3"], "Digital Information", "Digital Information"),
  "miscellaneous/digital-information/digital-kisan-sarathi": G(["5.3"], "Digital Information", "Digital Information"),
  "miscellaneous/digital-information/digital-kmas": G(["5.3"], "Digital Information", "Digital Information"),
  "miscellaneous/digital-information/digital-other-channels": G(["5.3"], "Digital Information", "Digital Information"),

  // 6. Meetings
  "meetings/sac-meetings": G(["6.1"], "SAC Meetings", "SAC Meetings"),
  "meetings/other-meetings": G(["6.2"], "Other Meetings", "Other Meetings"),
};

export function reportSubsectionForLeaf(recordPath: string | undefined): ReportSubsectionRef | undefined {
  return recordPath ? REPORT_SUBSECTION_BY_LEAF[recordPath] : undefined;
}

type SubLike = { num: string; title: string; tables?: { code: string; title: string; model?: string }[] };
type SecLike<S extends SubLike> = { subsections: S[] };

/** True when a built subsection is (probably) the one `ref` points at - title match, else number match. Used to attach a leaf's Module Images to the right subsection. */
export function subsectionMatchesRef(ref: ReportSubsectionRef, sub: SubLike): boolean {
  if (ref.titleIncludes && sub.title.toLowerCase().includes(ref.titleIncludes.toLowerCase())) return true;
  return ref.nums.includes(sub.num);
}

/**
 * Prunes a built report tree to just the subsection(s) `ref` points at. The
 * title match is tried across the whole tree first; only if nothing matches
 * by title does it fall back to the subsection numbers (which drift between
 * the Super Admin and KVK trees for section 5). Returns the sections that
 * still have at least one subsection - empty when the leaf's subsection does
 * not exist in this scope's tree (caller then does its own flat export).
 */
export function pruneToSubsection<S extends SubLike, T extends SecLike<S>>(
  sections: T[],
  ref: ReportSubsectionRef,
  /**
   * The Prisma model of the leaf that asked for this download. When given
   * (and the ref doesn't already name an explicit table), every table in
   * the matched subsection that isn't built from this model is dropped -
   * so a per-form report download from any leaf that shares a subsection
   * with other forms produces only its own table(s), not the whole
   * subsection (client report, 2026-09-07: "particular form ka report
   * download properly nahi ho raha").
   */
  leafModel?: string,
): T[] {
  const byTitle = (sub: SubLike) =>
    !!ref.titleIncludes && sub.title.toLowerCase().includes(ref.titleIncludes.toLowerCase());
  const byNum = (sub: SubLike) => ref.nums.includes(sub.num);
  // Keep only the caller's own table(s) inside the matched subsection:
  // an explicit `tableIncludes` wins (hand-tuned, most precise); otherwise
  // fall back to matching the leaf's own model. Either narrowing is
  // skipped gracefully if it would empty the subsection.
  const narrow = (sub: SubLike): SubLike => {
    if (!sub.tables) return sub;
    if (ref.tableIncludes) {
      const wanted = ref.tableIncludes.toLowerCase();
      const tables = sub.tables.filter(
        (t) => t.title.toLowerCase().includes(wanted) || t.code.toLowerCase() === wanted,
      );
      return tables.length > 0 ? { ...sub, tables } : sub;
    }
    if (leafModel) {
      const tables = sub.tables.filter((t) => t.model === leafModel);
      return tables.length > 0 ? { ...sub, tables } : sub;
    }
    return sub;
  };
  const keep = (predicate: (sub: SubLike) => boolean) =>
    sections
      .map((sec) => ({ ...sec, subsections: sec.subsections.filter(predicate).map(narrow) }))
      .filter((sec) => sec.subsections.length > 0);
  const titled = keep(byTitle);
  return titled.length > 0 ? titled : keep(byNum);
}

/**
 * Multi-leaf version of pruneToSubsection: given several Form Management
 * leaf paths (the "Select Form" checklist on the Reports screen), keep only
 * the subsections those leaves feed, each narrowed to just its own
 * table(s). A subsection wanted by more than one leaf keeps the union of
 * their tables. Leaves with no report subsection are ignored. Returns the
 * original sections unchanged when `paths` is empty.
 */
export function pruneToLeafPaths<S extends SubLike, T extends SecLike<S>>(
  sections: T[],
  paths: string[],
  refFor: (path: string) => ReportSubsectionRef | undefined,
  modelFor: (path: string) => string | undefined,
): T[] {
  if (paths.length === 0) return sections;

  // Which tables (by code) to keep inside each subsection, indexed by the
  // normalised subsection title (matches across the Super-Admin / KVK trees).
  const wantByTitle = new Map<string, Set<string>>();
  const wantWholeByTitle = new Set<string>();
  const titleKeys: { titleIncludes: string; nums: string[] }[] = [];

  for (const path of paths) {
    const ref = refFor(path);
    if (!ref) continue;
    titleKeys.push({ titleIncludes: ref.titleIncludes, nums: ref.nums });
    const model = modelFor(path);
    for (const sec of sections) {
      for (const sub of sec.subsections) {
        const matchesTitle =
          !!ref.titleIncludes &&
          sub.title.toLowerCase().includes(ref.titleIncludes.toLowerCase());
        const matchesNum = ref.nums.includes(sub.num);
        if (!matchesTitle && !matchesNum) continue;
        const tkey = sub.title.toLowerCase();
        if (!sub.tables) continue;
        const picked = ref.tableIncludes
          ? sub.tables.filter(
              (t) =>
                t.title.toLowerCase().includes(ref.tableIncludes!.toLowerCase()) ||
                t.code.toLowerCase() === ref.tableIncludes!.toLowerCase(),
            )
          : model
            ? sub.tables.filter((t) => t.model === model)
            : [];
        if (picked.length === 0) {
          wantWholeByTitle.add(tkey);
        } else {
          const set = wantByTitle.get(tkey) ?? new Set<string>();
          picked.forEach((t) => set.add(t.code));
          wantByTitle.set(tkey, set);
        }
      }
    }
  }

  const wantSub = (sub: SubLike) => {
    const tkey = sub.title.toLowerCase();
    if (wantWholeByTitle.has(tkey) || wantByTitle.has(tkey)) return true;
    return titleKeys.some(
      (k) =>
        (!!k.titleIncludes && sub.title.toLowerCase().includes(k.titleIncludes.toLowerCase())) ||
        k.nums.includes(sub.num),
    );
  };

  return sections
    .map((sec) => ({
      ...sec,
      subsections: sec.subsections.filter(wantSub).map((sub) => {
        const tkey = sub.title.toLowerCase();
        if (wantWholeByTitle.has(tkey) || !wantByTitle.has(tkey) || !sub.tables) return sub;
        const codes = wantByTitle.get(tkey)!;
        const tables = sub.tables.filter((t) => codes.has(t.code));
        return tables.length > 0 ? { ...sub, tables } : sub;
      }),
    }))
    .filter((sec) => sec.subsections.length > 0) as T[];
}
