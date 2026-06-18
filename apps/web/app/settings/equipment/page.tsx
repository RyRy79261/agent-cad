"use client";

import * as React from "react";
import Link from "next/link";
import type { Printer } from "@agent-cad/types";
import { Plus, Printer as PrinterIcon, Star, Info, MoreHorizontal, ChevronRight } from "lucide-react";

import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

  return (
    <SettingsSection
      title="Equipment"
      description="Your printers and their saved filament profiles. The default printer drives the fit check."
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
            <PrinterCard key={p.id} printer={p} canDelete={printers.length > 1} onChanged={load} />
          ))}
        </div>
      )}

      <p className="flex items-start gap-2 pt-1 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-subtle-foreground" />
        Filament profiles save each material&apos;s nozzle and bed temperatures, so the AI won&apos;t pause to ask for
        them mid-chat.
      </p>
    </SettingsSection>
  );
}

function PrinterCard({ printer, canDelete, onChanged }: { printer: Printer; canDelete: boolean; onChanged: () => void }) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  async function setDefault() {
    await api.updatePrinter(printer.id, { ...printer, default: true });
    onChanged();
  }

  return (
    <Card className="flex items-center gap-4 p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-elevated text-muted-foreground">
        <PrinterIcon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{printer.name}</span>
          {printer.default ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-muted px-2 py-0.5 text-[11px] text-accent-bright">
              <Star className="h-3 w-3" />
              Default
            </span>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground">
          {printer.kind} · {printer.build_volume.x}×{printer.build_volume.y}×{printer.build_volume.z} mm ·{" "}
          {printer.filaments.length} profile{printer.filaments.length === 1 ? "" : "s"}
        </div>
      </div>

      <Button variant="outline" size="sm" asChild className="gap-1">
        <Link href={`/settings/equipment/${printer.id}`}>
          Manage
          <ChevronRight className="h-4 w-4" />
        </Link>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={printer.default} onClick={setDefault}>
            <Star className="h-4 w-4" />
            Set as default
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-danger"
            disabled={!canDelete}
            onClick={() => setConfirmDelete(true)}
          >
            Delete printer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${printer.name}?`}
        description="The printer and its filament profiles will be removed."
        confirmLabel="Delete printer"
        destructive
        onConfirm={async () => {
          await api.deletePrinter(printer.id);
          onChanged();
        }}
      />
    </Card>
  );
}
