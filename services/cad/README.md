# cad — headless code-CAD runner

Executes a parametric **build123d** `model.py` and exports STL / STEP / 3MF + an
SVG projection. The heart of the agent loop: modelling errors are returned as a
captured traceback (`ok: false`) so Claude can self-correct rather than crashing.

```bash
uv run --package cad cad build path/to/model.py --params params.json --json
```

`model.py` defines `build(params: dict) -> Shape` (preferred) or a module-level
`result`. Engines: build123d (primary); CadQuery is an optional fallback
(`pip install 'cad[cadquery]'`). See `src/cad/examples/box_with_holes.py`.

The SVG "render" uses `project_to_viewport` → `ExportSVG` (no GPU needed), giving
the agent a cheap visual to inspect. `metadata.bounding_box_mm` + `volume_mm3` are
returned for dimension sanity-checks.
