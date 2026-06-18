"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { BuildVolume, FilamentProfile, Printer } from "@agent-cad/types";
import { ArrowLeft, Box, Ship, Download, Loader2, AlertTriangle, ChevronRight, CheckCircle2 } from "lucide-react";

import * as api from "@/lib/api";
import { sameSettings, sliceStatsFrom, type SliceStats } from "@/lib/chat";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalibContextHeader } from "@/components/settings/calib-context-header";
import { StatsRow } from "@/components/chat/stats-row";
import { ViewerErrorBoundary } from "@/components/viewer/error-boundary";
import { GcodeViewer } from "@/components/viewer/viewer-clients";

const CUBE_META = { title: "Calibration cube", icon: Box } as const;
const META: Record<string, { title: string; icon: typeof Box }> = {
  cube: CUBE_META,
  benchy: { title: "3DBenchy", icon: Ship },
};

/**
 * Cube / Benchy Result (design: "Settings · Calibration · {Cube,Benchy} Result").
 * One shared view: on open it runs the calibrate job at the filament's saved
 * settings, then shows the g-code toolpath + layer scrub + stats + download.
 * Slicing needs OrcaSlicer — a missing slicer degrades to a clear message.
 */
export default function CalibrationResultPage() {
  const { printerId, filamentId, target } = useParams<{
    printerId: string;
    filamentId: string;
    target: string;
  }>();
  const meta = META[target] ?? CUBE_META;

  const [printer, setPrinter] = React.useState<Printer | null>(null);
  const [filament, setFilament] = React.useState<FilamentProfile | null>(null);
  const [phase, setPhase] = React.useState<"slicing" | "done" | "error">("slicing");
  const [gcodeUrl, setGcodeUrl] = React.useState<string | null>(null);
  const [stats, setStats] = React.useState<SliceStats | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(async () => {
    setPhase("slicing");
    setError(null);
    try {
      const p = await api.getPrinter(printerId);
      setPrinter(p);
      setFilament(p.filaments.find((f) => f.id === filamentId) ?? null);
      const job = await api.runJob(() =>
        api.calibrate({ target: target as "cube" | "benchy", printer_id: printerId, filament_id: filamentId }),
      );
      if (job.status !== "succeeded" || !(job.result?.ok ?? true)) {
        throw new Error((job.result?.error as string) || job.error || `slice ${job.status}`);
      }
      const url = job.result?.gcode_url as string | undefined;
      const info = job.result?.info as { plates?: SliceStats[] } | undefined;
      setStats(info?.plates?.[0] ?? sliceStatsFrom(null));
      if (url) setGcodeUrl(api.assetUrl(url));
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [printerId, filamentId, target]);

  React.useEffect(() => {
    void (async () => {
      await run();
    })();
  }, [run]);

  const editorHref = `/settings/equipment/${printerId}/filaments/${filamentId}`;
  const bv = printer?.build_volume as BuildVolume | undefined;
  const Icon = meta.icon;

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-subtle-foreground">
        <Link href="/settings/equipment" className="hover:text-foreground">Equipment</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/settings/equipment/${printerId}`} className="hover:text-foreground">{printer?.name ?? "Printer"}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={editorHref} className="hover:text-foreground">
          {filament ? `${filament.material}${filament.color ? ` · ${filament.color}` : ""}` : "Filament"}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-muted-foreground">{meta.title}</span>
      </nav>

      {printer && filament ? (
        <CalibContextHeader
          printer={printer}
          filament={filament}
          isOriginal={sameSettings(
            (filament.settings ?? {}) as Record<string, unknown>,
            (filament.default_settings ?? {}) as Record<string, unknown>,
          )}
        />
      ) : (
        <Skeleton className="h-20" />
      )}

      <Card className="space-y-5 p-5">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-base font-semibold">
            {meta.title} — {phase === "done" ? "sliced" : phase === "error" ? "couldn’t slice" : "slicing…"}
          </h1>
          {phase === "done" ? (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-success-muted px-2 py-0.5 text-xs font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Sliced
            </span>
          ) : null}
        </div>

        {phase === "slicing" ? (
          <div className="flex h-[320px] flex-col items-center justify-center gap-3 rounded-lg bg-background">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Slicing the {meta.title.toLowerCase()} at this filament’s settings…</p>
          </div>
        ) : phase === "error" ? (
          <div className="flex h-[320px] flex-col items-center justify-center gap-2 rounded-lg bg-background px-6 text-center">
            <AlertTriangle className="h-7 w-7 text-warning" />
            <p className="text-sm font-medium text-foreground">Couldn’t slice this test print</p>
            <p className="max-w-md text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void run()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <div className="h-[340px] overflow-hidden rounded-lg border bg-background">
              <ViewerErrorBoundary
                resetKey={gcodeUrl ?? "none"}
                fallback={(e) => (
                  <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
                    {e.message}
                  </div>
                )}
              >
                {gcodeUrl ? (
                  <GcodeViewer url={gcodeUrl} buildVolume={bv} />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-subtle-foreground">
                    No toolpath returned.
                  </div>
                )}
              </ViewerErrorBoundary>
            </div>
            <StatsRow stats={stats} />
          </>
        )}

        <div className="flex items-center gap-2 border-t pt-4">
          {phase === "done" && gcodeUrl ? (
            <Button onClick={() => window.open(gcodeUrl, "_blank")} className="gap-2">
              <Download className="h-4 w-4" />
              Download g-code
            </Button>
          ) : null}
          <Button variant="outline" asChild className="gap-2">
            <Link href={editorHref}>
              <ArrowLeft className="h-4 w-4" />
              Back to test prints
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
