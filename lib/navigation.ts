/**
 * Single source of truth for the Super Admin sidebar.
 *
 * The sidebar component renders this tree directly, and the dynamic
 * `/masters/[...slug]` and `/forms/[...slug]` routes resolve pages from
 * the same `href` values, so every link in the sidebar always points at a
 * real, working page - there are no dead links.
 *
 * Columns for each list page are filled in from what was actually visible
 * in the reference where possible. Leaves without a
 * confirmed real column list fall back to the generic single "Name" column
 * until the reference show the real field list.
 */

import { INSTITUTE_MASTER_ROWS } from "./masters";
import { MONTH_NAMES } from "./months";

export type MasterColumn = {
  key: string;
  label: string;
  /** Overrides `label` on the Add/Edit form field only, for confirmed real cases where the form's field text is more specific than its own table's column header (e.g. table "Name" vs form "Training Clientele Name"). Table header keeps using `label`. */
  formLabel?: string;
  /** Overrides this field's position on the Add/Edit form only (lower sorts first; fields without one keep their relative array order, sorted after every numbered field) - the list table always uses raw array order regardless. Needed because a leaf's one `columns` array drives both the list's real column order and the form's real field order, and a real leaf's two real sequences don't always match (audit finding, 2026-09-02 client handover screenshots) - reordering the array itself to fix the form would have silently reordered the already-confirmed-real list columns too. */
  formOrder?: number;
  /** Renders this field and the very next one (after form-order sorting) side by side inside one shared grid cell, instead of each taking its own full cell - for a real, confirmed case where two short related fields (e.g. Unit + Quantity) sit paired together next to a third, unrelated full-width field on the same row, rather than each pairing with its neighbor the normal way. */
  pairWithNext?: boolean;
  /** Server-computed display column (e.g. a child-row count) - shown in the list table, but never rendered as an input on the Add/Edit form since there's nothing for a user to type into it. */
  readonly?: boolean;
  /** Renders a real file-upload control instead of a text input, and a thumbnail/"View" link instead of raw text in the list table. The stored value is the uploaded file's Vercel Blob URL. */
  fileKind?: "image" | "document";
  /** Which /api/upload validation rule (size/mime-type) and storage folder applies - required whenever fileKind is set. Mirrors lib/blob.ts's UploadKind (kept as a separate literal type, not imported, since that file is server-only and this one is loaded client-side too). */
  uploadKind?: "staff-photo" | "staff-resume" | "cfld-crop-image" | "farmer-award-photo" | "success-story-image" | "rawe-attachment" | "ppv-fra-farmer-image" | "sac-meeting-file";
  /**
   * Renders as a <select> populated by another All Masters leaf's real
   * saved rows (fetched from /api/master-options) instead of free text a
   * user could mistype - the backend already validates these parent
   * references by exact name match (see masters-registry.ts), so this
   * closes the gap between "typo silently rejected on submit" and
   * "typo never possible". `master` is the source leaf's slug, `optionKey`
   * is which field on its list() rows supplies the option text. When
   * `dependsOnKey`/`filterKey` are both set, the option list is narrowed to
   * rows whose `filterKey` matches this form's current value for
   * `dependsOnKey` (a second-level parent picker, e.g. Sub-category's
   * "Category" options narrowed to the already-selected Sector).
   */
  sourceMaster?: {
    master: string;
    optionKey: string;
    dependsOnKey?: string;
    filterKey?: string;
    /**
     * When set, picking a value in this dropdown fetches
     * `${carryForwardFrom}?value=<picked>` and merges the returned
     * `{ fields: { formKey: value } }` into the form - used by Vehicle /
     * Equipment Details to carry forward the previous year's status.
     */
    carryForwardFrom?: string;
  };
  /**
   * Renders as a real checkbox instead of a text input ("checkbox", stored
   * as "true"/"false") - or, for "demographic-breakdown", the shared
   * General/OBC/SC/ST x Male/Female table (DemographicBreakdown) instead of
   * a single input. A demographic-breakdown column is display-only in the
   * list table (never a real column there - `readonly` would be for a
   * single value, not a whole block) and spans both grid columns on the
   * Add/Edit form.
   */
  /** "date" renders a real native date-picker input (`<input type="date">`) instead of a plain text box - audit finding, 2026-09-02: every date-valued field across the generic Achievement forms (Extension Activities' Start/End Date, Celebration Days' Event Date, World Soil Day's Reporting Year, Poshan Maaha's Datewise activity, Production & Supply's Reporting Date, Soil/Water/Plant Analysis' Start/End Date, Publications' Year, Awards' Reporting Date, HRD's Start/End Date, Swachhta Sewa/Pakhwada's Date/Duration of Observation, Budget Expenditure's Reporting Year, Technology Week Celebration's Start/End Date) is confirmed live as a real date picker in the reference, but the generic form's default branch had no date-type rendering at all - every one silently fell back to a plain text input. */
  /** "photos" renders FormPhotosField (the real end-of-form Upload Photograph(s)+Caption section, client PDF "Module Image workflow", 2026-09-02) - feeds Module Images automatically on save, no separate upload flow. */
  /** "nf-parameters" renders NfParametersField - the fixed "Without / With NF Practice" comparison grid (NF_COMPARISON_PARAMETERS), stored as one JSON string on the record's `parameters` column. Used by Natural Farming's Demonstration Information (3.5.C) and Farmers Practicing (3.5.D). */
  /** "calculated" renders a disabled, muted input showing the field's current (server-computed) value - unlike a plain `readonly` column (which is dropped from the form entirely), the real reference still *shows* some computed totals, just not editable (e.g. Poshan Maaha's own "Total Participants", confirmed live 2026-09-03: "Auto-calculated: sum of all participant categories" reads directly under a real, visible, disabled field). Pair with `helperText` for that caption. Always set `readonly: true` alongside it too, so required-field validation still skips it. */
  /** "section-heading" renders just a bold heading line (no input) spanning the full row - for a real section break the reference shows (e.g. Poshan Maaha's own "No. of participants" above its Girls/Farm Woman/... fields) that doesn't correspond to any real demographic-breakdown block or other grouped field kind. `label` is the heading text. */
  /** "month-quarter-grid" renders MonthQuarterGridField - the real Jan-Dec x Quarter 1-6 Yes/No completion matrix (72 cells) confirmed live on Staff Quarters' own Create form (atariams.org/infra-performance/staff-quaters/create, 2026-09-04), stored as one JSON-string value on this column's key (parsed into a Prisma `Json?` column by the leaf's registry entry). */
  fieldKind?: "checkbox" | "demographic-breakdown" | "date" | "photos" | "nf-parameters" | "calculated" | "section-heading" | "month-quarter-grid";
  /** "calculated" only - the explanatory caption shown under the disabled field (e.g. "Auto-calculated: sum of all participant categories"). */
  helperText?: string;
  /**
   * "calculated" only - the other columns' keys this one sums live, in the
   * form itself, as the user types (not just after save). Real bug, client
   * report 2026-09-13: the field only ever showed whatever value the record
   * already had server-side - blank the entire time on a new Add form, only
   * populated after a save+reload - because MasterFormFields displayed the
   * raw stored value with no client-side computation at all. The server
   * still recomputes this column independently from the same source fields
   * on every save (leaf-record-registry.ts), so this is purely a live
   * preview - never the value actually submitted.
   */
  sumOf?: string[];
  /**
   * "calculated" only - live preview of this field as (sum of the first
   * list's keys) minus (sum of the second list's), the other real shape
   * besides `sumOf` - Budget Utilization's own per-item Balance = Received -
   * Utilization (single-key lists) and Overall Balance = (sum of all 4
   * items' Received) - (sum of all 4 items' Utilization) (client direction,
   * 2026-09-15). Same purely-a-preview caveat as `sumOf`: the server
   * independently recomputes this column from the same source fields on
   * every save (leaf-record-registry.ts), never trusting whatever this
   * preview showed.
   */
  diffOf?: [string[], string[]];
  /**
   * "calculated" only - live preview of this field as (first key) divided by
   * (second key), for a real ratio field (CSISA's own BCR = Gross Return ÷
   * Cost of Cultivation, client direction, 2026-09-15 - was a manual entry
   * despite both source figures already being real fields on the same
   * form). Blank while the denominator is 0/empty, same "don't show a
   * spurious value" rule as `sumOf`/`diffOf`. Same purely-a-preview caveat:
   * the server independently recomputes this from the same two fields on
   * every save (leaf-record-registry.ts).
   */
  ratioOf?: [string, string];
  /**
   * `key: "reportingYear"` with `staticOptions` only - the Prisma model this
   * specific Reporting Year field's real years should come from (matching
   * MODEL_PERIOD_YEAR_FIELD/MODEL_PERIOD_DATE_FIELDS' own keys in
   * lib/report-data.ts), passed as `/api/reports/years?model=...`. Client
   * direction, 2026-09-13: every one of these fields used to share one
   * unscoped "years from every model in the whole app" result - Vehicle
   * Details' own Reporting Year could offer a year Vehicle Details itself
   * never had, just because some unrelated leaf did. Required for a correct
   * per-leaf list; omitting it silently falls back to that old broad union.
   */
  yearsModel?: string;
  /** demographic-breakdown only - prepended to DemographicBreakdown's own key convention (e.g. "farmers" -> "farmersGeneralMale") so one form can hold two independent blocks (Farmers + Extension Officials). Omit for a single block. */
  demographicPrefix?: string;
  /** demographic-breakdown only - "grid" renders the flat General/OBC/SC/ST x M/F input grid + total badges (DemographicGrid, confirmed live for Training and FLD's own Farmers Details, 2026-09-02) instead of the default General/OBC/SC/ST table (DemographicBreakdown, confirmed for CFLD/OFT/Technology Week/World Soil Day). Omit for the table. */
  demographicVariant?: "table" | "grid";
  /** demographic-breakdown only - remaps individual DEMOGRAPHIC_KEYS suffixes to a different real field/DB column name instead of the default bare (or prefixed) suffix - for the NARI models, whose real General-pair columns are named `male`/`female`, not `generalMale`/`generalFemale` (kvk-report 3.7's own column header groups them as "General" same as OBC/SC/ST, but the schema predates this shared grid and can't be renamed without touching 5 live models). Omit for the default key. */
  demographicKeyOverrides?: Partial<Record<"generalMale" | "generalFemale" | "obcMale" | "obcFemale" | "scMale" | "scFemale" | "stMale" | "stFemale", string>>;
  /** True for a column that only makes sense on the Add/Edit form (currently just demographic-breakdown, which represents 8 real DB columns, not one) - excluded from the list table's header/rows entirely, the opposite of `readonly` (which excludes a column from the form, not the table). */
  formOnly?: boolean;
  /** Renders as a <select> from a fixed, known-real option list (not another master's saved rows, not free text) - e.g. Institute Name's real 4-option set. */
  staticOptions?: string[];
  /**
   * Field is only rendered (and only required-checked) when another field's
   * current value matches - e.g. Vehicle/Equipment "Repairing Cost" shows
   * only when "Present Status" is "Repairing".
   */
  showWhen?: { key: string; equals: string | string[] };
  /** Shows a red "*" next to the label on the Add/Edit form and blocks submit until filled - only set where confirmed against a real reference screenshot (client report, 2026-08-31); left unset elsewhere rather than guessed. */
  required?: boolean;
  /** Overrides the input's auto-generated "Enter {label}" placeholder with a real example hint from the reference (e.g. "e.g. 15600-39100") - only set where confirmed against a real reference screenshot, 2026-08-31. */
  placeholder?: string;
  /** Pre-selects this value on the Create form instead of the disabled "Select {label}" placeholder - only set where a real reference screenshot showed a value already chosen on a blank Create form (e.g. Vehicle/Equipment Present Status's Hide in Next Year defaulting to "No", Is Active to "Yes"), 2026-08-31. */
  defaultValue?: string;
  /** `false` forces the Add/Edit field to stay a plain text input even though `lib/numeric-field.ts`'s label heuristic would otherwise render it `type="number"` - for a real, confirmed case where the label reads as numeric ("Horizontal Spread (in area/no.)") but the reference itself accepts mixed text (e.g. "5 villages", not just a bare number), matching this column's own DB type (`String?`, not `Int?`/`Decimal?`). Live audit finding, 2026-09-03: typing "5 villages" into the auto-detected number input silently mangled it to "5e" (the browser's native number input only lets non-digit characters through if they're valid scientific-notation syntax). `true` is the opposite override, for a field whose DB column is numeric (`Int`/`Decimal`) but whose label the heuristic can't read as numeric (a domain word it excludes such as "Programme"/"Phone", or no numeric word at all such as "Closing") - without it the field is a plain text box and a stray letter is silently stored as 0. Leave unset everywhere else - the heuristic is right far more often than not. */
  numeric?: boolean;
};

export type NavLeaf = {
  type: "leaf";
  slug: string;
  label: string;
  /** Columns for the list page this leaf renders, in display order. */
  columns: MasterColumn[];
  /** Overrides `label` on the landing-page card only, for the confirmed real cases where a bare leaf's card title differs from its own page title (e.g. card "Technical Achievement" vs page "Technical Achievement Summary"). */
  cardLabel?: string;
  /** Overrides the inner clickable link text of a single-item landing card, while the card's own bold heading still shows `cardLabel` above it - the one confirmed real case where those two need to differ (Achievements' "Technical Achievement" heading with a "Technical Achievement Summary" link beneath it, matching that leaf's own page title). Leave unset everywhere else so the inner link keeps matching the heading. */
  cardLinkLabel?: string;
  /** Overrides `label` on the leaf's own detail page (H1 + breadcrumb) only - mirrors NavGroup.pageTitle, for the confirmed real case where the landing-card link text differs from the page's own title (card link "OFT" vs page "On Farm Trials (OFT)", confirmed live 2026-08-15 reference screenshot). */
  pageTitle?: string;
  /** Overrides `label` on this leaf's own sibling-tab pill only (the row of tabs shown when several leaves share one parent group) - for the rare real case where the full label is too long to fit that pill bar on one line everywhere else in the app renders on (client direction, 2026-09-02: cut it down rather than let it wrap to a second line). Breadcrumb/page title keep using the full real `label`. */
  tabLabel?: string;
  /**
   * Whether the Add/Create form shows the "Mark as 'Other' option" checkbox.
   * The real reference shows this on almost every simple master's create
   * form regardless of field count, with only a few confirmed exceptions
   * (Events Master, Publication Items, Natural Farming Activity) - so it
   * isn't reliably inferable from column shape. Leave unset for leaves
   * without confirmed reference evidence either way (falls back to the old
   * single-"name"-column heuristic in AddLeafPage).
   */
  showMarkAsOther?: boolean;
  /** Packs the Add/Create form's fields two-per-row instead of the default one-per-row - only meaningful for a leaf that opts out of `compactFields` below (which supersedes this for every All Masters leaf now). Historical: real reference screenshots (2026-08-31) showed Vehicle/Equipment Present Status pairing Status Code+Status Label, then Hide in Next Year+Is Active, two-per-row, back when the rest of All Masters still stacked one field per row. */
  formColumns?: 2;
  /**
   * Add/Create form fields size to a natural 240-320px max-width and wrap
   * themselves (CSS grid auto-fit) instead of every field stretching
   * edge-to-edge in its own full-width row - client direction, 2026-09-02,
   * overriding the 2026-08-31 "one field per row, full width" decision this
   * type used to describe. Approved first on Zone Master, then rolled out
   * as the default for every All Masters leaf (see
   * app/(dashboard)/masters/[...slug]/page.tsx, which defaults this to
   * `true` for the whole route) - left as a real field here only so a
   * future leaf can still opt out with `compactFields: false` if its own
   * field shape doesn't suit an even auto-fit grid.
   */
  compactFields?: boolean;
};

export type NavGroup = {
  type: "group";
  slug: string;
  label: string;
  children: NavItem[];
  /** Overrides `label` for the page H1/breadcrumb only - used when the sidebar name and the real in-page title differ (confirmed real case: sidebar says "Production Masters", the page itself says "Production & Projects"). */
  pageTitle?: string;
  /** Overrides `label` on the *parent's* landing-page card only (mirrors NavLeaf.cardLabel) - confirmed real case: NICRA's own page/report-section title is the longer "NICRA (Technology Demonstration component)", but its card on the Projects landing page just says "NICRA". */
  cardLabel?: string;
  /** Subtitle shown under the page title on a group's landing page, when confirmed from the reference. */
  description?: string;
};

export type NavItem = NavLeaf | NavGroup;

export type SidebarSection = {
  slug: string;
  label: string;
  href?: string;
  icon: SidebarIconName;
  children?: NavItem[];
};

export type SidebarIconName =
  | "dashboard"
  | "form-summary"
  | "masters"
  | "role-management"
  | "user-management"
  | "form-management"
  | "module-images"
  | "targets"
  | "log-history"
  | "data-audit-log"
  | "notifications"
  | "reports";

const GENERIC_MASTER_COLUMNS: MasterColumn[] = [{ key: "name", label: "Name" }];

/** NARI models keep `male`/`female` as the General pair; kvk-report 3.7 also needs the OBC/SC/ST split. Real General/OBC/SC/ST x Male/Female grid with auto-computed Male/Female/Grand Total (client direction, 2026-09-15), same demographic-breakdown fieldKind as every other converted block below - `demographicKeyOverrides` remaps only the General pair onto NARI's own `male`/`female` columns, everything else uses the shared grid's default keys unchanged. */
const NARI_CASTE_COLUMNS: MasterColumn[] = [
  {
    key: "farmersDetails",
    label: "Number of Beneficiaries Detail",
    fieldKind: "demographic-breakdown",
    demographicVariant: "grid",
    demographicKeyOverrides: { generalMale: "male", generalFemale: "female" },
    formOnly: true,
  },
];

/** General/OBC/SC/ST x Male/Female breakdown for leaves whose real report table needs the farmersByCategory breakdown but uses the generic AddLeafPage form (not a bespoke dialog like CFLD's DemographicBreakdown) - real grid with auto-computed Male/Female/Grand Total (client direction, 2026-09-15; previously 8 flat fields with no total), same demographic-breakdown fieldKind as Training/Extension Activities/CFLD Extension Activity. The API still assembles these bare keys into one JSON object on save (farmersByCategory() in leaf-record-registry.ts), unchanged by this being a grid instead of 8 separate inputs. */
const DEMOGRAPHIC_COLUMNS: MasterColumn[] = [
  {
    key: "farmersDetails",
    label: "Number of Beneficiaries Detail",
    fieldKind: "demographic-breakdown",
    demographicVariant: "grid",
    formOnly: true,
  },
];

/** The 8 field keys of an unprefixed General/OBC/SC/ST x Male/Female demographic-breakdown block. Single source for the form (MasterFormFields re-exports it) and for the totals below. */
export const DEMOGRAPHIC_KEYS = [
  "generalMale", "generalFemale", "obcMale", "obcFemale",
  "scMale", "scFemale", "stMale", "stFemale",
] as const;

/**
 * Spread onto a leaf's own "number of farmers/participants" count so it is
 * filled in automatically from that leaf's Number of Beneficiaries Detail
 * grid instead of being typed twice (client direction, 2026-09-21). Shown as
 * a disabled field that updates as the grid is filled. The server derives
 * the stored value from the same 8 fields on every save
 * (demographicTotal in leaf-record-registry.ts), so nothing the browser
 * sends for this key is ever trusted. Only for leaves whose breakdown block
 * is unprefixed (`farmersDetails` with no demographicPrefix).
 */
const BENEFICIARY_TOTAL: Partial<MasterColumn> = {
  readonly: true,
  fieldKind: "calculated",
  sumOf: [...DEMOGRAPHIC_KEYS],
  helperText: "Auto-calculated: total of the beneficiary details below",
};

/** Role choices for the "Project Team" dropdown, shared by every Project section's Team leaf so they can never drift apart (client direction, 2026-09-21: PI and Co-PI added alongside the existing roles). */
const PROJECT_TEAM_ROLES = ["PI", "Co-PI", "Nodal Officer", "Associate Member"];

/** Calendar-order month choices for every "Month" field, so a month is picked instead of typed (client direction, 2026-09-21). */
const MONTH_OPTIONS: string[] = [...MONTH_NAMES];

function leaf(
  slug: string,
  label: string,
  columns: MasterColumn[] = GENERIC_MASTER_COLUMNS,
  cardLabel?: string,
  showMarkAsOther?: boolean,
  pageTitle?: string,
  cardLinkLabel?: string,
  tabLabel?: string,
): NavLeaf {
  return { type: "leaf", slug, label, columns, cardLabel, showMarkAsOther, pageTitle, cardLinkLabel, tabLabel };
}

/**
 * Cards for a group's landing page. If any direct child is itself a group,
 * every child becomes its own card (a bare leaf child is wrapped as a
 * single-item card reusing its own name - confirmed real pattern on pages
 * like Achievements, which mixes leaves and groups as siblings, each its
 * own card). If no child is a group (e.g. Basic Masters, Publication
 * Masters), the whole node becomes one card listing all its leaves inline.
 */
export function landingCards(node: NavGroup): NavGroup[] {
  const hasSubGroup = node.children.some((child) => child.type === "group");
  if (!hasSubGroup) return [node];
  return node.children.map((child) =>
    child.type === "group"
      ? { ...child, label: child.cardLabel ?? child.label }
      : {
          type: "group",
          slug: child.slug,
          label: child.cardLabel ?? child.label,
          children: [child],
        },
  );
}

function group(
  slug: string,
  label: string,
  children: NavItem[],
  extra?: { pageTitle?: string; cardLabel?: string; description?: string },
): NavGroup {
  return { type: "group", slug, label, children, ...extra };
}

/** All Masters -> Training & Extension Masters -> Training Master (columns confirmed on screen) */
const trainingMaster = group("training", "Training Master", [
  leaf("training-type", "Training Type Master", [
    { key: "trainingType", label: "Training Type", required: true },
  ]),
  leaf("training-area", "Training Area Master", [
    { key: "trainingType", label: "Training Type", required: true, sourceMaster: { master: "training-type", optionKey: "trainingType" } },
    { key: "trainingAreaName", label: "Training Area Name", required: true },
  ], undefined, true),
  /** 2 columns, confirmed against the reference). */
  leaf("training-thematic-area", "Training Thematic Area Master", [
    {
      key: "trainingAreaName",
      label: "Training Area Name",
      formLabel: "Training Area",
      required: true,
      sourceMaster: { master: "training-area", optionKey: "trainingAreaName" },
    },
    { key: "thematicArea", label: "Training Thematic Area", formLabel: "Thematic Area Name", required: true },
  ], undefined, true),
  leaf("training-clientele", "Training Clientele Master", [
    { key: "clientele", label: "Name", required: true, formLabel: "Training Clientele Name" },
  ], undefined, true),
  leaf("funding-source", "Funding Source Master", [
    { key: "fundingSource", label: "Name", required: true, formLabel: "Funding Source Name" },
  ], undefined, true),
]);

/** All Masters -> Training & Extension Masters (3-card landing confirmed on screen) */
const trainingExtensionMasters = group(
  "training-extension",
  "Training & Extension Masters",
  [
    trainingMaster,
    group("extension-activities", "Extension Activities", [
      leaf("extension-activity", "Extension Activity Master", [
        { key: "activityName", label: "Name", required: true, formLabel: "Extension Activity Name" },
      ], undefined, true),
      leaf("other-extension-activity", "Other Extension Activity Master", [
        { key: "activityName", label: "Name", required: true, formLabel: "Other Extension Activity Name" },
      ], undefined, true),
    ]),
    group("events", "Events", [
      leaf("events-master", "Events Master", [
        { key: "eventName", label: "Event Name", required: true },
      ], undefined, false),
    ]),
  ],
  {
    pageTitle: "Training & Extension",
    description: "Manage training masters, extension activities, and events",
  },
);

