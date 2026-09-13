"use client";

import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Search,
  FileDown,
  FileSpreadsheet,
  FileType,
  Filter,
  Plus,
  RotateCcw,
  MoreVertical,
  Pencil,
  Trash2,
  ArrowRightCircle,
  ClipboardCheck,
  ImageIcon,
  FileText,
  AlertTriangle,
  GripVertical,
  History,
  CheckCircle2,
} from "lucide-react";
import type { SidebarIconName } from "@/lib/navigation";
import { SIDEBAR_ICONS } from "@/components/layout/sidebar-icons";
import { reportSubsectionForLeaf } from "@/lib/report-section-map";
import type { ReportSection, ReportTable, ReportColumn, ReportBlock } from "@/lib/report-types";
import { cn, downloadBlob } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/simple-select";
import { MultiFilterSelect } from "@/components/dashboard/multi-filter-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ColumnFilterMenu, type ColumnFilterState } from "./column-filter-menu";
import type { MasterColumn } from "@/lib/navigation";
import { EventDemographicDialog } from "./event-demographic-dialog";
import { MasterFormFields, DEMOGRAPHIC_KEYS, prefixedDemographicKey } from "./master-form-fields";

export type MasterTab = { label: string; href: string; active: boolean };

type EmptyDataTableProps = {
  /** Page title, rendered inside the card next to the export/Add New buttons (confirmed placement from the reference - not a separate PageHeader title above the tabs). */
  title: string;
  /**
   * Module icon shown next to the title, matching the section's sidebar
   * icon (client request: every module heading needs a relevant icon).
   * Taken as a name rather than the icon component itself - this renders
   * from Server Component pages (masters/[...slug], forms/[...slug]), and a
   * component reference isn't serializable across that RSC boundary into
   * this Client Component (same reasoning as SidebarTopLink's iconName).
   */
  icon?: SidebarIconName;
  columns: MasterColumn[];
  /** "Manage and view all zone master in the system" - shown under the title. */
  subtitle?: string;
  /** Sibling leaves in the same group, rendered as pills above the card (e.g. Zone/State/District/... in All Masters, DRMR Details/DRMR Activity in Form Management). */
  tabs?: MasterTab[];
  /** Real reference rows, keyed by column `key`. Omit to keep the original all-empty placeholder behavior. */
  rows?: Record<string, ReactNode>[];
  /** Real total row count for the pagination footer, when it differs from `rows.length` (a partial first page). */
  totalCount?: number;
  /**
   * Real cascading-dropdown behaviour confirmed for a couple of Basic
   * Masters' Add New forms (District Master, KVK Master both cascade
   * Zone -> State ->... in the reference) - turns the matching columns
   * (zoneName/stateName/hostOrg) into dependent selects reusing the same
   * Zone/State/Host-Org data Reports already draws from, instead of the
   * generic plain-text field every other leaf gets.
   */
  cascadeType?: "district" | "kvk" | "institute";
  /** Overrides the Edit dialog's "Mark as Other" checkbox visibility when confirmed against the real reference (lib/navigation.ts's NavLeaf.showMarkAsOther) - falls back to the single-"name"-column heuristic below when unset. Edit reuses the same field set as the real Create screen for a given master. */
  showMarkAsOther?: boolean;
  /** When set, Add New/Edit open a bespoke dialog instead of the generic per-column form - for the event leaves carrying the recurring demographic-breakdown block that the generic per-column form can't render (CFLD Technical Parameter's own 4-tab shape moved to a full page instead, 2026-09-01 - see the `technical-parameter` checks below, keyed off `eventSlug` rather than this prop now). */
  customForm?: "event-demographic";
  /** Leaf slug, always passed regardless of `customForm` - drives the "event-demographic" custom fields above, and (for "technical-parameter") the CFLD-specific extra Action-dropdown items below. */
  eventSlug?: string;
  /**
   * When set, "Add New" navigates here instead of opening the dialog - per
   * client direction (2026-08-24), every leaf's Add New now opens a
   * dedicated page rather than a popup, matching the reference's own Add
   * screens (which are always full pages with a Back button, never a
   * modal). Editing an existing row still uses the dialog either way (not
   * part of that request).
   */
  addNewHref?: string;
  /**
   * When set, "Edit" navigates to `${editHrefBase}/edit/{id}` (a dedicated
   * page, matching addNewHref's own "Add New" page) instead of opening the
   * dialog - Form Management only (client direction, 2026-09-01). Masters/
   * Targets/Notifications never pass this, so their Edit stays the popup
   * dialog exactly as before. The event-demographic leaves (`customForm`
   * set) keep their dialog too, even when this is passed, since their real
   * edit shape isn't a flat field list.
   */
  editHrefBase?: string;
  /** Targets/Notifications already have their own dedicated inline "Assign"/"Send" panel above the table - the generic Add New button would just duplicate that with unrelated fields, so it's hidden there instead of getting a pointless page of its own. */
  hideAddNew?: boolean;
  /**
   * View OFT / View FLD only (client pointer, 2026-08-24): rows carry a
   * "status" value ("Ongoing" | "Completed" | "Transferred to Next Year"),
   * rendered as a colored badge instead of plain text, and the row Action
   * dropdown gains Transfer (only while Ongoing - the client's spec: once
   * Completed or already Transferred, Transfer stops appearing so a record
   * can't be transferred twice) and Edit Result/Mark Completed alongside
   * Edit/Delete - shown to Super Admin too (client correction, 2026-09-01,
   * superseding an earlier "Super Admin gets Edit/Delete only" reading).
   */
  oftFldStatus?: boolean;
  /** Both "fld" and "oft" navigate to the real full-page result view (FldResultFields / OftResultFields, via ?tab=result on the Edit page) - only the Action-menu label differs ("Add Result" for fld, "Edit Result" for oft). Only meaningful when oftFldStatus is true. */
  resultKind?: "oft" | "fld";
  /**
   * Real reference confirmed 2026-09-02 - OFT's own list toolbar has a
   * "Reporting Year" filter (client-confirmed default-to-current-year
   * direction), but FLD's list toolbar does NOT have one at all (only
   * Search/From date/To date/Reset), even though both leaves share
   * `oftFldStatus` for their Action-menu behavior. Defaulting this filter
   * on for FLD too silently hid real FLD data from any year other than the
   * current one, with no visible control explaining why - split out from
   * `oftFldStatus` so each leaf's toolbar can match its own real reference.
   */
  reportingYearFilter?: boolean;
  /** Shown as a note banner above the table - e.g. OFT/FLD's "mark your result as Completed" instruction. */
  note?: string;
  /** Staff Transferred only (real reference action, confirmed 2026-09-01): adds a "View Transfer History" item between Edit and Delete, reading each row's `historyJson` field (a JSON-stringified array of { fromKvk, toKvk, date }) built server-side from every StaffTransfer record for that staff member. */
  staffTransferHistory?: boolean;
  /** Read-only list: no "Add New", no Action column. For leaves the live reference shows as a plain table with no row actions (e.g. Staff Transferred / atariams.org /transfer-staff - the records are created only by Employee Details' own Transfer action). */
  readOnly?: boolean;
  /** Employee Details only: the Action dropdown gains "Transfer", opening a KVK + Date of Relieving dialog that POSTs to /api/staff/transfer. The hop then shows under the destination KVK's "Details of Staff Transferred" list only. */
  staffTransfer?: boolean;
  /**
   * Employee Details only (client direction, 2026-09-13): a staff transfer
   * saves instantly, but a tab already sitting open on the DESTINATION KVK's
   * Employee Details - opened before the transfer happened - has no way to
   * know new data exists, since this app has no push/WebSocket layer. Polls
   * `router.refresh()` every 30s so that tab picks up an incoming transfer
   * on its own, without the KVK Admin needing to know to hit reload. Paused
   * while the tab isn't visible, so it isn't refreshing (and re-querying the
   * database) for a tab nobody is looking at.
   */
  autoRefresh?: boolean;
  /** Registry key in lib/leaf-record-registry.ts (Form Management) or lib/masters-registry.ts (All Masters) - enables real Edit/Delete for this leaf's rows. Omit for leaves not wired to the database yet. For recordKind "notification" this is just a truthy sentinel (the row's own `id` drives the real /api/notifications/[id] URL, not a registry path). */
  recordPath?: string;
  /** Which registry/endpoint `recordPath` refers to - "form" (default, KVK-scoped Form Management leaves), "master" (zone-scoped, Super Admin only, All Masters leaves), or "notification" (Notifications page's Sent/Received tables, /api/notifications/[id]). */
  recordKind?: "form" | "master" | "notification";
  /** Restricts the Edit dialog to only these column keys (Notifications: title/message only - recipient/from/sentOn are derived/read-only, not real editable fields). Omit to edit every column, the default for every other leaf. */
  editableColumnKeys?: string[];
  /**
   * Called after a successful Edit or Delete, in addition to the usual
   * `router.refresh()`. Most callers get their `rows` from a Server
   * Component (Masters/Form Management), where `router.refresh()` alone
   * re-fetches everything - but a page like Notifications loads its rows
   * itself via a client-side `useEffect` + `fetch`, which `router.refresh()`
   * never re-runs, so the deleted/edited row silently stayed on screen
   * until a real page reload. Pass the page's own re-fetch function here to
   * fix that for any client-fetched caller.
   */
  onMutated?: () => void;
};

