# Architecture

agent-cad is a hybrid TypeScript + Python monorepo. The **Python services** are
the engine (CAD, slicing, scan cleanup) fronted by a local **FastAPI** server;
the **TypeScript packages** are the control plane (web app, CLI, shared types,
3D viewers). Claude Code drives the whole thing.

```
                         ┌─────────────────────────────────────────┐
                         │  Claude Code (the agent)                 │
                         │  writes model.py · runs CLIs · iterates  │
                         └───────────────┬──────────────────────────┘
                                         │ direct CLI drive (leanest loop)
                                         ▼
   apps/web (Next.js) ──HTTP──▶  services/api (FastAPI)  ──▶  cad / slicer / scanner
   packages/cli  ─────HTTP──▶        jobs + polling             (build123d / Orca / trimesh)
                                         │
                                         ▼
                                   projects/<part>/   ← Git-tracked design data
                                   (model.py, params.json, print.json, artifacts/)
```

## Two control paths (both intended)

1. **Agent inner loop — direct CLI.** Claude writes `projects/<part>/model.py`,
   runs `cad build …`, reads the JSON/traceback, edits, repeats. No server in the
   loop → minimal token + latency overhead. This is the spec's recommended
   "thin CLI + filesystem" Option A.
2. **App / automation — via the API.** The web app and `@agent-cad/cli` call the
   FastAPI server, which runs the same service functions as background jobs and
   exposes status polling. Same engine, different front door.

## Python workspace (`services/*`, one uv workspace)

| Package | Import | Responsibility |
| --- | --- | --- |
| `cad` | `cad` | Headless build123d runner: `model.py` → STL/STEP/3MF + SVG; captures tracebacks for the self-fix loop. CLI: `cad build`. |
| `slicer` | `slicer` | OrcaSlicer/PrusaSlicer CLI wrappers; `.gcode.3mf` → `plate_1.gcode` extraction; SD-card copy. CLI: `slice`. |
| `scanner` | `scanner` | trimesh scan cleanup (largest component, weld, repair, decimate, recenter). CLI: `scan`. |
| `apiserver` | `api` | FastAPI app; in-memory job store; routes for cad/slice/scan/parts/jobs. |

`cad` and `slicer` import their heavy/optional engines **lazily** (inside
functions), so the API process starts without build123d present and only fails
when a build is actually requested. `scanner` requires trimesh (lightweight).

## TypeScript workspace (`apps/*`, `packages/*` — pnpm + Turborepo)

| Package | Responsibility |
| --- | --- |
| `apps/web` | Next.js 14 control panel (shell now; full UI in the design pass). |
| `packages/types` | Zod schemas mirroring the FastAPI contract (`@agent-cad/types`). |
| `packages/cli` | commander CLI orchestrating the API (`agent-cad …`). |
| `packages/viewer` | three.js/R3F (STL), occt-import-js (STEP), gcode-preview (g-code). |
| `packages/ui` | shared shadcn/ui components (scaffold). |

## Job model

`POST /cad/build`, `/slice/*`, `/scan/clean` enqueue a job and return
`{job_id, kind, status}` immediately. The client polls `GET /jobs/{id}` until
`succeeded`/`failed`. A service result of `{"ok": false}` marks the job failed and
surfaces `error`. Cheap operations (`/slice/extract`, `/parts`) are synchronous.
The store is in-memory (single-user local tool) — restarting the API clears history.

## Data layout: `projects/<part>/`

```
projects/fridge_drawer/
├── model.py        # build123d source — the source of truth (plain text)
├── params.json     # parameters fed to build(params)
├── print.json      # slicer profile + filament + print outcome/status
└── artifacts/      # generated STL/STEP/3MF/gcode/SVG (gitignored; LFS when kept)
```

Geometry is reproducible from `model.py` + `params.json`, so artifacts are
regenerated on demand and not committed by default. Known-good prints are the
exception — commit + tag those (see the README's versioning section).

## Boundaries & rationale

- **Engine vs. server:** cad/slicer/scanner are plain libraries with their own
  CLIs; `api` only wires them to HTTP + jobs. You can use the engine with zero
  web stack.
- **Types contract:** `packages/types` is hand-maintained today; the end-state is
  generating a typed SDK from the API's OpenAPI doc so the two cannot drift.
- **External binaries:** OrcaSlicer/PrusaSlicer are system installs located via
  `$ORCA_SLICER_BIN` / `$PRUSA_SLICER_BIN`; not vendored.
