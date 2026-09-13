"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  LayoutGrid,
  Table2,
  ListChecks,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Circle,
  ArrowUpDown,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MultiFilterSelect } from "@/components/dashboard/multi-filter-select";
import { useSession } from "@/lib/session";
import { usePolling } from "@/lib/use-polling";

type LeafSummary = { path: string; label: string; count: number };
type SectionSummary = { sectionLabel: string; leaves: LeafSummary[] };
type KvkSummary = {
  id: string;
  name: string;
  filled: number;
  total: number;
  percent: number;
  sections: SectionSummary[];
};
type FormSummaryData = {
  kvks: { id: string; name: string }[];
  totalKvks: number;
  formsTracked: number;
  totalFilled: number;
  totalPossible: number;
  overallProgressPercent: number;
  byKvk: KvkSummary[];
  years: number[];
};

/**
 * Fixed descending year range for the "Reporting year" filter - the current
 * year down to 2021. Built on the client so the dropdown is populated
 * instantly (no extra round-trip just to know which years to list). No
 * next-year entry: Form Summary only ever reports on data already entered,
 * so a future year would just show every count as zero (client report,
 * 2026-09-04: 2027 was listed but had no data).
 */
function reportingYearOptions(): string[] {
  const current = new Date().getFullYear();
  const list: string[] = [];
  for (let y = current; y >= 2021; y -= 1) list.push(String(y));
  return list;
}

type ViewMode = "kvk" | "matrix";
type SortDir = "desc" | "asc";

/**
 * One category (e.g. "About KVK", "Achievements") within a KVK's expanded
 * form list, collapsible on its own instead of only as part of one big
 * all-or-nothing block (client report, 2026-09-13: "Category/Form sections
 * should be collapsible individually... instead of closing the entire
 * section together"). Starts open so nothing that was already visible
 * disappears on first load - this only adds the ability to close a section,
 * it doesn't default anything closed.
 */
function CollapsibleSection({ label, leaves }: { label: string; leaves: LeafSummary[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mb-3 flex w-full items-center gap-1.5 text-left"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {leaves.map((leaf) => (
            <LeafCard key={leaf.path} leaf={leaf} />
          ))}
        </div>
      )}
    </div>
  );
}

function LeafCard({ leaf }: { leaf: LeafSummary }) {
  return (
    <Link
      href={`/forms/${leaf.path}`}
      className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-4 py-3 text-sm hover:border-primary/50"
    >
      <span className="truncate font-medium text-foreground">{leaf.label}</span>
      {leaf.count > 0 ? (
        <span className="flex shrink-0 items-center gap-1 text-primary">
          <CheckCircle2 className="size-4" />
          {leaf.count} {leaf.count === 1 ? "entry" : "entries"}
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
          <Circle className="size-4" />
          Not started
        </span>
      )}
    </Link>
  );
}

