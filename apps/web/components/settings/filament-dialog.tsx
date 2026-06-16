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

function blankFilament(): FilamentProfile {
  return {
    id: "",
    name: "",
    material: "PLA",
    brand: "",
    color: "",
    settings: { nozzle_temp: 210, bed_temp: 60, wall_speed: 25, flow: 0.95 },
    default_settings: { nozzle_temp: 210, bed_temp: 60, wall_speed: 25, flow: 0.95 },
  };
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
 * Create / edit a filament's identity + the headline slice values (FR-PD-1). The
 * full descriptor-driven SliceSettings editor (the Calibration screen) is SCR-022.
 */
export function FilamentDialog({ mode, printerId, filament, trigger, onSaved }: FilamentDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FilamentProfile>(filament ?? blankFilament());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function onOpenChange(next: boolean) {
    if (busy) return;
    if (next) {
      // Re-seed the form each time the dialog opens.
      setForm(filament ?? blankFilament());
      setError(null);
    }
    setOpen(next);
  }

  const valid = form.name.trim().length > 0;
  const s = (form.settings ?? {}) as SliceSettings;

  const setSetting = (key: keyof SliceSettings, v: number) =>
    setForm((f) => ({ ...f, settings: { ...f.settings, [key]: v } }));

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const body: FilamentProfile = {
        ...form,
        id: form.id || slug(form.name),
        // First save establishes the committed baseline used by the "Original" toggle (§3.8).
        default_settings: mode === "create" ? form.settings : form.default_settings,
      };
      if (mode === "create") await api.createFilament(printerId, body);
      else await api.updateFilament(printerId, body.id, body);
      setOpen(false);
      onSaved(body.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const set = (patch: Partial<FilamentProfile>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add filament" : "Edit filament"}</DialogTitle>
          <DialogDescription>Headline values; tune the full profile from the calibration editor.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="PLA" />
            </Field>
            <Field label="Material">
              <Input value={form.material} onChange={(e) => set({ material: e.target.value })} />
            </Field>
            <Field label="Brand">
              <Input value={form.brand ?? ""} onChange={(e) => set({ brand: e.target.value })} />
            </Field>
            <Field label="Color">
              <Input value={form.color ?? ""} onChange={(e) => set({ color: e.target.value })} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t pt-3">
            <Field label="Nozzle temp (°C)">
              <Input
                type="number"
                value={s.nozzle_temp ?? 210}
                onChange={(e) => setSetting("nozzle_temp", Number(e.target.value))}
              />
            </Field>
            <Field label="Bed temp (°C)">
              <Input
                type="number"
                value={s.bed_temp ?? 60}
                onChange={(e) => setSetting("bed_temp", Number(e.target.value))}
              />
            </Field>
            <Field label="Print speed (mm/s)">
              <Input
                type="number"
                value={s.wall_speed ?? 25}
                onChange={(e) => setSetting("wall_speed", Number(e.target.value))}
              />
            </Field>
            <Field label="Flow (×)">
              <Input
                type="number"
                step={0.01}
                value={s.flow ?? 0.95}
                onChange={(e) => setSetting("flow", Number(e.target.value))}
              />
            </Field>
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "create" ? "Add filament" : "Save changes"}
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
