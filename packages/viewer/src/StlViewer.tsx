import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { PerspectiveCamera, Vector3, type BufferGeometry } from "three";

/** Brand-blue extrusion on a dark canvas — the Agent CAD viewer look (token: --primary). */
export const DEFAULT_STL_COLOR = "#3b82f6";

/** How much bigger than a snug fit to frame — >1 leaves space around the model (1 = fills view). */
const FRAME_MARGIN = 1.45;

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
  const { camera, controls } = useThree();

  const prepared = useMemo(() => {
    // STLs come from the 3D-printing pipeline, which is Z-up (Z = build-plate height); three.js
    // is Y-up. Without this the part lies on its side. Clone first: useLoader caches geometry by
    // URL, so mutating in place would double-rotate on re-mount. Centre it at the origin so the
    // camera framing below (and orbit target) is simply (0,0,0).
    const g = geometry.clone();
    g.rotateX(-Math.PI / 2);
    g.center();
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, [geometry]);

  // Frame ONCE on first load — position the camera a comfortable distance from the model's
  // bounding sphere so it sits fully in view with space around it. `framedRef` lives in the
  // StlViewer (stable key across URL changes), so a refine's model swap doesn't re-frame: the
  // user's orbit/zoom/pan is kept. "Reset view" remounts the viewer, which re-frames.
  useEffect(() => {
    if (framedRef.current) return;
    const radius = prepared.boundingSphere?.radius ?? 50;
    if (!(camera instanceof PerspectiveCamera)) return;
    // Distance at which a sphere of `radius` fills the view, times the margin for breathing room.
    // Fit against the SMALLER of the vertical/horizontal FOV so wide parts on a tall/narrow canvas
    // aren't cropped. The sphere over-bounds the actual part, so there's already a little slack.
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const distance = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * FRAME_MARGIN;
    const dir = new Vector3(1, 0.75, 1).normalize();
    camera.position.copy(dir.multiplyScalar(distance));
    camera.near = Math.max(0.1, distance - radius * 2);
    camera.far = distance + radius * 6;
    camera.updateProjectionMatrix();
    // OrbitControls (makeDefault) drives orientation via its target — point it at the model centre.
    const orbit = controls as { target?: Vector3; update?: () => void } | null;
    if (orbit?.target) {
      orbit.target.set(0, 0, 0);
      orbit.update?.();
    } else {
      camera.lookAt(0, 0, 0);
    }
    framedRef.current = true;
  }, [prepared, camera, controls, framedRef]);

  return (
    <mesh geometry={prepared}>
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.15} />
    </mesh>
  );
}

/** Render an STL artifact with orbit/pan/zoom controls. Frames once with margin, then keeps the view. */
export function StlViewer({ url, color, className }: StlViewerProps) {
  // Lives at the viewer scope (key is stable across URL changes) so the "fit once" guard survives a
  // refine's model swap and only resets when the viewer is remounted (Reset view).
  const framedRef = useRef(false);
  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <Canvas camera={{ position: [180, 180, 180], fov: 40 }}>
        {/* Lights only — no network HDR environment (it suspends/fetches and the app is local-first;
            a low metalness means env reflections were barely visible anyway). */}
        <hemisphereLight args={[0xffffff, 0x202a3a, 0.8]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[1, 1.5, 1]} intensity={1.3} />
        <directionalLight position={[-1, 0.5, -1]} intensity={0.5} />
        <Suspense fallback={null}>
          <Model url={url} color={color} framedRef={framedRef} />
        </Suspense>
        {/* maxDistance is generous so it never clamps the computed fit distance for a large part. */}
        <OrbitControls makeDefault enablePan screenSpacePanning zoomToCursor minDistance={1} maxDistance={100000} />
      </Canvas>
    </div>
  );
}
