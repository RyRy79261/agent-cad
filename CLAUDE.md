# CLAUDE.md

Guidance for working in this repo with Claude Code. Read `docs/ARCHITECTURE.md`
and `docs/STACK.md` for the full picture.

## What this is

An agentic code-to-CAD → slice → print pipeline. You (Claude) author parametric
**build123d** models as plain Python, compile them headlessly, inspect the result,
and self-correct from tracebacks. B-rep (STEP) for editability, mesh (STL) for printing.

## Environment

- **Python**: a `uv` workspace under `services/*`. `uv sync --all-packages`, then
  `uv run --package <cad|slicer|scanner|apiserver> …` or `uv run pytest`.
- **JS**: pnpm + Turborepo. `pnpm install`, `pnpm turbo run build typecheck test`.
- The container is ephemeral — deps are reinstalled per session (see
  `scripts/setup.sh`, wired as a SessionStart hook).

## Authoring a part

Parts live in `projects/<name>/`:

```
model.py      # build123d source — the source of truth
params.json   # parameters passed to build(params)
print.json    # slicer profile + filament + print outcome
artifacts/    # generated geometry (gitignored; regenerate on demand)
```

`model.py` must define **`build(params: dict) -> Shape`** (preferred) or a
module-level **`result`**. Then:

```bash
uv run --package cad cad build projects/<name>/model.py \
  --params projects/<name>/params.json --json
```

The runner returns JSON: `ok`, `artifacts`, `metadata.bounding_box_mm`, and on
failure the full `error` traceback. **Iterate**: read the traceback, fix, rebuild.
Always sanity-check `bounding_box_mm` against intended dimensions.

## build123d gotchas (learned the hard way here)

- **Builder mode applies ops at creation time.** `Box(..., mode=Mode.SUBTRACT)`
  subtracts *immediately* at the current location. Calling `.translate()` on the
  returned object afterwards is a **no-op on the part** — position it *before*
  creating, with `Locations((x, y, z))`.
- **Chamfer/fillet on clean edges.** Chamfer the *solid's* outer top edges
  **before** hollowing — once it's a thin wall, a chamfer ≥ wall/2 is degenerate
  and OCCT raises `BRep_API: command not done`. Select edges with
  `part.edges().group_by(Axis.Z)[-1]` / `.filter_by(Axis.Z)`.
- Exports are module functions: `export_stl`, `export_step`, `export_brep`;
  `Mesher` for 3MF; `ExportSVG` + `project_to_viewport` for the SVG render (headless,
  no GPU). See `services/cad/src/cad/runner.py` and the examples for working patterns.
- Use `services/cad/src/cad/examples/box_with_holes.py` and
  `projects/fridge_drawer/model.py` as known-good templates.

## Slicing & printing (Ender 5 S1)

- OrcaSlicer CLI emits a **`.gcode.3mf`** archive — the slice service auto-extracts
  `Metadata/plate_1.gcode`. Never hand a `.gcode.3mf` to the printer.
- SD card: plain `.gcode`, FAT32, **root dir**, short 8.3 name (`slicer.sdcard`).
- Material default: **PETG** interior/shaded, **ASA** for sun/heat. See
  `docs/printer-ender5s1.md`.

## Conventions

- Run `uv run pytest` and `pnpm turbo run typecheck` before committing.
- Keep `packages/types` (Zod) in sync with `services/api/.../schemas.py`.
- **Don't commit generated artifacts** (`projects/**/artifacts/` is gitignored).
  Commit a print's g-code/STL **only** when it printed OK, set
  `print.json.status = "printed-ok"`, and tag the commit.
- Binary commits need `git lfs install` first (patterns are in `.gitattributes`).
- Slicer binaries are external: set `$ORCA_SLICER_BIN` / `$PRUSA_SLICER_BIN`.
