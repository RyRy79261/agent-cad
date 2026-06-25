/** Pure helpers that derive UI state from a Chat record (artifacts, stats, status). */
import type { ArtifactRef, Chat, SettingsDescriptor, SliceSettings } from "@agent-cad/types";

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
  const cp = buildCheckpoint(values);
  if (cp) body.checkpoint = cp;
  return body as SliceSettings;
}

/** A per-height temp/fan change isn't a descriptor field — assemble it from its own flat keys. */
export function buildCheckpoint(values: Record<string, unknown>): Record<string, unknown> | null {
  const from = values["checkpoint_from_pct"];
  if (typeof from !== "number") return null;
  const temp = values["checkpoint_nozzle_temp"];
  const fan = values["checkpoint_fan_percent"];
  if (typeof temp !== "number" && typeof fan !== "number") return null; // nothing to change
  const cp: Record<string, unknown> = { from_pct: from };
  if (typeof temp === "number") cp.nozzle_temp = temp;
  if (typeof fan === "number") cp.fan_percent = fan;
  return cp;
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
