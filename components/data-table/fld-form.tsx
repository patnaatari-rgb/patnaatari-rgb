"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { PageHeader, type Crumb } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import { compactPlaceholder } from "@/lib/compact-placeholder";
import { DemographicGrid, type DemographicValues } from "./demographic-breakdown";
import { FormPhotosField, type FormPhoto } from "./form-photos-field";
import { FldResultFields } from "./fld-result-fields";
import { OtherAwareSelect } from "./other-aware-select";

type FldFormProps = {
  trail: Crumb[];
  backHref: string;
  /** Present in Edit mode (fetches the existing record); absent in Add mode (starts blank, status always "Ongoing" - same "no status selector on the main form" shape as OftForm, real status changes go through Mark Completed/Add Result instead). */
  id?: string;
  /** Which pill is active on load - the list page's own "Add Result" row action jumps straight to "result" via ?tab=result, same query-param convention OftForm's own toggle uses. */
  initialView?: "fld" | "result";
};

const currentYear = new Date().getFullYear();
/**
 * Same audit finding and fix as oft-form.tsx's matching constant, 2026-09-11
 * - this form also submitted `reportingYear` on every save with no rendered
 * field to set it.
 *
 * Real bug, 2026-09-13: this stayed a hardcoded "current year back 3" quick-
 * pick list even after empty-data-table.tsx's own Reporting Year filter and
 * master-form-fields.tsx's generic staticOptions fields were both fixed to
 * pull real years from the database - this is a bespoke form, so neither
 * fix reached it. First fix merged real years into that static list; client
 * direction, 2026-09-13 (same day): drop the hardcoded list entirely so the
 * dropdown is fully DB-driven, not just DB-supplemented - see
 * reportingYearOptions below, which is now just realYears + whatever year
 * this record already holds (currentYear, for a brand-new record).
 */

/** Dedupes and drops blank values before handing a list to SimpleSelect - real bug found 2026-09-01: mapping master rows straight to option strings let a blank/duplicate field value through as a literal "" option, crashing React with "two children with the same key ''" (see the identical fix in oft-form.tsx). */
function uniqueNonEmpty(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v?.trim()))));
}

type NamedRow = Record<string, string>;

/**
 * Real field set confirmed against the reference (atari-client.vercel.app,
 * 2026-08-15 screenshots) - Staff/Season/Sector/Thematic Area/Crop-Animal-
 * Enterprise/No. of demonstration/Unit/Quantity/Farmers Details were
 * missing entirely before (real schema gaps, now added). Sector -> Category
 * -> Sub Category -> Crop/Animal/Enterprise reuses the exact same cascading
 * masters All Masters' own Sector/Category/Sub-category/Crop pages already
 * manage - no new master infrastructure needed, just wiring it in here.
 */
