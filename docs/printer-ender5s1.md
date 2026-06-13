# Creality Ender 5 S1 — printer & materials reference

The target machine for the pipeline. These are the facts the slicer profiles,
the g-code → SD workflow, and material choices depend on.

## Specs

| | |
| --- | --- |
| Build volume | **220 × 220 × 280 mm** (Cartesian, bed moves in Z) |
| Extruder | "Sprite" dual-gear direct drive, 1:3.5 ratio, 80 N |
| Hotend | All-metal, titanium heatbreak, **up to 300 °C** |
| Bed | Heated, **up to 110 °C**, PC-coated spring-steel flex plate |
| Leveling | CR-Touch 16-point auto bed *compensation* (still needs manual pre-level) |
| Speed | up to 250 mm/s (default profiles ~120 mm/s — reliable); 2000 mm/s² accel |
| Firmware | **Marlin** · 4.3" touchscreen · STM32F401 board |

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
