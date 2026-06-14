"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Printer } from "lucide-react";
import { DEFAULT_API_URL, type BuildResult } from "@agent-cad/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

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
type SliceResult = { ok: boolean; gcode_url?: string; error?: string | null; info?: { plates?: SliceInfo[] } };
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
      setSliceError(
        /orcaslicer/i.test(msg)
          ? "OrcaSlicer isn't installed/configured. See the Printer setup page."
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
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(300px,1fr)_minmax(340px,1.2fr)]">
      <div className="space-y-6">
        <section>
          <SectionTitle>1 · Describe a part</SectionTitle>
          <form onSubmit={onPromptSubmit} className="flex gap-2">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. a calibration cube"
              disabled={busy}
              aria-label="describe a part"
            />
            <Button type="submit" disabled={busy}>
              {status === "building" ? "Designing…" : "Design it"}
            </Button>
          </form>
          <p className="mb-2 mt-2 text-sm text-muted-foreground">…or pick a known-good template:</p>
          <div className="grid grid-cols-2 gap-2">
            {templates.map((t) => (
              <button
                key={t.name}
                onClick={() => buildAndView(t.name)}
                disabled={busy}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors hover:bg-accent disabled:opacity-50",
                  active === t.name && "border-primary ring-1 ring-primary",
                )}
              >
                <div className="font-semibold capitalize">{t.name}</div>
                <div className="text-xs leading-snug text-muted-foreground">{t.description}</div>
              </button>
            ))}
          </div>
          {error ? (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </section>

        {status !== "idle" ? (
          <section>
            <SectionTitle>2 · Build result</SectionTitle>
            {status === "building" ? (
              <Hint>Building “{active}” on the server…</Hint>
            ) : null}
            {status === "done" && meta ? (
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {meta.bounding_box_mm
                    ? `${meta.bounding_box_mm.x} × ${meta.bounding_box_mm.y} × ${meta.bounding_box_mm.z} mm`
                    : "—"}
                </Badge>
                <Badge variant={meta.fits_build_volume ? "secondary" : "destructive"}>
                  {meta.fits_build_volume ? "✓ fits bed" : "⚠ doesn't fit"}
                </Badge>
                <Badge variant={verification?.printable ? "secondary" : "destructive"}>
                  {verification?.printable ? "✓ printable" : "✗ not printable"}
                </Badge>
              </div>
            ) : null}
          </section>
        ) : null}

        {status === "done" ? (
          <section>
            <SectionTitle>3 · Slice for printing</SectionTitle>
            <Button onClick={sliceForPrint} disabled={sliceStatus === "slicing"} className="gap-2">
              <Printer className="h-4 w-4" />
              {sliceStatus === "slicing" ? "Slicing…" : "Slice for Ender 5 S1"}
            </Button>
            {sliceError ? (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>{sliceError}</AlertDescription>
              </Alert>
            ) : null}
            {sliceStatus === "done" ? (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">⏱ {fmtTime(sliceInfo?.print_time_s)}</Badge>
                  <Badge variant="outline">🧵 {fmtFilament(sliceInfo)}</Badge>
                </div>
                {gcodeUrl ? (
                  <Button
                    variant="secondary"
                    className="gap-2"
                    onClick={() => downloadGcode(gcodeUrl, `${active}.gcode`)}
                  >
                    <Download className="h-4 w-4" />
                    Download g-code (for SD card)
                  </Button>
                ) : null}
                <CalibrationGuide />
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      <div className="space-y-2">
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList>
            <TabsTrigger value="model" disabled={!stlUrl}>
              Model
            </TabsTrigger>
            <TabsTrigger value="gcode" disabled={!gcodeUrl}>
              Toolpath
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Card className="h-[460px] overflow-hidden p-0">
          {view === "gcode" && gcodeUrl ? (
            <GcodeViewer url={gcodeUrl} />
          ) : stlUrl ? (
            <StlViewer url={stlUrl} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {status === "building" ? "Rendering…" : "Build a part to see it here."}
              </p>
            </div>
          )}
        </Card>
        <p className="text-sm text-muted-foreground">
          Drag to orbit · scroll to zoom{view === "gcode" ? " · slider scrubs layers" : ""}
        </p>
      </div>
    </div>
  );
}

function CalibrationGuide() {
  return (
    <details className="rounded-lg border bg-muted/40 p-3 text-sm">
      <summary className="cursor-pointer font-semibold">🛠 Get your printer ready (bed leveling)</summary>
      <ol className="ml-4 mt-2 list-decimal space-y-1 text-muted-foreground">
        <li>Home Z, move the nozzle to the centre. Slide an A4 paper under it and lower until you feel light drag (~0.1 mm).</li>
        <li>Repeat at each of the 4 corners, turning that corner’s knob to the same feel.</li>
        <li>
          Run <code>AUTO-LVL → Start</code> (CR-Touch) until it reaches 100%.
        </li>
        <li>
          On the first layer, nudge the live <strong>Z-offset</strong> until the lines just squish together.
        </li>
      </ol>
      <p className="mt-2">
        <a href="/setup" className="font-semibold text-primary hover:underline">
          Full step-by-step setup guide →
        </a>
      </p>
    </details>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

async function downloadGcode(url: string, filename: string) {
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

/** Map a free-text prompt to a known-good template (fixed mapping for now). */
function resolvePrompt(text: string): string | null {
  const t = text.toLowerCase();
  if (/calibrat|cube/.test(t)) return "cube";
  if (/bracket|angle/.test(t)) return "bracket";
  if (/plate|mount/.test(t)) return "plate";
  if (/standoff|spacer|pillar/.test(t)) return "standoff";
  if (/box|enclosure|case|container|tray/.test(t)) return "box";
  return null;
}