/** All Masters -> Other Masters (sub-groups + columns confirmed on screen) */
const otherMasters = group(
  "other",
  "Other Masters",
  [
    group("employee", "Employee Masters", [
      leaf("staff-category", "Staff Category Master", [
        { key: "name", label: "Category Name", required: true },
      ]),
      /** Form label is "Job Type" (real reference, 2026-08-31) - was the generic "Name" default. */
      leaf("job-type", "Job Type Master", [{ key: "name", label: "Name", formLabel: "Job Type", required: true }]),
      /** Real column confirmed live - "Level Name", not the generic "Name" default. */
      leaf("pay-level", "Pay Level Master", [
        { key: "name", label: "Level Name", required: true },
      ]),
      leaf("pay-scale", "Pay Scale Master", [
        { key: "name", label: "Scale Name", required: true, placeholder: "e.g. 15600-39100" },
      ]),
      leaf("sanctioned-post", "Sanctioned Post Master", [
        { key: "name", label: "Post Name", required: true },
      ]),
      leaf("discipline", "Discipline Master", [
        { key: "name", label: "Discipline Name", required: true },
      ]),
    ]),
    group("bank", "Bank Masters", [
      /** Form label is "Bank Account Type" (real reference, 2026-08-31) - was the generic "Name" default. */
      leaf("bank-account-type", "Bank Account Type Master", [
        { key: "name", label: "Name", formLabel: "Bank Account Type", required: true, placeholder: "e.g. Saving" },
      ]),
    ]),
    group("calendar-context", "Calendar & Context Masters", [
      leaf("season", "Season Master", [{ key: "name", label: "Season Name", required: true }]),
      leaf("unit", "Unit Master", [{ key: "name", label: "Unit Name", required: true }]),
      /** Form label is "Crop Type Name" (real reference, 2026-08-31) - the generic "Type Name" was one word short. */
      leaf("crop-type", "Crop Type Master", [
        { key: "name", label: "Type Name", formLabel: "Crop Type Name", required: true },
      ]),
      leaf("important-day", "Important Day Master", [
        { key: "name", label: "Day Name", required: true },
      ]),
    ]),
    /**
     * Resource Masters' real page H1 drops the "Master" suffix that the landing
     * card keeps - so `label` carries the real
     * page title and `cardLabel` the real card text, which is exactly what that
     * pair of fields is for.
     */
    group("resource", "Resource Masters", [
      leaf(
        "infrastructure",
        "Infrastructure",
        [{ key: "name", label: "Name", formLabel: "Infrastructure Name", required: true, placeholder: "Enter infrastructure name" }],
        "Infrastructure Master",
      ),
      leaf(
        "soil-water",
        "Soil Water",
        [{ key: "name", label: "Analysis Name", required: true }],
        "Soil Water Analysis Master",
      ),
      /**
       * Same 4-column shape as Equipment Present Status below - confirmed
       * against the reference (2026-08-31): Status Code+Status Label pair
       * two-per-row, then Hide in Next Year+Is Active pair two-per-row as
       * real Yes/No dropdowns (not free text) - the backend's own `bool()`
       * helper already accepted "yes"/"true" case-insensitively before this
       * change, so the dropdown was clearly the intended UI all along.
       */
      {
        ...leaf(
          "vehicle-present-status",
          "Vehicle Present Status",
          [
            { key: "statusCode", label: "Status Code", required: true, placeholder: "e.g. SOLD" },
            { key: "statusLabel", label: "Status Label", required: true },
            { key: "hideInNextYear", label: "Hide in Next Year", staticOptions: ["Yes", "No"], defaultValue: "No" },
            { key: "isActive", label: "Is Active", staticOptions: ["Yes", "No"], defaultValue: "Yes" },
          ],
          "Vehicle Present Status Master",
        ),
        formColumns: 2,
      },
      {
        ...leaf(
          "equipment-present-status",
          "Equipment Present Status",
          [
            { key: "statusCode", label: "Status Code", required: true, placeholder: "e.g. AUCTION" },
            { key: "statusLabel", label: "Status Label", required: true },
            { key: "hideInNextYear", label: "Hide in Next Year", staticOptions: ["Yes", "No"], defaultValue: "No" },
            { key: "isActive", label: "Is Active", staticOptions: ["Yes", "No"], defaultValue: "Yes" },
          ],
          "Equipment Present Status Master",
        ),
        formColumns: 2,
      },
      /** Form label is "Type Name" (real reference, 2026-08-31) - was the generic "Name" default. */
      leaf("equipment-type", "Equipment Type Master", [
        { key: "name", label: "Name", formLabel: "Type Name", required: true, placeholder: "e.g. Tractor" },
      ]),
      /**
       * Real bug, 2026-09-12: View Vehicles' own Vehicle Type field was a
       * hardcoded 4-value list (Bus/Jeep/Tractor/Motor Cycle) with no master
       * behind it at all - the one field in this whole "Type" family that
       * wasn't database-driven. Same shape as Equipment Type Master right
       * above; seeded with those same 4 values plus "Other" so the existing
       * hardcoded dropdown's options survive the switch unchanged.
       */
      leaf("vehicle-type", "Vehicle Type Master", [
        { key: "name", label: "Name", formLabel: "Type Name", required: true, placeholder: "e.g. Tractor" },
      ]),
      /** Real reference order (2026-08-31): Equipment Type (a real dropdown sourced from Equipment Type Master, not free text) comes before Equipment Name, not after. */
      leaf("equipment", "Equipment Master", [
        {
          key: "equipmentType",
          label: "Equipment Type",
          required: true,
          sourceMaster: { master: "equipment-type", optionKey: "name" },
        },
        { key: "name", label: "Name", formLabel: "Equipment Name", required: true, placeholder: "e.g. John Deere 5050D" },
      ]),
      leaf("asset-funding-source", "Asset Funding Source Master", [
        { key: "name", label: "Name", required: true, placeholder: "e.g. ICAR" },
      ]),
    ]),
    /**
     * Same page-H1-vs-card-label split as Resource Masters above. None of
     * these six leaves' real Create forms show a "Mark as Other" checkbox
     * (real reference, 2026-08-31) - every other single-"name" master in
     * this file falls back to showing it via the isSimpleMaster heuristic
     * (key === "name"), so this whole group needs the explicit `false`
     * override, same exception already established for Events/Natural
     * Farming Activity/Activity Master elsewhere in this file.
     */
    group("performance-indicator", "Performance Indicator Masters", [
      leaf(
        "impact-specific-area",
        "Impact Areas",
        [{ key: "name", label: "Specific Area Name", required: true }],
        "Impact Specific Area Master",
        false,
      ),
      /** Real column confirmed live. */
      leaf(
        "type-of-enterprise",
        "Enterprises",
        [{ key: "name", label: "Enterprise Type Name", required: true }],
        "Type of Enterprise Master",
        false,
      ),
      /** Real column confirmed live. */
      leaf(
        "account-type",
        "Account Types",
        [{ key: "name", label: "Account Type", required: true }],
        "Account Type Master",
        false,
      ),
      /** Real column confirmed live. */
      leaf(
        "programme-type",
        "Programs",
        [{ key: "name", label: "Programme Type", required: true }],
        "Programme Type Master",
        false,
      ),
      /** Form label is "Training/Awareness Type" (real reference, 2026-08-31) - was the generic "Type Name" default. */
      leaf(
        "ppv-fra-training-type",
        "PPV & FRA",
        [{ key: "name", label: "Type Name", formLabel: "Training/Awareness Type", required: true }],
        "PPV & FRA Training Type Master",
        false,
      ),
      /** Form label is "Dignitary Type" (real reference, 2026-08-31) - the "genuinely a plain 'Name' column" note below was wrong, corrected against the real "Create VIP Dignitaries" screenshot. */
      leaf(
        "vip-dignitary",
        "VIP Dignitaries",
        [{ key: "name", label: "Name", formLabel: "Dignitary Type", required: true }],
        "VIP Dignitary Master",
        false,
      ),
    ]),
    group("project-wise-budget", "Project Wise Budget Masters", [
      leaf("funding-agency", "Funding Agency Master", [
        { key: "name", label: "Agency Name", required: true },
      ]),
      /**
       * 2 columns, confirmed against the reference) - the second column was
       * missing entirely. Real reference (2026-08-31): the dropdown's form
       * label is "Default Funding Agency" and it is NOT required (no
       * asterisk in the real "Create Financial Project" screenshot),
       * unlike every other sourceMaster dropdown in this file.
       */
      leaf("financial-project", "Financial Project Master", [
        { key: "projectName", label: "Project Name", required: true },
        {
          key: "agencyName",
          label: "Agency Name",
          formLabel: "Default Funding Agency",
          sourceMaster: { master: "funding-agency", optionKey: "name" },
        },
      ]),
    ]),
  ],
  {
    description: "Manage employee, training, extension, and other master data",
  },
);

/** All Masters -> Basic Masters (columns + tab order confirmed on screen) */
const basicMasters = group(
  "basic",
  "Basic Masters",
  [
    {
      ...leaf("zone-master", "Zone Master", [
        { key: "zoneName", label: "Zone Name", required: true },
      ]),
      compactFields: true,
    },
    leaf("state-master", "State Master", [
      { key: "stateName", label: "State Name", required: true },
      { key: "zoneName", label: "Zone Name", required: true },
    ]),
    leaf("district-master", "District Master", [
      { key: "districtName", label: "District Name", required: true },
      { key: "zoneName", label: "Zone Name", required: true },
      { key: "stateName", label: "State Name", required: true },
    ]),
    /** State/District brought back (2026-08-31) - a real "Create Institute" reference screenshot finally showed them (Institute Name, Zone, State, District, in that order, all required); Institute's schema already carried optional stateId/districtId for exactly this case. */
    leaf("institute-master", "Institute Master", [
      { key: "instituteName", label: "Institute Name", required: true, staticOptions: INSTITUTE_MASTER_ROWS.map((r) => r.instituteName) },
      { key: "zoneName", label: "Zone Name", required: true },
      { key: "stateName", label: "State Name", required: true },
      { key: "districtName", label: "District Name", required: true },
    ]),
    leaf("host-master", "Host Master", [
      { key: "hostName", label: "Host Name" },
      { key: "directorExtension", label: "Director Extension" },
      { key: "address", label: "Address" },
      { key: "phone", label: "Landline" },
      { key: "mobile", label: "Mobile" },
      { key: "fax", label: "Fax" },
      { key: "email", label: "Email" },
    ]),
    /** Column order/labels confirmed exactly against the reference: Mobile, Email, Address, Year of Sanction - not the Mobile/Address/E-Mail/Sanction Year order this leaf had before. */
    /** Institute column added 2026-08-27 - the real "Create KVK" reference form (kvk-master-add-form.tsx) already had a required Institute field, it was just never submitted to the backend. */
    leaf("kvk-master", "KVK Master", [
      { key: "zoneName", label: "Zone Name" },
      { key: "stateName", label: "State Name" },
      { key: "hostOrg", label: "Host Org" },
      { key: "districtName", label: "District Name" },
      { key: "instituteName", label: "Institute", staticOptions: INSTITUTE_MASTER_ROWS.map((r) => r.instituteName) },
      { key: "kvk", label: "KVK" },
      { key: "mobile", label: "Mobile" },
      { key: "fax", label: "Fax" },
      { key: "email", label: "Email" },
      { key: "address", label: "Address" },
      { key: "sanctionYear", label: "Year of Sanction" },
    ]),
  ],
  { description: "Manage zones, states, institutes, hosts, and districts" },
);

/** All Masters -> OFT & FLD Masters (two tab-sets confirmed on screen: OFT side, FLD side) */
const oftFldMasters = group(
  "oft-fld",
  "OFT & FLD Masters",
  [
    /**
     * Column sets below were re-confirmed against the real reference in the
     * 2026-08-22 audit -
     * several of these tables carry a second/third column that earlier passes
     * missed because the reference table scrolls horizontally.
     */
    group("oft", "OFT Masters", [
      leaf("subject", "Subject Master", [
        { key: "subjectName", label: "Subject Name", required: true },
        { key: "thematicAreasCount", label: "Thematic Areas Count", readonly: true },
      ], undefined, true),
      leaf("oft-thematic-area", "OFT Thematic Area Master", [
        { key: "subjectName", label: "Subject Name", required: true, sourceMaster: { master: "subject", optionKey: "subjectName" } },
        { key: "thematicArea", label: "Thematic Area Name", required: true },
      ], undefined, true),
    ]),
    group("fld", "FLD Masters", [
      leaf("sector", "Sector Master", [
        { key: "sectorName", label: "Sector Name", required: true },
        { key: "categoriesCount", label: "Categories Count", readonly: true },
      ], undefined, true),
      leaf("fld-thematic-area", "FLD Thematic Area Master", [
        { key: "sectorName", label: "Sector Name", required: true, sourceMaster: { master: "sector", optionKey: "sectorName" } },
        { key: "thematicAreaName", label: "Thematic Area Name", required: true },
      ], undefined, true),
      /** Real columns confirmed live. */
      leaf("category", "Category Master", [
        { key: "sectorName", label: "Sector Name", required: true, sourceMaster: { master: "sector", optionKey: "sectorName" } },
        { key: "categoryName", label: "Category Name", required: true },
        { key: "subCategoriesCount", label: "Sub Categories Count", readonly: true },
      ], undefined, true),
      /** 4 columns, confirmed against the reference) - 3 were missing. Field order (Sector -> Category -> Subcategory Name) confirmed against the real "Create Sub-category" screenshot, 2026-08-31 - parent pickers before the name being created, not after. */
      leaf("sub-category", "Sub-category Master", [
        { key: "sectorName", label: "Sector Name", required: true, sourceMaster: { master: "sector", optionKey: "sectorName" } },
        {
          key: "categoryName",
          label: "Category Name",
          required: true,
          sourceMaster: { master: "category", optionKey: "categoryName", dependsOnKey: "sectorName", filterKey: "sectorName" },
        },
        { key: "subCategoryName", label: "Sub Category Name", required: true },
        { key: "cropsCount", label: "Crops Count", readonly: true },
      ], undefined, true),
      /**
       * Real reference (2026-08-31) confirmed a Sector field too (Crop's
       * own Sector -> Category -> Subcategory -> Crop Name chain, same
       * parent-pickers-first order as Sub-category Master above) - Sector
       * narrows Category the same way it already does on Sub-category
       * Master (validated server-side there via sector->category lookup,
       * not stored as its own column - Crop's category already implies a
       * sector through its own real relation). Unit and Quantity Data Type
       * are real dropdowns in the reference, but the option list itself was
       * never visible (always shown closed) - left as free text rather than
       * guessed, same reasoning as before.
       */
      leaf("crop", "Crop Master", [
        { key: "sectorName", label: "Sector Name", required: true, sourceMaster: { master: "sector", optionKey: "sectorName" } },
        {
          key: "category",
          label: "Category Name",
          required: true,
          sourceMaster: { master: "category", optionKey: "categoryName", dependsOnKey: "sectorName", filterKey: "sectorName" },
        },
        {
          key: "subCategoryName",
          label: "Sub Category Name",
          required: true,
          sourceMaster: { master: "sub-category", optionKey: "subCategoryName", dependsOnKey: "category", filterKey: "categoryName" },
        },
        { key: "cropName", label: "Crop Name", required: true },
        { key: "unit", label: "Unit" },
        { key: "quantityDataType", label: "Quantity Data Type" },
        // "Quantity required in forms" dropped from the list/form/report per
        // client request 2026-09-04 ("CFLD Masters: Remove 'Quantity Required
        // in Forms'"). The DB column stays; it's just no longer shown.
      ], undefined, true),
      /** Real reference: Create Activity has no "Mark as Other" checkbox, unlike every other single-Name master in this group. */
      leaf("activity", "Activity Master", [
        { key: "name", label: "Activity Name", required: true },
      ], undefined, false),
    ]),
    group("cfld", "CFLD Master", [
      leaf("cfld-crop", "CFLD Crop Master", [
        { key: "season", label: "Season", sourceMaster: { master: "season", optionKey: "name" } },
        { key: "type", label: "Type" },
        { key: "cropName", label: "Crop Name" },
      ]),
    ]),
  ],
  {
    description:
      "Manage OFT (On Farm Testing), FLD (Front Line Demonstrations), and CFLD masters",
  },
);

/**
 * All Masters -> Production Masters (6-card landing confirmed on screen).
 * Sidebar label is "Production Masters" (confirmed repeatedly in the
 * reference), but the page's own H1 reads "Production & Projects"
 * - confirmed directly via atari-photo-zip/IMG-20260817-WA0233.jpg
 * (URL /all-master/production-projects). Both are real; `pageTitle` carries
 * the in-page override.
 */
const productionProjects = group(
  "production",
  "Production Masters",
  [
    group(
      "seed-planting-bio",
      "Production of Seed, Planting Materials, Bio Products",
      [
        leaf("product-category", "Product Category Master", [
          { key: "name", label: "Product Category Name", required: true },
        ], undefined, true),
        /** 2 columns, confirmed against the reference). Product Category is a real cascading dropdown sourced from Product Category Master (2026-08-31 reference), not free text - same pattern as every other "pick the parent master's row" field in this file. */
        leaf("product-type", "Product Type Master", [
          {
            key: "productCategoryName",
            label: "Product Category Name",
            formLabel: "Product Category",
            required: true,
            sourceMaster: { master: "product-category", optionKey: "name" },
          },
          { key: "productCategoryType", label: "Product Category Type", formLabel: "Product Type", required: true },
        ], undefined, true),
        /**
         * Real Create form also has Unit and Quantity Data Type (both
         * dropdowns in the reference) plus a "Quantity required in forms"
         * checkbox - wired here as free-text for Unit/Quantity Data Type
         * since the real dropdown's option list wasn't visible in the
         * reference, and a checkbox for Quantity Required (that part was
         * unambiguous). Product Category/Product Type are real cascading
         * dropdowns (2026-08-31 reference), same as Product Type Master's
         * own Product Category field just above.
         */
        leaf("products", "Products Master", [
          {
            key: "productCategoryName",
            label: "Product Category Name",
            formLabel: "Product Category",
            required: true,
            sourceMaster: { master: "product-category", optionKey: "name" },
          },
          {
            key: "productCategoryType",
            label: "Product Category Type",
            formLabel: "Product Type",
            required: true,
            sourceMaster: {
              master: "product-type",
              optionKey: "productCategoryType",
              dependsOnKey: "productCategoryName",
              filterKey: "productCategoryName",
            },
          },
          { key: "productName", label: "Product Name", required: true },
          // Unit / Quantity Data Type / Quantity required in forms dropped
          // from the list, Add/Edit form and the report per client request
          // 2026-09-04 ("Product Master Report: Remove the fields Unit,
          // Quantity Data Type, and Quantity Required in Forms"). The DB
          // columns stay; they're just no longer shown anywhere.
        ], undefined, true),
      ],
    ),
    group("climate-resilient-agriculture", "Climate Resilient Agriculture", [
      /** Season is a real cascading dropdown sourced from Season Master (2026-08-31 reference), not free text - same as every other "pick the parent master's row" field in this file. */
      leaf("cropping-system", "Cropping System Master", [
        { key: "season", label: "Season Name", formLabel: "Season", required: true, sourceMaster: { master: "season", optionKey: "name" } },
        { key: "cropName", label: "Crop Name", required: true },
      ], undefined, true),
      /** Season Name is the FIRST column in the real table - it was missing entirely. Season is a real cascading dropdown, same reasoning as Cropping System Master above. */
      leaf("farming-system", "Farming System Master", [
        { key: "season", label: "Season Name", formLabel: "Season", required: true, sourceMaster: { master: "season", optionKey: "name" } },
        { key: "farmingSystemName", label: "Farming System Name", required: true },
      ], undefined, true),
    ]),
    group("arya", "ARYA", [
      leaf("arya-enterprise", "ARYA Enterprise Master", [
        { key: "name", label: "Enterprise Name", required: true },
      ], undefined, true),
    ]),
    group("tsp-scsp", "TSP/SCSP", [
      leaf("tsp-scsp-type", "TSP/SCSP Type Master", [
        { key: "name", label: "Type Name", required: true },
      ]),
      leaf("tsp-scsp-activity", "TSP/SCSP Activity Master", [
        { key: "name", label: "Activity Name", required: true },
      ]),
    ]),
    group("natural-farming", "Natural Farming", [
      /** Confirmed real exception: unlike every other single-"name" master, this one's real Create form has no "Mark as Other" checkbox. */
      leaf("natural-farming-activity", "Natural Farming Activity Master", [
        { key: "name", label: "Activity Name", required: true },
      ], undefined, false),
      leaf("soil-parameter", "Natural Farming Soil Parameter Master", [
        { key: "name", label: "Type", formLabel: "Natural Farming Soil Parameter", required: true },
      ], undefined, true),
    ]),
    group("agri-drone", "Agri-Drone", [
      leaf("demonstrations-on", "Agri-Drone Demonstrations On Master", [
        { key: "name", label: "Demonstrations On", required: true },
      ], undefined, true),
    ]),
    /** Moved here from Other Masters (client direction): NARI and NICRA are project masters, so they belong under Production Masters. Slugs, columns and data are unchanged - only the sidebar section. */
    group("nari", "NARI Masters", [
      leaf("nari-activity", "NARI Activity Master", [
        { key: "name", label: "Activity Name", required: true },
      ]),
      /** Form labels are "Nutrition Garden Type" / "Category Name" (real reference, 2026-08-31) - both were the generic "Name" default. */
      leaf("nari-nutrition-garden-type", "NARI Nutrition Garden Type Master", [
        { key: "name", label: "Name", formLabel: "Nutrition Garden Type", required: true },
      ]),
      leaf("nari-crop-category", "NARI Crop Category Master", [
        { key: "name", label: "Name", formLabel: "Category Name", required: true },
      ]),
    ]),
    group("nicra", "NICRA Masters", [
      leaf("nicra-category", "NICRA Category Master", [
        { key: "name", label: "Category Name", required: true },
      ]),
      /** Real reference order (2026-08-31): Category (dropdown) comes before Sub Category Name, not after - parent picker first, same as every other cascading pair in this file. */
      leaf("nicra-sub-category", "NICRA Sub-category Master", [
        {
          key: "categoryName",
          label: "Category Name",
          formLabel: "Category",
          required: true,
          sourceMaster: { master: "nicra-category", optionKey: "name" },
        },
        { key: "subCategoryName", label: "Sub Category Name", required: true },
      ]),
      leaf("nicra-seed-fodder-bank", "NICRA Seed/Fodder Bank Master", [
        { key: "name", label: "Seed Bank Fodder Bank", required: true },
      ]),
      /** Form labels are "Dignitary Type" / "PI/CO-PI Type" (real reference, 2026-08-31) - both were the generic "Type" default. */
      leaf("nicra-dignitary-type", "NICRA Dignitary Type Master", [
        { key: "name", label: "Type", formLabel: "Dignitary Type", required: true },
      ]),
      leaf("nicra-pi-co-pi-type", "NICRA PI/CO-PI Type Master", [
        { key: "name", label: "Type", formLabel: "PI/CO-PI Type", required: true },
      ]),
    ]),
  ],
  {
    pageTitle: "Production & Projects",
    description:
      "Manage production items, climate resilient agriculture, and ARYA enterprise masters",
  },
);

export const ALL_MASTERS: NavItem[] = [
  basicMasters,
  oftFldMasters,
  trainingExtensionMasters,
  productionProjects,
  group(
    "publication",
    "Publication Masters",
    [
      /** Landing-page card text is "Publication Items" (no "Master" suffix) - confirmed against the reference, same page-H1-vs-card-label split as Resource/Performance Indicator Masters elsewhere in this file. */
      leaf("publication-items", "Publication Items Master", [
        { key: "itemName", label: "Publication Item", required: true },
      ], "Publication Items", false),
    ],
    {
      pageTitle: "Publications",
      description: "Manage publication items and related master data",
    },
  ),
  otherMasters,
];

/**
 * Form Management -> About KVK (5-card landing confirmed on the real reference
 * the reference: Basic Information / Employee Information / Land & Infrastructure
 * Information / Vehicles Information / Equipments Information, each linking to
 * the exact page names shown there). All columns below are transcribed directly
 * from the client's real PDF data exports ("atari zip file.zip", folder
 * "7. about kvk admin data") - not guessed.
 */
