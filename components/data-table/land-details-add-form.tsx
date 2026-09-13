"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, type Crumb } from "@/components/layout/page-header";

type Row = { item: string; areaHa: string };

const blankRow = (): Row => ({ item: "", areaHa: "" });

type LandDetailsAddFormProps = {
  trail: Crumb[];
  backHref: string;
};

/**
 * Land Details' own Add New page keeps the real reference's repeatable
 * "Total Land with KVK" row shape (Item + In Ha, "Add More Item"/"Remove
 * Item") even though the leaf itself moved to the same List + Add New/Edit
 * pattern every sibling leaf has (client direction, 2026-09-13) - a KVK
 * typically has several land items to record at once, so a plain one-row-
 * per-visit Add form would make that tedious. Each filled row posts as its
 * own record through the same generic /api/leaf-record create endpoint
 * every other leaf's Add form uses, one per row, so the list, Edit, Delete
 * and report section 1.3.B all still work exactly as they do for any other
 * per-row leaf.
 */
export function LandDetailsAddForm({ trail, backHref }: LandDetailsAddFormProps) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(index: number, key: keyof Row, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow()]);
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length === 1 ? [blankRow()] : prev.filter((_, i) => i !== index)));
  }

  async function submit() {
    setError(null);
    const filled = rows.filter((r) => r.item.trim() || r.areaHa.trim());
    if (filled.length === 0) {
      setError("Add at least one item.");
      return;
    }
    if (filled.some((r) => !r.item.trim() || !r.areaHa.trim())) {
      setError("Every row needs both an item and its area.");
      return;
    }
    setSaving(true);
    try {
      const results = await Promise.all(
        filled.map((r) =>
          fetch("/api/leaf-record", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: "about-kvk/land-infrastructure/land-details",
              values: { item: r.item.trim(), areaHa: r.areaHa.trim() },
            }),
          }).then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) })),
        ),
      );
      const failed = results.find((r) => !r.ok);
      if (failed) {
        setError(failed.data?.error ?? "Could not save one of the rows. Please try again.");
        return;
      }
      router.push(backHref);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="animate-in fade-in-0 slide-in-from-left-8 ease-out duration-300">
        <PageHeader backHref={backHref} trail={trail} title="Add Land Details" />
      </div>

      <div className="animate-in fade-in-0 slide-in-from-right-8 ease-out rounded-lg border border-border bg-card p-6 duration-300">
        <h2 className="text-lg font-semibold text-primary">Total Land with KVK</h2>

        <div className="mt-4 space-y-3">
          {rows.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            >
              <div className="space-y-1.5">
                <Label htmlFor={`land-item-${index}`}>
                  Item <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`land-item-${index}`}
                  className="h-10"
                  placeholder="Enter item"
                  value={row.item}
                  onChange={(e) => update(index, "item", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`land-area-${index}`}>
                  In Ha <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`land-area-${index}`}
                  className="h-10"
                  placeholder="Enter in ha"
                  value={row.areaHa}
                  onChange={(e) => update(index, "areaHa", e.target.value)}
                />
              </div>
              {index === 0 ? (
                <Button type="button" onClick={addRow} disabled={saving}>
                  <Plus className="size-3.5" />
                  Add More Item
                </Button>
              ) : (
                <Button type="button" variant="destructive" onClick={() => removeRow(index)} disabled={saving}>
                  <Trash2 className="size-3.5" />
                  Remove Item
                </Button>
              )}
            </div>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => router.push(backHref)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            <Save className="size-3.5" />
            {saving ? "Saving…" : "Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
