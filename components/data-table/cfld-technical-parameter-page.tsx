"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { OtherAwareSelect } from "./other-aware-select";
import { PageHeader, type Crumb } from "@/components/layout/page-header";
import {
  DemographicGrid,
  type DemographicValues,
} from "./demographic-breakdown";
import { FormPhotosField, type FormPhoto } from "./form-photos-field";
import { percentIncreaseInYield, yieldGapMinimizedPercent } from "@/lib/cfld-formulas";
import { MONTH_NAMES } from "@/lib/months";
import { CFLD_TABS as TABS, cfldTabDisplayLabel, type CfldTabName } from "@/lib/cfld-technical-parameter-tabs";

const ECONOMIC_FIELDS = [
  { key: "costFarmer", label: "Gross Cost (Rs/ha)" },
  { key: "grossReturnFarmer", label: "Gross return (Rs/ha)" },
] as const;

const SOCIO_ECONOMIC_FIELDS = [
  { key: "totalProduceObtainedKg", label: "Total Produce Obtained (kg)" },
  { key: "produceSoldKgPerHousehold", label: "Produce sold (kg/household)" },
  { key: "sellingRatePerKg", label: "Selling Rate (Rs/Kg)" },
  { key: "produceUsedOwnFarmKg", label: "Produce used for own sowing (Kg)" },
  { key: "produceDistributedToOthersKg", label: "Produce distributed to other farmers (Kg)" },
] as const;

const PERCEPTION_FIELDS = [
  { key: "suitability", label: "Suitability to their farming system" },
  { key: "likingsPreference", label: "Likings (Preference)" },
  { key: "affordability", label: "Affordability" },
  { key: "negativeEffect", label: "Any negative effect" },
  // Shortened from "Is Technology acceptable to all in the group/village" (client report, 2026-09-03) - wrapped to 2 lines in its ~320px track, misaligning it against its row's other single-line fields.
  { key: "acceptableToAll", label: "Acceptable to all in the village" },
  { key: "suggestions", label: "Suggestions, for change/improvement, if any" },
] as const;

type CropMasterRow = { season: string; type: string; cropName: string };

type CfldTechnicalParameterPageProps = {
  trail: Crumb[];
  backHref: string;
  /** Present in Edit mode (fetches the existing record and PUTs); absent in Add mode (starts blank and POSTs). */
  id?: string;
  /** Which tab to land on - the Action dropdown's "Economic Parameters"/"Update Socio Economic Parameters"/"Farmers Perception Parameters" items jump straight there instead of always opening on Technical Parameter first. */
  initialTab?: CfldTabName;
};

/**
 * CFLD Technical Parameter's real 4-tab form, rebuilt field-for-field and
 * tab-for-tab against the real reference (atari-client.vercel.app, confirmed
 * 2026-09-01) - the version this replaced was ported from the app's own
 * older dialog, which had drifted from the reference in several confirmed
 * ways: tab labels/order of "Mark as Completed" (only the last tab has it,
 * not every tab), the CFLD Crop Type/Crop split (two real cascading
 * dropdowns off CfldCropMaster, not one plain text field), Yield Gap being
 * two separate real sections (q/ha inputs, then their calculated % in a
 * second titled box) rather than one combined box, Economic Parameters'
 * Net Return/B:C ratio being auto-calculated instead of typed in, an
 * "Additional income" field, and two real multi-photo upload fields
 * ("Farmers' Training Photographs" / "Quality Action Photographs") that
 * live on the Technical Parameter tab itself, not Socio-Economic.
 */