const aboutKvk = group(
  "about-kvk",
  "About KVK",
  [
    group("basic", "Basic Information", [
      /** All 6 columns re-confirmed against the reference - the previous set was entirely wrong. */
      /**
       * Column set + order re-confirmed live against atariams.org's own
       * "View KVK Details" table (2026-08-24, client pointer #1 "add more
       * headings"): the real table carries two more columns past the
       * earlier 8 - a trailing "Host Organization Name" repeat of the same
       * host field alongside the leading "Organization Name" column (a real
       * quirk of the live app, not a mistake here - both show the same
       * institute per row), and "Year of Sanction" at the very end before
       * Action.
       */
      /** "Host Organization Name" used to duplicate the "Host Org" column above (same `hostOrg` key twice) - real bug, fixed 2026-08-28. */
      leaf("view-kvks", "View KVKs", [
        { key: "zoneName", label: "Zone Name" },
        { key: "stateName", label: "State Name" },
        { key: "hostOrg", label: "Host Org" },
        { key: "districtName", label: "District Name" },
        { key: "kvk", label: "KVK" },
        { key: "mobile", label: "Mobile" },
        { key: "email", label: "Email" },
        { key: "address", label: "Address" },
        { key: "sanctionYear", label: "Year of Sanction" },
      ]),
      /**
       * Add/Edit form transcribed from the live reference
       * (atariams.org /bank-account-details/create, KVK admin): every field
       * is required and the form has no photo upload. Account Type keeps its
       * All Masters "Bank Account Type" source (the master already holds the
       * real option set - not narrowed to the reference's shorter list).
       */
      leaf("bank-account-details", "Bank Account Details", [
        { key: "kvk", label: "KVK" },
        { key: "accountType", label: "Account Type", required: true, placeholder: "Select", sourceMaster: { master: "bank-account-type", optionKey: "name" } },
        { key: "accountName", label: "Account Name", required: true },
        { key: "bankName", label: "Bank Name", required: true },
        { key: "location", label: "Location", required: true },
        { key: "accountNumber", label: "Account Number", required: true },
      ]),
    ]),
    group("employee", "Employee Information", [
      /**
       * Real leading columns confirmed against the reference: the table opens
       * with KVK, a Photo thumbnail and a Resume cell, then Staff Name /
       * Position - not the Sanctioned Post / Name of the Incumbent / DOB /
       * Discipline set guessed earlier. Its horizontal scrollbar shows roughly
       * as many columns again hidden to the right, which no capture in either
       * source reaches, so only the confirmed 7 are declared here.
       */
      /**
       * Column set re-confirmed live against atariams.org's own "View
       * Staff" table (2026-08-24, client pointer #2 "add more headings"):
       * the real table has 4 more columns than the earlier pass caught -
       * Position (right after Staff Name) and Email (right after Position,
       * contradicting the earlier "no Email column" read - a fuller scroll
       * of the real table shows it does have one) both up front, plus
       * Category and Transfer Status trailing after Details of Allowances.
       */
      leaf("employee-details", "Employee Details", [
        { key: "kvk", label: "KVK Name", formOrder: 1 },
        { key: "staffName", label: "Staff Name", formOrder: 2 },
        { key: "position", label: "Position", formOrder: 3 },
        { key: "email", label: "Email", formOrder: 4 },
        { key: "sanctionedPost", label: "Sanctioned Post", sourceMaster: { master: "sanctioned-post", optionKey: "name" }, formOrder: 5 },
        { key: "mobile", label: "Mobile", formOrder: 6 },
        { key: "payScale", label: "Present Basic Pay", sourceMaster: { master: "pay-scale", optionKey: "name" }, formOrder: 7 },
        { key: "dateOfJoining", label: "Date of Joining", formOrder: 8 },
        { key: "jobType", label: "Job Type", sourceMaster: { master: "job-type", optionKey: "name" }, formOrder: 9 },
        { key: "allowances", label: "Details of Allowances", formOrder: 10 },
        { key: "category", label: "Category", sourceMaster: { master: "staff-category", optionKey: "name" }, formOrder: 11 },
        { key: "transferStatus", label: "Transfer Status", formOrder: 12 },
        // No formOrder here (defaults to Infinity in master-form-fields.tsx's
        // sort, i.e. sorts *after* every explicitly-numbered field above) -
        // pushes these to the end of the Edit form (client report, 2026-09-03:
        // the full-width upload cards read oddly appearing 2nd/3rd, right
        // after KVK Name) to match the Add form's own "Photo & Resume"
        // section at the bottom. List table column order (which reads this
        // same array untouched) is unaffected.
        { key: "photo", label: "Photo", fileKind: "image", uploadKind: "staff-photo" },
        { key: "resume", label: "Resume", fileKind: "document", uploadKind: "staff-resume" },
      ]),
      leaf(
        "staff-transferred",
        "Staff Transferred",
        [
          { key: "staffName", label: "Staff Name" },
          // Client direction, 2026-09-12: "Transfer From/To KVK Name", with
          // the relieving date sitting between them - was "Before/After
          // Transfer KVK Name" with no date column at all (the date was only
          // ever in the Transfer dialog itself and "View Transfer History",
          // never here).
          { key: "kvkNameBeforeTransfer", label: "From Transfer KVK Name" },
          { key: "dateOfRelieving", label: "Date of Relieving" },
          { key: "latestKvkName", label: "To Transfer KVK Name" },
        ],
        "Details of Staff Transferred",
      ),
      /**
       * Client direction, 2026-09-19: retirement is an Employee Details row
       * action (Action -> Retired, a date-only popup), the same way Transfer
       * is - not a field on the Add/Edit form. A retired staff member leaves
       * Employee Details and lands here, in a read-only list beside Staff
       * Transferred.
       */
      leaf(
        "staff-retired",
        "Staff Retired",
        [
          { key: "kvk", label: "KVK Name" },
          { key: "staffName", label: "Staff Name" },
          { key: "position", label: "Position" },
          { key: "sanctionedPost", label: "Sanctioned Post" },
          { key: "dateOfRetirement", label: "Date of Retirement" },
        ],
        "Details of Staff Retired",
      ),
    ]),
    group("land-infrastructure", "Land & Infrastructure Information", [
      /**
       * Column labels, the 15-option "Name of Infrastructure" select, the
       * form field order and the required marks are all transcribed from the
       * live reference (atariams.org /create-infra + /edit-infra, KVK admin).
       * List column order (this array, read untouched) matches the reference
       * list; `formOrder` carries the reference form sequence (plinth/lintel/
       * roof first, then Not Yet Started). The status fields are real Yes/No
       * booleans stored via the leaf registry's `bool()` helper; they open on
       * the "Please Select" placeholder (no default), same as the reference.
       * `fundingAgencyName` is not on the reference form or list - the model
       * column stays for the KVK report, it just no longer has a form input.
       */
      leaf("infrastructure-details", "Infrastructure Details", [
        { key: "kvk", label: "KVK" },
        /**
         * Client direction, 2026-09-13: picking "Others" here didn't open a
         * free-text box the way every other "Other" in this app does (OFT/
         * FLD's sector/crop selects, Equipment Type, ...) - it was a plain
         * hardcoded `staticOptions` list with no Other-handling at all, even
         * though a real Infrastructure Master (type "infrastructure") already
         * existed with the identical 15 values, "Other" already flagged
         * `isOther`. Switched to that real master via `sourceMaster` instead
         * of a second hardcoded copy - reuses the same free-text mechanism
         * every other sourceMaster field already has, no new logic needed.
         */
        {
          key: "infraMasterName",
          label: "Name of Infrastructure",
          required: true,
          formOrder: 1,
          sourceMaster: { master: "infrastructure", optionKey: "name" },
        },
        { key: "notYetStarted", label: "Not Yet Started", staticOptions: ["Yes", "No"], placeholder: "Please Select", required: true, formOrder: 5 },
        { key: "completedPlinthLevel", label: "Completed upto plinth level", staticOptions: ["Yes", "No"], placeholder: "Please Select", required: true, formOrder: 2 },
        { key: "completedLintelLevel", label: "Completed upto lintel level", staticOptions: ["Yes", "No"], placeholder: "Please Select", required: true, formOrder: 3 },
        { key: "completedRoofLevel", label: "Completed upto roof level", staticOptions: ["Yes", "No"], placeholder: "Please Select", required: true, formOrder: 4 },
        { key: "totallyCompleted", label: "Totally Completed", staticOptions: ["Yes", "No"], placeholder: "Please Select", required: true, formOrder: 6 },
        { key: "plinthAreaSqM", label: "Plinth Area(m²)", required: true, formOrder: 7 },
        { key: "underUse", label: "Under use or not", staticOptions: ["Yes", "No"], placeholder: "Please Select", required: true, formOrder: 8 },
        { key: "sourceOfFunding", label: "Source of Funding", required: true, formOrder: 9 },
      ]),
      /**
       * Land Details used to be its own bespoke repeatable "Total Land with
       * KVK" panel (Item + In Ha, add/remove rows, one save) matching the
       * live reference's Edit KVK form section - no list, no separate Add
       * New. The client asked for it to match every sibling leaf instead: a
       * real list with its own Add New/Edit pages (client direction,
       * 2026-09-13), so it's a plain leaf now like Infrastructure Details
       * right above it. One record per land row, feeding report 1.3.B.
       * `description` stays a report-only column.
       */
      leaf("land-details", "Land Details", [
        { key: "kvk", label: "KVK" },
        { key: "item", label: "Item", required: true, formOrder: 1 },
        { key: "areaHa", label: "In Ha", required: true, formOrder: 2 },
      ]),
      /** Real columns confirmed live at /forms/about-kvk/infrastructure/staff-quarters. */
      leaf("staff-quarters", "Staff Quarters", [
        { key: "kvk", label: "KVK" },
        { key: "noOfStaffQuarters", label: "No of Staff Quarters" },
        { key: "dateOfCompletion", label: "Date of Completion" },
        { key: "remark", label: "Remark" },
      ]),
    ]),
    group("vehicles", "Vehicles Information", [
      /**
       * View Vehicles master form: Vehicle Type (real dropdown sourced from
       * Vehicle Type Master, not a hardcoded list - real bug, 2026-09-12)
       * comes first, then Name of Vehicle, Registration Number, Year of
       * Purchase, Total Cost, Total Run(km/hrs), Present Status (Working /
       * Repairing / Condemned / Auction). Picking "Repairing" reveals a
       * Repairing Cost input (MasterColumn.showWhen). Vehicle Type also
       * feeds the KVK report (1.4.A/1.4.B).
       */
      leaf(
        "view-vehicles",
        "View Vehicles",
        [
          { key: "kvk", label: "KVK" },
          {
            key: "vehicleType",
            label: "Vehicle Type",
            required: true,
            formOrder: 1,
            placeholder: "Select",
            sourceMaster: { master: "vehicle-type", optionKey: "name" },
          },
          { key: "vehicleName", label: "Vehicle Name", formLabel: "Name of Vehicle", required: true, formOrder: 2 },
          { key: "registrationNo", label: "Registration No.", formLabel: "Registration Number", formOrder: 3 },
          { key: "yearOfPurchase", label: "Year of Purchase", required: true, formOrder: 4 },
          { key: "totalCost", label: "Total Cost (Rs.)", formLabel: "Total Cost", formOrder: 5 },
          { key: "totalRun", label: "Total Run(km/hrs)", formOrder: 6 },
          {
            key: "presentStatus",
            label: "Present Status",
            required: true,
            formOrder: 7,
            placeholder: "Select",
            staticOptions: ["Working", "Repairing", "Condemned", "Auction"],
          },
          {
            key: "repairingCost",
            label: "Repairing Cost",
            required: true,
            formOnly: true,
            formOrder: 8,
            showWhen: { key: "presentStatus", equals: "Repairing" },
          },
          { key: "sourceOfFunding", label: "Source of Funding", required: true, formOrder: 9 },
        ],
        "Vehicles",
      ),
      /**
       * The yearly status record for a vehicle. List columns and the Add/Edit
       * form are transcribed from the live reference (atariams.org
       * /view-vehicle-details + /create-vehicle-details, KVK admin): the form
       * is Reporting Year (year select) -> Vehicle (picked from this KVK's own
       * Vehicles master) -> Total Run -> Present Status -> Funding Source ->
       * Repairing Cost, all required. Registration No. is a list-only column,
       * derived from the picked vehicle (`readonly` -> shown in the table,
       * never a form input). All six values map to existing VehicleStatus
       * columns - no migration.
       */
      leaf("vehicle-details", "Vehicle Details", [
        {
          key: "reportingYear",
          label: "Year",
          formLabel: "Reporting Year",
          required: true,
          formOrder: 1,
          placeholder: "Select",
          staticOptions: Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - i)),
          yearsModel: "vehicleStatus",
        },
        { key: "kvk", label: "KVK" },
        {
          key: "vehicleName",
          label: "Vehicle Name",
          formLabel: "Vehicle",
          required: true,
          formOrder: 2,
          placeholder: "Select",
          // Picking a vehicle carries forward its most recent year's status
          // (falling back to the master's own current values on a first entry).
          sourceMaster: { master: "__vehicle__", optionKey: "name", carryForwardFrom: "/api/vehicle-details/prefill" },
        },
        { key: "registrationNumber", label: "Registration No.", readonly: true },
        { key: "totalRunKms", label: "Total Run(km/hrs)", required: true, formOrder: 3 },
        {
          key: "presentStatus",
          label: "Present Status",
          required: true,
          formOrder: 4,
          placeholder: "Select",
          staticOptions: ["Working", "Repairing", "Condemned", "Auction"],
        },
        // Source of Funding + Repairing Cost are on the reference Add/Edit form
        // but not its list table - form-only here too.
        { key: "fundingSource", label: "Source of Funding", required: true, formOrder: 5, formOnly: true },
        {
          key: "repairingCost",
          label: "Repairing Cost",
          required: true,
          formOnly: true,
          formOrder: 6,
          showWhen: { key: "presentStatus", equals: "Repairing" },
        },
      ]),
    ]),
    group("equipments", "Equipments Information", [
      /**
       * The equipment master: Equipment Type -> Equipment Name (cascade-
       * filtered by that type, same Sector->Category pattern as FLD) -> Year
       * of Purchase -> Total Cost -> Present Status (Working / Repairing /
       * Condemned / Auction) -> Source of fund. Picking "Repairing" reveals
       * a Repairing Cost input (MasterColumn.showWhen). Same flow as View
       * Vehicles, now with its own Equipment Type field too (real bug,
       * 2026-09-12: `Equipment.equipmentType` was already a real column, and
       * the KVK report already read it - it just had no form input anywhere,
       * so it sat blank on every equipment a KVK ever entered. Equipment
       * Type Master and the Equipment Master type+name catalog were both
       * already real and populated - this was a wiring gap, not new data
       * infrastructure.
       */
      leaf(
        "view-equipments",
        "View Equipments",
        [
          { key: "kvk", label: "KVK" },
          {
            key: "equipmentType",
            label: "Equipment Type",
            required: true,
            formOrder: 1,
            placeholder: "Select",
            sourceMaster: { master: "equipment-type", optionKey: "name" },
          },
          {
            key: "equipmentName",
            label: "Equipment Name",
            formLabel: "Name of Equipment",
            required: true,
            formOrder: 2,
            placeholder: "Select",
            sourceMaster: { master: "equipment", optionKey: "name", dependsOnKey: "equipmentType", filterKey: "equipmentType" },
          },
          { key: "yearOfPurchase", label: "Year of Purchase", required: true, formOrder: 3 },
          { key: "totalCost", label: "Total Cost (Rs.)", required: true, formOrder: 4 },
          {
            key: "presentStatus",
            label: "Present Status",
            required: true,
            formOrder: 5,
            placeholder: "Select",
            staticOptions: ["Working", "Repairing", "Condemned", "Auction"],
          },
          {
            key: "repairingCost",
            label: "Repairing Cost",
            required: true,
            formOnly: true,
            formOrder: 6,
            showWhen: { key: "presentStatus", equals: "Repairing" },
          },
          { key: "sourceOfFund", label: "Source of Funding", required: true, formOrder: 7 },
        ],
        "Equipments",
      ),
      /**
       * The yearly status record for an equipment. Transcribed from the live
       * reference (atariams.org /view-equipment-details +
       * /create-equipment-details, KVK admin): the form is Reporting Year
       * (year select) -> Equipment (picked from this KVK's own Equipments
       * master) -> Present Status (fixed list), all required. Source of fund
       * is a list-only column, derived from the picked equipment
       * (`readonly` -> shown in the table, never a form input).
       */
      leaf("equipment-details", "Equipment Details", [
        {
          key: "reportingYear",
          label: "Year",
          formLabel: "Reporting Year",
          required: true,
          formOrder: 1,
          placeholder: "Select",
          staticOptions: Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - i)),
          yearsModel: "equipmentStatus",
        },
        { key: "kvk", label: "KVK" },
        {
          key: "equipmentName",
          label: "Equipment Name",
          formLabel: "Equipment",
          required: true,
          formOrder: 2,
          placeholder: "Select",
          sourceMaster: { master: "__equipment__", optionKey: "name", carryForwardFrom: "/api/equipment-details/prefill" },
        },
        { key: "sourceOfFund", label: "Source of Funding", readonly: true },
        {
          key: "presentStatus",
          label: "Present Status",
          required: true,
          formOrder: 3,
          placeholder: "Select",
          staticOptions: ["Working", "Repairing", "Condemned", "Auction"],
        },
        {
          key: "repairingCost",
          label: "Repairing Cost",
          required: true,
          formOnly: true,
          formOrder: 4,
          showWhen: { key: "presentStatus", equals: "Repairing" },
        },
      ]),
      /**
       * Removed (client direction, 2026-09-13 - "sir ne kaha hai" the whole
       * form isn't needed) - was a standalone About-KVK leaf matching the
       * live reference (atariams.org /view-implement). The Prisma model
       * (`FarmImplement`) and any real rows a KVK already entered are left
       * as-is (not dropped/deleted) - only the app's own UI/routing/report
       * wiring to it is removed here, matching how this app always treats a
       * "remove this feature" request separately from "delete this data".
       */
    ]),
  ],
  {
    description:
      "Manage KVK basic information, staff, infrastructure, vehicles, and equipments",
  },
);

/**
 * Form Management -> Achievements (13-card landing confirmed on screen).
 * "On Farm Trial" and "Front Line Demonstration" real source data (client's
 * zip, "8.ADMIN ACHIEVEMENT" folder) turned out to be complex multi-section
 * reports (a 20-category summary table plus a detailed per-crop/technology
 * breakdown with full economics), not flat tables - so both keep the generic
 * single-column view rather than guessed columns until a real simple-list
 * schema is confirmed. The FLD file (78 pages) was read in full for its
 * structure; the OFT file (18MB) could not be opened in this environment, so
 * its structure is unconfirmed but presumed parallel to FLD's.
 */
