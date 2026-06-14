"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { DEFAULT_API_URL, type BuildResult } from "@agent-cad/types";

// three.js viewers can't server-render — load them client-side only.
const StlViewer = dynamic(() => import("@agent-cad/viewer").then((m) => m.StlViewer), {
  ssr: false,
  loading: () => <Hint>Loading 3D viewer…</Hint>,
});
const GcodeViewer = dynamic(() => import("@agent-cad/viewer").then((m) => m.GcodeViewer), {
  ssr: false,
  loading: () => <Hint>Loading toolpath…</Hint>,
});

const API_URL = process.env.NEXT_PUBLIC_AGENT_CAD_API_URL ?? DEFAULT_API_URL;

interface TemplateInfo {
  name: string;
  description: string;
}

type TemplateBuildResult = BuildResult & { artifact_urls?: Record<string, string> };

interface SliceInfo {
  print_time_s?: number;
  weight_g?: number | null;
  filaments?: Array<{ used_m?: string; type?: string }>;
}
type SliceResult = {
  ok: boolean;
  gcode_url?: string;
  error?: string | null;
  info?: { plates?: SliceInfo[] };
};

type Status = "idle" | "building" | "done" | "error";
type SliceStatus = "idle" | "slicing" | "done" | "error";
type View = "model" | "gcode";

