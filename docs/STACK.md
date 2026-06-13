# Stack

The technology choices for agent-cad, with the rationale behind each. This is the
canonical reference for "what are we building on and why" — it backs the
functional spec and is the input the UI design pass should read for frontend
libraries.

## One-line summary

> **build123d (Python/OCCT B-rep) driven by Claude Code, sliced headless by
> OrcaSlicer's CLI with its built-in Ender 5 S1 profile, wrapped in a
> pnpm/Turborepo monorepo with a Next.js + shadcn control panel talking to a
> local FastAPI service.** Fully open-source, self-hosted.

## Core engine (Python)

| Concern | Choice | Why |
| --- | --- | --- |
| Code-CAD kernel | **build123d** (`>=0.7`) | Pythonic, parametric, OCCT B-rep kernel; exports STEP/STL/3MF/BREP/SVG; LLM-friendly (PEP8, type hints). The most modern OCCT-based code-CAD. |
| Fallback engine | **CadQuery** (optional extra) | Shares the OCP/OCCT kernel; most LLM-generation research behind it. Installed on demand for parts where build123d struggles. |
| Slicing | **OrcaSlicer CLI** (primary), **PrusaSlicer CLI** (alt) | Orca ships a built-in "Creality Ender-5 S1 0.4 nozzle" profile. Prusa gives plain `.gcode` directly if you bring your own `.ini`. |
| Scan cleanup | **trimesh** + **fast-simplification** (required); **Open3D**, **PyMeshLab** (optional) | trimesh keeps the required footprint light (load/repair/decimate/export); Open3D/PyMeshLab are heavier enhanced backends. |
| Local API | **FastAPI** + **uvicorn** + **pydantic v2** | Auto OpenAPI generation (→ typed TS SDK), background jobs + status polling. |
| Python tooling | **uv** workspace, **pytest**, **ruff**, **mypy** | One shared lockfile/venv across services; fast. |

Why B-rep over mesh: a mesh (STL) is just triangles — no notion of "a 4 mm hole"
or "this edge", so it can't be edited parametrically. A B-rep/solid model (STEP)
carries precise geometry that can be filleted, measured and re-parameterised, then
exported to clean STL for printing. The agent regenerates parts from changed
params, so we need a B-rep kernel that also exports mesh.

The agent loop the engine enables: **generate `.py` → execute headless → export
STL/STEP/3MF + SVG → (vision-)inspect the render → on error, feed the traceback
back and retry.** The runner captures tracebacks instead of crashing precisely so
Claude can self-correct.

## Monorepo & frontend (JS/TS)

| Concern | Choice | Why |
| --- | --- | --- |
| Package manager | **pnpm** workspaces | Fast, disk-efficient, first-class workspace support. |
| Build orchestration | **Turborepo** (v2) | Ideal under ~10 packages; caching + affected builds on top of pnpm. |
| Web framework | **Next.js 14** (App Router) | The control panel. |
| UI components | **shadcn/ui** + **Tailwind CSS** | Added in the UI design pass; `packages/ui` holds shared components. |
| 3D — mesh (STL/OBJ/3MF) | **three.js** + **@react-three/fiber** + **@react-three/drei** | Mature R3F ecosystem; `STLLoader`/`OBJLoader`/`3MFLoader`. |
| 3D — STEP | **occt-import-js** (WASM OCCT) | Tessellates B-rep STEP in-browser → three.js `BufferGeometry`. |
| 3D — g-code | **gcode-preview** | Toolpath/layer preview with a layer slider; knows build volume + thumbnails. |
| Shared types | **Zod** schemas in `packages/types` | Mirror the FastAPI OpenAPI contract; end-state is generating the SDK from OpenAPI (e.g. hey-api). |
| CLI | **commander** in `packages/cli` | Thin orchestrator over the local API. |

## IPC: Next.js ↔ Python

A local **FastAPI** server exposes the cad/slice/scan services. Long jobs
(slicing, scan processing, heavy builds) are **background jobs** with status
polling (`POST` → `{job_id}` → poll `GET /jobs/{id}`). Cheap work (g-code
extraction, listing parts) is synchronous. The web app and `@agent-cad/cli`
both talk to this API; Claude Code's inner loop instead drives the Python CLIs
(`cad` / `slice` / `scan`) directly for the leanest iteration.

## Versioning

- **Source of truth is text**: build123d `.py` + `params.json` diff and merge
  like code. Geometry is reproducible output.
- **Binary artifacts** (STL/STEP/3MF/gcode/scan meshes) go through **Git LFS**
  (`.gitattributes` patterns committed). We don't commit *every* generated
  artifact — only known-good prints, tagged per part. Requires `git lfs install`.

## Hardware target

Creality **Ender 5 S1** — 220 × 220 × 280 mm, Marlin firmware, 300 °C all-metal
hotend, 110 °C bed, CR-Touch. See `docs/printer-ender5s1.md` for the build profile,
the non-standard long nozzle gotcha, the SD-card requirements, and material
guidance (PETG for interior/shaded, ASA for sun/heat).

## Deliberately NOT used

- **Paid text-to-CAD SaaS** (Zoo.dev / Adam / Backflip) — Claude authoring
  parametric Python is the most performant use of the Max plan and keeps the
  geometry engine open and local.
- **OpenSCAD as primary** — simpler DSL but mesh/CSG only (no STEP), weaker
  engineering base. Kept as an escape hatch for trivial shapes if LLM output on
  build123d is unreliable for a given part class.