export function FldForm({ trail, backHref, id, initialView }: FldFormProps) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<"fld" | "result">(initialView ?? "fld");
  const [sectorRows, setSectorRows] = useState<NamedRow[]>([]);
  const [categoryRows, setCategoryRows] = useState<NamedRow[]>([]);
  const [subCategoryRows, setSubCategoryRows] = useState<NamedRow[]>([]);
  const [cropRows, setCropRows] = useState<NamedRow[]>([]);
  const [thematicAreaRows, setThematicAreaRows] = useState<NamedRow[]>([]);
  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  const [seasonOptions, setSeasonOptions] = useState<string[]>([]);
  const [realYears, setRealYears] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(id));

  useEffect(() => {
    const fetchRows = (slug: string, setter: (rows: NamedRow[]) => void) =>
      fetch(`/api/master-options?slug=${slug}`)
        .then((res) => (res.ok ? res.json() : { rows: [] }))
        .then((data) => setter(data.rows ?? []))
        .catch(() => {});
    fetchRows("sector", setSectorRows);
    fetchRows("category", setCategoryRows);
    fetchRows("sub-category", setSubCategoryRows);
    fetchRows("crop", setCropRows);
    fetchRows("fld-thematic-area", setThematicAreaRows);
    /** Client direction, 2026-09-13: "Name of SMS/KVK Head" means only SMS/Head, not any staff member - see /api/staff-options' own comment. */
    fetch("/api/staff-options?role=sms-head")
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setStaffOptions(uniqueNonEmpty((data.rows ?? []).map((r: NamedRow) => r.name))))
      .catch(() => {});
    /** Real Season Master (audit finding, 2026-09-02 - the hardcoded Kharif/Rabi/Zaid list didn't match the real master's actual values, Kharif/Rabi/Summer). */
    fetch("/api/master-options?slug=season")
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setSeasonOptions(uniqueNonEmpty((data.rows ?? []).map((r: NamedRow) => r.name))))
      .catch(() => {});
    /** Client direction, 2026-09-13: scoped to FLD's own model - was the same unscoped union every other Reporting Year field used, offering years from unrelated leaves too. */
    fetch("/api/reports/years?model=fld")
      .then((res) => (res.ok ? res.json() : { years: [] }))
      .then((data) => setRealYears(data.years ?? []))
      .catch(() => {});
  }, []);

  const [reportingYear, setReportingYear] = useState(String(currentYear));
  /**
   * Fully DB-driven - no hardcoded year list. `reportingYear` is always
   * included alongside the real years so a brand-new record (defaulted to
   * `currentYear`, which may have zero saved records yet) and an old/edited
   * record's own value are never missing from their own dropdown.
   */
  const reportingYearOptions = useMemo(
    () =>
      Array.from(new Set([...realYears, reportingYear]))
        .filter(Boolean)
        .sort((a, b) => Number(b) - Number(a)),
    [realYears, reportingYear],
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [staff, setStaff] = useState("");
  const [season, setSeason] = useState("");
  const [sector, setSector] = useState("");
  const [thematicArea, setThematicArea] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [cropAnimalEnterprise, setCropAnimalEnterprise] = useState("");
  const [technologyDemonstrated, setTechnologyDemonstrated] = useState("");
  const [noOfDemonstration, setNoOfDemonstration] = useState("");
  /** Only ever read when the crop is the free-text "Other" one - see `unit`'s own derivation below. */
  const [unitOverride, setUnitOverride] = useState("");
  const [quantity, setQuantity] = useState("");
  const [status, setStatus] = useState("Ongoing");
  const [demographics, setDemographics] = useState<DemographicValues>({});
  const [moduleImages, setModuleImages] = useState<FormPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Cascade-filtered rows per parent selection. The flagged "Other" row is
  // sourced from the full set via OtherAwareSelect's `allRows`, so it stays
  // offered even when it sits under a different parent.
  const thematicAreaRowsFiltered = useMemo(
    () => thematicAreaRows.filter((r) => !sector || r.sectorName === sector),
    [thematicAreaRows, sector],
  );
  const categoryRowsFiltered = useMemo(
    () => categoryRows.filter((r) => !sector || r.sectorName === sector),
    [categoryRows, sector],
  );
  const subCategoryRowsFiltered = useMemo(
    () =>
      subCategoryRows.filter(
        (r) => (!sector || r.sectorName === sector) && (!category || r.categoryName === category),
      ),
    [subCategoryRows, sector, category],
  );
  const cropRowsFiltered = useMemo(
    () =>
      cropRows.filter(
        (r) =>
          (!sector || r.sectorName === sector) &&
          (!category || r.category === category) &&
          (!subCategory || r.subCategoryName === subCategory),
      ),
    [cropRows, sector, category, subCategory],
  );

  /**
   * Real Unit rule (client direction, 2026-09-13): only 3 cases, not a
   * per-crop value (Crop Master's own `unit` column exists but is empty on
   * all 1365 real rows right now, so nothing to key off there yet) -
   * Women Empowerment / Livestock and Fisheries / Other Enterprises always
   * report by count ("Number"); a free-text ("Other") crop lets the user
   * type whatever unit fits; every other real crop is demonstrated over an
   * area, so it's always "Ha" (Hectare). A plain derived value, not synced
   * state - `unit` is never really a choice except in the Other-crop case
   * (where it's exactly `unitOverride`, the one thing the user can type),
   * so there's nothing to hold in its own state or push via an effect.
   */
  const NUMBER_UNIT_SECTORS = ["Women Empowerment", "Livestock and Fisheries", "Other Enterprises"];
  const isNumberUnitSector = NUMBER_UNIT_SECTORS.includes(sector);
  const isOtherCrop =
    cropRows.find((r) => r.cropName === cropAnimalEnterprise)?._isOther === "1";
  const unit = isOtherCrop ? unitOverride : isNumberUnitSector ? "Number" : "Ha";
  /** Number-unit quantities are always whole counts; only "Ha" (area) allows a decimal fraction of a hectare. */
  function onQuantityChange(v: string) {
    setQuantity(unit === "Number" ? v.replace(/[^\d]/g, "") : v);
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/fld/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setReportingYear(data.reportingYear || String(currentYear));
        setStartDate(data.startDate ?? "");
        setEndDate(data.endDate ?? "");
        setStaff(data.staff ?? "");
        setSeason(data.season ?? "");
        setSector(data.sector ?? "");
        setThematicArea(data.thematicArea ?? "");
        setCategory(data.category ?? "");
        setSubCategory(data.subCategory ?? "");
        setCropAnimalEnterprise(data.cropAnimalEnterprise ?? "");
        setTechnologyDemonstrated(data.technologyDemonstrated ?? "");
        setNoOfDemonstration(data.noOfDemonstration ?? "");
        setUnitOverride(data.unit ?? "");
        setQuantity(data.quantity ?? "");
        setStatus(data.status ?? "Ongoing");
        setDemographics({
          generalMale: data.generalMale ?? "",
          generalFemale: data.generalFemale ?? "",
          obcMale: data.obcMale ?? "",
          obcFemale: data.obcFemale ?? "",
          scMale: data.scMale ?? "",
          scFemale: data.scFemale ?? "",
          stMale: data.stMale ?? "",
          stFemale: data.stFemale ?? "",
        });
        setModuleImages(Array.isArray(data.moduleImages) ? data.moduleImages : []);
      })
      .catch(() => setError("Could not load this record."))
      .finally(() => setLoading(false));
  }, [id]);

  async function submit() {
    if (!category || !subCategory || !technologyDemonstrated) {
      setError("Please fill all required fields.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const values = {
        reportingYear,
        startDate,
        endDate,
        staff,
        season,
        sector,
        thematicArea,
        category,
        subCategory,
        cropAnimalEnterprise,
        technologyDemonstrated,
        noOfDemonstration,
        unit,
        quantity,
        status: id ? status : "Ongoing",
        ...demographics,
        moduleImages: JSON.stringify(moduleImages),
      };
      const path = "achievements/front-line-demonstration/view-fld";
      const response = await fetch(
        id ? "/api/leaf-record/update" : "/api/leaf-record",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(id ? { path, id, values } : { path, values }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push(backHref);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function selectField(
    idAttr: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: string[],
    required?: boolean,
  ) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={idAttr}>
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
        <SimpleSelect
          id={idAttr}
          value={value}
          onValueChange={onChange}
          placeholder="Please Select"
          options={options.map((option) => ({ value: option, label: option }))}
          className="h-10"
        />
      </div>
    );
  }

  function textField(
    idAttr: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    required?: boolean,
    type: "text" | "number" | "date" = "text",
    /** For a completion/end date - can't be before this date. */
    min?: string,
    /** Unit's own two auto-set cases ("Number"/"Ha") - a real value, but never a free choice, so the input just displays it instead of accepting typing. */
    readOnly?: boolean,
  ) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={idAttr}>
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
        <Input
          id={idAttr}
          type={type}
          min={type === "date" ? min : undefined}
          className={cn("h-10", readOnly && "bg-muted/50")}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
          placeholder={type === "text" ? `Enter ${compactPlaceholder(label).toLowerCase()}` : undefined}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Full page heading (as opposed to the short "Edit FLD"/"Add FLD" tab-pill label below) - real reference (2026-09-02) spells it out as "Edit Front Line Demonstrations (FLD)". Slides in from the left as the card below slides in from the right (client direction, 2026-09-03) - the two converge toward the middle instead of both entering the same way. */}
      <div className="animate-in fade-in-0 slide-in-from-left-8 ease-out duration-300">
        <PageHeader
          backHref={backHref}
          trail={trail}
          title={
            activeView === "result"
              ? "Add FLD Result"
              : id
                ? "Edit Front Line Demonstrations (FLD)"
                : "Add Front Line Demonstrations (FLD)"
          }
        />
      </div>

      {/* "Edit/Add FLD / Add Result" tab pill - shown on both Add and Edit (client direction, 2026-09-02: "add new pe bhi same flow hona chahiye jo action mein hai"), same pattern as OftForm's own toggle. Add Result switches this same page in place (client direction, 2026-09-02: keep it consistent with OFT's own full-page Edit Result instead of a popup) and stays disabled until the record actually exists - a result belongs to a saved trial, there's no fldId to attach it to yet on a blank Add page. Sits below the Back/breadcrumb header (audit finding, 2026-09-02 - was built above it, backwards from CFLD's own established real order). */}
      <div className="mb-4 flex w-fit overflow-hidden rounded-full bg-primary p-1">
        <button
          type="button"
          onClick={() => setActiveView("fld")}
          className={cn(
            "rounded-full px-4 py-2 text-xs font-medium whitespace-nowrap transition-colors",
            activeView === "fld" ? "bg-card text-foreground shadow-sm" : "text-primary-foreground hover:bg-white/10",
          )}
        >
          {id ? "Edit FLD" : "Add FLD"}
        </button>
        <button
          type="button"
          onClick={() => setActiveView("result")}
          disabled={!id}
          title={id ? undefined : "Save the FLD first to add a result."}
          className={cn(
            "rounded-full px-4 py-2 text-xs font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
            activeView === "result" ? "bg-card text-foreground shadow-sm" : "text-primary-foreground hover:bg-white/10",
          )}
        >
          Add Result
        </button>
      </div>

      {activeView === "result" && id ? (
        <div className="animate-in fade-in-0 slide-in-from-right-8 ease-out rounded-lg border border-border bg-card p-5 duration-300">
          <FldResultFields fldId={id} backHref={backHref} />
        </div>
      ) : (
      <div className="animate-in fade-in-0 slide-in-from-right-8 ease-out rounded-lg border border-border bg-card p-5 duration-300">
        {loading && <p className="mb-4 text-sm text-muted-foreground">Loading record…</p>}

        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
          {selectField("fld-reporting-year", "Reporting Year", reportingYear, setReportingYear, reportingYearOptions, true)}
          {textField("fld-start-date", "Start Date", startDate, setStartDate, true, "date")}
          {textField("fld-end-date", "Expected Completion Date", endDate, setEndDate, true, "date", startDate || undefined)}
          {selectField("fld-staff", "Name of SMS/KVK Head", staff, setStaff, staffOptions, true)}
          {selectField("fld-season", "Season", season, setSeason, seasonOptions, true)}
        </div>

        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
          <OtherAwareSelect id="fld-sector" label="Sector" required value={sector} onChange={setSector} rows={sectorRows} optionKey="sectorName" />
          <OtherAwareSelect id="fld-category" label="Category" required value={category} onChange={setCategory} rows={categoryRowsFiltered} allRows={categoryRows} optionKey="categoryName" />
          <OtherAwareSelect id="fld-sub-category" label="Sub Category" required value={subCategory} onChange={setSubCategory} rows={subCategoryRowsFiltered} allRows={subCategoryRows} optionKey="subCategoryName" />
          {/* Client direction, 2026-09-13: Sector -> Category -> Sub Category -> Thematic Area order (was Sector -> Thematic Area -> Category -> Sub Category) - display order only, Thematic Area's own filter still just keys off Sector (see thematicAreaRowsFiltered above), unaffected by this move. */}
          <OtherAwareSelect id="fld-thematic-area" label="Thematic Area" required value={thematicArea} onChange={setThematicArea} rows={thematicAreaRowsFiltered} allRows={thematicAreaRows} optionKey="thematicAreaName" />
        </div>

        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
          <OtherAwareSelect id="fld-crop" label="Crop/Animal/Enterprise" required value={cropAnimalEnterprise} onChange={setCropAnimalEnterprise} rows={cropRowsFiltered} allRows={cropRows} optionKey="cropName" />
          {/* Shortened from "Name of Technology Demonstrated (FLD Name)" (client report, 2026-09-03) - the full label wrapped to 2 lines in its ~320-380px grid track, pushing its own input down and breaking row alignment with the neighboring "No of demonstration" field. Same meaning, fits one line. */}
          {textField("fld-technology", "Technology Demonstrated (FLD Name)", technologyDemonstrated, setTechnologyDemonstrated, true)}
          {textField("fld-no-of-demo", "No of demonstration", noOfDemonstration, setNoOfDemonstration, true, "number")}
        </div>

        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
          {textField("fld-unit", "Unit", unit, setUnitOverride, false, "text", undefined, !isOtherCrop)}
          {textField("fld-quantity", "Quantity", quantity, onQuantityChange, false, unit === "Number" ? "text" : "number")}
        </div>

        {id && (
          <div className="mt-4 sm:max-w-xs">
            {selectField("fld-status", "Ongoing/Completed", status, setStatus, ["Ongoing", "Completed"], true)}
          </div>
        )}

        <div className="mt-5 space-y-2 border-t border-border pt-4">
          <p className="text-lg font-semibold text-primary">Farmers Details</p>
          <DemographicGrid
            values={demographics}
            onChange={(key, value) => setDemographics((p) => ({ ...p, [key]: value }))}
          />
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <FormPhotosField value={moduleImages} onChange={setModuleImages} />
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => router.push(backHref)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            <Save className="size-3.5" />
            {submitting ? "Saving…" : "Submit"}
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}