const achievements = group("achievements", "Achievements", [
  leaf(
    "technical-achievement",
    "Technical Achievement Summary",
    GENERIC_MASTER_COLUMNS,
    "Technical Achievement",
    undefined,
    undefined,
    "Technical Achievement Summary",
  ),
  /** Columns re-confirmed live against atariams.org's own "View OFT Details" table (2026-08-25): Reporting Year IS a real column here, right after S.No - the earlier AMS User Manual read had wrongly called it filter-only. */
  leaf(
    "oft",
    "OFT",
    [
      { key: "reportingYear", label: "Reporting Year" },
      { key: "kvk", label: "KVK Name", readonly: true },
      { key: "staff", label: "Staff" },
      { key: "trialOnForm", label: "Title of On Farm Trial (OFT)" },
      { key: "problemDiagnosed", label: "Problem Diagnosed" },
      { key: "status", label: "Ongoing/Completed" },
    ],
    "On Farm Trial",
    undefined,
    /** Real page H1/breadcrumb confirmed live 2026-08-15 ("project over" reference): "On Farm Trials (OFT)" - the landing-card link text stays the short "OFT" (label, above). */
    "On Farm Trials (OFT)",
  ),
  /**
   * Client direction (2026-08-25): keep this app's existing flow/structure
   * exactly as-is - only fix naming/columns to match atariams.org, don't
   * remove or restructure. Note for the record: the real Super Admin
   * sidebar's FLD section only shows "View FLD" as a child - "Extension &
   * Training activities under FLD" and "Technical Feedback on FLD" below
   * were not found there (verified live, both visually and via DOM) - kept
   * anyway per explicit instruction, not because they were re-confirmed.
   * View FLD's own columns did get a real fix: Reporting Year/Start
   * Date/End Date, confirmed present in the real table.
   */
  /** Card label confirmed live 2026-08-15 ("project over" reference): the landing card reads the short "Front Line Demonstration" (singular, no "(FLD)") - the group's own label stays the long form for the leaf breadcrumbs/tabs beneath it. */
  group("front-line-demonstration", "Front Line Demonstrations (FLD)", [
    leaf(
      "view-fld",
      "Front Line Demonstrations (FLD)",
      [
        { key: "reportingYear", label: "Reporting Year" },
        { key: "startDate", label: "Start Date", formOnly: true },
        { key: "endDate", label: "End Date", formOnly: true },
        { key: "kvk", label: "KVK", readonly: true },
        { key: "category", label: "Category" },
        { key: "subCategory", label: "Sub Category" },
        {
          key: "technologyDemonstrated",
          label: "Name of Technology Demonstrated",
        },
        { key: "status", label: "Ongoing/Completed" },
      ],
      "View FLD",
    ),
    leaf(
      "fld-extension-training",
      "Extension & Training activities under FLD",
      [
        // Not individually re-confirmed against a live reference screenshot (client direction, 2026-09-03: apply the same "every field required except Remark/Funding Agency Name-style notes" pattern every other Achievements leaf has shown) - `remark` stays optional to match that same established precedent (OFT's own Remark field, Training's own Funding Agency Name).
        /** Client direction, 2026-09-13: pick from this KVK's own real FLD names (Fld.technologyDemonstrated, via /api/fld-options) instead of free text - was letting a re-typed name drift from the actual FLD record it's meant to track. Placeholder pinned to "Select FLD" (client direction, same day) rather than the auto-generated "Select FLD Name" - matches Technical Feedback on FLD's own "FLD" field wording exactly. */
        { key: "fldName", label: "FLD Name", required: true, placeholder: "Select FLD", sourceMaster: { master: "__fld__", optionKey: "name" } },
        { key: "activity", label: "Activity", required: true },
        { key: "date", label: "Date", required: true },
        { key: "activityCount", label: "No. of Activity", required: true },
        /** Client direction, 2026-09-13: "No. of Participant" splits into real Male/Female fields, with a live "Total" preview as they're filled in - same `sumOf` calculated-field pattern as Poshan Maaha's own Total Participants. The server still independently computes and stores `participantCount` as Male + Female on every save (leaf-record-registry.ts); this is purely a live preview, never the value actually submitted. */
        { key: "participantCountMale", label: "No. of Participant (Male)", formLabel: "Male", required: true },
        { key: "participantCountFemale", label: "No. of Participant (Female)", formLabel: "Female", required: true },
        {
          key: "participantCount",
          label: "No. of Participant (Total)",
          readonly: true,
          fieldKind: "calculated",
          sumOf: ["participantCountMale", "participantCountFemale"],
          helperText: "Auto-calculated: Male + Female",
        },
        { key: "remark", label: "Remark" },
      ],
      "Extension and Training activities under FLD",
    ),
    leaf(
      "fld-technical-feedback",
      "Technical Feedback on FLD",
      [
        // Same pattern applied here as fld-extension-training above.
        { key: "fld", label: "FLD", required: true, sourceMaster: { master: "__fld__", optionKey: "name" } },
        /** Client direction, 2026-09-13: tried a Crop Master dropdown here, reverted same day - stays plain free text. */
        { key: "crop", label: "Crop", required: true },
        { key: "feedback", label: "Feedback", required: true },
      ],
      "Technical Feedback on the demonstrated technology",
    ),
  ], { cardLabel: "Front Line Demonstration" }),
  /** Columns re-confirmed live against atariams.org's own "Achievements On Training" screenshot (2026-08-24, client pointer #9) - the real table has 3 more columns than the earlier AMS User Manual pass caught: Start Date, End Date, and Training Title all sit between KVK Name and Venue; "Training Type" was never a real column, replaced by these. */
  leaf(
    "trainings",
    "Trainings",
    [
      /** Real Edit form has no manual Reporting Year input at all (audit finding, 2026-09-02 client handover zip) - server-computed from Start Date's own year (falling back to the current year when Start Date is blank, same convention OFT/FLD's own Reporting Year already defaults by), see the matching leaf-record-registry.ts entry. */
      { key: "reportingYear", label: "Reporting Year", readonly: true },
      { key: "kvk", label: "KVK Name", readonly: true },
      { key: "startDate", label: "Start Date", fieldKind: "date", formOrder: 7, required: true },
      { key: "endDate", label: "End Date", fieldKind: "date", formOrder: 8, required: true },
      /** Removed (client direction, 2026-09-13 - fully redundant with Clientele/Training Type, confirmed against real data: the same underlying category was being captured three separate ways). The Prisma column (`program`) and any value a KVK already entered are left as-is, now optional - only the app's own form/list wiring to it is removed here. */
      { key: "title", label: "Training Title", formLabel: "Title of Training", formOrder: 6, required: true },
      { key: "venue", label: "Venue", formOrder: 10, required: true },
      /** Real field, but never populated (0 of 5 seed rows) - hidden from the Edit form to match the real reference (audit finding, 2026-09-02), list column untouched. */
      { key: "trainingDiscipline", label: "Training Discipline", readonly: true },
      /**
       * Real 3-level master chain confirmed live 2026-08-15 ("project over"
       * reference): Training Type -> Training Area -> Training Thematic
       * Area (see `trainingMaster` group above). `thematicArea` already
       * existed as a plain field, now wired to the chain's real dropdown
       * instead of free text; `trainingType`/`trainingArea` are new. All
       * three are `formOnly` since the real LIST table (re-confirmed live
       * 2026-08-24, comment above) does NOT show them, only the Edit form does.
       *
       * Edit form field order re-confirmed against the reference (atari-client.vercel.app,
       * 2026-09-02 client handover zip): Clientele, Training Type, Training Area,
       * Training Thematic Area, On Campus/Off Campus, Title of Training, Start Date,
       * End Date, Course Co-ordinator, Venue, Funding Source, Funding Agency Name -
       * the array's own order (which the list table also reads) doesn't match this,
       * so `formOrder` carries the real form sequence instead of reordering the array.
       */
      { key: "trainingType", label: "Training Type", sourceMaster: { master: "training-type", optionKey: "trainingType" }, formOnly: true, formOrder: 2, required: true },
      { key: "trainingArea", label: "Training Area", sourceMaster: { master: "training-area", optionKey: "trainingAreaName", dependsOnKey: "trainingType", filterKey: "trainingType" }, formOnly: true, formOrder: 3, required: true },
      { key: "thematicArea", label: "Thematic Area", formLabel: "Training Thematic Area", sourceMaster: { master: "training-thematic-area", optionKey: "thematicArea", dependsOnKey: "trainingArea", filterKey: "trainingAreaName" }, formOrder: 4, required: true },
      /** Real dropdown added 2026-08-28 (client request) - sourced from the real Training Clientele Master, same sourceMaster pattern as every other cross-master dropdown. Venue has no equivalent master anywhere in the reference (only ever appears as a free-text field), so it stays plain text rather than guessing option values. */
      { key: "clientele", label: "Clientele", sourceMaster: { master: "training-clientele", optionKey: "clientele" }, formOrder: 1, required: true },
      { key: "onCampusOffCampus", label: "On Campus/Off Campus", staticOptions: ["On Campus", "Off Campus"], formOnly: true, formOrder: 5, required: true },
      /** Real staff dropdown (audit finding, 2026-09-02) - the reference shows this as a real "--Please Select Staff--" dropdown of the KVK's own employees, matching OFT/FLD's own Staff field, not free text. */
      { key: "courseCoordinator", label: "Course Co-ordinator", sourceMaster: { master: "__staff__", optionKey: "name" }, formOnly: true, formOrder: 9, required: true },
      { key: "fundingSource", label: "Funding Source", sourceMaster: { master: "funding-source", optionKey: "fundingSource" }, formOnly: true, formOrder: 11, required: true },
      // `required` intentionally omitted here (client direction, 2026-09-03) - matches OFT's own optional "Funding Agency Name" field, the one established precedent for a not-required field in this whole "everything else is required" pattern.
      { key: "fundingAgencyName", label: "Funding Agency Name", formOnly: true, formOrder: 12 },
      { key: "farmersDetails", label: "Farmers Details", fieldKind: "demographic-breakdown", demographicVariant: "grid", formOnly: true },
      /** Real end-of-form Upload Photograph(s)+Caption section (client PDF, "Module Image workflow", 2026-09-02) - feeds Module Images automatically, pilot leaf. */
      { key: "moduleImages", label: "Photographs", fieldKind: "photos", formOnly: true },
    ],
    "Training",
  ),
  /** Columns re-confirmed live against atariams.org's own "Extension programmes" / "Other Extension Activity" screenshots (2026-08-24, client pointer #10) - both real tables lead with Reporting Year, and Extension Activities also carries Start/End Date; the earlier AMS User Manual pass had missed all three. */
  group("extension", "Extension", [
    leaf("extension-activities", "Extension Activities", [
      /** Real Edit form (audit finding, 2026-09-02) has no manual Reporting Year or No. of Participants input at all - both are server-computed (Reporting Year from Start Date's own year, No. of Participants from the Farmers+Officials totals below, same real precedent as Technology Week Celebration's own numberOfParticipants) - see the matching leaf-record-registry.ts entry. */
      { key: "reportingYear", label: "Reporting Year", readonly: true },
      { key: "kvk", label: "KVK", readonly: true },
      { key: "startDate", label: "Start Date", fieldKind: "date", formOrder: 4, required: true },
      { key: "endDate", label: "End Date", fieldKind: "date", formOrder: 5, required: true },
      /** Real dropdown (client request, 2026-08-28) - sourced from the real Extension Activity Master, same sourceMaster pattern as every other cross-master dropdown. List column header reads "Name of Extension Activities" but the real Edit form's own field label is "Nature of Extension Activity" (audit finding, 2026-09-02 - two different real labels for the same field, same list/form split as `formLabel` handles elsewhere). */
      {
        key: "natureOfExtensionActivity",
        label: "Name of Extension Activities",
        formLabel: "Nature of Extension Activity",
        sourceMaster: { master: "extension-activity", optionKey: "activityName" },
        formOrder: 2,
        required: true,
      },
      { key: "noOfActivities", label: "No. of Activities", formOrder: 3, required: true },
      { key: "noOfParticipants", label: "No. of Participants", readonly: true },
      /** Real Edit form fields confirmed live 2026-08-15 ("project over" reference, "Edit Extension Activities") - two independent demographic blocks (Farmers + Extension Officials), both previously entirely missing. `staff` is a real KVK-staff dropdown (audit finding, 2026-09-02 - matches OFT/FLD's own Staff field, was plain text before), not free text. Both blocks use the real flat grid+badges layout (demographicVariant: "grid", re-confirmed live 2026-09-02 against the reference recording - was wrongly rendering as the General/OBC/SC/ST table before, same bug as Training/FLD's own Farmers Details). Real Edit form field order re-confirmed against the reference (atari-client.vercel.app, 2026-09-02 client handover zip): Name of SMS/KVK Head, Nature of Extension Activity | No. of activities (alone) | Start Date, End Date - `formOrder` carries this since the array's own order (which the list table also reads) doesn't match it. */
      { key: "staff", label: "Name of SMS/KVK Head", sourceMaster: { master: "__staff__", optionKey: "name" }, formOnly: true, formOrder: 1, required: true },
      { key: "farmersDetails", label: "Farmers", fieldKind: "demographic-breakdown", demographicPrefix: "farmers", demographicVariant: "grid", formOnly: true },
      { key: "extensionOfficials", label: "Extension Officials", fieldKind: "demographic-breakdown", demographicPrefix: "officials", demographicVariant: "grid", formOnly: true },
      /** Real end-of-form Upload Photograph(s)+Caption section (client PDF, "Module Image workflow", 2026-09-02) - feeds Module Images automatically, pilot leaf. */
      { key: "moduleImages", label: "Photographs", fieldKind: "photos", formOnly: true },
    ]),
    leaf("other-extension-activities", "Other Extension Activities", [
      /** Real Edit form has no manual Reporting Year input at all (audit finding, 2026-09-02 client handover zip) - server-computed from Start Date's own year (falling back to the current year when Start Date is blank), see the matching leaf-record-registry.ts entry. */
      { key: "reportingYear", label: "Reporting Year", readonly: true },
      { key: "kvk", label: "KVK Name", readonly: true },
      {
        key: "natureOfExtensionActivity",
        label: "Nature of Extension Activity",
        sourceMaster: { master: "other-extension-activity", optionKey: "activityName" },
        formOrder: 2,
        required: true,
      },
      { key: "noOfActivities", label: "No. of Activities", formOrder: 3, required: true },
      /** Real Edit form fields confirmed live 2026-08-15 ("Edit Other Extension Activities") - were entirely missing before this. `staff` is a real KVK-staff dropdown (audit finding, 2026-09-02), not free text. Real Edit form field order re-confirmed against the reference (atari-client.vercel.app, 2026-09-02 client handover zip): Name of SMS/KVK Head, Nature of Extension Activity | No. of activities (alone) | Start Date, End Date. */
      { key: "staff", label: "Name of SMS/KVK Head", sourceMaster: { master: "__staff__", optionKey: "name" }, formOnly: true, formOrder: 1, required: true },
      { key: "startDate", label: "Start Date", formOnly: true, fieldKind: "date", required: true },
      { key: "endDate", label: "End Date", formOnly: true, fieldKind: "date", required: true },
    ]),
  ]),
  group("special-days", "Special Days", [
    /** Columns re-confirmed live against atariams.org's own "View Technology Week Celebration" screenshot (2026-08-24, client pointer #11): the real table DOES carry Start Date and End Date after all - the earlier AMS User Manual read missed them. */
    leaf("technology-week-celebration", "Technology Week Celebration", [
      { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
      { key: "endDate", label: "End Date", fieldKind: "date", required: true },
      { key: "kvk", label: "KVK", readonly: true },
      { key: "typeOfActivities", label: "Type of Activities", required: true },
      { key: "noOfActivities", label: "No. of Activities", required: true },
      {
        key: "relatedCropTechnology",
        label: "Related Crop/Livestock Technology",
        required: true,
      },
      /** Server-computed from the Farmers Details breakdown below, never a real form input - the real Edit form has no separate "Number of Participants" field. */
      { key: "numberOfParticipants", label: "Number of Participants", readonly: true },
      { key: "farmersDetails", label: "Farmers Details", fieldKind: "demographic-breakdown", demographicVariant: "grid", formOnly: true },
    ]),
    /** Real sidebar label confirmed live: "Celebration of important days", not "Celebration Days". */
    leaf("celebration-days", "Celebration of important days", [
      { key: "kvk", label: "KVK", readonly: true },
      /** Client pointer, 2026-09-15: "Event Date" replaced by a real Start/End Date pair (same convention as Extension Activities/Technology Week Celebration above). */
      { key: "startDate", label: "Start Date", fieldKind: "date", formOrder: 1, required: true },
      { key: "endDate", label: "End Date", fieldKind: "date", formOrder: 2, required: true },
      { key: "importantDay", label: "Important Days", sourceMaster: { master: "important-day", optionKey: "name" }, formOrder: 3, required: true },
      { key: "noOfActivities", label: "No of Activities", formOrder: 4, required: true },
      /** Real Edit form fields confirmed live 2026-08-15 ("Edit Celebration Days") - same two-block shape as Extension Activities above, were entirely missing before this. Both blocks use the real flat grid+badges layout (demographicVariant: "grid", re-confirmed live 2026-09-02). */
      { key: "farmersDetails", label: "Farmers", fieldKind: "demographic-breakdown", demographicPrefix: "farmers", demographicVariant: "grid", formOnly: true },
      { key: "extensionOfficials", label: "Extension Officials", fieldKind: "demographic-breakdown", demographicPrefix: "officials", demographicVariant: "grid", formOnly: true },
      /** Client pointer, 2026-09-15: third beneficiary category, same breakdown shape as the two blocks above, plus a combined Name/Designation/Address field (same single-field convention as Dignitaries Visited NICRA Villages' own `name`). */
      { key: "vipDetails", label: "Public Representative/Other VIPs/Dignitaries/Government Officials", fieldKind: "demographic-breakdown", demographicPrefix: "vip", demographicVariant: "grid", formOnly: true },
      { key: "vipNameDesignationAddress", label: "Public Representative/VIP - Name, Designation & Address", placeholder: "e.g. Shri Ramesh Kumar, District Magistrate, Collectorate, Patna, Bihar" },
    ]),
    /**
     * Moved back in here from the separate "Soil and Water Testing" group
     * (client reference screenshot, 2026-08-31: the real Special Days tab
     * bar shows 4 tabs - Technology week celebration, Celebration of
     * important days, Details of World Soil Day Celebration, Poshan Maaha,
     * in that order) - label matches that tab text exactly, not the
     * shorter "World Soil Day" it used to carry.
     */
    leaf("world-soil-day", "Details of World Soil Day Celebration", [
      { key: "kvk", label: "KVK Name", readonly: true },
      /** Real field confirmed live 2026-08-15 - was entirely missing before this. Renders as a real date picker in the reference despite the "Year" name (audit finding, 2026-09-02). */
      { key: "reportingYear", label: "Reporting Year", fieldKind: "date", formOrder: 1 },
      {
        key: "noOfActivitiesConducted",
        label: "No. of Activity Conducted",
        formOrder: 2,
      },
      {
        key: "soilHealthCardsDistributed",
        label: "Soil Health Cards Distributed",
        formOrder: 3,
      },
      /** Real Edit form has no separate "No of VIP" input at all (audit finding, 2026-09-02 client handover zip - only Name(s) of VIP(s) Involved if Any is real) - server-computed from the comma-separated count in vipNames instead, see the matching leaf-record-registry.ts entry. */
      { key: "noOfVip", label: "No of VIP", readonly: true },
      { key: "vipNames", label: "Name(s) of VIP(s) Involved if Any", formOrder: 4 },
      {
        key: "totalParticipants",
        label: "Total No. of Participants Attended the Programme",
        // Shortened form-only label (client report, 2026-09-03) - the full
        // label wrapped to 2 lines in its ~320px grid track, pushing its own
        // input down out of alignment with "Name(s) of VIP(s)..." beside it.
        // List table header keeps the full text via `label` above.
        formLabel: "Total No. of Participants Attended",
        formOrder: 5,
        ...BENEFICIARY_TOTAL,
      },
      { key: "farmersDetails", label: "Farmers Details", fieldKind: "demographic-breakdown", demographicVariant: "grid", formOnly: true },
    ]),
    /** Real columns confirmed live, extended 2026-08-24 with the participant breakdown from the client's own Poshan Maah reporting sheet. */
    /**
     * Field labels, order, and eventName's real field type re-confirmed
     * against the reference (atari-client.vercel.app, 2026-09-02 client
     * handover zip): Datewise activity (date), Name of Event/Programme |
     * No. of activities conducted, No. of saplings planted | No. of
     * vegetable kits distributed (alone) | [No. of participants] Girls,
     * Farm Woman, Farmers, Anganwadi Workers, Govt Officials, Public
     * Representatives | Total Participants (auto-calculated, disabled).
     * eventName renders as a real free-text field there (typed test value
     * visible), not a master dropdown - no confirmed real master backs it,
     * so it's plain text now rather than a guessed option list.
     */
    leaf("poshan-maaha", "Poshan Maaha", [
      { key: "kvk", label: "KVK", readonly: true },
      { key: "activityDate", label: "Activity Date", formLabel: "Datewise activity (date)", fieldKind: "date", formOrder: 1 },
      { key: "activitiesConducted", label: "Activities Conducted", formLabel: "No. of activities conducted", formOrder: 3, numeric: false },
      { key: "eventName", label: "Event Name", formLabel: "Name of Event/Programme", formOrder: 2 },
      { key: "saplingsPlanted", label: "Saplings Planted", formLabel: "No. of saplings planted", formOrder: 4 },
      { key: "vegetableKits", label: "Vegetable Kits", formLabel: "No. of vegetable kits distributed", formOrder: 5 },
      /** Real section break the reference shows above the participant fields (confirmed live, 2026-09-03) - was missing entirely before (client report: card sub-headings missing/too small in several places), so the six fields below read as an undifferentiated continuation of the fields above. */
      { key: "participantsSectionHeading", label: "No. of participants", fieldKind: "section-heading", formOnly: true, formOrder: 6 },
      { key: "participantsGirls", label: "Participants - Girls", formLabel: "Girls", formOrder: 7 },
      { key: "participantsFarmWoman", label: "Participants - Farm Woman", formLabel: "Farm Woman", formOrder: 8 },
      { key: "participantsFarmers", label: "Participants - Farmers", formLabel: "Farmers", formOrder: 9 },
      {
        key: "participantsAganwadiWorkers",
        label: "Participants - Aganwadi Workers",
        formLabel: "Anganwadi Workers",
        formOrder: 10,
      },
      {
        key: "participantsGovtOfficials",
        label: "Participants - Govt Officials",
        formLabel: "Govt Officials",
        formOrder: 11,
      },
      {
        key: "participantsPublicRepresentatives",
        label: "Participants - Public Representatives",
        formLabel: "Public Representatives",
        formOrder: 12,
      },
      /** Real field is a disabled, auto-calculated readout ("Auto-calculated: sum of all participant categories"), never a real user input - server-computed the same way, see the matching leaf-record-registry.ts entry. `readonly` still set so required-field validation and the list table keep treating it as before; `fieldKind: "calculated"` is what actually makes it render (disabled, with its value) instead of being dropped from the form the way a plain `readonly` column is. `sumOf` makes it a live preview while filling the form, not just after save (client-reported bug, 2026-09-13). */
      {
        key: "totalParticipants",
        label: "Total Participants",
        readonly: true,
        fieldKind: "calculated",
        sumOf: [
          "participantsGirls",
          "participantsFarmWoman",
          "participantsFarmers",
          "participantsAganwadiWorkers",
          "participantsGovtOfficials",
          "participantsPublicRepresentatives",
        ],
        helperText: "Auto-calculated: sum of all participant categories",
        formOrder: 13,
      },
    ]),
  ]),
  /**
   * Real location confirmed via atari-photo-zip/IMG-20260817-WA0030.jpg: reached
   * from the Achievements page (sidebar highlights "Achievements" as active), not
   * from Projects. Our URL nests it under achievements/ for a consistent
   * breadcrumb; the real app's own URL is flatter (/forms/swachhta-bharat-
   * abhiyaan/sewa), an apparent routing quirk in the reference app itself.
   */
  group("swachhta-bharat-abhiyaan", "Swachhta Bharat Abhiyaan", [
    leaf(
      "sewa",
      "Swachhta hi Sewa",
      [
        { key: "kvk", label: "KVK", readonly: true },
        /** Client direction, 2026-09-13: the old single "Date Duration of Observation" field replaced with a real From/To range - see SwachhtaObservance.fromDate/toDate's own schema comment (the legacy dateDurationOfObservation column stays, just unused by the form now). `toDate` picks up the automatic end-date-after-start-date `min` for free (master-form-fields.tsx's isEndDateColumn/startDateValue already key off exactly this "fromDate"/"toDate" naming). */
        { key: "fromDate", label: "From Date", formLabel: "From Date", fieldKind: "date", required: true },
        { key: "toDate", label: "To Date", formLabel: "To Date", fieldKind: "date", required: true },
        {
          key: "totalNoOfActivitiesUndertaken",
          label: "Total No of Activities Undertaken",
          formLabel: "Total No of Activities undertaken",
        },
        // Real section heading the reference shows above Staffs/Farmers/Others (confirmed live, 2026-09-03) - was missing entirely before, and the form-only field labels below were shortened to match the reference's own bare "Staffs"/"Farmers"/"Others" now that the heading itself carries the "No. of Participants" context (list table keeps the fuller "No of Staffs"/"No of Farmers" via `label`).
        { key: "participantsSectionHeading", label: "No. of Participants", fieldKind: "section-heading", formOnly: true },
        { key: "noOfStaffs", label: "No of Staffs", formLabel: "Staffs" },
        { key: "noOfFarmers", label: "No of Farmers", formLabel: "Farmers" },
        /** Real field confirmed against the reference (atari-client.vercel.app, 2026-09-02) - "No. of Participants" has a third Others field alongside Staffs/Farmers, missing entirely before. */
        { key: "noOfOthers", label: "No of Others", formLabel: "Others", formOnly: true },
        /** Client-reported bug, 2026-09-13: no live "Total" while filling the form (same gap as Poshan Maaha's own Total Participants, fixed the same way) - the PDF report already computes this total on the fly (buildSwachhtaByKind), so this is a live preview only, not a new stored column. */
        {
          key: "totalParticipants",
          label: "Total Participants",
          readonly: true,
          fieldKind: "calculated",
          sumOf: ["noOfStaffs", "noOfFarmers", "noOfOthers"],
          helperText: "Auto-calculated: sum of all participant categories",
          formOnly: true,
        },
      ],
      "Observation of Swachhta hi Sewa SBA",
    ),
    /** Same shape as Sewa, confirmed 2026-08-22 - this leaf previously had no real columns. */
    leaf(
      "pakhwada",
      "Swachta Pakhwada",
      [
        { key: "kvk", label: "KVK", readonly: true },
        /** Same From/To range replacement as Sewa above, same day/direction. */
        { key: "fromDate", label: "From Date", formLabel: "From Date", fieldKind: "date", required: true },
        { key: "toDate", label: "To Date", formLabel: "To Date", fieldKind: "date", required: true },
        {
          key: "totalNoOfActivitiesUndertaken",
          label: "Total No of Activities Undertaken",
          formLabel: "Total No of Activities undertaken",
        },
        // Same missing section heading as Sewa above (confirmed live, 2026-09-03) - see that leaf's matching comment.
        { key: "participantsSectionHeading", label: "No. of Participants", fieldKind: "section-heading", formOnly: true },
        { key: "noOfStaffs", label: "No of Staffs", formLabel: "Staffs" },
        { key: "noOfFarmers", label: "No of Farmers", formLabel: "Farmers" },
        /** Real field confirmed against the reference (atari-client.vercel.app, 2026-09-02) - same "Others" gap as Sewa. */
        { key: "noOfOthers", label: "No of Others", formLabel: "Others", formOnly: true },
        /** Same live-Total fix as Sewa above, same day/direction. */
        {
          key: "totalParticipants",
          label: "Total Participants",
          readonly: true,
          fieldKind: "calculated",
          sumOf: ["noOfStaffs", "noOfFarmers", "noOfOthers"],
          helperText: "Auto-calculated: sum of all participant categories",
          formOnly: true,
        },
      ],
      "Observation of Swachta Pakhwada",
    ),
    /**
     * Real full shape confirmed against the reference (atari-client.vercel.app,
     * 2026-09-02) - a second "Other than vermicomposting activities under
     * Swachata" section (its own No of Village Covered/Total Expenditure
     * pair) was missing entirely before; the earlier comment here ("more
     * vermicomposting-style pairs follow off-screen") is now resolved.
     */
    leaf(
      "budget-expenditure",
      "Budget expenditure",
      [
        { key: "kvk", label: "KVK", readonly: true },
        /** Client direction, 2026-09-13: this rendered as a full calendar date-picker (fieldKind: "date") even though the underlying column is a plain year Int - genuinely inconsistent with every other "Reporting Year" field in the app, which is a year-only dropdown. Same staticOptions + real-years-merge pattern as Vehicle/Equipment Details' own Reporting Year (master-form-fields.tsx's own Reporting Year mechanism keys off exactly this - `key === "reportingYear" && staticOptions`), scoped to this leaf's own model via `yearsModel` so it never offers a year only some unrelated leaf actually has. */
        { key: "reportingYear", label: "Reporting Year", placeholder: "Select", staticOptions: Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - i)), yearsModel: "swachhtaBudgetExpenditure" },
        // Real section headings the reference shows above each pair (confirmed live, 2026-09-03) - were missing entirely before, so both pairs read as one undifferentiated block; each pair's own field labels were shortened to the reference's own bare "No of village covered"/"Total Expenditure(Rs.in Lakhs)" now that the heading carries which section they belong to (list table keeps the fuller "Vermicomposting ..."/"Other than Vermicomposting ..." via `label`).
        { key: "vermicompostingSectionHeading", label: "Vermicomposting", fieldKind: "section-heading", formOnly: true },
        {
          key: "vermicompostingVillagesCovered",
          label: "Vermicomposting No of Village Covered",
          formLabel: "No of village covered",
          numeric: true,
        },
        {
          key: "vermicompostingTotalExpenditure",
          label: "Vermicomposting Total Expenditure",
          formLabel: "Total Expenditure(Rs.in Lakhs)",
        },
        {
          key: "otherSectionHeading",
          label: "Other than vermicomposting activities under Swachata",
          fieldKind: "section-heading",
          formOnly: true,
        },
        {
          key: "otherVillagesCovered",
          label: "Other than Vermicomposting No of Village Covered",
          formLabel: "No of village covered",
          formOnly: true,
        },
        {
          key: "otherTotalExpenditure",
          label: "Other than Vermicomposting Total Expenditure",
          formLabel: "Total Expenditure(Rs.in Lakhs)",
          formOnly: true,
        },
      ],
      "Details of quarterly budget expenditure on Swachh activities including SAP",
    ),
  ]),
  /** Re-confirmed live 2026-08-24 against atariams.org: Reporting Year is a filter there, not a column - the earlier version wrongly included it as one. Edit form fields extended 2026-09-01 against the reference (atari-client.vercel.app, 2026-08-15 screenshots) - Reporting Date, the real Product Category -> Product Type -> Product cascade, Unit, Value, and Farmers Details were missing entirely (real schema gaps, now added). */
  leaf(
    "production-supply",
    "Production and supply of Technological products",
    [
      { key: "kvk", label: "KVK", readonly: true },
      /** Server-computed from Reporting Date's own year (client screenshot, 2026-09-13: the real reference's own list table has this column) - same "readonly, no form input" precedent as Trainings/Extension Activities' own Reporting Year. */
      { key: "reportingYear", label: "Reporting Year", readonly: true },
      { key: "reportingDate", label: "Reporting Date", formOnly: true, fieldKind: "date", formOrder: 1, required: true },
      /** List header "Category" (client screenshot, 2026-09-13 - the real reference's own list column) - formLabel keeps the form's own clearer "Product Category" wording. */
      { key: "productCategory", label: "Category", formLabel: "Product Category", sourceMaster: { master: "product-category", optionKey: "name" }, formOrder: 2, required: true },
      { key: "productType", label: "Product Type", sourceMaster: { master: "product-type", optionKey: "productCategoryType", dependsOnKey: "productCategory", filterKey: "productCategoryName" }, formOnly: true, formOrder: 3, required: true },
      /** Carries the picked product's own real Unit forward into the "unit" field below (client direction, 2026-09-13 - "Unit auto fetch karega") via /api/production-supply/prefill, same carryForwardFrom mechanism Equipment Details' own Equipment field already uses. */
      { key: "product", label: "Product", sourceMaster: { master: "products", optionKey: "productName", dependsOnKey: "productType", filterKey: "productCategoryType", carryForwardFrom: "/api/production-supply/prefill" }, formOnly: true, formOrder: 4, required: true },
      /**
       * "Category" removed from the form (client direction, 2026-09-13 -
       * never a real reference field, just leftover seed data) - replaced by
       * "Provided to number of farmers" below. Column kept, now optional, so
       * any value a KVK already entered stays untouched.
       */
      /** Field order re-confirmed against the reference (atari-client.vercel.app, 2026-09-02 client handover zip): Reporting Date, Product Category | Product Type, Product | Species/Breed/Variety alone, with Unit + Quantity paired together in the next cell (not each pairing with an unrelated neighbour) | Value(Rs) alone. Unit/Quantity confirmed NOT required (no asterisk live, 2026-09-03) unlike every other field here. */
      { key: "variety", label: "Variety", formLabel: "Species/Breed/Variety", formOrder: 5, required: true },
      { key: "unit", label: "Unit", formOnly: true, formOrder: 6, pairWithNext: true },
      { key: "quantity", label: "Quantity", formOrder: 7 },
      { key: "value", label: "Value (Rs)", formOnly: true, formOrder: 8, required: true },
      /**
       * Sell/Supply (client direction, 2026-09-13: "sell/supply production
       * ke andar hi banega", its own heading with its own auto-fetched Unit)
       * - not a separate leaf, a real section right inside this same
       * Production form, simply mirroring the produced Quantity above with
       * how much of it was actually sold/supplied. "Provided to Number of
       * Farmers" was tried and dropped same-day (client direction: "top
       * shows how much was produced, below just shows how much was
       * supplied, simple" - a farmer headcount didn't belong here, Farmers
       * Details below already covers who it went to). Replaces the removed
       * "Category" field and the reference's own "Sell and Supply" concept.
       */
      { key: "sellSupplyHeading", label: "Sell / Supply", fieldKind: "section-heading", formOnly: true, formOrder: 9 },
      { key: "supplyUnit", label: "Unit", formOnly: true, formOrder: 10, pairWithNext: true },
      /** formOnly (client direction, 2026-09-13) - the real reference's own list table doesn't show this as a column, only Quantity (produced), same as Value (Rs) above. */
      { key: "quantitySupplied", label: "Quantity Sold/Supplied", formLabel: "Sold/Supplied", formOnly: true, formOrder: 11 },
      { key: "supplyValue", label: "Value (Rs)", formOnly: true, formOrder: 12 },
      { key: "farmersDetails", label: "Farmers Details", fieldKind: "demographic-breakdown", demographicVariant: "grid", formOnly: true },
    ],
    "Production & Supply of Technological Products",
  ),
  /**
   * "Soil and Water Testing" is its own section confirmed live against
   * atariams.org, with just the one Soil/Water/Plant analysis leaf below -
   * client direction, 2026-09-03: the "Equipment Details" (soil-testing-
   * equipment) leaf this group used to also carry doesn't exist on the real
   * reference at all and was removed entirely, not just hidden. World Soil
   * Day Celebration used to be modeled here too, but a fresh reference
   * screenshot (2026-08-31) shows the real Special Days tab bar itself
   * carries 4 tabs including it - moved back into the `special-days` group
   * below (see the comment there) as the earlier "moved out to match what's
   * actually live" conclusion no longer holds against this newer evidence.
   */
  group("soil-water", "Soil and Water Testing", [
    /** atariams.org "Equipment Details" leaf (/soil-water-testing/equipment-details) - list + Add form read live 2026-09-04. Slug avoids colliding with About KVK's own "equipment-details". */
    leaf(
      "soil-testing-equipment",
      "Equipment Details",
      [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "reportingYear", label: "Reporting Year", required: true },
        {
          key: "analysis",
          label: "Analysis",
          staticOptions: ["Soil", "Water", "Plant", "Fertilizers", "Manures", "Food", "Others (if any)"],
          required: true,
        },
        { key: "equipmentName", label: "Name of the Equipment", required: true },
        { key: "quantity", label: "Qty.", required: true },
      ],
      "Soil Testing Equipment Details",
    ),
    leaf(
      "soil-water-testing",
      "Soil, Water and Plant analysis",
      [
        { key: "kvk", label: "KVK Name", readonly: true },
        // Real card intro heading "Detail of Soil, Water and Plant analysis at KVK" the reference shows above these fields on both Add and Edit (confirmed live, 2026-09-03) - was missing entirely.
        {
          key: "formIntroHeading",
          label: "Detail of Soil, Water and Plant analysis at KVK",
          fieldKind: "section-heading",
          formOnly: true,
          formOrder: 0,
        },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "analysis", label: "Analysis", sourceMaster: { master: "soil-water", optionKey: "name" }, required: true },
        /** Real field confirmed against the reference (atari-client.vercel.app, 2026-08-15 screenshots) - "Samples analyzed Through" (e.g. "Mini soil testing kit") - no matching master anywhere in the app, stays plain text rather than guessing option values. */
        { key: "samplesAnalyzedThrough", label: "Samples analyzed Through", formOnly: true, required: true },
        { key: "noOfSamplesAnalyzed", label: "No. of Samples Analyzed", required: true },
        /** Real form label is just "No. of Villages" (audit finding, 2026-09-02), not "No. of Villages Covered". */
        { key: "noOfVillagesCovered", label: "No. of Villages", required: true },
        { key: "amountRealized", label: "Amount Realized (Rs.)", required: true },
        { key: "farmersDetails", label: "Farmers Details", fieldKind: "demographic-breakdown", demographicVariant: "grid", formOnly: true },
      ],
      "Detail of Soil, Water and Plant Analysis",
    ),
  ]),
  /**
   * Real table has only 5 named columns - Author Type/Naas Rating/ISBN
   * Number were never real, removed. Publication Item and Year are filters
   * there, not columns. Heading changed to "KVKs Publication Details"
   * (client direction, 2026-08-31) - overrides the earlier "Publication
   * List" H1 reading, which only ever matched the landing-page card label,
   * not the leaf's own list-page heading.
   */
  leaf("publications", "KVKs Publication Details", [
    { key: "kvk", label: "KVK Name", readonly: true },
    // Real card intro heading "Add Publication" the reference shows above these fields on both Add and Edit (confirmed live, 2026-09-03) - was missing entirely, and every field below is required (also missing its own asterisk before now).
    { key: "formIntroHeading", label: "Add Publication", fieldKind: "section-heading", formOnly: true, formOrder: 0 },
    { key: "reportingDate", label: "Year", formOnly: true, fieldKind: "date", required: true },
    /** Form label is "Publication" on the real Add/Edit form (audit finding, 2026-09-02), distinct from the list column's own "Item Name" heading. */
    { key: "itemName", label: "Item Name", formLabel: "Publication", sourceMaster: { master: "publication-items", optionKey: "itemName" }, required: true },
    { key: "title", label: "Title", required: true },
    { key: "authorName", label: "Author Name", required: true },
    /** Real form label is "Name Of Publisher" (audit finding, 2026-09-02), not "Journal Name" - same underlying field, corrected label only. */
    { key: "journalName", label: "Name Of Publisher", required: true },
    /** Report 2.10.A prints item-type-specific columns - Publisher Name + ISBN for book chapters, Page Number + NAAS Rating for research papers (added 2026-09-03). */
    { key: "publisherName", label: "Publisher Name" },
    { key: "isbnNumber", label: "ISBN Number", numeric: false },
    { key: "pageNumber", label: "Page Number", numeric: false },
    { key: "naasRating", label: "NAAS Rating" },
  ]),
  /** 6 real columns confirmed 2026-08-22. Real H1 is hyphenated and singular; the landing card uses the longer plural form. */
  leaf(
    "hrd",
    "Human-Resource Development",
    [
      { key: "kvk", label: "KVK", readonly: true },
      // Real card intro heading "Add HRD Program" the reference shows above these fields on both Add and Edit (confirmed live, 2026-09-03) - was missing entirely, and every field below is required (also missing its own asterisk before now).
      { key: "formIntroHeading", label: "Add HRD Program", fieldKind: "section-heading", formOnly: true, formOrder: 0 },
      /** Real staff dropdown (audit finding, 2026-09-02) - the reference shows a real "--Please Select Staff--" dropdown of the KVK's own staff, not free text - same gap as Training/Extension Activities/Scientist Award. */
      { key: "staff", label: "Staff", formLabel: "Name of Staff", sourceMaster: { master: "__staff__", optionKey: "name" }, required: true },
      /** Real form label is "Course Name" (audit finding, 2026-09-02), not "Course". */
      { key: "course", label: "Course Name", required: true },
      { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
      { key: "endDate", label: "End Date", fieldKind: "date", required: true },
      { key: "organizer", label: "Organizer", required: true },
      { key: "venue", label: "Venue", required: true },
    ],
    "Human Resources Development",
  ),
  /**
   * All three tabs re-confirmed against the reference - the earlier
   * "award name / awarding body / year / recipient" shape was a reasonable
   * guess but wrong in every column. Real tables all lead with KVK +
   * Reporting Year. Each has a horizontal scrollbar,
   * so further columns exist (the edit forms carry Achievement and
   * Conferring Authority) - those stay undeclared rather than guessed.
   */
  /** Columns confirmed against the client's own "View Award" screenshots for KVK/Scientist/Farmer (AMS User Manual p.82-84). Reporting Year is a filter there, not a column. */
  group("awards", "Award and Recognition", [
    leaf(
      "kvk",
      "Awards (KVK)",
      [
        { key: "kvk", label: "KVK Name", readonly: true },
        // Real card intro heading the reference shows above these fields on both Add and Edit (confirmed live, 2026-09-03) - was missing entirely, and every field below is required (also missing its own asterisk before now).
        { key: "formIntroHeading", label: "Institutional Award received by KVK", fieldKind: "section-heading", formOnly: true, formOrder: 0 },
        { key: "reportingDate", label: "Reporting Date", formOnly: true, fieldKind: "date", required: true },
        { key: "award", label: "Award", formLabel: "Name of the Award", required: true },
        { key: "amount", label: "Amount", required: true },
        { key: "achievement", label: "Achievement", required: true, numeric: false },
        { key: "conferringAuthority", label: "Conferring Authority", required: true },
      ],
      "KVK",
    ),
    leaf("scientist", "Scientist", [
      { key: "kvk", label: "KVK Name", readonly: true },
      // Same missing intro heading as Awards (KVK) above (confirmed live, 2026-09-03).
      { key: "formIntroHeading", label: "Recognition received by Head/Scientist", fieldKind: "section-heading", formOnly: true, formOrder: 0 },
      { key: "reportingDate", label: "Reporting Date", formOnly: true, fieldKind: "date", required: true },
      /** Real staff dropdown (audit finding, 2026-09-02) - the reference shows a real "--Please Select Scientist--" dropdown of the KVK's own staff, not free text. Restricted to SMS/Head only (client direction, 2026-09-13) - same reasoning as OFT's/FLD's own "Name of SMS/KVK Head". */
      { key: "headScientist", label: "Scientist", formLabel: "Head/Scientist", sourceMaster: { master: "__staff_sms_head__", optionKey: "name" }, required: true },
      { key: "award", label: "Award", formLabel: "Name of the Award", required: true },
      { key: "amount", label: "Amount", required: true },
      { key: "achievement", label: "Achievement", required: true, numeric: false },
      { key: "conferringAuthority", label: "Conferring Authority", required: true },
    ]),
    /** Edit form field order re-confirmed against the reference (atari-client.vercel.app, 2026-09-02 client handover zip): Reporting Date, Name of the Award | Name of the Farmer, Address | Contact No., Amount | Achievement, Conferring Authority. */
    leaf("farmer", "Farmer", [
      { key: "kvk", label: "KVK Name", readonly: true },
      // Same missing intro heading as Awards (KVK)/Scientist above (confirmed live, 2026-09-03).
      { key: "formIntroHeading", label: "Recognition received by Farmers", fieldKind: "section-heading", formOnly: true, formOrder: 0 },
      { key: "reportingDate", label: "Reporting Date", formOnly: true, fieldKind: "date", formOrder: 1, required: true },
      { key: "farmerName", label: "Farmer Name", formLabel: "Name of the Farmer", formOrder: 3, required: true },
      { key: "address", label: "Address", formOrder: 4, required: true },
      { key: "contactNumber", label: "Contact No.", formOrder: 5, required: true },
      { key: "award", label: "Award", formLabel: "Name of the Award", formOrder: 2, required: true },
      { key: "amount", label: "Amount", formOrder: 6, required: true },
      { key: "achievement", label: "Achievement", formOrder: 7, required: true, numeric: false },
      { key: "conferringAuthority", label: "Conferring Authority", formOrder: 8, required: true },
      /** Real field, confirmed missing entirely before (atari-client.vercel.app, 2026-09-02) - a real multi-file upload ("Hold Ctrl/Cmd in the file picker to select multiple"), not single. */
      { key: "moduleImages", label: "Photographs", fieldKind: "photos", formOnly: true },
    ]),
  ]),
  ],
  {
    description:
      "Manage technical achievements, OFT, FLD, trainings, extension activities, projects, and awards",
  },
);

