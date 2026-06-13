# projects/ — van part design data

One directory per part. The **source of truth is text** (`model.py` + `params.json`)
— it diffs and merges like code. Geometry is reproducible output.

```
projects/<part>/
├── model.py      # build123d source; defines build(params) -> Shape
├── params.json   # parameters fed to build()
├── print.json    # slicer profile, filament, and print outcome/status
└── artifacts/    # generated STL/STEP/3MF/gcode/SVG  (gitignored)
```

Build a part:

```bash
uv run --package cad cad build projects/<part>/model.py \
  --params projects/<part>/params.json
```

`print.json.status` ∈ `designed · sliced · printing · printed-ok · printed-fail`.
When a print succeeds, set `printed-ok`, commit its g-code/STL (Git LFS), and tag
the commit (e.g. `fridge-drawer-v3-printed`).

See `fridge_drawer/` for a worked example.