export default function FormSummaryPage() {
  const session = useSession();
  const isKvk = session.role !== "super-admin";
  const [view, setView] = useState<ViewMode>("kvk");
  const [data, setData] = useState<FormSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /**
   * Reporting-year scope for every count on this page - a checkbox
   * multi-select (client request, 2026-09-06). An empty set is the
   * "All Years" (all-time) view, which stays the default so the headline
   * numbers don't shift on load; selecting several years unions their
   * counts.
   */
  const [years, setYears] = useState<Set<string>>(new Set());

  const matrixScrollRef = useRef<HTMLDivElement>(null);

  const loadSummary = useCallback(() => {
    let cancelled = false;
    const query = years.size > 0 ? `?year=${Array.from(years).join(",")}` : "";
    fetch(`/api/form-summary${query}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: FormSummaryData | null) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [years]);

  useEffect(loadSummary, [loadSummary]);
  usePolling(loadSummary);

  const filteredSorted = useMemo(() => {
    if (!data) return [];
    const filtered = data.byKvk.filter((k) => k.name.toLowerCase().includes(search.toLowerCase()));
    return filtered.sort((a, b) => (sortDir === "desc" ? b.percent - a.percent : a.percent - b.percent));
  }, [data, search, sortDir]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const ownKvk = isKvk ? data?.byKvk[0] : undefined;

  /**
   * A KVK Admin's own single row used to render always-expanded, with no
   * "By KVK"/"Matrix" toggle at all - so once the same toggle is shared with
   * Super Admin below (client report, 2026-09-13: "waise hi kvk ko bhi show
   * kro"), auto-expand it the first time data loads rather than making a KVK
   * Admin click their own row to see anything, which would be a regression
   * from what was always visible before.
   */
  const autoExpandedRef = useRef(false);
  useEffect(() => {
    if (!autoExpandedRef.current && isKvk && ownKvk) {
      autoExpandedRef.current = true;
      setExpanded(new Set([ownKvk.id]));
    }
  }, [isKvk, ownKvk]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ListChecks className="size-5 shrink-0 text-primary" />
            <h1 className="text-3xl font-semibold text-primary">
              {isKvk
                ? `Form Summary - ${session.kvkName ?? "My KVK"}`
                : "Form Summary - All KVKs"}
            </h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {isKvk
              ? "Track which forms your KVK has submitted"
              : "Track which KVKs have submitted each form"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Reporting year
          </span>
          <MultiFilterSelect
            label="Reporting year"
            hideLabel
            options={reportingYearOptions()}
            selected={years}
            onChange={setYears}
            triggerClassName="min-w-32"
          />
        </div>
      </div>

      {loading || !data ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Loading summary...
        </div>
      ) : (
        <>
          {isKvk ? (
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Forms Tracked</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{data.formsTracked}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Entries Filled</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                    {ownKvk?.filled ?? 0} / {data.formsTracked}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Overall Progress</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-primary">{ownKvk?.percent ?? 0}%</p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${ownKvk?.percent ?? 0}%` }} />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">KVKs</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{data.totalKvks}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Forms Tracked</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{data.formsTracked}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Entries Filled</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                    {data.totalFilled} / {data.totalPossible}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Overall Progress</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-primary">{data.overallProgressPercent}%</p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${data.overallProgressPercent}%` }} />
              </div>
            </div>
          )}

          {/*
            By KVK / Matrix toggle - now shared with every role (client
            report, 2026-09-13: "jaise super admin mai hai waise hi kvk ko
            bhi show kro"), not just Super Admin. A KVK Admin's own
            `filteredSorted` is always just their one row, so both views
            degrade to a single column/row instead of needing their own code
            path. The Progress-sort button and KVK search only make sense
            with more than one row, so they stay Super-Admin-only.
          */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-md border border-border bg-muted/50 p-0.5">
              <button
                type="button"
                onClick={() => setView("kvk")}
                className={cn(
                  "flex items-center gap-1.5 rounded-[calc(var(--radius-md)-2px)] px-3 py-1.5 text-sm font-medium transition-colors",
                  view === "kvk" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="size-3.5" />
                By KVK
              </button>
              <button
                type="button"
                onClick={() => setView("matrix")}
                className={cn(
                  "flex items-center gap-1.5 rounded-[calc(var(--radius-md)-2px)] px-3 py-1.5 text-sm font-medium transition-colors",
                  view === "matrix" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Table2 className="size-3.5" />
                Matrix
              </button>
            </div>
            {!isKvk && (
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                >
                  <ArrowUpDown className="size-3.5" />
                  Progress
                </Button>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter KVKs..."
                    className="w-64 pl-8"
                  />
                </div>
              </div>
            )}
          </div>

          {view === "kvk" ? (
            <div className="mt-4 overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <th className="px-4 py-3">KVK</th>
                    <th className="px-4 py-3">Filled</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-16 text-center text-muted-foreground">
                        No KVKs match this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredSorted.map((kvk) => {
                      const isOpen = expanded.has(kvk.id);
                      return (
                        <Fragment key={kvk.id}>
                          <tr
                            onClick={() => toggleExpanded(kvk.id)}
                            className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                          >
                            <td className="px-4 py-3 font-medium text-foreground">
                              <span className="flex items-center gap-1.5">
                                {isOpen ? (
                                  <ChevronDown className="size-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="size-3.5 text-muted-foreground" />
                                )}
                                {kvk.name}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {kvk.filled}/{kvk.total}
                            </td>
                            <td className="px-4 py-3">
                              <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${kvk.percent}%` }} />
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-primary">{kvk.percent}%</td>
                          </tr>
                          {isOpen && (
                            <tr className="border-b border-border last:border-0">
                              <td colSpan={4} className="bg-muted/20 px-4 py-4">
                                <div className="space-y-4">
                                  {kvk.sections.map((section) => (
                                    <CollapsibleSection
                                      key={section.sectionLabel}
                                      label={section.sectionLabel}
                                      leaves={section.leaves}
                                    />
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              ref={matrixScrollRef}
              className="mt-4 overflow-auto rounded-lg border border-border"
              /**
               * No scroll-snap here (client report, 2026-08-30 - a real gap
               * appeared between the sticky "Form Name" column and whichever
               * KVK column landed next to it after scrolling to the end).
               * This table used to snap each KVK column into place, which
               * needed a `scrollPaddingLeft: 264` hack to keep the very
               * first column from snapping underneath the sticky column.
               * Snapping added a browser "settle" step after every scroll
               * gesture that could re-align the content a frame or two
               * after the sticky column had already redrawn, which is what
               * opened this gap. Dropping snap entirely removes that settle
               * step - the sticky column now always overlays whatever the
               * raw scroll position is, in perfect 1:1 sync, with nothing
               * left to re-align after the fact.
               */
            >
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <th
                      colSpan={2}
                      style={{ width: 264, minWidth: 264, maxWidth: 264, willChange: "transform" }}
                      className="sticky left-0 z-10 bg-muted p-0"
                    >
                      <div className="flex">
                        <div className="w-14 shrink-0 border-r border-border px-4 py-3">#</div>
                        <div className="w-52 shrink-0 px-4 py-3">Form Name</div>
                      </div>
                    </th>
                    {/*
                      The boundary line right after the sticky column lives
                      on THIS (ordinary, non-sticky) cell's left edge, not as
                      a border/shadow on the sticky cell itself - a border on
                      a `position: sticky` cell can paint as a hairline
                      double-stroke on some displays (its static-flow box and
                      its "stuck" compositing layer each contribute an edge),
                      which is exactly the persistent double-line gap
                      reported here (client report, 2026-08-31). A border on
                      an ordinary cell can't split like that.
                    */}
                    {filteredSorted.map((kvk, kvkIndex) => (
                      <th
                        key={kvk.id}
                        className={cn(
                          "min-w-28 border-r border-border bg-muted px-3 py-2 text-center",
                          kvkIndex === 0 && "border-l",
                        )}
                      >
                        <div className="whitespace-nowrap normal-case">{kvk.name}</div>
                        <div className="mt-0.5 font-normal text-muted-foreground/70 normal-case">{kvk.percent}%</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.byKvk[0]?.sections ?? []).flatMap((s) => s.leaves).map((leafRef, index) => (
                    <tr key={leafRef.path} className="border-b border-border last:border-0">
                      <td
                        colSpan={2}
                        style={{ width: 264, minWidth: 264, maxWidth: 264, willChange: "transform" }}
                        className="sticky left-0 z-10 bg-card p-0"
                      >
                        <div className="flex">
                          <div className="w-14 shrink-0 border-r border-border px-4 py-2.5 text-muted-foreground">
                            {index + 1}
                          </div>
                          <div className="w-52 shrink-0 px-4 py-2.5 text-foreground">{leafRef.label}</div>
                        </div>
                      </td>
                      {filteredSorted.map((kvk, kvkIndex) => {
                        const count =
                          kvk.sections.flatMap((s) => s.leaves).find((l) => l.path === leafRef.path)?.count ?? 0;
                        return (
                          <td
                            key={kvk.id}
                            className={cn(
                              "border-r border-border px-3 py-2.5 text-center text-muted-foreground",
                              kvkIndex === 0 && "border-l",
                            )}
                          >
                            {count > 0 ? count : "-"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
