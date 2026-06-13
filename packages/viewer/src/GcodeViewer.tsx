import { useEffect, useRef } from "react";

export interface GcodeViewerProps {
  /** URL to a plain .gcode file (already extracted from the .gcode.3mf). */
  url: string;
  /** Layer scrub position, 0..1 (1 = whole print). */
  visible?: number;
  className?: string;
}

/**
 * G-code toolpath / layer preview (SCAFFOLD).
 *
 * Uses gcode-preview's WebGLPreview against a <canvas>. The design pass should
 * implement roughly:
 *
 *   import { WebGLPreview } from "gcode-preview";
 *   const preview = new WebGLPreview({ canvas, buildVolume: { x: 220, y: 220, z: 280 } });
 *   preview.processGCode(await (await fetch(url)).text());
 *   // map `visible` (0..1) -> preview.endLayer for the layer slider
 *
 * Build volume defaults to the Ender 5 S1 (220 × 220 × 280 mm).
 */
export function GcodeViewer({ url, visible = 1, className }: GcodeViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Design pass: instantiate WebGLPreview, processGCode(url), bind `visible`.
  }, [url, visible]);

  return <canvas ref={canvasRef} className={className} data-gcode-url={url} />;
}
