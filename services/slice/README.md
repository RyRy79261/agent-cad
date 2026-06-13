# slicer — headless slicing + g-code extraction

Wraps OrcaSlicer / PrusaSlicer CLIs and handles the Ender 5 S1 workflow.

```bash
# OrcaSlicer (built-in Ender 5 S1 profile) — auto-extracts plain g-code
uv run --package slicer slice orca model.3mf \
  --machine ender5s1.json --process std.json --filament petg.json

# The critical gotcha, on demand: pull plate_1.gcode out of a .gcode.3mf
uv run --package slicer slice extract out.gcode.3mf
uv run --package slicer slice info out.gcode.3mf        # print-time / filament

# Copy plain g-code to a FAT32 SD card root with a Marlin-safe 8.3 name
uv run --package slicer slice sd out.gcode /media/SDCARD
```

OrcaSlicer's `--export-3mf` writes a **`.gcode.3mf`** ZIP (real g-code at
`Metadata/plate_1.gcode`); `slicer.extract` unzips it. PrusaSlicer's
`slice prusa` writes plain `.gcode` directly (bring your own `.ini`).

Locate binaries via `$ORCA_SLICER_BIN` / `$PRUSA_SLICER_BIN` or PATH. Pure stdlib —
no Python deps; the slicers are external system installs.
