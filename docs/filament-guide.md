# Filament guide — beginner content for the Creation Wizard

Plain-English filament teaching content, written so it can drop straight into the
in-app **Creation Wizard** that helps a novice pick a material. Scoped to the
Creality Ender 5 S1 and the eventual use case (Iveco camper/van parts). The
printer-setup and calibration steps live in [printer-ender5s1.md](printer-ender5s1.md).

> This synthesises established, stable filament references (see Sources). Unlike the
> fast-moving CAD/LLM findings in [research-and-roadmap.md](research-and-roadmap.md),
> these material properties don't change month-to-month — but always trust the
> **spool's own label** for exact temperatures.

## "Is my spool PLA?" (identify an unknown filament)

You assumed black PLA — here's how to check before printing:

1. **Read the spool/box.** Manufacturers print the material (PLA/PETG/ASA/ABS) and a
   **recommended temperature range** right on the label. This is the reliable answer.
2. **No label? Use the print-temperature behaviour.** PLA flows well at **190–215 °C**
   and *won't* extrude cleanly much below ~180 °C. PETG needs ~230–250 °C; ABS/ASA
   ~240–260 °C. If it extrudes nicely around 200 °C, it's almost certainly PLA.
3. **Smell (faint).** PLA smells slightly sweet when printing; ABS/ASA smell sharp/
   chemical (styrene). PETG is nearly odourless.
4. **When unsure, assume PLA and start cool** (205 °C). Printing PETG/ABS *too cold*
   just gives bad prints, not danger — so PLA settings are the safe default to test with.

## PLA settings for the Ender 5 S1 (your starting point)

Official Creality starting temps are **205 °C nozzle / 60 °C bed**. Sensible full
PLA profile to begin from (then refine with the calibration prints):

| Setting | Value | Note |
| --- | --- | --- |
| Nozzle temp | **205 °C** | Fine-tune with a temperature tower (190–220) |
| Bed temp | **60 °C** | 50–60 °C; clean the PC plate with IPA first |
| First-layer nozzle | 210 °C | Slightly hotter for adhesion |
| First-layer speed | **20 mm/s** | Slow = sticks. The #1 beginner fix |
| Print speed | 50–60 mm/s | The S1 *can* go faster; start reliable |
| Part cooling fan | **100 %** (off for layer 1) | PLA loves cooling |
| Retraction | 0.8 mm direct-drive | The S1 has a direct extruder; short retracts |

## The material comparison (Wizard's "which filament?" table)

Ease = how forgiving for a beginner. Max temp = roughly where the part starts to
soften. All five print on the Ender 5 S1 (it reaches 300 °C / 110 °C).

| Material | Ease | Strength | Max service temp | UV / weather | Fumes / enclosure | Best for |
| --- | --- | --- | --- | --- | --- | --- |
| **PLA** | ★★★★★ easiest | Stiff but brittle | **~50–60 °C** ⚠️ | Poor | Minimal; none needed | Learning, prototypes, fit-checks, cool indoor parts |
| **PETG** | ★★★☆☆ (stringy) | Tough, slightly flexible | ~70–85 °C | Medium | Low; no enclosure needed | **Interior/shaded van parts** — the practical default |
| **ASA** | ★★☆☆☆ (warps) | Strong | ~95–100 °C | **Best** (made for outdoors) | Styrene — **ventilate + enclose** | **Sun/heat-exposed exterior** parts |
| **ABS** | ★★☆☆☆ (warps) | Strong | ~98–105 °C | Poor (chalks in sun) | Styrene — ventilate + enclose | Shaded, heat-stressed indoor parts |
| **CF blends** (PLA-CF/PETG-CF/ASA-CF) | varies | Very stiff, dimensionally stable | base + | as base | as base | Load-bearing / anti-vibration — **needs a hardened nozzle** (CF wears brass) |

## Choosing for a van/camper (the Wizard's decision flow)

1. **Just learning / a quick fit-check?** → **PLA** (what you have). Cheap, easy, perfect
   for proving the pipeline and the printer.
2. **A real part that lives *inside* the van (shaded)?** → **PETG**. ⚠️ **Not PLA** — a
   parked van in summer sun can hit **60–80 °C inside**, and PLA softens at ~50–60 °C, so
   PLA parts can sag/warp. PETG handles cabin heat.
3. **A part in *direct sun* or near heat (window mounts, exterior)?** → **ASA** — the best
   UV + heat resistance. Needs an enclosure and ventilation (styrene fumes).
4. **Load-bearing or vibration (brackets under stress)?** → a **CF blend** for stiffness
   (buy a hardened steel nozzle first — carbon fibre chews through brass).
5. **Keep printed parts out of genuinely hot spots** (diesel-heater exhaust, direct hot-air
   path) — use metal there.

**Safety:** ABS and ASA emit **styrene** — print enclosed and ventilated. Keep PETG / ASA /
nylon **dry** (they absorb moisture and print badly when damp). PLA is the low-fuss one.

## Sources

unionfab.com (ASA vs ABS vs PETG vs PLA) · sovol3d.com (outdoor filament; temp settings) ·
3dprinterly.com (identify PLA/ABS/PETG) · filamentive.com (UV-resistant filament guide) ·
wiki.creality.com Ender-5 S1 manual (PLA 205/60). Cross-checked against the existing
van-materials guidance in [printer-ender5s1.md](printer-ender5s1.md).
