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

export const JobStatus = z.enum(["queued", "running", "succeeded", "failed"]);
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
});
export type Job = z.infer<typeof Job>;

export const BoundingBox = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});
export type BoundingBox = z.infer<typeof BoundingBox>;

export const BuildResult = z.object({
  ok: z.boolean(),
  model_path: z.string(),
  artifacts: z.record(z.string(), z.string()),
  metadata: z.object({
    bounding_box_mm: BoundingBox.optional(),
    volume_mm3: z.number().nullable().optional(),
  }),
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

/** Default local API base URL (the FastAPI server in `services/api`). */
export const DEFAULT_API_URL = "http://127.0.0.1:8000";
