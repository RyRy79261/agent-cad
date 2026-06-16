"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { FilamentProfile, Printer, SettingsDescriptor } from "@agent-cad/types";
import { ArrowLeft, Box, Loader2, RotateCcw, Ship, Download } from "lucide-react";

import * as api from "@/lib/api";
import { buildSliceSettings, isDirty } from "@/lib/chat";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsForm, type SettingsValues } from "@/components/settings/settings-form";

/**
 * Filament · Calibration editor (SCR-022/025). Edit the filament's full slice
 * profile (descriptor-driven), Save / Cancel / reset to Original, then "Slice &
 * download" a calibration cube or Benchy at the saved settings — deliberately
 * simple: no wizard, the AI chat is the expert.
 */
export default function FilamentEditorPage() {
  const params = useParams<{ printerId: string; filamentId: string }>();
  const { printerId, filamentId } = params;

  const [printer, setPrinter] = React.useState<Printer | null>(null);
  const [filament, setFilament] = React.useState<FilamentProfile | null>(null);
  const [descriptor, setDescriptor] = React.useState<SettingsDescriptor | null>(null);
  const [values, setValues] = React.useState<SettingsValues>({});
  const [saving, setSaving] = React.useState(false);
  const [calibrating, setCalibrating] = React.useState<"cube" | "benchy" | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [p, d] = await Promise.all([
        api.getPrinter(printerId),
        api.getSettingsDescriptor(printerId, filamentId),
      ]);
      const fil = p.filaments.find((f) => f.id === filamentId) ?? null;
      setPrinter(p);
      setFilament(fil);
      setDescriptor(d);
      setValues({ ...(fil?.settings ?? {}) });
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
  const onValueChange = (key: string, value: unknown) => {
    setNote(null);
    setValues((v) => ({ ...v, [key]: value }));
  };

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
    setValues({ ...(filament?.default_settings ?? {}) });
    setNote("Reset to the committed-profile values — Save to keep.");
  }

  async function calibrate(target: "cube" | "benchy") {
    setCalibrating(target);
    setError(null);
    setNote(null);
    try {
      const job = await api.runJob(() => api.calibrate({ target, printer_id: printerId, filament_id: filamentId }));
      if (job.status !== "succeeded") {
        throw new Error(job.error || `${target} slice ${job.status}`);
      }
      const url = (job.result?.gcode_url as string | undefined) ?? undefined;
      if (url) {
        window.open(api.assetUrl(url), "_blank");
        setNote(`${target === "cube" ? "Cube" : "Benchy"} sliced — downloading g-code.`);
      } else {
        setNote(`${target} sliced but no g-code URL was returned.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCalibrating(null);
    }
  }

  if (error && !printer) {
    return (
      <div className="space-y-4">
        <BackLink printerId={printerId} />
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  if (!printer || !filament || !descriptor) {
    return (
      <div className="space-y-4">
        <BackLink printerId={printerId} />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink printerId={printerId} />

      {/* Calib context header (FR-HDR-1) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div>
          <h1 className="text-lg font-semibold">
            {filament.name} <span className="text-sm font-normal text-subtle-foreground">on {printer.name}</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            {printer.kind} · {printer.nozzle_diameter_mm} mm nozzle · {printer.build_volume.x}×
            {printer.build_volume.y}×{printer.build_volume.z} mm
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={resetToOriginal} className="gap-2 text-muted-foreground">
          <RotateCcw className="h-4 w-4" />
          Original
        </Button>
      </div>

      {note ? <p className="text-sm text-success">{note}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Card className="p-5">
        <SettingsForm descriptor={descriptor} values={values} onChange={onValueChange} />
      </Card>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save changes
        </Button>
        <Button variant="outline" onClick={cancel} disabled={!dirty || saving}>
          Cancel
        </Button>
      </div>

      {/* Test prints — slice & download at the saved settings */}
      <div className="space-y-3 border-t pt-5">
        <div>
          <h2 className="text-sm font-semibold">Test prints</h2>
          <p className="text-xs text-muted-foreground">
            Slice a reference object at this filament&apos;s saved settings and download the g-code.
            {dirty ? " Save your changes first." : ""}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TestCard
            icon={Box}
            title="Calibration cube"
            body="20 mm cube — dimensional accuracy."
            busy={calibrating === "cube"}
            disabled={dirty || calibrating !== null}
            onClick={() => calibrate("cube")}
          />
          <TestCard
            icon={Ship}
            title="3DBenchy"
            body="The classic torture test."
            busy={calibrating === "benchy"}
            disabled={dirty || calibrating !== null}
            onClick={() => calibrate("benchy")}
          />
        </div>
      </div>
    </div>
  );
}

function TestCard({
  icon: Icon,
  title,
  body,
  busy,
  disabled,
  onClick,
}: {
  icon: typeof Box;
  title: string;
  body: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-elevated text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-subtle-foreground">{body}</div>
        </div>
      </div>
      <Button size="sm" variant="outline" className="gap-2" disabled={disabled} onClick={onClick}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Slice &amp; download
      </Button>
    </Card>
  );
}

function BackLink({ printerId }: { printerId: string }) {
  return (
    <Link
      href={`/settings/equipment/${printerId}`}
      className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to printer
    </Link>
  );
}
