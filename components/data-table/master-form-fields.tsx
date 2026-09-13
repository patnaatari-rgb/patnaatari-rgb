"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SimpleSelect } from "@/components/ui/simple-select";
import { FileUploadField } from "./file-upload-field";
import { FormPhotosField, type FormPhoto } from "./form-photos-field";
import { DemographicBreakdown, DemographicGrid, type DemographicValues } from "./demographic-breakdown";
import { NfParametersField } from "./nf-parameters-field";
import { MonthQuarterGridField } from "./month-quarter-grid-field";
import { useCascadeOptions } from "./use-cascade-options";
import { isNumericLabel } from "@/lib/numeric-field";
import { compactPlaceholder } from "@/lib/compact-placeholder";
import type { MasterColumn } from "@/lib/navigation";

export const DEMOGRAPHIC_KEYS = [
  "generalMale", "generalFemale", "obcMale", "obcFemale",
  "scMale", "scFemale", "stMale", "stFemale",
] as const;

/** "farmers" + "generalMale" -> "farmersGeneralMale" (real Prisma column name) - no prefix leaves the bare suffix untouched. Shared by every reader/writer of a prefixed demographic-breakdown block (this file, EmptyDataTable's openEdit, leaf-record-registry.ts) so they can never drift out of sync on casing. */
export function prefixedDemographicKey(prefix: string, suffix: string): string {
  return prefix ? `${prefix}${suffix[0].toUpperCase()}${suffix.slice(1)}` : suffix;
}

/** Whether a `showWhen`-gated column should be visible / validated given the current form values. */
export function matchesShowWhen(
  showWhen: NonNullable<MasterColumn["showWhen"]>,
  values: Record<string, string>,
): boolean {
  const current = values[showWhen.key] ?? "";
  return Array.isArray(showWhen.equals)
    ? showWhen.equals.includes(current)
    : current === showWhen.equals;
}

/**
 * Any column that holds a calendar date renders as a native date picker,
 * whether or not it was explicitly tagged `fieldKind: "date"` - the key
 * ends in "date"/"Date" (startDate, endDate, dateOfJoining, outbreakDate,
 * ...) or the label reads as a date (client request, 2026-09-07: "jaha
 * bhi date hai waha calendar dalo"). Same key/label heuristic the list's
 * own date-range filter already uses.
 */
function isDateColumn(column: { key: string; label: string; fieldKind?: string }): boolean {
  return (
    column.fieldKind === "date" ||
    column.key === "date" ||
    /date$/i.test(column.key) ||
    /\bdate\b/i.test(column.label)
  );
}

/** An end/completion date column - its picker gets a `min` of the form's own start date so a range can't run backwards (client request, 2026-09-07). */
function isEndDateColumn(column: { key: string; label: string }): boolean {
  return (
    /^(end|to|completion)/i.test(column.key) ||
    /end date|completion date|to date/i.test(column.label)
  ) && isDateColumn(column);
}

/** The matching start date's current value, so an end-date picker can use it as `min`. */
function startDateValue(formValues: Record<string, string>): string | undefined {
  for (const key of ["startDate", "fromDate", "dateOfStart", "commencementDate"]) {
    if (formValues[key]?.trim()) return formValues[key];
  }
  const startKey = Object.keys(formValues).find(
    (k) => /^(start|from)/i.test(k) && /date$/i.test(k) && formValues[k]?.trim(),
  );
  return startKey ? formValues[startKey] : undefined;
}

/**
 * Which columns cascade for each `cascadeType`, keyed separately per type
 * rather than one shared set - district-master's own "districtName" column
 * is the free-text name of the record being created, while institute's
 * "districtName" is a real cascading parent picker, so the same key can't
 * share one global membership test across both.
 */
const CASCADE_FIELDS: Record<string, Set<string>> = {
  district: new Set(["zoneName", "stateName"]),
  kvk: new Set(["zoneName", "stateName", "hostOrg"]),
  institute: new Set(["zoneName", "stateName", "districtName"]),
};

