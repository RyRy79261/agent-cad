# UI Functional Spec — agent-cad Control Panel

> **Audience:** the UI design pass (`pencil-agentic-design`).
> **Status:** functional spec only — this defines *what the UI must do* and the
> *stack to build it on*. Visual design, layout and interaction polish are the
> design pass's job. The backend (FastAPI + Python services) already exists and
> is documented in `docs/ARCHITECTURE.md`; this spec is the contract the UI
> consumes.

## 1. Purpose

A local, single-user **control panel** for an agentic 3D-printing pipeline: design
parametric parts (Claude writes build123d code), view the geometry (STL + STEP),
slice for a Creality Ender 5 S1, preview the g-code, copy to SD, and track which
prints succeeded — plus a scan-to-mesh path for designing mounts around real
objects. Everything is self-hosted and talks to a local API on
`http://127.0.0.1:8000`.

## 2. Stack (use these)

- **Next.js 14 (App Router)** — `apps/web`.
- **shadcn/ui + Tailwind CSS** — build shared components into `packages/ui`.
- **3D viewers** — `packages/viewer` (already scaffolded):
  - `StlViewer` (three.js + react-three-fiber + drei) — STL/OBJ/3MF. _Working reference._
  - `StepViewer` (occt-import-js WASM → three.js) — STEP. _Implement._
  - `GcodeViewer` (gcode-preview) — toolpath/layer preview with a layer slider. _Implement._
- **Types** — import request/response types from `@agent-cad/types` (Zod schemas
  mirroring the API). Do not hand-roll API types.
- **Data fetching** — server components for reads where possible; client
  components for job polling. (TanStack Query is a reasonable add for polling.)

## 3. Information architecture

Suggested top-level navigation (designer may restructure):

1. **Parts** (home) — list of parts under `projects/`, each with status badge,
   thumbnail/preview, artifact count. Click → Part detail.
2. **Part detail** — the main workspace for one part:
   - **Parameters** panel — edit `params.json` values; "Rebuild" triggers a CAD build.
   - **3D viewer** — tabs for STL (mesh) and STEP (B-rep); SVG render as a cheap fallback.
   - **Slice** panel — pick filament + process profile → slice → show g-code preview
     + print-time/material estimate; "Copy to SD" action.
   - **Print log** — `print.json` status (designed / sliced / printing / printed-ok /
     printed-fail) + notes; tag-per-print history.
   - **History** — Git commits/diffs of `model.py` + `params.json` for this part.
3. **Scan** — upload/select a raw scan; run cleanup; view before/after stats +
   the cleaned mesh; measure key dimensions to feed into a new parametric mount.
4. **Jobs** — live list of background jobs (build/slice/scan) with status.

## 4. Key flows

### Flow A — Generate → view → slice → print
1. User edits parameters → `POST /cad/build` returns a `job_id`.
2. UI polls `GET /jobs/{id}` until `succeeded`/`failed`; show progress + tracebacks
   on failure (the runner returns the full traceback in `result.error`).
3. On success, load `result.artifacts.stl` / `.step` into the viewers; show
   `result.metadata.bounding_box_mm` + volume.
4. User picks filament + process profile → `POST /slice/orca` → poll job →
   show g-code preview (`result.gcode_path`) + estimates (`result.info.plates[]`).
5. "Copy to SD" → (SD copy is exposed via the slice service; surface a path picker).
6. After printing, user sets print status → persisted to `print.json`.

### Flow B — Scan → clean → measure → mount
1. User selects a raw scan mesh → `POST /scan/clean` (optionally with `target_faces`).
2. Poll job → show before/after stats (faces, watertight, bbox) + the cleaned mesh.
3. User measures the object on-screen (calipers in real life + on-screen readout).
4. Those numbers seed a new parametric part (Flow A) — the scan stays a reference
   mesh; the mount is clean B-rep.

## 5. API contract (consumed by the UI)

Base URL: `process.env.AGENT_CAD_API_URL ?? "http://127.0.0.1:8000"`.

| Method | Path | Purpose | Sync/Async |
| --- | --- | --- | --- |
| GET | `/health` | liveness | sync |
| GET | `/parts` | list parts (`PartSummary[]`) | sync |
| GET | `/parts/{name}` | one part | sync |
| POST | `/cad/build` | build a model.py → `JobRef` | async (job) |
| POST | `/slice/orca` | OrcaSlicer + extract g-code → `JobRef` | async (job) |
| POST | `/slice/prusa` | PrusaSlicer (plain g-code) → `JobRef` | async (job) |
| POST | `/slice/extract` | pull g-code from a `.gcode.3mf` | sync |
| POST | `/scan/clean` | clean a scan mesh → `JobRef` | async (job) |
| GET | `/jobs` / `/jobs/{id}` | job list / status + result | sync (poll) |

Job lifecycle: `queued → running → succeeded | failed`. A finished job carries
`result` (the service's `to_dict()`) or `error`.

> Artifacts (STL/STEP/3MF/gcode/SVG) are file paths today. The UI pass will need
> a static-file/download route to serve them to the viewers — **flag this**; it's
> a small backend add (see Open questions).

## 6. States to design for

- **Empty** — no parts yet; no scans yet.
- **Job in flight** — polling; show a spinner/progress and let the user navigate away.
- **Build failure** — render the Python traceback legibly (monospace, collapsible).
- **Slicer not installed** — `/slice/*` returns `ok:false` with a clear message
  ("OrcaSlicer executable not found"); surface it, don't crash.
- **API down** — the shell still renders (see current `apps/web/app/page.tsx`).

## 7. Non-goals / out of scope

- Multi-user / auth (local single-user tool).
- Editing geometry by hand in the browser (geometry comes from code).
- Mesh → parametric B-rep auto-conversion (scans are references; mounts are coded).
- Printer network control (we copy g-code to SD; no OctoPrint/Klipper link for now).

## 8. Open questions for the design pass

1. **Artifact serving** — confirm the static-file route shape (e.g.
   `GET /artifacts/{part}/{file}`) so viewers can load STL/STEP/gcode by URL.
2. **Parameter schema** — should parameter editors be generic (key/value from
   `params.json`) or per-part typed forms? Generic is the safe default.
3. **Git history** — via the GitHub API/MCP or local `git`? Affects whether this
   needs a backend endpoint.
4. **SD copy UX** — how to pick the SD mount path safely from the browser.
