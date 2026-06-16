/** Pure helpers that derive UI state from a Chat record (artifacts, stats, status). */
import type { ArtifactRef, Chat, SettingsDescriptor, SliceSettings } from "@agent-cad/types";

import { assetUrl } from "./api";

/** Absolute URL of the chat's current STL, or null if none generated yet. */
export function currentStlUrl(chat: Chat | null): string | null {
  if (!chat?.current_stl) return null;
  return assetUrl(`/chats/${chat.id}/artifacts/${chat.current_stl}`);
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
