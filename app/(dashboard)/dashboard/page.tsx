"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BarChart3,
  Users,
  FileText,
  GraduationCap,
  Activity,
  Tags,
  LayoutDashboard,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { ProgressChartCard } from "@/components/dashboard/progress-chart-card";
import { StaffSummaryCard } from "@/components/dashboard/staff-summary-card";
import { RecentLogHistoryCard } from "@/components/dashboard/recent-log-history-card";
import { MultiFilterSelect } from "@/components/dashboard/multi-filter-select";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { usePolling } from "@/lib/use-polling";

type ChartRow = { id: string; label: string; ongoing: number; completed: number };
type TotalRow = { id: string; label: string; total: number };

type DashboardStats = {
  totalKvks: number;
  years: number[];
  kvkOptions: { id: string; name: string; state: string | null; district: string | null; institute: string | null }[];
  oft: { total: number; ongoing: number; completed: number; kvksWithEntries: number };
  fld: { total: number; ongoing: number; completed: number; kvksWithEntries: number };
  training: { total: number; kvksWithEntries: number };
  extension: { total: number; kvksWithEntries: number };
  staff: { total: number };
  staffByRole: Record<string, number>;
  charts: { oft: ChartRow[]; fld: ChartRow[]; training: TotalRow[]; extension: TotalRow[] };
};

const EMPTY_STATS: DashboardStats = {
  totalKvks: 0,
  years: [],
  kvkOptions: [],
  oft: { total: 0, ongoing: 0, completed: 0, kvksWithEntries: 0 },
  fld: { total: 0, ongoing: 0, completed: 0, kvksWithEntries: 0 },
  training: { total: 0, kvksWithEntries: 0 },
  extension: { total: 0, kvksWithEntries: 0 },
  staff: { total: 0 },
  staffByRole: {},
  charts: { oft: [], fld: [], training: [], extension: [] },
};

/** Training/Extension have no ongoing/completed status column - fold their single total into `completed` so mode="total" can reuse the same chart component. */
function toTotalChartRows(rows: TotalRow[]): ChartRow[] {
  return rows.map((r) => ({ id: r.id, label: r.label, ongoing: 0, completed: r.total }));
}

type FormSummaryLeaf = { path: string; label: string; count: number };
type FormSummarySection = { sectionLabel: string; leaves: FormSummaryLeaf[] };
type FormSummaryKvk = {
  id: string;
  name: string;
  filled: number;
  total: number;
  percent: number;
  sections: FormSummarySection[];
};

/**
 * A KVK User's whole job is filling in Form Management for their own KVK -
 * unlike Super Admin/KVK Admin, who need cross-KVK oversight stats, a KVK
 * User needs to know one thing: what's still left to fill in. Real per-form
 * fill counts come from /api/form-summary (the same endpoint Form Summary's
 * KVK view uses), scoped server-side to this user's own KVK - the rows here
 * were a hardcoded "Not filled / 0%" placeholder before.
 */