export function CfldTechnicalParameterPage({
  trail,
  backHref,
  id,
  initialTab,
}: CfldTechnicalParameterPageProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CfldTabName>(initialTab ?? "Technical Parameter");
  const [technical, setTechnical] = useState<Record<string, string>>({});
  const [economic, setEconomic] = useState<Record<string, string>>({});
  const [demographics, setDemographics] = useState<DemographicValues>({});
  const [socioEconomic, setSocioEconomic] = useState<Record<string, string>>({});
  const [perception, setPerception] = useState<Record<string, string>>({});
  const [trainingPhotos, setTrainingPhotos] = useState<FormPhoto[]>([]);
  const [actionPhotos, setActionPhotos] = useState<FormPhoto[]>([]);
  const [cropRows, setCropRows] = useState<CropMasterRow[]>([]);
  const [seasonOptions, setSeasonOptions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));

  useEffect(() => {
    fetch("/api/master-options?slug=cfld-crop")
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setCropRows(data.rows ?? []))
      .catch(() => {});
    /** Real Season Master (audit finding, 2026-09-02 - the hardcoded Kharif/Rabi/Zaid list didn't match the real master's actual values, Kharif/Rabi/Summer). */
    fetch("/api/master-options?slug=season")
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) =>
        setSeasonOptions(
          Array.from(
            new Set(
              (data.rows ?? [])
                .map((r: Record<string, string>) => r.name)
                .filter((v: string | undefined): v is string => Boolean(v?.trim())),
            ),
          ) as string[],
        ),
      )
      .catch(() => {});
  }, []);

  /**
   * Season -> CFLD Crop Type -> CFLD Crop is a real 3-level cascade off
   * CfldCropMaster (client direction, 2026-09-15) - each level only offers
   * options once its parent is actually chosen, same as every other
   * cascading master field in this app, rather than showing every type/crop
   * across all seasons upfront.
   */
  const cropTypeOptions = useMemo(
    () =>
      technical.season
        ? Array.from(new Set(cropRows.filter((r) => r.season === technical.season).map((r) => r.type))).sort()
        : [],
    [cropRows, technical.season],
  );
  const cropNameRows = useMemo(
    () =>
      technical.season && technical.cropType
        ? cropRows.filter((r) => r.season === technical.season && r.type === technical.cropType)
        : [],
    [cropRows, technical.season, technical.cropType],
  );

  const num = (v: string | undefined) => (v?.trim() ? Number(v) : undefined);
  const fmtNum = (v: number | undefined) => (v === undefined ? "" : String(Math.round(v * 100) / 100));
  const percentIncrease = fmtNum(percentIncreaseInYield(num(technical.demoYieldAvg), num(technical.farmerYield)));
  const gapDistrict = fmtNum(yieldGapMinimizedPercent(num(technical.districtYield), num(technical.demoYieldAvg)));
  const gapState = fmtNum(yieldGapMinimizedPercent(num(technical.stateYield), num(technical.demoYieldAvg)));
  const gapPotential = fmtNum(yieldGapMinimizedPercent(num(technical.potentialYield), num(technical.demoYieldAvg)));

  const farmerNetReturn = fmtNum(
    num(economic.grossReturnFarmer) !== undefined && num(economic.costFarmer) !== undefined
      ? (num(economic.grossReturnFarmer) as number) - (num(economic.costFarmer) as number)
      : undefined,
  );
  const farmerBcRatio = fmtNum(
    num(economic.grossReturnFarmer) !== undefined && num(economic.costFarmer)
      ? (num(economic.grossReturnFarmer) as number) / (num(economic.costFarmer) as number)
      : undefined,
  );
  const demoNetReturn = fmtNum(
    num(economic.grossReturnDemo) !== undefined && num(economic.costDemo) !== undefined
      ? (num(economic.grossReturnDemo) as number) - (num(economic.costDemo) as number)
      : undefined,
  );
  const demoBcRatio = fmtNum(
    num(economic.grossReturnDemo) !== undefined && num(economic.costDemo)
      ? (num(economic.grossReturnDemo) as number) / (num(economic.costDemo) as number)
      : undefined,
  );

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/cfld-technical-parameter/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setTechnical(data.technical ?? {});
        setEconomic(data.economic ?? {});
        setDemographics(data.demographics ?? {});
        setSocioEconomic(data.socioEconomic ?? {});
        setPerception(data.perception ?? {});
        setTrainingPhotos(Array.isArray(data.trainingPhotos) ? data.trainingPhotos : []);
        setActionPhotos(Array.isArray(data.actionPhotos) ? data.actionPhotos : []);
      })
      .catch(() => setError("Could not load this record."))
      .finally(() => setLoading(false));
  }, [id]);

  async function submit(status: "ONGOING" | "COMPLETED") {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(
        id ? `/api/cfld-technical-parameter/${id}` : "/api/cfld-technical-parameter",
        {
          method: id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            technical,
            trainingPhotos: JSON.stringify(trainingPhotos),
            actionPhotos: JSON.stringify(actionPhotos),
            economic,
            demographics,
            socioEconomic,
            perception,
            status,
          }),
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

  function textField(
    idAttr: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    type: "text" | "number" = "text",
  ) {
    return (
      <div key={idAttr} className="space-y-1.5">
        <Label htmlFor={idAttr}>
          {label} <span className="text-destructive">*</span>
        </Label>
        <Input id={idAttr} type={type} className="h-10" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }

  function calculatedField(idAttr: string, label: string, value: string) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={idAttr}>
          {label} <span className="text-destructive">*</span>
        </Label>
        <Input id={idAttr} disabled value={value} placeholder="Auto-calculated" className="h-10 bg-muted" />
      </div>
    );
  }

  const isLastTab = activeTab === "Farmers Perception";

  return (
    <div>
      {/* Heading slides in from the left as the card (below) slides in from the right (client direction, 2026-09-03) - the two converge toward the middle instead of both entering the same way. */}
      <div className="animate-in fade-in-0 slide-in-from-left-8 ease-out duration-300">
        <PageHeader backHref={backHref} trail={trail} title={id ? "Edit Technical Parameter" : "Add Technical Parameter"} />
      </div>

      <div className="animate-in fade-in-0 slide-in-from-right-8 ease-out rounded-lg border border-border bg-card p-5 duration-300">
        {loading && <p className="mb-4 text-sm text-muted-foreground">Loading record…</p>}

        <div className="mb-5 flex overflow-hidden rounded-full bg-primary p-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 rounded-full px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors",
                activeTab === tab
                  ? "bg-card text-foreground shadow-sm"
                  : "text-primary-foreground hover:bg-white/10",
              )}
            >
              {cfldTabDisplayLabel(tab, Boolean(id))}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {activeTab === "Technical Parameter" && (
            <div className="space-y-4">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
                <div className="space-y-1.5">
                  <Label htmlFor="cfld-reporting-date">
                    Reporting Year <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="cfld-reporting-date"
                    type="date"
                    className="h-10"
                    value={technical.reportingDate ?? ""}
                    onChange={(e) => setTechnical((p) => ({ ...p, reportingDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cfld-month">Month</Label>
                  <SimpleSelect
                    id="cfld-month"
                    value={technical.month ?? ""}
                    onValueChange={(v) => setTechnical((p) => ({ ...p, month: v }))}
                    placeholder="Select One"
                    options={MONTH_NAMES.map((m) => ({ value: m, label: m }))}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cfld-season">
                    Season <span className="text-destructive">*</span>
                  </Label>
                  <SimpleSelect
                    id="cfld-season"
                    value={technical.season ?? ""}
                    onValueChange={(v) =>
                      setTechnical((p) => ({ ...p, season: v, cropType: "", crop: "" }))
                    }
                    placeholder="Select One"
                    options={seasonOptions.map((s) => ({ value: s, label: s }))}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cfld-crop-type">
                    CFLD Crop Type <span className="text-destructive">*</span>
                  </Label>
                  <SimpleSelect
                    id="cfld-crop-type"
                    value={technical.cropType ?? ""}
                    onValueChange={(v) => setTechnical((p) => ({ ...p, cropType: v, crop: "" }))}
                    placeholder={cropTypeOptions.length === 0 ? "No crop types available for selection" : "Select One"}
                    disabled={cropTypeOptions.length === 0}
                    options={cropTypeOptions.map((t) => ({ value: t, label: t }))}
                    className="h-10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
                <OtherAwareSelect
                  id="cfld-crop"
                  label="CFLD Crop"
                  required
                  value={technical.crop ?? ""}
                  onChange={(v) => setTechnical((p) => ({ ...p, crop: v }))}
                  rows={cropNameRows}
                  optionKey="cropName"
                  disabled={cropNameRows.length === 0}
                  placeholder={cropNameRows.length === 0 ? "No crops available for selection" : "Select One"}
                />
                {textField("cfld-variety", "Name of Variety", technical.variety ?? "", (v) =>
                  setTechnical((p) => ({ ...p, variety: v })))}
                {textField("cfld-area", "Area (in ha)", technical.areaHa ?? "", (v) =>
                  setTechnical((p) => ({ ...p, areaHa: v })), "number")}
                {textField("cfld-tech", "Technology demonstrated", technical.technologyDemonstrated ?? "", (v) =>
                  setTechnical((p) => ({ ...p, technologyDemonstrated: v })))}
              </div>

              <div className="space-y-2 rounded-md border border-border p-3">
                <p className="text-sm font-semibold text-primary">Target of CFLD Approved</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {textField("cfld-target-area", "Area (ha)", technical.targetAreaHa ?? "", (v) =>
                    setTechnical((p) => ({ ...p, targetAreaHa: v })), "number")}
                  {textField("cfld-target-demos", "No. of Demonstration", technical.targetDemonstrations ?? "", (v) =>
                    setTechnical((p) => ({ ...p, targetDemonstrations: v })), "number")}
                </div>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
                {textField(
                  "cfld-existing-practice",
                  "Detail of existing farmer practice",
                  technical.existingFarmerPractice ?? "",
                  (v) => setTechnical((p) => ({ ...p, existingFarmerPractice: v })),
                )}
                {textField(
                  "cfld-farmer-yield",
                  "Yield (q/ha) in farmer field Local",
                  technical.farmerYield ?? "",
                  (v) => setTechnical((p) => ({ ...p, farmerYield: v })),
                  "number",
                )}
              </div>

              <div className="space-y-2 rounded-md border border-border p-3">
                <p className="text-lg font-semibold text-primary">Yield obtained in demonstration (q/ha)</p>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
                  {textField("cfld-yield-min", "Minimum", technical.demoYieldMin ?? "", (v) =>
                    setTechnical((p) => ({ ...p, demoYieldMin: v })), "number")}
                  {textField("cfld-yield-max", "Maximum", technical.demoYieldMax ?? "", (v) =>
                    setTechnical((p) => ({ ...p, demoYieldMax: v })), "number")}
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
                  {textField("cfld-yield-avg", "Average", technical.demoYieldAvg ?? "", (v) =>
                    setTechnical((p) => ({ ...p, demoYieldAvg: v })), "number")}
                  {calculatedField("cfld-yield-increase", "% increase in yield", percentIncrease)}
                </div>
              </div>

              <div className="space-y-2 rounded-md border border-border p-3">
                <p className="text-lg font-semibold text-primary">Yield gap (q/ha)</p>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
                  {textField("cfld-district-yield", "District yield (D)", technical.districtYield ?? "", (v) =>
                    setTechnical((p) => ({ ...p, districtYield: v })), "number")}
                  {textField("cfld-state-yield", "State yield (S)", technical.stateYield ?? "", (v) =>
                    setTechnical((p) => ({ ...p, stateYield: v })), "number")}
                  {textField("cfld-potential-yield", "Potential yield (P)", technical.potentialYield ?? "", (v) =>
                    setTechnical((p) => ({ ...p, potentialYield: v })), "number")}
                </div>
              </div>

              <div className="space-y-2 rounded-md border border-border p-3">
                <p className="text-lg font-semibold text-primary">Yield gap minimized (%)</p>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
                  {calculatedField("cfld-gap-district", "District yield (D)", gapDistrict)}
                  {calculatedField("cfld-gap-state", "State yield (S)", gapState)}
                  {calculatedField("cfld-gap-potential", "Potential yield (P)", gapPotential)}
                </div>
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <p className="text-lg font-semibold text-primary">Farmers Details</p>
                <DemographicGrid
                  values={demographics}
                  onChange={(key, value) => setDemographics((p) => ({ ...p, [key]: value }))}
                />
              </div>

              {/* Photo upload cards get a wider bound than a text field's 240-320px (icon+text needs more room) - same pattern as EmployeeDetailsAddForm's own Photo/Resume cards. */}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,380px))] gap-5 border-t border-border pt-4">
                <FormPhotosField
                  label="Farmers' Training Photographs"
                  value={trainingPhotos}
                  onChange={setTrainingPhotos}
                />
                <FormPhotosField
                  // Shortened from "Quality Action Photographs (field visits / technology demos)" (audit finding, 2026-09-04) - the full label wrapped to 2 lines in its ~half-width card, pushing its own dropzone down out of alignment with the "Farmers' Training Photographs" card beside it (which stays 1 line). Same meaning, fits one line.
                  label="Quality Action Photographs"
                  value={actionPhotos}
                  onChange={setActionPhotos}
                />
              </div>
            </div>
          )}

          {activeTab === "Economic Parameters" && (
            <div className="space-y-5">
              <div className="space-y-3">
                <p className="text-lg font-semibold text-primary">Farmer&apos;s Existing plot</p>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
                  {textField("cfld-econ-costFarmer", ECONOMIC_FIELDS[0].label, economic.costFarmer ?? "", (v) =>
                    setEconomic((p) => ({ ...p, costFarmer: v })), "number")}
                  {textField("cfld-econ-grossReturnFarmer", ECONOMIC_FIELDS[1].label, economic.grossReturnFarmer ?? "", (v) =>
                    setEconomic((p) => ({ ...p, grossReturnFarmer: v })), "number")}
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
                  {calculatedField("cfld-econ-netReturnFarmer", "Net Return (Rs/ha)", farmerNetReturn)}
                  {calculatedField("cfld-econ-bcRatioFarmer", "B:C ratio", farmerBcRatio)}
                </div>
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <p className="text-lg font-semibold text-primary">Demonstration plot</p>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
                  {textField("cfld-econ-costDemo", "Gross Cost (Rs/ha)", economic.costDemo ?? "", (v) =>
                    setEconomic((p) => ({ ...p, costDemo: v })), "number")}
                  {textField("cfld-econ-grossReturnDemo", "Gross return (Rs/ha)", economic.grossReturnDemo ?? "", (v) =>
                    setEconomic((p) => ({ ...p, grossReturnDemo: v })), "number")}
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
                  {calculatedField("cfld-econ-netReturnDemo", "Net Return (Rs/ha)", demoNetReturn)}
                  {calculatedField("cfld-econ-bcRatioDemo", "B:C ratio", demoBcRatio)}
                </div>
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <p className="text-lg font-semibold text-primary">Additional income</p>
                {textField(
                  "cfld-econ-additionalIncome",
                  "Additional Income (Rs/ha)",
                  economic.additionalIncome ?? "",
                  (v) => setEconomic((p) => ({ ...p, additionalIncome: v })),
                  "number",
                )}
              </div>
            </div>
          )}

          {activeTab === "Socio Economic Parameters" && (
            <div className="space-y-3">
              <p className="text-lg font-semibold text-primary">Socio Economic Parameters</p>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
                {SOCIO_ECONOMIC_FIELDS.map((field) =>
                  textField(`cfld-socio-${field.key}`, field.label, socioEconomic[field.key] ?? "", (v) =>
                    setSocioEconomic((p) => ({ ...p, [field.key]: v })), "number"),
                )}
                {/* Shortened from "Purpose for which income gained was utilized" (client report, 2026-09-03) - wrapped to 2 lines in its ~320px track, pushing its own input down out of alignment with the row's other fields. */}
                {textField(
                  "cfld-socio-purpose",
                  "Purpose of income utilized",
                  socioEconomic.purposeOfIncomeUtilized ?? "",
                  (v) => setSocioEconomic((p) => ({ ...p, purposeOfIncomeUtilized: v })),
                )}
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
                {/* Shortened from "Employment Generated (Mandays/ house hold)" (client report, 2026-09-03) - same wrapping issue. */}
                {textField(
                  "cfld-socio-employment",
                  "Employment Generated (Mandays/hh)",
                  socioEconomic.employmentGeneratedMandays ?? "",
                  (v) => setSocioEconomic((p) => ({ ...p, employmentGeneratedMandays: v })),
                  "number",
                )}
              </div>
            </div>
          )}

          {activeTab === "Farmers Perception" && (
            <div className="space-y-3">
              <p className="text-lg font-semibold text-primary">Farmers Perception Parameters</p>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
                {PERCEPTION_FIELDS.map((field) =>
                  textField(`cfld-perception-${field.key}`, field.label, perception[field.key] ?? "", (v) =>
                    setPerception((p) => ({ ...p, [field.key]: v }))),
                )}
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,320px))] gap-5">
                {textField("cfld-perception-farmerFeedback", "Farmer feedback", perception.farmerFeedback ?? "", (v) =>
                  setPerception((p) => ({ ...p, farmerFeedback: v })))}
              </div>
            </div>
          )}
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
          <Button variant="outline" onClick={() => submit("ONGOING")} disabled={submitting}>
            <Save className="size-3.5" />
            {submitting ? "Saving…" : "Update"}
          </Button>
          {isLastTab && (
            <Button onClick={() => submit("COMPLETED")} disabled={submitting}>
              <CheckCircle2 className="size-3.5" />
              {submitting ? "Saving…" : "Mark as Completed"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
