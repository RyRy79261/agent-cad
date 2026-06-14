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
});

const ok = (value: unknown) => ({ ok: true, json: async () => value });

function mockFlow(opts: { sliceOk?: boolean } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, "");
      void init;
      if (path.endsWith("/templates")) return ok([{ name: "box", description: "A box" }]);
      if (path.endsWith("/templates/box/build")) return ok({ job_id: "b1" });
      if (path.endsWith("/jobs/b1"))
        return ok({
          status: "succeeded",
          result: {
            artifact_urls: { stl: "/artifacts/box/box.stl" },
            metadata: { bounding_box_mm: { x: 20, y: 20, z: 20 }, fits_build_volume: true },
            verification: { printable: true, checks: [] },
          },
        });
      if (path.endsWith("/templates/box/slice")) return ok({ job_id: "s1" });
      if (path.endsWith("/jobs/s1"))
        return opts.sliceOk === false
          ? ok({ status: "failed", error: "OrcaSlicer executable not found", result: { ok: false, error: "OrcaSlicer executable not found" } })
          : ok({
              status: "succeeded",
              result: { ok: true, gcode_url: "/artifacts/box/box.gcode", info: { plates: [{ print_time_s: 1448, filaments: [{ used_m: "2.19" }] }] } },
            });
      return ok({});
    }),
  );
}
