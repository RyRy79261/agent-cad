"use client";

import * as React from "react";
import type { FilamentPreset, FilamentProfile, SliceSettings } from "@agent-cad/types";
import { Loader2 } from "lucide-react";

import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "filament";
const CUSTOM = "__custom__"; // sentinel for "author my own" in the preset picker

/** Sensible starting slice values per material — the editor refines from here. */
const PLA_DEFAULTS: SliceSettings = { nozzle_temp: 210, bed_temp: 60, wall_speed: 25, flow: 0.95 };
const MATERIAL_DEFAULTS: Record<string, SliceSettings> = {
  PLA: PLA_DEFAULTS,
  PETG: { nozzle_temp: 240, bed_temp: 80, wall_speed: 30, flow: 0.95 },
  ABS: { nozzle_temp: 245, bed_temp: 100, wall_speed: 30, flow: 0.95 },
  ASA: { nozzle_temp: 245, bed_temp: 100, wall_speed: 30, flow: 0.95 },
  TPU: { nozzle_temp: 220, bed_temp: 50, wall_speed: 20, flow: 1.0 },
};
const materialDefaults = (material: string): SliceSettings =>
  MATERIAL_DEFAULTS[material.toUpperCase().replace(/[^A-Z]/g, "")] ?? PLA_DEFAULTS;

function blankFilament(): FilamentProfile {
  return { id: "", name: "", material: "PLA", brand: "", color: "", base_preset: null, settings: {}, default_settings: {} };
}

export interface FilamentDialogProps {
  mode: "create" | "edit";
  printerId: string;
  filament?: FilamentProfile;
  trigger: React.ReactNode;
  /** Called after a successful save with the saved filament's id (so create can route to the editor). */
  onSaved: (filamentId: string) => void;
}

/**
 * Create / rename a filament's **identity**. On create you pick from your installed
 * OrcaSlicer's filament presets (real names — "Creality Generic PETG") and add a colour
 * label, or author a custom one. The full slice profile + test prints live on the
 * Filament·Calibration editor; edit here never touches `settings`, so a rename can't wipe
 * a tuned profile.
 */
export function FilamentDialog({ mode, printerId, filament, trigger, onSaved }: FilamentDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FilamentProfile>(filament ?? blankFilament());
  const [presets, setPresets] = React.useState<FilamentPreset[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load the installed slicer's compatible presets when opening a create dialog.
  React.useEffect(() => {
    if (!open || mode !== "create") return;
    void (async () => {
      try {
        setPresets(await api.listFilamentPresets(printerId));
      } catch {
        setPresets([]); // no slicer / no mapping → custom-only, silently
      }
    })();
  }, [open, mode, printerId]);

  function onOpenChange(next: boolean) {
    if (busy) return;
    if (next) {
      setForm(filament ?? blankFilament());
      setError(null);
    }
    setOpen(next);
  }

  const isCustom = !form.base_preset;
  const valid = form.name.trim().length > 0 && form.material.trim().length > 0;
  const set = (patch: Partial<FilamentProfile>) => setForm((f) => ({ ...f, ...patch }));

  function pickPreset(value: string) {
    if (value === CUSTOM) {
      set({ base_preset: null });
      return;
    }
    const p = presets.find((x) => x.id === value);
    if (!p) return;
    // Adopt the preset: its name (editable, e.g. append a colour) + material + base.
    set({ base_preset: p.id, name: p.name, material: p.material ?? form.material });
  }

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        // A preset drives temps/flow/cooling itself, so keep its overrides empty; a custom
        // filament seeds sensible per-material starting values for the editor.
        const seeded = form.base_preset ? {} : materialDefaults(form.material);
        const body: FilamentProfile = {
          ...form,
          id: form.id || slug(form.name),
          settings: seeded,
          default_settings: seeded, // the committed baseline / "Original"
        };
        await api.createFilament(printerId, body);
        setOpen(false);
        onSaved(body.id);
      } else {
        // Identity-only edit: keep the existing settings + default_settings untouched.
        await api.updateFilament(printerId, form.id, form);
        setOpen(false);
        onSaved(form.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New filament" : "Edit details"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Pick one of your slicer's filaments (or go custom), then add a colour label."
              : "Rename or recolour. Slice settings live on the calibration editor."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {mode === "create" ? (
            <Field label="Filament">
              <Select value={form.base_preset ?? CUSTOM} onValueChange={pickPreset}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a filament preset" />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.material ? ` · ${p.material}` : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>Custom filament…</SelectItem>
                </SelectContent>
              </Select>
              {presets.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No slicer presets found — you can still create a custom filament below.
                </p>
              ) : null}
            </Field>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="e.g. Creality Generic PETG · Black"
                autoFocus={mode === "edit"}
              />
            </Field>
            <Field label="Colour (label)">
              <Input value={form.color ?? ""} onChange={(e) => set({ color: e.target.value })} placeholder="Black" />
            </Field>
          </div>

          {isCustom ? (
            <Field label="Material">
              <Input
                value={form.material}
                onChange={(e) => set({ material: e.target.value })}
                placeholder="PLA / PETG / ABS…"
              />
            </Field>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Based on <span className="text-foreground">{form.base_preset}</span> ({form.material}) from your slicer —
              its temps, cooling and flow are used when slicing.
            </p>
          )}

          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "create" ? "Create & edit" : "Save details"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
