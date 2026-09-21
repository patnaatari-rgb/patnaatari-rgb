"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, History } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/simple-select";
import { cn } from "@/lib/utils";
import { KVKS } from "@/lib/rbac";
import { useSession } from "@/lib/session";

const COLUMNS = [
  { key: "sNo", label: "S.No." },
  { key: "kvkName", label: "KVK Name" },
  { key: "nameOfUser", label: "Name Of User" },
  { key: "activity", label: "Activity" },
  { key: "ipAddress", label: "IP Address" },
  { key: "loginTime", label: "Login Time" },
] as const;

/** A KVK Admin's own log view drops the KVK Name column - every row is already their own KVK. */
const KVK_COLUMNS = COLUMNS.filter((column) => column.key !== "kvkName");

const PAGE_SIZE = 20;

type LogRow = {
  id: string;
  kvkName: string;
  nameOfUser: string;
  activity: string;
  ipAddress: string;
  loginTime: string;
};

function formatLoginTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SortState = { key: string; direction: "asc" | "desc" } | null;

/**
 * Real columns and filter row confirmed from a the reference
 * ("View Users Log Activity": KVK dropdown + Filter button, Search box, then
 * S.No/KVK Name/Name of User/Activity/IP Address/Login Time with per-column
 * sort arrows) - that the reference's own chrome (sidebar/header/table style)
 * is from a different, older reference build than the rest of this app, so
 * only the content/columns/filters are matched here; visual styling stays
 * consistent with the rest of this app's design system.
 */
export default function LogHistoryPage() {
  const session = useSession();
  const isKvk = session.role !== "super-admin";

  const [kvkFilter, setKvkFilter] = useState("all");
  const [appliedKvkFilter, setAppliedKvkFilter] = useState("all");
  /** Super Admin's own log entries have no KVK, so that column drops out the same way it does for a KVK Admin's own scoped view. */
  const columns = isKvk || appliedKvkFilter === "super-admin" ? KVK_COLUMNS : COLUMNS;
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<LogRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ limit: "5000" });
    if (!isKvk && appliedKvkFilter !== "all") params.set("kvk", appliedKvkFilter);
    fetch(`/api/log-history?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { rows: LogRow[] } | null) => {
        if (!cancelled && data) setRows(data.rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isKvk, appliedKvkFilter]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (prev?.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  }

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    let result = !term
      ? rows
      : rows.filter((row) =>
          [row.kvkName, row.nameOfUser, row.activity, row.ipAddress].some((value) =>
            value.toLowerCase().includes(term),
          ),
        );
    if (sort) {
      const { key, direction } = sort;
      result = [...result].sort((a, b) => {
        const va = key === "loginTime" ? new Date(a.loginTime).getTime() : String(a[key as keyof LogRow] ?? "");
        const vb = key === "loginTime" ? new Date(b.loginTime).getTime() : String(b[key as keyof LogRow] ?? "");
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return direction === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [rows, search, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filteredRows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div>
      <PageHeader
        trail={[{ label: "Log History" }]}
        title="View Users Log Activity"
        icon={History}
        description={
          isKvk
            ? `Activity log for ${session.kvkName ?? "your KVK"}`
            : "Super Admin Log - activity across the system"
        }
      />

      {/* A KVK Admin never gets a cross-KVK picker - data isolation: KVK A must never read KVK B's activity. */}
      {!isKvk && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="log-history-kvk" className="block text-xs font-medium text-muted-foreground">
              KVKs
            </label>
            <SimpleSelect
              id="log-history-kvk"
              value={kvkFilter}
              onValueChange={setKvkFilter}
              options={[
                { value: "all", label: "All" },
                { value: "super-admin", label: "Super Admin" },
                ...KVKS.map((kvk) => ({ value: kvk.name, label: kvk.name })),
              ]}
              className="mt-1 w-56"
            />
          </div>
          <Button
            size="lg"
            onClick={() => {
              setAppliedKvkFilter(kvkFilter);
              setPage(0);
            }}
          >
            Filter
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search..."
              className="pl-8"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="divide-x divide-border border-b border-border bg-muted/50 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {columns.map((column) => {
                  const active = sort?.key === column.key;
                  return (
                    <th key={column.key} className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className={cn(
                          "inline-flex items-center gap-1 transition-colors",
                          active ? "text-primary" : "hover:text-foreground",
                        )}
                      >
                        {column.label}
                        {active ? (
                          sort?.direction === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3 text-muted-foreground/50" />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-16 text-center text-muted-foreground"
                  >
                    No records found.
                  </td>
                </tr>
              ) : (
                pageRows.map((row, index) => (
                  <tr key={row.id} className="divide-x divide-border border-b border-border last:border-0">
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-2.5 text-foreground">
                        {column.key === "sNo"
                          ? currentPage * PAGE_SIZE + index + 1
                          : column.key === "loginTime"
                            ? formatLoginTime(row.loginTime)
                            : row[column.key as Exclude<typeof column.key, "sNo">]}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
          <span>
            Showing {pageRows.length === 0 ? 0 : currentPage * PAGE_SIZE + 1}-
            {currentPage * PAGE_SIZE + pageRows.length} of {filteredRows.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
