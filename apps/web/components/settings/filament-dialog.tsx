"use client";

import * as React from "react";
import type { FilamentProfile, SliceSettings } from "@agent-cad/types";
import { Loader2 } from "lucide-react";

import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  return { id: "", name: "", material: "PLA", brand: "", color: "", settings: {}, default_settings: {} };
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
 * Create / rename a filament's **identity** only (name, material, brand, colour).
 * The full slice profile — every setting + the test prints — lives on the
 * Filament·Calibration editor; this dialog never touches `settings` on edit, so
 * a quick rename can't wipe a tuned profile.
 */
export function FilamentDialog({ mode, printerId, filament, trigger, onSaved }: FilamentDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FilamentProfile>(filament ?? blankFilament());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function onOpenChange(next: boolean) {
    if (busy) return;
    if (next) {
      setForm(filament ?? blankFilament());
      setError(null);
    }
    setOpen(next);
  }

  const valid = form.name.trim().length > 0 && form.material.trim().length > 0;
  const set = (patch: Partial<FilamentProfile>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        const seeded = materialDefaults(form.material);
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
          <DialogTitle>{mode === "create" ? "New filament profile" : "Edit details"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Name it and pick a material — you'll set the full slice profile next."
              : "Rename or recolour. Slice settings live on the calibration editor."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Generic PLA" autoFocus />
          </Field>
          <Field label="Material">
            <Input value={form.material} onChange={(e) => set({ material: e.target.value })} placeholder="PLA" />
          </Field>
          <Field label="Brand">
            <Input value={form.brand ?? ""} onChange={(e) => set({ brand: e.target.value })} placeholder="Optional" />
          </Field>
          <Field label="Color">
            <Input value={form.color ?? ""} onChange={(e) => set({ color: e.target.value })} placeholder="Optional" />
          </Field>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}

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
