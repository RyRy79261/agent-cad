# Calibration-cube troubleshooting (Ender 5 S1 + OrcaSlicer)

Developer-facing reference behind the in-app guide at **`/troubleshooting`**
(`apps/web/app/troubleshooting/`). The full symptom→fix matrix (corner bulging,
ringing, first-layer, warping, elephant's foot, under/over-extrusion, skew, layer
shift, stringing, top-layer gaps, seam zits) lives in
`apps/web/app/troubleshooting/data.ts` — that is the single source of truth for the
KB. This file records the *why* behind the corner-bulging diagnosis and the
resulting slicer-profile tune, which a maintainer reading the committed profiles
needs.

## The corner "ribbing" diagnosis

An expert inspecting our first printed cube reported "ribbing" at the corners: the
slicer over-depositing so each corner sits proud of the flat face. A verified
research pass (multi-agent, 19/19 claims stood under adversarial review) concluded:

- **It is corner bulging, not ringing.** A raised lump *on* the vertex = bulging
  (melt-pressure dumped as the head decelerates into the corner). Repeating ripples
  *trailing along the wall after* a corner = ringing (vibration). Ours is bulging.
- **The real cure is pressure advance (PA).** PA pre-emptively backs off extruder
  pressure before the corner so nothing over-oozes. We had none configured.
- **Stock Ender 5 S1 firmware cannot do PA.** It ships with Marlin Linear Advance
  (`M900`) compiled *out*, so setting `pressure_advance` in OrcaSlicer is a **silent
  no-op**. The real cure needs a firmware flash (TH3D Unified 2 / Klipper) — which
  the project owner has chosen **not** to do (stay stock).
- **The expert's "smooth the acceleration" instinct is the wrong lever** and would
  backfire: *lowering* acceleration/jerk *lengthens* the corner dwell and makes bulging
  **worse**. Acceleration stays firmware-capped (500 mm/s²); jerk is instead *raised* to
  25 (`machine_max_jerk_x/y`) to shorten the corner dwell. Lowering accel/jerk is the
  lever for *ringing*, the opposite artifact.

## The firmware-free tune (applied to the committed profiles)

Since PA is off the table on stock firmware, we attack the same physics with the
levers that don't need it. In `services/slice/src/slicer/profiles/ender5s1/`:

| Change | File | From → To | Why |
| --- | --- | --- | --- |
| `outer_wall_speed` | process.json | 40 → **25** mm/s | Less cruise pressure → smaller corner over-deposit. Best PA-free lever. |
| `inner_wall_speed` | process.json | 40 → **25** mm/s | Keep symmetric. |
| `precise_outer_wall` | process.json | (unset) → **"1"** | Removes outer/inner wall overlap so the cube measures truer. Needs the inner→outer `wall_infill_order` we already use. |
| `fan_max_speed` | filament.json | (inherited 80%) → **"100"** | The `fdm_filament_pla` base only gives 80%; full PLA cooling sets each layer before the next. |
| accelerations | process.json | **unchanged (0 → firmware)** | Lowering them makes bulging *worse*. Deliberately left alone. |

These are mitigations, not a cure: corners improve but won't be perfectly crisp
without PA. This is a *first* cube on an untuned machine — mild residual bulge is
cosmetic and normal. Nail the first-layer/Z-offset baseline before chasing tenths.

**Verification loop:** after the change, re-slice the 20 mm XYZ cube, print, and
measure X/Y/Z with calipers (avoid the embossed letters + bottom 3 layers); target
20.00 mm, 19.85–20.15 good. Inspect corners under raking light. Cap slicer-only
tuning at ~2 print/measure rounds — beyond that, the remaining gain needs the
firmware/PA project.

## If the owner ever reconsiders firmware (the real cure)

1. Flash Linear-Advance-capable firmware (TH3D Unified 2 for the Ender 5 S1 board,
   or Klipper via a Sonic Pad). A naive `LIN_ADVANCE` enable on this board's
   TMC2208/2225 *standalone* drivers causes first-layer stutter — it needs
   SpreadCycle + a raised `MINIMUM_STEPPER_PULSE`.
2. Run **OrcaSlicer › Calibration › Pressure Advance** (Direct Drive, Pattern or
   Tower). Read the value off the cleanest-corner band (direct-drive PLA is small;
   *read it, don't trust a looked-up number*).
3. Store it via the filament setting (`enable_pressure_advance` + `pressure_advance`)
   — one storage path only; don't also hard-code `M900 K` in start g-code. Do **not**
   enable Adaptive PA (OrcaSlicer marks it Klipper-only / untested on Marlin).
