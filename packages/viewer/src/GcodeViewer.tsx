import { useEffect, useRef } from "react";
import { ENDER_5_S1, type BuildVolume } from "@agent-cad/types";

export interface GcodeViewerProps {
  /** URL to a plain .gcode file (already extracted from the .gcode.3mf). */
  url: string;
  /** Layer scrub position, 0..1 (1 = whole print). */
  visible?: number;
  /** Print build volume in mm. Defaults to the Ender 5 S1 (220 × 220 × 280). */
  buildVolume?: BuildVolume;
  className?: string;
}

/**
 * G-code toolpath / layer preview (SCAFFOLD).
 *
 * Uses gcode-preview's WebGLPreview against a <canvas>. The design pass should
 * implement roughly:
 *
 *   import { WebGLPreview } from "gcode-preview";
 *   const preview = new WebGLPreview({ canvas, buildVolume });
 *   preview.processGCode(await (await fetch(url)).text());
 *   // map `visible` (0..1) -> preview.endLayer for the layer slider
 *
 * `buildVolume` defaults to the shared `ENDER_5_S1` profile (`@agent-cad/types`,
 * mirroring `cad.printer`) so the preview grid matches the real bed.
 */
export function GcodeViewer({
  url,
  visible = 1,
  buildVolume = ENDER_5_S1.build_volume,
  className,
}: GcodeViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Design pass: new WebGLPreview({ canvas, buildVolume }), processGCode(url),
    // bind `visible` -> endLayer.
  }, [url, visible, buildVolume]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      data-gcode-url={url}
      data-build-volume={`${buildVolume.x}x${buildVolume.y}x${buildVolume.z}`}
    />
  );
}
