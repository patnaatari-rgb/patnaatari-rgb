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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { SelectKvksMultiDropdown } from "./select-kvks-multi-dropdown";
import { SelectCategoryDropdown } from "./select-category-dropdown";
import { ModuleImageCard } from "./module-image-card";
import { MultiFilterSelect } from "@/components/dashboard/multi-filter-select";
import {
  ALL_CATEGORY_PATHS,
  BULK_DOWNLOAD_OPTIONS,
  MODULE_IMAGE_CATEGORIES,
  type ModuleImageRecord,
} from "@/lib/module-images";
import { KVKS } from "@/lib/rbac";
import type { MasterColumn } from "@/lib/navigation";
import { downloadBlob, downloadImageFile } from "@/lib/utils";
import { MODULE_TREE } from "@/lib/module-tree";

/** Text-only columns for the Excel/PDF export - Image (a raw file URL, not meaningful printed) and Action (page-only) are left out, matching every other export in the app. */
const EXPORT_COLUMNS: MasterColumn[] = [
  { key: "kvk", label: "KVK Name" },
  { key: "categoryLabel", label: "Category / Form" },
  { key: "date", label: "Date" },
  { key: "caption", label: "Caption" },
  { key: "status", label: "Status" },
];

const STATUS_OPTIONS = ["Published", "Not Published"];

/** Real photo grid, 2026-09-24: cross-KVK view can have 60+ photographs at once, and loading every one's image together was the slow part of this page - paginate client-side over the already-fetched+filtered rows instead of a slower server round-trip per page. */
const PAGE_SIZE = 10;

/**
 * Super Admin - Module Images → Category Wise Photographs. Matches
 * "Module Images UI.pdf" section 2-9 & 17: Reporting Year + multi-select
 * KVKs + Category/Form + date range filters, a results table with a
 * per-row Download, and a "Download Images By" menu offering Selected
 * KVKs & Category / All Images. Super Admin has no Upload/Edit here (spec
 * section 1) - every action is view/filter/download only. The per-row
 * bulk-selection checkbox (and its "Selected Records" download option) was
 * removed 2026-08-31 (client direction) along with its column.
 *
 * Real backend wired 2026-08-28 (GET /api/module-images returns every
 * image across the zone for this role) - was reading the always-empty
 * MODULE_IMAGE_ROWS constant before.
 *
 * Per-row checkboxes + "Selected Records" download restored (client's
 * updated spec wants selective bulk download back), and "Download Images
 * By" now produces a real ZIP (lib/module-images-zip.ts) instead of the
 * no-op stub it used to be.
 */
