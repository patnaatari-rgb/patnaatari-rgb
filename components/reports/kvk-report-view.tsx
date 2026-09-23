"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Eye, Filter, Info, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ALL_FORM_PATHS,
  QUICK_SELECT_OPTIONS,
  REPORT_FORM_LEAVES,
  resolveQuickSelectRange,
  type QuickSelectRange,
} from "@/lib/reports";
import { MultiFilterSelect } from "@/components/dashboard/multi-filter-select";
import { ReportHeaderBar } from "./report-header-bar";
import { SelectFormDropdown } from "./select-form-dropdown";

type KvkReportViewProps = {
  /**
   * The logged-in KVK's name, from the session (lib/session.tsx), populated
   * at login and re-synced by SessionGate from /api/auth/me. Only absent if
   * the account has no KVK attached at all - in which case a neutral
   * placeholder is shown rather than guessing a real (wrong) KVK. The
   * generated report itself is always scoped server-side to the caller's own
   * KVK regardless of what this label says.
   */
  kvkName?: string;
  /**
   * Set instead of `kvkName` for a Host Organisation session (client
   * direction, 2026-09-24: its report looks exactly like a KVK's own -
   * same screen, same filters - just combined across every KVK the org is
   * mapped to, never a whole-zone rollup). Only the read-only "which
   * account this report is scoped to" notice differs in wording; the
   * server resolves the real KVK set from the session itself either way,
   * never from this label.
   */
  hostOrgName?: string;
};

/**
 * KVK Report screen. Deliberately the same layout as the Super Admin screen
 * (`super-admin-report-view.tsx`) - one Report Filters card with a Reset
 * action, a Date Range block with Quick Select pills, then Generate Preview -
 * per client direction that a KVK Admin's UI should look exactly like Super
 * Admin's, with only the *data* scoped to their own KVK.
 *
 * The one deliberate difference is the cascade: per the reports spec a KVK
 * user never selects Zone/State/Host Organisation/KVK, because their own KVK
 * is identified from the logged-in account and is never user-editable. That
 * row is replaced by a read-only notice showing which KVK they're reporting
 * on - a data-isolation rule, not a layout divergence.
 */
