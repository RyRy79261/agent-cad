"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { DEFAULT_API_URL, type BuildResult } from "@agent-cad/types";

// three.js / R3F can't server-render — load the viewer client-side only.
const StlViewer = dynamic(() => import("@agent-cad/viewer").then((m) => m.StlViewer), {
  ssr: false,
  loading: () => <Hint>Loading 3D viewer…</Hint>,
});

const API_URL = process.env.NEXT_PUBLIC_AGENT_CAD_API_URL ?? DEFAULT_API_URL;

interface TemplateInfo {
  name: string;
  description: string;
}

/** result of /templates/{name}/build carries browser-loadable artifact URLs. */
type TemplateBuildResult = BuildResult & { artifact_urls?: Record<string, string> };

type Status = "idle" | "building" | "done" | "error";

export function BuildDemo() {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [stlUrl, setStlUrl] = useState<string | null>(null);
  const [result, setResult] = useState<TemplateBuildResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/templates`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setTemplates)
      .catch(() => setError("Can't reach the API. Start it with `pnpm py:api`."));
  }, []);

  async function buildAndView(name: string) {
    setActive(name);
    setStatus("building");
    setStlUrl(null);
    setResult(null);
    setError(null);
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

  const meta = result?.metadata;
  const verification = result?.verification;

  return (
    <div style={styles.grid}>
      <section>
        <h2 style={styles.h2}>1 · Pick a part</h2>
        <p style={styles.sub}>Each is a known-good parametric template. Click to build it on the server.</p>
        <div style={styles.gallery}>
          {templates.length === 0 && !error ? <Hint>Loading templates…</Hint> : null}
          {templates.map((t) => (
            <button
              key={t.name}
              onClick={() => buildAndView(t.name)}
              disabled={status === "building"}
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
            <h2 style={styles.h2}>2 · Result</h2>
            {status === "building" ? <Hint>Building “{active}” on the server…</Hint> : null}
            {status === "done" && meta ? (
              <div style={styles.facts}>
                <Fact label="Size">
                  {meta.bounding_box_mm
                    ? `${meta.bounding_box_mm.x} × ${meta.bounding_box_mm.y} × ${meta.bounding_box_mm.z} mm`
                    : "—"}
                </Fact>
                <Fact label="Bed fit">
                  {meta.fits_build_volume ? "✓ fits Ender 5 S1" : "⚠ does not fit"}
                </Fact>
                <Fact label="Printable">
                  {verification ? (verification.printable ? "✓ yes" : "✗ no") : "—"}
                </Fact>
              </div>
            ) : null}
            {status === "done" && verification ? (
              <ul style={styles.checks}>
                {verification.checks.map((c) => (
                  <li key={c.name} style={{ color: c.passed ? "#2e7d32" : "#c62828" }}>
                    {c.passed ? "✓" : "✗"} {c.name.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>

      <section>
        <h2 style={styles.h2}>3 · Preview</h2>
        <div style={styles.viewer}>
          {stlUrl ? (
            <StlViewer url={stlUrl} />
          ) : (
            <Hint>{status === "building" ? "Rendering…" : "Build a part to see it here."}</Hint>
          )}
        </div>
        {stlUrl ? <p style={styles.sub}>Drag to orbit · scroll to zoom</p> : null}
      </section>
    </div>
  );
}

async function postJson(url: string) {
  const r = await fetch(url, { method: "POST" });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

async function pollJob(jobId: string, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await fetch(`${API_URL}/jobs/${jobId}`);
    if (r.ok) {
      const job = await r.json();
      if (job.status === "succeeded" || job.status === "failed") return job;
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error("build timed out");
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

const styles: Record<string, React.CSSProperties> = {
  grid: { display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(320px, 1.2fr)", gap: "2rem", alignItems: "start" },
  h2: { fontSize: "1rem", margin: "1.5rem 0 0.25rem" },
  sub: { color: "#888", fontSize: "0.85rem", margin: "0 0 0.75rem" },
  gallery: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" },
  card: { display: "flex", flexDirection: "column", gap: 4, textAlign: "left", padding: "0.75rem", border: "1px solid #ddd", borderRadius: 8, background: "#fff", cursor: "pointer" },
  cardActive: { borderColor: "#c9a27a", boxShadow: "0 0 0 2px #c9a27a33" },
  cardDesc: { color: "#888", fontSize: "0.72rem", lineHeight: 1.3 },
  facts: { display: "flex", gap: "1.5rem", margin: "0.5rem 0" },
  factLabel: { color: "#999", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.03em" },
  checks: { listStyle: "none", padding: 0, margin: "0.25rem 0", fontSize: "0.82rem", display: "grid", gap: 2 },
  error: { color: "#c62828" },
  viewer: { height: 480, border: "1px solid #ddd", borderRadius: 8, background: "linear-gradient(#fafafa,#eee)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" },
};
