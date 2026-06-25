"use client";

import * as React from "react";
import type { Checkpoint } from "@agent-cad/types";
import { Flag, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The mid-print-changeable settings, in display order. (Retraction/walls/infill can't change
 *  mid-print — they're baked into the toolpaths — so they're not here.) */
const FIELDS: { key: keyof Checkpoint; label: string; unit: string; min: number; max: number; ph: string }[] = [
  { key: "nozzle_temp", label: "Nozzle", unit: "°C", min: 150, max: 300, ph: "200" },
  { key: "bed_temp", label: "Bed", unit: "°C", min: 0, max: 120, ph: "60" },
  { key: "fan_percent", label: "Fan", unit: "%", min: 0, max: 100, ph: "100" },
  { key: "flow_percent", label: "Flow", unit: "%", min: 50, max: 150, ph: "100" },
  { key: "speed_percent", label: "Speed", unit: "%", min: 20, max: 300, ph: "100" },
];

export interface CheckpointEditorProps {
  checkpoints: Checkpoint[];
  onChange: (checkpoints: Checkpoint[]) => void;
  /** Model height (mm), if known — used to show the ≈mm of each % checkpoint. */
  modelHeightMm?: number | null;
  disabled?: boolean;
}

/**
 * Edit the slice checkpoints — "from this height up, use these settings". Stack several to ramp
 * settings up the print. Lives in its own viewer tab next to Slice Preview.
 */
export function CheckpointEditor({ checkpoints, onChange, modelHeightMm, disabled }: CheckpointEditorProps) {
  const update = (i: number, patch: Partial<Checkpoint>) =>
    onChange(checkpoints.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => onChange(checkpoints.filter((_, j) => j !== i));
  const add = () => onChange([...checkpoints, { from_pct: 80, fan_percent: 100 } as Checkpoint]);
  const num = (e: React.ChangeEvent<HTMLInputElement>) =>
    e.target.value === "" ? undefined : Number(e.target.value);

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4">
      <div>
        <h3 className="text-sm font-semibold">Slice checkpoints</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          From a point in the print upward, change the settings — the layers below keep theirs. Anchor
          a checkpoint by % here, or scrub to a layer in the <span className="text-foreground">Slice
          Preview</span> and hit “+ Checkpoint here”. Stack several to ramp things up the print (e.g.
          drop the temp and max the fan near the top to kill heat-soak stringing). Blank fields are
          left unchanged.
        </p>
        <p className="mt-1 text-[11px] text-subtle-foreground">
          Retraction, walls and infill are baked into the toolpaths, so they can&apos;t change mid-print.
        </p>
      </div>

      {checkpoints.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-subtle-foreground">
          No checkpoints — the whole print uses the filament&apos;s settings. Add one to change things
          partway up.
        </p>
      ) : null}

      {checkpoints.map((cp, i) => {
        const byLayer = cp.from_layer != null;
        const mm = !byLayer && modelHeightMm ? ` ≈ ${(((cp.from_pct ?? 0) / 100) * modelHeightMm).toFixed(0)}mm` : "";
        return (
          <div key={i} className="space-y-3 rounded-lg border bg-elevated p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                <Flag className="h-3.5 w-3.5 text-primary" />
                {byLayer ? (
                  <>
                    From layer <span className="text-foreground">{cp.from_layer}</span> up
                  </>
                ) : (
                  <>
                    From <span className="text-foreground">{cp.from_pct}%</span> up{mm}
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled}
                aria-label="Remove checkpoint"
                className="text-subtle-foreground transition-colors hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {byLayer ? (
              <div className="flex items-center gap-2">
                <Label className="text-[11px] text-muted-foreground">Layer</Label>
                <Input
                  type="number"
                  min={1}
                  value={cp.from_layer ?? ""}
                  disabled={disabled}
                  onChange={(e) => update(i, { from_layer: e.target.value === "" ? 1 : Number(e.target.value) })}
                  className="h-8 w-24"
                />
                <span className="text-[11px] text-subtle-foreground">(set from the Slice Preview)</span>
              </div>
            ) : (
              <input
                type="range"
                min={5}
                max={98}
                step={1}
                value={cp.from_pct ?? 80}
                disabled={disabled}
                onChange={(e) => update(i, { from_pct: Number(e.target.value) })}
                className="w-full accent-primary"
              />
            )}
            <div className="grid grid-cols-3 gap-2">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    {f.label} {f.unit}
                  </Label>
                  <Input
                    type="number"
                    min={f.min}
                    max={f.max}
                    placeholder={f.ph}
                    disabled={disabled}
                    value={typeof cp[f.key] === "number" ? (cp[f.key] as number) : ""}
                    onChange={(e) => update(i, { [f.key]: num(e) } as Partial<Checkpoint>)}
                    className="h-8"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <Button variant="outline" size="sm" onClick={add} disabled={disabled} className="gap-1.5 self-start">
        <Plus className="h-3.5 w-3.5" />
        Add checkpoint
      </Button>
    </div>
  );
}
