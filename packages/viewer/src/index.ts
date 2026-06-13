/**
 * Browser 3D viewers for the control panel.
 *
 * - {@link StlViewer}  — STL/OBJ/3MF meshes via three.js + react-three-fiber.
 * - {@link StepViewer} — STEP/IGES/BREP via occt-import-js (WASM OCCT) -> three.
 * - {@link GcodeViewer} — toolpath/layer preview via gcode-preview.
 *
 * StlViewer is a working reference. StepViewer/GcodeViewer are scaffolded for
 * the design pass (the WASM/loader wiring is described inline).
 */

export { StlViewer, type StlViewerProps } from "./StlViewer.js";
export { StepViewer, type StepViewerProps } from "./StepViewer.js";
export { GcodeViewer, type GcodeViewerProps } from "./GcodeViewer.js";
