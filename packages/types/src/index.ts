/**
 * Shared types for the agent-cad control plane.
 *
 * These Zod schemas mirror the FastAPI request/response models in
 * `services/api/src/api/schemas.py`. They are the hand-maintained contract for
 * now; the intended end-state is to generate a fully typed SDK from the API's
 * OpenAPI document (e.g. with hey-api) so the two never drift. Until then, keep
 * these in sync with the Python side.
 */

import { z } from "zod";

// --- Requests -------------------------------------------------------------- //

export const BuildRequest = z.object({
  model_path: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
  out_dir: z.string().nullish(),
  name: z.string().nullish(),
  formats: z.array(z.string()).default(["stl", "step", "3mf", "svg"]),
  verify: z.boolean().default(false),
});
export type BuildRequest = z.infer<typeof BuildRequest>;

export const OrcaSliceRequest = z.object({
  model: z.string(),
  machine: z.string(),
  process: z.string(),
  filaments: z.array(z.string()).min(1),
  output: z.string().nullish(),
  extract: z.boolean().default(true),
  extra_args: z.array(z.string()).default([]),
});
export type OrcaSliceRequest = z.infer<typeof OrcaSliceRequest>;

export const PrusaSliceRequest = z.object({
  model: z.string(),
  configs: z.array(z.string()).min(1),
  output: z.string().nullish(),
  repair: z.boolean().default(false),
  extra_args: z.array(z.string()).default([]),
});
export type PrusaSliceRequest = z.infer<typeof PrusaSliceRequest>;

export const ScanCleanRequest = z.object({
  input_path: z.string(),
  output_path: z.string().nullish(),
  keep_largest: z.boolean().default(true),
  fill_holes: z.boolean().default(true),
  fix_normals: z.boolean().default(true),
  target_faces: z.number().int().positive().nullish(),
  recenter: z.boolean().default(true),
});
export type ScanCleanRequest = z.infer<typeof ScanCleanRequest>;

// --- Responses ------------------------------------------------------------- //

export const JobStatus = z.enum(["queued", "running", "succeeded", "failed", "interrupted"]);
export type JobStatus = z.infer<typeof JobStatus>;

export const JobRef = z.object({
  job_id: z.string(),
  kind: z.string(),
  status: JobStatus,
});
export type JobRef = z.infer<typeof JobRef>;

export const Job = z.object({
  id: z.string(),
  kind: z.string(),
  status: JobStatus,
  created_at: z.number(),
  started_at: z.number().nullable(),
  finished_at: z.number().nullable(),
  result: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
  /** Coarse progress label for long chat generations. */
  phase: z.string().nullish(),
  /** Links a job to its chat so a reloaded chat re-attaches its result. */
  chat_id: z.string().nullish(),
});
export type Job = z.infer<typeof Job>;

export const BoundingBox = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});
export type BoundingBox = z.infer<typeof BoundingBox>;

/** A print envelope in mm (X × Y bed footprint, Z height). */
export const BuildVolume = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});
export type BuildVolume = z.infer<typeof BuildVolume>;

/** One printability check from the spec-verification harness (see `cad.verify`). */
export const VerificationCheck = z.object({
  name: z.string(),
  passed: z.boolean(),
  severity: z.enum(["error", "warning"]),
  detail: z.string(),
});
export type VerificationCheck = z.infer<typeof VerificationCheck>;

export const Verification = z.object({
  printable: z.boolean(),
  summary: z.string(),
  checks: z.array(VerificationCheck),
});
export type Verification = z.infer<typeof Verification>;

export const BuildResult = z.object({
  ok: z.boolean(),
  model_path: z.string(),
  artifacts: z.record(z.string(), z.string()),
  metadata: z.object({
    bounding_box_mm: BoundingBox.optional(),
    volume_mm3: z.number().nullable().optional(),
    // Build-volume fit check against the target printer (see `cad.printer`).
    printer: z.string().optional(),
    build_volume_mm: BuildVolume.optional(),
    fits_build_volume: z.boolean().optional(),
    build_volume_overflow_mm: BoundingBox.optional(),
    requires_rotation: z.boolean().optional(),
  }),
  // Printability verdict — present only when the build ran with verify enabled.
  verification: Verification.nullish(),
  stdout: z.string(),
  stderr: z.string(),
  error: z.string().nullable(),
  engine: z.string().nullable(),
});
export type BuildResult = z.infer<typeof BuildResult>;

