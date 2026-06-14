# agent-cad

An **agentic code-to-CAD & scan-to-mesh 3D-printing pipeline**, driven by Claude
Code. Design parametric parts as plain-text Python (build123d / OCCT B-rep), slice
them headless for a **Creality Ender 5 S1**, preview the g-code, copy to SD, and
track what actually printed — plus a scan-to-mesh path for designing mounts around
real objects. Fully open-source and self-hosted.

> Built for an Iveco Daily camper conversion, but the pipeline is general.

## Why this exists

The source of truth for every part is a **parametric `.py` file** — it diffs and
merges like code. Claude writes the model, the runner compiles it to STL/STEP/3MF
and an SVG render, and on any error it returns the **traceback** so Claude can
self-correct. B-rep (STEP) keeps geometry editable; mesh (STL) is just the print
output. No paid CAD SaaS — it leans on your Claude plan + open tooling.

Every build is checked against the target printer's envelope: the runner reports
`metadata.fits_build_volume` for the **Ender 5 S1 (220 × 220 × 280 mm, usable
210 × 210 after a 5 mm margin)** and the `cad` CLI warns when a part overruns the
bed — so an oversized part is caught at design time, not on the print bed.

## Quickstart

```bash
# Python engine (build123d, slicer, scanner, FastAPI) — one uv workspace
uv sync --all-packages
uv run pytest                      # 34 tests

# JS control plane (pnpm + Turborepo)
pnpm install
pnpm turbo run build typecheck     # all packages

# Build the example part: model.py -> STL/STEP/3MF/SVG
uv run --package cad cad build \
  projects/fridge_drawer/model.py \
  --params projects/fridge_drawer/params.json

# Run the local API (control plane for the web app / CLI)
pnpm py:api                        # uvicorn on http://127.0.0.1:8000
```

## The agent loop

```
write model.py ─▶ cad build ─▶ STL/STEP/3MF + SVG ─▶ inspect render / dims
       ▲                                   │
       └────────── fix from traceback ◀─────┘   (runner returns ok:false + traceback)
```

```bash
cad build projects/<part>/model.py --params projects/<part>/params.json --json
slice orca model.3mf --machine ender5s1.json --process std.json --filament petg.json
slice extract out.gcode.3mf        # the OrcaSlicer .gcode.3mf gotcha, handled
scan clean raw.obj --target-faces 50000
```

## Repository layout

```
agent-cad/
├── apps/web/              # Next.js + shadcn control panel (shell; UI pass later)
├── packages/
│   ├── types/             # Zod schemas mirroring the API contract
│   ├── cli/               # agent-cad CLI (orchestrates the API)
│   ├── viewer/            # three.js/R3F (STL) · occt-import-js (STEP) · gcode-preview
│   └── ui/                # shared shadcn/ui components (scaffold)
├── services/
│   ├── cad/               # build123d headless runner (CLI: cad)
│   ├── slice/             # OrcaSlicer/PrusaSlicer + .gcode.3mf extraction (CLI: slice)
│   ├── scan/              # trimesh scan cleanup (CLI: scan)
│   └── api/               # FastAPI + background jobs
├── projects/<part>/       # design data: model.py · params.json · print.json · artifacts/
└── docs/                  # STACK · ARCHITECTURE · ui-functional-spec · printer-ender5s1
```

## Documentation

- **[docs/research-and-roadmap.md](docs/research-and-roadmap.md)** — *what's the proven way to do prompt→CAD, and our plan.* Start here.
- **[docs/prerequisites.md](docs/prerequisites.md)** — what to install (toolchains, OrcaSlicer, SD card).
- **[docs/STACK.md](docs/STACK.md)** — the technology choices + rationale.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the pieces fit; the job model.
- **[docs/ui-functional-spec.md](docs/ui-functional-spec.md)** — UI spec for the design pass.
- **[docs/printer-ender5s1.md](docs/printer-ender5s1.md)** — printer profile, setup, calibration-first plan, materials.
- **[docs/filament-guide.md](docs/filament-guide.md)** — beginner filament 101 (Creation Wizard teaching content).
- **[CLAUDE.md](CLAUDE.md)** — conventions for working in this repo with Claude Code.

## Git / versioning strategy

- **Commit text, regenerate geometry.** `model.py` + `params.json` are the source
  of truth; STL/STEP/3MF/gcode are reproducible output and are **gitignored** by
  default (`projects/**/artifacts/`).
- **Commit known-good prints.** When a print succeeds, set
  `print.json: {"status": "printed-ok"}`, commit its g-code/STL, and **tag** the
  commit (e.g. `fridge-drawer-v3-printed`).
- **Binaries use Git LFS.** `.gitattributes` tracks `*.stl *.step *.3mf *.gcode
  *.ply …`. Run **`git lfs install`** once before committing any binary.

## Status

First-time scaffold. **Working & tested:** the Python engine end-to-end (CAD build
→ STL/STEP/3MF/SVG, build-volume fit checks, slice extraction, scan cleanup,
FastAPI jobs — 34 tests) and
the JS toolchain (5 packages build + typecheck). **Deferred to the UI design pass:**
the full control-panel UI (shadcn components, the STEP/g-code viewers, GitHub
history) — specified in `docs/ui-functional-spec.md`.

## Requirements

- Node ≥ 22, pnpm ≥ 10 · Python 3.11, [uv](https://docs.astral.sh/uv/)
- **OrcaSlicer** (set `$ORCA_SLICER_BIN`) for slicing — bundled Ender 5 S1 profiles
- Optional: `git lfs`, Open3D/PyMeshLab (heavier scan backends), CadQuery (fallback engine)

See **[docs/prerequisites.md](docs/prerequisites.md)** for the full install guide
(OrcaSlicer on WSL/Ubuntu 24.04 + SD card).