function KvkUserDashboard({ kvkName }: { kvkName?: string }) {
  const [data, setData] = useState<FormSummaryKvk | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/form-summary")
      .then((res) => (res.ok ? res.json() : null))
      .then((d: { byKvk?: FormSummaryKvk[] } | null) => {
        setData(d?.byKvk?.[0] ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);
  usePolling(load);

  const sections = data?.sections ?? [];

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="size-5 shrink-0 text-primary" />
          <h1 className="text-3xl font-semibold text-primary">My Pending Forms</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Track what still needs filling in for {kvkName ?? "your KVK"}
          {data && (
            <>
              {" "}
              &middot;{" "}
              <span className="font-medium text-foreground">
                {data.filled} of {data.total} forms started ({data.percent}%)
              </span>
            </>
          )}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3">Section</th>
              <th className="px-4 py-3">Forms started</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  Loading&hellip;
                </td>
              </tr>
            ) : sections.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  No forms tracked yet.
                </td>
              </tr>
            ) : (
              sections.map((section) => {
                const total = section.leaves.length;
                const started = section.leaves.filter((l) => l.count > 0).length;
                const pct = total === 0 ? 0 : Math.round((started / total) * 100);
                return (
                  <tr key={section.sectionLabel} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground">{section.sectionLabel}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {started} of {total}
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{pct}%</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const session = useSession();
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  /** Empty set = "All" - real checkbox multi-select (client request, 2026-08-28), replacing the earlier single-value dropdown. */
  const [yearFilter, setYearFilter] = useState<Set<string>>(new Set());
  const [kvkFilter, setKvkFilter] = useState<Set<string>>(new Set());
  /** Real per-card filters (client request, 2026-08-30) - Training Progress's own Clientele/Venue, Extension Activities Progress's own Nature of Extension Activity. Same "empty = All" convention, scoped only to their own card's query (see /api/dashboard-stats). */
  const [trainingClientele, setTrainingClientele] = useState<Set<string>>(new Set());
  const [trainingVenue, setTrainingVenue] = useState<Set<string>>(new Set());
  const [extensionNature, setExtensionNature] = useState<Set<string>>(new Set());
  /** Real option lists for the two dropdowns above - Clientele/Nature of Extension Activity come from their own real masters (same source Form Management's own Training/Extension forms already use), Venue's real values are the fixed On Campus/Off Campus pair already confirmed on Training's own Edit form (no separate master for it anywhere in the reference). */
  const [clienteleOptions, setClienteleOptions] = useState<string[]>([]);
  const [natureOptions, setNatureOptions] = useState<string[]>([]);
  const VENUE_OPTIONS = ["On Campus", "Off Campus"];

  const filterCardRef = useRef<HTMLDivElement>(null);
  const statGridRef = useRef<HTMLDivElement>(null);
  const [filterCardWidth, setFilterCardWidth] = useState<number>();

  function loadStats(
    year = yearFilter,
    kvk = kvkFilter,
    clientele = trainingClientele,
    venue = trainingVenue,
    nature = extensionNature,
  ) {
    const params = new URLSearchParams();
    if (year.size > 0) params.set("year", Array.from(year).join(","));
    if (kvk.size > 0) params.set("kvk", Array.from(kvk).join(","));
    if (clientele.size > 0) params.set("trainingClientele", Array.from(clientele).join(","));
    if (venue.size > 0) params.set("trainingVenue", Array.from(venue).join(","));
    if (nature.size > 0) params.set("extensionNature", Array.from(nature).join(","));
    const query = params.toString();
    fetch(`/api/dashboard-stats${query ? `?${query}` : ""}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DashboardStats | null) => {
        if (data) setStats(data);
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (session.role === "kvk-user") return;
    loadStats();
    fetch("/api/master-options?slug=training-clientele")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { rows: { clientele: string }[] } | null) => {
        if (data) setClienteleOptions(data.rows.map((r) => r.clientele).filter(Boolean));
      })
      .catch(() => {});
    fetch("/api/master-options?slug=extension-activity")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { rows: { activityName: string }[] } | null) => {
        if (data) setNatureOptions(data.rows.map((r) => r.activityName).filter(Boolean));
      })
      .catch(() => {});
    // Initial load, once per role. `loadStats` is redeclared on every render, so listing it here would re-run this effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.role]);
  usePolling(() => {
    if (session.role !== "kvk-user") loadStats();
  });

  function applyYear(next: Set<string>) {
    setYearFilter(next);
    loadStats(next, kvkFilter);
  }
  function applyKvk(next: Set<string>) {
    setKvkFilter(next);
    loadStats(yearFilter, next);
  }
  function applyTrainingClientele(next: Set<string>) {
    setTrainingClientele(next);
    loadStats(yearFilter, kvkFilter, next, trainingVenue, extensionNature);
  }
  function applyTrainingVenue(next: Set<string>) {
    setTrainingVenue(next);
    loadStats(yearFilter, kvkFilter, trainingClientele, next, extensionNature);
  }
  function applyExtensionNature(next: Set<string>) {
    setExtensionNature(next);
    loadStats(yearFilter, kvkFilter, trainingClientele, trainingVenue, next);
  }
  function resetFilters() {
    setYearFilter(new Set());
    setKvkFilter(new Set());
    loadStats(new Set(), new Set());
  }

  /**
   * Super Admin's filter card holds Year + KVK, so its left edge is aligned to
   * span just the last two stat cards (Ext. Activity + Total Staff). A KVK
   * Admin only has the Year dropdown, so that card just sizes to its content -
   * forcing it that wide would stretch a single year select across the row.
   */
  useLayoutEffect(() => {
    if (session.role === "kvk-admin") {
      setFilterCardWidth(undefined);
      return;
    }
    function measure() {
      const grid = statGridRef.current;
      const filterCard = filterCardRef.current;
      if (!grid || !filterCard || grid.children.length < 2) return;
      const secondToLast = grid.children[grid.children.length - 2];
      const left = secondToLast.getBoundingClientRect().left;
      const right = grid.getBoundingClientRect().right;
      setFilterCardWidth(Math.max(0, right - left));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [session.role]);

  if (session.role === "kvk-user") {
    return <KvkUserDashboard kvkName={session.kvkName} />;
  }

  const isKvkAdmin = session.role === "kvk-admin";

  /** Changes only when a filter changes (not on the 20s poll) - drives each progress card's pagination reset so switching a filter never strands the user on a now-empty page. */
  const sharedFilterKey = JSON.stringify({
    y: Array.from(yearFilter).sort(),
    k: Array.from(kvkFilter).sort(),
  });
  const trainingFilterKey =
    sharedFilterKey +
    JSON.stringify([...trainingClientele].sort()) +
    JSON.stringify([...trainingVenue].sort());
  const extensionFilterKey = sharedFilterKey + JSON.stringify([...extensionNature].sort());

  const statCards = [
    { icon: BarChart3, label: "KVK", value: stats.totalKvks, href: "/forms/about-kvk/basic/view-kvks" },
    { icon: Users, label: "Total OFT", value: stats.oft.total, href: "/forms/achievements/oft" },
    { icon: FileText, label: "Total FLD", value: stats.fld.total, href: "/forms/achievements/front-line-demonstration/view-fld" },
    { icon: GraduationCap, label: "Training", value: stats.training.total, href: "/forms/achievements/trainings" },
    { icon: Activity, label: "Ext. Activity", value: stats.extension.total, href: "/forms/achievements/extension/extension-activities" },
    { icon: Tags, label: "Total Staff", value: stats.staff.total, href: "/forms/about-kvk/employee/employee-details" },
  ].filter((stat) => !isKvkAdmin || stat.label !== "KVK");

  /** "64 of 65 KVKs with entries · 1 not started" - only meaningful cross-KVK, so Super Admin only. */
  function kvksWithEntriesSummary(withEntries: number) {
    const notStarted = Math.max(0, stats.totalKvks - withEntries);
    return `${withEntries} of ${stats.totalKvks} KVKs with entries · ${notStarted} not started`;
  }

  return (
    <div>
      <div className="mb-6 flex flex-col items-start gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <LayoutDashboard className="size-5 shrink-0 text-primary" />
            <h1 className="text-3xl font-semibold text-primary">Dashboard</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {isKvkAdmin
              ? `Overview for ${session.kvkName ?? "your KVK"}`
              : "Central overview of system activities and performance metrics"}
          </p>
        </div>
        <div
          ref={filterCardRef}
          className={cn(
            "flex flex-nowrap items-center gap-2 overflow-x-auto rounded-lg border border-border bg-card p-3",
            isKvkAdmin ? "" : "justify-between gap-1.5",
          )}
          style={!isKvkAdmin && filterCardWidth ? { width: filterCardWidth } : undefined}
        >
          <MultiFilterSelect
            label="Year"
            options={stats.years.map(String)}
            selected={yearFilter}
            onChange={applyYear}
            className={isKvkAdmin ? "shrink-0" : "flex-1"}
            triggerClassName={isKvkAdmin ? "w-32" : "min-w-0 flex-1"}
          />
          {!isKvkAdmin && (
            <MultiFilterSelect
              label="KVK"
              options={stats.kvkOptions.map((k) => k.name)}
              selected={kvkFilter}
              onChange={applyKvk}
              className="flex-1"
              triggerClassName="min-w-0 flex-1"
            />
          )}
          <Button variant="outline-primary" size="sm" onClick={resetFilters} className="shrink-0">
            Reset
          </Button>
        </div>
      </div>

      {/* Column count follows the stat count - a KVK Admin has one tile fewer, and a fixed 6-column grid would leave a visible gap at the end of the row. */}
      <div
        ref={statGridRef}
        className={cn(
          "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
          isKvkAdmin ? "xl:grid-cols-5" : "xl:grid-cols-6",
        )}
      >
        {statCards.map((stat) => (
          <StatCard
            key={stat.label}
            icon={stat.icon}
            label={stat.label}
            value={stat.value}
            href={stat.href}
          />
        ))}
      </div>

      {/*
        Identical cards for both roles - only the wording changes, because
        "KVKs with entries" is cross-KVK framing that means nothing to a KVK
        Admin, whose chart is about their own trials rather than a comparison
        across KVKs.
      */}
      {/* items-start overrides CSS Grid's default align-items:stretch - without it, two cards sharing a row are forced to the SAME height (matching the taller one), so a short List view sitting next to a taller Bar view left a big empty gap below the short one's own last row and its "Showing all N" footer (real bug, client report 2026-08-30). Each card now sizes to its own real content instead of stretching to match its sibling. */}
      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <ProgressChartCard
          title="OFT Progress"
          description={
            isKvkAdmin
              ? "Ongoing and completed On Farm Trials for your KVK"
              : "Ongoing, completed; not started = KVK with no entries"
          }
          defaultView="bar"
          totalCount={stats.oft.total}
          rows={stats.charts.oft}
          summary={
            isKvkAdmin
              ? `${stats.oft.completed} completed · ${stats.oft.ongoing} ongoing`
              : kvksWithEntriesSummary(stats.oft.kvksWithEntries)
          }
          showAllLabel={`Show all (${stats.charts.oft.length})`}
          detailedHref="/dashboard/analytics/oft"
          resetKey={sharedFilterKey}
        />
        <ProgressChartCard
          title="FLD Progress"
          description={
            isKvkAdmin
              ? "Ongoing and completed Front Line Demonstrations for your KVK"
              : "Ongoing, completed; not started = KVK with no entries"
          }
          defaultView="bar"
          totalCount={stats.fld.total}
          rows={stats.charts.fld}
          summary={
            isKvkAdmin
              ? `${stats.fld.completed} completed · ${stats.fld.ongoing} ongoing`
              : kvksWithEntriesSummary(stats.fld.kvksWithEntries)
          }
          showAllLabel={`Show all (${stats.charts.fld.length})`}
          detailedHref="/dashboard/analytics/fld"
          resetKey={sharedFilterKey}
        />
        <ProgressChartCard
          title="Training Progress"
          description={
            isKvkAdmin
              ? "Trainings conducted for your KVK"
              : "Total entries per KVK; not started = KVK with no entries"
          }
          defaultView="bar"
          totalCount={stats.training.total}
          rows={toTotalChartRows(stats.charts.training)}
          mode="total"
          filters={
            <>
              <MultiFilterSelect
                label="Clientele"
                options={clienteleOptions}
                selected={trainingClientele}
                onChange={applyTrainingClientele}
                triggerClassName="h-7 min-w-20"
              />
              <MultiFilterSelect
                label="Venue"
                options={VENUE_OPTIONS}
                selected={trainingVenue}
                onChange={applyTrainingVenue}
                triggerClassName="h-7 min-w-20"
              />
            </>
          }
          summary={
            isKvkAdmin
              ? `${stats.training.total} trainings recorded`
              : kvksWithEntriesSummary(stats.training.kvksWithEntries)
          }
          showAllLabel={`Show all (${stats.charts.training.length})`}
          detailedHref="/dashboard/analytics/training"
          resetKey={trainingFilterKey}
        />
        <ProgressChartCard
          title="Extension Activities Progress"
          description={
            isKvkAdmin
              ? "Extension activities conducted for your KVK"
              : "Total entries per KVK; not started = KVK with no entries"
          }
          defaultView="bar"
          totalCount={stats.extension.total}
          rows={toTotalChartRows(stats.charts.extension)}
          mode="total"
          filters={
            <MultiFilterSelect
              label="Nature of Extension Activity"
              options={natureOptions}
              selected={extensionNature}
              onChange={applyExtensionNature}
              triggerClassName="h-7 min-w-20"
            />
          }
          summary={
            isKvkAdmin
              ? `${stats.extension.total} activities recorded`
              : kvksWithEntriesSummary(stats.extension.kvksWithEntries)
          }
          showAllLabel={`Show all (${stats.charts.extension.length})`}
          detailedHref="/dashboard/analytics/extension"
          resetKey={extensionFilterKey}
        />
      </div>

      {/* items-start overrides CSS Grid's default align-items:stretch - without it, two cards sharing a row are forced to the SAME height (matching the taller one), so a short List view sitting next to a taller Bar view left a big empty gap below the short one's own last row and its "Showing all N" footer (real bug, client report 2026-08-30). Each card now sizes to its own real content instead of stretching to match its sibling. */}
      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <StaffSummaryCard counts={stats.staffByRole} />
        <RecentLogHistoryCard />
      </div>
    </div>
  );
}
