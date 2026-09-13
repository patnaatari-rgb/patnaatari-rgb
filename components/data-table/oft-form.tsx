"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, type Crumb } from "@/components/layout/page-header";
import {
  DemographicGrid,
  type DemographicValues,
} from "./demographic-breakdown";
import { FormPhotosField, type FormPhoto } from "./form-photos-field";
import { TagInputField } from "./tag-input-field";
import { compactPlaceholder } from "@/lib/compact-placeholder";
import { OftResultFields } from "./oft-result-fields";
import { OtherAwareSelect, type MasterRow } from "./other-aware-select";

type OftFormProps = {
  trail: Crumb[];
  backHref: string;
  /** Present in Edit mode (fetches the existing record); absent in Add mode (starts blank, status always "Ongoing" on create - the reference's own Add/Edit OFT form has no status selector at all, only the separate "Mark Completed" action). */
  id?: string;
  /** Which pill is active on load - the list page's own "Edit Result" row action jumps straight to "result" via ?tab=result (same query-param convention CFLD Technical Parameter's own tab jumps already use). */
  initialView?: "oft" | "result";
};

const SOURCES = ["ICAR", "AICRP", "SAU", "Other"];

type TechnologyOption = { label: string; description: string };
const DEFAULT_TECHNOLOGY_OPTIONS: TechnologyOption[] = [
  { label: "Farmer Practice", description: "" },
  { label: "TO1", description: "" },
  { label: "TO2", description: "" },
  { label: "TO3", description: "" },
];

const currentYear = new Date().getFullYear();
/**
 * Real audit finding, 2026-09-11: this form had a `reportingYear` state
 * variable (submitted on every save) but no rendered "Reporting Year" field
 * anywhere - it silently saved as whatever `currentYear` was at the moment
 * the page loaded, with no way to enter a past year's trial. Same fixed
 * last-4-years list `vehicle-details`/`equipment-details` already use
 * (lib/navigation.ts) - the one other place in this app that offers a
 * Reporting Year picker.
 *
 * Real bug, 2026-09-13: stayed hardcoded even after every other Reporting
 * Year picker in the app was fixed to pull real years from the database
 * (empty-data-table.tsx's filter, master-form-fields.tsx's staticOptions
 * fields, and vehicle-details/equipment-details themselves) - this is a
 * bespoke form, so none of those fixes reached it. First fix merged real
 * years into this quick-pick list; client direction, 2026-09-13 (same day):
 * drop the hardcoded list entirely so the dropdown is fully DB-driven, not
 * just DB-supplemented - see reportingYearOptions below, which is now just
 * realYears + whatever year this record already holds (currentYear, for a
 * brand-new record). Same fix as FldForm's matching constant.
 */

type ThematicAreaRow = { thematicArea: string; subjectName: string };

/** Dedupes and drops blank values before handing a list to SimpleSelect - real bug found 2026-09-01: mapping master rows straight to option strings let a blank/duplicate field value (real messy seed data, e.g. Funding Source's own "-"/blank rows) through as a literal "" option, and two such rows crashed React with "two children with the same key ''". */
function uniqueNonEmpty(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v?.trim()))));
}

/**
 * Real field set confirmed against the reference (atari-client.vercel.app,
 * 2026-08-15 screenshots) - Season/OFT Subject/Source of Funding/No. of
 * location were missing entirely before (real schema gaps, now added), and
 * Staff is a real dropdown of the KVK's own employees, not free text. Final
 * Recommendation/Constraints Identified/Farmers Participation Process moved
 * out of this form entirely - the reference's own "Edit Result" tab owns
 * those (a separate, still-placeholder flow, not rebuilt in this pass).
 */
