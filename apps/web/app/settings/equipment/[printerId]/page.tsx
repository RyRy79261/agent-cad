"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { FilamentProfile, Printer } from "@agent-cad/types";
import { ArrowLeft, Plus, Pencil, Trash2, Droplet } from "lucide-react";

import * as api from "@/lib/api";
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
  const params = useParams<{ printerId: string }>();
  const printerId = params.printerId;
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
        <div>
          <h1 className="text-xl font-semibold">{printer.name}</h1>
          <p className="text-sm text-muted-foreground">{printer.kind}</p>
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
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Filament profiles</h2>
          <FilamentDialog
            mode="create"
            printerId={printer.id}
            onSaved={load}
            trigger={
              <Button size="sm" variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Add filament
              </Button>
            }
          />
        </div>

        {printer.filaments.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-card/50 px-4 py-6 text-center text-sm text-subtle-foreground">
            No filament profiles yet.
          </p>
        ) : (
          <div className="space-y-2">
            {printer.filaments.map((f) => (
              <FilamentRow key={f.id} printerId={printer.id} filament={f} onChanged={load} />
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
  onChanged,
}: {
  printerId: string;
  filament: FilamentProfile;
  onChanged: () => void;
}) {
  const s = filament.settings ?? {};
  const meta = [filament.brand, filament.color].filter(Boolean).join(" · ");
  return (
    <Card className="flex items-center gap-4 p-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-elevated text-muted-foreground">
        <Droplet className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          {filament.name}
          <span className="ml-2 text-xs font-normal text-subtle-foreground">{filament.material}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {meta ? `${meta} · ` : ""}
          {s.nozzle_temp ?? "—"}°/{s.bed_temp ?? "—"}° · {s.wall_speed ?? "—"} mm/s
        </div>
      </div>
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/settings/equipment/${printerId}/filaments/${filament.id}`}>Tune</Link>
      </Button>
      <FilamentDialog
        mode="edit"
        printerId={printerId}
        filament={filament}
        onSaved={onChanged}
        trigger={
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Edit filament">
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
            aria-label={`Delete ${filament.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        }
        title={`Delete ${filament.name}?`}
        description="This filament profile will be removed from the printer."
        confirmLabel="Delete filament"
        destructive
        onConfirm={async () => {
          await api.deleteFilament(printerId, filament.id);
          onChanged();
        }}
      />
    </Card>
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
