"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";

export type MasterRow = Record<string, string>;

/** A row that acts as the free-text "Other" choice by its name alone - exact "Other"/"Others" only, so a real "Other Enterprises" category is untouched. */
function isOtherName(name: string | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  return n === "other" || n === "others";
}

/**
 * A master-sourced <select> that honours a row flagged "Mark as 'Other'
 * option": picking that row reveals a free-text input beside the select and
 * the typed value is what the form submits.
 *
 * Same behaviour as MasterFormFields' SourceMasterField, pulled out here for
 * the bespoke OFT / FLD forms which build their dropdowns by hand instead of
 * going through MasterFormFields. Callers pass the already-filtered rows for
 * a cascading field (e.g. only the categories under the chosen sector), so
 * the "Other" row is detected within that same filtered set.
 */
export function OtherAwareSelect({
  id,
  label,
  required,
  value,
  onChange,
  rows,
  allRows,
  optionKey,
  disabled,
  placeholder = "Please Select",
}: {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  /** Cascade-filtered rows for the current parent selection. */
  rows: MasterRow[];
  /**
   * The full unfiltered set, used only to source the flagged "Other" row.
   * That row is an escape hatch, not cascade data, so it stays offered even
   * when it belongs to a different parent than the one chosen. Defaults to
   * `rows` when the field has no cascade.
   */
  allRows?: MasterRow[];
  optionKey: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  // Flagged row wins; otherwise a row literally named "Other"/"Others".
  const src = allRows ?? rows;
  const otherName = (
    src.find((r) => r._isOther === "1") ?? src.find((r) => isOtherName(r[optionKey]))
  )?.[optionKey];

  const options = useMemo(() => {
    const values = new Set(
      rows.map((r) => r[optionKey]).filter((v): v is string => Boolean(v?.trim())),
    );
    if (otherName) values.add(otherName);
    // "Other" always sorts last (client direction, 2026-09-12) - a plain
    // alphabetical sort could put it anywhere (e.g. "Other" before "Soil
    // Science"), same as every other value here isn't otherName.
    const sorted = Array.from(values).sort((a, b) => {
      if (a === otherName) return b === otherName ? 0 : 1;
      if (b === otherName) return -1;
      // `numeric: true` so "Level - 2" sorts before "Level - 10" (plain
      // localeCompare treats these as strings and puts "Level - 10" right
      // after "Level - 1", real bug reported 2026-09-15) - same fix belongs
      // everywhere this component's used (Level, Discipline, Category,
      // Sanctioned Post, ...), not just one dropdown.
      return a.localeCompare(b, undefined, { numeric: true });
    });
    return sorted;
  }, [rows, optionKey, otherName]);
  /**
   * Real bug, 2026-09-12: this used to fall back to "treat as Other" for any
   * value not in the current `options` - but `options` is the CASCADE-
   * FILTERED list (e.g. Thematic Area narrowed to the just-picked OFT
   * Subject), which goes empty/different the moment an unrelated parent
   * field changes. That made a real, already-picked Thematic Area look
   * "orphaned" the instant OFT Subject was changed (even to "Other"), so it
   * silently flipped to the Other/specify UI and pre-filled the specify box
   * with that old value - never something the user actually typed. The
   * fallback now checks the FULL unfiltered master (`src`) instead, so a
   * value only ever counts as "Other" when it truly doesn't exist anywhere
   * in the master, not merely outside the current cascade slice.
   */
  const allValues = useMemo(
    () => new Set(src.map((r) => r[optionKey]).filter((v): v is string => Boolean(v?.trim()))),
    [src, optionKey],
  );
  const isOtherActive =
    Boolean(otherName) && (value === otherName || (Boolean(value) && !allValues.has(value)));

  const select = (
    <SimpleSelect
      id={id}
      value={isOtherActive && otherName ? otherName : value}
      onValueChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      options={options.map((option) => ({ value: option, label: option }))}
      className="h-10 w-full"
    />
  );

  if (!isOtherActive) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
        {select}
      </div>
    );
  }

  return (
    // Beside the select, not below it (client direction, 2026-09-12) - but a
    // select + a whole second labelled input need more room than this
    // field's own single grid track (e.g. minmax(240px,320px)) has, which is
    // what truncated "Specify OFT Subject" in an earlier version of this fix.
    // Spanning 2 tracks only while the specify box is showing gives both the
    // room they need without changing this field's width the rest of the
    // time; later fields on the row simply wrap to make room, same as
    // `auto-fit` already does for a merely-longer field anywhere else in
    // this app. The select and the specify input are two equal, independent
    // Label+field pairs side by side (not one shared label above a flex row)
    // so both labels sit on the exact same line, not one a row lower than
    // the other (real client screenshot, 2026-09-12).
    <div className="flex items-start gap-3" style={{ gridColumn: "span 2" }}>
      <div className="flex-1 space-y-1.5">
        <Label htmlFor={id}>
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
        {select}
      </div>
      <div className="flex-1 space-y-1.5">
        <Label htmlFor={`${id}-other`}>Please specify</Label>
        <Input
          id={`${id}-other`}
          className="h-10 w-full"
          placeholder={`Specify ${label}`}
          value={value === otherName ? "" : value}
          onChange={(e) =>
            onChange(e.target.value.trim() ? e.target.value : (otherName as string))
          }
        />
      </div>
    </div>
  );
}
