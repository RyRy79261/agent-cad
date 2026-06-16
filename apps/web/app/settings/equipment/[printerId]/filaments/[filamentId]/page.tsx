"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { FilamentProfile, Printer, SettingsDescriptor } from "@agent-cad/types";
import { ChevronRight, Box, Ship, Info, Loader2, ArrowRight, Pencil } from "lucide-react";

import * as api from "@/lib/api";
import { buildSliceSettings, isDirty, sameSettings } from "@/lib/chat";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsForm, type SettingsValues } from "@/components/settings/settings-form";
import { CalibContextHeader } from "@/components/settings/calib-context-header";
import { FilamentDialog } from "@/components/settings/filament-dialog";

/**
 * Filament · Calibration editor (design: "Settings · Filament · Calibration").
 * Context header + an editable, schema-driven Slice-settings form (the full
 * descriptor — every available setting, not a hand-picked few) + Save/Cancel,
 * then two Test-print cards (cube / Benchy) that open the Result screens. Stays
 * simple — no tuning wizard.
 */
export default function FilamentCalibrationPage() {
  const { printerId, filamentId } = useParams<{ printerId: string; filamentId: string }>();

  const [printer, setPrinter] = React.useState<Printer | null>(null);
  const [filament, setFilament] = React.useState<FilamentProfile | null>(null);
  const [descriptor, setDescriptor] = React.useState<SettingsDescriptor | null>(null);
  const [values, setValues] = React.useState<SettingsValues>({});
  const [benchyAvailable, setBenchyAvailable] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [p, d, samples] = await Promise.all([
        api.getPrinter(printerId),
        api.getSettingsDescriptor(printerId, filamentId),
        api.getSamples().catch(() => []),
      ]);
      const fil = p.filaments.find((f) => f.id === filamentId) ?? null;
      setPrinter(p);
      setFilament(fil);
      setDescriptor(d);
      setValues({ ...(fil?.settings ?? {}) });
      setBenchyAvailable(samples.find((s) => s.name === "benchy")?.available ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [printerId, filamentId]);

  React.useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const dirty = isDirty(descriptor, values);
  const isOriginal = filament ? sameSettings(values, (filament.default_settings ?? {}) as Record<string, unknown>) : true;

  function onValueChange(key: string, value: unknown) {
    setNote(null);
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function save() {
    if (!descriptor || !filament) return;
    setSaving(true);
    setError(null);
    try {
      const settings = buildSliceSettings(descriptor, values);
      await api.updateFilament(printerId, filamentId, { ...filament, settings });
      setNote("Saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setValues({ ...(filament?.settings ?? {}) });
    setNote(null);
  }

  function resetToOriginal() {
    setValues({ ...((filament?.default_settings ?? {}) as Record<string, unknown>) });
    setNote("Reverted to the committed-profile values — Save to keep.");
  }

  if (error && !printer) {
    return (
      <div className="space-y-4">
        <Breadcrumb printerId={printerId} printerName="" filamentName="" />
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }
  if (!printer || !filament || !descriptor) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Breadcrumb printerId={printerId} printerName={printer.name} filamentName={`${filament.material}${filament.color ? ` · ${filament.color}` : ""}`} />
        <FilamentDialog
          mode="edit"
          printerId={printerId}
          filament={filament}
          onSaved={() => void load()}
          trigger={
            <Button variant="ghost" size="sm" className="shrink-0 gap-2 text-muted-foreground">
              <Pencil className="h-4 w-4" />
              Edit details
            </Button>
          }
        />
      </div>
      <CalibContextHeader printer={printer} filament={filament} isOriginal={isOriginal} onResetOriginal={resetToOriginal} />

      {note ? <p className="text-sm text-success">{note}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {/* Slice settings */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Slice settings</h2>
          <p className="text-sm text-muted-foreground">
            Edit the values used to slice this filament&apos;s test prints, then save your changes.
          </p>
        </div>
        <Card className="p-5">
          <SettingsForm descriptor={descriptor} values={values} onChange={onValueChange} />
        </Card>
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-subtle-foreground">
            <Info className="h-3.5 w-3.5" />
            Changes apply to this filament&apos;s test prints and future slices.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={cancel} disabled={!dirty || saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        </div>
      </section>

      {/* Test prints */}
      <section className="space-y-3 border-t pt-5">
        <div>
          <h2 className="text-base font-semibold">Test prints</h2>
          <p className="text-sm text-muted-foreground">
            Two standard reference objects you can slice with the settings above and print to check the result.
            {dirty ? " Save your changes first." : ""}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TestCard
            printerId={printerId}
            filamentId={filamentId}
            target="cube"
            icon={Box}
            title="Calibration cube"
            body="A 20 mm XYZ cube — a quick dimensional and surface-quality check."
            disabled={dirty}
          />
          <TestCard
            printerId={printerId}
            filamentId={filamentId}
            target="benchy"
            icon={Ship}
            title="3DBenchy"
            body="The classic torture test — overhangs, bridging, and fine surface detail."
            disabled={dirty || !benchyAvailable}
            disabledHint={!benchyAvailable ? "Benchy asset unavailable" : undefined}
          />
        </div>
      </section>
    </div>
  );
}

function TestCard({
  printerId,
  filamentId,
  target,
  icon: Icon,
  title,
  body,
  disabled,
  disabledHint,
}: {
  printerId: string;
  filamentId: string;
  target: "cube" | "benchy";
  icon: typeof Box;
  title: string;
  body: string;
  disabled: boolean;
  disabledHint?: string;
}) {
  const href = `/settings/equipment/${printerId}/filaments/${filamentId}/calibrate/${target}`;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-elevated text-muted-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-subtle-foreground">{body}</div>
        </div>
      </div>
      {disabled ? (
        <Button size="sm" variant="outline" className="gap-2" disabled>
          {disabledHint ?? "Slice"}
        </Button>
      ) : (
        <Button size="sm" variant="outline" className="gap-2" asChild>
          <Link href={href}>
            Slice
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      )}
    </Card>
  );
}

function Breadcrumb({
  printerId,
  printerName,
  filamentName,
}: {
  printerId: string;
  printerName: string;
  filamentName: string;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-xs text-subtle-foreground">
      <Link href="/settings/equipment" className="hover:text-foreground">
        Equipment
      </Link>
      <ChevronRight className="h-3.5 w-3.5" />
      <Link href={`/settings/equipment/${printerId}`} className="hover:text-foreground">
        {printerName || "Printer"}
      </Link>
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="text-muted-foreground">{filamentName || "Filament"}</span>
    </nav>
  );
}
