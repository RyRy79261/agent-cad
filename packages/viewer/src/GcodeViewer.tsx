"use client";

import { useEffect, useRef, useState } from "react";
import { ENDER_5_S1, type BuildVolume } from "@agent-cad/types";

export interface GcodeViewerProps {
  /** URL to a plain .gcode file (already extracted from the .gcode.3mf). */
  url: string;
  /** Print build volume in mm. Defaults to the Ender 5 S1 (220 × 220 × 280). */
  buildVolume?: BuildVolume;
  className?: string;
}

/** Minimal slice of gcode-preview's WebGLPreview we drive (it's loaded lazily). */
interface Preview {
  endLayer?: number;
  readonly maxLayerIndex: number;
  processGCode(gcode: string): void;
  render(): void;
}

/**
 * G-code toolpath / layer preview via gcode-preview (three.js), with a layer
 * slider. gcode-preview is imported lazily so it never loads on the server or
 * bloats other viewers' bundles.
 */
export function GcodeViewer({ url, buildVolume = ENDER_5_S1.build_volume, className }: GcodeViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<Preview | null>(null);
  const [maxLayer, setMaxLayer] = useState(0);
  const [layer, setLayer] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const { WebGLPreview } = await import("gcode-preview");
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const preview = new WebGLPreview({
          canvas,
          buildVolume,
          backgroundColor: 0xf7f7f7,
          extrusionColor: 0xc9a27a,
          renderTravel: false,
        }) as unknown as Preview;
        const gcode = await (await fetch(url)).text();
        if (cancelled) return;
        preview.processGCode(gcode);
        preview.render();
        previewRef.current = preview;
        const max = preview.maxLayerIndex || 0;
        setMaxLayer(max);
        setLayer(max);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      previewRef.current = null;
    };
  }, [url, buildVolume]);

  function onLayer(value: number) {
    setLayer(value);
    const preview = previewRef.current;
    if (preview) {
      preview.endLayer = value;
      preview.render();
    }
  }

  return (
    <div
      className={className}
      style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}
      data-build-volume={`${buildVolume.x}x${buildVolume.y}x${buildVolume.z}`}
    >
      <canvas ref={canvasRef} style={{ flex: 1, width: "100%", minHeight: 0 }} />
      {error ? <p style={{ color: "#c62828", fontSize: "0.8rem", margin: 4 }}>g-code preview error: {error}</p> : null}
      {maxLayer > 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", fontSize: "0.78rem", color: "#555" }}>
          <span style={{ whiteSpace: "nowrap" }}>
            Layer {layer}/{maxLayer}
          </span>
          <input
            type="range"
            min={1}
            max={maxLayer}
            value={layer}
            onChange={(e) => onLayer(Number(e.target.value))}
            aria-label="layer"
            style={{ flex: 1 }}
          />
        </div>
      ) : null}
    </div>
  );
}