export function BuildDemo() {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [stlUrl, setStlUrl] = useState<string | null>(null);
  const [result, setResult] = useState<TemplateBuildResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sliceStatus, setSliceStatus] = useState<SliceStatus>("idle");
  const [gcodeUrl, setGcodeUrl] = useState<string | null>(null);
  const [sliceInfo, setSliceInfo] = useState<SliceInfo | null>(null);
  const [sliceError, setSliceError] = useState<string | null>(null);
  const [view, setView] = useState<View>("model");
  const [prompt, setPrompt] = useState("calibration cube");

  useEffect(() => {
    fetch(`${API_URL}/templates`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setTemplates)
      .catch(() => setError("Can't reach the API. Start it with `pnpm py:api`."));
  }, []);

  function resetSlice() {
    setSliceStatus("idle");
    setGcodeUrl(null);
    setSliceInfo(null);
    setSliceError(null);
  }

  async function buildAndView(name: string) {
    setActive(name);
    setStatus("building");
    setStlUrl(null);
    setResult(null);
    setError(null);
    setView("model");
    resetSlice();
    try {
      const ref = await postJson(`${API_URL}/templates/${name}/build`);
      const job = await pollJob(ref.job_id);
      if (job.status !== "succeeded") throw new Error(job.error ?? "build failed");
      const res = job.result as TemplateBuildResult;
      const path = res.artifact_urls?.stl;
      if (!path) throw new Error("build produced no STL");
      setResult(res);
      setStlUrl(`${API_URL}${path}`);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  async function sliceForPrint() {
    if (!active) return;
    setSliceStatus("slicing");
    setSliceError(null);
    setGcodeUrl(null);
    try {
      const ref = await postJson(`${API_URL}/templates/${active}/slice`);
      const job = await pollJob(ref.job_id, 180_000);
      const res = (job.result ?? {}) as SliceResult;
      if (job.status !== "succeeded" || !res.gcode_url) {
        throw new Error(res.error ?? job.error ?? "slicing failed");
      }
      setGcodeUrl(`${API_URL}${res.gcode_url}`);
      setSliceInfo(res.info?.plates?.[0] ?? null);
      setSliceStatus("done");
      setView("gcode");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // The most common cause is no local slicer — make that legible.
      setSliceError(
        /orcaslicer/i.test(msg)
          ? "OrcaSlicer isn't installed/configured. See docs/prerequisites.md."
          : msg,
      );
      setSliceStatus("error");
    }
  }

  function onPromptSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = resolvePrompt(prompt);
    if (name) buildAndView(name);
    else setError("Try something like: calibration cube, box, bracket, plate, standoff.");
  }

  const meta = result?.metadata;
  const verification = result?.verification;
  const busy = status === "building" || sliceStatus === "slicing";

  return (
    <div style={styles.grid}>
      <section>
        <h2 style={styles.h2}>1 · Describe a part</h2>
        <form onSubmit={onPromptSubmit} style={styles.promptRow}>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. a calibration cube"
            disabled={busy}
            aria-label="describe a part"
            style={styles.promptInput}
          />
          <button type="submit" disabled={busy} style={styles.primary}>
            {status === "building" ? "Designing…" : "Design it"}
          </button>
        </form>
        <p style={styles.sub}>…or pick a known-good template:</p>
        <div style={styles.gallery}>
          {templates.length === 0 && !error ? <Hint>Loading templates…</Hint> : null}
          {templates.map((t) => (
            <button
              key={t.name}
              onClick={() => buildAndView(t.name)}
              disabled={status === "building" || sliceStatus === "slicing"}
              style={{ ...styles.card, ...(active === t.name ? styles.cardActive : {}) }}
            >
              <strong style={{ textTransform: "capitalize" }}>{t.name}</strong>
              <span style={styles.cardDesc}>{t.description}</span>
            </button>
          ))}
        </div>

        {error ? <p style={styles.error}>⚠ {error}</p> : null}

        {status !== "idle" ? (
          <>
            <h2 style={styles.h2}>2 · Build result</h2>
            {status === "building" ? <Hint>Building “{active}” on the server…</Hint> : null}
            {status === "done" && meta ? (
              <div style={styles.facts}>
                <Fact label="Size">
                  {meta.bounding_box_mm
                    ? `${meta.bounding_box_mm.x} × ${meta.bounding_box_mm.y} × ${meta.bounding_box_mm.z} mm`
                    : "—"}
                </Fact>
                <Fact label="Bed fit">{meta.fits_build_volume ? "✓ fits" : "⚠ no"}</Fact>
                <Fact label="Printable">
                  {verification ? (verification.printable ? "✓ yes" : "✗ no") : "—"}
                </Fact>
              </div>
            ) : null}
          </>
        ) : null}

        {status === "done" ? (
          <>
            <h2 style={styles.h2}>3 · Slice for printing</h2>
            <button
              onClick={sliceForPrint}
              disabled={sliceStatus === "slicing"}
              style={styles.primary}
            >
              {sliceStatus === "slicing" ? "Slicing…" : "🖨 Slice for Ender 5 S1"}
            </button>
            {sliceError ? <p style={styles.error}>⚠ {sliceError}</p> : null}
            {sliceStatus === "done" ? (
              <>
                <div style={styles.facts}>
                  <Fact label="Print time">{fmtTime(sliceInfo?.print_time_s)}</Fact>
                  <Fact label="Filament">{fmtFilament(sliceInfo)}</Fact>
                </div>
                {gcodeUrl ? (
                  <button onClick={() => downloadGcode(gcodeUrl, `${active}.gcode`)} style={styles.primary}>
                    ⬇ Download g-code (for SD card)
                  </button>
                ) : null}
                <CalibrationGuide />
              </>
            ) : null}
          </>
        ) : null}
      </section>

      <section>
        <div style={styles.tabs}>
          <Tab on={() => setView("model")} active={view === "model"} disabled={!stlUrl}>
            Model
          </Tab>
          <Tab on={() => setView("gcode")} active={view === "gcode"} disabled={!gcodeUrl}>
            Toolpath
          </Tab>
        </div>
        <div style={styles.viewer}>
          {view === "gcode" && gcodeUrl ? (
            <GcodeViewer url={gcodeUrl} />
          ) : stlUrl ? (
            <StlViewer url={stlUrl} />
          ) : (
            <Hint>{status === "building" ? "Rendering…" : "Build a part to see it here."}</Hint>
          )}
        </div>
        <p style={styles.sub}>Drag to orbit · scroll to zoom{view === "gcode" ? " · slider scrubs layers" : ""}</p>
      </section>
    </div>
  );
}

function CalibrationGuide() {
  return (
    <details style={styles.guide}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>🛠 Get your printer ready (bed leveling)</summary>
      <ol style={{ fontSize: "0.82rem", color: "#444", lineHeight: 1.5, paddingLeft: 18 }}>
        <li>Home Z, move the nozzle to the centre. Slide a sheet of A4 paper under it and lower until you feel light drag (~0.1 mm).</li>
        <li>Repeat at each of the 4 corners, turning that corner&apos;s knob to the same paper-drag feel.</li>
        <li>Run <code>AUTO-LVL → Start</code> (CR-Touch) until it reaches 100%.</li>
        <li>On the first layer, nudge the live <strong>Z-offset</strong> until the lines just squish together.</li>
        <li>Copy the g-code to a FAT32 SD card (short name, in the root) and print.</li>
      </ol>
      <p style={{ fontSize: "0.78rem", color: "#888", margin: 0 }}>Full guide: docs/printer-ender5s1.md</p>
    </details>
  );
}

