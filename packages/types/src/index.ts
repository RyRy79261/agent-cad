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

/**
 * What the machine's firmware can do — mirrors `FirmwareCapabilities`. Load-bearing:
 * gates calibrations the firmware would silently ignore (e.g. `M900 K` Pressure Advance
 * on a stock Creality Marlin without LIN_ADVANCE). Defaults = stock Ender 5 S1 (all off).
 */
export const FirmwareCapabilities = z.object({
  name: z.string().default("Marlin (stock)"),
  linear_advance: z.boolean().default(false),
  input_shaping: z.boolean().default(false),
  arc_moves: z.boolean().default(false),
});
export type FirmwareCapabilities = z.infer<typeof FirmwareCapabilities>;

/** A registered machine + its filament profiles — mirrors the `Printer` registry record. */
export const Printer = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string().default("FDM"),
  build_volume: BuildVolume,
  nozzle_diameter_mm: z.number().default(0.4),
  // Back-compat: legacy records stored firmware as a plain name string → coerce to {name}.
  firmware: z.preprocess(
    (v) => (typeof v === "string" ? { name: v } : (v ?? {})),
    FirmwareCapabilities,
  ),
  bed_margin_mm: z.number().default(5),
  default: z.boolean().default(false),
  filaments: z.array(FilamentProfile).default([]),
});
export type Printer = z.infer<typeof Printer>;

/** App settings persisted to `~/.agent-cad/settings.json` — mirrors `Settings`. `active_model`+`effort` drive the LLM driver (`--model`/`--effort`). */
export const Settings = z.object({
  active_model: z.string().default("claude-opus-4-8"),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).default("high"),
  default_printer_id: z.string().nullish(),
  storage_location: z.string().nullish(),
  theme: z.string().default("system"),
  auto_clear_days: z.number().int().min(0).default(0),
  user_name: z.string().nullish(),
});
export type Settings = z.infer<typeof Settings>;

// --- Schema-driven settings descriptor (§3a) ------------------------------- //

export const SettingsField = z.object({
  key: z.string(),
  label: z.string(),
  help: z.string().nullish(),
  input_type: z.enum(["slider", "number", "percent", "select", "toggle", "text"]),
  scope: z.enum(["process", "machine", "filament", "raw"]),
  binding: z.enum(["per-slice", "per-filament", "per-printer"]),
  group: z.string(),
  unit: z.string().nullish(),
  default: z.unknown().nullish(),
  min: z.number().nullish(),
  max: z.number().nullish(),
  step: z.number().nullish(),
  options: z.array(z.string()).nullish(),
  advanced: z.boolean().default(false),
  depends_on: z.object({ field: z.string(), equals: z.unknown() }).nullish(),
});
export type SettingsField = z.infer<typeof SettingsField>;

export const SettingsGroup = z.object({
  id: z.string(),
  label: z.string(),
  default_expanded: z.boolean().default(true),
});
export type SettingsGroup = z.infer<typeof SettingsGroup>;

export const SettingsDescriptor = z.object({
  printer_id: z.string(),
  printer_name: z.string(),
  filament_id: z.string().nullish(),
  schema_version: z.number().int().default(1),
  groups: z.array(SettingsGroup),
  fields: z.array(SettingsField),
});
export type SettingsDescriptor = z.infer<typeof SettingsDescriptor>;

// --- Chats (the local-first chat workspace) -------------------------------- //

export const ArtifactRef = z.object({
  kind: z.string(),
  name: z.string(),
  url: z.string(),
  fmt: z.string().nullish(),
  bbox: z.record(z.string(), z.number()).nullish(),
  fits_build_volume: z.boolean().nullish(),
  slice_info: z.record(z.string(), z.unknown()).nullish(),
});
export type ArtifactRef = z.infer<typeof ArtifactRef>;

export const Message = z.object({
  role: z.string(),
  content: z.string(),
  ts: z.number().default(0),
  quick_replies: z.array(z.string()).nullish(),
  artifact_refs: z.array(ArtifactRef).default([]),
  /** Assistant-turn telemetry: token usage (input/output/cache) + wall-clock ms. */
  usage: z.record(z.string(), z.number()).nullish(),
  duration_ms: z.number().nullish(),
});
export type Message = z.infer<typeof Message>;

export const Chat = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
  status: z.string().default("new"),
  printer_id: z.string().nullish(),
  filament_id: z.string().nullish(),
  current_stl: z.string().nullish(),
  messages: z.array(Message).default([]),
});
export type Chat = z.infer<typeof Chat>;

// --- Imports + interview + calibration ------------------------------------- //

export const ImportResult = z.object({
  id: z.string(),
  name: z.string(),
  bbox: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  fits_build_volume: z.boolean(),
  watertight: z.boolean(),
});
export type ImportResult = z.infer<typeof ImportResult>;

export const InterviewResult = z.object({
  ok: z.boolean(),
  ready: z.boolean(),
  question: z.string().nullish(),
  suggestions: z.array(z.string()).nullish(),
  resolved_prompt: z.string().nullish(),
});
export type InterviewResult = z.infer<typeof InterviewResult>;

export const CalibrateRequest = z.object({
  target: z.enum(["cube", "benchy"]),
  printer_id: z.string().nullish(),
  filament_id: z.string().nullish(),
  settings: SliceSettings.nullish(),
});
export type CalibrateRequest = z.infer<typeof CalibrateRequest>;

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
