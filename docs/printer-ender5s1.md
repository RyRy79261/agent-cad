# Creality Ender 5 S1 — printer & materials reference

The target machine for the pipeline. These are the facts the slicer profiles,
the g-code → SD workflow, and material choices depend on.

## Specs

| | |
| --- | --- |
| Build volume | **220 × 220 × 280 mm** (Cartesian, bed moves in Z) — usable **210 × 210** footprint after a 5 mm bed-edge margin |
| Extruder | "Sprite" dual-gear direct drive, 1:3.5 ratio, 80 N |
| Hotend | All-metal, titanium heatbreak, **up to 300 °C** |
| Bed | Heated, **up to 110 °C**, PC-coated spring-steel flex plate |
| Leveling | CR-Touch 16-point auto bed *compensation* (still needs manual pre-level) |
| Speed | up to 250 mm/s (default profiles ~120 mm/s — reliable); 2000 mm/s² accel |
| Firmware | **Marlin** · 4.3" touchscreen · STM32F401 board |

**Build-volume fit is enforced.** `cad.printer.ENDER_5_S1` is the single source of
truth for this envelope; the CAD runner checks every part's bounding box against
it and reports `metadata.fits_build_volume` / `build_volume_overflow_mm`, and the
`cad` CLI warns when a part overruns the bed. Parts larger than 210 × 210 × 280 mm
must be split into joinable pieces. The TS control plane mirrors the same numbers
in `packages/types` (`ENDER_5_S1`).

## ⚠️ Gotchas baked into the pipeline

### 1. OrcaSlicer CLI exports `.gcode.3mf`, not `.gcode`
There is **no `--export-gcode`** flag. `--export-3mf` writes a ZIP archive whose
real Marlin g-code lives at `Metadata/plate_1.gcode`. The Ender 5 S1 needs the
*plain* `.gcode`, so the slice service unzips it automatically
(`slicer.extract.extract_gcode`). `Metadata/slice_info.config` holds print-time /
filament estimates. PrusaSlicer's `--export-gcode` writes plain g-code directly if
you prefer (bring your own `.ini` — Prusa ships no Ender 5 S1 profile).

### 2. Non-standard long nozzle (NOT a standard MK8)
The Sprite hotend uses a **longer nozzle/heat block** than a standard MK8 — "the
thread is about 4 mm longer". A short MK8 threads in but leaves a gap that puddles
filament and clogs. Buy the correct **longer high-temp 0.4 mm** nozzle for
replacements. (Still 0.4 mm — does not change slicer settings.)

### 3. SD card
Plain **`.gcode`** (also `.gco`/`.g`) on a **FAT32** card, files in the **root**
directory, **short DOS 8.3-style filenames** (no spaces/special chars — Marlin
selects by short name). Use **≤ 8 GB** cards (larger sometimes unrecognised). The
`slicer.sdcard` helper sanitises names and copies to the root for you.

## Slicer profiles

Use **OrcaSlicer** (ships the profile):
- Machine: **"Creality Ender-5 S1 0.4 nozzle"**
- Process: **"0.16mm Optimal"** or **"0.20mm Standard @Creality Ender-5 S1 0.4"**

Export the machine/process/filament JSONs from your installed OrcaSlicer and point
the slice service at them (`--machine`, `--process`, `--filament`). Verify the
exact profile names in your version — they were confirmed via OrcaSlicer PR #974
but not byte-verified.

## Materials (van / automotive use)

| Material | Heat | UV/weather | Printability | Van use |
| --- | --- | --- | --- | --- |
| PLA/PLA+ | poor (~50–60 °C) | poor | easiest | prototypes/fit-checks only |
| **PETG** | ~80–85 °C | medium | easy, no enclosure | **interior/shaded default** |
| ABS | ~105 °C | poor (chalks in sun) | hard, enclosure+vent | shaded heat-stressed only |
| **ASA** | ~93–105 °C | **best** (auto trim) | hard, enclosure | **sun + heat exposed** |
| ASA-CF / ABS-CF / PA-CF | highest | ASA-CF excellent | hardest, hardened nozzle | load-bearing / vibration |

Rules of thumb:
- **PETG** for interior/shaded cabin parts (the pragmatic default).
- **ASA** for anything in direct sun + heat (exterior mounts, near windows, near
  the diesel heater — but keep printed parts out of the direct hot-air/exhaust path;
  use metal where it's genuinely hot).
- **Avoid PLA/plain ABS** for functional in-vehicle parts.
- Functional mounts: **4+ perimeters, 40–60 %+ infill (gyroid)**, orient so loads
  don't peel layers apart, fillet stress risers.
- ABS/ASA emit **styrene** — ventilate + enclose. Keep PETG/ASA/Nylon **dry**.

## First-time setup checklist

1. Assemble (~30 min), install correct long nozzle if replacing.
2. Manual pre-level (paper-drag each corner, 2–3 passes), then CR-Touch Auto Level,
   then fine-tune **Z-offset** live on the first layer. Follow the PDF manual (the
   quick-start leveling text is reportedly wrong).
3. Clean the PC plate with IPA before each print.
4. Calibrate: temp tower, flow rate, retraction (OrcaSlicer built-ins).
5. Use an enclosure for ASA/ABS.

### Leveling, the official way (Creality manual)

Two stages — **do the manual stage first**, the auto stage does *not* replace it:

1. **Auxiliary (manual) leveling.** Home Z, move the hotend to centre, set Z-offset
   against a sheet of **A4 paper** until there's light drag (~0.1 mm). Then select each
   of the four corner points in turn and adjust that corner's knob to the same
   paper-drag clearance.
2. **Auto leveling.** Run `AUTO-LVL → Start` and let the CR-Touch probe to 100 %. This
   *compensates* for small bed waviness; it can't fix a badly hand-levelled bed.
3. **Live Z-offset.** On the first layer of your first print, nudge Z live until the
   lines just squish together (the paper method leaves you ~0.1 mm high).

## Calibration-first: validate the machine before any custom part

A bad first print should mean *"fix the printer,"* not *"fix the CAD."* Print these
**known-good models in order** (free downloads / OrcaSlicer built-ins) before printing
anything agent-cad designs. PLA starting temps: **205 °C nozzle / 60 °C bed**.

| # | Print | Validates | Read the result |
| --- | --- | --- | --- |
| 1 | **First-layer / bed-level test** (single-layer square) | Adhesion + Z-offset | Lines barely touching = good. Gaps = nozzle too high. Translucent/squished ridges = too low (→ *elephant's foot*) |
| 2 | **XYZ calibration cube** (20 mm) | Dimensional accuracy + general quality | Measure with calipers: should be ~20 mm. Off by a lot → steps/flow issue |
| 3 | **Temperature tower** | Best nozzle temp for *this* spool | Pick the hottest block with no stringing and clean overhangs |
| 4 | **Retraction / stringing test** | Retraction tuning | "Cobwebs" between towers = increase retraction; pick the cleanest segment |
| 5 | **3DBenchy** | Everything together | Overhangs, bridging, small features, dimensional accuracy in one print |

Common first-print symptoms: **won't stick** → bed too low/dirty/cold or first layer too
fast; **warping/lifting corners** → bed too cold or draughts (worse for ABS/ASA, rare for
PLA); **stringing** → retraction too low or temp too high; **gaps/weak walls** →
under-extrusion (flow/temp); **wider bottom rim (elephant's foot)** → nozzle too low or
bed too hot.
