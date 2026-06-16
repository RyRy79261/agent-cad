"use client";

import type { FilamentProfile, Printer } from "@agent-cad/types";
import { Printer as PrinterIcon, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { swatchColor } from "@/lib/format";

export interface CalibContextHeaderProps {
  printer: Printer;
  filament: FilamentProfile;
  /** True when the filament's current settings match its committed `default_settings`. */
  isOriginal: boolean;
  /** Revert the editor to the committed baseline (only meaningful when !isOriginal). */
  onResetOriginal?: () => void;
}

/**
 * Shared header for the Filament·Calibration editor + both Result screens (FR-HDR-1):
 * printer thumb + name, the filament colour-swatch chip, the "Original" state (with a
 * reset-to-committed-baseline action), and the printer spec line.
 */
export function CalibContextHeader({ printer, filament, isOriginal, onResetOriginal }: CalibContextHeaderProps) {
  const bv = printer.build_volume;
  const meta = [filament.brand, filament.color].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-elevated text-muted-foreground">
          <PrinterIcon className="h-5 w-5" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{printer.name}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-elevated px-2.5 py-0.5 text-xs">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: swatchColor(filament.color) }} />
              {filament.material}
              {meta ? <span className="text-subtle-foreground">· {meta}</span> : null}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {printer.kind} · {printer.nozzle_diameter_mm} mm nozzle · {bv.x} × {bv.y} × {bv.z} mm
          </p>
        </div>
      </div>

      {isOriginal ? (
        <span className="inline-flex items-center rounded-full bg-success-muted px-2.5 py-1 text-xs font-medium text-success">
          Original
        </span>
      ) : onResetOriginal ? (
        <button
          type="button"
          onClick={onResetOriginal}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium",
            "text-muted-foreground transition-colors hover:border-primary hover:text-foreground",
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Modified · reset to original
        </button>
      ) : (
        <span className="inline-flex items-center rounded-full bg-elevated px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Modified
        </span>
      )}
    </div>
  );
}
