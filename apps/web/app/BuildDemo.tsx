"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Info, Printer, Save, Trash2 } from "lucide-react";
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

// Beginner-friendly explanations for each slice setting (shown as ⓘ tooltips).
const TIPS = {
  infill: "How much plastic fills the inside (a lattice, not solid). Higher = stronger & heavier but slower. 15–20% is typical.",
  wallSpeed: "How fast the outer/inner walls print. Slower = cleaner walls and less corner bulge, but longer prints.",
  jerk: "How abruptly the nozzle can change direction. Higher = sharper corners (less bulge) but risks ringing; lower = smoother but rounder corners.",
  bedTemp: "Heated-bed temperature. PLA grips a textured plate best around 55–60 °C. Too cold = poor first-layer adhesion / warping.",
  nozzleTemp: "How hot the molten plastic is. PLA ~200 °C. Too low = weak/under-extruded; too high = stringing.",
  flow: "Multiplier on how much plastic is pushed. 0.98 = 2% under nominal. Lower if walls measure oversize — calibrate, don't guess.",
  retraction: "How far filament is pulled back on travel moves to stop oozing/stringing. The Sprite direct drive likes ~0.5–1.5 mm.",
  layerHeight: "Thickness of each printed layer. Smaller = smoother & more detail but slower; 0.2 mm is the reliable default.",
  wallLoops: "Number of perimeter outlines (shells) around each layer. More = stronger & more watertight; 2 is standard, 3–4 for sturdy parts.",
  topLayers: "Solid layers that cap the top. Too few = holes/pillowing on the top surface; 5–7 is typical.",
  bottomLayers: "Solid layers on the bottom. More = a stronger, less see-through base.",
  infillPattern: "Shape of the internal fill. Crosshatch/grid are fast; gyroid is strong in every direction; honeycomb is rigid.",
  seam: "Where each layer starts/stops (the tiny vertical scar). 'Aligned' stacks it on one edge; 'back' hides it; 'random' scatters it.",
  brim: "A flat skirt of extra material around the base for grip. Helps tall/small/warpy parts stick; 0 = off. Peel it off after.",
  support: "Auto-generate removable scaffolding under steep overhangs. Off for a cube; needed for parts that print 'in mid-air'.",
  supportThreshold: "How steep an overhang must be before supports are added (degrees from vertical). Lower = more support.",
  raw: "Power-user: set any OrcaSlicer setting directly, one key = value per line. Typos are warned, not applied.",
};

interface TemplateInfo {
  name: string;
  description: string;
}
interface SampleInfo {
  name: string;
  description: string;
  available?: boolean;
}
type TemplateBuildResult = BuildResult & { artifact_urls?: Record<string, string> };
type Attempt = { round: number; ok: boolean; printable: boolean | null; summary: string };
type GeneratedResult = {
  ok: boolean;
  name: string;
  driver?: string;
  rounds?: number;
  attempts?: Attempt[];
  error?: string | null;
  artifact_urls?: Record<string, string>;
  build?: BuildResult | null;
};
/** Normalised view of either a template build or a generated part. */
type DisplayResult = {
  metadata?: BuildResult["metadata"];
  verification?: BuildResult["verification"];
  driver?: string; // generated only
  rounds?: number; // generated only
};
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
  override_warnings?: string[];
};
type Status = "idle" | "building" | "done" | "error";
type SliceStatus = "idle" | "slicing" | "done" | "error";
type View = "model" | "gcode";
type Kind = "template" | "generated" | "sample";
type SettingsBundle = {
  infill: number;
  wallSpeed: number;
  jerk: number;
  bedTemp: number;
  nozzleTemp: number;
  flow: number;
  retraction: number;
  layerHeight: number;
  wallLoops: number;
  topLayers: number;
  bottomLayers: number;
  infillPattern: string;
  seamPosition: string;
  brimWidth: number;
  support: boolean;
  supportThreshold: number;
  rawOverrides: string;
};
type SettingsVersion = { id: string; savedAt: string; label: string; settings: SettingsBundle };
const VERSIONS_KEY = "agent-cad:settings-versions";