async function downloadGcode(url: string, filename: string) {
  // Cross-origin download attribute is ignored, so fetch the blob and save it.
  const blob = await (await fetch(url)).blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

function fmtTime(seconds?: number): string {
  if (!seconds) return "—";
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

function fmtFilament(info: SliceInfo | null): string {
  const used = info?.filaments?.[0]?.used_m;
  const grams = info?.weight_g;
  const parts: string[] = [];
  if (used) parts.push(`${used} m`);
  if (grams) parts.push(`${grams} g`);
  return parts.length ? parts.join(" · ") : "—";
}

/** Map a free-text prompt to a known-good template (fixed mapping for now;
 * later this becomes a generated model.py). */
function resolvePrompt(text: string): string | null {
  const t = text.toLowerCase();
  if (/calibrat|cube/.test(t)) return "cube";
  if (/bracket|angle/.test(t)) return "bracket";
  if (/plate|mount/.test(t)) return "plate";
  if (/standoff|spacer|pillar/.test(t)) return "standoff";
  if (/box|enclosure|case|container|tray/.test(t)) return "box";
  return null;
}

async function postJson(url: string) {
  const r = await fetch(url, { method: "POST" });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

async function pollJob(jobId: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await fetch(`${API_URL}/jobs/${jobId}`);
    if (r.ok) {
      const job = await r.json();
      if (job.status === "succeeded" || job.status === "failed") return job;
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error("job timed out");
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "#999", margin: 0 }}>{children}</p>;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={styles.factLabel}>{label}</div>
      <div>{children}</div>
    </div>
  );
}

function Tab({
  on,
  active,
  disabled,
  children,
}: {
  on: () => void;
  active: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={on}
      disabled={disabled}
      style={{
        ...styles.tab,
        ...(active ? styles.tabActive : {}),
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: { display: "grid", gridTemplateColumns: "minmax(300px, 1fr) minmax(320px, 1.2fr)", gap: "2rem", alignItems: "start" },
  h2: { fontSize: "1rem", margin: "1.5rem 0 0.25rem" },
  sub: { color: "#888", fontSize: "0.85rem", margin: "0.5rem 0 0.75rem" },
  promptRow: { display: "flex", gap: 8, alignItems: "stretch" },
  promptInput: { flex: 1, padding: "0.55rem 0.7rem", border: "1px solid #ccc", borderRadius: 8, fontSize: "0.95rem" },
  gallery: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" },
  card: { display: "flex", flexDirection: "column", gap: 4, textAlign: "left", padding: "0.75rem", border: "1px solid #ddd", borderRadius: 8, background: "#fff", cursor: "pointer" },
  cardActive: { border: "1px solid #c9a27a", boxShadow: "0 0 0 2px #c9a27a33" },
  cardDesc: { color: "#888", fontSize: "0.72rem", lineHeight: 1.3 },
  primary: { padding: "0.6rem 1rem", border: "1px solid #c9a27a", borderRadius: 8, background: "#c9a27a", color: "#fff", fontWeight: 600, cursor: "pointer", margin: "0.25rem 0" },
  facts: { display: "flex", gap: "1.5rem", margin: "0.5rem 0", flexWrap: "wrap" },
  factLabel: { color: "#999", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.03em" },
  error: { color: "#c62828", fontSize: "0.85rem" },
  guide: { marginTop: "0.75rem", padding: "0.5rem 0.75rem", border: "1px solid #eee", borderRadius: 8, background: "#fafafa" },
  tabs: { display: "flex", gap: 4, marginBottom: 6 },
  tab: { padding: "0.35rem 0.9rem", border: "1px solid #ddd", borderRadius: 6, background: "#fff", fontSize: "0.85rem" },
  tabActive: { border: "1px solid #c9a27a", background: "#c9a27a22", fontWeight: 600 },
  viewer: { height: 460, border: "1px solid #ddd", borderRadius: 8, background: "linear-gradient(#fafafa,#eee)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" },
};
