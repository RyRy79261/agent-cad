"use client";

import type { Reference } from "@agent-cad/types";
import { Paperclip, X, Box, ImageIcon } from "lucide-react";

import { assetUrl } from "@/lib/api";

/**
 * The pinned-references tray: thumbnails of the images / STL renders the model views on
 * every generate & refine. Lives above the composer. Empty → renders nothing but the
 * add affordance is always reachable via the composer's paperclip.
 */
export function ReferencesTray({
  references,
  onRemove,
  onAdd,
  disabled,
}: {
  references: Reference[];
  onRemove: (id: string) => void;
  onAdd: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {references.length > 0 ? (
        <span className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">References</span>
      ) : null}
      {references.map((r) => (
        <div
          key={r.id}
          className="group relative flex items-center gap-2 rounded-lg border border-border-strong bg-elevated py-1 pl-1 pr-2"
          title={r.name}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-card">
            {r.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- small local API image, no optimizer
              <img src={assetUrl(r.image_url)} alt={r.name} className="h-9 w-9 object-cover" />
            ) : r.kind === "stl" ? (
              <Box className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            )}
          </span>
          <span className="max-w-[120px] truncate text-xs">
            <span className="block truncate text-foreground">{r.name}</span>
            {r.kind === "stl" && r.bbox ? (
              <span className="block text-[10px] text-subtle-foreground">
                {Math.round(r.bbox.x ?? 0)}×{Math.round(r.bbox.y ?? 0)}×{Math.round(r.bbox.z ?? 0)} mm
              </span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={() => onRemove(r.id)}
            aria-label={`Remove ${r.name}`}
            className="ml-0.5 rounded text-subtle-foreground transition-colors hover:text-danger"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        className="flex h-11 items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-3 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
      >
        <Paperclip className="h-3.5 w-3.5" />
        {references.length > 0 ? "Add" : "Attach image or STL reference"}
      </button>
    </div>
  );
}
