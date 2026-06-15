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
      if (String(url).endsWith("/samples")) {
        return { ok: true, json: async () => [] };
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

  it("generates a part from a free-text prompt, then offers to slice it", async () => {
    mockFlow();
    render(<BuildDemo />);

    // Free text hits the real /generate endpoint (mocked here).
    fireEvent.click(await screen.findByText("Generate"));

    expect(await screen.findByText(/Slice for Ender 5 S1/)).toBeTruthy();
    expect(screen.getByText(/Generated with/)).toBeTruthy();
  });

  it("surfaces a clear error when generation can't make a printable part", async () => {
    mockFlow({ generateOk: false });
    render(<BuildDemo />);

    fireEvent.click(await screen.findByText("Generate"));

    expect(await screen.findByText(/couldn't produce a printable part/i)).toBeTruthy();
  });

  it("stages a sample test model (3DBenchy) then slices it", async () => {
    mockFlow();
    render(<BuildDemo />);

    fireEvent.click(await screen.findByText("🚢 benchy"));
    // Staged model shows its size + an "imported model" badge, then slices.
    expect(await screen.findByText(/imported model/)).toBeTruthy();
    fireEvent.click(await screen.findByText(/Slice for Ender 5 S1/));
    expect(await screen.findByText(/Download g-code/)).toBeTruthy();
  });
});

const ok = (value: unknown) => ({ ok: true, json: async () => value });

function mockFlow(opts: { sliceOk?: boolean; generateOk?: boolean } = {}) {
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
      if (path.endsWith("/samples"))
        return ok([{ name: "benchy", description: "The classic torture-test boat.", available: true }]);
      if ((m = path.match(/\/templates\/(\w+)\/build$/))) return ok({ job_id: `build-${m[1]}` });
      if (path.endsWith("/generate")) return ok({ job_id: "gen-1" });
      if ((m = path.match(/\/samples\/([\w-]+)\/stage$/))) return ok({ job_id: `stage-${m[1]}` });
      if ((m = path.match(/\/(?:templates|generated|samples)\/([\w-]+)\/slice(?:\?|$)/)))
        return ok({ job_id: `slice-${m[1]}` });
      if (path.includes("/jobs/stage-"))
        return ok({
          status: "succeeded",
          result: {
            name: "benchy",
            artifact_urls: { stl: "/artifacts/benchy/benchy.stl" },
            metadata: { bounding_box_mm: { x: 60, y: 31, z: 48 }, fits_build_volume: true },
          },
        });
      if (path.includes("/jobs/build-"))
        return ok({
          status: "succeeded",
          result: {
            artifact_urls: { stl: "/artifacts/x/x.stl" },
            metadata: { bounding_box_mm: { x: 20, y: 20, z: 20 }, fits_build_volume: true },
            verification: { printable: true, checks: [] },
          },
        });
      if (path.includes("/jobs/gen-"))
        return ok(
          opts.generateOk === false
            ? {
                status: "succeeded",
                result: {
                  ok: false,
                  name: "coaster",
                  driver: "claude-code",
                  error: "couldn't produce a printable part in 3 attempts",
                  attempts: [{ round: 3, ok: true, printable: false, summary: "NOT printable" }],
                },
              }
            : {
                status: "succeeded",
                result: {
                  ok: true,
                  name: "coaster",
                  driver: "claude-code",
                  rounds: 1,
                  artifact_urls: { stl: "/artifacts/coaster/coaster.stl" },
                  build: {
                    metadata: { bounding_box_mm: { x: 90, y: 90, z: 6 }, fits_build_volume: true },
                    verification: { printable: true, checks: [] },
                  },
                },
              },
        );
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