const STATUS_BADGE_STYLES: Record<string, string> = {
  Ongoing: "bg-[#eaa624]/15 text-[#b5790a] border-[#eaa624]/40",
  Completed: "bg-primary/10 text-primary border-primary/30",
  "Transferred to Next Year":
    "bg-muted text-muted-foreground border-border",
};

/**
 * Whether a cell value falls in one of the selected reporting years. Handles a
 * plain year ("2025") and a date form of it ("2025-01-01", "2025-09-10", an
 * ISO timestamp) - some leaves store `reportingYear` as "<year>-01-01" because
 * the field renders as a date picker, so a bare `Set.has(value)` check misses
 * every one of their rows when a year is selected.
 */
function inSelectedYears(value: string, years: Set<string>): boolean {
  if (!value) return false;
  if (years.has(value)) return true;
  const y = value.slice(0, 4);
  return /^\d{4}$/.test(y) && years.has(y);
}

/**
 * The list-page shell repeated across nearly every master and form screen:
 * tabs above a card, then inside the card a title+export-buttons row, a
 * search/date-filter row, and the table. This exact ordering (tabs before
 * the card; title sharing a row with PDF/Excel/Word/Add New; search+dates
 * as their own row below that) was confirmed pixel-for-pixel against the
 * reference - do not reorder without re-checking the video.
 *
 * Most masters have no data source wired up yet (Step 3 of the build), so
 * they render the real empty state - "Showing 0-0 of 0" - rather than
 * fabricated rows. A handful of Basic Masters (Zone/State/District/Host/KVK)
 * pass real reference rows via `rows`; everything else keeps the original
 * empty behavior. Search/date inputs are live pieces of UI state; export,
 * "Add New", row actions, and the per-column filter icon are presentational
 * until the database step lands.
 */

