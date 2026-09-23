"use client";

import { Download, Eye, EyeOff, ImageOff, Maximize2, MoreVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ModuleImageRecord } from "@/lib/module-images";

/**
 * Real photograph card (client PDF, "Module Image workflow" section 9,
 * 2026-09-02): checkbox + photo + KVK Name/Form/Caption/Date labels +
 * download icon, replacing the earlier table row - was a real, confirmed
 * layout mismatch, not a stylistic choice. Shared by both Super Admin's and
 * a KVK's own Module Images view; `showKvk` hides the KVK Name line for the
 * KVK's own scoped view, where every card is already theirs.
 */
export function ModuleImageCard({
  row,
  showKvk,
  selected,
  onToggleSelected,
  published,
  onTogglePublish,
  onDownload,
  onDelete,
}: {
  row: ModuleImageRecord;
  showKvk: boolean;
  /** Omit both (KVK's own scoped view, which downloads every filtered row rather than a hand-picked selection) to render the card without a select checkbox. */
  selected?: boolean;
  onToggleSelected?: () => void;
  published: boolean;
  onTogglePublish: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative">
        {row.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.previewUrl} alt={row.caption} className="aspect-video w-full object-cover" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-muted">
            <ImageOff className="size-6 text-muted-foreground/50" />
          </div>
        )}
        {onToggleSelected && (
          <div className="absolute top-2 left-2 rounded-md bg-white/90 p-0.5 shadow-sm">
            <Checkbox
              checked={selected ?? false}
              onCheckedChange={onToggleSelected}
              aria-label={`Select ${row.caption}`}
            />
          </div>
        )}
        <div className="absolute top-2 right-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label="Image actions"
                  variant="ghost"
                  size="icon-sm"
                  className="bg-white/90 shadow-sm hover:bg-white"
                >
                  <MoreVertical className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-max min-w-40 whitespace-nowrap">
              <DropdownMenuItem
                onClick={() => window.open(row.previewUrl, "_blank", "noopener,noreferrer")}
                disabled={!row.previewUrl}
              >
                <Maximize2 className="size-3.5" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onTogglePublish}>
                {published ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                {published ? "Unpublish" : "Publish"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="size-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="space-y-1 p-3 text-xs">
        {showKvk && (
          <p className="truncate text-foreground">
            <span className="font-semibold">KVK Name</span> : {row.kvk}
          </p>
        )}
        <p className="truncate text-foreground">
          <span className="font-semibold">Form</span> : {row.categoryLabel}
        </p>
        <p className="line-clamp-2 text-foreground" title={row.caption}>
          <span className="font-semibold">Caption</span> : {row.caption}
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">Date</span> : {row.date}
        </p>
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
            published ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {published ? "Published" : "Not Published"}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => window.open(row.previewUrl, "_blank", "noopener,noreferrer")}
            disabled={!row.previewUrl}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title="View"
          >
            <Maximize2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={!row.previewUrl}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title="Download"
          >
            <Download className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
