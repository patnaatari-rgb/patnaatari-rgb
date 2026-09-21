"use client";

import { useEffect, useState } from "react";
import { Target as TargetIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyDataTable } from "@/components/data-table/empty-data-table";
import { SimpleSelect } from "@/components/ui/simple-select";
import { SelectOrgKvksDropdown } from "@/components/reports/select-org-kvks-dropdown";
import { useSession } from "@/lib/session";
import { KVKS } from "@/lib/rbac";

/** Same four categories the Dashboard's own stat cards already track (Total OFT, Total FLD, Training, Ext. Activity). */
const CATEGORIES = ["OFT", "FLD", "Training", "Extension Activity"];

function reportingYearOptions(): string[] {
  const currentYear = new Date().getFullYear();
  // Current year down only - no future year (client report, 2026-09-04: there
  // is no data for years beyond the current one, so they should never appear
  // in any year dropdown).
  return [currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(
    String,
  );
}

const SUPER_ADMIN_COLUMNS = [
  { key: "reportingYear", label: "Reporting Year" },
  { key: "kvk", label: "KVK" },
  { key: "category", label: "Category" },
  { key: "target", label: "Target" },
  { key: "achieved", label: "Achieved" },
  { key: "progress", label: "Progress" },
  { key: "status", label: "Status" },
];

/** KVK Admin/User's own view drops the KVK column - every row is already their own KVK. */
const KVK_COLUMNS = SUPER_ADMIN_COLUMNS.filter(
  (column) => column.key !== "kvk",
);

type TargetRow = {
  id: string;
  reportingYear: string;
  kvk: string;
  category: string;
  target: string;
  achieved: string;
  progress: string;
  status: string;
};

/**
 * Real backend as of 2026-08-25 (client request: "Add Target Option in KVK -
 * the option should allow the KVK user to enter and save the required
 * target details"). Both Super Admin and KVK Admin/User get an Add Target
 * form now - Super Admin additionally picks which KVK it's for, a KVK
 * Admin/User's own KVK is implicit. "Achieved" is never typed in - it's a
 * live count of that KVK's real OFT/FLD/Training/Extension Activity
 * submissions for the matching year (see /api/targets), so it can't drift
 * out of sync with what was actually submitted through Form Management.
 */
export default function TargetsPage() {
  const session = useSession();
  const isKvk = session.role !== "super-admin";

  const years = reportingYearOptions();
  const [reportingYear, setReportingYear] = useState(years[1]);
  /** Super Admin can tick one or many KVKs and set the same target for all of them in one save (client request, 2026-09-04). */
  const [kvkSet, setKvkSet] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [targetValue, setTargetValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rows, setRows] = useState<TargetRow[]>();
  /**
   * Same collective/selective KVK checklist the Reports page uses (client
   * request, 2026-09-04: "Reports page pe checkboxes hain wo Targets pe bhi
   * lagao") - `null` means every KVK is in scope (the default "collective"
   * view); a Set is an explicit selection, so the list and its PDF/Excel/
   * Word exports narrow to just those KVKs (an empty Set shows none, matching
   * the Reports dropdown). Super Admin only; a KVK Admin/User already sees
   * only their own rows.
   */
  const [kvkFilter, setKvkFilter] = useState<Set<string> | null>(null);

  function loadTargets() {
    fetch("/api/targets")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { rows: TargetRow[] } | null) => {
        if (data) setRows(data.rows);
      })
      .catch(() => {});
  }

  useEffect(loadTargets, []);

  async function submitTarget() {
    setFormError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportingYear: Number(reportingYear),
          category,
          targetValue: Number(targetValue),
          kvkNames: isKvk ? undefined : Array.from(kvkSet),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setFormError(data.error ?? "Could not save this target.");
        return;
      }
      setTargetValue("");
      setKvkSet(new Set());
      loadTargets();
    } catch {
      setFormError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const kvkOptions = Array.from(
    new Set([
      ...KVKS.map((k) => k.name),
      ...(rows ?? []).map((r) => r.kvk),
    ]),
  ).sort();
  const visibleRows =
    isKvk || kvkFilter === null
      ? rows
      : rows?.filter((r) => kvkFilter.has(r.kvk));

  return (
    <div>
      <PageHeader
        trail={[{ label: "Targets" }]}
        title="Targets"
        icon={TargetIcon}
        description={
          isKvk
            ? `Targets assigned to ${session.kvkName ?? "your KVK"} and your progress against them`
            : "Targets assigned across all KVKs, tracked against what each KVK reports"
        }
      />

      <div className="mb-4 rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-primary uppercase">
          Add Target
        </p>
        <div
          className={`grid gap-3 ${isKvk ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}
        >
          <div>
            <label htmlFor="targets-reporting-year" className="text-xs font-medium text-muted-foreground">
              Reporting Year
            </label>
            <SimpleSelect
              id="targets-reporting-year"
              value={reportingYear}
              onValueChange={setReportingYear}
              options={years.map((year) => ({ value: year, label: year }))}
              className="mt-1"
            />
          </div>
          {!isKvk && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                KVK{kvkSet.size > 0 ? ` (${kvkSet.size} selected)` : ""}
              </label>
              <SelectOrgKvksDropdown
                kvks={KVKS.map((k) => k.name)}
                selected={kvkSet}
                onChange={setKvkSet}
              />
            </div>
          )}
          <div>
            <label htmlFor="targets-category" className="text-xs font-medium text-muted-foreground">
              Category
            </label>
            <SimpleSelect
              id="targets-category"
              value={category}
              onValueChange={setCategory}
              options={CATEGORIES.map((c) => ({ value: c, label: c }))}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Target
            </label>
            <Input
              type="number"
              min="0"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="e.g. 25"
              className="mt-1"
            />
          </div>
        </div>
        {formError && (
          <p role="alert" className="mt-2 text-sm font-medium text-destructive">
            {formError}
          </p>
        )}
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            disabled={!targetValue || submitting || (!isKvk && kvkSet.size === 0)}
            onClick={submitTarget}
          >
            <TargetIcon className="size-3.5" />
            {submitting
              ? "Saving…"
              : !isKvk && kvkSet.size > 1
                ? `Save Target for ${kvkSet.size} KVKs`
                : "Save Target"}
          </Button>
        </div>
      </div>

      {!isKvk && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
          <span className="text-xs font-semibold tracking-wide text-primary uppercase">
            KVKs
          </span>
          <div className="w-72">
            <SelectOrgKvksDropdown
              kvks={kvkOptions}
              selected={kvkFilter ?? new Set(kvkOptions)}
              onChange={(next) =>
                setKvkFilter(next.size === kvkOptions.length ? null : next)
              }
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {kvkFilter === null
              ? "Showing all KVKs — untick any to scope the list and its exports"
              : `Scoped to ${kvkFilter.size} of ${kvkOptions.length} KVKs`}
          </span>
        </div>
      )}

      <EmptyDataTable
        title="Targets"
        icon="targets"
        subtitle={
          isKvk
            ? `Targets assigned to ${session.kvkName ?? "your KVK"} and your progress against them`
            : "Targets assigned across all KVKs, tracked against what each KVK reports"
        }
        columns={isKvk ? KVK_COLUMNS : SUPER_ADMIN_COLUMNS}
        rows={visibleRows}
        totalCount={visibleRows?.length}
        hideAddNew
      />
    </div>
  );
}
