"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/** Shared "viewer is initialising" placeholder (used while the chunk + WebGL boot). */
function ViewerLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center text-subtle-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

/**
 * The 3D viewers use WebGL / R3F / gcode-preview, none of which render on the
 * server — load them client-only (`ssr: false`) so Next never tries to SSR a
 * canvas (FR-VIEW-7). `next/dynamic(ssr:false)` must live in a client module.
 */
export const StlViewer = dynamic(() => import("@agent-cad/viewer").then((m) => m.StlViewer), {
  ssr: false,
  loading: ViewerLoading,
});

export const GcodeViewer = dynamic(() => import("@agent-cad/viewer").then((m) => m.GcodeViewer), {
  ssr: false,
  loading: ViewerLoading,
});