export function BuildDemo() {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("template");
  const [status, setStatus] = useState<Status>("idle");
  const [stlUrl, setStlUrl] = useState<string | null>(null);
  const [result, setResult] = useState<DisplayResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sliceStatus, setSliceStatus] = useState<SliceStatus>("idle");
  const [gcodeUrl, setGcodeUrl] = useState<string | null>(null);
  const [sliceInfo, setSliceInfo] = useState<SliceInfo | null>(null);
  const [sliceError, setSliceError] = useState<string | null>(null);
  const [view, setView] = useState<View>("model");
  const [prompt, setPrompt] = useState("a 90 mm round coaster with a raised rim");
  // Per-slice settings — defaults mirror the committed Ender 5 S1 profile; changing
  // them overrides that profile for the next slice (and shows up in the g-code).
  const [infill, setInfill] = useState(15);
  const [wallSpeed, setWallSpeed] = useState(25);
  const [jerk, setJerk] = useState(12);
  const [bedTemp, setBedTemp] = useState(60);
  const [nozzleTemp, setNozzleTemp] = useState(200);
  const [flow, setFlow] = useState(0.98);
  const [retraction, setRetraction] = useState(1);
  // quality & structure
  const [layerHeight, setLayerHeight] = useState(0.2);
  const [wallLoops, setWallLoops] = useState(2);
  const [topLayers, setTopLayers] = useState(7);
  const [bottomLayers, setBottomLayers] = useState(5);
  const [infillPattern, setInfillPattern] = useState("crosshatch");
  const [seamPosition, setSeamPosition] = useState("aligned");
  const [brimWidth, setBrimWidth] = useState(0);
  const [support, setSupport] = useState(false);
  const [supportThreshold, setSupportThreshold] = useState(30);
  // power-user escape hatch — any of the 571 OrcaSlicer keys, "key = value" per line
  const [rawOverrides, setRawOverrides] = useState("");
  const [overrideWarnings, setOverrideWarnings] = useState<string[]>([]);
  // saved settings snapshots (localStorage) so the user can compare/restore tuning runs
  const [versions, setVersions] = useState<SettingsVersion[]>([]);
  const [versionLabel, setVersionLabel] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/templates`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setTemplates)
      .catch(() => setError("Can't reach the API. Start it with `pnpm py:api`."));
    // Sample models (e.g. the 3DBenchy) are optional — don't error if absent.
    fetch(`${API_URL}/samples`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setSamples)
      .catch(() => setSamples([]));
    // Restore previously-saved settings versions.
    try {
      const saved = window.localStorage.getItem(VERSIONS_KEY);
      if (saved) setVersions(JSON.parse(saved) as SettingsVersion[]);
    } catch {
      /* localStorage unavailable or corrupt — start empty */
    }
  }, []);

  function currentBundle(): SettingsBundle {
    return {
      infill, wallSpeed, jerk, bedTemp, nozzleTemp, flow, retraction, layerHeight,
      wallLoops, topLayers, bottomLayers, infillPattern, seamPosition, brimWidth,
      support, supportThreshold, rawOverrides,
    };
  }

  function applyBundle(b: SettingsBundle) {
    setInfill(b.infill);
    setWallSpeed(b.wallSpeed);
    setJerk(b.jerk);
    setBedTemp(b.bedTemp);
    setNozzleTemp(b.nozzleTemp);
    setFlow(b.flow);
    setRetraction(b.retraction);
    setLayerHeight(b.layerHeight);
    setWallLoops(b.wallLoops);
    setTopLayers(b.topLayers);
    setBottomLayers(b.bottomLayers);
    setInfillPattern(b.infillPattern);
    setSeamPosition(b.seamPosition);
    setBrimWidth(b.brimWidth);
    setSupport(b.support);
    setSupportThreshold(b.supportThreshold);
    setRawOverrides(b.rawOverrides);
  }

  function persistVersions(next: SettingsVersion[]) {
    setVersions(next);
    try {
      window.localStorage.setItem(VERSIONS_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota / unavailable storage */
    }
  }

  function saveVersion() {
    const version: SettingsVersion = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      savedAt: new Date().toISOString(),
      label: versionLabel.trim(),
      settings: currentBundle(),
    };
    persistVersions([version, ...versions].slice(0, 25)); // keep the 25 most recent
    setVersionLabel("");
  }

  function deleteVersion(id: string) {
    persistVersions(versions.filter((v) => v.id !== id));
  }

  function resetSlice() {
    setSliceStatus("idle");
    setGcodeUrl(null);
    setSliceInfo(null);
    setSliceError(null);
  }

  function startRun(name: string | null, runKind: Kind) {
    setActive(name);
    setKind(runKind);
    setStatus("building");
    setStlUrl(null);
    setResult(null);
    setError(null);
    setView("model");
    resetSlice();
  }

  async function buildAndView(name: string) {
    startRun(name, "template");
    try {
      const ref = await postJson(`${API_URL}/templates/${encodeURIComponent(name)}/build`);
      const job = await pollJob(ref.job_id);
      if (job.status !== "succeeded") throw new Error(job.error ?? "build failed");
      const res = job.result as TemplateBuildResult;
      const path = res.artifact_urls?.stl;
      if (!path) throw new Error("build produced no STL");
      setResult({ metadata: res.metadata, verification: res.verification });
      setStlUrl(`${API_URL}${path}`);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  async function generateAndView(text: string) {
    startRun(null, "generated");
    try {
      const ref = await postJson(`${API_URL}/generate`, { prompt: text });
      // Generation runs an LLM + build + retries — allow a few minutes.
      const job = await pollJob(ref.job_id, 300_000);
      if (job.status !== "succeeded") throw new Error(job.error ?? "generation failed");
      const res = job.result as GeneratedResult;
      setActive(res.name);
      const stl = res.artifact_urls?.stl;
      // Even a non-printable attempt is worth showing in the viewer.
      if (stl) setStlUrl(`${API_URL}${stl}`);
      if (!res.ok) {
        const last = res.attempts?.[res.attempts.length - 1]?.summary;
        throw new Error(res.error ?? last ?? "couldn't produce a printable part");
      }
      setResult({
        metadata: res.build?.metadata,
        verification: res.build?.verification,
        driver: res.driver,
        rounds: res.rounds,
      });
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  async function stageAndView(name: string) {
    startRun(name, "sample");
    try {
      const ref = await postJson(`${API_URL}/samples/${encodeURIComponent(name)}/stage`);
      const job = await pollJob(ref.job_id);
      if (job.status !== "succeeded") throw new Error(job.error ?? "staging failed");
      const res = job.result as { artifact_urls?: Record<string, string>; metadata?: DisplayResult["metadata"] };
      const path = res.artifact_urls?.stl;
      if (!path) throw new Error("sample produced no STL");
      setResult({ metadata: res.metadata });
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
    setOverrideWarnings([]);
    try {
      const base = kind === "generated" ? "generated" : kind === "sample" ? "samples" : "templates";
      const body: Record<string, unknown> = {
        infill_density: infill,
        wall_speed: wallSpeed,
        jerk,
        bed_temp: bedTemp,
        nozzle_temp: nozzleTemp,
        flow,
        retraction_length: retraction,
        layer_height: layerHeight,
        wall_loops: wallLoops,
        top_layers: topLayers,
        bottom_layers: bottomLayers,
        infill_pattern: infillPattern,
        seam_position: seamPosition,
        brim_width: brimWidth,
        support,
        support_threshold: supportThreshold,
      };
      const raw = parseRawOverrides(rawOverrides);
      if (Object.keys(raw).length) body.raw = raw;
      const ref = await postJson(`${API_URL}/${base}/${encodeURIComponent(active)}/slice`, body);
      const job = await pollJob(ref.job_id, 180_000);
      const res = (job.result ?? {}) as SliceResult;
      if (job.status !== "succeeded" || !res.gcode_url) {
        throw new Error(res.error ?? job.error ?? "slicing failed");
      }
      setGcodeUrl(`${API_URL}${res.gcode_url}`);
      setSliceInfo(res.info?.plates?.[0] ?? null);
      setOverrideWarnings(res.override_warnings ?? []);
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
    const text = prompt.trim();
    if (text.length < 3) {
      setError("Describe the part in a few words, e.g. “a 90 mm round coaster with a raised rim”.");
      return;
    }
    generateAndView(text);
  }

  const meta = result?.metadata;
  const verification = result?.verification;
  const busy = status === "building" || sliceStatus === "slicing";
  const slicing = sliceStatus === "slicing";

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(300px,1fr)_minmax(340px,1.2fr)]">
      <div className="space-y-6">
        <section>
          <SectionTitle>1 · Describe a part</SectionTitle>
          <form onSubmit={onPromptSubmit} className="flex gap-2">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. a 90 mm round coaster with a raised rim"
              disabled={busy}
              aria-label="describe a part"
            />
            <Button type="submit" disabled={busy}>
              {status === "building" && kind === "generated" ? "Generating…" : "Generate"}
            </Button>
          </form>
          <p className="mb-2 mt-2 text-sm text-muted-foreground">
            Free text is <strong>generated for real</strong> (Claude writes the CAD, then it’s built &amp;
            checked for printability) — takes a minute. Or pick a fast known-good template:
          </p>
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
          {samples.length ? (
            <>
              <p className="mb-2 mt-4 text-sm text-muted-foreground">…or a ready-made test model:</p>
              <div className="grid grid-cols-1 gap-2">
                {samples.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => stageAndView(s.name)}
                    disabled={busy || s.available === false}
                    title={s.available === false ? "model file not present on the server" : undefined}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors hover:bg-accent disabled:opacity-50",
                      active === s.name && "border-primary ring-1 ring-primary",
                    )}
                  >
                    <div className="font-semibold capitalize">🚢 {s.name}</div>
                    <div className="text-xs leading-snug text-muted-foreground">{s.description}</div>
                  </button>
                ))}
              </div>
            </>
          ) : null}
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
              <Hint>
                {kind === "generated"
                  ? "Generating the model, building it, and checking printability…"
                  : kind === "sample"
                    ? "Loading the test model…"
                    : `Building “${active}” on the server…`}
              </Hint>
            ) : null}
            {status === "done" && meta ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {meta.bounding_box_mm
                      ? `${meta.bounding_box_mm.x} × ${meta.bounding_box_mm.y} × ${meta.bounding_box_mm.z} mm`
                      : "—"}
                  </Badge>
                  <Badge variant={meta.fits_build_volume ? "secondary" : "destructive"}>
                    {meta.fits_build_volume ? "✓ fits bed" : "⚠ doesn't fit"}
                  </Badge>
                  {verification ? (
                    <Badge variant={verification.printable ? "secondary" : "destructive"}>
                      {verification.printable ? "✓ printable" : "✗ not printable"}
                    </Badge>
                  ) : kind === "sample" ? (
                    <Badge variant="outline">imported model</Badge>
                  ) : null}
                </div>
                {kind === "generated" && result?.driver ? (
                  <p className="text-xs text-muted-foreground">
                    Generated with <span className="font-medium">{result.driver}</span>
                    {result.rounds && result.rounds > 1 ? ` · ${result.rounds} rounds (self-corrected)` : ""}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {status === "done" ? (
          <section>
            <SectionTitle>3 · Slice for printing</SectionTitle>
            <div className="mb-3 rounded-lg border p-3">
              <p className="mb-2 text-sm font-semibold">Print settings</p>
              <label htmlFor="infill" className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  Infill density
                  <InfoTip text={TIPS.infill} />
                </span>
                <span className="tabular-nums text-muted-foreground">{infill}%</span>
              </label>
              <input
                id="infill"
                type="range"
                min={0}
                max={100}
                step={5}
                value={infill}
                onChange={(e) => setInfill(Number(e.target.value))}
                disabled={slicing}
                aria-label="infill density percent"
                className="mt-1 w-full accent-primary"
              />
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                <NumField label="Wall speed" unit="mm/s" value={wallSpeed} onChange={setWallSpeed} min={10} max={120} disabled={slicing} tip={TIPS.wallSpeed} />
                <NumField label="Jerk" unit="mm/s" value={jerk} onChange={setJerk} min={4} max={40} disabled={slicing} tip={TIPS.jerk} />
                <NumField label="Bed temp" unit="°C" value={bedTemp} onChange={setBedTemp} min={0} max={110} disabled={slicing} tip={TIPS.bedTemp} />
                <NumField label="Nozzle temp" unit="°C" value={nozzleTemp} onChange={setNozzleTemp} min={150} max={300} disabled={slicing} tip={TIPS.nozzleTemp} />
                <NumField label="Flow ratio" unit="" value={flow} onChange={setFlow} min={0.8} max={1.2} step={0.01} disabled={slicing} tip={TIPS.flow} />
                <NumField label="Retraction" unit="mm" value={retraction} onChange={setRetraction} min={0} max={6} step={0.1} disabled={slicing} tip={TIPS.retraction} />
              </div>

              <details className="mt-3 border-t pt-2">
                <summary className="cursor-pointer text-sm font-medium">Quality &amp; structure</summary>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                  <SelectField label="Layer height" unit="mm" value={String(layerHeight)} onChange={(v) => setLayerHeight(Number(v))} options={["0.12", "0.16", "0.2", "0.24", "0.28"]} disabled={slicing} tip={TIPS.layerHeight} />
                  <NumField label="Walls" unit="loops" value={wallLoops} onChange={setWallLoops} min={1} max={8} disabled={slicing} tip={TIPS.wallLoops} />
                  <NumField label="Top layers" unit="" value={topLayers} onChange={setTopLayers} min={0} max={15} disabled={slicing} tip={TIPS.topLayers} />
                  <NumField label="Bottom layers" unit="" value={bottomLayers} onChange={setBottomLayers} min={0} max={15} disabled={slicing} tip={TIPS.bottomLayers} />
                  <SelectField label="Infill pattern" unit="" value={infillPattern} onChange={setInfillPattern} options={["crosshatch", "gyroid", "grid", "honeycomb", "cubic"]} disabled={slicing} tip={TIPS.infillPattern} />
                  <SelectField label="Seam" unit="" value={seamPosition} onChange={setSeamPosition} options={["aligned", "back", "nearest", "random"]} disabled={slicing} tip={TIPS.seam} />
                  <NumField label="Brim" unit="mm" value={brimWidth} onChange={setBrimWidth} min={0} max={20} disabled={slicing} tip={TIPS.brim} />
                </div>
              </details>

              <details className="mt-2 border-t pt-2">
                <summary className="cursor-pointer text-sm font-medium">Supports</summary>
                <div className="mt-2 grid grid-cols-2 items-end gap-x-3 gap-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={support} onChange={(e) => setSupport(e.target.checked)} disabled={slicing} className="accent-primary" />
                    <span className="font-medium">Enable supports</span>
                    <InfoTip text={TIPS.support} />
                  </label>
                  <NumField label="Overhang threshold" unit="°" value={supportThreshold} onChange={setSupportThreshold} min={0} max={90} disabled={slicing || !support} tip={TIPS.supportThreshold} />
                </div>
              </details>

              <details className="mt-2 border-t pt-2">
                <summary className="cursor-pointer text-sm font-medium">
                  Advanced — raw overrides
                  <InfoTip text={TIPS.raw} />
                </summary>
                <p className="mt-2 text-xs text-muted-foreground">
                  Any OrcaSlicer key — one <code>key = value</code> per line (all 571 settings). Unsupported: typos
                  are flagged not applied; load-bearing keys are refused.
                </p>
                <textarea
                  value={rawOverrides}
                  onChange={(e) => setRawOverrides(e.target.value)}
                  disabled={slicing}
                  rows={3}
                  placeholder={"top_surface_pattern = monotonic\nironing_type = topmost surface"}
                  aria-label="raw overrides"
                  className="mt-1 w-full rounded-md border bg-background px-2 py-1 font-mono text-xs"
                />
              </details>

              <p className="mt-2 text-xs text-muted-foreground">
                Overrides the Ender 5 S1 profile for this slice; defaults are the tuned values. They land in the
                g-code (jerk → <code>M205</code>, bed → <code>M140</code>) — download it and check.
              </p>

              <div className="mt-3 border-t pt-3">
                <p className="mb-1 text-sm font-semibold">Saved versions</p>
                <p className="mb-2 text-xs text-muted-foreground">
                  Snapshot the current settings so you can compare runs and roll back. Saved in this browser.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={versionLabel}
                    onChange={(e) => setVersionLabel(e.target.value)}
                    placeholder="Label (e.g. v2 — jerk 18)"
                    disabled={slicing}
                    className="h-8 text-sm"
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={saveVersion} disabled={slicing} className="flex-none gap-1">
                    <Save className="h-3.5 w-3.5" />
                    Save version
                  </Button>
                </div>
                {versions.length ? (
                  <ul className="mt-2 space-y-1">
                    {versions.map((v) => (
                      <li key={v.id} className="flex items-start justify-between gap-2 rounded-md border p-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-medium">
                            {v.label || "Untitled"}{" "}
                            <span className="font-normal text-muted-foreground">· {fmtDate(v.savedAt)}</span>
                          </div>
                          <div className="text-muted-foreground">{summarizeBundle(v.settings)}</div>
                        </div>
                        <div className="flex flex-none items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 px-2"
                            onClick={() => applyBundle(v.settings)}
                            disabled={slicing}
                          >
                            Load
                          </Button>
                          <button
                            type="button"
                            aria-label="delete version"
                            onClick={() => deleteVersion(v.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No saved versions yet — save one to compare later.
                  </p>
                )}
              </div>
            </div>
            <Button onClick={sliceForPrint} disabled={sliceStatus === "slicing"} className="gap-2">
              <Printer className="h-4 w-4" />
              {sliceStatus === "slicing" ? "Slicing…" : `Slice for Ender 5 S1 · ${infill}% infill`}
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
                <p className="text-xs text-muted-foreground">
                  Sliced with jerk {jerk}, bed {bedTemp}&nbsp;°C, walls {wallSpeed}&nbsp;mm/s, {infill}% infill.
                </p>
                {overrideWarnings.length ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      <span className="font-medium">Raw override warnings:</span>
                      <ul className="ml-4 mt-1 list-disc">
                        {overrideWarnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                ) : null}
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

/** A small info icon that reveals a tooltip on hover/focus — no extra deps. */
function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <button
        type="button"
        aria-label={text}
        className="text-muted-foreground/60 hover:text-foreground focus:text-foreground focus:outline-none"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 hidden w-56 -translate-x-1/2 rounded-md border bg-popover px-2 py-1.5 text-xs font-normal leading-snug text-popover-foreground shadow-md group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}

function FieldLabel({ label, unit, tip }: { label: string; unit?: string; tip?: string }) {
  return (
    <span className="font-medium">
      {label}
      {unit ? <span className="font-normal text-muted-foreground"> ({unit})</span> : null}
      {tip ? <InfoTip text={tip} /> : null}
    </span>
  );
}

function NumField({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
  tip,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  tip?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <FieldLabel label={label} unit={unit} tip={tip} />
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-full rounded-md border bg-background px-2 py-1 tabular-nums disabled:opacity-50"
      />
    </label>
  );
}

function SelectField({
  label,
  unit,
  value,
  onChange,
  options,
  disabled,
  tip,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
  tip?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <FieldLabel label={label} unit={unit} tip={tip} />
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="w-full rounded-md border bg-background px-2 py-1 disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** One-line readable digest of a settings snapshot, for the versions list. */
function summarizeBundle(s: SettingsBundle): string {
  const parts = [
    `${s.layerHeight}mm`,
    `${s.wallLoops} walls`,
    `${s.infill}% infill`,
    `jerk ${s.jerk}`,
    `bed ${s.bedTemp}°C`,
    `walls ${s.wallSpeed}mm/s`,
    `flow ${s.flow}`,
    `retr ${s.retraction}`,
  ];
  const rawCount = Object.keys(parseRawOverrides(s.rawOverrides)).length;
  if (rawCount) parts.push(`+${rawCount} raw`);
  return parts.join(" · ");
}

/** Parse the raw-overrides textarea into a key→value map (one `key = value` per line). */
function parseRawOverrides(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key) out[key] = val;
  }
  return out;
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

async function postJson(url: string, body?: unknown) {
  const r = await fetch(url, {
    method: "POST",
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
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
