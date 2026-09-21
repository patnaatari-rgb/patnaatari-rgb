"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileDown,
  FileSpreadsheet,
  Filter as FilterIcon,
  ImageOff,
  RotateCcw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SelectCategoryDropdown } from "./select-category-dropdown";
import { ModuleImageCard } from "./module-image-card";
import { MultiFilterSelect } from "@/components/dashboard/multi-filter-select";
import {
  ALL_CATEGORY_PATHS,
  MODULE_IMAGE_CATEGORIES,
  type ModuleImageRecord,
} from "@/lib/module-images";
import { useSession } from "@/lib/session";
import type { MasterColumn } from "@/lib/navigation";
import { downloadBlob, downloadImageFile } from "@/lib/utils";
import { MODULE_TREE } from "@/lib/module-tree";

/** Text-only columns for the Excel/PDF export - Image (a raw file URL, not meaningful printed) and Action (page-only) are left out, matching every other export in the app. */
const EXPORT_COLUMNS: MasterColumn[] = [
  { key: "categoryLabel", label: "Category / Form" },
  { key: "date", label: "Date" },
  { key: "caption", label: "Caption" },
  { key: "status", label: "Status" },
];

const STATUS_OPTIONS = ["Published", "Not Published"];

/**
 * KVK Admin's own Module Images. Per the spec (section 11), a KVK uploads
 * photographs against a Form Management category via the dedicated Add
 * Image page, and this list shows only their own KVK's uploads, filterable
 * by Reporting Year / Category / date range - no cross-KVK picker (data
 * isolation, same rule as Log History). The API itself already scopes to
 * the caller's own KVK (GET /api/module-images), so there is no client-side
 * KVK filter on top - one used to be applied here against `currentKvkName`,
 * which silently hid every row whenever the session had no `kvkName` and the
 * label fell back to some other KVK; the API scope is the only thing needed.
 * Real backend wired 2026-08-28, replacing the always-empty
 * MODULE_IMAGE_ROWS this used to read from.
 *
 * "Bulk Download" now actually zips and downloads the currently filtered
 * rows (lib/module-images-zip.ts) - it used to be a disabled-looking button
 * with no onClick at all.
 */
