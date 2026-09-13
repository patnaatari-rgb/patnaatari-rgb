"use client";

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type KvkCheckboxFilterProps = {
  label?: string;
  kvkNames: string[];
  /** Empty array = "All KVKs" - never a real single "" sentinel, so the caller's applied state can't drift out of sync with what the checklist actually shows checked. */
  selected: string[];
  onApply: (selected: string[]) => void;
};

/**
 * Checkbox-based multi-select KVK filter with a real "Select All" toggle
 * (client request, "changes required 1.0.pdf" 2026-08-25, items 1 + 3) -
 * replaces the single-choice "All KVKs / one KVK" <select> that used to be
 * here. Draft state is local until "Done" (or the caller's own Filter
 * button, if it drives applying) - same open/draft/apply shape as
 * column-filter-menu.tsx for consistency across the app's filter popovers.
 */
export function KvkCheckboxFilter({
  label = "KVK",
  kvkNames,
  selected,
  onApply,
}: KvkCheckboxFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  /** Always an explicit set of checked names - no "empty means all" shorthand here, so unchecking "Select All" can actually reach a real, distinct "none checked" state instead of collapsing back into "all". The empty-means-all shorthand only exists at the `selected`/`onApply` boundary (see the prop comment). */
  const [draft, setDraft] = useState<Set<string>>(
    selected.length === 0 ? new Set(kvkNames) : new Set(selected),
  );

  const filteredNames = kvkNames.filter((name) =>
    name.toLowerCase().includes(search.toLowerCase()),
  );
  const allSelected = kvkNames.length > 0 && draft.size === kvkNames.length;

  function openMenu(next: boolean) {
    setOpen(next);
    if (next) {
      setDraft(selected.length === 0 ? new Set(kvkNames) : new Set(selected));
      setSearch("");
    }
  }

  function toggleAll(checked: boolean) {
    setDraft(checked ? new Set(kvkNames) : new Set());
  }

  function toggleOne(name: string, checked: boolean) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  function apply() {
    onApply(draft.size === kvkNames.length ? [] : Array.from(draft));
    setOpen(false);
  }

  const summary =
    selected.length === 0
      ? "All KVKs"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} KVKs selected`;

  return (
    <div>
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="mt-1">
        <DropdownMenu open={open} onOpenChange={openMenu}>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex h-9 w-64 items-center justify-between rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
              >
                <span className="truncate">{summary}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </button>
            }
          />
          <DropdownMenuContent align="start" className="w-64 p-3">
            <label className="flex items-center gap-2 border-b border-border pb-2 text-xs font-semibold">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => toggleAll(checked === true)}
              />
              Select All
            </label>

            <div className="relative mt-2">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                /* Base UI's Menu owns keydown on the popup for typeahead/arrow
                   nav, which otherwise swallows every character before it
                   reaches this input - stop the bubble so typing actually
                   lands here (same real fix as column-filter-menu.tsx's own
                   search input; this one just never got it). */
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Search KVKs..."
                className="h-7 pl-7 text-xs"
              />
            </div>

            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {filteredNames.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  No KVKs
                </p>
              ) : (
                filteredNames.map((name) => {
                  const checked = draft.has(name);
                  return (
                    <label
                      key={name}
                      className="flex items-center gap-2 py-0.5 text-xs"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => toggleOne(name, next === true)}
                      />
                      <span className="text-foreground">{name}</span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="mt-3 flex justify-end border-t border-border pt-2">
              <Button size="xs" onClick={apply}>
                Done
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