/**
 * Form Management -> Projects.
 *
 * Real card grid confirmed directly from a the reference of this exact
 * page (client's zip, "Projects form/the reference 2026-08-13 145837.png"): CFLD,
 * NICRA, and NICRA Others cards were fully visible with their card->leaf
 * pairing; ARYA/SAFAL, Natural Farming and TSP/SCSP cards were visible in the
 * grid but the reference was scrolled before their leaf links appeared, and
 * more cards exist further down that were never captured in any reference -
 * so those five groups below keep the leaf structure from the earlier
 * video/the reference pass (not re-confirmed this round) rather than guessing
 * new ones. Swachhta Bharat Abhiyaan was removed from here - the real app
 * reaches it from the Achievements page, not Projects (see `achievements`
 * above).
 */
const projects = group(
  "projects",
  "Projects",
  [
    group("cfld", "CFLD", [
      /**
       * Columns confirmed against the client's own live atariams.org
       * "Technical Parameters of CFLD" screenshot (2026-08-24, full-width,
       * real rows with an Ongoing/Completed status badge matching this
       * app's own OFT/FLD badge colours) - supersedes an earlier merge from
       * two lower-confidence sources that had added "Existing Variety
       * Name"/"Existing Yield" as list columns; those belong on the Add
       * form only (already present there), not this list. Reporting Year
       * appears here as its own real column - a genuine exception to how
       * every other Reporting-Year-filtered list in this app works.
       */
      leaf("technical-parameter", "Technical Parameter", [
        { key: "reportingYear", label: "Reporting Year" },
        { key: "kvk", label: "KVK Name" },
        { key: "crop", label: "Crop" },
        { key: "technologyDemonstrated", label: "Technology Demonstrated" },
        { key: "areaHa", label: "Area (ha)" },
        { key: "numberOfFarmers", label: "Number of Farmer" },
        { key: "districtYield", label: "District Yield (D)" },
        { key: "stateYield", label: "State Yield (S)" },
        { key: "potentialYield", label: "Potential Yield (P)" },
        { key: "status", label: "Status" },
      ]),
      /** Columns confirmed against the client's own "Extension Activities" (CFLD) screenshot (AMS User Manual p.28). */
      /** Number-of-farmers columns confirmed from the client's real "Extension activities under CFLD conducted" table (CFLD Extension Activity.pdf, 2026-08-25) - General/OBC/SC/ST each split Male/Female, matching the report's own grouped column header exactly. */
      leaf("extension-activity-cfld", "Extension Activity (CFLD)", [
        { key: "kvk", label: "KVK Name", readonly: true },
        /** Season is a real dropdown sourced from Season Master (client direction, 2026-09-15), same sourceMaster pattern as every other cross-master dropdown in this file, not free text. */
        { key: "season", label: "Season", required: true, sourceMaster: { master: "season", optionKey: "name" } },
        /** Split into a real Name dropdown (sourced from the Extension Activity Master, same master the sibling "Extension Activities" leaf's own "Nature of Extension Activity" uses) plus a separate number count - same Name+count shape as that sibling leaf's "Nature of Extension Activity" / "No. of Activities" pair (client direction, 2026-09-15; a single merged dropdown was tried first and corrected). */
        {
          key: "activityName",
          label: "Extension Activity Name",
          required: true,
          sourceMaster: { master: "extension-activity", optionKey: "activityName" },
        },
        { key: "activitiesOrganized", label: "Extension Activities Organized", required: true },
        { key: "date", label: "Date", required: true },
        { key: "placeOfActivity", label: "Place of Activity", required: true },
        /** Real General/OBC/SC/ST x Male/Female grid (client direction, 2026-09-15) - same demographic-breakdown fieldKind already auto-totalling Male/Female/Grand Total elsewhere (Training, Extension Activities), rendered here with the bare (unprefixed) keys this leaf's own columns above already used, so the existing create/update mapping in leaf-record-registry.ts needs no change. */
        { key: "farmersDetails", label: "Extension Activity Participants", fieldKind: "demographic-breakdown", demographicVariant: "grid", formOnly: true },
      ]),
      /** Columns confirmed against the client's own "Budget Utilization" (CFLD) screenshot (AMS User Manual p.29). */
      /** Columns confirmed against the client's own live atariams.org "Budget Utilization" screenshot (2026-08-24) - a simpler, more current structure than the earlier manual screenshot's Items/Budget Received/Budget Utilization/Balance breakdown. */
      leaf("budget-utilization", "Budget Utilization", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "crop", label: "Crop", required: true },
        { key: "season", label: "Season", required: true, sourceMaster: { master: "season", optionKey: "name" } },
        { key: "overallFundAllocation", label: "Overall Fund Allocation", required: true },
        /** Overall Received/Utilized/Balance sit right beside Overall Fund Allocation, before the 4-item breakdown below (client direction, 2026-09-15 - moved up from after the items, so what was sanctioned vs. actually received/spent/left is comparable at a glance instead of buried at the bottom of the form). Auto-calculated across all 4 items below. */
        {
          key: "overallFundReceived",
          label: "Overall Fund Received (Rs.)",
          fieldKind: "calculated",
          readonly: true,
          sumOf: ["criticalInputReceived", "extensionReceived", "publicationReceived", "taDaReceived"],
          helperText: "Auto-calculated: sum of all 4 items' Budget Received",
        },
        {
          key: "overallFundUtilized",
          label: "Overall Fund Utilized (Rs.)",
          fieldKind: "calculated",
          readonly: true,
          sumOf: ["criticalInputUtilization", "extensionUtilization", "publicationUtilization", "taDaUtilization"],
          helperText: "Auto-calculated: sum of all 4 items' Budget Utilization",
        },
        {
          key: "overallBalance",
          label: "Overall Balance (Rs.)",
          fieldKind: "calculated",
          readonly: true,
          diffOf: [
            ["criticalInputReceived", "extensionReceived", "publicationReceived", "taDaReceived"],
            ["criticalInputUtilization", "extensionUtilization", "publicationUtilization", "taDaUtilization"],
          ],
          helperText: "Auto-calculated: Overall Fund Received - Overall Fund Utilized",
        },
        { key: "areaAllotedHa", label: "Area (ha) alloted" },
        { key: "areaAchievedHa", label: "Area (ha) achieved" },
        { key: "criticalInputReceived", label: "Critical Input - Budget Received (Rs.)" },
        { key: "criticalInputUtilization", label: "Critical Input - Budget Utilization (Rs.)" },
        /** Auto-calculated Received - Utilization (client direction, 2026-09-15) - was a manual input the user had to compute by hand. */
        { key: "criticalInputBalance", label: "Critical Input - Balance (Rs.)", fieldKind: "calculated", readonly: true, diffOf: [["criticalInputReceived"], ["criticalInputUtilization"]], helperText: "Auto-calculated: Budget Received - Budget Utilization" },
        { key: "extensionReceived", label: "Extension Activities - Budget Received (Rs.)" },
        { key: "extensionUtilization", label: "Extension Activities - Budget Utilization (Rs.)" },
        { key: "extensionBalance", label: "Extension Activities - Balance (Rs.)", fieldKind: "calculated", readonly: true, diffOf: [["extensionReceived"], ["extensionUtilization"]], helperText: "Auto-calculated: Budget Received - Budget Utilization" },
        { key: "publicationReceived", label: "Publication - Budget Received (Rs.)" },
        { key: "publicationUtilization", label: "Publication - Budget Utilization (Rs.)" },
        { key: "publicationBalance", label: "Publication - Balance (Rs.)", fieldKind: "calculated", readonly: true, diffOf: [["publicationReceived"], ["publicationUtilization"]], helperText: "Auto-calculated: Budget Received - Budget Utilization" },
        { key: "taDaReceived", label: "TA/DA - Budget Received (Rs.)" },
        { key: "taDaUtilization", label: "TA/DA - Budget Utilization (Rs.)" },
        { key: "taDaBalance", label: "TA/DA - Balance (Rs.)", fieldKind: "calculated", readonly: true, diffOf: [["taDaReceived"], ["taDaUtilization"]], helperText: "Auto-calculated: Budget Received - Budget Utilization" },
      ]),
      /** New leaf, confirmed against the client's own "Crop wise Photographs" screenshot (AMS User Manual p.27) - not present before this pass. */
      leaf("crop-wise-images", "Crop Wise Images", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "crop", label: "Crop", required: true },
        { key: "image", label: "Image", fileKind: "image", uploadKind: "cfld-crop-image" },
      ]),
      /** Client direction, 2026-09-21: the Project "Team" addon now covers every Project section except the last one, Other Programmes (CFLD, NARI and Seed Hub Program were missing it); same shape as ARYA's own Team. */
      leaf("cfld-team", "Team", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "projectTeam", label: "Project Team", staticOptions: PROJECT_TEAM_ROLES, required: true },
        { key: "name", label: "Name", required: true },
      ]),
    ]),
    /**
     * Real columns + structure confirmed live against atariams.org
     * (2026-08-24, client pointer #19 "replicate the complete form headings
     * and structure"): real group label is "NICRA (Technology Demonstration
     * component)", and "NICRA Others" is nested INSIDE NICRA as its own
     * expandable "Others" child in the real sidebar - not a sibling
     * top-level group as coded before.
     */
    group("nicra", "NICRA (Technology Demonstration component)", [
      leaf("basic-information", "Basic Information", [
        { key: "kvk", label: "KVK", readonly: true },
        { key: "rfDistrictNormal", label: "District Normal Rainfall (mm)", required: true, numeric: true },
        { key: "rfDistrictReceived", label: "District Received Rainfall (mm)", required: true, numeric: true },
        { key: "maxTemperature", label: "Max. Temperature (°C)", required: true },
        { key: "minTemperature", label: "Min. Temperature (°C)", required: true },
        /** Report 3.2.A "Basic Information" columns - dry spell / drought bands, NICRA-adopted-village count, flood averages (added 2026-09-03). */
        { key: "drySpell10Days", label: "Dry spell > 10 days" },
        { key: "drySpell15Days", label: "Dry spell > 15 days" },
        { key: "drySpell20Days", label: "Dry spell > 20 days" },
        { key: "nicraAdoptedVillages", label: "NICRA Adopted village", numeric: true },
        { key: "floodIntensiveRainMm", label: "Flood - Intensive rain > 60 mm", numeric: true },
        { key: "floodWaterDepthCm", label: "Flood - Water depth (cm)", numeric: true },
        { key: "floodDurationDays", label: "Flood - Duration (days)" },
        /** KVK report 3.2.A "Period" trio (added 2026-09-03). */
        { key: "reportingDate", label: "Reporting Date", fieldKind: "date" },
        { key: "startDate", label: "Start Date", fieldKind: "date" },
        { key: "endDate", label: "End Date", fieldKind: "date" },
      ]),
      leaf("details", "Details", [
        { key: "kvk", label: "KVK", readonly: true },
        { key: "cropName", label: "Crop Name", required: true },
        { key: "seasonName", label: "Season Name", required: true, sourceMaster: { master: "season", optionKey: "name" } },
        { key: "technologyDemonstration", label: "Technology demonstration", required: true },
        { key: "noOfFarmers", label: "No. of farmers", ...BENEFICIARY_TOTAL },
        /** Report 3.2.B "Details" columns - Category / Sub-category pivot with Area/Unit and Net return (added 2026-09-03). */
        { key: "category", label: "Category" },
        { key: "subCategory", label: "Sub-category" },
        { key: "areaOrUnit", label: "Area/Unit", numeric: false },
        { key: "netReturn", label: "Net return" },
        /** KVK report 3.2.B per-record detail columns (added 2026-09-03). */
        { key: "month", label: "Month", staticOptions: MONTH_OPTIONS },
        { key: "yield", label: "Yield" },
        { key: "grossCost", label: "Gross cost" },
        { key: "grossReturn", label: "Gross return" },
        { key: "bcr", label: "BCR", numeric: true },
        ...DEMOGRAPHIC_COLUMNS,
      ]),
      leaf("training", "Training", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "title", label: "Title", required: true },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "farmersAttended", label: "Number of farmers attended", ...BENEFICIARY_TOTAL },
        /** KVK report 3.2.C columns (added 2026-09-03). */
        { key: "duration", label: "Duration" },
        { key: "trainingType", label: "Training Type" },
        ...DEMOGRAPHIC_COLUMNS,
      ]),
      leaf("extension-activity-nicra", "Extension Activity (NICRA)", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "activityName", label: "Activity Name", required: true },
        { key: "places", label: "Places", required: true },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "farmersAttended", label: "Number of farmers attended", ...BENEFICIARY_TOTAL },
        ...DEMOGRAPHIC_COLUMNS,
      ]),
      group("others", "Others", [
        leaf("intervention", "Intervention", [
          { key: "kvk", label: "KVK Name", readonly: true },
          { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
          { key: "endDate", label: "End Date", fieldKind: "date", required: true },
          { key: "seedBankFodderBank", label: "Seed Bank/Fodder Bank", required: true, sourceMaster: { master: "nicra-seed-fodder-bank", optionKey: "name" } },
          { key: "crop", label: "Crop", required: true },
          { key: "variety", label: "Variety", required: true },
          { key: "quantity", label: "Quantity in (q)", required: true },
        ]),
        leaf("revenue-generated", "Revenue Generated", [
          { key: "kvk", label: "KVK", readonly: true },
          { key: "year", label: "Year", required: true },
          { key: "revenue", label: "Revenue", required: true },
          { key: "total", label: "Total", required: true },
        ]),
        leaf(
          "custom-hiring-farm-implement",
          "Custom Hiring of Farm-Implement",
          [
            { key: "kvk", label: "KVK", readonly: true },
            {
              key: "farmImplementName",
              label: "Name of farm implement/equipment",
              required: true,
            },
            {
              key: "farmersUsed",
              label: "No. of farmers used Implement",
              ...BENEFICIARY_TOTAL,
            },
            {
              key: "areaCovered",
              label: "Area covered by Farm Implement",
              required: true,
            },
            { key: "hoursUsed", label: "Farm Implement used (In Hours)", required: true },
            {
              key: "revenueGenerated",
              label: "Revenue generated by Farm Implement (Rs.)",
              required: true,
            },
            {
              key: "repairExpenditure",
              label: "Expenditure incurred on repairing (Rs.)",
              required: true,
            },
            ...DEMOGRAPHIC_COLUMNS,
          ],
        ),
        leaf("village-wise-vcrmc", "Village wise VCRMC", [
          { key: "kvk", label: "KVK", readonly: true },
          { key: "villageName", label: "Village name", required: true },
          { key: "constitutionDate", label: "VCRMC Constitution date", fieldKind: "date", required: true },
          { key: "members", label: "VCRMC members (no.)", required: true },
          { key: "membersMale", label: "VCRMC members - Male" },
          { key: "membersFemale", label: "VCRMC members - Female" },
          {
            key: "meetingsOrganized",
            label: "Meetings organized by VCRMC (no.)",
            required: true,
          },
          { key: "meetingDate", label: "Date of VCRMC meeting", fieldKind: "date", required: true },
          { key: "secretaryName", label: "Name of Secretary", required: true },
          { key: "presidentName", label: "Name of President" },
          { key: "majorDecision", label: "Major decision taken" },
        ]),
        leaf(
          "soil-health-card",
          "Soil Health Card prepared and distributed",
          [
            { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
            { key: "endDate", label: "End Date", fieldKind: "date", required: true },
            { key: "kvk", label: "KVK", readonly: true },
            {
              key: "samplesCollected",
              label: "No. of soil samples collected",
              required: true,
            },
            { key: "samplesAnalysed", label: "No. of samples analysed", required: true },
            { key: "shcIssued", label: "SHC issued", required: true },
            {
              key: "farmersBenefitted",
              label: "No. of farmers benefitted",
              ...BENEFICIARY_TOTAL,
            },
            ...DEMOGRAPHIC_COLUMNS,
          ],
        ),
        leaf("convergence-programme", "Convergence Programme", [
          { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
          { key: "endDate", label: "End Date", fieldKind: "date", required: true },
          { key: "kvk", label: "KVK", readonly: true },
          { key: "scheme", label: "Development Scheme /Programme", required: true },
          { key: "natureOfWork", label: "Nature of work", required: true },
          { key: "amount", label: "Amount (Rs.)", required: true },
        ]),
        leaf(
          "dignitaries-visited-nicra-villages",
          "Dignitaries visited NICRA Villages",
          [
            { key: "kvk", label: "KVK", readonly: true },
            { key: "vipExperts", label: "VIP/Experts", required: true, sourceMaster: { master: "nicra-dignitary-type", optionKey: "name" } },
            /** Client pointer, 2026-09-15: Address was missing, and Name/Designation/Address must all be entered as one combined field rather than three separate ones - kept as this leaf's existing single `name` column (no schema change) rather than adding new Designation/Address columns. */
            { key: "name", label: "Name, Designation & Address", required: true, placeholder: "e.g. Dr. Ramesh Kumar, Director, ICAR-ATARI Patna, Patna, Bihar" },
            { key: "dateOfVisit", label: "Date of visited", fieldKind: "date", required: true },
            { key: "remark", label: "Remark" },
          ],
        ),
        leaf("pi-co-pi-list", "Project Team Detail", [
          { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
          { key: "endDate", label: "End Date", fieldKind: "date", required: true },
          { key: "kvk", label: "KVK", readonly: true },
          { key: "piCoPi", label: "PI/CO PI", required: true, sourceMaster: { master: "nicra-pi-co-pi-type", optionKey: "name" } },
          { key: "name", label: "Name", required: true },
        ]),
      ]),
    ], { cardLabel: "NICRA" }),
    /** Card label was "ARYA / SAFAL" (confirmed live, 2026-08-29 "project over" reference) - client direction, 2026-09-13, overrides that to "ARYA / SARAL". Internal group slug ("arya-safal") is left as-is; it's never shown to a user. */
    group("arya-safal", "Attracting and Retaining Youth in Agriculture(ARYA)", [
      leaf("arya-safal-current-year", "Current Year Details", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "enterprise", label: "Enterprise", required: true, sourceMaster: { master: "arya-enterprise", optionKey: "name" } },
        { key: "viableUnits", label: "Viable units", required: true },
        { key: "closedUnits", label: "Closed units", required: true },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "groupsFormed", label: "No. of Groups Formed", required: true },
        { key: "groupsActive", label: "No. of Groups active", required: true },
        /** Report 3.4.A "Current Year Details" per-enterprise economics columns (added 2026-09-03). */
        { key: "trainingsConducted", label: "No. of Training conducted" },
        { key: "unitsEstablished", label: "No. of entrepreneurial units established (Progressive)", formLabel: "Units Established (Progressive)" },
        { key: "ruralYouthMale", label: "Rural youth trained - Male" },
        { key: "ruralYouthFemale", label: "Rural youth trained - Female" },
        { key: "avgUnitSize", label: "Average size of each entrepreneurial unit", numeric: true },
        { key: "productionPerUnit", label: "Total Production/unit/year", numeric: true },
        { key: "costPerUnit", label: "Per unit cost of Production", numeric: true },
        { key: "saleValue", label: "Sale value of produce" },
        { key: "economicGainsPerUnit", label: "Economic Gains / unit", numeric: true },
        { key: "employmentMandaysMale", label: "Employment generated (mandays) - Male" },
        { key: "employmentMandaysFemale", label: "Employment generated (mandays) - Female" },
      ]),
      leaf("arya-safal-previous-year", "Previous Year Evaluation", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "enterprise", label: "Enterprise", required: true, sourceMaster: { master: "arya-enterprise", optionKey: "name" } },
        { key: "totalClosed", label: "Total Closed", required: true },
        { key: "closingDate", label: "Closing Date", fieldKind: "date", required: true },
        { key: "totalRestarted", label: "Total Restarted", required: true },
        { key: "restartedDate", label: "Restarted date", fieldKind: "date", required: true },
        /** Report 3.4.B "Previous Year Evaluation" ~17-column grid (added 2026-09-03). */
        { key: "unitsEstablishedProgressive", label: "No. of entrepreneurial units established (up to previous year progressive)", formLabel: "Units Established (Prev. Yr. Progressive)" },
        { key: "sizeMale", label: "Unit Size - Male", numeric: true },
        { key: "sizeFemale", label: "Unit Size - Female", numeric: true },
        { key: "sizeNoOfUnit", label: "Unit Size - No. of Unit", numeric: true },
        { key: "sizeUnitCapacity", label: "Unit Size - Unit capacity", numeric: true },
        { key: "costFixed", label: "Establishment Cost - Fixed cost" },
        { key: "costVariable", label: "Establishment Cost - Variable cost" },
        { key: "totalProductionPerUnitYear", label: "Total production/unit/year", numeric: true },
        { key: "grossCostPerUnitYear", label: "Gross cost of production/unit/year", numeric: true },
        { key: "grossReturnPerUnitYear", label: "Gross return per unit/year", numeric: true },
        { key: "netBenefitPerUnitYear", label: "Net benefit / unit/year", numeric: true },
        { key: "employmentFamily", label: "Employment generated/year - Family" },
        { key: "employmentOtherThanFamily", label: "Employment generated/year - Other than Family", formLabel: "Employment Generated/Year - Other", numeric: true },
        { key: "personsVisited", label: "No. of persons visited entrepreneur unit", numeric: true },
      ]),
      /** Client pointer, 2026-09-15 ("All Projects - New 'Team' Addon"): same shape as NICRA's own "Project Team Detail" (point 5 of the same request). */
      leaf("arya-team", "Team", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "projectTeam", label: "Project Team", staticOptions: PROJECT_TEAM_ROLES, required: true },
        { key: "name", label: "Name", required: true },
      ]),
    ], { cardLabel: "ARYA / SARAL" }),
    /** Real group label confirmed live: "Out-scaling of Natural Farming" (in-page title); card label on the Projects landing page is the short "Natural Farming" (confirmed live, 2026-08-29 "project over" reference). */
    group("natural-farming", "Out-scaling of Natural Farming", [
      leaf("nf-geographical", "Geographical information", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "agroClimaticZone", label: "Agro Climatic Zone", required: true },
        {
          key: "farmingSituation",
          label: "Farming Situation of the Selected Farmer",
          required: true,
        },
        { key: "latitude", label: "Latitude (N)", required: true },
        { key: "longitude", label: "Longitude (E)", required: true },
      ]),
      /** Re-confirmed live 2026-08-25 via direct URL (atariams.org/project/natural-farming/physical-information) - the page's own H1 just says the generic "Natural Farming" (matches every other leaf in this group), but the URL and columns line up exactly, so this is the right leaf. */
      leaf("nf-physical", "Physical information", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "activityName", label: "Activity Name", required: true },
        {
          key: "trainingTitle",
          label: "Title of Natural Farming training Programme",
          required: true,
        },
        { key: "trainingDate", label: "Date of Training", fieldKind: "date", required: true },
        { key: "venue", label: "Venue of programme", required: true },
        { key: "participants", label: "Participants", ...BENEFICIARY_TOTAL },
        /** Report 3.5.B "Physical Information" caste M/F participant grid + remark (added 2026-09-03). */
        ...DEMOGRAPHIC_COLUMNS,
        { key: "remarks", label: "Remarks/Observation/Feedback Recorded" },
      ]),
      leaf("nf-demonstration", "Demonstration Information", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "farmerName", label: "Farmer Name", required: true },
        { key: "activityName", label: "Name of Activity", required: true },
        { key: "crop", label: "Crop", required: true },
        { key: "variety", label: "Variety", required: true },
        { key: "farmerAddress", label: "Address of Farmer", required: true },
        { key: "farmerContact", label: "Contact Number", required: true },
        { key: "agroClimaticZone", label: "Agro Climatic Zone", required: true },
        { key: "croppingPattern", label: "Cropping Pattern", required: true },
        { key: "farmingSituation", label: "Farming Situation", required: true },
        { key: "latitude", label: "Latitude (N)", required: true },
        { key: "longitude", label: "Longitude (E)", required: true },
        { key: "season", label: "Season", required: true, sourceMaster: { master: "season", optionKey: "name" } },
        { key: "technologyDemonstrated", label: "NF Component/Technology Demonstrated", required: true },
        { key: "areaHa", label: "Area (ha) in NF Practice", required: true },
        { key: "farmerPracticeDetail", label: "Detail of Farmer Practice", required: true },
        { key: "farmerFeedback", label: "Farmer Feedback", required: true },
        /** Report 3.5.C - fixed Without/With NF parameter comparison grid, stored as JSON (added 2026-09-03). */
        { key: "parameters", label: "Performance parameters (Without / With NF Practice)", fieldKind: "nf-parameters", formOnly: true },
      ]),
      leaf(
        "nf-already-practicing",
        "Farmer Already Practicing Natural Farming",
        [
          { key: "kvk", label: "KVK Name", readonly: true },
          { key: "farmerName", label: "Farmer Name", required: true },
          { key: "address", label: "Address", required: true },
          { key: "normalCropsGrown", label: "Normal crops grown", required: true, numeric: false },
          {
            key: "practicingYear",
            label: "Practicing year of natural farming",
            required: true,
          },
          { key: "contactNumber", label: "Contact Number", required: true },
          { key: "activityName", label: "Name of Activity", required: true },
          { key: "crop", label: "Crop", required: true },
          { key: "technologyDemonstrated", label: "NF Component/Technology Demonstrated", required: true },
          { key: "areaHa", label: "Area (ha) in NF Practice", required: true },
          { key: "farmerFeedback", label: "Farmer Feedback", required: true },
          /** Report 3.5.D - fixed Without/With NF parameter comparison grid, stored as JSON (added 2026-09-03). */
          { key: "parameters", label: "Performance parameters (Without / With NF Practice)", fieldKind: "nf-parameters", formOnly: true },
        ],
      ),
      leaf("nf-beneficiaries", "Details of Beneficiaries", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "numberOfBlock", label: "Number of block", required: true, numeric: true },
        { key: "numberOfVillage", label: "Number of village", required: true, numeric: true },
        { key: "numberOfTraining", label: "Number of training", required: true },
        {
          key: "farmersInfluenced",
          label: "No. of farmers influenced to adopt Natural Farming",
          formLabel: "Farmers Influenced to Adopt NF",
          required: true,
        },
        /** Report 3.5.E "Beneficiaries" columns - reporting year, all/one-season engaged farmers, remark (added 2026-09-03). */
        { key: "reportingYear", label: "Reporting year" },
        { key: "farmersEngagedAllSeason", label: "No. of farmers engaged all season", numeric: true },
        { key: "farmersEngagedOneSeason", label: "No. of farmers engaged in 1 season", numeric: true },
        { key: "remarks", label: "Remarks" },
      ]),
      leaf("nf-soil-data", "Soil Data information", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "season", label: "Season", required: true, sourceMaster: { master: "season", optionKey: "name" } },
        { key: "type", label: "Soil Type", required: true },
        { key: "crop", label: "Crop", required: true },
        { key: "beforePh", label: "Before pH", required: true, numeric: true },
        { key: "beforeEc", label: "Before EC (dS/m)", required: true, numeric: true },
        { key: "beforeEcOc", label: "Before EC OC (%)", required: true },
        /** Report 3.5.F "Soil Data" - N/P/K/Microbes for the before/after grids (added 2026-09-03). */
        { key: "beforeN", label: "Before N (Kg/ha)" },
        { key: "beforeP", label: "Before P (Kg/ha)" },
        { key: "beforeK", label: "Before K (Kg/ha)" },
        { key: "beforeMicrobes", label: "Before Soil Microbes (cfu)", numeric: true },
        { key: "afterPh", label: "After pH", required: true, numeric: true },
        { key: "afterEc", label: "After EC (dS/m)", required: true, numeric: true },
        { key: "afterEcOc", label: "After EC OC (%)", required: true },
        { key: "afterN", label: "After N (Kg/ha)" },
        { key: "afterP", label: "After P (Kg/ha)" },
        { key: "afterK", label: "After K (Kg/ha)" },
        { key: "afterMicrobes", label: "After Soil Microbes (cfu)", numeric: true },
      ]),
      leaf("nf-budget-expenditure", "Budget Expenditure", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "activityName", label: "Name of Activity", required: true },
        { key: "activitiesOrganised", label: "Number of activity organised", required: true },
        { key: "budgetSanction", label: "Budget Receipt (Rs)", required: true },
        { key: "budgetExpenditure", label: "Budget expenditure (Rs)", required: true },
        {
          key: "totalBudgetExpenditure",
          label: "Total Budget Expenditure (Rs)",
          required: true,
        },
        /** Client pointer, 2026-09-15: "Balance" = Budget Receipt - Budget Expenditure, same auto-calculated diffOf pattern as CfldBudgetUtilization's own per-item Balance fields. */
        {
          key: "balance",
          label: "Balance (Rs)",
          fieldKind: "calculated",
          readonly: true,
          diffOf: [["budgetSanction"], ["budgetExpenditure"]],
          helperText: "Auto-calculated: Budget Receipt - Budget Expenditure",
        },
      ]),
      /** Client pointer, 2026-09-15 ("All Projects - New 'Team' Addon"): same shape as NICRA's own "Project Team Detail" (point 5 of the same request). */
      leaf("nf-team", "Team", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "projectTeam", label: "Project Team", staticOptions: PROJECT_TEAM_ROLES, required: true },
        { key: "name", label: "Name", required: true },
      ]),
    ], { cardLabel: "Natural Farming" }),
    /** Real structure confirmed live: ONE combined leaf "View Sub Plan Activity" with a Type column (TSP/SCSP), not two separate leaves. */
    group("tsp-scsp", "TSP/SCSP", [
      leaf("view-sub-plan-activity", "View Sub Plan Activity", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "type", label: "Type", required: true, sourceMaster: { master: "tsp-scsp-type", optionKey: "name" } },
        { key: "activities", label: "Activities", required: true, sourceMaster: { master: "tsp-scsp-activity", optionKey: "name" } },
        { key: "noOfTraining", label: "No of Training", required: true },
        { key: "beneficiaries", label: "No. of beneficiaries", required: true },
        /** KVK report 3.6 also carries a per-plan Fund received (Rs. in lakh) and a physical-outcome note (added 2026-09-03). */
        { key: "fundReceivedLakh", label: "Fund received (Rs. in lakh)" },
        { key: "physicalOutcomeNote", label: "Physical outcome note" },
      ]),
      /** Client pointer, 2026-09-15 ("All Projects - New 'Team' Addon"): same shape as NICRA's own "Project Team Detail" (point 5 of the same request). */
      leaf("tsp-scsp-team", "Team", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "projectTeam", label: "Project Team", staticOptions: PROJECT_TEAM_ROLES, required: true },
        { key: "name", label: "Name", required: true },
      ]),
    ]),
    /**
     * The first two NARI labels are truncated in the card itself; they are
     * completed from the third, which renders in full and fixes the shared
     * "Nutri-Smart village" wording.
     */
    /** Real columns confirmed live against atariams.org for all 5 leaves (2026-08-24, client pointer #19). */
    group("nari", "NARI", [
      leaf(
        "nari-nutrition-garden",
        "Details of established Nutrition Garden in Nutri-Smart village",
        [
          { key: "kvk", label: "KVK Name", readonly: true },
          { key: "nutriSmartVillage", label: "Name of Nutri-Smart Village", required: true },
          {
            key: "typeOfNutritionalGarden",
            label: "Type of Nutritional Garden",
            required: true,
            sourceMaster: { master: "nari-nutrition-garden-type", optionKey: "name" },
          },
          { key: "numbers", label: "Numbers", required: true },
          { key: "areaSqm", label: "Area (sqm)", required: true },
          { key: "activity", label: "Activity", required: true, sourceMaster: { master: "nari-activity", optionKey: "name" } },
          ...NARI_CASTE_COLUMNS,
        ],
      ),
      leaf(
        "nari-bio-fortified",
        "Details of Bio-fortified crops used in Nutri-Smart village",
        [
          { key: "kvk", label: "KVK Name", readonly: true },
          { key: "nutriSmartVillage", label: "Name of Nutri-Smart Village", required: true },
          { key: "season", label: "Season", required: true, sourceMaster: { master: "season", optionKey: "name" } },
          { key: "activity", label: "Activity", required: true, sourceMaster: { master: "nari-activity", optionKey: "name" } },
          { key: "categoryOfCrop", label: "Category of crop", required: true, sourceMaster: { master: "nari-crop-category", optionKey: "name" } },
          { key: "numberOfCrops", label: "No. of Crops", required: true },
          /** KVK report 3.7.B per-record columns (added 2026-09-03). */
          { key: "cropName", label: "Name of Crop" },
          { key: "variety", label: "Variety" },
          { key: "areaHa", label: "Area (ha)" },
          ...NARI_CASTE_COLUMNS,
        ],
      ),
      leaf(
        "nari-value-addition",
        "Details of Value addition in Nutri-Smart village",
        [
          { key: "kvk", label: "KVK Name", readonly: true },
          { key: "nutriSmartVillage", label: "Name of Nutri-Smart Village", required: true },
          { key: "cropName", label: "Name of Crop", required: true },
          { key: "valueAddedProduct", label: "Name of Value-added product", required: true },
          { key: "activity", label: "Activity", required: true, sourceMaster: { master: "nari-activity", optionKey: "name" } },
          { key: "numberOfProducts", label: "No. of Products", required: true },
          ...NARI_CASTE_COLUMNS,
        ],
      ),
      leaf("nari-training", "Training programmes in Nutri-Smart village", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "nutriSmartVillage", label: "Name of Nutri-Smart Village", required: true },
        { key: "areaOfTraining", label: "Area of Training", required: true, numeric: false },
        { key: "activity", label: "Activity", required: true },
        { key: "titleOfTraining", label: "Title of Training", required: true },
        { key: "numberOfCourses", label: "No. of Courses", required: true },
        /** KVK report 3.7.D columns (added 2026-09-03). */
        { key: "onOffCampus", label: "On Campus/Off Campus" },
        { key: "venue", label: "Venue" },
        ...NARI_CASTE_COLUMNS,
      ]),
      leaf("nari-extension", "Extension activities under NARI Project", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "nutriSmartVillage", label: "Name of Nutri-Smart Village", required: true },
        { key: "activity", label: "Activity", required: true },
        { key: "nameOfActivity", label: "Name of Activity", required: true },
        { key: "noOfActivities", label: "No of Activities", required: true },
        ...NARI_CASTE_COLUMNS,
      ]),
      /** Client direction, 2026-09-21: the Project "Team" addon now covers every Project section except the last one, Other Programmes (CFLD, NARI and Seed Hub Program were missing it); same shape as ARYA's own Team. */
      leaf("nari-team", "Team", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "projectTeam", label: "Project Team", staticOptions: PROJECT_TEAM_ROLES, required: true },
        { key: "name", label: "Name", required: true },
      ]),
    ]),
    group("agri-drone", "Agri-Drone", [
      leaf("agri-drone-introduction", "Introduction", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "year", label: "Year", required: true },
        { key: "centreName", label: "Project implementing centre name", required: true },
        { key: "companyOfDrone", label: "Company of Drone", required: true },
        { key: "modelOfDrone", label: "Model of Drone", required: true },
        { key: "dronesSanctioned", label: "No. of Agri Drones Sanctioned", required: true },
        { key: "dronesPurchased", label: "No. of Agri Drones Purchased", required: true },
        { key: "amountSanctioned", label: "Amount sanctioned (Rs)", required: true },
        { key: "costPerDrone", label: "Purchased cost of each Drone (Rs.)", required: true },
        { key: "pilotNameContact", label: "Name and contact No of Agri Drone Pilot", required: true },
        { key: "targetAreaHa", label: "Target Area for Demonstration (ha)", required: true },
        { key: "amountSanctionedDemo", label: "Amount Receipt for Demonstration", required: true },
        { key: "amountUtilisedDemo", label: "Amount utilised for Demonstrations (Rs)", required: true },
        { key: "areaCoveredDemoHa", label: "Area covered under demos (ha)", required: true },
        { key: "operationType", label: "Operation carried out", required: true },
        { key: "farmersParticipated", label: "No. of farmers participated", required: true },
        { key: "advantages", label: "Advantages observed", required: true },
      ]),
      leaf("agri-drone-demonstration", "Demonstration Details", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "centreName", label: "Project Implementing Centre Name", required: true },
        { key: "district", label: "District", required: true },
        { key: "dateOfDemos", label: "Date of Demons.", fieldKind: "date", required: true },
        { key: "placeOfDemos", label: "Place of demons.", required: true },
        { key: "cropName", label: "Crop Name", required: true },
        { key: "noOfDemos", label: "No. of demos", required: true },
        { key: "areaCovered", label: "Area covered under demos.", required: true },
        { key: "noOfFarmers", label: "No of farmers", ...BENEFICIARY_TOTAL },
        /** Report 3.8.B "Demonstration" caste M/F participant grid (added 2026-09-03). */
        ...DEMOGRAPHIC_COLUMNS,
      ]),
      /** Client pointer, 2026-09-15 ("All Projects - New 'Team' Addon"): same shape as NICRA's own "Project Team Detail" (point 5 of the same request). */
      leaf("agri-drone-team", "Team", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "projectTeam", label: "Project Team", staticOptions: PROJECT_TEAM_ROLES, required: true },
        { key: "name", label: "Name", required: true },
      ]),
    ]),
    group("fpo-cbbo", "FPO and CBBO", [
      /** Columns confirmed against the client's own "Formation and Promotion of FPOs as CBBOs under NCDC funding" list + Add screenshots (AMS User Manual p.33-34) - the Add form collects several more fields than the list shows, but a custom multi-field form wasn't built for this leaf; it uses the generic per-column form like every other Projects sub-leaf. */
      leaf("fpo-cbbo-details", "Details FPO and CBBO", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "noOfBlocksAllocated", label: "No. of Blocks Allocated", required: true },
        {
          key: "noOfFposRegistered",
          label: "No. of FPOs Registered as CBBO",
          required: true,
        },
        {
          key: "trainingReceived",
          label: "Training Received by FPO Members",
          required: true,
          numeric: false,
        },
        {
          key: "businessPlanPrepared",
          label: "Is Business Plan Prepared for FPOs as CBBOs",
          required: true,
          staticOptions: ["Yes", "No"],
          defaultValue: "No",
        },
        { key: "noOfFposDoingBusiness", label: "No. of FPOs Doing Business", required: true },
        /** Report 3.9.A "Details FPO and CBBO" - the remaining ~8 columns the Add form always collected but the model never stored (added 2026-09-03). */
        { key: "avgMembersPerFpo", label: "Average no of members per FPO" },
        { key: "noOfFpoManagementCost", label: "No. of FPO received management cost" },
        { key: "noOfFpoEquityGrant", label: "No. of FPO received equity grant" },
        { key: "techBackstoppingFpos", label: "Tech. backstopping provided to no. of FPOs" },
        {
          key: "noOfTrainingProgrammes",
          label: "No. of training programme organized for FPOs as CBBO",
          formLabel: "Training Programmes Organized (CBBO)",
          numeric: true,
        },
        {
          key: "assistanceEconomicActivities",
          label: "Assistance to no. of FPOs in economic activities",
          formLabel: "Assistance to FPOs in Economic Activities",
        },
        {
          key: "businessPlanWithoutCbbo",
          label: "Is Business Plan Prepared for FPOs as without CBBOs",
          formLabel: "Business Plan Prepared (without CBBOs)",
          staticOptions: ["Yes", "No"],
          defaultValue: "No",
        },
      ]),
      /** Columns confirmed against the client's own "Details of commodity-based organizations/farmers cooperative society/FPO formed/Associated with KVK under NCDC funding" screenshot (AMS User Manual p.34). */
      leaf("fpo-management", "FPO Management", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "registrationNo", label: "Registration No.", required: true },
        { key: "dateOfRegistration", label: "Date of Registration", fieldKind: "date", required: true },
        { key: "fpoName", label: "Name of the FPO", required: true },
        { key: "fpoAddress", label: "Address of FPO", required: true },
        { key: "totalBomMembers", label: "Total No. of BOM Members", required: true },
        { key: "financialPosition", label: "Financial Position", required: true },
        { key: "proposedActivity", label: "Proposed Activity", required: true },
        { key: "commodityIdentified", label: "Commodity Identified", required: true },
        { key: "areaHa", label: "Area (ha)", required: true },
        { key: "totalFarmersAttached", label: "Total No. of Farmers Attached", required: true },
        { key: "successIndicator", label: "Success Indicator", required: true },
      ]),
      /** Client pointer, 2026-09-15 ("All Projects - New 'Team' Addon"): same shape as NICRA's own "Project Team Detail" (point 5 of the same request). */
      leaf("fpo-team", "Team", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "projectTeam", label: "Project Team", staticOptions: PROJECT_TEAM_ROLES, required: true },
        { key: "name", label: "Name", required: true },
      ]),
    ]),
    group("drmr", "DRMR", [
      /** Columns confirmed against the client's own "Augmenting Rapeseed-Mustard Production..." (DRMR) screenshot (AMS User Manual p.35). A 6th column ("Net Return Farmer Practice") was cut off mid-word in the source screenshot but is an unambiguous completion, not a guess. */
      leaf("drmr-details", "DRMR Details", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "varietiesUsedInIp", label: "Varieties Used in IP", required: true },
        {
          key: "situations",
          label: "Situations (Irrigated/Rainfed)",
          required: true,
        },
        { key: "varietiesUsedInFp", label: "Varieties Used in FP", required: true },
        {
          key: "netReturnImprovedPractice",
          label: "Net Return Improved Practice (Rs./ha)",
          required: true,
        },
        {
          key: "netReturnFarmerPractice",
          label: "Net Return Farmer Practice (Rs./ha)",
          required: true,
        },
        { key: "yieldKgHaIp", label: "Yield (Kg/ha) - IP", required: true },
        { key: "yieldKgHaFp", label: "Yield (Kg/ha) - FP", required: true },
        { key: "yiofpPercentIp", label: "YIOFP (%) - IP", required: true },
        { key: "yiofpPercentFp", label: "YIOFP (%) - FP", required: true },
        { key: "cocRsHaIp", label: "COC (Rs./ha) - IP", required: true },
        { key: "cocRsHaFp", label: "COC (Rs./ha) - FP", required: true },
        { key: "gmrRsHaIp", label: "GMR (Rs./ha) - IP", required: true },
        { key: "gmrRsHaFp", label: "GMR (Rs./ha) - FP", required: true },
        { key: "anmrRsHaIp", label: "ANMR (Rs./ha) - IP", required: true },
        { key: "anmrRsHaFp", label: "ANMR (Rs./ha) - FP", required: true },
        { key: "bcRatioIp", label: "B:C Ratio (GMR/COC) - IP", required: true },
        { key: "bcRatioFp", label: "B:C Ratio (GMR/COC) - FP", required: true },
      ]),
      /** Columns confirmed against the client's own "DRMR Activity" screenshot (AMS User Manual p.37). */
      leaf("drmr-activity", "DRMR Activity", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "training", label: "Training", required: true },
        {
          key: "flds",
          label: "Frontline Demonstration (FLDs) and Other Demonstrations",
          formLabel: "FLDs and Other Demonstrations",
          required: true,
        },
        { key: "awarenessCamps", label: "Awareness Camps", required: true, numeric: false },
        { key: "distributionOfLiterature", label: "Distribution of Literature", required: true },
        {
          key: "itemActivity",
          label: "Item/Activity",
          required: true,
          // Report 3.10.B's fixed Item/Activity list - one row is entered per submit.
          staticOptions: [
            "Training (Capacity building /skill development etc)",
            "Area under FLDs",
            "Awareness camps, exposure visit etc",
            "Seeds (Field Crops)",
            "Small equipments (Upto Rs.2000)",
            "Large equipments (more than Rs.2000)",
            "Fertilizers (NPK)/ Secondary/ Micro Fertilizers",
            "Plant Protection chemicals",
            "Distribution of Literature",
            "Kisan Mela",
            "Any other (specify)",
          ],
        },
        { key: "nameSpecification", label: "Name/Specification", formOnly: true },
        { key: "unit", label: "Unit" },
        { key: "quantity", label: "Quantity" },
        ...DEMOGRAPHIC_COLUMNS,
      ]),
      /** Client pointer, 2026-09-15 ("All Projects - New 'Team' Addon"): same shape as NICRA's own "Project Team Detail" (point 5 of the same request). */
      leaf("drmr-team", "Team", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "projectTeam", label: "Project Team", staticOptions: PROJECT_TEAM_ROLES, required: true },
        { key: "name", label: "Name", required: true },
      ]),
    ]),
    /** Columns confirmed against the client's own "Climate Resilient" and "CRA Extension Activity" screenshots (AMS User Manual p.30-32). */
    group("cra", "Climate Resilient Agriculture (CRA)", [
      leaf("cra-details", "CRA Details", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "season", label: "Season", required: true, sourceMaster: { master: "season", optionKey: "name" } },
        { key: "technologyDemonstrated", label: "Technology Demonstrated", required: true },
        { key: "croppingSystem", label: "Cropping System", required: true, sourceMaster: { master: "cropping-system", optionKey: "cropName" } },
        { key: "areaHa", label: "Area (ha)", required: true },
        { key: "noOfFarmer", label: "No. of Farmer", ...BENEFICIARY_TOTAL },
        { key: "farmingSystem", label: "Farming System", required: true, sourceMaster: { master: "farming-system", optionKey: "farmingSystemName" } },
        { key: "crop", label: "Crop Under Demonstration", required: true },
        { key: "cropYieldQha", label: "Crop Yield (q/ha)", required: true },
        { key: "systemProductivityQha", label: "System Productivity (q/ha)", required: true },
        { key: "totalReturnRsHa", label: "Total Return (Rs./ha)", required: true },
        { key: "yieldFarmerPracticeQha", label: "Yield Under Farmer Practice (q/ha)", required: true },
        ...DEMOGRAPHIC_COLUMNS,
      ]),
      leaf("cra-extension-activity", "Extension Activity (CRA)", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "extensionActivity", label: "Extension Activity", required: true },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "withinOrWithoutState", label: "Within State/Without State", required: true },
        { key: "exposureVisits", label: "Exposure Visit (No.)", required: true, numeric: true },
        {
          key: "farmersUnderExposure",
          label: "Number of Farmers Under Exposure",
          ...BENEFICIARY_TOTAL,
        },
        // Report 3.11.B breaks "Number of farmers under exposure" down by General/OBC/SC/ST x M/F.
        { key: "farmersDetails", label: "Number of farmers under exposure", fieldKind: "demographic-breakdown", demographicVariant: "grid", formOnly: true },
      ]),
      /** Client pointer, 2026-09-15 ("All Projects - New 'Team' Addon"): same shape as NICRA's own "Project Team Detail" (point 5 of the same request). */
      leaf("cra-team", "Team", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "projectTeam", label: "Project Team", staticOptions: PROJECT_TEAM_ROLES, required: true },
        { key: "name", label: "Name", required: true },
      ]),
    ]),
    group("csisa", "CSISA", [
      leaf(
        "csisa-details",
        "Details of Cereal Systems Initiative for South Asia",
        [
          { key: "kvk", label: "KVK Name", readonly: true },
          { key: "season", label: "Season", required: true, sourceMaster: { master: "season", optionKey: "name" } },
          { key: "villageCovered", label: "Village Covered(no.)", required: true, numeric: true },
          { key: "blockCovered", label: "Block Covered(no.)", required: true, numeric: true },
          { key: "districtCovered", label: "District Covered(no.)", required: true, numeric: true },
          { key: "respondent", label: "Respondent", numeric: true },
          /** Client pointer, 2026-09-15: label had a spelling error ("Trail Name") - fixed to "Trial Name". Column key stays `trailName` (matches the existing DB column/schema field of the same name; no schema change for a display-text fix). */
          { key: "trailName", label: "Trial Name" },
          { key: "areaCoveredHa", label: "Area Covered (ha)" },
          { key: "cropName", label: "Name of Crop" },
          { key: "techOptions", label: "Tech. Options" },
          { key: "varietyName", label: "Variety Name" },
          { key: "durationDays", label: "Duration (Days)" },
          { key: "sowingDate", label: "Sowing Date", fieldKind: "date" },
          { key: "harvestingDate", label: "Harvesting Date", fieldKind: "date" },
          { key: "maturityDays", label: "Maturity Days" },
          { key: "grainYieldQha", label: "Grain Yield (q/ha)" },
          { key: "costOfCultivationRsHa", label: "Cost of Cultivation (Rs/ha)" },
          { key: "grossReturnRsHa", label: "Gross Return (Rs/ha)" },
          { key: "netReturnRsHa", label: "Net Return (Rs/ha)" },
          /** Client pointer, 2026-09-15: auto-calculate BCR instead of manual entry - Gross Return ÷ Cost of Cultivation, same ratio every other BCR in this app (e.g. FLD Result's own bcrDemo) already uses. */
          { key: "bcr", label: "BCR", fieldKind: "calculated", readonly: true, ratioOf: ["grossReturnRsHa", "costOfCultivationRsHa"], helperText: "Auto-calculated: Gross Return ÷ Cost of Cultivation" },
        ],
      ),
      /** Client pointer, 2026-09-15 ("All Projects - New 'Team' Addon"): same shape as NICRA's own "Project Team Detail" (point 5 of the same request). */
      leaf("csisa-team", "Team", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "projectTeam", label: "Project Team", staticOptions: PROJECT_TEAM_ROLES, required: true },
        { key: "name", label: "Name", required: true },
      ]),
    ]),
    group("seed-hub", "Seed Hub Program", [
      leaf("seed-hub-program", "Seed Hub Program", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "season", label: "Season", required: true, sourceMaster: { master: "season", optionKey: "name" } },
        { key: "cropName", label: "Crop Name", required: true },
        { key: "variety", label: "Variety", required: true },
        { key: "areaHa", label: "Area (ha)", required: true },
        { key: "yieldHa", label: "Yield (ha)", required: true },
        { key: "qtySeedProducedQ", label: "Quantity of Seed Produced (Q)", required: true },
        { key: "qtySeedSaleOutQ", label: "Quantity of Seed Sale Out (Q)", required: true, numeric: true },
        { key: "farmersPurchased", label: "No. of Farmers Purchased Seed", required: true },
        { key: "qtySeedSaleOutToFarmersQ", label: "Quantity Sale Out to Farmers (Q)", required: true, numeric: true },
        { key: "villagesCovered", label: "No. of Villages Covered", required: true },
        { key: "qtySeedSaleOutOtherOrgQ", label: "Quantity Sale Out to Other Org (Q)", required: true, numeric: true },
        { key: "amountGeneratedLakh", label: "Amount Generated (Lakh)", required: true },
        { key: "totalAmountInProjectLakh", label: "Total Amount in Project (Lakh)", required: true, numeric: true },
      ]),
      /** Client direction, 2026-09-21: Team added to Seed Hub Program as well; same shape as ARYA's own Team. */
      leaf("seed-hub-team", "Team", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
        { key: "endDate", label: "End Date", fieldKind: "date", required: true },
        { key: "projectTeam", label: "Project Team", staticOptions: PROJECT_TEAM_ROLES, required: true },
        { key: "name", label: "Name", required: true },
      ]),
    ]),
    /** Real full label confirmed live: "Any other programme organized by KVK, not covered above" - the earlier "Other Programmes" was a truncated-on-screen guess. */
    group(
      "other-programmes",
      "Any other programme organized by KVK, not covered above",
      [
        leaf("other-programme", "Any other programme organized by KVK", [
          { key: "kvk", label: "KVK", readonly: true },
          { key: "programmeName", label: "Name of the programme", required: true },
          { key: "programmeDate", label: "Date of the programme", fieldKind: "date", required: true },
          { key: "venue", label: "Venue", required: true },
          { key: "purpose", label: "Purpose", required: true },
          { key: "participants", label: "No. of participants", ...BENEFICIARY_TOTAL },
          ...DEMOGRAPHIC_COLUMNS,
        ]),
      ],
    ),
  ],
  {
    description:
      "Manage project details, technical parameters, extension activities, and budget utilization",
  },
);

