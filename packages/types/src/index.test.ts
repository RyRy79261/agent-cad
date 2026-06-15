import { describe, expect, it } from "vitest";
import {
  BuildRequest,
  BuildResult,
  Chat,
  ENDER_5_S1,
  Printer,
  SettingsDescriptor,
  Settings,
  SliceSettings,
  Verification,
} from "./index";

// A realistic payload from `cad build --verify --json` (the runner's to_dict()).
// If the Python side changes shape, these parses fail — that's the point.
const RUNNER_PAYLOAD = {
  ok: true,
  model_path: "/p/box/model.py",
  artifacts: { stl: "/p/box/box.stl", step: "/p/box/box.step" },
  metadata: {
    bounding_box_mm: { x: 80, y: 60, z: 40 },
    volume_mm3: 33951.45,
    printer: "Creality Ender 5 S1",
    build_volume_mm: { x: 220, y: 220, z: 280 },
    fits_build_volume: true,
    build_volume_overflow_mm: { x: 0, y: 0, z: 0 },
    requires_rotation: false,
  },
  verification: {
    printable: true,
    summary: "6/6 checks passed",
    checks: [
      { name: "valid_geometry", passed: true, severity: "error", detail: "OCCT reports valid B-rep" },
      { name: "watertight_mesh", passed: true, severity: "error", detail: "watertight + manifold" },
    ],
  },
  stdout: "",
  stderr: "",
  error: null,
  engine: "build123d",
};

describe("BuildResult", () => {
  it("parses a real runner payload (verification + fit metadata)", () => {
    const parsed = BuildResult.parse(RUNNER_PAYLOAD);
    expect(parsed.verification?.printable).toBe(true);
    expect(parsed.metadata.fits_build_volume).toBe(true);
    expect(parsed.metadata.bounding_box_mm?.x).toBe(80);
  });

  it("accepts a build with verification omitted (verify not requested)", () => {
    const { verification, ...withoutVerify } = RUNNER_PAYLOAD;
    void verification;
    const parsed = BuildResult.parse(withoutVerify);
    expect(parsed.verification ?? null).toBeNull();
  });

  it("rejects a malformed verification severity", () => {
    const bad = { ...RUNNER_PAYLOAD, verification: { printable: true, summary: "x", checks: [{ name: "n", passed: true, severity: "fatal", detail: "d" }] } };
    expect(() => Verification.parse(bad.verification)).toThrow();
  });
});

describe("BuildRequest", () => {
  it("applies defaults for formats and verify", () => {
    const r = BuildRequest.parse({ model_path: "m.py" });
    expect(r.formats).toEqual(["stl", "step", "3mf", "svg"]);
    expect(r.verify).toBe(false);
  });
});

describe("ENDER_5_S1", () => {
  it("mirrors the Python printer profile (cad.printer.ENDER_5_S1)", () => {
    expect(ENDER_5_S1.name).toBe("Creality Ender 5 S1");
    expect(ENDER_5_S1.build_volume).toEqual({ x: 220, y: 220, z: 280 });
    expect(ENDER_5_S1.bed_margin_mm).toBe(5);
  });
});

describe("SliceSettings + registry (mirror schemas.py)", () => {
  it("parses the seeded PLA slice settings", () => {
    const s = SliceSettings.parse({
      flow: 0.95, nozzle_temp: 220, bed_temp: 60, wall_speed: 25,
      retraction_length: 1, layer_height: 0.2, wall_loops: 2,
      infill_density: 15, infill_pattern: "crosshatch", seam_position: "aligned",
    });
    expect(s.flow).toBe(0.95);
  });

  it("rejects an out-of-enum infill_pattern (the Literal hole closed in Python too)", () => {
    expect(() => SliceSettings.parse({ infill_pattern: "bogus" })).toThrow();
  });

  it("rejects out-of-range flow", () => {
    expect(() => SliceSettings.parse({ flow: 2 })).toThrow();
  });

  it("Settings defaults active_model and rejects negative auto_clear_days", () => {
    expect(Settings.parse({}).active_model).toBe("claude-opus-4-8");
    expect(() => Settings.parse({ auto_clear_days: -1 })).toThrow();
  });

  it("Printer mirrors the seeded Ender 5 S1 registry record", () => {
    const p = Printer.parse({
      id: "ender5s1", name: "Creality Ender 5 S1",
      build_volume: { x: 220, y: 220, z: 280 },
      nozzle_diameter_mm: 0.4, firmware: "Marlin", default: true,
      filaments: [{ id: "pla", name: "Generic PLA", material: "PLA" }],
    });
    expect(p.kind).toBe("FDM");
    expect(p.filaments[0]?.material).toBe("PLA");
  });
});

describe("Chat + SettingsDescriptor (mirror schemas.py)", () => {
  it("parses a chat thread with an artifact ref", () => {
    const chat = Chat.parse({
      id: "abc", title: "Coaster", created_at: 1, updated_at: 2, status: "model-ready",
      current_stl: "model.stl",
      messages: [
        { role: "user", content: "a coaster", ts: 1 },
        { role: "assistant", content: "here you go", ts: 2,
          artifact_refs: [{ kind: "generated", name: "model.stl", url: "/chats/abc/artifacts/model.stl", fmt: "stl" }] },
      ],
    });
    expect(chat.messages[1]?.artifact_refs[0]?.kind).toBe("generated");
  });

  it("parses a settings descriptor", () => {
    const d = SettingsDescriptor.parse({
      printer_id: "ender5s1", printer_name: "Creality Ender 5 S1",
      groups: [{ id: "quality", label: "Quality" }],
      fields: [{ key: "wall_speed", label: "Print speed", input_type: "slider",
        scope: "process", binding: "per-slice", group: "quality", min: 5, max: 120 }],
    });
    expect(d.fields[0]?.key).toBe("wall_speed");
    expect(d.groups[0]?.default_expanded).toBe(true);
  });
});