export function KvkReportView({ kvkName, hostOrgName }: KvkReportViewProps) {
  const router = useRouter();
  const currentKvkName = hostOrgName ?? kvkName ?? "Your KVK";
  const scopeLabel = hostOrgName ? "Organisation" : "KVK";
  const [selectedForms, setSelectedForms] = useState<Set<string>>(
    new Set(ALL_FORM_PATHS),
  );
  /** "Reporting Year" checkbox multi-select - empty = use the Date Range; any year checked scopes the report to exactly those calendar years (client request, 2026-09-07). */
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set());
  /**
   * Real years this KVK actually has data for, not a hardcoded window - was
   * REPORT_YEAR_LIST (current year back 5), which made any year outside
   * that fixed range impossible to select even with real data behind it
   * (bug found 2026-09-13, same class as the empty-data-table.tsx fix).
   */
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/reports/years")
      .then((res) => (res.ok ? res.json() : { years: [] }))
      .then((data) => setYearOptions(data.years ?? []))
      .catch(() => {});
  }, []);
  /** Empty From/To = no period bound = every reporting year ("All Data"), the default the reference export uses (client request, 2026-09-07). */
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [quickSelect, setQuickSelect] = useState<QuickSelectRange>("all-data");
  const [validationError, setValidationError] = useState<string | null>(null);

  const selectedFormLabel =
    selectedForms.size === ALL_FORM_PATHS.size
      ? "All Forms"
      : selectedForms.size === 0
        ? "No Forms Selected"
        : selectedForms.size === 1
          ? (REPORT_FORM_LEAVES.find((f) => selectedForms.has(f.path))?.label ??
            "1 Form Selected")
          : `${selectedForms.size} Forms Selected`;

  function onQuickSelect(value: QuickSelectRange) {
    setQuickSelect(value);
    const range = resolveQuickSelectRange(value);
    if (range) {
      setFromDate(range.from);
      setToDate(range.to);
    }
  }

  function onDateInput(setter: (value: string) => void, value: string) {
    setter(value);
    setQuickSelect("custom");
  }

  function resetFilters() {
    setSelectedForms(new Set(ALL_FORM_PATHS));
    setSelectedYears(new Set());
    setFromDate("");
    setToDate("");
    setQuickSelect("all-data");
    setValidationError(null);
  }

  function handleGenerate() {
    if (selectedForms.size === 0) {
      setValidationError("Please select the required report filters.");
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      setValidationError("To Date cannot be earlier than From Date.");
      return;
    }
    setValidationError(null);

    const query = new URLSearchParams({
      type: "kvk",
      kvk: currentKvkName,
      form: selectedFormLabel,
    });
    // From/To are omitted entirely when blank - the report then covers every
    // reporting year ("All Data").
    if (fromDate) query.set("from", fromDate);
    if (toDate) query.set("to", toDate);
    // "Reporting Year" checkbox multi-select - any year checked scopes the
    // report to exactly those calendar years (server prefers it over from/to).
    const yearsCsv = Array.from(selectedYears).join(",");
    if (yearsCsv) query.set("years", yearsCsv);
    // Actual leaf paths behind "Select Form" so the report is scoped to the
    // checked forms only (client report, 2026-09-07). Omitted when all selected.
    if (selectedForms.size > 0 && selectedForms.size < ALL_FORM_PATHS.size) {
      query.set("forms", Array.from(selectedForms).join(","));
    }
    router.push(`/reports/preview?${query.toString()}`);
  }

  return (
    <div className="space-y-4">
      <ReportHeaderBar title="KVK REPORTS" />

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
            <Filter className="size-3.5" />
            Report Filters
          </div>
          <Button variant="outline-primary" size="sm" onClick={resetFilters}>
            <RotateCcw className="size-3.5" />
            Reset Filters
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {scopeLabel}
            </label>
            <div className="mt-1 flex h-9 w-full items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 text-sm text-muted-foreground">
              <Info className="size-3.5 shrink-0" />
              <span className="truncate">{currentKvkName}</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Select Form
            </label>
            <SelectFormDropdown
              selected={selectedForms}
              onChange={setSelectedForms}
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
            <CalendarDays className="size-3.5" />
            Date Range
          </div>
          <div className="mt-1.5 flex flex-wrap items-end gap-4">
            <div className="w-40 shrink-0">
              <label htmlFor="report-from-date" className="text-xs font-medium text-muted-foreground">
                From Date
              </label>
              <Input
                id="report-from-date"
                type="date"
                value={fromDate}
                onChange={(e) => onDateInput(setFromDate, e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="w-40 shrink-0">
              <label htmlFor="report-to-date" className="text-xs font-medium text-muted-foreground">
                To Date
              </label>
              <Input
                id="report-to-date"
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => onDateInput(setToDate, e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="w-44 shrink-0">
              <label className="text-xs font-medium text-muted-foreground">
                Reporting Year
              </label>
              <MultiFilterSelect
                label="Reporting Year"
                hideLabel
                options={yearOptions}
                selected={selectedYears}
                onChange={setSelectedYears}
                triggerClassName="mt-1 h-9"
              />
            </div>
          </div>
          {selectedYears.size > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Year filter active - the report covers {Array.from(selectedYears).sort().join(", ")} (the Date Range above is ignored).
            </p>
          )}

          <div className="mt-3">
            <label className="text-xs font-medium text-muted-foreground">
              Quick Select
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {QUICK_SELECT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onQuickSelect(option.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    quickSelect === option.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {validationError && (
          <p className="mt-3 text-xs text-destructive">{validationError}</p>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleGenerate}>
          <Eye className="size-3.5" />
          Generate Preview
        </Button>
      </div>
    </div>
  );
}
