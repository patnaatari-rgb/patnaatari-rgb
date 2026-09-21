"use client";

import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { MONTH_NAMES } from "@/lib/months";

const QUARTERS = ["Quarter 1", "Quarter 2", "Quarter 3", "Quarter 4", "Quarter 5", "Quarter 6"] as const;

export type MonthQuarterGridValue = Record<string, Record<string, string>>;

function parseValue(raw: string): MonthQuarterGridValue {
  try {
    const parsed = JSON.parse(raw || "{}");
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** The real Jan-Dec x Quarter 1-6 Yes/No completion matrix confirmed live on Staff Quarters' own Create form (atariams.org/infra-performance/staff-quaters/create, 2026-09-04) - stored as one JSON string ({month: {quarter: "Yes"|"No"}}) on the parent MasterColumn's key. */
export function MonthQuarterGridField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const grid = parseValue(value);

  function setCell(month: string, quarter: string, next: string) {
    const updated: MonthQuarterGridValue = { ...grid, [month]: { ...grid[month], [quarter]: next } };
    onChange(JSON.stringify(updated));
  }

  return (
    <div className="space-y-2">
      <p className="text-lg font-semibold text-primary">{label}</p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="divide-x divide-border border-b border-border bg-muted/50 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <th className="px-3 py-2">Month</th>
              {QUARTERS.map((quarter) => (
                <th key={quarter} className="px-3 py-2">
                  {quarter}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MONTH_NAMES.map((month) => (
              <tr key={month} className="divide-x divide-border border-b border-border last:border-0">
                <td className="px-3 py-2 whitespace-nowrap text-foreground">{month}</td>
                {QUARTERS.map((quarter) => {
                  const fieldId = `mqg-${month}-${quarter}`;
                  return (
                    <td key={quarter} className="px-2 py-1.5">
                      <Label htmlFor={fieldId} className="sr-only">
                        {month} {quarter}
                      </Label>
                      <SimpleSelect
                        id={fieldId}
                        value={grid[month]?.[quarter] ?? ""}
                        onValueChange={(v) => setCell(month, quarter, v)}
                        placeholder="Select"
                        options={[
                          { value: "Yes", label: "Yes" },
                          { value: "No", label: "No" },
                        ]}
                        className="h-9 min-w-24"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