export const PartSummary = z.object({
  name: z.string(),
  path: z.string(),
  has_model: z.boolean(),
  params: z.record(z.string(), z.unknown()).nullable(),
  print: z.record(z.string(), z.unknown()).nullable(),
  artifacts: z.array(z.string()),
});
export type PartSummary = z.infer<typeof PartSummary>;

// --- Slice settings + registry --------------------------------------------- //

/**
 * Per-slice overrides — mirrors `SliceSettings` in `schemas.py`. These bounds are the
 * **single source of truth** for the schema-driven settings UI (the descriptor's
 * min/max/options derive from here). `infill_pattern`/`seam_position` are enums on both
 * sides so the server rejects garbage.
 */
export const SliceSettings = z.object({
  infill_density: z.number().int().min(0).max(100).nullish(),
  wall_speed: z.number().int().min(5).max(120).nullish(),
  jerk: z.number().int().min(1).max(40).nullish(),
  bed_temp: z.number().int().min(0).max(110).nullish(),
  nozzle_temp: z.number().int().min(150).max(300).nullish(),
  flow: z.number().min(0.8).max(1.2).nullish(),
  layer_height: z.number().min(0.08).max(0.32).nullish(),
  wall_loops: z.number().int().min(1).max(10).nullish(),
  top_layers: z.number().int().min(0).max(20).nullish(),
  bottom_layers: z.number().int().min(0).max(20).nullish(),
  infill_pattern: z.enum(["crosshatch", "gyroid", "grid", "cubic"]).nullish(),
  seam_position: z.enum(["aligned", "nearest", "back", "random"]).nullish(),
  brim_width: z.number().min(0).max(20).nullish(),
  support: z.boolean().nullish(),
  support_threshold: z.number().int().min(0).max(90).nullish(),
  retraction_length: z.number().min(0).max(6).nullish(),
  raw: z.record(z.string(), z.string()).nullish(),
});
export type SliceSettings = z.infer<typeof SliceSettings>;

/** A material profile saved on a printer — mirrors `FilamentProfile`. */
export const FilamentProfile = z.object({
  id: z.string(),
  name: z.string(),
  material: z.string(),
  brand: z.string().nullish(),
  color: z.string().nullish(),
  settings: SliceSettings.default({}),
  default_settings: SliceSettings.default({}),
});
export type FilamentProfile = z.infer<typeof FilamentProfile>;

/** A registered machine + its filament profiles — mirrors the `Printer` registry record. */
export const Printer = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string().default("FDM"),
  build_volume: BuildVolume,
  nozzle_diameter_mm: z.number().default(0.4),
  firmware: z.string().default("Marlin"),
  bed_margin_mm: z.number().default(5),
  default: z.boolean().default(false),
  filaments: z.array(FilamentProfile).default([]),
});
export type Printer = z.infer<typeof Printer>;

/** App settings persisted to `~/.agent-cad/settings.json` — mirrors `Settings`. No `effort` (generation runs at max). */
export const Settings = z.object({
  active_model: z.string().default("claude-opus-4-8"),
  default_printer_id: z.string().nullish(),
  storage_location: z.string().nullish(),
  theme: z.string().default("system"),
  auto_clear_days: z.number().int().min(0).default(0),
  user_name: z.string().nullish(),
});
export type Settings = z.infer<typeof Settings>;

/** Default local API base URL (the FastAPI server in `services/api`). */
export const DEFAULT_API_URL = "http://127.0.0.1:8420";

// --- Target printer -------------------------------------------------------- //

export interface PrinterProfile {
  name: string;
  /** Full machine envelope in mm. */
  build_volume: BuildVolume;
  /** Clearance kept free on each X/Y bed edge (mm). */
  bed_margin_mm: number;
}

/**
 * The pipeline's target machine. **Mirrors `services/cad/src/cad/printer.py`
 * (`ENDER_5_S1`)** — keep the two in sync, like the schemas above. See
 * `docs/printer-ender5s1.md`.
 */
export const ENDER_5_S1: PrinterProfile = {
  name: "Creality Ender 5 S1",
  build_volume: { x: 220, y: 220, z: 280 },
  bed_margin_mm: 5,
};
