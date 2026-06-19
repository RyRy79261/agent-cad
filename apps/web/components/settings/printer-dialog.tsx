"use client";

import * as React from "react";
import type { Printer } from "@agent-cad/types";
import { Loader2 } from "lucide-react";

import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function blankPrinter(): Printer {
  return {
    id: "",
    name: "",
    kind: "FDM",
    build_volume: { x: 220, y: 220, z: 280 },
    nozzle_diameter_mm: 0.4,
    firmware: { name: "Marlin (stock)", linear_advance: false, input_shaping: false, arc_moves: false },
    bed_margin_mm: 5,
    default: false,
    filaments: [],
  };
}

export interface PrinterDialogProps {
  mode: "create" | "edit";
  printer?: Printer;
  trigger: React.ReactNode;
  onSaved: () => void;
}

/** Create / edit a printer (name, build volume>0, nozzle, firmware, bed margin, set-default; FR-EQ-2). */
export function PrinterDialog({ mode, printer, trigger, onSaved }: PrinterDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<Printer>(printer ?? blankPrinter());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function onOpenChange(next: boolean) {
    if (busy) return;
    if (next) {
      // Re-seed the form each time the dialog opens.
      setForm(printer ?? blankPrinter());
      setError(null);
    }
    setOpen(next);
  }

  const bv = form.build_volume;
  const valid =
    form.name.trim().length > 0 && bv.x > 0 && bv.y > 0 && bv.z > 0 && form.nozzle_diameter_mm > 0;

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") await api.createPrinter(form);
      else await api.updatePrinter(form.id, form);
      setOpen(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const set = (patch: Partial<Printer>) => setForm((f) => ({ ...f, ...patch }));
  const setBv = (axis: "x" | "y" | "z", v: number) =>
    setForm((f) => ({ ...f, build_volume: { ...f.build_volume, [axis]: v } }));
  const setFw = (patch: Partial<Printer["firmware"]>) =>
    setForm((f) => ({ ...f, firmware: { ...f.firmware, ...patch } }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add printer" : "Edit printer"}</DialogTitle>
          <DialogDescription>Build-volume and nozzle drive the printability fit check.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="My printer" />
          </Field>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Build volume (mm)</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["x", "y", "z"] as const).map((axis) => (
                <Input
                  key={axis}
                  type="number"
                  value={bv[axis]}
                  min={1}
                  onChange={(e) => setBv(axis, Number(e.target.value))}
                  aria-label={axis.toUpperCase()}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nozzle (mm)">
              <Input
                type="number"
                step={0.1}
                value={form.nozzle_diameter_mm}
                onChange={(e) => set({ nozzle_diameter_mm: Number(e.target.value) })}
              />
            </Field>
            <Field label="Bed margin (mm)">
              <Input
                type="number"
                value={form.bed_margin_mm}
                onChange={(e) => set({ bed_margin_mm: Number(e.target.value) })}
              />
            </Field>
          </div>

          <div className="space-y-2.5 rounded-lg border border-border-strong p-3">
            <Field label="Firmware">
              <Input
                value={form.firmware.name}
                onChange={(e) => setFw({ name: e.target.value })}
                placeholder="Marlin (stock)"
              />
            </Field>
            <p className="text-[11px] text-muted-foreground">
              Tell the app what your firmware supports — calibrations needing a capability it lacks are hidden.
            </p>
            <Capability
              label="Linear Advance (Pressure Advance)"
              hint="M900 K — stock Creality Marlin doesn't have it"
              checked={form.firmware.linear_advance}
              onChange={(v) => setFw({ linear_advance: v })}
            />
            <Capability
              label="Input shaping"
              hint="M593 — ringing / resonance compensation"
              checked={form.firmware.input_shaping}
              onChange={(v) => setFw({ input_shaping: v })}
            />
            <Capability
              label="Arc moves (G2/G3)"
              hint="ARC_SUPPORT — smoother curves, smaller g-code"
              checked={form.firmware.arc_moves}
              onChange={(v) => setFw({ arc_moves: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-sm">Set as default printer</Label>
            <Switch checked={form.default} onCheckedChange={(v) => set({ default: v })} />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "create" ? "Add printer" : "Save changes"}
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

function Capability({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
