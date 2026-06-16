"use client";

import * as React from "react";
import type { Printer, SettingsDescriptor } from "@agent-cad/types";
import { ChevronDown, Download, Loader2, Scissors } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
