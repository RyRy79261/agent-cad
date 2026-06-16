"use client";

import { useEffect, useRef, useState } from "react";
import { ENDER_5_S1, type BuildVolume } from "@agent-cad/types";

/** Dark canvas + brand-blue extrusion to match the Agent CAD viewer (tokens --background / --primary). */
export const DEFAULT_GCODE_BACKGROUND = 0x0e1626;
export const DEFAULT_GCODE_EXTRUSION = 0x3b82f6;

export interface GcodeViewerProps {
  /** URL to a plain .gcode file (already extracted from the .gcode.3mf). */
  url: string;
  /** Print build volume in mm. Defaults to the Ender 5 S1 (220 × 220 × 280). */
  buildVolume?: BuildVolume;
  /** Canvas background colour (hex int, e.g. 0x0e1626). */
  backgroundColor?: number;
  /** Extruded-path colour (hex int, e.g. 0x3b82f6). */
  extrusionColor?: number;
  className?: string;
}

interface Vec3 {
  lerp(v: Vec3, alpha: number): void;
}
/** Minimal slice of gcode-preview's WebGLPreview we drive (it's loaded lazily). */
interface Preview {
  endLayer?: number;
  readonly maxLayerIndex: number;
  camera: { position: Vec3 };
  controls: { target: Vec3; update(): void };
  processGCode(gcode: string): void;
  render(): void;
}

/**
 * G-code toolpath / layer preview via gcode-preview (three.js), with a layer
 * slider. gcode-preview is imported lazily so it never loads on the server or
 * bloats other viewers' bundles.
 */
export function GcodeViewer({
  url,
  buildVolume = ENDER_5_S1.build_volume,
  backgroundColor = DEFAULT_GCODE_BACKGROUND,
  extrusionColor = DEFAULT_GCODE_EXTRUSION,
  className,
}: GcodeViewerProps) {
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
          backgroundColor,
          extrusionColor,
          renderTravel: false,
        }) as unknown as Preview;
        const gcode = await (await fetch(url)).text();
        if (cancelled) return;
        preview.processGCode(gcode);
        preview.render();
        // gcode-preview frames the whole 220×220 bed; dolly toward the part so a
        // small part (e.g. a 20mm cube) fills the view instead of looking lost.
        preview.camera.position.lerp(preview.controls.target, 0.62);
        preview.controls.update();
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
  }, [url, buildVolume, backgroundColor, extrusionColor]);

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
      {error ? <p style={{ color: "#fca5a5", fontSize: "0.8rem", margin: 4 }}>g-code preview error: {error}</p> : null}
      {maxLayer > 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            fontSize: "0.78rem",
            color: "#9aa7bd",
          }}
        >
          <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            Layer {layer}/{maxLayer}
          </span>
          <input
            type="range"
            min={1}
            max={maxLayer}
            value={layer}
            onChange={(e) => onLayer(Number(e.target.value))}
            aria-label="layer"
            style={{ flex: 1, accentColor: "#3b82f6" }}
          />
        </div>
      ) : null}
    </div>
  );
}
