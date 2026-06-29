"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box3,
  Color,
  type BufferAttribute,
  type BufferGeometry,
  type Mesh,
  type Object3D,
  type PerspectiveCamera,
  Vector3,
} from "three";
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
  /** Called with the current layer when the user adds a checkpoint from the preview. */
  onAddCheckpoint?: (layer: number) => void;
  /** Checkpoints baked into THIS g-code — drawn as coloured markers on the layer timeline. */
  checkpoints?: GcodeCheckpointMarker[];
  className?: string;
}

/** A checkpoint to mark on the layer timeline (anchored by layer or % of layers). */
export interface GcodeCheckpointMarker {
  layer?: number | null;
  pct?: number | null;
  label: string;
  color: string;
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
 * Frame the printed PART with breathing room. gcode-preview frames the whole 220×220 build
 * volume, so a small part looks lost; this dollies the camera to the printed geometry's bounds
 * (×1.4 a snug fit) so the part sits in view with space around it — instead of the old fixed
 * 62%-toward-target dolly that over-zoomed larger parts. Falls back to a gentle dolly if the
 * part group isn't readable.
 */
function framePart(preview: Preview): void {
  const p = preview as unknown as {
    camera: PerspectiveCamera;
    controls: { target: Vector3; update(): void };
    group?: Object3D;
  };
  const box = p.group ? new Box3().setFromObject(p.group) : null;
  if (box && !box.isEmpty()) {
    const center = box.getCenter(new Vector3());
    const radius = 0.5 * box.getSize(new Vector3()).length() || 50;
    const distance = (radius / Math.sin((p.camera.fov * Math.PI) / 360)) * 1.4;
    const dir = p.camera.position.clone().sub(p.controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(1, 1, 1);
    dir.normalize();
    p.controls.target.copy(center);
    p.camera.position.copy(center.clone().add(dir.multiplyScalar(distance)));
    p.camera.near = Math.max(0.1, distance - radius * 4);
    p.camera.far = distance + radius * 8;
    p.camera.updateProjectionMatrix();
    p.controls.update();
  } else {
    preview.camera.position.lerp(preview.controls.target, 0.4);
    preview.controls.update();
  }
}

/**
 * Recolour the printed extrusion by checkpoint band: every layer at/above a checkpoint's height
 * takes that checkpoint's colour (the layers below stay the base colour), so you can SEE that a
 * checkpoint's settings carry through the rest of the print — not just the one layer. gcode-preview
 * renders with per-vertex colours (its gradient), so we overwrite the colour attribute by the
 * vertex's height (Y is up). Wrapped in try/catch by the caller; failure just keeps default colours.
 */
function colorizeBands(
  preview: Preview,
  bands: { layer: number; color: string }[],
  maxLayer: number,
  baseColor: number,
): void {
  const p = preview as unknown as { scene?: Object3D; group?: Object3D; render(): void };
  const root = p.group ?? p.scene;
  if (!root || maxLayer <= 0 || !bands.length) return;
  const box = new Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const minY = box.min.y;
  const span = box.max.y - box.min.y || 1;
  const thresholds = [...bands]
    .sort((a, b) => a.layer - b.layer)
    .map((b) => ({ y: minY + (b.layer / maxLayer) * span, color: new Color(b.color) }));
  const base = new Color(baseColor);
  const pick = (y: number): Color => {
    let c = base;
    for (const t of thresholds) {
      if (y >= t.y) c = t.color;
      else break;
    }
    return c;
  };
  root.traverse((obj) => {
    const geom = (obj as Mesh).geometry as BufferGeometry | undefined;
    const pos = geom?.getAttribute?.("position") as BufferAttribute | undefined;
    const col = geom?.getAttribute?.("color") as BufferAttribute | undefined;
    if (!geom || !pos || !col || col.count !== pos.count || col.itemSize < 3) return;
    for (let i = 0; i < pos.count; i++) {
      const c = pick(pos.getY(i));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  });
  p.render();
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
  onAddCheckpoint,
  checkpoints,
  className,
}: GcodeViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<Preview | null>(null);
  const [maxLayer, setMaxLayer] = useState(0);
  const [layer, setLayer] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Resolve each checkpoint to a layer on this slice's timeline (% → layer via the real count).
  const markers = (checkpoints ?? [])
    .map((c) => ({
      ...c,
      layer: Math.max(1, Math.min(maxLayer, c.layer ?? Math.round(((c.pct ?? 0) / 100) * maxLayer))),
    }))
    .filter(() => maxLayer > 0)
    .sort((a, b) => a.layer - b.layer);

  // The progress bar coloured by band: base colour up to the first checkpoint, then each
  // checkpoint's colour through the rest — matching the recoloured 3D extrusion.
  const baseHex = `#${(extrusionColor & 0xffffff).toString(16).padStart(6, "0")}`;
  const bandGradient =
    markers.length && maxLayer > 0
      ? (() => {
          const segs: string[] = [];
          let start = 0;
          let color = baseHex;
          for (const m of markers) {
            const pos = (m.layer / maxLayer) * 100;
            segs.push(`${color} ${start}%`, `${color} ${pos}%`);
            start = pos;
            color = m.color;
          }
          segs.push(`${color} ${start}%`, `${color} 100%`);
          return `linear-gradient(to right, ${segs.join(", ")})`;
        })()
      : null;

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
        framePart(preview);
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

  // Recolour the extrusion bands once the slice is loaded (and whenever the checkpoints change).
  // `checkpoints` is memoised by the parent (stable per slice), so this doesn't re-walk every render.
  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || maxLayer <= 0) return;
    const bands = (checkpoints ?? []).map((c) => ({
      layer: Math.max(1, Math.min(maxLayer, c.layer ?? Math.round(((c.pct ?? 0) / 100) * maxLayer))),
      color: c.color,
    }));
    try {
      colorizeBands(preview, bands, maxLayer, extrusionColor);
    } catch {
      /* keep gcode-preview's default colours if recolouring fails */
    }
  }, [checkpoints, maxLayer, extrusionColor]);

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
        <div style={{ padding: "8px 10px", fontSize: "0.78rem", color: "#9aa7bd" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span>
              Layer preview
              {markers.length ? (
                <span style={{ color: "#34d399", marginLeft: 8 }}>
                  · {markers.length} checkpoint{markers.length > 1 ? "s" : ""} baked in
                </span>
              ) : null}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                Layer {layer} / {maxLayer}
              </span>
              {onAddCheckpoint ? (
                <button
                  type="button"
                  onClick={() => onAddCheckpoint(layer)}
                  title="Add a slice checkpoint at this layer"
                  style={{
                    cursor: "pointer",
                    borderRadius: 6,
                    border: "1px solid #3b82f6",
                    color: "#bcd2ff",
                    background: "transparent",
                    padding: "2px 8px",
                    fontSize: "0.72rem",
                    whiteSpace: "nowrap",
                  }}
                >
                  + Checkpoint here
                </button>
              ) : null}
            </span>
          </div>
          <div style={{ position: "relative", width: "100%" }}>
            {/* The progress bar, coloured by checkpoint band (matches the recoloured 3D extrusion). */}
            {bandGradient ? (
              <div
                title="Each colour is a checkpoint's settings, applied from there through the rest of the print"
                style={{ height: 8, borderRadius: 4, marginBottom: 4, background: bandGradient }}
              />
            ) : null}
            <input
              type="range"
              min={1}
              max={maxLayer}
              value={layer}
              onChange={(e) => onLayer(Number(e.target.value))}
              aria-label="layer"
              style={{ width: "100%", accentColor: "#3b82f6" }}
            />
          </div>
          {markers.length ? (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: "0.72rem" }}>
              {markers.map((m, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: m.color, flexShrink: 0 }} />
                  <span style={{ color: "#c3cede" }}>
                    L{m.layer} → {m.label}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
