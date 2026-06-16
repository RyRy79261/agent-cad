import { afterEach, describe, expect, it, vi } from "vitest";

import * as api from "./api";

type MockResult = { status?: number; json?: unknown };

function mockFetch(handler: (url: string, init?: RequestInit) => MockResult) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const { status = 200, json = {} } = handler(url, init);
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: `status ${status}`,
        json: async () => json,
      } as Response;
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("parses a settings response", async () => {
    mockFetch(() => ({ json: { active_model: "claude-opus-4-8", theme: "dark", auto_clear_days: 0 } }));
    const s = await api.getSettings();
    expect(s.active_model).toBe("claude-opus-4-8");
    expect(s.theme).toBe("dark");
  });

  it("throws ApiError carrying the API detail on non-2xx", async () => {
    mockFetch(() => ({ status: 404, json: { detail: "Unknown chat: x" } }));
    await expect(api.getChat("x")).rejects.toMatchObject({ status: 404, detail: "Unknown chat: x" });
  });

  it("createChat POSTs JSON and parses the chat", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    mockFetch((url, init) => {
      calls.push({ url, init });
      return { json: { id: "c1", title: "Coaster", created_at: 1, updated_at: 2, messages: [] } };
    });
    const chat = await api.createChat({ prompt: "a coaster" });
    expect(chat.id).toBe("c1");
    expect(calls[0]?.url).toContain("/chats");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({ prompt: "a coaster" });
  });

  it("importStl posts a FormData body", async () => {
    let sentBody: unknown;
    mockFetch((_url, init) => {
      sentBody = init?.body;
      return {
        json: { id: "i1", name: "cube.stl", bbox: { x: 20, y: 20, z: 20 }, fits_build_volume: true, watertight: true },
      };
    });
    const res = await api.importStl(new File([new Uint8Array([1, 2, 3])], "cube.stl"));
    expect(res.fits_build_volume).toBe(true);
    expect(sentBody).toBeInstanceOf(FormData);
  });

  it("pollJob polls until a terminal status", async () => {
    const statuses = ["queued", "running", "succeeded"];
    let i = 0;
    mockFetch(() => ({
      json: {
        id: "j1", kind: "cad.generate", status: statuses[Math.min(i++, 2)],
        created_at: 1, started_at: null, finished_at: null, result: null, error: null,
      },
    }));
    const job = await api.pollJob("j1", { intervalMs: 1 });
    expect(job.status).toBe("succeeded");
    expect(i).toBeGreaterThanOrEqual(3);
  });

  it("runJob submits then polls to completion", async () => {
    let n = 0;
    mockFetch((url) => {
      if (url.includes("/generate")) return { json: { job_id: "j2", kind: "cad.generate", status: "queued" } };
      n += 1;
      return {
        json: {
          id: "j2", kind: "cad.generate", status: n >= 2 ? "succeeded" : "running",
          created_at: 1, started_at: null, finished_at: null, result: { ok: true }, error: null,
        },
      };
    });
    const job = await api.runJob(() => api.chatGenerate("c1", "make a coaster"), { intervalMs: 1 });
    expect(job.status).toBe("succeeded");
  });

  it("assetUrl prefixes the API origin", () => {
    expect(api.assetUrl("/chats/c1/artifacts/model.stl")).toBe(`${api.API_URL}/chats/c1/artifacts/model.stl`);
  });
});
