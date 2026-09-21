"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { usePolling } from "@/lib/use-polling";

type LogRow = {
  id: string;
  kvkName: string;
  nameOfUser: string;
  activity: string;
  ipAddress: string;
  loginTime: string;
};

const ALL_COLUMNS = ["S.No.", "KVK Name", "Name Of User", "Activity", "IP Address", "Login Time"];

function formatLoginTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Fixed to 450px so this card matches the real rendered height of the OFT/FLD/Training/Extension progress cards above it - this dashboard's other row of content cards - rather than drifting to whatever height its own content happens to need. */
export function RecentLogHistoryCard() {
  const session = useSession();
  const isKvkScoped = session.role !== "super-admin";
  const columns = isKvkScoped ? ALL_COLUMNS.filter((c) => c !== "KVK Name") : ALL_COLUMNS;

  const [rows, setRows] = useState<LogRow[]>([]);

  const load = useCallback(() => {
    let cancelled = false;
    // Enough rows to fill the card's fixed height (matches the progress cards
    // above) so there's no dead space below the last row on a short list.
    fetch("/api/log-history?limit=12")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { rows: LogRow[] } | null) => {
        if (!cancelled && data) setRows(data.rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);
  // Keep the dashboard's "recent" list in step with the ~20s refresh the
  // stat cards and progress charts already run on.
  usePolling(load);

  return (
    <div className="flex h-[450px] flex-col rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold tracking-wide text-primary uppercase">
          Recent Log History
        </p>
        <Link
          href="/log-history"
          className="text-xs font-medium text-primary hover:underline"
        >
          View all
        </Link>
      </div>
      <div role="region" aria-label="Recent log history" tabIndex={0} className="mt-3 min-h-0 flex-1 -mx-5 overflow-auto border-t border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="divide-x divide-border border-b border-border bg-muted/50 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {columns.map((column) => (
                <th key={column} className="px-4 py-2.5 whitespace-nowrap">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center align-middle text-muted-foreground"
                >
                  No records found.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={row.id}
                  className="divide-x divide-border border-b border-border last:border-0"
                >
                  <td className="px-4 py-2.5 text-foreground">{index + 1}</td>
                  {!isKvkScoped && (
                    <td className="px-4 py-2.5 whitespace-nowrap text-foreground">{row.kvkName}</td>
                  )}
                  <td className="px-4 py-2.5 text-foreground">{row.nameOfUser}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{row.activity}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{row.ipAddress}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {formatLoginTime(row.loginTime)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
