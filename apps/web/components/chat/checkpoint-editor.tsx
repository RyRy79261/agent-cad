"use client";

import * as React from "react";
import type { Checkpoint } from "@agent-cad/types";
import { Flag, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { checkpointSeed, CHECKPOINT_COLORS } from "@/lib/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The mid-print-changeable settings, in display order. (Retraction/walls/infill can't change
 *  mid-print — they're baked into the toolpaths — so they're not here.) */
const FIELDS: { key: keyof Checkpoint; label: string; unit: string; min: number; max: number; ph: string }[] = [
  { key: "nozzle_temp", label: "Nozzle", unit: "°C", min: 150, max: 300, ph: "200" },
  { key: "bed_temp", label: "Bed", unit: "°C", min: 0, max: 120, ph: "60" },
  { key: "fan_percent", label: "Fan", unit: "%", min: 0, max: 100, ph: "100" },
  { key: "flow_percent", label: "Flow", unit: "%", min: 50, max: 150, ph: "100" },
  { key: "speed_percent", label: "Speed", unit: "%", min: 20, max: 300, ph: "100" },
  { key: "jerk", label: "Jerk", unit: "mm/s", min: 1, max: 40, ph: "8" },
  { key: "accel", label: "Accel", unit: "mm/s²", min: 100, max: 10000, ph: "500" },
];

export interface CheckpointEditorProps {
  checkpoints: Checkpoint[];
  onChange: (checkpoints: Checkpoint[]) => void;
  /** Current print settings a new checkpoint seeds from (so it starts filled, not blank). */
  newDefaults?: Partial<Checkpoint>;
  /** Total layers in the latest slice — bounds the layer picker (null until sliced once). */
  layerCount?: number | null;
  /** Model height (mm), if known — used to show the ≈mm of each % checkpoint. */
  modelHeightMm?: number | null;
  disabled?: boolean;
}

/**
 * Edit the slice checkpoints — "from this height up, use these settings". Stack several to ramp
 * settings up the print. Lives in its own viewer tab next to Slice Preview.
 */
export function CheckpointEditor({
  checkpoints,
  onChange,
  newDefaults,
  layerCount,
  modelHeightMm,
  disabled,
}: CheckpointEditorProps) {
  const update = (i: number, patch: Partial<Checkpoint>) =>
    onChange(checkpoints.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => onChange(checkpoints.filter((_, j) => j !== i));
  // A new checkpoint inherits the previous one's settings (or the print's base settings if first),
  // but gets a fresh distinct colour so its band is easy to tell apart in the slice preview.
  const add = () =>
    onChange([
      ...checkpoints,
      {
        ...checkpointSeed(checkpoints, newDefaults ?? {}),
        from_pct: 80,
        color: CHECKPOINT_COLORS[checkpoints.length % CHECKPOINT_COLORS.length],
      } as Checkpoint,
    ]);
  // Parse + clamp at the editor boundary: `min`/`max` on a number input don't block typed
  // out-of-range values, and intermediate edits can be NaN — both would 422 on the next slice.
  const fieldNum = (e: React.ChangeEvent<HTMLInputElement>, min: number, max: number) => {
    if (e.target.value === "") return undefined;
    const v = Number(e.target.value);
    return Number.isNaN(v) ? undefined : clamp(v, min, max);
  };

  // Switch a checkpoint's anchor between % of height and a layer number, converting the value.
  const setAnchorPct = (i: number, cp: Checkpoint) => {
    const pct = layerCount && cp.from_layer ? clamp(Math.round((cp.from_layer / layerCount) * 100), 1, 100) : 80;
    update(i, { from_pct: pct, from_layer: undefined });
  };
  const setAnchorLayer = (i: number, cp: Checkpoint) => {
    if (!layerCount) return;
    const layer = clamp(Math.round(((cp.from_pct ?? 80) / 100) * layerCount), 1, layerCount);
    update(i, { from_layer: layer, from_pct: undefined });
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4">
      <div>
        <h3 className="text-sm font-semibold">Slice checkpoints</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          From a point in the print upward, change the settings — the layers below keep theirs. Anchor
          each checkpoint by % of height or a layer number, and a new checkpoint continues from the
          previous one’s settings. (You can also scrub to a layer in the{" "}
          <span className="text-foreground">Slice Preview</span> and hit “+ Checkpoint here”.) Stack
          several to ramp things up the print — e.g. drop the temp and max the fan near the top to kill
          heat-soak stringing. Blank fields are left unchanged.
        </p>
        <p className="mt-1 text-[11px] text-subtle-foreground">
          These are everything the printer can change <span className="text-foreground">mid-print</span>
          (temperature, cooling, flow, speed, motion). The rest — walls, infill, layer height,
          retraction, seam, supports, brim — are baked into the toolpaths when slicing, so they apply
          to the whole print; set those in the print-settings panel.
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
                <Flag className="h-3.5 w-3.5" style={{ color: cp.color ?? "var(--primary)" }} />
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
            {/* Anchor: % of height, or a layer number bounded by the real layer count. */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="inline-flex overflow-hidden rounded-md border text-[11px]">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setAnchorPct(i, cp)}
                    className={cn(
                      "px-2 py-1",
                      !byLayer ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    % height
                  </button>
                  <button
                    type="button"
                    disabled={disabled || !layerCount}
                    title={!layerCount ? "Slice once to pick by layer" : undefined}
                    onClick={() => setAnchorLayer(i, cp)}
                    className={cn(
                      "border-l px-2 py-1 disabled:opacity-40",
                      byLayer ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Layer
                  </button>
                </div>
                {byLayer && layerCount ? (
                  <span className="text-[11px] text-subtle-foreground">of {layerCount} layers</span>
                ) : null}
              </div>

              {byLayer ? (
                <Input
                  type="number"
                  min={1}
                  max={layerCount ?? undefined}
                  value={cp.from_layer ?? ""}
                  disabled={disabled}
                  onChange={(e) => {
                    const v = e.target.value === "" ? 1 : Number(e.target.value);
                    update(i, { from_layer: layerCount ? clamp(v, 1, layerCount) : Math.max(1, v) });
                  }}
                  className="h-8 w-28"
                />
              ) : (
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={cp.from_pct ?? 80}
                  disabled={disabled}
                  onChange={(e) => update(i, { from_pct: Number(e.target.value) })}
                  className="w-full accent-primary"
                />
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Band colour</span>
              {CHECKPOINT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={disabled}
                  onClick={() => update(i, { color: c })}
                  aria-label={`Use colour ${c}`}
                  style={{ background: c }}
                  className={cn(
                    "h-4 w-4 rounded-full border border-black/20 transition-transform hover:scale-110",
                    cp.color === c ? "ring-2 ring-foreground ring-offset-1 ring-offset-elevated" : "",
                  )}
                />
              ))}
            </div>

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
                    onChange={(e) => update(i, { [f.key]: fieldNum(e, f.min, f.max) } as Partial<Checkpoint>)}
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
