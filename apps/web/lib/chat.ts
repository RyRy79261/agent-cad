/** Pure helpers that derive UI state from a Chat record (artifacts, stats, status). */
import type { ArtifactRef, Chat, Checkpoint, SettingsDescriptor, SliceSettings } from "@agent-cad/types";

import { assetUrl } from "./api";

/** Append a cache-busting version so the viewer reloads when an artifact is overwritten. */
export function versioned(url: string, chat: Chat | null): string {
  if (!chat) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${Math.floor(chat.updated_at)}`;
}

/**
 * Absolute URL of the chat's current STL, or null if none generated yet. Carries a
 * `?v=updated_at` cache-buster: refine overwrites `model.stl` at the SAME path, and
 * without this the browser / three.js loader serve the stale geometry (so refines
 * appear to "do nothing").
 */
export function currentStlUrl(chat: Chat | null): string | null {
  if (!chat?.current_stl) return null;
  return versioned(assetUrl(`/chats/${chat.id}/artifacts/${chat.current_stl}`), chat);
}

/** The most recent artifact of a kind across the whole thread (latest wins). */
export function latestArtifact(chat: Chat | null, kind: string): ArtifactRef | null {
  if (!chat) return null;
  let found: ArtifactRef | null = null;
  for (const m of chat.messages) {
    for (const ref of m.artifact_refs ?? []) {
      if (ref.kind === kind) found = ref;
    }
  }
  return found;
}

export interface SliceStats {
  print_time_s?: number | null;
  length_m?: number | null;
  weight_g?: number | null;
  layer_count?: number | null;
}

/** Pull the first plate's stats out of an artifact's stored slice_info. */
export function sliceStatsFrom(ref: ArtifactRef | null): SliceStats | null {
  const info = ref?.slice_info as { plates?: SliceStats[] } | undefined;
  return info?.plates?.[0] ?? null;
}

/** True if any field's current value differs from its descriptor default. */
export function isDirty(descriptor: SettingsDescriptor | null, values: Record<string, unknown>): boolean {
  if (!descriptor) return false;
  return descriptor.fields.some((f) => {
    const v = values[f.key];
    return v !== undefined && v !== null && v !== f.default;
  });
}

/**
 * Reconstruct a full SliceSettings body from the descriptor's defaults (the
 * filament's saved values) plus the user's overrides — so sending `settings`
 * never drops the filament's other tuned values (the server takes `settings`
 * wholesale over `filament_id`).
 */
export function buildSliceSettings(
  descriptor: SettingsDescriptor,
  values: Record<string, unknown>,
): SliceSettings {
  const body: Record<string, unknown> = {};
  for (const f of descriptor.fields) {
    if (f.scope === "raw") continue;
    const v = values[f.key] ?? f.default;
    if (v !== undefined && v !== null && v !== "") body[f.key] = v;
  }
  return body as SliceSettings;
}

/**
 * The current effective values for a new checkpoint — the print's base settings (descriptor
 * defaults overlaid with the user's per-slice overrides). A checkpoint seeds from these so you
 * tweak from real numbers instead of blanks. fan/accel aren't in the slice settings (no known
 * base), so they stay blank = unchanged.
 */
export function checkpointDefaults(
  descriptor: SettingsDescriptor | null,
  values: Record<string, unknown>,
): Partial<Checkpoint> {
  const eff = (key: string): unknown => {
    const v = values[key];
    if (v != null && v !== "") return v;
    return descriptor?.fields.find((f) => f.key === key)?.default;
  };
  const out: Record<string, unknown> = { speed_percent: 100 };
  const nozzle = eff("nozzle_temp");
  if (typeof nozzle === "number") out.nozzle_temp = nozzle;
  const bed = eff("bed_temp");
  if (typeof bed === "number") out.bed_temp = bed;
  const flow = eff("flow");
  if (typeof flow === "number") out.flow_percent = Math.round(flow * 100);
  const jerk = eff("jerk");
  if (typeof jerk === "number") out.jerk = jerk;
  return out as Partial<Checkpoint>;
}

/**
 * The settings a NEW checkpoint should start from: the previous (last) checkpoint's settings — so a
 * second checkpoint continues where the first left off — or the print's base settings if it's the
 * first. Strips the anchor (from_pct/from_layer); only the value settings carry over.
 */
export function checkpointSeed(
  checkpoints: Checkpoint[],
  baseDefaults: Partial<Checkpoint>,
): Partial<Checkpoint> {
  const prev = checkpoints[checkpoints.length - 1];
  if (!prev) return baseDefaults;
  const settings: Partial<Checkpoint> = { ...prev };
  delete settings.from_pct;
  delete settings.from_layer;
  return settings;
}

/** The checkpoints actually injected into a sliced g-code artifact (persisted in slice_info).
 *  Prefers `applied` (what really went into the g-code) over `requested` — for the viewer markers. */
export function sliceCheckpointsFrom(ref: ArtifactRef | null): Checkpoint[] {
  const info = ref?.slice_info as { checkpoints?: { applied?: unknown; requested?: Checkpoint[] } } | undefined;
  const applied = info?.checkpoints?.applied;
  if (Array.isArray(applied)) return applied as Checkpoint[];
  return info?.checkpoints?.requested ?? [];
}

/** The checkpoints the user CONFIGURED for the last slice (requested) — for restoring the editor on
 *  reopen, so their setup survives even if a checkpoint didn't inject (or the slice predates a fix). */
export function sliceCheckpointsRequested(ref: ArtifactRef | null): Checkpoint[] {
  const info = ref?.slice_info as { checkpoints?: { requested?: Checkpoint[]; applied?: unknown } } | undefined;
  const requested = info?.checkpoints?.requested;
  if (Array.isArray(requested)) return requested;
  const applied = info?.checkpoints?.applied;
  return Array.isArray(applied) ? (applied as Checkpoint[]) : [];
}

/** Short summary of what a checkpoint changes, e.g. "200°C · fan 100% · 60% speed". */
export function checkpointLabel(cp: Checkpoint): string {
  const parts: string[] = [];
  if (cp.nozzle_temp != null) parts.push(`${cp.nozzle_temp}°C`);
  if (cp.bed_temp != null) parts.push(`bed ${cp.bed_temp}°C`);
  if (cp.fan_percent != null) parts.push(`fan ${cp.fan_percent}%`);
  if (cp.flow_percent != null) parts.push(`flow ${cp.flow_percent}%`);
  if (cp.speed_percent != null) parts.push(`${cp.speed_percent}% speed`);
  if (cp.jerk != null) parts.push(`jerk ${cp.jerk}`);
  if (cp.accel != null) parts.push(`accel ${cp.accel}`);
  return parts.join(" · ") || "no change";
}

/** Distinct marker colours for checkpoints, by index (cycles). */
export const CHECKPOINT_COLORS = ["#f59e0b", "#22d3ee", "#a78bfa", "#ec4899", "#34d399", "#fb7185"];

/** The slice settings used for the last slice (persisted in slice_info) → restore the panel on
 *  reopen, so an override the user set (e.g. a 3mm retraction) comes back instead of the default. */
export function sliceSettingsFrom(ref: ArtifactRef | null): Record<string, unknown> {
  const info = ref?.slice_info as { settings?: Record<string, unknown>; raw?: Record<string, string> } | undefined;
  const out: Record<string, unknown> =
    info?.settings && typeof info.settings === "object" ? { ...info.settings } : {};
  if (info?.raw && typeof info.raw === "object" && Object.keys(info.raw).length) out.raw = info.raw;
  return out;
}

/** Shallow value-equality of two SliceSettings-shaped maps (ignores `raw`, treats null≈absent). */
export function sameSettings(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) {
    if (k === "raw") continue;
    const va = a?.[k];
    const vb = b?.[k];
    if (va == null && vb == null) continue;
    if (va !== vb) return false;
  }
  return true;
}

export function formatPrintTime(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// --- chat.status → UI label, badge tone, and the footer stepper ------------- //

export type ChatStatus = "new" | "interviewing" | "generating" | "model-ready" | "ready-to-print" | string;

export const STATUS_LABEL: Record<string, string> = {
  new: "New",
  interviewing: "Interviewing",
  interviewed: "Interviewed",
  generating: "Generating…",
  "model-ready": "Model ready",
  "ready-to-print": "Ready to print",
};

export const STEPS = ["Describe", "Interview", "Generate", "Slice & print"] as const;

/** Index of the current step (0–3) given a chat status; earlier steps are complete. */
export function currentStep(status: ChatStatus): number {
  switch (status) {
    case "interviewing":
      return 1;
    case "interviewed":
    case "generating":
      return 2;
    case "model-ready":
      return 3;
    case "ready-to-print":
      return 3;
    default:
      return 0;
  }
}
