"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { FilamentProfile, Printer } from "@agent-cad/types";
import { ArrowLeft, Plus, Pencil, Trash2, Flame, ThermometerSun, Gauge, ChevronRight, CirclePlus } from "lucide-react";

import * as api from "@/lib/api";
import { swatchColor } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { PrinterDialog } from "@/components/settings/printer-dialog";
import { FilamentDialog } from "@/components/settings/filament-dialog";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-elevated px-3 py-2">
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-subtle-foreground">{label}</div>
    </div>
  );
}

export default function PrinterDetailPage() {
  const { printerId } = useParams<{ printerId: string }>();
  const router = useRouter();
  const [printer, setPrinter] = React.useState<Printer | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setPrinter(await api.getPrinter(printerId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [printerId]);

  React.useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const editorHref = (fid: string) => `/settings/equipment/${printerId}/filaments/${fid}`;
  // Creating a profile drops you straight into its calibration editor to set the full settings.
  const onCreated = (fid: string) => router.push(editorHref(fid));

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }
  if (!printer) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const bv = printer.build_volume;

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-elevated text-muted-foreground">
            <Gauge className="h-6 w-6" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{printer.name}</h1>
              {printer.default ? (
                <span className="rounded-full bg-accent-muted px-2 py-0.5 text-[11px] text-accent-bright">Default</span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {printer.kind} · {printer.nozzle_diameter_mm} mm nozzle
            </p>
          </div>
        </div>
        <PrinterDialog
          mode="edit"
          printer={printer}
          onSaved={load}
          trigger={
            <Button variant="outline" size="sm" className="gap-2">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Build volume" value={`${bv.x}×${bv.y}×${bv.z}`} />
        <Stat label="Nozzle" value={`${printer.nozzle_diameter_mm} mm`} />
        <Stat label="Firmware" value={printer.firmware} />
        <Stat label="Profiles" value={String(printer.filaments.length)} />
      </div>

      <div className="space-y-3 border-t pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Filament profiles</h2>
            <p className="text-sm text-muted-foreground">
              Saved defaults per material — Agent CAD applies these automatically, so a chat never has to ask
              what temperature your PLA runs at.
            </p>
          </div>
          <FilamentDialog
            mode="create"
            printerId={printer.id}
            onSaved={onCreated}
            trigger={
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add filament
              </Button>
            }
          />
        </div>

        {printer.filaments.length === 0 ? (
          <FilamentDialog
            mode="create"
            printerId={printer.id}
            onSaved={onCreated}
            trigger={
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed bg-card/50 px-4 py-6 text-sm text-subtle-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                <CirclePlus className="h-4 w-4" />
                Add a filament profile
              </button>
            }
          />
        ) : (
          <div className="space-y-2">
            {printer.filaments.map((f) => (
              <FilamentRow key={f.id} printerId={printer.id} filament={f} href={editorHref(f.id)} onChanged={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilamentRow({
  printerId,
  filament,
  href,
  onChanged,
}: {
  printerId: string;
  filament: FilamentProfile;
  href: string;
  onChanged: () => void;
}) {
  const s = filament.settings ?? {};
  const meta = [filament.brand, filament.color].filter(Boolean).join(" · ");
  return (
    <Card className="flex items-center gap-4 p-3">
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-4">
        <span
          className="h-9 w-9 shrink-0 rounded-full border border-border-strong"
          style={{ background: swatchColor(filament.color) }}
        />
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {filament.material}
            {filament.name && filament.name !== filament.material ? (
              <span className="ml-2 text-xs font-normal text-subtle-foreground">{filament.name}</span>
            ) : null}
          </div>
          {meta ? <div className="truncate text-xs text-muted-foreground">{meta}</div> : null}
        </div>
        <div className="ml-auto hidden items-center gap-4 sm:flex">
          <Spec icon={Flame} value={s.nozzle_temp != null ? `${s.nozzle_temp}°C` : "—"} label="Nozzle" />
          <Spec icon={ThermometerSun} value={s.bed_temp != null ? `${s.bed_temp}°C` : "—"} label="Bed" />
          <Spec icon={Gauge} value={s.wall_speed != null ? `${s.wall_speed} mm/s` : "—"} label="Speed" />
        </div>
      </Link>
      <FilamentDialog
        mode="edit"
        printerId={printerId}
        filament={filament}
        onSaved={onChanged}
        trigger={
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Edit identity">
            <Pencil className="h-4 w-4" />
          </Button>
        }
      />
      <ConfirmDialog
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-danger"
            aria-label={`Delete ${filament.material}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        }
        title={`Delete ${filament.material}${filament.color ? ` · ${filament.color}` : ""}?`}
        description="This filament profile will be removed from the printer."
        confirmLabel="Delete filament"
        destructive
        onConfirm={async () => {
          await api.deleteFilament(printerId, filament.id);
          onChanged();
        }}
      />
      <ChevronRight className="h-4 w-4 shrink-0 text-subtle-foreground" />
    </Card>
  );
}

function Spec({ icon: Icon, value, label }: { icon: typeof Flame; value: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-right">
      <Icon className="h-3.5 w-3.5 text-subtle-foreground" />
      <div>
        <div className="text-xs font-medium tabular-nums">{value}</div>
        <div className="text-[10px] uppercase tracking-wide text-subtle-foreground">{label}</div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/settings/equipment"
      className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      All printers
    </Link>
  );
}
