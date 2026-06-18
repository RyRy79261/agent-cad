import { describe, expect, it } from "vitest";
import type { ArtifactRef, Chat, SettingsDescriptor } from "@agent-cad/types";

import {
  buildSliceSettings,
  currentStep,
  currentStlUrl,
  formatPrintTime,
  isDirty,
  latestArtifact,
  sliceStatsFrom,
} from "./chat";

function chat(partial: Partial<Chat>): Chat {
  return {
    id: "c1",
    title: "t",
    created_at: 0,
    updated_at: 0,
    status: "new",
    messages: [],
    ...partial,
  } as Chat;
}

const descriptor: SettingsDescriptor = {
  printer_id: "ender5s1",
  printer_name: "Ender 5 S1",
  schema_version: 1,
  groups: [{ id: "quality", label: "Quality", default_expanded: true }],
  fields: [
    {
      key: "layer_height",
      label: "Layer height",
      input_type: "select",
      scope: "process",
      binding: "per-slice",
      group: "quality",
      default: 0.2,
      advanced: false,
    },
    {
      key: "infill_density",
      label: "Infill",
      input_type: "percent",
      scope: "process",
      binding: "per-slice",
      group: "infill",
      default: 15,
      advanced: false,
    },
  ] as SettingsDescriptor["fields"],
};

describe("chat helpers", () => {
  it("formats print time", () => {
    expect(formatPrintTime(0)).toBe("—");
    expect(formatPrintTime(90)).toBe("1m");
    expect(formatPrintTime(3720)).toBe("1h 2m");
  });

  it("maps status to the footer step", () => {
    expect(currentStep("new")).toBe(0);
    expect(currentStep("interviewing")).toBe(1);
    expect(currentStep("generating")).toBe(2);
    expect(currentStep("ready-to-print")).toBe(3);
  });

  it("derives the current STL url only when present", () => {
    expect(currentStlUrl(chat({ current_stl: null }))).toBeNull();
    expect(currentStlUrl(chat({ current_stl: "m.stl" }))).toContain("/chats/c1/artifacts/m.stl");
  });

  it("finds the latest artifact of a kind and its slice stats", () => {
    const ref: ArtifactRef = {
      kind: "gcode",
      name: "p.gcode",
      url: "/chats/c1/artifacts/p.gcode",
      slice_info: { plates: [{ print_time_s: 3600, length_m: 2.5, weight_g: 8, layer_count: 100 }] },
    } as ArtifactRef;
    const c = chat({ messages: [{ role: "assistant", content: "x", ts: 1, artifact_refs: [ref] }] as Chat["messages"] });
    expect(latestArtifact(c, "gcode")?.name).toBe("p.gcode");
    expect(latestArtifact(c, "generated")).toBeNull();
    expect(sliceStatsFrom(ref)?.layer_count).toBe(100);
  });

  it("isDirty only when a value differs from the descriptor default", () => {
    expect(isDirty(descriptor, {})).toBe(false);
    expect(isDirty(descriptor, { layer_height: 0.2 })).toBe(false);
    expect(isDirty(descriptor, { layer_height: 0.28 })).toBe(true);
  });

  it("buildSliceSettings reconstructs defaults + overrides (skips raw)", () => {
    expect(buildSliceSettings(descriptor, {})).toEqual({ layer_height: 0.2, infill_density: 15 });
    expect(buildSliceSettings(descriptor, { infill_density: 40 })).toEqual({
      layer_height: 0.2,
      infill_density: 40,
    });
  });
});
