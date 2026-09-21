"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { PageHeader, type Crumb } from "@/components/layout/page-header";
import { MONTH_NAMES } from "@/lib/months";

const QUARTERS = [1, 2, 3, 4, 5, 6];
const YES_NO = [
  { value: "Yes", label: "Yes" },
  { value: "No", label: "No" },
];

type StaffQuartersFormProps = {
  trail: Crumb[];
  backHref: string;
  /** Present for Edit, absent for Add. */
  id?: string;
  title: string;
};

type GridState = Record<string, string>; // `${month}-${quarter}` -> "Yes" | "No" | ""

/**
 * "Utilization of Staff Quarters" - transcribed from the live reference
 * (atariams.org /infra-performance/staff-quaters/create + /.../edit, KVK
 * admin): five summary fields plus a 12-month x 6-quarter Yes/No occupancy
 * grid, saved in one shot. Feeds report section 1.3.C. Our About KVK nav
 * keeps this leaf under Land & Infrastructure; only the form matches the
 * reference.
 */
export function StaffQuartersForm({ trail, backHref, id, title }: StaffQuartersFormProps) {
  const router = useRouter();
  const isEdit = Boolean(id);

  const [dateOfCompletion, setDateOfCompletion] = useState("");
  const [whetherCompleted, setWhetherCompleted] = useState("");
  const [numberOfQuarters, setNumberOfQuarters] = useState("");
  const [occupancyDetails, setOccupancyDetails] = useState("");
  const [remark, setRemark] = useState("");
  const [grid, setGrid] = useState<GridState>({});

  const [loaded, setLoaded] = useState(!isEdit);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/staff-quarters/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("load failed");
        return r.json();
      })
      .then((data) => {
        setDateOfCompletion(data.dateOfCompletion ?? "");
        setWhetherCompleted(data.whetherCompleted ?? "");
        setNumberOfQuarters(data.numberOfQuarters ?? "");
        setOccupancyDetails(data.occupancyDetails ?? "");
        setRemark(data.remark ?? "");
        const g: GridState = {};
        for (const cell of data.occupancy ?? []) {
          g[`${cell.month}-${cell.quarter}`] = cell.value;
        }
        setGrid(g);
        setLoaded(true);
      })
      .catch(() => setLoadError(true));
  }, [id]);

  function setCell(month: number, quarter: number, value: string) {
    setGrid((prev) => ({ ...prev, [`${month}-${quarter}`]: value }));
  }

  async function submit() {
    setError(null);
    if (!dateOfCompletion || !whetherCompleted || !numberOfQuarters.trim() || !occupancyDetails.trim() || !remark.trim()) {
      setError("Please fill all required fields.");
      return;
    }
    const occupancy = Object.entries(grid)
      .filter(([, v]) => v === "Yes" || v === "No")
      .map(([key, value]) => {
        const [month, quarter] = key.split("-").map(Number);
        return { month, quarter, value };
      });

    setSubmitting(true);
    try {
      const res = await fetch(isEdit ? `/api/staff-quarters/${id}` : "/api/staff-quarters", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateOfCompletion,
          whetherCompleted,
          numberOfQuarters,
          occupancyDetails,
          remark,
          occupancy,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push(backHref);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div>
        <PageHeader backHref={backHref} trail={trail} title={title} />
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm font-semibold text-foreground">This record could not be loaded.</p>
          <Button className="mt-4" onClick={() => router.push(backHref)}>
            Back to list
          </Button>
        </div>
      </div>
    );
  }
  if (!loaded) return null;

  return (
    <div>
      <div className="animate-in fade-in-0 slide-in-from-left-8 ease-out duration-300">
        <PageHeader backHref={backHref} trail={trail} title={title} />
      </div>

      <div className="animate-in fade-in-0 slide-in-from-right-8 ease-out rounded-lg border border-border bg-card p-6 duration-300">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sq-doc">
              Date of Completion <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sq-doc"
              type="date"
              className="h-10"
              value={dateOfCompletion}
              onChange={(e) => setDateOfCompletion(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sq-completed">
              Whether staff quarters have been completed <span className="text-destructive">*</span>
            </Label>
            <SimpleSelect
              id="sq-completed"
              value={whetherCompleted}
              onValueChange={setWhetherCompleted}
              placeholder="Select"
              options={YES_NO}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sq-count">
              No. of Staff Quarters <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sq-count"
              type="number"
              className="h-10"
              value={numberOfQuarters}
              onChange={(e) => setNumberOfQuarters(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sq-occ">
              Occupancy Details <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sq-occ"
              className="h-10"
              value={occupancyDetails}
              onChange={(e) => setOccupancyDetails(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sq-remark">
              Remark <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sq-remark"
              className="h-10"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-4">
          <p className="mb-3 text-sm font-semibold text-primary">Monthly Occupancy</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold text-muted-foreground uppercase">
                  <th className="py-2 pr-3">Month</th>
                  {QUARTERS.map((q) => (
                    <th key={q} className="px-2 py-2">Quarter {q}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MONTH_NAMES.map((month, index) => (
                  <tr key={month} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-medium whitespace-nowrap">{month}</td>
                    {QUARTERS.map((q) => (
                      <td key={q} className="px-2 py-1.5">
                        <SimpleSelect
                          value={grid[`${index + 1}-${q}`] ?? ""}
                          onValueChange={(v) => setCell(index + 1, q, v)}
                          placeholder="Select"
                          options={YES_NO}
                          className="h-9 min-w-24"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => router.push(backHref)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            <Save className="size-3.5" />
            {submitting ? "Saving…" : "Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
