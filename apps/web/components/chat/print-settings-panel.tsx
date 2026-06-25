"use client";

import * as React from "react";
import type { Printer, SettingsDescriptor } from "@agent-cad/types";
import { ChevronDown, Download, Loader2, Scissors } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsForm, type SettingsValues } from "@/components/settings/settings-form";
import { StatsRow } from "./stats-row";
import type { SliceStats } from "@/lib/chat";

/** The two knobs always shown on the compact panel; the rest hide behind "All settings". */
const COMPACT_KEYS = ["layer_height", "infill_density"];

export interface PrintSettingsPanelProps {
  printers: Printer[];
  printerId: string | null;
  filamentId: string | null;
  onPrinterChange: (id: string) => void;
  onFilamentChange: (id: string) => void;
  descriptor: SettingsDescriptor | null;
  values: SettingsValues;
  onValueChange: (key: string, value: unknown) => void;
  hasModel: boolean;
  slicing: boolean;
  onSlice: () => void;
  sliced: boolean;
  stats: SliceStats | null;
  onDownload?: () => void;
  className?: string;
}

/**
 * Compact print-settings panel under the viewer (FR-CHAT-6/7/8/9). Printer +
 * filament come from the registry; layer height + infill are always shown, the
 * full schema-driven SliceSettings hide behind "All settings". Slice is disabled
 * until a model exists; download enables after a successful slice.
 */
export function PrintSettingsPanel({
  printers,
  printerId,
  filamentId,
  onPrinterChange,
  onFilamentChange,
  descriptor,
  values,
  onValueChange,
  hasModel,
  slicing,
  onSlice,
  sliced,
  stats,
  onDownload,
  className,
}: PrintSettingsPanelProps) {
  const [showAll, setShowAll] = React.useState(false);
  const printer = printers.find((p) => p.id === printerId) ?? null;
  const filaments = printer?.filaments ?? [];

  return (
    <div className={cn("flex flex-col gap-4 rounded-xl border bg-card p-4", className)}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Printer</Label>
          <Select value={printerId ?? ""} onValueChange={onPrinterChange} disabled={!hasModel}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Printer" />
            </SelectTrigger>
            <SelectContent>
              {printers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Filament</Label>
          <Select
            value={filamentId ?? ""}
            onValueChange={onFilamentChange}
            disabled={!hasModel || filaments.length === 0}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Filament" />
            </SelectTrigger>
            <SelectContent>
              {filaments.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {descriptor ? (
        <>
          <SettingsForm
            descriptor={descriptor}
            values={values}
            onChange={onValueChange}
            only={COMPACT_KEYS}
            hideAdvanced
            disabled={!hasModel}
          />
          <div className="border-t pt-3">
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")} />
              All print settings
            </button>
            {showAll ? (
              <SettingsForm
                descriptor={descriptor}
                values={values}
                onChange={onValueChange}
                disabled={!hasModel}
                className="mt-3"
              />
            ) : null}
          </div>
          <CheckpointControl values={values} onChange={onValueChange} disabled={!hasModel} />
        </>
      ) : (
        <p className="text-xs text-subtle-foreground">Loading settings…</p>
      )}

      {sliced && stats ? <StatsRow stats={stats} /> : null}

      <div className="flex gap-2">
        <Button onClick={onSlice} disabled={!hasModel || slicing} className="flex-1 gap-2">
          {slicing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
          {sliced ? "Re-slice" : "Slice model"}
        </Button>
        {sliced && onDownload ? (
          <Button variant="outline" onClick={onDownload} className="gap-2">
            <Download className="h-4 w-4" />
            Download G-code
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Cooling checkpoint: above a chosen % of the print's height, change nozzle temp / fan — the
 * layers below keep their settings. Fixes heat-soak stringing near the top of tall prints.
 * Stored in the slice values as flat `checkpoint_*` keys (assembled by `buildCheckpoint`).
 */
function CheckpointControl({
  values,
  onChange,
  disabled,
}: {
  values: SettingsValues;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const from = values["checkpoint_from_pct"];
  const enabled = typeof from === "number";
  const fromPct = enabled ? (from as number) : 80;
  const temp = values["checkpoint_nozzle_temp"];
  const fan = values["checkpoint_fan_percent"];
  const num = (e: React.ChangeEvent<HTMLInputElement>) =>
    e.target.value === "" ? undefined : Number(e.target.value);

  return (
    <div className="border-t pt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label className="text-xs font-medium">
            Cooling checkpoint <span className="font-normal text-subtle-foreground">· tall prints</span>
          </Label>
          <p className="mt-0.5 text-[11px] text-subtle-foreground">
            Above a chosen height, drop the temp and/or blast the fan — the layers below keep their
            settings. Fixes stringing from heat soak near the top.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(on) => {
            if (on) {
              onChange("checkpoint_from_pct", 80);
              onChange("checkpoint_fan_percent", 100);
            } else {
              onChange("checkpoint_from_pct", undefined);
              onChange("checkpoint_nozzle_temp", undefined);
              onChange("checkpoint_fan_percent", undefined);
            }
          }}
        />
      </div>

      {enabled ? (
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              Apply above <span className="text-foreground">{fromPct}%</span> of the print height
            </Label>
            <input
              type="range"
              min={5}
              max={95}
              step={5}
              value={fromPct}
              disabled={disabled}
              onChange={(e) => onChange("checkpoint_from_pct", Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Nozzle temp °C</Label>
              <Input
                type="number"
                min={150}
                max={300}
                placeholder="e.g. 200"
                value={typeof temp === "number" ? temp : ""}
                disabled={disabled}
                onChange={(e) => onChange("checkpoint_nozzle_temp", num(e))}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Fan %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="100"
                value={typeof fan === "number" ? fan : ""}
                disabled={disabled}
                onChange={(e) => onChange("checkpoint_fan_percent", num(e))}
                className="h-8"
              />
            </div>
          </div>
          <p className="text-[11px] text-subtle-foreground">Leave a box blank to not change it.</p>
        </div>
      ) : null}
    </div>
  );
}