/**
 * Options for one `sourceMaster` field, fetched once per source master
 * (not once per field) and cached for the component's lifetime - Category
 * and Sub-category both source from the same "sector" master, so without
 * this cache a form with several sourceMaster fields would re-fetch the
 * same list once per field on every render.
 */
const sourceMasterCache = new Map<string, Promise<Record<string, string>[]>>();

/**
 * Sentinel `sourceMaster.master` values that resolve to one KVK's own records
 * (its Staff / Vehicles / Equipments / FLDs), not a real zone-wide master
 * slug - these belong to a single KVK, unlike every other cross-master
 * dropdown, so each has its own `/api/*-options` endpoint instead of a
 * `/api/master-options` slug. The reference's own "Vehicle" / "Equipment"
 * selects on the yearly Vehicle/Equipment Details forms pull the same
 * per-KVK list; `__fld__` is the same idea for the "FLD Name"/"FLD" fields
 * on Extension & Training activities under FLD and Technical Feedback on
 * FLD, added 2026-09-13 so both pick from real FLD records instead of free
 * text.
 */
const STAFF_SOURCE = "__staff__";
const PER_KVK_OPTION_ENDPOINTS: Record<string, string> = {
  [STAFF_SOURCE]: "/api/staff-options",
  /** Client direction, 2026-09-13: Scientist Award's "Scientist"/"Head/Scientist" field means only SMS or KVK Head too, same restriction as OFT's and FLD's own "Name of SMS/KVK Head" (which use this same /api/staff-options?role=sms-head filter directly, being bespoke forms) - every other __staff__ field (Extension Activities, Training's Course Co-ordinator, HRD, ...) stays the full roster. */
  __staff_sms_head__: "/api/staff-options?role=sms-head",
  __vehicle__: "/api/vehicle-options",
  __equipment__: "/api/equipment-options",
  __fld__: "/api/fld-options",
};

function fetchRows(url: string): Promise<Record<string, string>[]> {
  return fetch(url, { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : { rows: [] }))
    .then((data) => (data.rows ?? []) as Record<string, string>[])
    .catch(() => []);
}

/** A dropdown row that should behave as the free-text "Other" choice by its name alone (no "Mark as Other" flag needed). Exact match only - "Other Enterprises" is a real category, not this. */
export function isOtherName(name: string | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  return n === "other" || n === "others";
}

function fetchSourceMasterRows(master: string): Promise<Record<string, string>[]> {
  const perKvkUrl = PER_KVK_OPTION_ENDPOINTS[master];
  // The per-KVK lists (Staff / Vehicles / Equipments) are edited by the KVK
  // admin in the same session - a vehicle just added on View Vehicles must
  // appear in this dropdown right away - so never serve those from the cache.
  if (perKvkUrl) return fetchRows(perKvkUrl);

  let cached = sourceMasterCache.get(master);
  if (!cached) {
    cached = fetchRows(`/api/master-options?slug=${encodeURIComponent(master)}`);
    sourceMasterCache.set(master, cached);
  }
  return cached;
}

/** Red "*" after a field's label when `MasterColumn.required` is set - same convention as the reference's own Create forms. */
function FieldLabel({ htmlFor, required, children }: { htmlFor: string; required?: boolean; children: ReactNode }) {
  return (
    <Label htmlFor={htmlFor}>
      {children}
      {required && <span className="text-destructive"> *</span>}
    </Label>
  );
}