export function EmptyDataTable({
  title,
  icon,
  columns,
  subtitle,
  tabs,
  rows,
  totalCount,
  cascadeType,
  showMarkAsOther,
  customForm,
  eventSlug,
  addNewHref,
  editHrefBase,
  hideAddNew,
  oftFldStatus,
  reportingYearFilter,
  resultKind,
  note,
  recordPath,
  recordKind = "form",
  editableColumnKeys,
  onMutated,
  staffTransferHistory,
  staffTransfer,
  autoRefresh,
  readOnly,
}: EmptyDataTableProps) {
  const router = useRouter();

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, router]);

  /** Every list table gets a real Action column (Edit/Delete) regardless of role, matching every other leaf in the app - Transfer/Add Result specifically stay KVK-only below (transferring or marking a trial's own result isn't a Super Admin action), but that no longer means hiding Edit/Delete from Super Admin too. `readOnly` leaves (Staff Transferred) are the one exception the live reference makes - a plain table, no row actions. */
  const showActionColumn = !readOnly;
  /** `columns` includes any `formOnly` entries (demographic-breakdown blocks) needed by the Add/Edit form below - the list table itself only ever renders real, single-value columns, so every table concern (header, rows, colSpan, exports) uses this filtered list instead. */
  const tableColumns = columns.filter((c) => !c.formOnly);
  const Icon = icon ? SIDEBAR_ICONS[icon] : undefined;
  /**
   * When this is a Form Management leaf that maps to a big-report subsection
   * (lib/report-section-map.ts), the PDF/Excel/Word buttons produce that
   * subsection's whole subtree - the same slice the Super Admin report shows
   * for this part - instead of a flat one-table export of the list's rows.
   */
  const reportRef = recordKind === "form" ? reportSubsectionForLeaf(recordPath) : undefined;
  const [reportExport, setReportExport] = useState<null | "pdf" | "excel" | "word">(null);
  /** Unique per instance - a page can render more than one EmptyDataTable (e.g. Notifications' Received + Sent tables), and duplicate ids break label association. */
  const instanceId = useId();
  const fromDateId = `${instanceId}-from-date`;
  const toDateId = `${instanceId}-to-date`;
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  /** Every column whose key is a date field, by this schema's own consistent naming (startDate/endDate/dateOfVisit/activityDate/meetingDate/... always end in "Date", or the bare key "date") - used by the From/To Date range filter below, since which single column is "the" date varies per leaf and there's no one universal key. Computed before `reportingYearOptions`, which also needs it. */
  const dateColumnKeys = useMemo(
    () => tableColumns.map((c) => c.key).filter((key) => key === "date" || /Date$/.test(key)),
    [tableColumns],
  );
  /**
   * Real bug, 2026-09-13: this used to hardcode "the current year plus the
   * previous 5" - any row whose reportingYear (or date column) fell outside
   * that fixed window could never be selected, not even via "All" (which
   * only checks the years actually offered here) - a KVK Bhagalpur OFT
   * dated 2027 was invisible this way, with clearing the filter entirely
   * the only way to see it. Options now come from the real years present in
   * this leaf's own rows - always exactly right, no matter how old or how
   * far in the future a real reportingYear or date turns out to be.
   *
   * Second real bug, same day (client screenshot): this only ever checked
   * `reportingYear` and date-suffixed columns - View Vehicles / View
   * Equipments / Farm Implement Details key their year as `yearOfPurchase`
   * instead, which matched neither, so the checklist showed nothing but
   * "All" no matter how many real Year of Purchase values existed. Checking
   * `yearOfPurchase` too (and the matching filteredRows clause below) covers
   * this leaf shape without guessing at every possible year field name.
   */
  const reportingYearOptions = useMemo(() => {
    if (!rows) return [];
    const years = new Set<string>();
    for (const row of rows) {
      const y = String(row.reportingYear ?? row.yearOfPurchase ?? "").trim();
      if (/^\d{4}$/.test(y)) years.add(y);
      for (const key of dateColumnKeys) {
        const raw = String(row[key] ?? "").trim();
        const match = /^(\d{4})-\d{2}-\d{2}/.exec(raw);
        if (match) years.add(match[1]);
      }
    }
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [rows, dateColumnKeys]);
  /**
   * "Reporting Year" checkbox multi-select next to the date range (client
   * request, 2026-09-07) - was a single-value dropdown shown only for OFT/FLD.
   * Empty = no year filter. OFT/FLD (`reportingYearFilter`) still start on the
   * current year, per the "current year's data first" note; every other leaf
   * starts with nothing checked.
   */
  const [reportingYears, setReportingYears] = useState<Set<string>>(() =>
    reportingYearFilter ? new Set([String(new Date().getFullYear())]) : new Set(),
  );
  const [columnFilters, setColumnFilters] = useState<
    Record<string, ColumnFilterState>
  >({});

  /**
   * Movable columns (client request, 2026-08-25): drag a header by its grip
   * to reorder it. Order is tracked as a list of keys, separate from
   * `columns` itself, so the confirmed real column definitions never
   * mutate - only their on-screen order does. Resets whenever the leaf
   * changes (a different `columns` array arrives) rather than carrying a
   * stale order from a previous table into a new one.
   */
  const [columnOrder, setColumnOrder] = useState(() => tableColumns.map((c) => c.key));
  const columnKeySignature = tableColumns.map((c) => c.key).join("|");
  const [lastColumnKeySignature, setLastColumnKeySignature] = useState(columnKeySignature);
  if (columnKeySignature !== lastColumnKeySignature) {
    setLastColumnKeySignature(columnKeySignature);
    setColumnOrder(tableColumns.map((c) => c.key));
  }
  const orderedColumns = columnOrder
    .map((key) => tableColumns.find((c) => c.key === key))
    .filter((c): c is MasterColumn => c !== undefined);
  const draggedColumnKey = useRef<string | null>(null);
  const [dragOverColumnKey, setDragOverColumnKey] = useState<string | null>(null);

  function moveColumn(targetKey: string) {
    const draggedKey = draggedColumnKey.current;
    if (!draggedKey || draggedKey === targetKey) return;
    setColumnOrder((prev) => {
      const next = prev.filter((k) => k !== draggedKey);
      const targetIndex = next.indexOf(targetKey);
      next.splice(targetIndex, 0, draggedKey);
      return next;
    });
  }

  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<
    string,
    ReactNode
  > | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [markAsOther, setMarkAsOther] = useState(false);
  const [deleteRow, setDeleteRow] = useState<Record<string, ReactNode> | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    const id = deleteRow?.id;
    if (!recordPath || typeof id !== "string") {
      setDeleteRow(null);
      return;
    }
    setDeleteError(null);
    setDeleting(true);
    try {
      const response =
        recordKind === "notification"
          ? await fetch(`/api/notifications/${id}`, { method: "DELETE" })
          : await fetch(recordKind === "master" ? "/api/master-record/delete" : "/api/leaf-record/delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: recordPath, id }),
            });
      const data = await response.json();
      if (!response.ok) {
        setDeleteError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDeleteRow(null);
      router.refresh();
      onMutated?.();
    } catch {
      setDeleteError("Could not reach the server. Please try again.");
    } finally {
      setDeleting(false);
    }
  }
  const [transferRow, setTransferRow] = useState<Record<
    string,
    ReactNode
  > | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  async function confirmTransfer() {
    const id = transferRow?.id;
    if (!recordPath || typeof id !== "string") {
      setTransferRow(null);
      return;
    }
    setTransferError(null);
    setTransferring(true);
    try {
      const response = await fetch("/api/leaf-record/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: recordPath, id }),
      });
      const data = await response.json();
      if (!response.ok) {
        setTransferError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setTransferRow(null);
      router.refresh();
    } catch {
      setTransferError("Could not reach the server. Please try again.");
    } finally {
      setTransferring(false);
    }
  }

  // --- Staff transfer (Employee Details) ---
  const [staffTransferRow, setStaffTransferRow] = useState<Record<string, ReactNode> | null>(null);
  const [staffTransferKvk, setStaffTransferKvk] = useState("");
  const [staffTransferDate, setStaffTransferDate] = useState("");
  const [staffTransferError, setStaffTransferError] = useState<string | null>(null);
  const [staffTransferSubmitting, setStaffTransferSubmitting] = useState(false);
  const [kvkOptions, setKvkOptions] = useState<string[]>([]);

  useEffect(() => {
    if (!staffTransfer) return;
    let cancelled = false;
    fetch("/api/kvks")
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((data: { rows?: { kvk?: string }[] }) => {
        if (!cancelled) setKvkOptions((data.rows ?? []).map((r) => r.kvk ?? "").filter(Boolean));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [staffTransfer]);

  async function submitStaffTransfer() {
    const staffId = staffTransferRow?.id;
    if (typeof staffId !== "string") return;
    if (!staffTransferKvk || !staffTransferDate) {
      setStaffTransferError("Select a KVK and the date of relieving.");
      return;
    }
    setStaffTransferError(null);
    setStaffTransferSubmitting(true);
    try {
      const response = await fetch("/api/staff/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, toKvkName: staffTransferKvk, transferDate: staffTransferDate }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStaffTransferError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setStaffTransferRow(null);
      setStaffTransferKvk("");
      setStaffTransferDate("");
      router.refresh();
    } catch {
      setStaffTransferError("Could not reach the server. Please try again.");
    } finally {
      setStaffTransferSubmitting(false);
    }
  }

  /** OFT only (real reference action, 2026-09-01) - a direct "Ongoing" -> "Completed" flip with no form, separate from Edit Result (which still opens the placeholder Add/Edit Result dialog pending OFT's own dynamic-table result feature). */
  const [markCompletedRow, setMarkCompletedRow] = useState<Record<
    string,
    ReactNode
  > | null>(null);
  const [markCompletedError, setMarkCompletedError] = useState<string | null>(null);
  const [markCompleting, setMarkCompleting] = useState(false);

  async function confirmMarkCompleted() {
    const id = markCompletedRow?.id;
    if (!recordPath || typeof id !== "string") {
      setMarkCompletedRow(null);
      return;
    }
    setMarkCompletedError(null);
    setMarkCompleting(true);
    try {
      const response = await fetch("/api/leaf-record/mark-completed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: recordPath, id }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMarkCompletedError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setMarkCompletedRow(null);
      router.refresh();
    } catch {
      setMarkCompletedError("Could not reach the server. Please try again.");
    } finally {
      setMarkCompleting(false);
    }
  }

  /** CFLD Technical Parameter's Add/Edit (all 4 tabs) moved to its own dedicated pages (2026-09-01, same rollout as every other Form Management leaf) - this flag still drives its other row-level specifics below (the status badge, and the always-visible Transfer action), just no longer the dialog. */
  const isCfldTechnicalParameter = eventSlug === "technical-parameter";

  const [historyStaffName, setHistoryStaffName] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<
    { fromKvk: string; toKvk: string; transferredBy: string; date: string }[]
  >([]);
  function openTransferHistory(row: Record<string, ReactNode>) {
    let entries: { fromKvk: string; toKvk: string; transferredBy: string; date: string }[] = [];
    try {
      entries = JSON.parse(String(row.historyJson ?? "[]"));
    } catch {
      entries = [];
    }
    setHistoryEntries(entries);
    setHistoryStaffName(typeof row.staffName === "string" ? row.staffName : "this staff member");
  }

  /** Real confirmed pattern for every "simple" single-Name master (Subject, Funding Source, Asset Funding Source, NARI Nutrition Garden Type, Pay Scale, TSP/SCSP Activity, and every other single-column master sharing this exact shape): the real Create form is one Name field plus a "Mark as 'Other' option" checkbox. */
  const isSimpleMaster =
    showMarkAsOther ?? (columns.length === 1 && columns[0].key === "name");

  const hasActiveDates = fromDate !== "" || toDate !== "";
  const hasActiveColumnFilters = Object.values(columnFilters).some(
    (state) => state.sort !== null || state.selected !== null,
  );
  const hasActiveFilters =
    hasActiveDates || search !== "" || hasActiveColumnFilters;

  function resetDates() {
    setFromDate("");
    setToDate("");
  }

  function resetFilters() {
    setSearch("");
    setFromDate("");
    setToDate("");
    setColumnFilters({});
  }

  /**
   * Add/Edit form is generated from `columns` - one text field per confirmed
   * field name, since this phase has no backend to persist to and the real
   * input widget for each field (select vs text vs date, which are
   * required) isn't confirmed per-leaf across all ~40 Form Management
   * pages. Matches the rest of this app's Phase 1 convention: a real,
   * working dialog that doesn't invent field types it can't confirm.
   */
  function openAdd() {
    setEditingRow(null);
    setFormValues({});
    setMarkAsOther(false);
    setFormError(null);
    setFormOpen(true);
  }

  const editColumns = editableColumnKeys
    ? columns.filter((c) => editableColumnKeys.includes(c.key))
    : columns;

  function openEdit(row: Record<string, ReactNode>) {
    const values: Record<string, string> = {};
    for (const column of editColumns) {
      if (column.fieldKind === "demographic-breakdown") {
        // Represents 8 real row fields (prefix + DEMOGRAPHIC_KEYS), not row[column.key] itself.
        const prefix = column.demographicPrefix ?? "";
        for (const suffix of DEMOGRAPHIC_KEYS) {
          const key = prefixedDemographicKey(prefix, suffix);
          const value = row[key];
          values[key] = typeof value === "string" || typeof value === "number" ? String(value) : "";
        }
        continue;
      }
      const value = row[column.key];
      values[column.key] =
        typeof value === "string" || typeof value === "number"
          ? String(value)
          : "";
    }
    setEditingRow(row);
    setFormValues(values);
    setMarkAsOther(recordKind === "master" && row._isOther === "1");
    setFormError(null);
    setFormOpen(true);
  }

  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

  async function submitForm() {
    const id = editingRow?.id;
    if (!recordPath || typeof id !== "string") {
      setFormOpen(false);
      return;
    }
    setFormError(null);
    setFormSubmitting(true);
    try {
      const response =
        recordKind === "notification"
          ? await fetch(`/api/notifications/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: formValues.title, message: formValues.message }),
            })
          : await fetch(recordKind === "master" ? "/api/master-record/update" : "/api/leaf-record/update", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                path: recordPath,
                id,
                values:
                  recordKind === "master"
                    ? { ...formValues, __markAsOther__: markAsOther ? "yes" : "no" }
                    : formValues,
              }),
            });
      const data = await response.json();
      if (!response.ok) {
        setFormError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setFormOpen(false);
      router.refresh();
      onMutated?.();
    } catch {
      setFormError("Could not reach the server. Please try again.");
    } finally {
      setFormSubmitting(false);
    }
  }

  const deleteRowLabel =
    deleteRow && columns[0] && typeof deleteRow[columns[0].key] === "string"
      ? (deleteRow[columns[0].key] as string)
      : "this record";

  /** Distinct values (with counts) for a column, sourced from the real rows passed in - matches the reference's per-column "Unique Values" checklist. */
  function columnValues(key: string): { value: string; count: number }[] {
    if (!rows) return [];
    const counts = new Map<string, number>();
    for (const row of rows) {
      const value = String(row[key] ?? "");
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return Array.from(counts, ([value, count]) => ({ value, count })).sort(
      (a, b) => a.value.localeCompare(b.value),
    );
  }

  const filteredRows = useMemo(() => {
    if (!rows) return rows;
    const searchText = search.trim().toLowerCase();
    let next = rows.filter((row) => {
      if (searchText) {
        const matches = columns.some((c) =>
          String(row[c.key] ?? "").toLowerCase().includes(searchText),
        );
        if (!matches) return false;
      }
      if (reportingYears.size > 0) {
        // yearOfPurchase alongside reportingYear for the same reason as
        // reportingYearOptions above (View Vehicles / View Equipments / Farm
        // Implement Details key their year that way instead).
        const yearRaw = String(row.reportingYear ?? row.yearOfPurchase ?? "");
        const dateVals = dateColumnKeys
          .map((key) => String(row[key] ?? ""))
          .filter(Boolean);
        // Only rows that actually carry a year (a reportingYear or a date) are
        // subject to the year filter. Roster leaves - View KVKs, Bank Accounts,
        // Land, Infrastructure, Staff Quarters, ... - have neither, so the
        // filter must not blank them out when a year is picked.
        if (yearRaw !== "" || dateVals.length > 0) {
          const byYearCol = inSelectedYears(yearRaw, reportingYears);
          const byDateCol = dateVals.some((v) => inSelectedYears(v, reportingYears));
          if (!byYearCol && !byDateCol) return false;
        }
      }
      if (hasActiveDates) {
        const inRange = dateColumnKeys.some((key) => {
          const raw = String(row[key] ?? "");
          if (!raw) return false;
          const value = raw.slice(0, 10);
          if (fromDate && value < fromDate) return false;
          if (toDate && value > toDate) return false;
          return true;
        });
        if (dateColumnKeys.length > 0 && !inRange) return false;
      }
      return Object.entries(columnFilters).every(([key, state]) => {
        if (state.selected === null) return true;
        return state.selected.has(String(row[key] ?? ""));
      });
    });
    const sortEntry = Object.entries(columnFilters).find(
      ([, state]) => state.sort !== null,
    );
    if (sortEntry) {
      const [key, state] = sortEntry;
      next = [...next].sort((a, b) => {
        const cmp = String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
        return state.sort === "desc" ? -cmp : cmp;
      });
    }
    return next;
  }, [rows, columnFilters, search, columns, reportingYears, hasActiveDates, dateColumnKeys, fromDate, toDate]);

  /** Flat one-table export - used for Masters, and as the fallback when a mapped Form Management leaf turns out to have no report subsection for the current scope. */
  async function downloadFlat(format: "pdf" | "excel" | "word") {
    if (format === "pdf") {
      const { downloadTablePdf } = await import("@/lib/table-pdf");
      downloadTablePdf(title, tableColumns, filteredRows);
    } else if (format === "excel") {
      const { generateTableExcel } = await import("@/lib/table-excel");
      const wb = await generateTableExcel(title, tableColumns, filteredRows);
      const buffer = await wb.xlsx.writeBuffer();
      downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${title}.xlsx`);
    } else {
      const { generateTableWord } = await import("@/lib/table-word");
      downloadBlob(await generateTableWord(title, tableColumns, filteredRows), `${title}.docx`);
    }
  }

  /**
   * Applies the list's live filters (per-column value selections, the search
   * box, the reporting-year filter, the date range) to a fetched report
   * subtree so a "Download" from a filtered Form Management list produces a
   * report of just those rows - not the whole zone. Only flat grid tables
   * (columns + rows) are narrowed here; a single-KVK selection is also pushed
   * down to the server via ?kvk= so grouped/aggregated tables rebuild at that
   * scope. Report columns are matched to list columns by their shared label.
   */
    // A list column and its report-table counterpart don't always share the
    // exact label ("Landline" vs "Landline No.", "KVK" vs "KVK Name", ...) -
    // normalise both sides so an active list filter actually scopes the
    // downloaded report instead of being silently dropped (client report,
    // 2026-09-07: filtered the list, downloaded, "sab aa gaya").
    const normLabel = (l: string) => l.toLowerCase().replace(/[^a-z0-9]/g, "");

  function scopeReportSectionsToFilters(sections: ReportSection[]): ReportSection[] {
    const activeSelections = Object.entries(columnFilters)
      .filter(([, s]) => s.selected !== null)
      .map(([key, s]) => {
        const col = columns.find((c) => c.key === key);
        return col
          ? { key: col.key, label: col.label, allowed: s.selected as Set<string> }
          : null;
      })
      .filter((x): x is { key: string; label: string; allowed: Set<string> } => x !== null);
    const q = search.trim().toLowerCase();
    const yearActive = reportingYears.size > 0;
    const dateLabels = tableColumns
      .filter((c) => c.key === "date" || /Date$/.test(c.key))
      .map((c) => c.label);

    if (activeSelections.length === 0 && !q && !yearActive && !hasActiveDates) {
      return sections;
    }

    /**
     * Narrows one grid's own rows by every active filter, given just that
     * grid's own column list - shared by a plain table (its own top-level
     * columns) and, since the real bug fix below, every grid nested inside a
     * `blocks` table (each block's own `parts[].columns`, which is all a
     * per-KVK/per-group block ever declares - there's no shared top-level
     * `columns` array on a blocks table for those rows to be matched against
     * any other way).
     */
    const filterRowsByColumns = (
      cols: ReportColumn[],
      rows: Record<string, string>[],
      opts: { search?: boolean } = {},
    ) => {
      if (rows.length === 0) return rows;
      const keyByLabel = new Map(cols.map((c) => [c.label, c.key]));
      // key -> key (report tables reuse the list's own column keys where they
      // exist), an explicit listKey alias (real bug fix, 2026-09-14: a
      // report column that reads a Prisma field under a different name than
      // the list's own column - e.g. Employee Details' list key "staffName"
      // vs the "All KVK Staff" report's own "name" - where even the labels
      // never lined up, so neither the key nor the normalised-label match
      // below ever caught it), and normalised-label -> key, so a filter
      // matches even when the two sides spell the header slightly differently.
      const keyByOwnKey = new Map(cols.map((c) => [c.key, c.key]));
      const keyByListKey = new Map(cols.filter((c) => c.listKey).map((c) => [c.listKey as string, c.key]));
      const keyByNormLabel = new Map(cols.map((c) => [normLabel(c.label), c.key]));
      const reportKeyFor = (sel: { key: string; label: string }) =>
        keyByLabel.get(sel.label) ??
        keyByOwnKey.get(sel.key) ??
        keyByListKey.get(sel.key) ??
        keyByNormLabel.get(normLabel(sel.label));
      let out = rows;
      for (const sel of activeSelections) {
        const k = reportKeyFor(sel);
        if (k) out = out.filter((r) => sel.allowed.has(String(r[k] ?? "")));
      }
      if (yearActive) {
        const yk = keyByLabel.get("Reporting Year") ?? keyByLabel.get("Year");
        const dks = dateLabels
          .map((l) => keyByLabel.get(l))
          .filter((k): k is string => Boolean(k));
        out = out.filter((r) => {
          const yearRaw = yk ? String(r[yk] ?? "") : "";
          const dateVals = dks.map((k) => String(r[k] ?? "")).filter(Boolean);
          // Rows with no year at all (roster leaves) aren't year-filterable.
          if (yearRaw === "" && dateVals.length === 0) return true;
          if (inSelectedYears(yearRaw, reportingYears)) return true;
          return dateVals.some((v) => inSelectedYears(v, reportingYears));
        });
      }
      if (hasActiveDates) {
        const dateKeys = dateLabels
          .map((l) => keyByLabel.get(l))
          .filter((k): k is string => Boolean(k));
        if (dateKeys.length > 0) {
          out = out.filter((r) =>
            dateKeys.some((k) => {
              const v = String(r[k] ?? "").slice(0, 10);
              if (!v) return false;
              if (fromDate && v < fromDate) return false;
              if (toDate && v > toDate) return false;
              return true;
            }),
          );
        }
      }
      if (q && opts.search !== false) {
        out = out.filter((r) =>
          cols.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q)),
        );
      }
      return out;
    };

    /**
     * Real bug fix, 2026-09-14: a `blocks` table used to be left completely
     * untouched by every active filter - correct for a genuine rollup
     * (FLD/OFT Summary, a per-sector or per-state total that doesn't map to
     * any one record), but most `blocks` tables in this app are really just
     * a flat per-record grid wrapped in one block per KVK (Staff Quarters,
     * NICRA Others' own leaves, ARYA, Natural Farming, ...) - filtering the
     * list and downloading always showed every KVK's rows regardless (client
     * report, 2026-09-14: "select single, sab data aa gaya", reproduced
     * across Training/Extension Activities/Publications/HRD/Staff Quarters/
     * several Projects leaves). Recursing into each block's own grid parts
     * and filtering their rows by their own columns fixes every one of
     * these at once, without needing to know in advance which blocks table
     * is a real rollup (an aggregate row's own column values just won't
     * match a per-record filter selection, so it stays as-is either way).
     */
    const scopeBlocks = (blocks: ReportBlock[]): ReportBlock[] =>
      blocks.map((block) => ({
        ...block,
        parts: block.parts.map((part) => {
          if (part.kind !== "grid" || !part.columns?.length || part.rows.length === 0) return part;
          // Search stays out of this recursion - a genuine rollup block
          // (OFT's own zone-wide Discipline/Thematic-Area matrix) has no
          // per-record text to match a free-text search against, so
          // applying it here would wipe a real summary block to empty
          // instead of leaving it whole. Column-value/year/date filters are
          // safe (a column that doesn't exist on this block is just
          // skipped, never used to wrongly empty it), so those still apply.
          const rows = filterRowsByColumns(part.columns, part.rows, { search: false });
          if (rows === part.rows) return part;
          return { ...part, rows, totalRow: undefined };
        }),
      }));

    const scopeTable = (table: ReportTable): ReportTable => {
      // Pair tables (a numbered label/value list, not a grid) can't be
      // row-filtered at all - left alone, same as always.
      if (table.pairs?.length) return table;
      if (table.blocks?.length) {
        const blocks = scopeBlocks(table.blocks);
        if (blocks === table.blocks) return table;
        return { ...table, blocks };
      }
      if (table.rows.length === 0) return table;
      const rows = filterRowsByColumns(table.columns, table.rows);
      if (rows === table.rows) return table;
      return { ...table, rows, totalRow: undefined };
    };

    return sections.map((section) => ({
      ...section,
      subsections: section.subsections.map((sub) => ({
        ...sub,
        tables: sub.tables.map(scopeTable),
      })),
    }));
  }

  /**
   * The big-report subsection subtree for a mapped Form Management leaf,
   * rendered exactly like the Super Admin report (headings, grouped tables,
   * clickable contents) via the shared report renderers.
   */
  async function downloadReportSubtree(format: "pdf" | "excel" | "word") {
    if (!reportRef || !recordPath) return;
    setReportExport(format);
    try {
      /**
       * A per-column filter that narrows a KVK-name column down to a single
       * KVK is pushed to the server so grouped/aggregated tables rebuild at
       * that scope (the same path the Reports page's KVK dropdown uses).
       */
      const kvkFilterCol = columns.find(
        (c) =>
          (c.key === "kvk" || c.key === "kvkName" || /kvk.*name/i.test(c.label)) &&
          columnFilters[c.key]?.selected != null,
      );
      const kvkSelected = kvkFilterCol
        ? Array.from(columnFilters[kvkFilterCol.key].selected as Set<string>)
        : [];
      const query = new URLSearchParams({ subsection: recordPath });
      if (kvkSelected.length === 1) query.set("kvk", kvkSelected[0]);
      /**
       * The list's reporting-period control (the "Reporting Year" checkbox
       * multi-select, or the From/To date range) is pushed to the server so
       * the report is built for that period only. Years win over from/to
       * (same rule as the Reports screen).
       */
      if (reportingYears.size > 0) {
        query.set("years", Array.from(reportingYears).join(","));
      } else if (hasActiveDates) {
        if (fromDate) query.set("from", fromDate);
        if (toDate) query.set("to", toDate);
      }
      /**
       * The search box + every active per-column value checklist, so the few
       * `blocks`-shaped builders that read `scope.listFilter` (see
       * lib/report-types.ts's `applyListFilter`) can narrow their own raw
       * records before grouping - the generic scopeReportSectionsToFilters
       * below can only narrow a plain grid, never a `blocks` table (real bug,
       * 2026-09-14: a filtered Training/Extension Activities/Poshan Maaha/
       * Publications/HRD/Production & Supply/Staff Quarters/OFT download
       * showed every record regardless). Harmless to always send: a builder
       * that never reads `listFilter` just ignores it.
       */
      if (search.trim()) query.set("search", search.trim());
      const activeColumnValues = Object.fromEntries(
        Object.entries(columnFilters)
          .filter(([, s]) => s.selected !== null)
          .map(([key, s]) => [key, Array.from(s.selected as Set<string>)]),
      );
      if (Object.keys(activeColumnValues).length > 0) {
        query.set("colf", JSON.stringify(activeColumnValues));
      }

      const res = await fetch(`/api/reports/generate?${query.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not build the report.");
      if (data.matched === false || !data.sections?.length) {
        await downloadFlat(format);
        return;
      }
      const sections = scopeReportSectionsToFilters(data.sections as ReportSection[]);
      const kvkNames: string[] =
        kvkSelected.length > 0 ? kvkSelected : ((data.kvkNames ?? []) as string[]);
      const stamp = new Date().toISOString().slice(0, 10);
      const fileBase = `${reportRef.label.replace(/[^\w]+/g, "-")}-Report-${stamp}`;
      const { prefetchReportImages } = await import("@/lib/report-images");
      const common = {
        title: `${reportRef.label} - ATARI AMS Report`,
        zoneLabel: data.zoneLabel as string,
        reportingYearLabel:
          (data.periodLabel as string) ||
          (reportingYears.size > 0 ? Array.from(reportingYears).sort().join(", ") : "All Data"),
        kvkNames,
        sections,
        images: await prefetchReportImages(sections),
      };
      if (format === "pdf") {
        const { generateReportPdf } = await import("@/lib/report-pdf");
        generateReportPdf(common).save(`${fileBase}.pdf`);
      } else if (format === "excel") {
        const { generateReportExcel } = await import("@/lib/report-excel");
        const wb = await generateReportExcel(common);
        const buffer = await wb.xlsx.writeBuffer();
        downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileBase}.xlsx`);
      } else {
        const { generateReportWord } = await import("@/lib/report-word");
        downloadBlob(await generateReportWord(common), `${fileBase}.docx`);
      }
    } catch {
      // Best-effort, same as the flat export handlers - buttons re-enable so the user can retry.
    } finally {
      setReportExport(null);
    }
  }

  /**
   * 10 rows per page, matching the reference's own "Showing 1-10 of N"
   * footer - resets to page 1 whenever the *filter criteria themselves*
   * change (typing a search, picking a column filter, a date range), not
   * whenever `filteredRows` merely gets a new array identity. AutoRefresh
   * (components/layout/auto-refresh.tsx) re-fetches `rows` from the server
   * every ~20s, which built a brand-new `filteredRows` array on every tick
   * regardless of whether anything actually changed - comparing that array
   * by reference was a real bug: search to page 300, wait 20s, and the
   * table silently snapped back to page 1 out from under the user. `page`
   * still gets clamped separately below if the real row count shrinks.
   * Reset happens during render (React's documented pattern for "adjusting
   * state when a prop changes") rather than in a useEffect, which would
   * cause an extra render pass.
   */
  const filterSignature = useMemo(
    () =>
      JSON.stringify({
        search: search.trim().toLowerCase(),
        columnFilters: Object.fromEntries(
          Object.entries(columnFilters).map(([key, state]) => [
            key,
            { selected: state.selected ? Array.from(state.selected).sort() : null, sort: state.sort },
          ]),
        ),
        reportingYears: Array.from(reportingYears).sort(),
        hasActiveDates,
        fromDate,
        toDate,
      }),
    [search, columnFilters, reportingYears, hasActiveDates, fromDate, toDate],
  );
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [prevFilterSignature, setPrevFilterSignature] = useState(filterSignature);
  if (filterSignature !== prevFilterSignature) {
    setPrevFilterSignature(filterSignature);
    setPage(1);
  }
  const filteredCount = filteredRows?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  const displayedRows = useMemo(() => {
    if (!filteredRows) return filteredRows;
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  const rowCount = displayedRows?.length ?? 0;
  /**
   * "Showing 1-10 of N" - N is the grand total when nothing is filtered
   * (so `totalCount` can still cover a server-truncated first page), but the
   * *filtered* count the moment any search / column filter / date range
   * narrows the list, so it never reads "1-9 of 628" while showing 9 rows.
   */
  const isNarrowed = filteredCount !== (rows?.length ?? 0);
  const total = isNarrowed ? filteredCount : totalCount ?? filteredCount;
  const rangeStart = filteredCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = filteredCount === 0 ? 0 : rangeStart + rowCount - 1;

  return (
    <div>
      {tabs && tabs.length > 1 ? (
        <div className="mb-4 inline-flex max-w-full flex-nowrap gap-1 overflow-x-auto rounded-lg bg-primary p-1">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                tab.active
                  ? "bg-white text-primary"
                  : "text-primary-foreground/85 hover:text-primary-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <div className="flex items-center gap-2">
              {Icon && <Icon className="size-4.5 shrink-0 text-primary" />}
              <h1 className="text-lg font-semibold text-primary">{title}</h1>
            </div>
            {subtitle && (
              <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="lg"
              disabled={reportExport !== null}
              onClick={async () => {
                // Lazy-loaded: jsPDF + autotable are large and only needed by
                // the handful of visits that actually click this button -
                // bundling them at module scope would ship their weight to
                // every single Masters/Form Management page load. Exports
                // every filtered row, not just the current on-screen page
                // (`displayedRows` is a pagination slice of `filteredRows` -
                // exporting that silently dropped every row past page 1).
                // For a mapped Form Management leaf it instead produces that
                // part's whole big-report subsection (report-section-map.ts).
                if (reportRef) return downloadReportSubtree("pdf");
                await downloadFlat("pdf");
              }}
            >
              <FileDown className="size-3.5" />
              {reportExport === "pdf" ? "Preparing..." : "PDF"}
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={reportExport !== null}
              onClick={async () => {
                if (reportRef) return downloadReportSubtree("excel");
                await downloadFlat("excel");
              }}
            >
              <FileSpreadsheet className="size-3.5" />
              {reportExport === "excel" ? "Preparing..." : "Excel"}
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={reportExport !== null}
              onClick={async () => {
                if (reportRef) return downloadReportSubtree("word");
                await downloadFlat("word");
              }}
            >
              <FileType className="size-3.5" />
              {reportExport === "word" ? "Preparing..." : "Word"}
            </Button>
            {hideAddNew ? null : addNewHref ? (
              <Link
                href={addNewHref}
                className={cn(buttonVariants({ size: "lg" }))}
              >
                <Plus className="size-3.5" />
                Add New
              </Link>
            ) : (
              <Button size="lg" onClick={openAdd}>
                <Plus className="size-3.5" />
                Add New
              </Button>
            )}
          </div>
        </div>

        <div className="relative z-10 flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-border bg-card px-4 py-5">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search..."
              className="h-9 w-56 pl-8"
            />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">
              Reporting Year
            </Label>
            <MultiFilterSelect
              label="Reporting Year"
              hideLabel
              options={reportingYearOptions}
              selected={reportingYears}
              onChange={setReportingYears}
              triggerClassName="h-9 w-32"
            />
          </div>
          <div className="relative">
            <Input
              id={fromDateId}
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              aria-label="From date"
              className={cn(
                "h-9 w-40",
                fromDate ? "text-muted-foreground" : "text-transparent",
              )}
            />
            {!fromDate && (
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
                From date
              </span>
            )}
          </div>
          <div className="relative">
            <Input
              id={toDateId}
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => setToDate(event.target.value)}
              aria-label="To date"
              className={cn(
                "h-9 w-40",
                toDate ? "text-muted-foreground" : "text-transparent",
              )}
            />
            {!toDate && (
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
                To date
              </span>
            )}
          </div>
          <Button
            variant="default"
            size="lg"
            onClick={resetDates}
            disabled={!hasActiveDates}
          >
            <RotateCcw className="size-3.5" />
            Reset dates
          </Button>
          <Button
            variant="outline-primary"
            size="lg"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
          >
            <Filter className="size-3.5" />
            Reset filters
          </Button>
        </div>

        {note && (
          <p className="flex items-center gap-2 border-b border-[#eaa624]/40 bg-[#eaa624]/15 px-4 py-2.5 text-xs font-semibold text-[#8a5a00]">
            <AlertTriangle className="size-4 shrink-0" />
            {note}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="divide-x divide-border border-b border-border bg-muted/50 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase">
                <th className="px-4 py-3">S.No</th>
                {orderedColumns.map((column) => (
                  <th
                    key={column.key}
                    className={cn(
                      "px-4 py-3",
                      dragOverColumnKey === column.key && "bg-primary/10",
                    )}
                    draggable
                    onDragStart={() => {
                      draggedColumnKey.current = column.key;
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverColumnKey(column.key);
                    }}
                    onDragLeave={() =>
                      setDragOverColumnKey((prev) => (prev === column.key ? null : prev))
                    }
                    onDrop={(event) => {
                      event.preventDefault();
                      moveColumn(column.key);
                      draggedColumnKey.current = null;
                      setDragOverColumnKey(null);
                    }}
                    onDragEnd={() => {
                      draggedColumnKey.current = null;
                      setDragOverColumnKey(null);
                    }}
                  >
                    <span className="flex w-full cursor-move items-center justify-between gap-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <GripVertical className="size-3 shrink-0 text-muted-foreground/50" />
                        {column.label}
                      </span>
                      <ColumnFilterMenu
                        columnLabel={column.label}
                        values={columnValues(column.key)}
                        state={
                          columnFilters[column.key] ?? {
                            selected: null,
                            sort: null,
                          }
                        }
                        onApply={(state) =>
                          setColumnFilters((prev) => ({
                            ...prev,
                            [column.key]: state,
                          }))
                        }
                      />
                    </span>
                  </th>
                ))}
                {showActionColumn && (
                  <th className="sticky right-0 z-10 border-l border-border bg-muted px-4 py-3 text-left">
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rowCount === 0 ? (
                <tr>
                  <td
                    colSpan={tableColumns.length + (showActionColumn ? 2 : 1)}
                    className="px-4 py-16 text-center text-muted-foreground"
                  >
                    No records found.
                  </td>
                </tr>
              ) : (
                displayedRows!.map((row, index) => (
                  <tr
                    key={index}
                    className="divide-x divide-border border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3.5 align-top text-muted-foreground">
                      {(currentPage - 1) * PAGE_SIZE + index + 1}
                    </td>
                    {orderedColumns.map((column) => {
                      const value = row[column.key];
                      if (
                        (oftFldStatus || isCfldTechnicalParameter) &&
                        column.key === "status"
                      ) {
                        const label = typeof value === "string" ? value : "";
                        return (
                          <td key={column.key} className="px-4 py-3.5 align-top">
                            <span
                              className={cn(
                                "inline-block rounded-md border px-2 py-0.5 text-xs font-semibold",
                                STATUS_BADGE_STYLES[label] ??
                                  "border-border text-muted-foreground",
                              )}
                            >
                              {label}
                            </span>
                          </td>
                        );
                      }
                      if (column.fileKind) {
                        const url = typeof value === "string" ? value : "";
                        return (
                          <td key={column.key} className="px-4 py-3.5 align-top">
                            {url ? (
                              column.fileKind === "image" ? (
                                <a
                                  href={`/api/files/view?url=${encodeURIComponent(url)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block"
                                >
                                  {/* unoptimized: Next's image optimizer fetches this URL server-side and won't forward the browser's session cookie, but /api/files/view requires one - a plain browser-side request (which does carry it) is required here. */}
                                  <Image
                                    src={`/api/files/view?url=${encodeURIComponent(url)}`}
                                    alt={column.label}
                                    width={36}
                                    height={36}
                                    unoptimized
                                    className="size-9 rounded-md border border-border object-cover"
                                  />
                                </a>
                              ) : (
                                <a
                                  href={`/api/files/view?url=${encodeURIComponent(url)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  <FileText className="size-3.5" />
                                  View
                                </a>
                              )
                            ) : (
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <ImageIcon className="size-3.5" />-
                              </span>
                            )}
                          </td>
                        );
                      }
                      // Every text cell stays on one line, full stop (client direction,
                      // 2026-09-03: started as a KVK Name/Staff Name-only fix, but any
                      // 2-3 line wrap - Agenda, Date, Representative from ATARI, whatever
                      // column - reads as broken, not a deliberate compact layout). No
                      // per-column heuristic needed any more: the table already scrolls
                      // horizontally (see its wrapping container), so a wide value just
                      // widens its own column instead of wrapping - that's the tradeoff
                      // this direction explicitly accepts over multi-line wrapping.
                      return (
                        <td
                          key={column.key}
                          className="px-4 py-3.5 align-top text-foreground"
                        >
                          {typeof value === "string" ? (
                            <span className="whitespace-nowrap" title={value}>
                              {value}
                            </span>
                          ) : (
                            value
                          )}
                        </td>
                      );
                    })}
                    {showActionColumn && (
                    <td className="sticky right-0 z-10 border-l border-border bg-card px-4 py-3.5 text-left align-top">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon-sm">
                                <MoreVertical className="size-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent
                            align="end"
                            className="w-max min-w-40 whitespace-nowrap"
                          >
                            <DropdownMenuItem
                              onClick={() => {
                                // A carried-forward row has no DB record yet -
                                // "Edit" opens the Add form pre-filled with last
                                // year's values for the current year; saving it
                                // creates the real record.
                                if (
                                  row._carriedForward === "1" &&
                                  addNewHref &&
                                  typeof row._prefill === "string"
                                ) {
                                  router.push(
                                    `${addNewHref}?prefill=${encodeURIComponent(row._prefill)}`,
                                  );
                                  return;
                                }
                                const id = row.id;
                                if (editHrefBase && !customForm && typeof id === "string") {
                                  const payload = JSON.stringify(row);
                                  sessionStorage.setItem(`edit-record:${id}`, payload);
                                  // Also mirrored to localStorage (real audit
                                  // finding, 2026-09-11: opening this same Edit
                                  // link in a new tab - e.g. middle-click / "Open
                                  // in new tab" - has no sessionStorage of its
                                  // own, since that store is per-tab, and showed
                                  // "could not be loaded"). localStorage is
                                  // shared across every tab of this browser, so
                                  // a new tab opened from the same click can
                                  // still read it; EditLeafPage tries
                                  // sessionStorage first and only falls back to
                                  // this copy. A bookmark or shared link from a
                                  // separate browsing session still correctly
                                  // shows "could not be loaded" - there's no
                                  // record data to fall back to in that case.
                                  try {
                                    localStorage.setItem(`edit-record:${id}`, payload);
                                  } catch {
                                    // Private-browsing / storage-blocked - sessionStorage above still covers the normal click-to-edit path.
                                  }
                                  router.push(`${editHrefBase}/edit/${id}`);
                                  return;
                                }
                                openEdit(row);
                              }}
                            >
                              <Pencil className="size-3.5" />
                              Edit
                            </DropdownMenuItem>
                            {staffTransfer && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setStaffTransferRow(row);
                                  setStaffTransferKvk("");
                                  setStaffTransferDate("");
                                  setStaffTransferError(null);
                                }}
                              >
                                <ArrowRightCircle className="size-3.5" />
                                Transfer
                              </DropdownMenuItem>
                            )}
                            {staffTransferHistory && (
                              <DropdownMenuItem onClick={() => openTransferHistory(row)}>
                                <History className="size-3.5" />
                                View Transfer History
                              </DropdownMenuItem>
                            )}
                            {oftFldStatus && (
                              <>
                                {/* Real reference order confirmed 2026-09-01 (On Farm Trials): Edit, Edit Result, Mark Completed, Transfer, Delete - "Add Result" renamed to "Edit Result" and colored purple to match; Mark Completed is a new direct action (OFT only - real "Ongoing"->"Completed" flip, no form). Both OFT's Edit Result and FLD's Add Result now jump to the real page (OftResultFields / FldResultFields, via ?tab=result - same query-param convention CFLD's own tab jumps use), not a dialog (client direction, 2026-09-02: keep FLD consistent with OFT's own full-page pattern instead of the standalone reference recording's popup). Shown to Super Admin too (client correction, 2026-09-01 annotated screenshot: "Action of this page will be changed" - supersedes the earlier "Super Admin gets a restricted Edit/Delete-only Action column" reading). */}
                                <DropdownMenuItem
                                  className="text-[#7c3aed] focus:text-[#7c3aed]"
                                  onClick={() =>
                                    typeof row.id === "string" &&
                                    editHrefBase &&
                                    router.push(`${editHrefBase}/edit/${row.id}?tab=result`)
                                  }
                                >
                                  <ClipboardCheck className="size-3.5" />
                                  {resultKind === "fld" ? "Add Result" : "Edit Result"}
                                </DropdownMenuItem>
                                {resultKind !== "fld" && row.status === "Ongoing" && (
                                  <DropdownMenuItem
                                    onClick={() => setMarkCompletedRow(row)}
                                  >
                                    <CheckCircle2 className="size-3.5" />
                                    Mark Completed
                                  </DropdownMenuItem>
                                )}
                                {row.status === "Ongoing" && (
                                  <DropdownMenuItem
                                    onClick={() => setTransferRow(row)}
                                  >
                                    <ArrowRightCircle className="size-3.5" />
                                    Transfer
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                            {isCfldTechnicalParameter && (
                              <>
                                {/* Real reference order confirmed 2026-09-01: Edit, Economic Parameters, Update Socio Economic Parameters, Farmers Perception Parameters, Transfer, Delete (Delete trailing, not 2nd - supersedes the earlier "Edit, Transfer, Delete, ..." reading). The three parameter items and Transfer render in the primary green, matching the reference; only Delete stays destructive red. Each jumps straight to its own tab on the same dedicated Edit page (?tab=...), same shortcut the old dialog's initialTab gave, now via a query param since Edit is a real page (2026-09-01). */}
                                <DropdownMenuItem
                                  className="text-primary focus:text-primary"
                                  onClick={() =>
                                    typeof row.id === "string" &&
                                    editHrefBase &&
                                    router.push(`${editHrefBase}/edit/${row.id}?tab=economic`)
                                  }
                                >
                                  <ClipboardCheck className="size-3.5" />
                                  Economic Parameters
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-primary focus:text-primary"
                                  onClick={() =>
                                    typeof row.id === "string" &&
                                    editHrefBase &&
                                    router.push(`${editHrefBase}/edit/${row.id}?tab=socio-economic`)
                                  }
                                >
                                  <ClipboardCheck className="size-3.5" />
                                  Update Socio Economic Parameters
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-primary focus:text-primary"
                                  onClick={() =>
                                    typeof row.id === "string" &&
                                    editHrefBase &&
                                    router.push(`${editHrefBase}/edit/${row.id}?tab=perception`)
                                  }
                                >
                                  <ClipboardCheck className="size-3.5" />
                                  Farmers Perception Parameters
                                </DropdownMenuItem>
                                {/* Not green, unlike the 3 parameter items above - the reference (screenshot, 2026-09-01) renders Transfer in the same plain/default tone as Edit, not the vivid green of Economic/Socio Economic/Farmers Perception Parameters. Always shown regardless of status (client direction, 2026-09-01) - CFLD Technical Parameter's Transfer is not restricted to Ongoing-only the way OFT/FLD's own Transfer still is above. */}
                                <DropdownMenuItem
                                  onClick={() => setTransferRow(row)}
                                >
                                  <ArrowRightCircle className="size-3.5" />
                                  Transfer
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setDeleteRow(row)}
                                >
                                  <Trash2 className="size-3.5" />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            )}
                            {!isCfldTechnicalParameter && row._carriedForward !== "1" && (
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeleteRow(row)}
                              >
                                <Trash2 className="size-3.5" />
                                Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                    </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
          <span>
            {rowCount === 0
              ? "Showing 0-0 of 0"
              : `Showing ${rangeStart}-${rangeEnd} of ${total}`}
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

      {/* Add / Edit */}
      {customForm === "event-demographic" ? (
        <EventDemographicDialog
          title={title}
          slug={eventSlug}
          open={formOpen}
          onOpenChange={setFormOpen}
          editingRow={editingRow}
        />
      ) : (
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingRow ? `Edit ${title}` : `Add ${title}`}
              </DialogTitle>
            </DialogHeader>

            <div className="max-h-[60vh] space-y-4 overflow-y-auto">
              <MasterFormFields
                columns={editColumns}
                cascadeType={cascadeType}
                formValues={formValues}
                onChange={setFormValues}
                isSimpleMaster={isSimpleMaster}
                markAsOther={markAsOther}
                onMarkAsOtherChange={setMarkAsOther}
                enableOtherOption={recordKind === "form"}
              />
            </div>

            {formError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setFormOpen(false)}
                disabled={formSubmitting}
              >
                Cancel
              </Button>
              <Button onClick={submitForm} disabled={formSubmitting}>
                {formSubmitting ? "Saving…" : editingRow ? "Save Changes" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirm */}
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
            <AlertDialogTitle>Delete “{deleteRowLabel}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the record. This cannot be undone.
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

      {/* Staff transfer - Employee Details. KVK + Date of Relieving, then the hop shows under the destination KVK only. */}
      {staffTransfer && (
        <Dialog
          open={staffTransferRow !== null}
          onOpenChange={(open) => {
            if (!open) {
              setStaffTransferRow(null);
              setStaffTransferError(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Transfer Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="staff-transfer-kvk">KVK</Label>
                <SimpleSelect
                  id="staff-transfer-kvk"
                  value={staffTransferKvk}
                  onValueChange={setStaffTransferKvk}
                  placeholder="Select"
                  options={kvkOptions.map((k) => ({ value: k, label: k }))}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-transfer-date">Date of Relieving</Label>
                <Input
                  id="staff-transfer-date"
                  type="date"
                  value={staffTransferDate}
                  onChange={(e) => setStaffTransferDate(e.target.value)}
                  className="h-10"
                />
              </div>
              {staffTransferError && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {staffTransferError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={submitStaffTransfer} disabled={staffTransferSubmitting}>
                {staffTransferSubmitting ? "Submitting…" : "Submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Transfer to next reporting year - OFT/FLD and CFLD Technical Parameter, manual per client spec (never automatic). */}
      {(oftFldStatus || isCfldTechnicalParameter) && (
        <AlertDialog
          open={transferRow !== null}
          onOpenChange={(open) => {
            if (!open) {
              setTransferRow(null);
              setTransferError(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Transfer to next reporting year?</AlertDialogTitle>
              <AlertDialogDescription>
                This record stays visible in its original reporting year,
                marked &ldquo;Transferred to Next Year&rdquo;. A copy opens
                under next year&rsquo;s reporting year with status
                &ldquo;Ongoing&rdquo;.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {transferError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {transferError}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={transferring}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  confirmTransfer();
                }}
                disabled={transferring}
              >
                {transferring ? "Transferring…" : "Transfer"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Mark Completed - OFT only (real reference action, 2026-09-01). */}
      {oftFldStatus && resultKind !== "fld" && (
        <AlertDialog
          open={markCompletedRow !== null}
          onOpenChange={(open) => {
            if (!open) {
              setMarkCompletedRow(null);
              setMarkCompletedError(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark this trial as Completed?</AlertDialogTitle>
              <AlertDialogDescription>
                This sets the record&rsquo;s status to &ldquo;Completed&rdquo;.
                It stops appearing as Ongoing and can no longer be transferred.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {markCompletedError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {markCompletedError}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={markCompleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  confirmMarkCompleted();
                }}
                disabled={markCompleting}
              >
                {markCompleting ? "Saving…" : "Mark Completed"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* View Transfer History - Staff Transferred only. */}
      {staffTransferHistory && (
        <Dialog
          open={historyStaffName !== null}
          onOpenChange={(open) => !open && setHistoryStaffName(null)}
        >
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Transfer History{historyStaffName ? ` - ${historyStaffName}` : ""}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto">
              {historyEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transfer history found.</p>
              ) : (
                historyEntries.map((entry, index) => (
                  <div key={index} className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        Transfer
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Transfer Date: {entry.date}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">From KVK</p>
                        <p className="text-sm font-medium text-foreground">{entry.fromKvk}</p>
                      </div>
                      <span className="text-muted-foreground">&rarr;</span>
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">To KVK</p>
                        <p className="text-sm font-medium text-foreground">{entry.toKvk}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground">Transferred By</p>
                      <p className="text-sm font-medium text-foreground">{entry.transferredBy}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setHistoryStaffName(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
