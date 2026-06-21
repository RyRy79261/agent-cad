"use client";

import { useRef, useState } from "react";
import type { BuildVolume } from "@agent-cad/types";
import { Box, Layers, Maximize2, RotateCcw, Printer as PrinterIcon, AlertTriangle, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ViewerErrorBoundary } from "./error-boundary";
import { StlViewer, GcodeViewer } from "./viewer-clients";

export type ViewerTab = "model" | "slice";

export interface ViewerPanelProps {
  /** URL of the current STL artifact (3D Model tab). */
  stlUrl?: string | null;
  /** URL of the current g-code artifact (Slice Preview tab). */
  gcodeUrl?: string | null;
  tab: ViewerTab;
  onTabChange: (tab: ViewerTab) => void;
  buildVolume?: BuildVolume;
  /** Active printer name — shown as a read-only chip in the header. */
  printerName?: string | null;
  /** Show a "generating model…" overlay over the Model tab. */
  generating?: boolean;
  /** Show a "slicing…" overlay over the Slice tab. */
  slicing?: boolean;
  className?: string;
}

function TabButton({
  active,
  disabled,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: typeof Box;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active ? "bg-elevated text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function Placeholder({ icon: Icon, title, hint }: { icon: typeof Box; title: string; hint?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
      <Icon className="h-8 w-8 text-subtle-foreground" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {hint ? <p className="text-xs text-subtle-foreground">{hint}</p> : null}
    </div>
  );
}

function BusyOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Right-rail 3D viewer: one canvas, two tabs (3D Model | Slice Preview), each
 * gated on its artifact, with empty / loading / error states. The canvas owns a
 * stable non-zero height (flex-1 + min-h-0 inside a fixed-height parent) so R3F /
 * gcode-preview never render into a 0px box (FR-VIEW-5/7, FR-LAYOUT-5).
 */
export function ViewerPanel({
  stlUrl,
  gcodeUrl,
  tab,
  onTabChange,
  buildVolume,
  printerName,
  generating,
  slicing,
  className,
}: ViewerPanelProps) {
  const [fitKey, setFitKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const showModel = tab === "model";
  const artifactKey = (showModel ? stlUrl : gcodeUrl) ?? "none";

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  return (
    <div
      ref={containerRef}
      className={cn("flex h-full flex-col overflow-hidden rounded-xl border bg-card", className)}
    >
      <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
        <div className="flex items-center gap-1">
          <TabButton active={showModel} disabled={!stlUrl} onClick={() => onTabChange("model")} icon={Box}>
            3D Model
          </TabButton>
          <TabButton
            active={!showModel}
            disabled={!gcodeUrl}
            onClick={() => onTabChange("slice")}
            icon={Layers}
          >
            Slice Preview
          </TabButton>
        </div>
        <div className="flex items-center gap-1">
          {printerName ? (
            <span className="mr-1 hidden items-center gap-1.5 rounded-full bg-elevated px-2.5 py-1 text-xs text-muted-foreground sm:inline-flex">
              <PrinterIcon className="h-3.5 w-3.5" />
              {printerName}
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            title="Reset view"
            onClick={() => setFitKey((k) => k + 1)}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            title="Fullscreen"
            onClick={toggleFullscreen}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative min-h-[280px] flex-1 bg-background">
        <ViewerErrorBoundary
          resetKey={`${artifactKey}:${fitKey}`}
          fallback={(error) => (
            <Placeholder icon={AlertTriangle} title="Couldn't render this artifact" hint={error.message} />
          )}
        >
          {showModel ? (
            stlUrl ? (
              // Key on fitKey only (NOT the URL): a refine/chat update changes the URL but must
              // keep the camera — the viewer reloads the mesh in place. "Reset view" bumps fitKey
              // to remount + re-frame.
              <StlViewer key={`stl:${fitKey}`} url={stlUrl} />
            ) : (
              <Placeholder
                icon={Box}
                title="Your 3D preview will appear here once the spec is locked in."
                hint="Answer Agent CAD's questions to generate a model."
              />
            )
          ) : gcodeUrl ? (
            <GcodeViewer key={`gcode:${gcodeUrl}:${fitKey}`} url={gcodeUrl} buildVolume={buildVolume} />
          ) : (
            <Placeholder icon={Layers} title="No slice yet" hint="Slice the model to preview toolpaths." />
          )}
        </ViewerErrorBoundary>

        {showModel && generating ? <BusyOverlay label="Generating model…" /> : null}
        {!showModel && slicing ? <BusyOverlay label="Slicing…" /> : null}
      </div>
    </div>
  );
}