/**
 * Form Management -> Performance Indicators. All 20 leaves' real columns
 * confirmed live via the client's Form Management the reference reference
 * (2026-08-20) - real sample rows seen for Village Adoption Programme (KVK
 * Darbhanga), Operational Area Details (KVK East Champaran), District Level
 * Data (KVK Patna/Ramgarh), Project-wise Budget / Revenue Generation (Krishi
 * Vigyan Kendra Dumka), Resource Generation (KVK Munger), Special Programmes
 * (KVK Godda).
 */
const performanceIndicators = group(
  "performance",
  "Performance Indicators",
  [
    group("impact", "Impact", [
      leaf("impact-of-kvk-activities", "Impact of KVK Activities", [
        { key: "kvk", label: "KVK Name", readonly: true },
        // Real Add form field confirmed live (atariams.org/create-impact-activity, 2026-09-03) - was missing entirely before.
        // `formOnly` on this and every other field below except specificArea/briefDetails/farmersBenefitted/horizontalSpread/adoptionPercent - the real reference list table only ever showed those 5 (+ KVK Name) columns (client report, 2026-09-03: "jitne columns h table me bs mujhe wahi chahiye" - the fuller Add form is real, but a wider table would just be confusing), even though its own Add/Edit form asks for more.
        { key: "reportingYear", label: "Reporting Year", required: true, formOnly: true },
        { key: "specificArea", label: "Name of Specific Area", required: true, sourceMaster: { master: "impact-specific-area", optionKey: "name" } },
        { key: "briefDetails", label: "Brief Details of the Area", required: true },
        { key: "farmersBenefitted", label: "No. of Farmers Benefitted", required: true },
        { key: "horizontalSpread", label: "Horizontal Spread (in area/no.)", required: true, numeric: false },
        { key: "adoptionPercent", label: "% of Adoption", required: true },
        // formLabel shortened - the reference's own full text wraps to 2 lines in this app's ~240-320px field track, misaligning it against its row's neighbor (client report, 2026-09-03, same class of fix as CFLD's Perception Fields).
        { key: "impactSubjective", label: "Impact of the Technology in Subjective Terms (Qualitative)", formLabel: "Impact - Subjective (Qualitative)", required: true, formOnly: true },
        { key: "impactObjective", label: "Impact of the Technology in Objective Terms (Quantitative)", formLabel: "Impact - Objective (Quantitative)", required: true, formOnly: true },
        // Real section heading the reference shows above the Before/After pair (confirmed live, 2026-09-03) - was missing entirely before.
        { key: "incomeSectionHeading", label: "Change in Income (Rs.)", fieldKind: "section-heading", formOnly: true },
        { key: "incomeBefore", label: "Before (Rs./Unit)", required: true, formOnly: true },
        { key: "incomeAfter", label: "After (Rs./Unit)", required: true, formOnly: true },
      ]),
      leaf("entrepreneurship-details", "Details of Entrepreneurship", [
        { key: "kvk", label: "KVK Name", readonly: true },
        // Real Add form fields confirmed live (atariams.org/impact/entrepreneurship/create, 2026-09-03) - reportingYear/registeredAddress/registrationDetails/roleOfKvk/periodTimeline/economicSocialStatus/presentWorkingCondition/majorAchievements/majorConstraints were missing entirely before (no matching DB column either - added via the same migration that added these fields).
        // `formOnly` here (and on yearOfEstablishment/technicalComponents, both pre-existing) - the real reference list table only ever showed entrepreneurOrEnterprise/enterpriseType/membersAssociated/annualIncome (+ KVK Name), same "table stays narrow, form can ask for more" split as every other Impact leaf (client report, 2026-09-03).
        { key: "reportingYear", label: "Reporting Year", required: true, formOnly: true },
        {
          key: "entrepreneurOrEnterprise",
          label: "Name of the Entrepreneur/Name of the Enterprise/Firm",
          formLabel: "Entrepreneur/Enterprise/Firm Name",
          required: true,
        },
        { key: "registeredAddress", label: "Registered address of the entrepreneur/firm", required: true, formOnly: true },
        { key: "yearOfEstablishment", label: "Year of establishment", required: true, formOnly: true },
        { key: "enterpriseType", label: "Type of Enterprise", required: true, sourceMaster: { master: "type-of-enterprise", optionKey: "name" } },
        { key: "registrationDetails", label: "Registration details", required: true, formOnly: true },
        { key: "membersAssociated", label: "No of Members Associated", required: true },
        // formLabel shortened here and below - the reference's own full text wraps to 2 lines in this app's ~240-320px field track, misaligning it against its row's neighbor (client report, 2026-09-03, same class of fix as CFLD's Perception Fields).
        { key: "technicalComponents", label: "Technical Components of the Enterprise (with commodity)", formLabel: "Technical Components (with commodity)", required: true, formOnly: true },
        {
          key: "annualIncome",
          label: "Annual Income/Revenue of the Enterprise",
          required: true,
        },
        { key: "roleOfKvk", label: "Role of KVK/Technology Backstopping (Quantitative Data Support)", formLabel: "Role of KVK/Tech Backstopping", required: true, formOnly: true },
        { key: "periodTimeline", label: "Period/Timeline of the Entrepreneurship Development", formLabel: "Period/Timeline of Development", required: true, formOnly: true },
        { key: "economicSocialStatus", label: "Economic and Social Status of Entrepreneur Before and After the Enterprise", formLabel: "Economic/Social Status (Before & After)", required: true, formOnly: true },
        { key: "presentWorkingCondition", label: "Present Working Condition of Enterprise", required: true, formOnly: true },
        { key: "majorAchievements", label: "Major Achievements", required: true, formOnly: true },
        { key: "majorConstraints", label: "Major Constraints", required: true, formOnly: true },
      ]),
      /**
       * The real reference form (atariams.org/impact/success-story/create,
       * audit finding 2026-09-03) has 21 fields across 3 real sections
       * (Personal/Professional/Economic Information) - all now added below,
       * backed by the same migration that added the matching SuccessStory
       * columns (dateOfBirth/education/cellNoEmail/fullAddress/
       * professionalMembership/awardsReceived/situationAnalysis/
       * planImplementSupport/detailsOfPractices/resultsOutput/
       * impactOutcome/futurePlans/supportingImageUrls/grossIncome).
       */
      // `formOnly` on every field below except farmerOrEntrepreneur/experience/majorAchievement/storyTitle - the real reference list table only ever showed those 4 (+ KVK Name) columns (client report, 2026-09-03), same "table stays narrow, form can ask for more" split as every other Impact leaf.
      leaf("success-stories", "Success Stories", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "personalInfoSectionHeading", label: "Personal Information", fieldKind: "section-heading", formOnly: true },
        { key: "reportingYear", label: "Reporting Year", required: true, formOnly: true },
        {
          key: "farmerOrEntrepreneur",
          label: "Name of the Farmer/Entrepreneur",
          required: true,
        },
        { key: "dateOfBirth", label: "Date of Birth", fieldKind: "date", required: true, formOnly: true },
        { key: "education", label: "Education", required: true, formOnly: true },
        { key: "experience", label: "Farming Experience/Experience in Enterprise", required: true },
        { key: "cellNoEmail", label: "Cell no./E-mail", required: true, formOnly: true },
        { key: "fullAddress", label: "Full Address", required: true, formOnly: true },
        { key: "professionalMembership", label: "Professional Membership", required: true, formOnly: true },
        { key: "majorAchievement", label: "Major Achievement of the Farmers", required: true, numeric: false },
        { key: "awardsReceived", label: "Awards Received", required: true, formOnly: true },
        { key: "professionalInfoSectionHeading", label: "Professional Information", fieldKind: "section-heading", formOnly: true },
        {
          key: "storyTitle",
          label: "Title of the Success Story / Case Study",
          required: true,
        },
        { key: "situationAnalysis", label: "Situation Analysis/Problem Statement", required: true, formOnly: true },
        // formLabel shortened - the reference's own full text wraps to 2 lines in this app's ~240-320px field track, misaligning it against its row's neighbor (client report, 2026-09-03, same class of fix as CFLD's Perception Fields).
        { key: "planImplementSupport", label: "Plan, Implement and Support/KVK Intervention(s)", formLabel: "Plan & KVK Intervention(s)", required: true, formOnly: true },
        { key: "detailsOfPractices", label: "Details of Practices Followed by the Farmer", required: true, formOnly: true },
        { key: "resultsOutput", label: "Results/Output (Economical/Social/etc.)", required: true, formOnly: true },
        { key: "impactOutcome", label: "Impact/Outcome", required: true, formOnly: true },
        { key: "futurePlans", label: "Future Plans", required: true, formOnly: true },
        // Not required on the reference (no asterisk) - the one upload field in this leaf.
        { key: "moduleImages", label: "Supporting Images", fieldKind: "photos", formOnly: true },
        { key: "economicInfoSectionHeading", label: "Economic Information", fieldKind: "section-heading", formOnly: true },
        { key: "enterprise", label: "Enterprise", required: true, formOnly: true },
        { key: "grossIncome", label: "Gross Income (annual)", required: true, formOnly: true },
        { key: "netIncome", label: "Net Income", required: true, formOnly: true },
        { key: "costBenefitRatio", label: "Cost-Benefit Ratio", required: true, formOnly: true },
      ]),
    ]),
    group("district-village-performance", "District and Village Performance", [
      leaf("district-level-data", "District Level Data", [
        { key: "kvk", label: "KVK", readonly: true },
        { key: "reportingYear", label: "Reporting Year", required: true },
        // Real Add form field confirmed live (atariams.org/district-level-data/create, 2026-09-03) - a fixed 7-option dropdown, not free text. The reference's own field label there reads "Account type" (contradicts its own table's "Items" column header, and its own option list, which is clearly a set of report ITEMS, not account types) - kept our correct "Items" label rather than copy what looks like a labeling mistake on their side.
        {
          key: "items",
          label: "Items",
          required: true,
          staticOptions: [
            "Major Farming system/enterprise",
            "Agro-climatic Zone",
            "Agro ecological situation",
            "Soil type",
            "Productivity of major 2-3 crops under cereals, pulses, oilseeds, vegetables, fruits and others",
            "Mean yearly temperature, rainfall, humidity of the district",
            "Production of major livestock products like milk, egg, meat etc",
          ],
        },
        { key: "information", label: "Information", required: true },
      ]),
      leaf("district-crop-productivity", "Productivity of Major Crops", [
        { key: "kvk", label: "KVK", readonly: true },
        { key: "season", label: "Season", required: true, sourceMaster: { master: "season", optionKey: "name" } },
        { key: "type", label: "Type", required: true },
        { key: "cropName", label: "Name of Crop", required: true },
        { key: "areaHa", label: "Area (Ha)", required: true },
        { key: "productionMt", label: "Production (MT)", required: true },
        { key: "productivityQha", label: "Productivity (q/ha)", required: true },
        { key: "remarks", label: "Remarks" },
      ]),
      leaf("district-monthly-weather", "Mean Yearly Temperature, Rainfall, Humidity", [
        { key: "kvk", label: "KVK", readonly: true },
        { key: "month", label: "Month", required: true, staticOptions: MONTH_OPTIONS },
        { key: "rainfallMm", label: "Rainfall (mm)" },
        { key: "maxTempC", label: "Max. Temp. (°C)", numeric: true },
        { key: "minTempC", label: "Min. Temp. (°C)", numeric: true },
        { key: "maxRhPct", label: "Max. R.H. (%)" },
        { key: "minRhPct", label: "Min. R.H. (%)" },
        { key: "remarks", label: "Remarks" },
      ]),
      leaf("district-livestock-production", "Production of Major Livestock Products", [
        { key: "kvk", label: "KVK", readonly: true },
        { key: "livestockName", label: "Name of Livestock", required: true },
        { key: "number", label: "Number", required: true },
        { key: "remarks", label: "Remarks" },
        // tabLabel shortened by one letter ("Products" -> "Product") - the reference's own 6-tab pill bar (District Level Data/.../Priority Thrust Area) needed a horizontal scrollbar for this leaf's full label to fit (client screenshot, 2026-09-04) even after the tabs row was fixed to never wrap. Breadcrumb/page title keep the real full label.
      ], undefined, undefined, undefined, undefined, "Production of Major Livestock Product"),
      leaf("operational-area-details", "Operational Area Details", [
        { key: "kvk", label: "KVK", readonly: true },
        { key: "reportingYear", label: "Reporting Year", required: true },
        { key: "taluk", label: "Taluk", required: true },
        { key: "block", label: "Block", required: true },
        { key: "village", label: "Village", required: true },
        { key: "majorCrops", label: "Major Crops", required: true, numeric: false },
        {
          key: "majorProblems",
          label: "Major Problems Identified (crop-wise)",
          required: true,
        },
        { key: "thrustAreas", label: "Identified Thrust Areas", required: true, numeric: false },
      ]),
      leaf("village-adoption-programme", "Village Adoption Programme", [
        { key: "kvk", label: "KVK", readonly: true },
        { key: "reportingYear", label: "Reporting Year", required: true },
        { key: "village", label: "Village", required: true },
        { key: "block", label: "Block", required: true },
        { key: "actionTaken", label: "Action Taken for Development", required: true },
      ]),
      leaf("priority-thrust-area", "Priority Thrust Area", [
        { key: "kvk", label: "KVK", readonly: true },
        { key: "reportingYear", label: "Reporting Year", required: true },
        { key: "thrustArea", label: "Thrust Area", required: true, numeric: false },
        // Real reference (atariams.org/priority-thrust-area, 2026-09-03) has neither of these on its own table or Add form at all - genuine extras on our side, kept per instruction not to delete extra fields, just hidden from the table to match the reference's own 3-column list.
        { key: "majorFocus", label: "Major Focus", formOnly: true },
        { key: "achievement", label: "Achievement", formOnly: true },
      ]),
    ]),
    group("infrastructure-performance", "Infrastructure Performance", [
      leaf("demonstration-units", "Performance of demonstration Units", [
        { key: "kvk", label: "KVK Name", readonly: true },
        // Real Add form field confirmed live (atariams.org/infra-performance/demonstration-units/create, 2026-09-03) - was missing entirely before. Not a table column there (own table has only KVK/Name/Year of Estt./Area), so hidden from ours too.
        { key: "reportingYear", label: "Reporting Year", required: true, formOnly: true },
        { key: "demoUnitName", label: "Name of Demo Unit", required: true },
        { key: "yearOfEstt", label: "Year of Estt.", required: true },
        { key: "areaSqMt", label: "Area (Sq. mt)", required: true },
        // Real reference (2026-09-03) has all 6 of these required, and none of them are columns on its own table - hidden from ours to match.
        { key: "varietyBreed", label: "Variety/Breed", required: true, formOnly: true },
        { key: "produce", label: "Produce", required: true, formOnly: true },
        { key: "qty", label: "Qty.", required: true, formOnly: true },
        { key: "costOfInputs", label: "Cost of Inputs", required: true, formOnly: true },
        { key: "grossIncome", label: "Gross Income", required: true, formOnly: true },
        { key: "remarks", label: "Remarks", required: true, formOnly: true },
        // Single-KVK report prints a "Status" column (Functional / Non-functional); not on atariams.org's own list table, so form-only here too.
        { key: "status", label: "Status", formOnly: true },
      ], "Demonstration Units", undefined, "Demonstration Units", undefined, "Demonstration Units"),
      leaf("instructional-farm-crops", "Performance of Instructional Farm(crops)", [
        { key: "kvk", label: "KVK Name", readonly: true },
        // Real Add form field confirmed live (atariams.org/infra-performance/crop-farms/create, 2026-09-03) - was missing entirely before, not a table column there.
        { key: "reportingYear", label: "Reporting Year", required: true, formOnly: true },
        { key: "cropName", label: "Name of the Crop", required: true },
        { key: "areaHa", label: "Area (ha)", required: true },
        // Real reference (2026-09-03) has all 7 of these required, and none are columns on its own table (own table: KVK/Crop/Area only) - hidden from ours to match.
        { key: "season", label: "Season", required: true, formOnly: true, sourceMaster: { master: "season", optionKey: "name" } },
        { key: "variety", label: "Variety", required: true, formOnly: true },
        { key: "produceType", label: "Type of Produce", required: true, formOnly: true },
        { key: "qty", label: "Qty. (q)", required: true, formOnly: true },
        { key: "costOfInputs", label: "Cost of Inputs", required: true, formOnly: true },
        { key: "grossIncome", label: "Gross Income", required: true, formOnly: true },
        { key: "remarks", label: "Remarks", required: true, formOnly: true },
      ], "Instructional Farm - Crops", undefined, "Instructional Farm - Crops", undefined, "Instructional Farm - Crops"),
      leaf("production-units", "Performance of Production Units", [
        { key: "kvk", label: "KVK Name", readonly: true },
        // Real Add form field confirmed live (atariams.org/infra-performance/production-units/create, 2026-09-03) - was missing entirely before, not a table column there.
        { key: "reportingYear", label: "Reporting Year", required: true, formOnly: true },
        { key: "productName", label: "Name of the Product", required: true },
        { key: "qty", label: "Qty. (Kg)", required: true },
        // Real reference (2026-09-03) has these 3 required, and none are columns on its own table (own table: KVK/Product/Qty only) - hidden from ours to match.
        { key: "costOfInputs", label: "Cost of Inputs", required: true, formOnly: true },
        { key: "grossIncome", label: "Gross Income", required: true, formOnly: true },
        { key: "remarks", label: "Remarks", required: true, formOnly: true },
      ], "Production Units", undefined, "Production Units", undefined, "Production Units"),
      leaf("instructional-farm-livestock", "Performance of Instructional Farm(livestock)", [
        { key: "kvk", label: "KVK Name", readonly: true },
        // Real Add form field confirmed live (atariams.org/infra-performance/livestock-farms/create, 2026-09-03) - was missing entirely before, not a table column there.
        { key: "reportingYear", label: "Reporting Year", required: true, formOnly: true },
        { key: "animalName", label: "Name of the Animal/Bird/Aquatics", required: true },
        { key: "speciesBreed", label: "Species / Breed / Variety", required: true },
        { key: "produceType", label: "Type of Produce", required: true },
        // Real reference (2026-09-03) has these 4 required, and none are columns on its own table (own table: KVK/Animal/Species/Produce Type only) - hidden from ours to match.
        { key: "qty", label: "Qty.", required: true, formOnly: true },
        { key: "costOfInputs", label: "Cost of Inputs", required: true, formOnly: true },
        { key: "grossIncome", label: "Gross Income", required: true, formOnly: true },
        { key: "remarks", label: "Remarks", required: true, formOnly: true },
      ], "Instructional Farm - Livestock", undefined, "Instructional Farm - Livestock", undefined, "Instructional Farm - Livestock"),
      leaf("hostel-utilization", "Utilization of Hostel Facilities Accommodation", [
        { key: "kvk", label: "KVK Name", readonly: true },
        // Real Add form field confirmed live (atariams.org/infra-performance/hostel-facility/create, 2026-09-03) - was missing entirely before, not a table column there.
        { key: "reportingYear", label: "Reporting Year", required: true, formOnly: true },
        { key: "months", label: "Months", required: true, staticOptions: MONTH_OPTIONS },
        { key: "traineesStayed", label: "No. of Trainees Stayed", required: true },
        { key: "traineeDays", label: "Trainee Days (Days Stayed)", required: true },
        // Real reference (2026-09-03) marks this required too, and it isn't a column on its own table (own table: KVK/Months/Trainees/Trainee Days only) - hidden from ours to match.
        { key: "reasonForShortFall", label: "Reason for Shortfall", required: true, formOnly: true },
      ], "Hostel Utilization", undefined, "Hostel Utilization", undefined, "Hostel Utilization"),
      leaf("staff-quarters-performance", "Utilization of Staff Quarters", [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "noOfStaffQuarters", label: "No. of Staff Quarters", required: true, formOrder: 3 },
        { key: "dateOfCompletion", label: "Date of Completion", fieldKind: "date", required: true, formOrder: 1 },
        { key: "remark", label: "Remark", required: true, formOrder: 5 },
        // Real Add form fields confirmed live (atariams.org/infra-performance/staff-quaters/create, 2026-09-04) - were missing entirely before. Neither is a column on its own table (own table: KVK/No. of Staff Quarters/Date of Completion/Remark only), so hidden from ours to match. formOrder matches the reference's own field sequence (Date/Whether/No. of Quarters/Occupancy/Remark), which differs from this leaf's table column order.
        { key: "whetherCompleted", label: "Whether staff quarters have been completed", formLabel: "Whether Completed", required: true, staticOptions: ["Yes", "No"], formOnly: true, formOrder: 2 },
        { key: "occupancyDetails", label: "Occupancy Details", required: true, formOnly: true, formOrder: 4 },
        // Real Add form field confirmed live (2026-09-04) - the Month x Quarter 1-6 Yes/No completion matrix below the main fields, not a table column.
        { key: "quarterlyCompletion", label: "Month-wise Quarter Completion", fieldKind: "month-quarter-grid", formOnly: true, formOrder: 6 },
      ], "Staff Quarters", undefined, "Staff Quarters", undefined, "Staff Quarters"),
      leaf("rain-water-harvesting", "Rain Water Harvesting structure and micro irrigation system", [
        { key: "kvk", label: "KVK Name", readonly: true },
        {
          key: "trainingProgrammes",
          label: "No of Training Programme Conducted",
          required: true,
          numeric: true,
        },
        { key: "demonstrations", label: "No. of Demonstrations", required: true },
        {
          key: "plantMaterialProduced",
          label: "No. of Plant Material Produced",
          required: true,
        },
        { key: "farmerVisits", label: "Visit by the Farmers (No.)", required: true },
        { key: "officialVisits", label: "Visit by the Officials (No.)", required: true },
      ], "Rain Water Harvesting", undefined, "Rain Water Harvesting", undefined, "Rain Water Harvesting"),
    ]),
    group("financial-performance", "Financial Performance", [
      leaf("budget-details", "Budget Details", [
        { key: "kvk", label: "KVK", readonly: true },
        // Real Add form fields confirmed live (atariams.org/financial-performance/budget-details/create, 2026-09-04) - a Financial-Year date range, not required (no asterisk on the reference form). Not a table column there, so hidden from ours to match.
        { key: "startDate", label: "Start Date", fieldKind: "date", formOnly: true },
        { key: "endDate", label: "End Date", fieldKind: "date", formOnly: true },
        { key: "salaryAllocation", label: "Salary Allocation", required: true },
        { key: "salaryExpenditure", label: "Salary Expenditure", required: true },
        {
          key: "generalGrantAllocation",
          label: "General Main Grant Allocation",
          required: true,
        },
        {
          key: "generalGrantExpenditure",
          label: "General Main Grant Expenditure",
          required: true,
        },
        {
          key: "capitalGrantAllocation",
          label: "Capital Main Grant Allocation",
          required: true,
        },
        {
          key: "capitalGrantExpenditure",
          label: "Capital Main Grant Expenditure",
          required: true,
        },
        // Real reference (2026-09-04) splits General/Capital into Main Grant (above) + TSP + SCSP, each with its own Allocation AND Expenditure - the "General Allocation - TSP" style single-value fields this leaf had before were wrong (missing the Expenditure half entirely). All 4 pairs required, none are table columns. "generalMainGrant"/"capitalMainGrant" (this leaf's old, incorrect duplicates of generalGrantAllocation/capitalGrantAllocation above) are no longer shown - the real reference has no separate "Main Grant" field beyond the one already captured by generalGrantAllocation/capitalGrantAllocation.
        { key: "generalTsp", label: "General TSP Grant Allocation", required: true, formOnly: true },
        { key: "generalTspExpenditure", label: "General TSP Grant Expenditure", required: true, formOnly: true },
        { key: "generalScsp", label: "General SCSP Grant Allocation", required: true, formOnly: true },
        { key: "generalScspExpenditure", label: "General SCSP Grant Expenditure", required: true, formOnly: true },
        { key: "capitalTsp", label: "Capital TSP Grant Allocation", required: true, formOnly: true },
        { key: "capitalTspExpenditure", label: "Capital TSP Grant Expenditure", required: true, formOnly: true },
        { key: "capitalScsp", label: "Capital SCSP Grant Allocation", required: true, formOnly: true },
        { key: "capitalScspExpenditure", label: "Capital SCSP Grant Expenditure", required: true, formOnly: true },
      ]),
      leaf("project-wise-budget-performance", "Project-wise Budget Details", [
        { key: "kvk", label: "KVK", readonly: true },
        // Real Add form field confirmed live (atariams.org/financial-performance/project-budget-details/create, 2026-09-04) - a Financial-Year date range, not required, not a table column.
        { key: "startDate", label: "Start Date", fieldKind: "date", formOnly: true },
        { key: "endDate", label: "End Date", fieldKind: "date", formOnly: true },
        // Real reference (2026-09-04) - a fixed dropdown, not free text. Last option was "Others" there (verified live) - client direction, 2026-09-13: "Other" instead, everywhere in this app, even where it means deviating from the live reference's own wording.
        { key: "projectName", label: "Project Name", required: true, staticOptions: ["CFLD Oilseed", "CFLD Pulses", "Model Village Oilseed", "Model Village Pulses", "NICRA", "ARYA", "FPO", "Natural Farming", "DRMR", "NARI", "IIPR", "TSP", "SCSP", "SAP", "Other"] },
        // Real reference marks this required (asterisk) and it isn't a table column there (own table: KVK/Project Name/Funding Agency/Budget Estimate/Budget Allocated/Budget Released/Expenditure/Unspent Balance only, no Account Number) - hidden from ours to match.
        { key: "accountNumber", label: "Account Number", required: true, formOnly: true },
        // Real reference (2026-09-04) - a fixed dropdown, not free text. Same "Other" not "Others" direction as projectName above.
        { key: "fundingAgency", label: "Funding Agency", required: true, staticOptions: ["ICAR", "State Govt. Ministry of A&FW", "Central Govt.", "Other"] },
        { key: "budgetEstimate", label: "Budget Estimate", required: true },
        { key: "budgetAllocated", label: "Budget Allocated", required: true },
        { key: "budgetReleased", label: "Budget Released", required: true },
        { key: "expenditure", label: "Expenditure", required: true },
        { key: "unspentBalance", label: "Unspent Balance", required: true },
      ], "Project-wise Budget", undefined, "Project-wise Budget", undefined, "Project-wise Budget"),
      leaf("revolving-fund", "Status of revolving fund", [
        { key: "kvk", label: "KVK", readonly: true },
        { key: "reportingYear", label: "Reporting Year", required: true },
        { key: "openingBalance", label: "Opening Balance as on 1st April", required: true },
        { key: "incomeDuringYear", label: "Income During the Year", required: true },
        { key: "expenditureDuringYear", label: "Expenditure During the Year", required: true },
        { key: "closing", label: "Closing", required: true, numeric: true },
        // Real reference (atariams.org/financial-performance/revolving-fund-status/create, 2026-09-04) has no asterisk on this field, unlike the other 5 - was wrongly marked required before.
        { key: "kind", label: "Kind" },
      ], "Revolving Fund", undefined, "Revolving Fund", undefined, "Revolving Fund"),
      leaf("revenue-generation", "Revenue Generation", [
        { key: "kvk", label: "KVK", readonly: true },
        // Real Add form field confirmed live (atariams.org/financial-performance/revenue-generation/create, 2026-09-04) - a Financial-Year date range, not required, not a table column.
        { key: "startDate", label: "Start Date", fieldKind: "date", formOnly: true },
        { key: "endDate", label: "End Date", fieldKind: "date", formOnly: true },
        { key: "headName", label: "Name of Head", required: true },
        { key: "income", label: "Income (Rs.)", required: true },
        { key: "sponsoringAgency", label: "Sponsoring Agency", required: true },
      ]),
      leaf("resource-generation", "Resource Generation", [
        { key: "kvk", label: "KVK", readonly: true },
        // Real Add form field confirmed live (atariams.org/financial-performance/resource-generation/create, 2026-09-04) - a Financial-Year date range, not required, not a table column.
        { key: "startDate", label: "Start Date", fieldKind: "date", formOnly: true },
        { key: "endDate", label: "End Date", fieldKind: "date", formOnly: true },
        { key: "programmeName", label: "Name of the Programme", required: true },
        { key: "purpose", label: "Purpose of the Programme", required: true },
        // Real reference (2026-09-04) shows this as a plain text field, not a dropdown - kept as our own validated sourceMaster dropdown instead (a deliberate improvement over the reference, not a mismatch to copy blindly); flagged to the client rather than silently reverted.
        { key: "sourcesOfFund", label: "Sources of Fund", required: true, sourceMaster: { master: "asset-funding-source", optionKey: "name" } },
        { key: "amountLakhs", label: "Amount (Rs. Lakhs)", required: true },
        // Real reference marks this required and it isn't a table column there (own table: KVK/Name of the programme/Purpose of the programme/Sources of fund/Amount only) - hidden from ours to match.
        { key: "infrastructureCreated", label: "Infrastructure Created", required: true, formOnly: true },
      ]),
    ]),
    group("linkages", "Linkages", [
      leaf("functional-linkage", "Functional Linkage with Different Organizations", [
        { key: "kvk", label: "KVK Name", readonly: true },
        // Real Add form field confirmed live (atariams.org/linkages/create, 2026-09-04) - was missing entirely before, not a table column there.
        { key: "reportingYear", label: "Reporting Year", required: true, formOnly: true },
        { key: "organizationName", label: "Name of Organization", required: true },
        { key: "natureOfLinkage", label: "Nature of Linkage", required: true },
      ], "Functional Linkage", undefined, "Functional Linkage", undefined, "Functional Linkage"),
      leaf("special-programmes", "List of Special Programmes Undertaken", [
        { key: "kvk", label: "KVK Name", readonly: true },
        // Real Add form field confirmed live (atariams.org/linkage/details/create, 2026-09-04) - was missing entirely before, not a table column there.
        { key: "reportingYear", label: "Reporting Year", required: true, formOnly: true },
        { key: "programmeType", label: "Programme Type", required: true, sourceMaster: { master: "programme-type", optionKey: "name" } },
        { key: "programmeName", label: "Name of the Programme/Scheme", required: true },
        // Real Add form fields confirmed live (2026-09-04) - "Purpose of programme" and "Funding agency" and "Amount (Rs.)" were missing entirely before, none are table columns there (own table: KVK/Programme Type/Name of the Programme-Scheme/Date-Month of initiation only).
        { key: "purpose", label: "Purpose of programme", required: true, formOnly: true },
        { key: "fundingAgency", label: "Funding agency", required: true, formOnly: true },
        { key: "amount", label: "Amount (Rs.)", required: true, formOnly: true },
        { key: "initiationDate", label: "Date/Month of Initiation", fieldKind: "date", required: true },
      ], "Special Programmes", undefined, "Special Programmes", undefined, "Special Programmes"),
    ]),
  ],
  {
    description:
      "Manage impact, district/village, infrastructure, financial, and linkage performance data",
  },
);

