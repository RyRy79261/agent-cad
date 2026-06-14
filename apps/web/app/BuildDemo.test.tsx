import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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
});