/** A <select> populated by another master's real saved rows instead of free text - see MasterColumn.sourceMaster. */
function SourceMasterField({
  column,
  fieldId,
  label,
  required,
  value,
  dependsOnValue,
  dependsOnLabel,
  disabled,
  onChange,
  enableOtherOption,
}: {
  column: MasterColumn & { sourceMaster: NonNullable<MasterColumn["sourceMaster"]> };
  fieldId: string;
  label: string;
  required?: boolean;
  value: string;
  dependsOnValue?: string;
  dependsOnLabel?: string;
  disabled: boolean;
  onChange: (value: string, extras?: Record<string, string>) => void;
  /**
   * Whether a row flagged "Mark as Other option" should turn into a free-text
   * "Other" choice here. Only true for Form Management data-entry forms - in an
   * All Masters form this same field is just a parent picker (e.g. the Subject
   * Name select when creating an OFT Thematic Area), where a typed-in value
   * makes no sense.
   */
  enableOtherOption: boolean;
}) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { master, optionKey, filterKey, carryForwardFrom } = column.sourceMaster;

  useEffect(() => {
    let cancelled = false;
    fetchSourceMasterRows(master).then((r) => {
      if (!cancelled) {
        setRows(r);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [master]);

  const cascadeRows = rows.filter(
    (row) => !filterKey || !dependsOnValue || row[filterKey] === dependsOnValue,
  );

  /**
   * The dropdown's "Other" choice - picking it opens a free-text input beside
   * the select so the user can type a value that isn't in the list. The typed
   * text is what gets submitted; the select stays parked on the Other row so
   * the input keeps showing.
   *
   * A row a Super Admin flagged "Mark as Other option" wins; otherwise a row
   * literally named "Other"/"Others" is treated as the Other choice
   * automatically (most masters already ship one, and expecting the admin to
   * also tick a box on it is a redundant step).
   *
   * Sourced from the full unfiltered set, so it stays offered once the parent
   * field is set even when it belongs to a different parent than the one
   * chosen - it's an escape hatch, not real cascade data.
   */
  const otherRow = enableOtherOption
    ? (rows.find((row) => row._isOther === "1") ?? rows.find((row) => isOtherName(row[optionKey])))
    : undefined;
  const otherName = otherRow?.[optionKey];
  const filteredRows =
    otherRow && !cascadeRows.includes(otherRow) ? [...cascadeRows, otherRow] : cascadeRows;
  // "Other" always sorts last (client direction, 2026-09-12 - same rule
  // OtherAwareSelect's own options list already follows for OFT/FLD) - a
  // plain alphabetical sort could put it anywhere, which this used to do.
  const options = Array.from(
    new Set(filteredRows.map((row) => row[optionKey]).filter((v): v is string => Boolean(v))),
  ).sort((a, b) => {
    if (a === otherName) return b === otherName ? 0 : 1;
    if (b === otherName) return -1;
    return a.localeCompare(b);
  });
  const isOtherActive = Boolean(otherName) && (value === otherName || (Boolean(value) && !options.includes(value)));

  /** Picking a real option: optionally carry forward related fields from an endpoint. */
  async function handleSelect(picked: string) {
    if (!carryForwardFrom || !picked || picked === otherName) {
      onChange(picked);
      return;
    }
    try {
      const res = await fetch(`${carryForwardFrom}?value=${encodeURIComponent(picked)}`);
      const data = await res.json();
      const fields =
        data?.fields && typeof data.fields === "object"
          ? (data.fields as Record<string, string>)
          : undefined;
      onChange(picked, fields);
    } catch {
      onChange(picked);
    }
  }

  // Reference's own "empty options" caption (confirmed live, 2026-09-03 client screenshot: "No product types available for this category" / "No products available for this type" under Production & Supply's cascading Product Type/Product selects) - shown whenever the real fetched list resolves to zero rows, not just while genuinely waiting on the parent field.
  const noOptions = loaded && !disabled && options.length === 0;
  const captionNoun = `${(column.formLabel ?? column.label).toLowerCase()}s`;
  const dependsOnNoun = dependsOnLabel?.trim().split(/\s+/).pop()?.toLowerCase();

  const select = (
    <SimpleSelect
      id={fieldId}
      value={isOtherActive && otherName ? otherName : value}
      disabled={disabled}
      onValueChange={handleSelect}
      placeholder={
        disabled
          ? `Select ${compactPlaceholder(dependsOnLabel ?? "the required field")} first`
          : (column.placeholder ?? `Select ${compactPlaceholder(column.formLabel ?? column.label)}`)
      }
      options={options.map((option) => ({ value: option, label: option }))}
      className={cn("h-10 w-full", noOptions && "rounded-b-none")}
    />
  );

  const noOptionsCaption = noOptions && (
    <div className="flex items-center gap-1.5 rounded-b-md border border-t-0 border-border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
      <Info className="size-3.5 shrink-0" />
      <span>No {captionNoun} available{dependsOnNoun ? ` for this ${dependsOnNoun}` : ""}</span>
    </div>
  );

  if (!isOtherActive) {
    return (
      <div className="space-y-1.5">
        <FieldLabel htmlFor={fieldId} required={required}>
          {label}
        </FieldLabel>
        {select}
        {noOptionsCaption}
      </div>
    );
  }

  // Beside the select, not below it - same "Please specify" pattern as
  // OtherAwareSelect (OFT/FLD's own bespoke forms) instead of this
  // component's old bare "Enter value" input with no label of its own
  // (client report, 2026-09-13). Two parallel Label+field blocks at the
  // same DOM depth, not one shared label above a flex row, so both labels
  // land on the same line - the exact same fix OtherAwareSelect needed for
  // this same reason.
  return (
    <div className="flex items-start gap-3" style={{ gridColumn: "span 2" }}>
      <div className="flex-1 space-y-1.5">
        <FieldLabel htmlFor={fieldId} required={required}>
          {label}
        </FieldLabel>
        {select}
        {noOptionsCaption}
      </div>
      <div className="flex-1 space-y-1.5">
        <Label htmlFor={`${fieldId}-other`}>Please specify</Label>
        <Input
          id={`${fieldId}-other`}
          className="h-10 w-full"
          placeholder={`Specify ${label}`}
          value={value === otherName ? "" : value}
          onChange={(e) => onChange(e.target.value.trim() ? e.target.value : (otherName as string))}
        />
      </div>
    </div>
  );
}

type MasterFormFieldsProps = {
  columns: MasterColumn[];
  cascadeType?: "district" | "kvk" | "institute";
  formValues: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  isSimpleMaster: boolean;
  markAsOther: boolean;
  onMarkAsOtherChange: (checked: boolean) => void;
  /**
   * Form Management data-entry forms only: lets a sourceMaster select whose
   * master has a row flagged "Mark as Other option" offer a free-text "Other"
   * choice. Off for All Masters forms, where the same selects are just
   * parent pickers. Defaults off.
   */
  enableOtherOption?: boolean;
};

/**
 * The per-column Add/Edit field list - one text field per confirmed column,
 * plus the cascading Zone->State->HostOrg selects for the two masters that
 * need them, plus the "Mark as 'Other' option" checkbox for simple
 * single-Name masters. Shared between EmptyDataTable's dialog (Masters,
 * Targets, Notifications) and the dedicated Add page (Form Management, per
 * client direction that Form Management's Add New opens a full page instead
 * of a popup) so the two flows don't duplicate this logic.
 */
export function MasterFormFields({
  columns,
  cascadeType,
  formValues,
  onChange,
  isSimpleMaster,
  markAsOther,
  onMarkAsOtherChange,
  enableOtherOption = false,
}: MasterFormFieldsProps) {
  const instanceId = useId();
  const cascade = useCascadeOptions(Boolean(cascadeType));
  /**
   * Real bug, 2026-09-13: "Reporting Year" fields with a plain `staticOptions`
   * list (Vehicle Details, Equipment Details) hardcoded "current year back
   * 3" - a real record from any other year (older arrears entry, or a
   * future-dated one like the 2027 OFT found this session) had no way to be
   * selected at all, not even to edit one that already existed. Real years
   * from every model this KVK (or, for Super Admin, the whole zone) actually
   * has data for - the exact same source /api/reports/years already
   * verified for the Reports checkbox - are merged into the static list
   * instead, so a year is never missing just because it's outside a fixed
   * window. Only fetched when this form actually has such a field.
   */
  const reportingYearColumn = columns.find((c) => c.key === "reportingYear" && c.staticOptions);
  const [realYears, setRealYears] = useState<string[]>([]);
  useEffect(() => {
    if (!reportingYearColumn) return;
    /**
     * Client direction, 2026-09-13: scoped to this leaf's own model
     * (`yearsModel`) - was the same shared, unscoped years-across-every-model-
     * in-the-app result every other Reporting Year field used, so e.g.
     * Vehicle Details' own dropdown could offer a year that only ever showed
     * up in some unrelated leaf's data, never Vehicle Details' own. A
     * `staticOptions` Reporting Year column without `yearsModel` set falls
     * back to that old unscoped union rather than fetching nothing - every
     * real one of these columns should set it, this is just the safe
     * default for one that doesn't.
     */
    const url = reportingYearColumn.yearsModel
      ? `/api/reports/years?model=${encodeURIComponent(reportingYearColumn.yearsModel)}`
      : "/api/reports/years";
    fetch(url)
      .then((res) => (res.ok ? res.json() : { years: [] }))
      .then((data) => setRealYears(data.years ?? []))
      .catch(() => {});
  }, [reportingYearColumn, reportingYearColumn?.yearsModel]);
  /** Form-field render order only - list columns elsewhere always read the raw `columns` prop untouched. Stable sort (index tiebreak, not relying on Array.sort's own stability) so fields without a formOrder keep their original relative position, just pushed after every numbered field. */
  const orderedColumns = columns
    .map((column, index) => ({ column, index }))
    .sort((a, b) => {
      const orderA = a.column.formOrder ?? Infinity;
      const orderB = b.column.formOrder ?? Infinity;
      return orderA !== orderB ? orderA - orderB : a.index - b.index;
    })
    .map(({ column }) => column);

  /**
   * Groups adjacent `pairWithNext` fields (e.g. Unit + Quantity) into one
   * shared grid cell, everything else stays one field per cell - see
   * MasterColumn's own `pairWithNext` comment for why. Consecutive
   * `fileKind` fields (Photo + Resume, ...) get the same treatment
   * automatically, no flag needed - full-width side by side (client
   * direction, 2026-09-03: "ek hi row me dono rkho jaise add new me kiya h",
   * matching how EmployeeDetailsAddForm's own hand-built "Photo & Resume"
   * section lays its two cards out) instead of the old one-per-row stack.
   */
  const renderUnits: (MasterColumn | MasterColumn[])[] = [];
  for (let i = 0; i < orderedColumns.length; i++) {
    const column = orderedColumns[i];
    const next = orderedColumns[i + 1];
    if (column.pairWithNext && next) {
      renderUnits.push([column, next]);
      i++;
    } else if (column.fileKind && next?.fileKind) {
      const group = [column];
      let j = i + 1;
      while (j < orderedColumns.length && orderedColumns[j].fileKind) {
        group.push(orderedColumns[j]);
        j++;
      }
      renderUnits.push(group);
      i = j - 1;
    } else {
      renderUnits.push(column);
    }
  }

  function renderColumn(column: MasterColumn) {
        // The "KVK" / "KVK Name" column is a list-only display column - a
        // Form Management record's KVK always comes from the logged-in KVK's
        // own session (the server uses ctx.kvkId, never a value from the
        // form), so there is nothing to pick and a KVK user shouldn't see a
        // field for it (client request, 2026-09-07).
        if (column.key === "kvk" || column.key === "kvkName") return null;
        // "calculated" is a real-but-disabled form field (has a value, just
        // not editable) - the opposite of what plain `readonly` means here
        // (dropped from the form entirely), so it has to bypass that check.
        if (column.readonly && column.fieldKind !== "calculated") return null;
        // Conditional field - only shown when another field's value matches.
        if (column.showWhen && !matchesShowWhen(column.showWhen, formValues)) return null;
        const fieldId = `${instanceId}-${column.key}`;
        const isCascading = Boolean(cascadeType && CASCADE_FIELDS[cascadeType]?.has(column.key));
        const isHostOrgField =
          cascadeType === "kvk" && column.key === "hostOrg";
        const isDistrictField =
          cascadeType === "institute" && column.key === "districtName";
        const isStateField = column.key === "stateName";

        if (column.fieldKind === "section-heading") {
          return (
            <p key={column.key} className="col-[1/-1] text-lg font-semibold text-primary">
              {column.label}
            </p>
          );
        }

        if (column.fieldKind === "calculated") {
          // Live preview as the source fields are filled in, not just the
          // stored value from a previous save (real bug, client report
          // 2026-09-13 - this showed blank for the entire Add flow otherwise,
          // only ever populated after a save+reload). Purely a preview: the
          // server always recomputes this column itself from the same
          // fields on save (leaf-record-registry.ts), so a derived render-time
          // value here can never drift from what actually gets saved.
          const displayValue = column.sumOf
            ? String(column.sumOf.reduce((sum, key) => sum + (Number(formValues[key]) || 0), 0))
            : (formValues[column.key] ?? "");
          return (
            <div key={column.key} className="space-y-1.5">
              <Label htmlFor={fieldId}>
                {column.formLabel ?? column.label} <span className="text-destructive">*</span>
              </Label>
              <Input id={fieldId} disabled value={displayValue} className="h-10 bg-muted" />
              {column.helperText && <p className="text-xs text-muted-foreground">{column.helperText}</p>}
            </div>
          );
        }

        if (column.fieldKind === "demographic-breakdown") {
          const prefix = column.demographicPrefix ?? "";
          const demoValues: DemographicValues = {};
          for (const suffix of DEMOGRAPHIC_KEYS) {
            demoValues[suffix] = formValues[prefixedDemographicKey(prefix, suffix)] ?? "";
          }
          const demoOnChange = (key: string, value: string) =>
            onChange({ ...formValues, [prefixedDemographicKey(prefix, key)]: value });
          return (
            <div key={column.key} className="space-y-2 sm:col-span-2 lg:col-span-3">
              <p className="text-lg font-semibold text-primary">{column.label}</p>
              {column.demographicVariant === "grid" ? (
                <DemographicGrid values={demoValues} onChange={demoOnChange} />
              ) : (
                <DemographicBreakdown values={demoValues} onChange={demoOnChange} />
              )}
            </div>
          );
        }

        if (column.fieldKind === "photos") {
          let photos: FormPhoto[] = [];
          try {
            const parsed = JSON.parse(formValues[column.key] || "[]");
            if (Array.isArray(parsed)) {
              photos = parsed
                .filter((p): p is FormPhoto => typeof p?.url === "string")
                .map((p) => ({ url: p.url, caption: typeof p.caption === "string" ? p.caption : "" }));
            }
          } catch {
            // Leave photos empty on malformed JSON rather than throwing.
          }
          return (
            <div key={column.key} className="sm:col-span-2 lg:col-span-3">
              <FormPhotosField
                label={column.formLabel ?? column.label}
                value={photos}
                onChange={(next) => onChange({ ...formValues, [column.key]: JSON.stringify(next) })}
              />
            </div>
          );
        }

        if (column.fieldKind === "nf-parameters") {
          return (
            <div key={column.key} className="space-y-2 sm:col-span-2 lg:col-span-3">
              <p className="text-sm font-semibold text-primary">{column.formLabel ?? column.label}</p>
              <NfParametersField
                value={formValues[column.key] ?? ""}
                onChange={(next) => onChange({ ...formValues, [column.key]: next })}
              />
            </div>
          );
        }

        if (column.fieldKind === "month-quarter-grid") {
          return (
            <div key={column.key} className="col-[1/-1]">
              <MonthQuarterGridField
                label={column.formLabel ?? column.label}
                value={formValues[column.key] ?? ""}
                onChange={(next) => onChange({ ...formValues, [column.key]: next })}
              />
            </div>
          );
        }

        if (column.fieldKind === "checkbox") {
          return (
            <label key={column.key} className="flex items-center gap-2 pt-6 text-sm text-foreground">
              <Checkbox
                id={fieldId}
                checked={formValues[column.key] === "true"}
                onCheckedChange={(checked) =>
                  onChange({ ...formValues, [column.key]: String(checked === true) })
                }
              />
              {column.formLabel ?? column.label}
            </label>
          );
        }

        if (column.staticOptions) {
          // Reporting Year: union the hardcoded "recent years" quick-picks
          // with every real year this scope's data actually has, plus
          // whatever value is already saved on this record (belt-and-braces
          // for the instant right after a fetch that hasn't landed yet) - see
          // `needsRealYears` above for why this can never regress to the old
          // fixed-window bug.
          const options =
            column.key === "reportingYear"
              ? Array.from(
                  new Set([...column.staticOptions, ...realYears, ...(formValues[column.key] ? [formValues[column.key]] : [])]),
                ).sort((a, b) => Number(b) - Number(a))
              : column.staticOptions;
          return (
            <div key={column.key} className="space-y-1.5">
              <FieldLabel htmlFor={fieldId} required={column.required}>
                {column.formLabel ?? column.label}
              </FieldLabel>
              <SimpleSelect
                id={fieldId}
                value={formValues[column.key] ?? ""}
                onValueChange={(v) => onChange({ ...formValues, [column.key]: v })}
                placeholder={column.placeholder ?? `Select ${compactPlaceholder(column.formLabel ?? column.label)}`}
                options={options.map((option) => ({ value: option, label: option }))}
                className="h-10"
              />
            </div>
          );
        }

        if (column.fileKind) {
          // Width/full-row wrapping is handled by the renderUnits grouping
          // above (a lone fileKind field still needs `col-[1/-1]` - the
          // card drop-zone style reads badly squeezed into a single
          // ~280px track - grouped ones get it from their shared wrapper).
          return (
            <FileUploadField
              key={column.key}
              column={column}
              fieldId={fieldId}
              value={formValues[column.key] ?? ""}
              onChange={(url) => onChange({ ...formValues, [column.key]: url })}
            />
          );
        }

        if (column.sourceMaster) {
          const { dependsOnKey } = column.sourceMaster;
          const dependsOnValue = dependsOnKey ? formValues[dependsOnKey] : undefined;
          const disabled = Boolean(dependsOnKey) && !dependsOnValue;
          return (
            <SourceMasterField
              key={column.key}
              column={column as MasterColumn & { sourceMaster: NonNullable<MasterColumn["sourceMaster"]> }}
              fieldId={fieldId}
              label={column.formLabel ?? column.label}
              required={column.required}
              value={formValues[column.key] ?? ""}
              dependsOnValue={dependsOnValue}
              dependsOnLabel={columns.find((c) => c.key === dependsOnKey)?.label}
              disabled={disabled}
              enableOtherOption={enableOtherOption}
              onChange={(value, extras) => {
                // Clear any field that itself sources from this one, so a changed parent can't leave a stale, now-invalid child selection behind.
                const dependents = Object.fromEntries(
                  columns
                    .filter((c) => c.sourceMaster?.dependsOnKey === column.key)
                    .map((c) => [c.key, ""]),
                );
                onChange({ ...formValues, [column.key]: value, ...dependents, ...(extras ?? {}) });
              }}
            />
          );
        }

        if (isCascading) {
          const options =
            column.key === "zoneName"
              ? cascade.zoneOptions
              : isStateField
                ? cascade.statesForZone(formValues.zoneName ?? "")
                : isHostOrgField
                  ? cascade.hostOrgsForState(formValues.stateName ?? "")
                  : isDistrictField
                    ? cascade.districtsForState(formValues.stateName ?? "")
                    : [];
          const disabled =
            (isStateField && !formValues.zoneName) ||
            (isHostOrgField && !formValues.stateName) ||
            (isDistrictField && !formValues.stateName);
          // A changed Zone/State must clear whatever downstream cascading field it invalidates - but only the ones this cascadeType actually cascades (institute's own districtName picks a real district, while district-master's own same-named field is the free-text name of the record being created, which must survive a Zone/State change untouched).
          const clearedDownstream: Record<string, string> =
            cascadeType === "institute" ? { hostOrg: "", districtName: "" } : { hostOrg: "" };

          return (
            <div key={column.key} className="space-y-1.5">
              <FieldLabel htmlFor={fieldId} required={column.required}>
                {column.label}
              </FieldLabel>
              <SimpleSelect
                id={fieldId}
                value={formValues[column.key] ?? ""}
                disabled={disabled}
                onValueChange={(v) =>
                  onChange({
                    ...formValues,
                    [column.key]: v,
                    ...(column.key === "zoneName" ? { stateName: "", ...clearedDownstream } : {}),
                    ...(isStateField ? clearedDownstream : {}),
                  })
                }
                placeholder={
                  disabled
                    ? `Select ${column.key === "stateName" ? "a zone" : "a state"} first`
                    : `Select ${compactPlaceholder(column.label)}`
                }
                options={options.map((option) => ({ value: option, label: option }))}
                className="h-10"
              />
            </div>
          );
        }

        return (
          <div key={column.key} className="space-y-1.5">
            <FieldLabel htmlFor={fieldId} required={column.required}>
              {column.formLabel ?? column.label}
            </FieldLabel>
            <Input
              id={fieldId}
              type={
                isDateColumn(column)
                  ? "date"
                  : column.numeric !== false && isNumericLabel(column.label, column.formLabel)
                    ? "number"
                    : undefined
              }
              min={isEndDateColumn(column) ? startDateValue(formValues) : undefined}
              className="h-10"
              value={formValues[column.key] ?? ""}
              placeholder={
                isDateColumn(column)
                  ? undefined
                  : (column.placeholder ?? `Enter ${compactPlaceholder(column.formLabel ?? column.label).toLowerCase()}`)
              }
              onChange={(event) =>
                onChange({ ...formValues, [column.key]: event.target.value })
              }
            />
          </div>
        );
  }

  return (
    <>
      {renderUnits.map((unit) => {
        if (Array.isArray(unit)) {
          const key = unit.map((c) => c.key).join("-");
          // A grouped run of fileKind fields (Photo + Resume, ...) - full
          // width, side by side, same as a pairWithNext pair's own shared
          // cell but spanning the whole row instead of one grid track.
          // auto-fit + a bounded 260-380px track (not an even split) so the
          // cards stay naturally sized instead of stretching to fill
          // whatever width the row has (client report, 2026-09-03).
          if (unit[0].fileKind) {
            return (
              <div key={key} className="col-[1/-1] grid grid-cols-[repeat(auto-fit,minmax(260px,380px))] gap-5">
                {unit.map((column) => renderColumn(column))}
              </div>
            );
          }
          return (
            <div key={key} className="grid grid-cols-2 gap-3">
              {renderColumn(unit[0])}
              {renderColumn(unit[1])}
            </div>
          );
        }
        // A lone (ungrouped) fileKind field spans the full row (`col-[1/-1]`)
        // but still gets a bounded 260-380px track of its own rather than
        // stretching to fill it (same reasoning as the grouped case above).
        return unit.fileKind ? (
          <div key={unit.key} className="col-[1/-1] grid grid-cols-[repeat(auto-fit,minmax(260px,380px))]">
            {renderColumn(unit)}
          </div>
        ) : (
          renderColumn(unit)
        );
      })}

      {isSimpleMaster && (
        // `col-[1/-1]` always puts this on its own full-width last line (client
        // direction, 2026-09-02) instead of landing wherever the compact
        // auto-fit grid happens to have room next to it - a no-op outside a
        // grid parent (e.g. EmptyDataTable's dialog), so safe unconditionally.
        <label className="col-[1/-1] flex items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={markAsOther}
            onCheckedChange={(checked) => onMarkAsOtherChange(checked === true)}
          />
          Mark as &quot;Other&quot; option{" "}
          <span className="text-muted-foreground">(lets users type a custom value in forms)</span>
        </label>
      )}
    </>
  );
}
