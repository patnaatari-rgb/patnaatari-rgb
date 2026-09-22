"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, ScrollText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SimpleSelect } from "@/components/ui/simple-select";
import { cn } from "@/lib/utils";
import { KVKS } from "@/lib/rbac";
import { useSession, useSessionReady } from "@/lib/session";

const COLUMNS = [
  { key: "sNo", label: "S.No." },
  { key: "kvkName", label: "KVK Name" },
  { key: "username", label: "User" },
  { key: "action", label: "Action" },
  { key: "form", label: "Form" },
  { key: "recordId", label: "Record Id" },
  { key: "createdAt", label: "When" },
] as const;

const ACTION_BADGE_VARIANT = {
  CREATE: "success",
  UPDATE: "warning",
  DELETE: "destructive",
} as const;

const PAGE_SIZE = 20;

type LogRow = {
  id: string;
  kvkName: string;
  username: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  form: string;
  recordId: string;
  createdAt: string;
};

function formatWhen(iso: string) {
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
 * Who created, changed or deleted a record, and when - Super Admin only
 * (security review, 2026-09-22: Log History covers sign-ins, not data
 * changes). Same list/search/sort/pagination shape as Log History
 * (log-history/page.tsx) so the two feel like one family.
 */
export default function DataAuditLogPage() {
  const router = useRouter();
  const session = useSession();
  const sessionReady = useSessionReady();
  const isKvk = session.role !== "super-admin";

  /** Hidden for KVK roles, same convention as Role/User Management - see lib/navigation.ts's KVK_HIDDEN_SLUGS and proxy.ts's SUPER_ADMIN_ONLY_PREFIXES. */
  useEffect(() => {
    if (sessionReady && isKvk) router.replace("/dashboard");
  }, [sessionReady, isKvk, router]);

  const [kvkFilter, setKvkFilter] = useState("all");
  const [appliedKvkFilter, setAppliedKvkFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<LogRow[]>([]);

  useEffect(() => {
    if (isKvk) return;
    let cancelled = false;
    const params = new URLSearchParams({ limit: "2000" });
    if (appliedKvkFilter !== "all") params.set("kvk", appliedKvkFilter);
    if (actionFilter !== "all") params.set("action", actionFilter);
    fetch(`/api/data-audit-log?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { rows: LogRow[] } | null) => {
        if (!cancelled && data) setRows(data.rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isKvk, appliedKvkFilter, actionFilter]);

  if (!sessionReady || isKvk) return null;

  function toggleSort(key: string) {
    setSort((prev) => {
      if (prev?.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  }

  const filteredRows = (() => {
    const term = search.trim().toLowerCase();
    let result = !term
      ? rows
      : rows.filter((row) =>
          [row.kvkName, row.username, row.action, row.form, row.recordId].some((value) =>
            value.toLowerCase().includes(term),
          ),
        );
    if (sort) {
      const { key, direction } = sort;
      result = [...result].sort((a, b) => {
        const va = key === "createdAt" ? new Date(a.createdAt).getTime() : String(a[key as keyof LogRow] ?? "");
        const vb = key === "createdAt" ? new Date(b.createdAt).getTime() : String(b[key as keyof LogRow] ?? "");
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return direction === "asc" ? cmp : -cmp;
      });
    }
    return result;
  })();

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filteredRows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div>
      <PageHeader
        trail={[{ label: "Data Audit Log" }]}
        title="Data Change Log"
        icon={ScrollText}
        description="Who created, changed or deleted a record, and when - across the whole zone"
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="audit-log-kvk" className="block text-xs font-medium text-muted-foreground">
            KVKs
          </label>
          <SimpleSelect
            id="audit-log-kvk"
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
        <div>
          <label htmlFor="audit-log-action" className="block text-xs font-medium text-muted-foreground">
            Action
          </label>
          <SimpleSelect
            id="audit-log-action"
            value={actionFilter}
            onValueChange={(v) => {
              setActionFilter(v);
              setPage(0);
            }}
            options={[
              { value: "all", label: "All" },
              { value: "CREATE", label: "Created" },
              { value: "UPDATE", label: "Changed" },
              { value: "DELETE", label: "Deleted" },
            ]}
            className="mt-1 w-40"
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
                {COLUMNS.map((column) => {
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
                  <td colSpan={COLUMNS.length} className="px-4 py-16 text-center text-muted-foreground">
                    No records found.
                  </td>
                </tr>
              ) : (
                pageRows.map((row, index) => (
                  <tr key={row.id} className="divide-x divide-border border-b border-border last:border-0">
                    {COLUMNS.map((column) => (
                      <td key={column.key} className="px-4 py-2.5 text-foreground">
                        {column.key === "sNo" ? (
                          currentPage * PAGE_SIZE + index + 1
                        ) : column.key === "createdAt" ? (
                          formatWhen(row.createdAt)
                        ) : column.key === "action" ? (
                          <Badge variant={ACTION_BADGE_VARIANT[row.action]} className="font-normal">
                            {row.action === "CREATE" ? "Created" : row.action === "UPDATE" ? "Changed" : "Deleted"}
                          </Badge>
                        ) : (
                          row[column.key as Exclude<typeof column.key, "sNo" | "createdAt" | "action">]
                        )}
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