export function KvkModuleImagesView() {
  const session = useSession();
  /** Display only (export title). The row list is scoped to this KVK by the API, not by this string. */
  const currentKvkName = session.kvkName ?? "your KVK";

  const [rows, setRows] = useState<ModuleImageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRows = useCallback(() => {
    fetch("/api/module-images")
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setRows(data.rows ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  /**
   * Real bug, 2026-09-13: the year checklist used to come from a hardcoded
   * "current year back 5" list (lib/module-images.ts's now-removed
   * MODULE_IMAGE_REPORTING_YEARS), with `selectedYears` starting as that
   * full hardcoded set to mean "all years". Any real upload whose reporting
   * year fell outside that fixed window could never be selected - not even
   * via "All" - because "All" only ever meant that same fixed set, and
   * `filteredRows` excluded anything not literally in it. Years now come
   * from this KVK's own real uploads, and an empty `selectedYears` (the
   * actual default, not a reconstructed "full set") means no year filter
   * at all - so a year is never invisible no matter how old or new.
   */
  const yearOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.reportingYear))).sort((a, b) => Number(b) - Number(a)),
    [rows],
  );
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(ALL_CATEGORY_PATHS),
  );
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(
    new Set(STATUS_OPTIONS),
  );
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  /** Optimistic local overrides while a PATCH is in flight - loadRows() reconciles with the real saved state right after. */
  const [publishOverrides, setPublishOverrides] = useState<
    Record<string, boolean>
  >({});

  const allCategoriesSelected =
    selectedCategories.size === ALL_CATEGORY_PATHS.size;
  const allYearsSelected = selectedYears.size === 0 || selectedYears.size === yearOptions.length;
  const allStatusesSelected = selectedStatuses.size === STATUS_OPTIONS.length;
  const dateRangeInvalid =
    fromDate !== "" && toDate !== "" && fromDate > toDate;

  const isPublished = useCallback(
    (row: ModuleImageRecord) => publishOverrides[row.id] ?? row.published,
    [publishOverrides],
  );

  const yearLabel = allYearsSelected
    ? "All Years"
    : selectedYears.size === 1
      ? Array.from(selectedYears)[0]
      : `${selectedYears.size} Years`;
  const statusLabel = allStatusesSelected
    ? "All Status"
    : selectedStatuses.size === 1
      ? Array.from(selectedStatuses)[0]
      : `${selectedStatuses.size} Statuses`;
  const categoryLabel = allCategoriesSelected ? "All Categories" : `${selectedCategories.size} Categories`;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!allYearsSelected && !selectedYears.has(row.reportingYear)) return false;
      if (!selectedCategories.has(row.categoryPath)) return false;
      if (!selectedStatuses.has(isPublished(row) ? "Published" : "Not Published")) return false;
      if (fromDate && row.date < fromDate) return false;
      if (toDate && row.date > toDate) return false;
      if (
        query &&
        !(
          row.categoryLabel.toLowerCase().includes(query) ||
          row.caption.toLowerCase().includes(query)
        )
      ) {
        return false;
      }
      return true;
    });
  }, [
    rows,
    allYearsSelected,
    selectedYears,
    selectedCategories,
    selectedStatuses,
    isPublished,
    fromDate,
    toDate,
    search,
  ]);

  /** Left "Modules" panel (ported from the removed /gallery page, 2026-09-02) - a quicker single-leaf drill-down with live counts, sitting alongside the Category/Form checklist for multi-select power filtering. */
  const [openModule, setOpenModule] = useState<string | null>(MODULE_TREE[0]?.slug ?? null);
  const activeLeafPath =
    selectedCategories.size === 1 ? Array.from(selectedCategories)[0] : null;

  function countForLeaf(path: string) {
    return rows.filter((row) => {
      if (row.categoryPath !== path) return false;
      if (!allYearsSelected && !selectedYears.has(row.reportingYear)) return false;
      if (!selectedStatuses.has(isPublished(row) ? "Published" : "Not Published")) return false;
      if (fromDate && row.date < fromDate) return false;
      if (toDate && row.date > toDate) return false;
      return true;
    }).length;
  }
  function countForModule(leaves: { path: string }[]) {
    return leaves.reduce((sum, leaf) => sum + countForLeaf(leaf.path), 0);
  }

  const exportTitle = `Module Images - ${currentKvkName}`;
  const exportRows = useMemo(
    () =>
      filteredRows.map((row) => ({
        categoryLabel: row.categoryLabel,
        date: row.date,
        caption: row.caption,
        status: isPublished(row) ? "Published" : "Not Published",
      })),
    [filteredRows, isPublished],
  );

  const hasActiveFilters =
    !allYearsSelected ||
    !allCategoriesSelected ||
    !allStatusesSelected ||
    fromDate !== "" ||
    toDate !== "";

  function resetFilters() {
    setSelectedYears(new Set());
    setSelectedCategories(new Set(ALL_CATEGORY_PATHS));
    setSelectedStatuses(new Set(STATUS_OPTIONS));
    setFromDate("");
    setToDate("");
  }

  function togglePublish(id: string, current: boolean) {
    const next = !current;
    setPublishOverrides((prev) => ({ ...prev, [id]: next }));
    fetch(`/api/module-images/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: next }),
    })
      .then(() => loadRows())
      .catch(() => {
        setPublishOverrides((prev) => ({ ...prev, [id]: current }));
      });
  }

  const [deleteRow, setDeleteRow] = useState<ModuleImageRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/module-images/${deleteRow.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Could not delete this photograph.");
      }
      setDeleteRow(null);
      loadRows();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete this photograph.");
    } finally {
      setDeleting(false);
    }
  }

  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload(row: ModuleImageRecord) {
    if (!row.previewUrl) return;
    try {
      await downloadImageFile(row.previewUrl, `${row.categoryLabel} - ${row.caption}`);
    } catch {
      setDownloadError("Could not download this photograph.");
    }
  }

  const [bulkDownloading, setBulkDownloading] = useState(false);

  async function handleBulkDownload() {
    if (filteredRows.length === 0) return;
    setDownloadError(null);
    setBulkDownloading(true);
    try {
      const { downloadModuleImagesZip } = await import("@/lib/module-images-zip");
      const { included } = await downloadModuleImagesZip(filteredRows, exportTitle);
      if (included === 0) {
        setDownloadError("Could not download any of the selected photographs.");
      }
    } catch {
      setDownloadError("Could not build the ZIP download.");
    } finally {
      setBulkDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
            <FilterIcon className="size-3.5" />
            Filter Images
          </div>
          <Button
            variant="outline-primary"
            size="sm"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Reporting Year
            </label>
            <div className="mt-1">
              <MultiFilterSelect
                label="Reporting Year"
                hideLabel
                options={yearOptions}
                selected={selectedYears}
                onChange={setSelectedYears}
                triggerClassName="h-9 w-full"
                className="w-full"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Category / Form
            </label>
            <div className="mt-1">
              <SelectCategoryDropdown
                selected={selectedCategories}
                onChange={setSelectedCategories}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Publish Status
            </label>
            <div className="mt-1">
              <MultiFilterSelect
                label="Publish Status"
                hideLabel
                options={STATUS_OPTIONS}
                selected={selectedStatuses}
                onChange={setSelectedStatuses}
                triggerClassName="h-9 w-full"
                className="w-full"
              />
            </div>
          </div>
          <div>
            <label htmlFor="module-images-from-date" className="text-xs font-medium text-muted-foreground">
              From Date
            </label>
            <Input
              id="module-images-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 h-9"
            />
          </div>
          <div>
            <label htmlFor="module-images-to-date" className="text-xs font-medium text-muted-foreground">
              To Date
            </label>
            <Input
              id="module-images-to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 h-9"
            />
          </div>
        </div>
        {dateRangeInvalid && (
          <p className="mt-2 text-xs text-destructive">
            To Date cannot be earlier than From Date.
          </p>
        )}
      </div>

      {downloadError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {downloadError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        <div className="rounded-lg border border-border bg-card p-3 lg:self-start">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Modules
          </p>
          <button
            type="button"
            onClick={() => setSelectedCategories(new Set(ALL_CATEGORY_PATHS))}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
              allCategoriesSelected
                ? "bg-accent font-medium text-accent-foreground"
                : "text-foreground hover:bg-muted",
            )}
          >
            All modules
            <span className="text-xs text-muted-foreground">
              {countForModule(MODULE_IMAGE_CATEGORIES)}
            </span>
          </button>
          <div className="mt-1 space-y-0.5">
            {MODULE_TREE.map((module) => {
              const isOpen = openModule === module.slug;
              return (
                <div key={module.slug}>
                  <button
                    type="button"
                    onClick={() => setOpenModule((prev) => (prev === module.slug ? null : module.slug))}
                    title={module.label}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:bg-muted"
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      {isOpen ? (
                        <ChevronDown className="size-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 truncate">{module.label}</span>
                    </span>
                    <span className="shrink-0">{countForModule(module.leaves)}</span>
                  </button>
                  {isOpen && (
                    <div className="ml-4 space-y-0.5 border-l border-border pl-2">
                      {module.leaves.map((leaf) => (
                        <button
                          key={leaf.path}
                          type="button"
                          onClick={() => setSelectedCategories(new Set([leaf.path]))}
                          title={leaf.label}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                            activeLeafPath === leaf.path
                              ? "bg-accent font-medium text-accent-foreground"
                              : "text-foreground hover:bg-muted",
                          )}
                        >
                          <span className="min-w-0 truncate">{leaf.label}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {countForLeaf(leaf.path)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Your Uploaded Images ({filteredRows.length})
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {categoryLabel} · {statusLabel} · {yearLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by category, caption..."
                className="w-56 pl-8"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const { generateTableExcel } = await import("@/lib/table-excel");
                const wb = await generateTableExcel(exportTitle, EXPORT_COLUMNS, exportRows);
                const buffer = await wb.xlsx.writeBuffer();
                downloadBlob(
                  new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
                  `${exportTitle}.xlsx`,
                );
              }}
            >
              <FileSpreadsheet className="size-3.5" />
              Export Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const { downloadTablePdf } = await import("@/lib/table-pdf");
                downloadTablePdf(exportTitle, EXPORT_COLUMNS, exportRows);
              }}
            >
              <FileDown className="size-3.5" />
              Export PDF
            </Button>
            <Button
              size="sm"
              disabled={filteredRows.length === 0 || bulkDownloading}
              onClick={handleBulkDownload}
            >
              <Download className="size-3.5" />
              {bulkDownloading ? "Preparing ZIP…" : "Bulk Download"}
            </Button>
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <ImageOff className="size-8 text-muted-foreground/40" />
              <span>No photographs uploaded yet.</span>
              <span className="text-xs">
                Add photos from the Photographs section at the end of a form (OFT, FLD, Training, Extension Activities).
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredRows.map((row) => (
                <ModuleImageCard
                  key={row.id}
                  row={row}
                  showKvk={false}
                  published={isPublished(row)}
                  onTogglePublish={() => togglePublish(row.id, isPublished(row))}
                  onDownload={() => handleDownload(row)}
                  onDelete={() => setDeleteRow(row)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
          <span>
            {filteredRows.length === 0
              ? "Showing 0-0 of 0"
              : `Showing 1-${filteredRows.length} of ${filteredRows.length}`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              Prev
            </Button>
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          </div>
        </div>
        </div>
      </div>

      <AlertDialog
        open={deleteRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteRow(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this photograph?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRow ? `${deleteRow.categoryLabel} - ${deleteRow.caption}` : ""}. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
