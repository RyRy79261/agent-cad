import { Suspense, useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { Bounds, OrbitControls, Stage } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { BufferGeometry } from "three";

export interface StlViewerProps {
  /** URL to an STL file (e.g. an artifact served by the API). */
  url: string;
  /** Mesh colour. */
  color?: string;
  className?: string;
}

function Model({ url, color = "#c9a27a" }: { url: string; color?: string }) {
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

  return (
    <mesh geometry={prepared}>
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} />
    </mesh>
  );
}

/** Render an STL artifact with orbit controls and auto-framing. */
export function StlViewer({ url, color, className }: StlViewerProps) {
  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <Canvas camera={{ position: [120, 120, 120], fov: 45 }}>
        <Suspense fallback={null}>
          <Stage environment="city" intensity={0.5}>
            <Bounds fit clip observe margin={1.2}>
              <Model url={url} color={color} />
            </Bounds>
          </Stage>
        </Suspense>
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
