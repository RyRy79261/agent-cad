"use client";

import * as React from "react";
import Link from "next/link";
import type { Printer } from "@agent-cad/types";
import { Plus, Printer as PrinterIcon, Star, Trash2, ChevronRight } from "lucide-react";

import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsSection } from "@/components/settings/section";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { PrinterDialog } from "@/components/settings/printer-dialog";

export default function EquipmentPage() {
  const [printers, setPrinters] = React.useState<Printer[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setPrinters(await api.listPrinters());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  React.useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function setDefault(p: Printer) {
    await api.updatePrinter(p.id, { ...p, default: true });
    await load();
  }

  return (
    <SettingsSection
      title="Equipment"
      description="Your printers and their filament profiles. The default printer drives the fit check."
      action={
        <PrinterDialog
          mode="create"
          onSaved={load}
          trigger={
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Add printer
            </Button>
          }
        />
      }
    >
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {printers === null ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="space-y-3">
          {printers.map((p) => (
            <Card key={p.id} className="flex items-center gap-4 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-elevated text-muted-foreground">
                <PrinterIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  {p.default ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-muted px-2 py-0.5 text-[11px] text-accent-bright">
                      <Star className="h-3 w-3" />
                      Default
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.kind} · {p.build_volume.x}×{p.build_volume.y}×{p.build_volume.z} mm ·{" "}
                  {p.filaments.length} profile{p.filaments.length === 1 ? "" : "s"}
                </div>
              </div>
              {!p.default ? (
                <Button variant="ghost" size="sm" onClick={() => setDefault(p)}>
                  Set default
                </Button>
              ) : null}
              <ConfirmDialog
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-danger"
                    disabled={printers.length <= 1}
                    aria-label={`Delete ${p.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
                title={`Delete ${p.name}?`}
                description="The printer and its filament profiles will be removed."
                confirmLabel="Delete printer"
                destructive
                onConfirm={async () => {
                  await api.deletePrinter(p.id);
                  await load();
                }}
              />
              <Button variant="outline" size="sm" asChild className="gap-1">
                <Link href={`/settings/equipment/${p.id}`}>
                  Manage
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </Card>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
