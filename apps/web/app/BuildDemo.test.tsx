import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// Stub next/dynamic so the R3F/three.js viewer never loads in jsdom.
vi.mock("next/dynamic", () => ({ default: () => () => null }));

import { BuildDemo } from "./BuildDemo";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockFetch(templates: Array<{ name: string; description: string }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).endsWith("/templates")) {
        return { ok: true, json: async () => templates };
      }
      return { ok: true, json: async () => ({}) };
    }),
  );
}

describe("BuildDemo", () => {
  it("renders the template gallery fetched from the API", async () => {
    mockFetch([
      { name: "box", description: "A hollow box" },
      { name: "bracket", description: "An L-bracket" },
    ]);

    render(<BuildDemo />);

    expect(await screen.findByText("box")).toBeTruthy();
    expect(await screen.findByText("bracket")).toBeTruthy();
    expect(screen.getByText("Build a part to see it here.")).toBeTruthy();
  });

  it("shows a friendly message when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => [] })));

    render(<BuildDemo />);

    expect(await screen.findByText(/Can't reach the API/)).toBeTruthy();
  });

  it("builds then slices, surfacing the g-code download + bed-leveling guide", async () => {
    mockFlow();
    render(<BuildDemo />);

    fireEvent.click(await screen.findByText("box"));
    fireEvent.click(await screen.findByText(/Slice for Ender 5 S1/));

    expect(await screen.findByText(/Download g-code/)).toBeTruthy();
    expect(screen.getByText(/Get your printer ready/)).toBeTruthy();
  });

  it("explains when slicing fails for lack of a slicer", async () => {
    mockFlow({ sliceOk: false });
    render(<BuildDemo />);

    fireEvent.click(await screen.findByText("box"));
    fireEvent.click(await screen.findByText(/Slice for Ender 5 S1/));

    expect(await screen.findByText(/OrcaSlicer isn't installed/)).toBeTruthy();
  });

  it("resolves a typed prompt to a template and builds it", async () => {
    mockFlow();
    render(<BuildDemo />);

    // The default prompt "calibration cube" resolves to the cube template.
    fireEvent.click(await screen.findByText("Design it"));

    expect(await screen.findByText(/Slice for Ender 5 S1/)).toBeTruthy();
  });
});

const ok = (value: unknown) => ({ ok: true, json: async () => value });

function mockFlow(opts: { sliceOk?: boolean } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, "");
      void init;
      let m: RegExpMatchArray | null;
      if (path.endsWith("/templates"))
        return ok([
          { name: "cube", description: "A calibration cube" },
          { name: "box", description: "A box" },
        ]);
      if ((m = path.match(/\/templates\/(\w+)\/build$/))) return ok({ job_id: `build-${m[1]}` });
      if ((m = path.match(/\/templates\/(\w+)\/slice$/))) return ok({ job_id: `slice-${m[1]}` });
      if (path.includes("/jobs/build-"))
        return ok({
          status: "succeeded",
          result: {
            artifact_urls: { stl: "/artifacts/x/x.stl" },
            metadata: { bounding_box_mm: { x: 20, y: 20, z: 20 }, fits_build_volume: true },
            verification: { printable: true, checks: [] },
          },
        });
      if (path.includes("/jobs/slice-"))
        return opts.sliceOk === false
          ? ok({ status: "failed", error: "OrcaSlicer executable not found", result: { ok: false, error: "OrcaSlicer executable not found" } })
          : ok({
              status: "succeeded",
              result: { ok: true, gcode_url: "/artifacts/x/x.gcode", info: { plates: [{ print_time_s: 1448, filaments: [{ used_m: "2.19" }] }] } },
            });
      return ok({});
    }),
  );
}
