/**
 * Typed client for the Agent CAD API (the FastAPI server in `services/api`).
 *
 * Every response is parsed through the shared Zod schemas in `@agent-cad/types`, so the
 * UI gets validated, typed data and we catch contract drift at runtime. Long operations
 * (generate / refine / slice / calibrate) return a {@link JobRef}; poll it with
 * {@link pollJob}, or use {@link runJob} to submit-and-wait.
 */
import {
  Chat,
  CalibrateRequest,
  DEFAULT_API_URL,
  type FilamentProfile,
  ImportResult,
  InterviewResult,
  Job,
  JobRef,
  Printer,
  Settings,
  SettingsDescriptor,
  type SliceSettings,
} from "@agent-cad/types";
import { z } from "zod";

export const API_URL = process.env.NEXT_PUBLIC_AGENT_CAD_API_URL ?? DEFAULT_API_URL;

/** A non-2xx response from the API. `status` is the HTTP code; `detail` is the API's reason. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`API ${status}: ${detail}`);
    this.name = "ApiError";
  }
}

/** Prefix an API-relative path (e.g. a returned `gcode_url`) with the API origin. */
export const assetUrl = (path: string): string => `${API_URL}${path}`;

function jsonInit(method: string, body?: unknown): RequestInit {
  if (body === undefined) return { method };
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function request<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  init?: RequestInit,
): Promise<z.infer<S>> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { detail?: unknown };
      if (j?.detail != null) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* non-JSON error body — keep statusText */
    }
    throw new ApiError(res.status, detail);
  }
  return schema.parse(await res.json()) as z.infer<S>;
}

const Ok = z.object({ ok: z.boolean() });

// --- settings -------------------------------------------------------------- //
export const getSettings = () => request("/settings", Settings);
export const updateSettings = (s: Settings) => request("/settings", Settings, jsonInit("PUT", s));

// --- printer + filament registry ------------------------------------------ //
export const listPrinters = () => request("/printers", z.array(Printer));
export const getPrinter = (id: string) => request(`/printers/${id}`, Printer);
export const createPrinter = (p: Printer) => request("/printers", Printer, jsonInit("POST", p));
export const updatePrinter = (id: string, p: Printer) => request(`/printers/${id}`, Printer, jsonInit("PUT", p));
export const deletePrinter = (id: string) => request(`/printers/${id}`, Ok, jsonInit("DELETE"));
export const createFilament = (printerId: string, f: FilamentProfile) =>
  request(`/printers/${printerId}/filaments`, Printer, jsonInit("POST", f));
export const updateFilament = (printerId: string, filamentId: string, f: FilamentProfile) =>
  request(`/printers/${printerId}/filaments/${filamentId}`, Printer, jsonInit("PUT", f));
export const deleteFilament = (printerId: string, filamentId: string) =>
  request(`/printers/${printerId}/filaments/${filamentId}`, Printer, jsonInit("DELETE"));
export const getSettingsDescriptor = (printerId: string, filamentId?: string) =>
  request(
    `/printers/${printerId}/settings-descriptor${filamentId ? `?filament=${encodeURIComponent(filamentId)}` : ""}`,
    SettingsDescriptor,
  );

// --- chats ----------------------------------------------------------------- //
export const listChats = () => request("/chats", z.array(Chat));
export const createChat = (body: { title?: string; prompt?: string } = {}) =>
  request("/chats", Chat, jsonInit("POST", body));
export const getChat = (id: string) => request(`/chats/${id}`, Chat);
export const deleteChat = (id: string) => request(`/chats/${id}`, Ok, jsonInit("DELETE"));
export const appendMessage = (id: string, content: string, role = "user") =>
  request(`/chats/${id}/messages`, Chat, jsonInit("POST", { role, content }));
export const chatGenerate = (id: string, prompt: string) =>
  request(`/chats/${id}/generate`, JobRef, jsonInit("POST", { prompt }));
export const chatRefine = (id: string, instruction: string) =>
  request(`/chats/${id}/refine`, JobRef, jsonInit("POST", { instruction }));
/** A message on an existing model: the agent talks back, or surgically edits when you want a change. */
export const chatRespond = (id: string, instruction: string) =>
  request(`/chats/${id}/respond`, JobRef, jsonInit("POST", { instruction }));
export const chatInterview = (id: string, prompt: string) =>
  request(`/chats/${id}/interview`, JobRef, jsonInit("POST", { prompt }));
export const chatSlice = (id: string, body: { filament_id?: string; settings?: SliceSettings } = {}) =>
  request(`/chats/${id}/slice`, JobRef, jsonInit("POST", body));
export const attachImport = (chatId: string, importId: string) =>
  request(`/chats/${chatId}/imports/${importId}/attach`, Chat, jsonInit("POST"));

// --- persistent references (images / STL renders the model views every turn) ---- //
export async function addReference(chatId: string, file: File): Promise<z.infer<typeof Chat>> {
  const form = new FormData();
  form.append("file", file);
  return request(`/chats/${chatId}/references`, Chat, { method: "POST", body: form });
}
export const removeReference = (chatId: string, refId: string) =>
  request(`/chats/${chatId}/references/${refId}`, Chat, jsonInit("DELETE"));

// --- imports + calibration ------------------------------------------------- //
export async function importStl(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  return request("/imports", ImportResult, { method: "POST", body: form });
}
export const calibrate = (body: CalibrateRequest) => request("/calibrate", JobRef, jsonInit("POST", body));
const Sample = z.object({ name: z.string(), description: z.string().nullish(), available: z.boolean() });
export const getSamples = () => request("/samples", z.array(Sample));

// --- storage & data management --------------------------------------------- //
const Usage = z.object({
  chats: z.number(),
  models: z.number(),
  slices: z.number(),
  bytes_used: z.number(),
  artifact_bytes: z.number(),
});
export const storageUsage = () => request("/storage/usage", Usage);
export const revealStorage = () =>
  request("/storage/reveal", z.object({ ok: z.boolean(), path: z.string(), opener: z.string().nullish() }), jsonInit("POST"));
export const clearArtifacts = () => request("/storage/clear-artifacts", z.object({ bytes_freed: z.number() }), jsonInit("POST"));
export const clearChats = () => request("/storage/clear-chats", z.object({ removed: z.number() }), jsonInit("POST"));
export const resetStore = () => request("/storage/reset", Ok, jsonInit("POST", { confirm: true }));

// --- interview result (the /interview job's terminal payload) -------------- //
export const InterviewJobResult = InterviewResult;

// --- jobs ------------------------------------------------------------------ //
const TERMINAL = new Set(["succeeded", "failed", "interrupted"]);
export const getJob = (id: string) => request(`/jobs/${id}`, Job);

export interface PollOptions {
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
}

/** Poll a job until it reaches a terminal state (succeeded / failed / interrupted). */
export async function pollJob(jobId: string, opts: PollOptions = {}): Promise<z.infer<typeof Job>> {
  const { timeoutMs = 300_000, intervalMs = 250, signal } = opts;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await getJob(jobId);
    if (TERMINAL.has(job.status)) return job;
    if (Date.now() > deadline) throw new ApiError(408, `job ${jobId} timed out after ${timeoutMs}ms`);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, intervalMs);
      signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  }
}

/** Submit a job-returning request and wait for it to finish. */
export async function runJob(
  submit: () => Promise<z.infer<typeof JobRef>>,
  opts?: PollOptions,
): Promise<z.infer<typeof Job>> {
  const ref = await submit();
  return pollJob(ref.job_id, opts);
}