export function SuperAdminModuleImagesView() {
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
   * Real bug, 2026-09-13: same as the KVK Admin view - the year checklist
   * used to come from a hardcoded "current year back 5" list, with
   * `selectedYears` starting as that full hardcoded set to mean "all
   * years". Any real upload (from any KVK) whose reporting year fell
   * outside that fixed window could never be selected, not even via "All".
   * Years now come from every real upload across the zone, and an empty
   * `selectedYears` (the actual default) means no year filter at all.
   */
  const yearOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.reportingYear))).sort((a, b) => Number(b) - Number(a)),
    [rows],
  );
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set());
  const [selectedKvks, setSelectedKvks] = useState<Set<string>>(
    new Set(KVKS.map((k) => k.name)),
  );
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(ALL_CATEGORY_PATHS),
  );
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(
    new Set(STATUS_OPTIONS),
  );
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  /** Super Admin's publish overrides, keyed by row id - in-memory only until the backend lands. */
  const [publishOverrides, setPublishOverrides] = useState<
    Record<string, boolean>
  >({});

  const allCategoriesSelected =
    selectedCategories.size === ALL_CATEGORY_PATHS.size;
  const categoryLabel = allCategoriesSelected
    ? "All Categories"
    : selectedCategories.size === 0
      ? "No Category Selected"
      : selectedCategories.size === 1
        ? (MODULE_IMAGE_CATEGORIES.find((c) => selectedCategories.has(c.path))
            ?.label ?? "1 Category")
        : `${selectedCategories.size} Categories`;

  const allYearsSelected = selectedYears.size === 0 || selectedYears.size === yearOptions.length;
  const yearLabel = allYearsSelected
    ? "All Years"
    : selectedYears.size === 1
      ? Array.from(selectedYears)[0]
      : `${selectedYears.size} Years`;
  const allStatusesSelected = selectedStatuses.size === STATUS_OPTIONS.length;
  const statusLabel = allStatusesSelected
    ? "All Status"
    : selectedStatuses.size === 1
      ? Array.from(selectedStatuses)[0]
      : `${selectedStatuses.size} Statuses`;

  const dateRangeInvalid =
    fromDate !== "" && toDate !== "" && fromDate > toDate;

  /** A row's effective publish state: the Super Admin's override if they've set one, otherwise what the KVK saved. */
  const isPublished = useCallback(
    (row: ModuleImageRecord) => publishOverrides[row.id] ?? row.published,
    [publishOverrides],
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!allYearsSelected && !selectedYears.has(row.reportingYear)) return false;
      if (selectedKvks.size > 0 && !selectedKvks.has(row.kvk)) return false;
      if (!selectedCategories.has(row.categoryPath)) return false;
      if (!selectedStatuses.has(isPublished(row) ? "Published" : "Not Published")) return false;
      if (fromDate && row.date < fromDate) return false;
      if (toDate && row.date > toDate) return false;
      if (
        query &&
        !(
          row.kvk.toLowerCase().includes(query) ||
          row.categoryLabel.toLowerCase().includes(query) ||
          row.caption.toLowerCase().includes(query) ||
          row.reportingYear.includes(query)
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
    selectedKvks,
    selectedCategories,
    selectedStatuses,
    isPublished,
    fromDate,
    toDate,
    search,
  ]);

  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((row) => selectedRowIds.has(row.id));
  const someFilteredSelected = filteredRows.some((row) => selectedRowIds.has(row.id));

  function toggleSelectAll() {
    setSelectedRowIds((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        filteredRows.forEach((row) => next.delete(row.id));
        return next;
      }
      const next = new Set(prev);
      filteredRows.forEach((row) => next.add(row.id));
      return next;
    });
  }

  function toggleRowSelected(id: string) {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Left "Modules" panel (ported from the removed /gallery page, 2026-09-02) - a quicker single-leaf drill-down with live counts, sitting alongside the Category/Form checklist for multi-select power filtering. */
  const [openModule, setOpenModule] = useState<string | null>(MODULE_TREE[0]?.slug ?? null);
  const activeLeafPath =
    selectedCategories.size === 1 ? Array.from(selectedCategories)[0] : null;

  function countForLeaf(path: string) {
    return rows.filter((row) => {
      if (row.categoryPath !== path) return false;
      if (!allYearsSelected && !selectedYears.has(row.reportingYear)) return false;
      if (selectedKvks.size > 0 && !selectedKvks.has(row.kvk)) return false;
      if (!selectedStatuses.has(isPublished(row) ? "Published" : "Not Published")) return false;
      if (fromDate && row.date < fromDate) return false;
      if (toDate && row.date > toDate) return false;
      return true;
    }).length;
  }
  function countForModule(leaves: { path: string }[]) {
    return leaves.reduce((sum, leaf) => sum + countForLeaf(leaf.path), 0);
  }

  const exportTitle = "Module Images - Category Wise Photographs";
  const exportRows = useMemo(
    () =>
      filteredRows.map((row) => ({
        kvk: row.kvk,
        categoryLabel: row.categoryLabel,
        date: row.date,
        caption: row.caption,
        status: isPublished(row) ? "Published" : "Not Published",
      })),
    [filteredRows, isPublished],
  );

  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [selectedYears, selectedKvks, selectedCategories, selectedStatuses, fromDate, toDate, search]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredRows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const hasActiveFilters =
    !allYearsSelected ||
    selectedKvks.size !== KVKS.length ||
    !allCategoriesSelected ||
    !allStatusesSelected ||
    fromDate !== "" ||
    toDate !== "" ||
    search !== "";

  function resetFilters() {
    setSelectedYears(new Set());
    setSelectedKvks(new Set(KVKS.map((k) => k.name)));
    setSelectedCategories(new Set(ALL_CATEGORY_PATHS));
    setSelectedStatuses(new Set(STATUS_OPTIONS));
    setFromDate("");
    setToDate("");
    setSearch("");
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
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteRow.id);
        return next;
      });
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
      await downloadImageFile(row.previewUrl, `${row.kvk} - ${row.categoryLabel} - ${row.caption}`);
    } catch {
      setDownloadError("Could not download this photograph.");
    }
  }

  const kvkLabel = useMemo(() => {
    if (selectedKvks.size === 0 || selectedKvks.size === KVKS.length)
      return "All KVKs";
    if (selectedKvks.size === 1) return Array.from(selectedKvks)[0];
    return `${selectedKvks.size} KVKs`;
  }, [selectedKvks]);

  const [downloading, setDownloading] = useState(false);

  async function handleBulkDownload(mode: (typeof BULK_DOWNLOAD_OPTIONS)[number]["mode"]) {
    let targetRows: ModuleImageRecord[];
    if (mode === "selected-records") {
      targetRows = filteredRows.filter((row) => selectedRowIds.has(row.id));
    } else if (mode === "all-images") {
      targetRows = rows.filter((row) => {
        if (!selectedYears.has(row.reportingYear)) return false;
        if (selectedKvks.size > 0 && !selectedKvks.has(row.kvk)) return false;
        if (!selectedStatuses.has(isPublished(row) ? "Published" : "Not Published")) return false;
        if (fromDate && row.date < fromDate) return false;
        if (toDate && row.date > toDate) return false;
        return true;
      });
    } else {
      targetRows = filteredRows;
    }

    if (targetRows.length === 0) {
      setDownloadError("No photographs match this download option.");
      return;
    }

    setDownloadError(null);
    setDownloading(true);
    try {
      const { downloadModuleImagesZip } = await import("@/lib/module-images-zip");
      const { included } = await downloadModuleImagesZip(targetRows, exportTitle);
      if (included === 0) {
        setDownloadError("Could not download any of the selected photographs.");
      }
    } catch {
      setDownloadError("Could not build the ZIP download.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
            <FilterIcon className="size-3.5" />
            Image Filters
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

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
              Select KVKs
            </label>
            <div className="mt-1">
              <SelectKvksMultiDropdown
                selected={selectedKvks}
                onChange={setSelectedKvks}
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
              Uploaded Images ({filteredRows.length})
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {kvkLabel} · {categoryLabel} · {statusLabel} · {yearLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by KVK, Category, Caption, Year..."
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
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="sm" disabled={filteredRows.length === 0 || downloading}>
                    <Download className="size-3.5" />
                    {downloading ? "Preparing ZIP…" : "Download Images By"}
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-72">
                {BULK_DOWNLOAD_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.mode}
                    onClick={() => handleBulkDownload(option.mode)}
                    disabled={option.mode === "selected-records" && selectedRowIds.size === 0}
                    className="flex-col items-start gap-0.5 py-1.5"
                  >
                    <span className="font-medium text-foreground">
                      {option.label}
                      {option.mode === "selected-records" && selectedRowIds.size > 0
                        ? ` (${selectedRowIds.size})`
                        : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="border-b border-border p-4">
          <label className="flex w-fit items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={allFilteredSelected}
              indeterminate={!allFilteredSelected && someFilteredSelected}
              onCheckedChange={toggleSelectAll}
              disabled={filteredRows.length === 0}
              aria-label="Select all"
            />
            Select All
          </label>
        </div>

        <div className="p-4">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <ImageOff className="size-8 text-muted-foreground/40" />
              <span>No photographs uploaded yet for the selected filters.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {pageRows.map((row) => (
                <ModuleImageCard
                  key={row.id}
                  row={row}
                  showKvk
                  selected={selectedRowIds.has(row.id)}
                  onToggleSelected={() => toggleRowSelected(row.id)}
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
              : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of ${filteredRows.length}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
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
              {deleteRow ? `${deleteRow.kvk} - ${deleteRow.categoryLabel} - ${deleteRow.caption}` : ""}
              . This cannot be undone.
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