export function OftForm({ trail, backHref, id, initialView }: OftFormProps) {
  const router = useRouter();
  const [thematicAreaRows, setThematicAreaRows] = useState<ThematicAreaRow[]>([]);
  const [subjectRows, setSubjectRows] = useState<MasterRow[]>([]);
  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  const [seasonOptions, setSeasonOptions] = useState<string[]>([]);
  const [disciplineRows, setDisciplineRows] = useState<MasterRow[]>([]);
  const [realYears, setRealYears] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(id));

  useEffect(() => {
    fetch("/api/master-options?slug=oft-thematic-area")
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setThematicAreaRows(data.rows ?? []))
      .catch(() => {});
    /**
     * Real Discipline Master (audit finding, 2026-09-12) - this form's own
     * hardcoded 5-value list ("OFT (Agricultural Extension)" etc.) had no
     * "Other" option at all and covered only 5 of the master's real 13
     * disciplines; Employee Details' own separate hardcoded copy had the
     * same drift-from-the-master problem, fixed the same way.
     */
    fetch("/api/master-options?slug=discipline")
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setDisciplineRows(data.rows ?? []))
      .catch(() => {});
    fetch("/api/master-options?slug=subject")
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setSubjectRows(data.rows ?? []))
      .catch(() => {});
    /** Client direction, 2026-09-13: "Name of SMS/KVK Head" means only SMS/Head, not any staff member - see /api/staff-options' own comment. */
    fetch("/api/staff-options?role=sms-head")
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setStaffOptions(uniqueNonEmpty((data.rows ?? []).map((r: Record<string, string>) => r.name))))
      .catch(() => {});
    /** Real Season Master (audit finding, 2026-09-02 - the hardcoded Kharif/Rabi/Zaid list didn't match the real master's actual values, Kharif/Rabi/Summer). */
    fetch("/api/master-options?slug=season")
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setSeasonOptions(uniqueNonEmpty((data.rows ?? []).map((r: Record<string, string>) => r.name))))
      .catch(() => {});
    /** Client direction, 2026-09-13: scoped to OFT's own model - was the same unscoped union every other Reporting Year field used, offering years from unrelated leaves too. */
    fetch("/api/reports/years?model=oft")
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
  const [season, setSeason] = useState("");
  const [oftSubject, setOftSubject] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [staff, setStaff] = useState("");
  const [thematicArea, setThematicArea] = useState("");
  const [trialOnForm, setTrialOnForm] = useState("");
  const [problemDiagnosed, setProblemDiagnosed] = useState("");
  const [sourceOfTechnology, setSourceOfTechnology] = useState("");
  const [sourceOfFunding, setSourceOfFunding] = useState("");
  const [productionSystem, setProductionSystem] = useState("");
  const [performanceIndicators, setPerformanceIndicators] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [noOfLocation, setNoOfLocation] = useState("");
  const [noOfTrialReplicationFarmer, setNoOfTrialReplicationFarmer] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [criticalInput, setCriticalInput] = useState("");
  const [costOfOft, setCostOfOft] = useState("");
  const [fundingAgency, setFundingAgency] = useState("");
  const [status, setStatus] = useState("Ongoing");
  const [demographics, setDemographics] = useState<DemographicValues>({});
  const [moduleImages, setModuleImages] = useState<FormPhoto[]>([]);
  const [technologyOptions, setTechnologyOptions] = useState<TechnologyOption[]>(DEFAULT_TECHNOLOGY_OPTIONS);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeView, setActiveView] = useState<"oft" | "result">(initialView ?? "oft");

  function addTechnologyOption() {
    const nextNumber = technologyOptions.filter((t) => /^TO\d+$/.test(t.label)).length + 1;
    setTechnologyOptions((prev) => [...prev, { label: `TO${nextNumber}`, description: "" }]);
  }
  function removeTechnologyOption(index: number) {
    setTechnologyOptions((prev) => prev.filter((_, i) => i !== index));
  }
  function updateTechnologyOptionDescription(index: number, description: string) {
    setTechnologyOptions((prev) => prev.map((t, i) => (i === index ? { ...t, description } : t)));
  }

  const thematicAreaRowsForSubject = useMemo(
    () => thematicAreaRows.filter((r) => !oftSubject || r.subjectName === oftSubject),
    [thematicAreaRows, oftSubject],
  );

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/oft/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setReportingYear(data.reportingYear || String(currentYear));
        setSeason(data.season ?? "");
        setOftSubject(data.oftSubject ?? "");
        setDiscipline(data.discipline ?? "");
        setStaff(data.staff ?? "");
        setThematicArea(data.thematicArea ?? "");
        setTrialOnForm(data.trialOnForm ?? "");
        setProblemDiagnosed(data.problemDiagnosed ?? "");
        setSourceOfTechnology(data.sourceOfTechnology ?? "");
        setSourceOfFunding(data.sourceOfFunding ?? "");
        setProductionSystem(data.productionSystem ?? "");
        setPerformanceIndicators(data.performanceIndicators ?? "");
        setQuantity(data.quantity ?? "");
        setUnit(data.unit ?? "");
        setNoOfLocation(data.noOfLocation ?? "");
        setNoOfTrialReplicationFarmer(data.noOfTrialReplicationFarmer ?? "");
        setStartMonth(data.startMonth ?? "");
        setEndMonth(data.endMonth ?? "");
        setCriticalInput(data.criticalInput ?? "");
        setCostOfOft(data.costOfOft ?? "");
        setFundingAgency(data.fundingAgency ?? "");
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
        setTechnologyOptions(
          Array.isArray(data.technologyOptions) && data.technologyOptions.length > 0
            ? data.technologyOptions
            : DEFAULT_TECHNOLOGY_OPTIONS,
        );
        setModuleImages(Array.isArray(data.moduleImages) ? data.moduleImages : []);
      })
      .catch(() => setError("Could not load this record."))
      .finally(() => setLoading(false));
  }, [id]);

  async function submit() {
    if (!discipline || !staff || !thematicArea || !trialOnForm) {
      setError("Please fill all required fields.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const values = {
        reportingYear,
        season,
        oftSubject,
        discipline,
        staff,
        thematicArea,
        trialOnForm,
        problemDiagnosed,
        sourceOfTechnology,
        sourceOfFunding,
        productionSystem,
        performanceIndicators,
        quantity,
        unit,
        noOfLocation,
        noOfTrialReplicationFarmer,
        startMonth,
        endMonth,
        criticalInput,
        costOfOft,
        fundingAgency,
        status: id ? status : "Ongoing",
        ...demographics,
        technologyOptions: JSON.stringify(technologyOptions.filter((t) => t.description.trim())),
        moduleImages: JSON.stringify(moduleImages),
      };
      const response = await fetch(
        id ? "/api/leaf-record/update" : "/api/leaf-record",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            id ? { path: "achievements/oft", id, values } : { path: "achievements/oft", values },
          ),
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
    placeholder = "Please Select",
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
          placeholder={placeholder}
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
    placeholder?: string,
    type: "text" | "number" | "date" = "text",
    /** For a completion/end date - can't be before this date. */
    min?: string,
    /** Client report, 2026-09-13: "Title of On Farm Trial (OFT)" - a real title runs long, and this field shared the same ~320px-max column every select/date field in this form uses, so most of it stayed hidden while typing. `col-[1/-1]` (same full-row-span convention master-form-fields.tsx already uses) instead of a wider fixed width, so it still adapts to the row's real available space. */
    fullWidth?: boolean,
  ) {
    return (
      <div className={cn("space-y-1.5", fullWidth && "col-[1/-1]")}>
        <Label htmlFor={idAttr}>
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
        <Input
          id={idAttr}
          type={type}
          min={type === "date" ? min : undefined}
          className="h-10"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? (type === "text" ? `Enter ${compactPlaceholder(label).toLowerCase()}` : undefined)}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Slides in from the left as the card below slides in from the right (client direction, 2026-09-03) - the two converge toward the middle instead of both entering the same way. */}
      <div className="animate-in fade-in-0 slide-in-from-left-8 ease-out duration-300">
        <PageHeader
          backHref={backHref}
          trail={trail}
          title={activeView === "result" ? "Edit OFT Result" : id ? "Edit OFT" : "Add OFT"}
        />
      </div>

      {/* "Edit/Add OFT / Edit Result" tab pill - shown on both Add and Edit (client direction, 2026-09-02: "add new pe bhi same flow hona chahiye jo action mein hai"). Edit Result stays disabled until the record actually exists - a result belongs to a saved trial, there's no oftId to attach it to yet on a blank Add page. Switches views in place, same pattern CFLD Technical Parameter's own tab pill already uses, rather than a separate route. Sits below the Back/breadcrumb header (audit finding, 2026-09-02 - was built above it, backwards from CFLD's own established real order). */}
      <div className="mb-4 flex w-fit overflow-hidden rounded-full bg-primary p-1">
        <button
          type="button"
          onClick={() => setActiveView("oft")}
          className={cn(
            "rounded-full px-4 py-2 text-xs font-medium whitespace-nowrap transition-colors",
            activeView === "oft" ? "bg-card text-foreground shadow-sm" : "text-primary-foreground hover:bg-white/10",
          )}
        >
          {id ? "Edit OFT" : "Add OFT"}
        </button>
        <button
          type="button"
          onClick={() => setActiveView("result")}
          disabled={!id}
          title={id ? undefined : "Save the OFT first to edit its result."}
          className={cn(
            "rounded-full px-4 py-2 text-xs font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
            activeView === "result" ? "bg-card text-foreground shadow-sm" : "text-primary-foreground hover:bg-white/10",
          )}
        >
          Edit Result
        </button>
      </div>

      {activeView === "result" && id ? (
        <div className="animate-in fade-in-0 slide-in-from-right-8 ease-out rounded-lg border border-border bg-card p-5 duration-300">
          <OftResultFields oftId={id} backHref={backHref} />
        </div>
      ) : (
      <div className={cn("animate-in fade-in-0 slide-in-from-right-8 ease-out rounded-lg border border-border bg-card p-5 duration-300")}>
        {loading && <p className="mb-4 text-sm text-muted-foreground">Loading record…</p>}

        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
          {selectField("oft-reporting-year", "Reporting Year", reportingYear, setReportingYear, reportingYearOptions, true)}
          {textField("oft-start-month", "OFT Start Date", startMonth, setStartMonth, true, undefined, "date")}
          {textField("oft-end-month", "Expected Completion Date", endMonth, setEndMonth, true, undefined, "date", startMonth || undefined)}
          {selectField("oft-staff", "Name of SMS/KVK Head", staff, setStaff, staffOptions, true)}
          {selectField("oft-season", "Season", season, setSeason, seasonOptions, true)}
        </div>

        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
          <OtherAwareSelect id="oft-subject" label="OFT Subject" required value={oftSubject} onChange={setOftSubject} rows={subjectRows} optionKey="subjectName" />
          <OtherAwareSelect id="oft-thematic-area" label="Thematic Area" required value={thematicArea} onChange={setThematicArea} rows={thematicAreaRowsForSubject} allRows={thematicAreaRows} optionKey="thematicArea" />
          <OtherAwareSelect id="oft-discipline" label="Discipline" required value={discipline} onChange={setDiscipline} rows={disciplineRows} optionKey="name" />
          {textField("oft-title", "Title of On Farm Trial (OFT)", trialOnForm, setTrialOnForm, true, undefined, "text", undefined, true)}
        </div>

        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
          {textField("oft-problem", "Problem Diagnosed", problemDiagnosed, setProblemDiagnosed, true)}
          {selectField("oft-source", "Source of Technology (ICAR/SAU/Other)", sourceOfTechnology, setSourceOfTechnology, SOURCES, true)}
        </div>

        {/** Client direction, 2026-09-13: "Source of Funding" back to plain free text (was a Funding Source master dropdown) - reverting that improvement per this direction, not a mismatch. "Funding Agency Name" moved up beside it from its old standalone row further down the form, per the same direction. */}
        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
          {textField("oft-funding-source", "Source of Funding", sourceOfFunding, setSourceOfFunding, true)}
          {textField("oft-funding-agency", "Funding Agency Name", fundingAgency, setFundingAgency)}
          {textField("oft-production-system", "Production System and Thematic Area", productionSystem, setProductionSystem, true)}
        </div>

        {/* Real "type each value and press , or Enter to add as a tag" input (confirmed live, 2026-09-03) - was a plain multi-line textarea before, which doesn't match the reference's own pill/tag editor at all. */}
        <div className="mt-4 max-w-xl">
          <TagInputField
            id="oft-performance-indicators"
            label="Performance Indicators of the Technology"
            required
            value={performanceIndicators}
            onChange={setPerformanceIndicators}
          />
        </div>

        <div className="mt-5 space-y-3 border-t border-border pt-4">
          <p className="text-lg font-semibold text-primary">
            Details of technologies selected for assessment/refinement:
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-start">
            <p className="hidden text-xs font-medium text-muted-foreground sm:block">
              Technology options<span className="text-destructive">*</span>
            </p>
            <p className="hidden text-xs font-medium text-muted-foreground sm:block">
              Details<span className="text-destructive">*</span>
            </p>
            <span className="hidden sm:block" />
            {technologyOptions.map((option, index) => (
              <div key={index} className="contents">
                <Input value={option.label} disabled className="bg-muted" />
                <Textarea
                  value={option.description}
                  onChange={(e) => updateTechnologyOptionDescription(index, e.target.value)}
                  rows={2}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => removeTechnologyOption(index)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addTechnologyOption}>
            Add Technology Option
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
          {textField("oft-unit", "Unit", unit, setUnit, true, "e.g. ha, Kg")}
          {textField("oft-quantity", "Quantity", quantity, setQuantity, true, undefined, "number")}
          {textField("oft-location", "No. of location", noOfLocation, setNoOfLocation, true, undefined, "number")}
          {textField("oft-trials", "No. of Trial/Replication", noOfTrialReplicationFarmer, setNoOfTrialReplicationFarmer, true, undefined, "number")}
        </div>

        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
          {textField("oft-critical-input", "Critical Input", criticalInput, setCriticalInput, true)}
          {textField("oft-cost", "Cost of OFT", costOfOft, setCostOfOft, true, undefined, "number")}
        </div>

        {id && (
          <div className="mt-4 sm:max-w-xs">
            {selectField("oft-status", "Ongoing/Completed", status, setStatus, ["Ongoing", "Completed"], true)}
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
