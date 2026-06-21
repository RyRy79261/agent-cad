import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { Bounds, OrbitControls, Stage, useBounds } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { BufferGeometry } from "three";

/** Brand-blue extrusion on a dark canvas — the Agent CAD viewer look (token: --primary). */
export const DEFAULT_STL_COLOR = "#3b82f6";

export interface StlViewerProps {
  /** URL to an STL file (e.g. an artifact served by the API). */
  url: string;
  /** Mesh colour. Defaults to the Agent CAD brand blue. */
  color?: string;
  className?: string;
}

function Model({
  url,
  color = DEFAULT_STL_COLOR,
  framedRef,
}: {
  url: string;
  color?: string;
  framedRef: React.MutableRefObject<boolean>;
}) {
  const geometry = useLoader(STLLoader, url) as BufferGeometry;
  const prepared = useMemo(() => {
    // STLs come from the 3D-printing pipeline, which is Z-up (Z = build-plate
    // height); three.js is Y-up. Without this the part lies on its side (the cube's
    // top points left, the Benchy is sideways) even though slicing is correct.
    // Rotate printing-Z onto three.js-Y so the model stands upright, matching the
    // g-code viewer. Clone first: useLoader caches the geometry by URL, so mutating
    // it in place would double-rotate on re-mount.
    const g = geometry.clone();
    g.rotateX(-Math.PI / 2);
    g.center();
    g.computeVertexNormals();
    return g;
  }, [geometry]);

  // Frame the model ONCE, the first time a model loads — not on every model swap.
  // `framedRef` lives in the StlViewer (whose key is stable across URL changes), so even
  // if React remounts this mesh when the URL changes on a refine, we don't re-frame: the
  // user's orbit/zoom/pan is kept, so the view "remembers" where it was. Reset re-frames.
  const bounds = useBounds();
  useEffect(() => {
    if (!framedRef.current) {
      bounds.refresh().clip().fit();
      framedRef.current = true;
    }
  }, [bounds, prepared, framedRef]);

  return (
    <mesh geometry={prepared}>
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.15} />
    </mesh>
  );
}

/** Render an STL artifact with orbit/pan/zoom controls. Frames once, then keeps the view. */
export function StlViewer({ url, color, className }: StlViewerProps) {
  // Lives at the viewer scope (key is stable across URL changes) so the "fit once" guard
  // survives a refine's model swap and only resets when the viewer is remounted (Reset view).
  const framedRef = useRef(false);
  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <Canvas camera={{ position: [180, 180, 180], fov: 40 }}>
        {/* adjustCamera={false}: Stage lights the scene but never moves the camera, so it
            can't reset the user's view when the model updates. Framing is Bounds' job. */}
        <Stage environment="city" intensity={0.5} adjustCamera={false}>
          {/* margin 2.2 = a comfortable, not-too-close default zoom. No `observe` → no
              auto-refit when the model changes; Model frames once on first load. */}
          <Bounds clip margin={2.2}>
            <Suspense fallback={null}>
              <Model url={url} color={color} framedRef={framedRef} />
            </Suspense>
          </Bounds>
        </Stage>
        <OrbitControls makeDefault enablePan screenSpacePanning zoomToCursor minDistance={1} maxDistance={4000} />
      </Canvas>
    </div>
  );
}