/** Form Management -> Meetings. Real columns confirmed live via the client's Form Management the reference reference (2026-08-20) - real rows seen for Other Meetings, KVK Latehar. */
const meetings = group("meetings", "Meetings", [
  /** Columns re-confirmed live 2026-08-25 - exact match, no change needed there. No `cardLabel` override (client direction, 2026-09-03: landing card should show the same full text as the sidebar, not a shortened "SAC Meetings"), so the card falls back to the full label below. */
  leaf(
    "sac-meetings",
    "Details of Scientific Advisory Committee(SAC) Meetings",
    [
      { key: "kvk", label: "KVK Name" },
      { key: "startDate", label: "Start Date" },
      { key: "endDate", label: "End Date" },
      { key: "participants", label: "No of Participants" },
      {
        key: "statutoryMembers",
        // The reference's own column header has a typo here ("Sate Line
        // Department", checked live 2026-09-03:
        // https://atariams.org/miscellaneous/view-sac-meeting) - client
        // direction, 2026-09-03: keep the correct spelling on this app
        // rather than reproducing the reference's error.
        label: "Total Statutory Members Present (State Line Department)",
        formLabel: "Statutory Members Present (State Line Dept.)",
        numeric: true,
      },
      { key: "recommendations", label: "Salient Recommendations" },
      { key: "actionTaken", label: "Action - Taken" },
      { key: "actionCompliance", label: "Action - In Compliance" },
      { key: "reason", label: "Action - Reason" },
      { key: "file", label: "File/Proceeding", fileKind: "document", uploadKind: "sac-meeting-file" },
    ],
  ),
  /** Columns re-confirmed live 2026-08-25 - exact match. No `cardLabel` override (client direction, 2026-09-03 - same as SAC Meetings above), so the card shows the full label below instead of a shortened "Other Meetings related to ATARI". */
  leaf(
    "other-meetings",
    "Details of other meeting related to ATARI",
    [
      { key: "kvk", label: "KVK Name" },
      { key: "date", label: "Date" },
      { key: "meetingType", label: "Type of Meeting" },
      { key: "agenda", label: "Agenda" },
      {
        key: "representativeFromAtari",
        label: "Representative from ATARI",
      },
    ],
  ),
]);

