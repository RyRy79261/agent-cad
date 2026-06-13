import { useEffect, useRef, useState } from "react";

export interface StepViewerProps {
  /** URL to a STEP (.step/.stp) file. */
  url: string;
  className?: string;
}

/**
 * STEP viewer (SCAFFOLD).
 *
 * STEP is B-rep, not mesh, so the browser path is: fetch the file, tessellate it
 * with occt-import-js (Emscripten OCCT) into vertex/index arrays, then feed those
 * into a three.js BufferGeometry — typically inside an R3F <Canvas>.
 *
 * Wiring the design pass should implement:
 *
 *   import occtimportjs from "occt-import-js";
 *   const occt = await occtimportjs();
 *   const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
 *   const result = occt.ReadStepFile(buf, null);
 *   // result.meshes[].attributes.position.array -> THREE.BufferAttribute
 *
 * Kept as a placeholder so the package stays buildable before the UI pass.
 */
export function StepViewer({ url, className }: StepViewerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [status] = useState<string>("STEP viewer not implemented yet");

  useEffect(() => {
    // Design pass: load occt-import-js, tessellate `url`, render with three.js.
  }, [url]);

  return (
    <div ref={ref} className={className} data-step-url={url}>
      {status}
    </div>
  );
}