/**
 * Form Management -> Miscellaneous. Real columns confirmed live via the
 * client's Form Management the reference reference (2026-08-20) - real rows
 * seen for RAWE/FET/FIT Programme (KVK Gumla, KVK Rohtas) and List of VIP
 * Visitors (KVK Nalanda). PPV & FRA Sensitization turned out to be 2
 * distinct real forms (Training Programme + Farmer Details), not one -
 * corrected from the earlier single-leaf guess.
 */
const miscellaneous = group("miscellaneous", "Miscellaneous", [
  leaf("prevalent-diseases-crops", "Prevalent Diseases in Crops", [
    { key: "kvk", label: "KVK Name", readonly: true },
    { key: "diseaseName", label: "Name of the Disease", required: true },
    { key: "crop", label: "Crop", required: true },
    { key: "outbreakDate", label: "Date of Outbreak", fieldKind: "date", required: true },
    { key: "areaAffected", label: "Area Affected (in ha)", required: true },
    { key: "commodityLossPercent", label: "% Commodity Loss", required: true },
    {
      key: "preventiveMeasures",
      label: "Preventive Measures Taken for Area (in ha)",
      required: true,
      numeric: false,
    },
  ]),
  leaf("prevalent-diseases-livestock", "Prevalent Diseases in Livestock", [
    { key: "kvk", label: "KVK Name", readonly: true },
    { key: "diseaseName", label: "Name of the Disease", required: true },
    { key: "speciesAffected", label: "Species Affected", required: true },
    { key: "outbreakDate", label: "Date of Outbreak", fieldKind: "date", required: true },
    { key: "mortalityMorbidity", label: "Number of Death/Morbidity Rate (%)", required: true, numeric: false },
    { key: "animalsVaccinated", label: "Number of Animals Vaccinated", required: true },
    {
      key: "preventiveMeasures",
      label: "Preventive Measures Taken for Area (in ha)",
      required: true,
      numeric: false,
    },
    // Real reference (atariams.org/prevalent-diseases/livestock/create, 2026-09-04) has neither of these on its own table or Add form at all - genuine extras on our side (a copy from the Crop disease leaf's own real fields), kept per instruction not to delete extra fields, just hidden from the table to match the reference's own 7-column list.
    { key: "areaAffected", label: "Area Affected (ha)", formOnly: true },
    { key: "commodityLossPercent", label: "% Commodity Loss", formOnly: true },
  ]),
  leaf("nyk-training", "NYK Training", [
    { key: "kvk", label: "KVK Name", readonly: true },
    { key: "programmeTitle", label: "Title of the Training Programme", required: true },
    { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
    { key: "endDate", label: "End Date", fieldKind: "date", required: true },
    // Real reference (atariams.org/nehru-yuva-kendra/create, 2026-09-04) has no plain Male/Female inputs at all - only the real General/OBC/SC/ST x M/F breakdown below, with Male/Female as its own table's aggregate columns. Server-computed from that breakdown (lib/leaf-record-registry.ts), never a real form input.
    { key: "male", label: "Male", readonly: true },
    { key: "female", label: "Female", readonly: true },
    { key: "fundReceived", label: "Amount of Fund Received (Rs)", required: true },
    { key: "participantsBreakdown", label: "No. of the Participant", fieldKind: "demographic-breakdown", demographicVariant: "grid", formOnly: true },
  ]),
  group("ppv-fra-sensitization", "PPV & FRA Sensitization", [
    leaf(
      "ppv-fra-training-programme",
      "PPV & FRA Sensitization Training Programme",
      [
        { key: "kvk", label: "KVK Name", readonly: true },
        { key: "date", label: "Date", fieldKind: "date", required: true },
        { key: "title", label: "Title", required: true },
        { key: "type", label: "Type", required: true, sourceMaster: { master: "ppv-fra-training-type", optionKey: "name" } },
        { key: "venue", label: "Venue", required: true },
        { key: "resourcePerson", label: "Resource Person", required: true },
        // Real reference (atariams.org/sensitization-training-programme/create, 2026-09-04) has no separate "No. of Participants" input - only the real General/OBC/SC/ST x M/F breakdown below. Server-computed from that breakdown, never a real form input.
        { key: "participants", label: "No. of Participants", readonly: true },
        { key: "farmersDetails", label: "No. of the Participant", fieldKind: "demographic-breakdown", demographicVariant: "grid", formOnly: true },
      ],
    ),
    leaf("ppv-fra-farmer-details", "PPV & FRA Sensitization Farmer Details", [
      { key: "kvk", label: "KVK Name", readonly: true },
      { key: "year", label: "Year", formLabel: "Reporting Year", required: true },
      { key: "crop", label: "Crop", formLabel: "Name of Crop Registered", required: true },
      { key: "registrationNo", label: "Registration No.", required: true },
      { key: "farmerName", label: "Farmer Name", required: true },
      { key: "block", label: "Block", required: true },
      { key: "district", label: "District", required: true },
      { key: "mobileNo", label: "Mobile No.", required: true, formOnly: true },
      { key: "village", label: "Village", required: true, formOnly: true },
      { key: "characteristics", label: "Characteristics", required: true, formOnly: true },
      // Real Add form field confirmed live (2026-09-04) - a multi-file upload, missing entirely before, not required (no asterisk), not a table column.
      { key: "moduleImages", label: "Images", fieldKind: "photos", formOnly: true },
    ]),
  ]),
  leaf("rawe-fet-fit-programme", "RAWE/FET/FIT Programme", [
    { key: "startDate", label: "Start Date", fieldKind: "date", required: true },
    { key: "endDate", label: "End Date", fieldKind: "date", required: true },
    { key: "kvk", label: "KVK", readonly: true },
    { key: "attachmentType", label: "Attachment Type", required: true },
    // Real reference (atariams.org/rawe-program/create, 2026-09-04) - a real file upload ("Attachment Upload"), not free text; not required (no asterisk).
    { key: "attachment", label: "Attachment", fileKind: "document", uploadKind: "rawe-attachment" },
    // Real reference has no separate "Number of Student"/"No. of Days Stayed" inputs - only "No. of Male"/"No. of Female" (Student section) below, with Start/End Date's own difference. Both server-computed (lib/leaf-record-registry.ts), never real form inputs.
    { key: "numberOfStudents", label: "Number of Student", readonly: true },
    { key: "daysStayed", label: "No of Days Stayed", readonly: true },
    { key: "male", label: "No. of Male", required: true, formOnly: true },
    { key: "female", label: "No. of Female", required: true, formOnly: true },
  ]),
  leaf("vip-visitors", "List of VIP Visitors", [
    { key: "kvk", label: "KVK", readonly: true },
    { key: "visitDate", label: "Date of Visit", fieldKind: "date", required: true },
    { key: "dignitaryType", label: "Type of Dignitaries", required: true, sourceMaster: { master: "vip-dignitary", optionKey: "name" } },
    { key: "ministerName", label: "Name of Hon'ble Minister", required: true },
    { key: "observations", label: "Salient Points in His/Her Observation", required: true },
  ]),
  /**
   * Real sub-items, placement (nested under Miscellaneous Information), and
   * columns confirmed against the client's own live atariams.org
   * screenshots for all 5 Digital Information sub-forms (2026-08-24).
   * Reporting Year/KVKs are filters there, not columns. Client direction,
   * 2026-09-04: keep this nested here (this app's own deliberate structure)
   * rather than matching the live reference's own separate top-level
   * placement - only this leaf group's internal fields/table needed fixing.
   */
  group("digital-information", "Digital Information", [
    leaf("digital-mobile-app", "Details of Mobile App", [
      { key: "kvk", label: "KVK Name" },
      {
        key: "mobileAppsDeveloped",
        label: "Number of Mobile Apps Developed by KVK",
        numeric: true,
      },
      { key: "appName", label: "Name of the Apps" },
      { key: "appLanguage", label: "Language of the Apps" },
      {
        key: "meantFor",
        label: "Meant for Crop/Livestock/Fishery/Others",
      },
      { key: "timesDownloaded", label: "No. of Times Downloaded" },
    ]),
    leaf("digital-web-portal", "Details of Web Portal", [
      { key: "kvk", label: "KVK Name" },
      // Real reference table (atariams.org/miscellaneous/view-ict-web-portal, 2026-09-04) has only 3 real columns (KVK/visitors/farmersRegistered) - no "Name of Web portal" column, hidden from ours to match. Kept as a form-only field since the reference itself gives no Add form to confirm it doesn't belong on the form too.
      { key: "portalName", label: "Name of Web portal", formOnly: true },
      { key: "visitors", label: "No. of Visitors Visited the Portal" },
      {
        key: "farmersRegistered",
        label: "No. of Farmers Registered on the Portal",
      },
    ]),
    leaf("digital-kisan-sarathi", "Details of Kisan Sarathi", [
      { key: "kvk", label: "KVK Name" },
      {
        key: "farmersRegisteredKsp",
        label: "No. of Farmers Registered on KSP Portal",
      },
      { key: "phoneCallAddressed", label: "Phone Call Addressed", numeric: true },
      { key: "answeredCall", label: "Answered Call", numeric: true },
    ]),
    leaf(
      "digital-kmas",
      "Kisan Mobile Advisory Services/KMAS(m-Kisan Portal/National Farmers Portal/ SMS Portal)",
      [
        { key: "kvk", label: "KVK Name" },
        { key: "farmersCovered", label: "No. of Farmers Covered" },
        { key: "advisoriesSent", label: "No of Advisories Sent" },
        { key: "messagesCrop", label: "Type of Messages - Crop", staticOptions: ["Yes", "No"], defaultValue: "No" },
        { key: "messagesLivestock", label: "Type of Messages - Livestock", staticOptions: ["Yes", "No"], defaultValue: "No" },
        { key: "messagesWeather", label: "Type of Messages - Weather", staticOptions: ["Yes", "No"], defaultValue: "No" },
        { key: "messagesMarketing", label: "Type of Messages - Marketing", staticOptions: ["Yes", "No"], defaultValue: "No" },
        { key: "messagesAwareness", label: "Type of Messages - Awareness", staticOptions: ["Yes", "No"], defaultValue: "No" },
        {
          key: "messagesOtherEnterprises",
          label: "Type of Messages - Other Enterprises",
          staticOptions: ["Yes", "No"],
          defaultValue: "No",
        },
        { key: "messagesAnyOther", label: "Type of Messages - Any Other" },
      ],
      undefined,
      undefined,
      undefined,
      undefined,
      /** Full label is too long to fit this page's own sibling-tab bar on one line (client direction, 2026-09-02) - shortened tab text only, breadcrumb/page title keep the real full name above. */
      "Kisan Mobile Advisory Services (KMAS)",
    ),
    leaf(
      "digital-other-channels",
      "Details of messages send through other channels",
      [
        { key: "kvk", label: "KVK Name" },
        { key: "textAdvisories", label: "Advisories Through Text Messages", numeric: true },
        {
          key: "textFarmers",
          label: "No. of Farmers Sent Text Messages",
        },
        { key: "whatsappAdvisories", label: "Advisories Through WhatsApp", numeric: true },
        { key: "whatsappFarmers", label: "No. of Farmers Sent WhatsApp" },
        {
          key: "socialMediaAdvisories",
          label: "Advisories Through Social Media",
          numeric: true,
        },
        {
          key: "socialMediaFarmers",
          label: "No. of Farmers Sent Social Media",
        },
        {
          key: "weatherBulletinAdvisories",
          label: "Advisories Through Weather Advisory Bulletin",
          numeric: true,
        },
        {
          key: "weatherBulletinFarmers",
          label: "No. of Farmers Sent Weather Advisory Bulletin",
        },
        // Real reference table (atariams.org/miscellaneous/view-ict-other-channel, 2026-09-04) has only the 8 real Advisories/Farmers-sent columns above (KVK + 8) - these next 9 fields are a stray copy-paste of the sibling KMAS leaf's own fields (audit finding, 2026-09-04), not real columns of this leaf at all. Hidden from the table rather than deleted, per this session's own "don't delete extra fields" policy.
        {
          key: "channel",
          label: "Channel",
          formOnly: true,
          staticOptions: [
            "Advisories through Text messages",
            "Advisories through WhatsApp",
            "Advisories through weather advisory bulletin",
            "Advisories through social media/FB/Twitter/Instagram/Other",
          ],
        },
        { key: "farmersCovered", label: "No. of Farmers Covered", formOnly: true },
        { key: "advisoriesSent", label: "No. of Advisories Sent", formOnly: true },
        { key: "messagesCrop", label: "Type of Messages - Crop", formOnly: true },
        { key: "messagesLivestock", label: "Type of Messages - Livestock", formOnly: true },
        { key: "messagesWeather", label: "Type of Messages - Weather", formOnly: true },
        { key: "messagesMarketing", label: "Type of Messages - Marketing", formOnly: true },
        { key: "messagesAwareness", label: "Type of Messages - Awareness", formOnly: true },
        { key: "messagesOtherEnterprises", label: "Type of Messages - Other Enterprises", formOnly: true },
      ],
    ),
  ]),
]);

export const FORM_MANAGEMENT: NavItem[] = [
  aboutKvk,
  achievements,
  projects,
  performanceIndicators,
  meetings,
  miscellaneous,
];

export const SIDEBAR: SidebarSection[] = [
  {
    slug: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    icon: "dashboard",
  },
  {
    slug: "form-summary",
    label: "Form Summary",
    href: "/form-summary",
    icon: "form-summary",
  },
  {
    slug: "masters",
    label: "All Masters",
    icon: "masters",
    children: ALL_MASTERS,
  },
  {
    slug: "role-management",
    label: "Role Management",
    href: "/role-management",
    icon: "role-management",
  },
  {
    slug: "user-management",
    label: "User Management",
    href: "/user-management",
    icon: "user-management",
  },
  {
    slug: "forms",
    label: "Form Management",
    icon: "form-management",
    children: FORM_MANAGEMENT,
  },
  {
    slug: "module-images",
    label: "Module Images",
    href: "/module-images",
    icon: "module-images",
  },
  { slug: "targets", label: "Targets", href: "/targets", icon: "targets" },
  {
    slug: "log-history",
    label: "Log History",
    href: "/log-history",
    icon: "log-history",
  },
  {
    slug: "data-audit-log",
    label: "Data Audit Log",
    href: "/data-audit-log",
    icon: "data-audit-log",
  },
  {
    slug: "notifications",
    label: "Notifications",
    href: "/notifications",
    icon: "notifications",
  },
  { slug: "reports", label: "Reports", href: "/reports", icon: "reports" },
];

/**
 * Top-level sidebar/search slugs hidden for every non-Super-Admin role (KVK
 * Admin and KVK User share one menu for now). All Masters is global reference
 * data only Super Admin curates. Role Management and User Management are
 * hidden for KVK roles per client direction (2026-09-07) until KVK-level user
 * administration is actually needed - the pages themselves also bounce a KVK
 * session back to the dashboard, and the Ctrl+K search drops these entries
 * for the same roles.
 */
export const KVK_HIDDEN_SLUGS = new Set([
  "masters",
  "role-management",
  "user-management",
  "data-audit-log",
]);

export type SearchResult = {
  label: string;
  href: string;
  /** Breadcrumb-style path shown under the label, e.g. "All Masters / Basic Masters". */
  section: string;
};

export type NavLeafPath = { path: string; label: string; groupLabel: string };

/** Every leaf under a tree, with its full slug path and its top-level group label - used by the Reports "Select Form" checklist to let a user pick a specific sub-item (e.g. just "Employee Details" inside About KVK) rather than only whole top-level categories. */
export function flattenLeafPaths(
  items: NavItem[],
  basePath = "",
  groupLabel = "",
): NavLeafPath[] {
  return items.flatMap((item) => {
    const path = basePath ? `${basePath}/${item.slug}` : item.slug;
    const currentGroupLabel = groupLabel || item.label;
    if (item.type === "leaf") {
      return [{ path, label: item.label, groupLabel: currentGroupLabel }];
    }
    return flattenLeafPaths(item.children, path, currentGroupLabel);
  });
}

function flattenNavTree(
  items: NavItem[],
  basePath: string,
  section: string,
): SearchResult[] {
  return items.flatMap((item) => {
    const href = `${basePath}/${item.slug}`;
    if (item.type === "leaf") {
      return [{ label: item.label, href, section }];
    }
    return [
      { label: item.label, href, section },
      ...flattenNavTree(item.children, href, `${section} / ${item.label}`),
    ];
  });
}

/** Every navigable page in the app, flattened for the sidebar's Ctrl+K search. */
export const SEARCH_INDEX: SearchResult[] = SIDEBAR.flatMap((section) => {
  if (section.children) {
    return [
      { label: section.label, href: `/${section.slug}`, section: "" },
      ...flattenNavTree(section.children, `/${section.slug}`, section.label),
    ];
  }
  return [{ label: section.label, href: section.href!, section: "" }];
});

/**
 * Resolves a slug path (e.g. ["other", "resource", "equipment"]) to the
 * node it points at - a leaf (rendered as a list page) or a group
 * (rendered as a card grid of its children) - plus the breadcrumb trail.
 */
export function resolveNavPath(
  root: NavItem[],
  slugPath: string[],
): { node: NavItem; trail: NavItem[] } | null {
  let items = root;
  const trail: NavItem[] = [];

  for (let i = 0; i < slugPath.length; i++) {
    const current = items.find((item) => item.slug === slugPath[i]);
    if (!current) return null;
    trail.push(current);

    const isLastSegment = i === slugPath.length - 1;
    if (isLastSegment) return { node: current, trail };
    if (current.type === "leaf") return null;
    items = current.children;
  }

  return null;
}
