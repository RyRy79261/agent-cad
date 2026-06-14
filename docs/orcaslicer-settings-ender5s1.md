# OrcaSlicer settings reference — Ender 5 S1

The definitive map of the OrcaSlicer settings behind our bundled Ender 5 S1
profiles (`services/slice/src/slicer/profiles/ender5s1/` — `machine.json`,
`process.json`, `filament.json`). It explains every setting that actually shapes
a stock-Ender-5-S1 PLA print, which ones **we** set explicitly, and which exist
only because the profile lineage runs through Bambu Studio / Creality presets.

> Source of truth for *which* OrcaSlicer key each UI knob drives:
> `services/slice/src/slicer/profiles/__init__.py` → `slice_overrides()`.
> Override mechanism: `profile_with_overrides()` (copy committed profile, apply
> overrides, slice the copy). The CLI has no reliable per-key flag, so **every**
> override goes through that copy-and-patch path.

---

## 1. Summary

A fully resolved OrcaSlicer config for one of our slices contains **571 settings**
(the critic counted 569 in the flat dump; +2 resolved aliases like
`first_layer_height` / `bed_shape` that mirror their Orca-native key). Of those:

| Bucket | Count | Meaning |
|---|---:|---|
| **Total resolved settings** | ~571 | Everything OrcaSlicer writes into the flat config for a slice. |
| **We set explicitly** | ~156 | Committed across our three profile JSONs (machine/process/filament). |
| **Inherited** | ~415 | Pulled from the `inherits` chain (Creality common + Generic PLA + Orca system) — we never touch them. |
| **Surfaced in the web UI today** | 6 | `infill`, `wall_speed`, `jerk`, `bed_temp`, `nozzle_temp`, `flow`. |

**The one point that matters most:** we can override **any** of the 571 via
`profile_with_overrides`. The committed JSON is just a default; the slice request
copies it, patches the requested keys, and slices the copy. Exposing more knobs is
purely a UI/mapping exercise (`slice_overrides`) — no slicer plumbing changes.

**How many of the 571 are genuinely relevant to a stock Ender 5 S1?** Roughly
**150–200**. The rest is noise from the profile lineage:

- **~120–150** keys are dead Bambu/AMS/multi-material/chamber/cutter/timelapse
  features with no Ender 5 S1 hardware (see §3).
- **~80** are per-bed-type plate variants, per-extruder bookkeeping, resolved
  aliases, GUI cosmetics (colors, thumbnails, notes), and cost/time-estimate
  fields with **zero** print effect.
- The genuinely tunable surface for *this* machine + PLA is the
  **~40 high/medium-value knobs** called out in §2 and §4.

Bottom line: 571 is inflated ~3×. Treat the high/medium rows in §2 as the real
config; treat §3 as confirmation that the bulk is inert.

---

## 2. By category

Tables are scannable. **Bold `✔` in the *Set?* column = we set it explicitly**
in our committed JSON (machine/process/filament). Blank = inherited. *Expose?*
is the recommendation for the web Print-settings panel (high / med / low / —).

Legend: ranges and "what it does" are for a **stock Ender 5 S1, 0.4 mm Sprite
direct-drive hotend, textured PC/PEI plate, generic PLA**.

### 2.1 Layers, walls & quality

| Setting | Our value | What it does | Ender 5 S1 range | Set? | Expose? |
|---|---|---|---|:--:|:--:|
| `layer_height` | 0.2 | Z thickness per layer — the headline quality/speed tradeoff | 0.08–0.28 (≤0.3 = 0.75× nozzle); 0.12–0.16 fine, 0.24–0.28 fast | **✔** | high |
| `wall_loops` | 2 | Perimeter count — major strength knob | 2 (economy) → 3–4 (load-bearing); 2×0.45 ≈ 0.9 mm wall | **✔** | high |
| `top_shell_layers` | 7 | Solid top layers | 4–7 at 0.2 mm; 5 is plenty | **✔** | high |
| `bottom_shell_layers` | 5 | Solid bottom layers | 3–5 at 0.2 mm | **✔** | high |
| `top_shell_thickness` | 0.8 | Min solid top in mm (overrides count if more) | 0.8–1.0 mm | **✔** | med |
| `bottom_shell_thickness` | 0 | Min solid bottom (0 = driven by layer count) | 0 or 0.8–1.0 mm | **✔** | low |
| `line_width` | 0.45 | Default extrusion width feeding most roles | 0.4–0.5 (100–125% nozzle) | **✔** | high |
| `outer_wall_line_width` | 0.45 | Visible outer perimeter width — XY accuracy | 0.4–0.45; 0.42 tightens tolerance | **✔** | med |
| `inner_wall_line_width` | 0.45 | Interior perimeter width | 0.45–0.5 | **✔** | low |
| `initial_layer_line_width` | 0.42 | First-layer width — wider = more squish/grip | 0.42–0.5 | **✔** | low |
| `top_surface_line_width` | 0.4 | Top solid surface width — finer = smoother | 0.4–0.42 | **✔** | low |
| `precise_outer_wall` | 1 (on) | Compensates outer path so external dims match model | on for accuracy (needs flow calib) | **✔** | med |
| `wall_generator` | arachne | Variable-width perimeter engine (vs classic) | arachne (best thin walls) | | med |
| `wall_sequence` *(from our `wall_infill_order`)* | inner/outer | Inner-vs-outer wall print order | inner/outer (strong) or outer/inner (cleaner face) | **✔** | med |
| `detect_overhang_wall` | 1 (on) | Gates overhang speed ladder + overhang fan | on (required for the ladder) | **✔** | med |
| `resolution` | 0.012 | Contour-simplify deviation (fidelity vs g-code size) | 0.01–0.025; 0.02 general | **✔** | low |
| `enable_arc_fitting` | 0 (off) | Emit G2/G3 arcs (smaller g-code, smoother curves) | **off** — stock S1 Marlin may mishandle arcs | **✔** | low |
| `xy_hole_compensation` | 0 | Grow/shrink holes for press-fit accuracy | 0 to −0.1 mm after a tolerance test | **✔** | med |
| `xy_contour_compensation` | 0 | Grow/shrink external contours for XY accuracy | −0.1 to +0.1 mm from a calib cube | **✔** | med |
| `elefant_foot_compensation` | 0.1 | Shrinks first layer(s) to kill the squish bulge | 0.1–0.2 on textured PEI | **✔** | med |
| `top_surface_pattern` | monotonicline | Top visible fill pattern — cosmetic | monotonic/monotonicline (smoothest) | **✔** | med |
| `bottom_surface_pattern` | monotonic | Bottom (bed-side) fill pattern | monotonic | **✔** | low |
| `reduce_crossing_wall` | 0 (off) | Reroute travel to avoid crossing perimeters (cuts scars/stringing) | on = cleaner, slight time cost | **✔** | med |
| `infill_wall_overlap` | 25% | Sparse-infill ↔ inner-wall weld | 15–25% | **✔** | low |
| `min_layer_height` / `max_layer_height` | 0.08 / 0.32 | Adaptive-layer clamps (20% / 80% of nozzle) | leave | **✔** | low |

*Inherited safeguards left at sensible defaults:* `ensure_vertical_shell_thickness`
(ensure_all), `detect_narrow_internal_solid_infill` (on), the Arachne tuning set
(`wall_distribution_count`, `wall_transition_*`, `min_bead_width`,
`min_feature_size`), `top_bottom_infill_wall_overlap` (25%), `top/bottom_surface_density`
(100% — must stay solid). The overhang **speed** ladder lives in §2.3.

### 2.2 Infill

| Setting | Our value | What it does | Ender 5 S1 range | Set? | Expose? |
|---|---|---|---|:--:|:--:|
| `sparse_infill_density` | 15% | % interior filled — the most-asked tuning knob | 10–20% general; 30–50% functional; 0% vase | **✔** | high |
| `sparse_infill_pattern` | crosshatch | Infill geometry | crosshatch (fast/strong), gyroid (isotropic favorite), grid, cubic | **✔** | high |
| `sparse_infill_speed` | 60 | Infill print speed (hidden, so time-only) | 60–100, capped by volumetric (12 mm³/s) | **✔** | med |
| `infill_direction` | 45 | Base angle of sparse infill | 45 standard; 0/90 to bias one axis | **✔** | med |
| `infill_combination` | 0 (off) | Combine infill across layers (speed for tall parts) | off = quality; on for fast bulky prints | **✔** | med |
| `infill_wall_overlap` | 25% | Sparse infill ↔ wall bond | 15–30% | **✔** | med |
| `internal_solid_infill_speed` | 50 | Speed for solid layers under the top surface | 40–80; too fast telegraphs into the top | **✔** | med |
| `minimum_sparse_infill_area` | 10 | Pockets below this (mm²) go solid | 5–15 | **✔** | low |
| `gap_infill_speed` | 30 | Thin gap-fill speed (keep slow) | 20–40 | **✔** | low |
| `gap_fill_target` | nowhere | Where gap fill is applied | ⚠ resolved **nowhere** disables gap fill — consider `everywhere`/`topbottom` for watertight parts | | med |
| `bridge_flow` | 0.95 | Outer-bridge flow multiplier | 0.7–1.0; lower if PLA bridges sag | **✔** | med |
| `bridge_speed` | 25 | Outer-bridge speed (cooling matters more) | 20–50; 25 safe for PLA | **✔** | med |
| `reduce_infill_retraction` | 1 (on) | Skip retracts inside infill (faster, hidden stringing) | on | **✔** | — |

*Inherited / leave-alone:* `internal_solid_infill_pattern` (monotonic),
`infill_anchor`(400%)/`infill_anchor_max`(20), the **internal-bridge** family
(`thick_internal_bridges`=1, `internal_bridge_*` — good defaults for clean tops
over sparse infill), all `*_flow_ratio` (1.0 — global flow handles it), and the
**skin/skeleton "locked infill"** family (`skin_infill_*`, `skeleton_infill_*`,
`infill_lock_depth`, `infill_shift_step`, `infill_overhang_angle`) which is
**inert** unless a Bambu-style cut-infill pattern is selected (we use crosshatch).

### 2.3 Speeds

| Setting | Our value | What it does | Ender 5 S1 range | Set? | Expose? |
|---|---|---|---|:--:|:--:|
| `outer_wall_speed` | 25 | Visible perimeter speed — #1 surface-quality lever | 20–40 PLA; slow = cleaner (classic jerk, no input shaping) | **✔** | high |
| `inner_wall_speed` | 25 | Hidden perimeter speed | 30–60; can run ~1.5–2× outer | **✔** | high |
| `sparse_infill_speed` | 60 | Infill speed (hidden) | 60–100 under the 12 mm³/s cap | **✔** | high |
| `top_surface_speed` | 30 | Top visible surface speed — top-3 quality knob | 20–40; slow for flat tops | **✔** | high |
| `initial_layer_speed` | 30 *(our `35%` → resolves 30)* | First-layer speed — #1 adhesion fix | 20–30; slower rescues adhesion | **✔** | high |
| `filament_max_volumetric_speed` | 12 | Hard mm³/s cap; throttles **every** print speed | 10–15 for stock Sprite + PLA; the real "go faster safely" lever | **✔** | high |
| `travel_speed` | 150 | Rapid non-print move speed | 120–200 (firmware cap 500); cuts ooze window | **✔** | med |
| `internal_solid_infill_speed` | 50 | Solid-layer speed (under top) | 40–80; too fast → wavy top base | **✔** | med |
| `bridge_speed` | 25 | Bridge span speed | 20–30 PLA | **✔** | med |
| `initial_layer_infill_speed` | 35 | First-layer infill speed | 25–40; bundle under "first-layer speed" | **✔** | med |
| `overhang_2_4_speed` | 20 | 25–50% overhang band | 15–25 | **✔** | med |
| `overhang_3_4_speed` | 15 | 50–75% overhang band | 10–20 | **✔** | med |
| `overhang_4_4_speed` | 10 | 75–100% (steepest) band — most quality-sensitive | 5–15; pairs with overhang fan 100% | **✔** | med |
| `overhang_1_4_speed` | 0 | Mildest band (0 = use wall speed) | 0 fine | **✔** | low |
| `gap_infill_speed` | 30 | Thin gap-fill speed | 20–40 | **✔** | low |
| `support_speed` | 40 | Support body speed (only when supports on) | 40–80 (sacrificial) | **✔** | low |
| `support_interface_speed` | 80 *(our `100%` → resolves 80)* | Support roof/floor speed | 30–80 | **✔** | low |

*Inherited:* `small_perimeter_speed` (50% — slows tight loops, good),
`enable_overhang_speed` (1, gates the ladder), `internal_bridge_speed` (150% of
bridge), `skirt_speed` (50), `travel_speed_z` (0 → firmware 5 mm/s Z cap),
`initial_layer_travel_speed` (100%), `wipe_speed` (80%), `role_based_wipe_speed`
(1), `slow_down_min_speed` (10), `scarf_joint_speed`/`resonance_avoidance`
(off/inert). **Note:** several of our committed speeds use *relative* (`%`) values
in `process.json` that resolve to absolute mm/s here (`initial_layer_speed` 35%→30,
`support_interface_speed` 100%→80) — surface them as absolute mm/s in any UI.

### 2.4 Acceleration, jerk & motion

The Ender 5 S1 runs **classic-jerk Marlin** (no input shaping, no junction
deviation, no Klipper). `emit_machine_limits_to_gcode=1` means our `machine_max_*`
caps are written as `M201/M203/M204/M205` and the firmware **obeys** them.
`default_acceleration=0` ⇒ percent-based accel keys resolve to the firmware/cap
default, so the **caps below are the de-facto print-accel ceiling**.

| Setting | Our value | What it does | Ender 5 S1 range | Set? | Expose? |
|---|---|---|---|:--:|:--:|
| `machine_max_acceleration_extruding` | 500,500 | Master print-accel cap (`M204 P`) — biggest motion lever | 500 quality-first; 1000–2500 for speed (more ringing) | **✔** | high |
| `default_acceleration` | 0 | Slicer baseline accel (0 = trust firmware/caps) | 0, or 500–1000 to take slicer control | **✔** | high |
| `outer_wall_acceleration` | 500 | Perimeter accel — only non-zero accel emitted; dominates finish | 300–1000; 500 safe on no-input-shaping S1 | | high |
| `machine_max_acceleration_x` / `_y` | 500,500 | Per-axis accel caps (`M201 X/Y`) — raise together to unlock speed | 500 safe; 1000–2500 achievable | **✔** | med |
| `machine_max_jerk_x` / `_y` | 12,12 | Classic-jerk cornering cap (`M205 X/Y`) — real ringing lever | 8–12; **drop to 8** to fix ghosting | **✔** | med |
| `inner_wall_acceleration` | 0 | Hidden-wall accel (0 → default) | 0 or 1000–2000 for speed | **✔** | med |
| `initial_layer_acceleration` | 0 | First-layer accel (0 → firmware) | 0 or 300–500 | **✔** | med |
| `top_surface_acceleration` | 0 | Top-face accel (0 → default; match outer_wall for uniform finish) | 0 or 500 | **✔** | med |
| `default_jerk` | 0 | Slicer default jerk (0 → per-role + firmware) | 0 or 8–12 | | med |
| `outer_wall_jerk` | 9 | Per-role outer-wall jerk (emitted) | 6–9; drop to 6–7 to suppress ringing | | med |
| `machine_max_acceleration_travel` | 1500,1250 | Travel accel cap (`M204 T`) | 1500; 2000–3000 cuts travel time | **✔** | low |
| `machine_max_acceleration_retracting` | 1000,1000 | Retract accel cap (`M204 R`) | 800–1500 | **✔** | low |
| `travel_acceleration` | 0 | Travel accel (0 → firmware, hard-capped by `_travel`) | 0 or 1000–3000 | **✔** | low |

*Z-axis & extruder caps are correct and hardware-bound — do not touch:*
`machine_max_acceleration_z` (100), `machine_max_jerk_z` (0.4),
`machine_max_speed_z` (5), `machine_max_*_e`. *Inert on this firmware:*
`machine_max_junction_deviation` / `default_junction_deviation` (classic jerk
ignores `M205 J`), `accel_to_decel_enable`/`_factor` (Klipper-oriented),
`resonance_avoidance` + its min/max band (off; crude input-shaping stand-in).
*The second value in every `machine_max_*` pair is a "silent/stealth" mode the
S1 doesn't have — we set both equal.*

### 2.5 Temperature & cooling

> **Bed-temp gotcha:** there are six `*_plate_temp` variants (cool/textured-cool/
> supertack/eng/hot/textured). Only **`textured_plate_temp`** is live (our plate),
> but the headless CLI resolves `curr_bed_type` to **`Cool Plate`** (≠
> `default_bed_type` = `Textured PEI Plate`). All variants are 60 °C so output is
> unaffected today — but `slice_overrides` correctly writes **all** plate variants
> when `bed_temp` is set so the requested temp always wins.

| Setting | Our value | What it does | Ender 5 S1 range | Set? | Expose? |
|---|---|---|---|:--:|:--:|
| `nozzle_temperature` | 200 | Hotend temp (all layers after 1st) — top quality knob | PLA 190–220, sweet spot 200–210 | | high |
| `nozzle_temperature_initial_layer` | 200 | First-layer hotend temp (drives `M109` in start g-code) | 200–215 | | high |
| `textured_plate_temp` | 60 | **Active** bed temp (after layer 1) | PLA 50–60; drop to 55/50 if no warp | **✔** | high |
| `textured_plate_temp_initial_layer` | 60 | **Active** first-layer bed temp (`M190` target) | 55–65; most adhesion tuning is here | **✔** | high |
| `fan_max_speed` | 100 | Max part-cooling fan — PLA wants max | 100 (lower for PETG/ASA) | **✔** | high |
| `fan_min_speed` | 20 | Min fan at long layer times | PLA 20–50% (many run higher) | | high |
| `close_fan_the_first_x_layers` | 1 | Fan off for first N layers (adhesion) | 1–3; bump to 2–3 if layers lift | | med |
| `overhang_fan_speed` | 100 | Forced fan on overhangs/bridges | 100 for PLA | | med |
| `slow_down_for_layer_cooling` | 1 (on) | Slow small layers so they cool | on for PLA detail | | med |
| `slow_down_layer_time` | 8 | Layer-time floor that triggers slowdown+max fan | 8–15; raise if small features deform | **✔** | med |
| `slow_down_min_speed` | 10 | Speed floor during cooling slowdown | 10–20 | | med |
| `fan_cooling_layer_time` | 60 | Layer-time where fan starts ramping | 60–100 s | | med |
| `nozzle_temperature_range_low/high` | 190/240 | Advisory clamps for the temp slider | use to bound a UI slider | | low |
| `overhang_fan_threshold` | 95% | Overhang steepness that triggers overhang fan | drop to 50–75% if overhangs droop | | low |

*Inherited / off / hardware-absent:* `full_fan_speed_layer` (0),
`reduce_fan_stop_start_freq` (0), `fan_speedup_*`/`fan_kickstart` (latency
micro-tweaks), `additional_cooling_fan_speed`/`auxiliary_fan` (no aux fan on S1),
`enable_overhang_bridge_fan` (1), `preheat_steps`/`preheat_time`,
`temperature_vitrification` (metadata), `idle_temperature`/`standby_temperature_delta`
(multi-tool only). The five non-textured plate variants are dormant (see §3).

### 2.6 Bed adhesion & first layer

| Setting | Our value | What it does | Ender 5 S1 range | Set? | Expose? |
|---|---|---|---|:--:|:--:|
| `brim_type` | auto_brim | Brim style (auto/outer/ears/none) | none/outer for PLA; ears for tall narrow | | high |
| `brim_width` | 0 | Brim ring width (0 = none w/ auto) | 0 default; 3–5 mm to rescue warp/small footprint | **✔** | high |
| `initial_layer_print_height` | 0.2 | First-layer thickness — thicker = better adhesion | 0.2–0.28; 0.24–0.28 great adhesion fix | **✔** | high |
| `initial_layer_speed` | 30 | First-layer speed (see §2.3) | 20–35 | **✔** | high |
| `raft_layers` | 0 | Raft base layers (nuclear adhesion option) | 0 for PLA; 2–3 for warp-prone | **✔** | med |
| `initial_layer_line_width` | 0.42 | First-layer width — wider = more grip | 0.42–0.5 | **✔** | med |
| `elefant_foot_compensation` | 0.1 | First-layer squish compensation (see §2.1) | 0.1–0.2 | **✔** | med |
| `first_layer_flow_ratio` | 1 | First-layer flow multiplier | 1.02–1.10 to fatten a starved first layer | | med |
| `skirt_loops` | 2 | Priming skirt loops | 1–3 (our start g-code also primes) | **✔** | med |
| `brim_object_gap` | 0 | Brim↔object gap (0 = max hold) | 0; 0.1 if hard to peel | **✔** | low |
| `skirt_distance` | 2 | Skirt↔object gap | 2; 4–6 with a brim | **✔** | low |
| `skirt_height` | 2 | Skirt layer count | 1 normal; 2–3 as draft shield | **✔** | low |
| `draft_shield` | disabled | Tall wall vs drafts (ABS/ASA) | disabled for PLA | **✔** | low |
| `scan_first_layer` | 0 | First-layer camera scan (Bambu) | off — no S1 hardware | **✔** | — |

*Inherited raft/brim-ears/skirt sub-params* (`raft_contact_distance`,
`raft_expansion`, `brim_ears_*`, `skirt_type`/`_start_angle`/`min_skirt_length`,
`draft_shield` sub-options) only matter once their parent feature is on.

### 2.7 Retraction, seam & wipe

| Setting | Our value | What it does | Ender 5 S1 range | Set? | Expose? |
|---|---|---|---|:--:|:--:|
| `retraction_length` | 2 | Filament pullback on travel — #1 stringing knob | ⚠ 0.5–1.5 for short-path Sprite; **2 is high** (clicking/under-extrusion risk) | **✔** | high |
| `seam_position` | aligned | Where the Z-seam goes (aligned/nearest/back/random) | aligned (clean) or back (hidden) | **✔** | high |
| `retraction_speed` | 30 | Retraction pullback speed | 30–45 (Sprite handles 40) | | med |
| `retraction_minimum_travel` | 2 | Min travel before retracting | 1–3 | **✔** | med |
| `z_hop` | 0.4 | Nozzle lift on travel (anti-scar vs more stringing) | 0–0.4; try 0.2 or 0 if stringing | | med |
| `seam_gap` | 10% | Gap at seam close to reduce the bulge | 0–15% | | med |
| `wipe` | 0 (off) | Wipe nozzle along last path on retract — cheap stringing win | on is a low-risk quality gain | | med |
| `staggered_inner_seams` | 0 (off) | Offset inner seams layer-to-layer (strength/watertight) | on = low-risk win for functional parts | | med |
| `deretraction_speed` | 30 | Reload speed after retract | 20–40 | **✔** | low |
| `z_hop_types` | Slope Lift | How the Z lift is done | Slope/Normal | | low |
| `retract_before_wipe` | 70% | Fraction of retract done before the wipe | 0–100% (only when `wipe`=1) | **✔** | low |
| `reduce_infill_retraction` | 1 (on) | Skip retracts inside infill | on | **✔** | low |
| `use_firmware_retraction` | 0 | Use G10/G11 instead of E moves | **off** — S1 Marlin isn't configured for it | | — |

*Inert / multi-tool:* `retract_length_toolchange` (1), `retract_restart_extra_toolchange`,
the full **scarf-joint / seam-slope** family (`has_scarf_joint_seam`=0 gates all
`scarf_*`/`seam_slope_*` — advanced cosmetic, off), `retract_lift_above/below/enforce`,
`wipe_distance`/`wipe_speed`/`wipe_on_loops`/`wipe_before_external_loop` (only with
`wipe`=1). All `*_when_cut`/`*_when_ec`/`cooling_tube_*`/`parking_pos_*` and the
entire `wipe_tower_*` set are Bambu cutter/MMU — see §3.

### 2.8 Surface effects & misc process

| Setting | Our value | What it does | Ender 5 S1 range | Set? | Expose? |
|---|---|---|---|:--:|:--:|
| `spiral_mode` | 0 (off) | Vase mode — single spiralling wall, no top/infill | on for vases/cups (PLA loves these) | **✔** | high |
| `ironing_type` | no ironing | Extra smoothing pass on tops (no/top/topmost/all-solid) | "topmost surface" for glossy flat tops | **✔** | high |
| `fuzzy_skin` | disabled | Textured-wall finish (outer/all) | "outer walls" for grippy/decorative | | high |
| `reduce_crossing_wall` | 0 (off) | Detour travel to avoid crossing perimeters (see §2.1) | on for stringy parts (can nub thin features) | **✔** | high |
| `print_sequence` | by layer | All objects together vs one-at-a-time | ⚠ "by object" risks gantry collision on S1 — warn, don't casually toggle | **✔** | med |
| `ironing_flow` | 15% | Ironing extrusion % (gap-fill vs smooth) | 10–20% (only when ironing on) | **✔** | med |
| `ironing_spacing` | 0.1 | Ironing line spacing (≤nozzle for coverage) | 0.1–0.15 | **✔** | med |
| `fuzzy_skin_thickness` | 0.2 | Fuzz amplitude | 0.2–0.4 mm (only when fuzzy on) | | med |
| `spiral_mode_smooth` | 0 | Smooth X/Y in vase mode (needs relative E — we have it) | on for smoothest vase | | med |
| `max_travel_detour_distance` | 0 | Detour cap for `reduce_crossing_wall` | 5–20 mm when that's on | **✔** | low |
| `ironing_speed` | 15 | Ironing pass speed | 15–30 (slow is right) | **✔** | low |
| `enable_prime_tower` | 0 (off) | Purge tower for multi-filament | off — we override the inherited `1` down to `0` | **✔** | — |
| `timelapse_type` | 0 | Timelapse capture mode | off — no S1 camera/macro | | — |

*Inert / off:* `fuzzy_skin_*` internals (mode/noise/octaves/persistence/scale/
point_distance), `spiral_*_flow_ratio`, `ironing_inset`/`angle`/`angle_fixed`/
`ironing_fan_speed` (−1), `support_ironing*`, `ooze_prevention`+`standby_temperature_delta`
(multi-tool), `*_print_sequence`/`print_order` (multi-object), the whole
`prime_tower_*` / `wipe_tower_*` / `purge_*` set (multi-material — §3).

### 2.9 Support

All off by default (`enable_support=0`) — correct for cubes/Benchys. When a user
flips it on for an overhang part:

| Setting | Our value | What it does | Ender 5 S1 range | Set? | Expose? |
|---|---|---|---|:--:|:--:|
| `enable_support` | 0 (off) | Master support toggle — the one users flip first | off for most PLA; on for steep overhangs/long bridges | **✔** | high |
| `support_type` | normal(auto) | Topology + placement (normal/tree, auto/manual) | normal(auto) general; tree(auto) for organic | **✔** | high |
| `support_threshold_angle` | 30 | Overhang angle that triggers auto-support | 30 safe; 45–50 saves material once cooling dialed | **✔** | high |
| `support_style` | grid | Sub-style (grid/snug; organic/hybrid for tree) | grid sturdy; snug saves filament | **✔** | med |
| `support_top_z_distance` | 0.15 | Gap between support top and model — removability | 0.1–0.2 (~0.5× layer) | **✔** | med |
| `support_object_xy_distance` | 0.35 *(our `60%`)* | Horizontal support↔wall clearance | 0.3–0.5 | **✔** | med |
| `support_interface_top_layers` | 3 | Dense roof layers — overhang finish vs removal | 2–3; 0 = fully sparse | **✔** | med |
| `support_interface_spacing` | 0.2 | Roof line spacing — denser = smoother, harder to remove | 0.2 (near-solid) → 0.35–0.5 (easy removal) | **✔** | med |
| `support_on_build_plate_only` | 0 | Restrict supports to grow from bed only | off general; on to protect model faces | **✔** | med |
| `support_speed` | 40 | Support body speed (see §2.3) | 40–80 | **✔** | low |
| `support_line_width` | 0.38 | Support width (under-nozzle = easier snap) | 0.36–0.45 | **✔** | low |
| `support_base_pattern_spacing` | **2.5** | Support density spacing — the base default 0.2 mm is near-solid/wasteful, so we set 2.5 mm for removable supports | 2.0–3.0 | **✔** | low |

*Support filament keys (`support_filament`, `support_interface_filament`) are
locked to 0 — single extruder.* Tree-support branch params and the inherited
detection/flow knobs are fine at defaults; only relevant with `support_type=tree`.

---

## 3. Not applicable — why 571 is inflated

These big groups exist only because the profile lineage runs through Bambu Studio
and Creality presets. **None** has matching Ender 5 S1 hardware; they are inert
regardless of value. This is where the bulk of the ~415 inherited settings go.

| Group | Example keys | Why it doesn't apply |
|---|---|---|
| **AMS / multi-material / MMU** | `flush_into_*`, `flush_volumes_matrix/vector`, `filament_map*`, `filament_loading/unloading_speed*`, `filament_cooling_moves`, `filament_multitool_ramming*`, `wiping_volumes_extruders`, `single_extruder_multi_material*`, `high_current_on_filament_swap`, `cooling_tube_*`, `parking_pos_retraction`, `grab_length` | Single Sprite extruder, no AMS/MMU — no tool changes, no purging, no filament swaps. ~40+ keys. |
| **Prime / wipe tower** | `enable_prime_tower`, `prime_tower_*`, `wipe_tower_*` (x/y/rotation/type/wall/rib/cone/bridging/...), `prime_volume`, `purge_in_prime_tower`, `filament_minimal_purge_on_wipe_tower` | A purge tower only prints for multi-filament. We force `enable_prime_tower=0`; the ~25 geometry keys never fire. |
| **Bambu cutter / "when cut"** | `enable_long_retraction_when_cut`, `long_retractions_when_cut`, `long_retractions_when_ec`, `retraction_distances_when_cut/ec` | No toolhead filament cutter on the S1. |
| **Heated chamber / air filtration / exhaust** | `activate_chamber_temp_control`, `chamber_temperature`, `support_chamber_temp_control`, `activate_air_filtration`, `support_air_filtration`, `during/complete_print_exhaust_fan_speed`, `auxiliary_fan`, `additional_cooling_fan_speed` | Open-frame S1: no chamber, no exhaust/aux fan, no filtration. |
| **Bambu bed-type plate variants** | `cool_plate_temp*`, `textured_cool_plate_temp*`, `supertack_plate_temp*`, `eng_plate_temp*`, `hot_plate_temp*`, `bed_temperature_formula`, `support_multi_bed_types` | The S1 has one textured PC/PEI plate. Only `textured_plate_temp*` is live; the other 5 variants are dormant (some we mirror to 60 for consistency). |
| **Camera / AI / detection / timelapse** | `scan_first_layer`, `head_wrap_detect_zone`, `enable_wrapping_detection`, `wrapping_*`, `timelapse_type`, `time_lapse_gcode`, `bbl_calib_mark_logo`, `exclude_object`/`gcode_label_objects` (M486) | No first-layer scanner, no nozzle-wrap AI cam, no timelapse macro; stock Marlin lacks M486 cancel-object. |
| **Klipper / input-shaping / firmware-retraction** | `accel_to_decel_enable/_factor`, `machine_max_junction_deviation`, `default_junction_deviation`, `resonance_avoidance` (+band), `adaptive_pressure_advance*`, `enable_pressure_advance`/`pressure_advance`, `use_firmware_retraction` | Classic-jerk Marlin: JD ignored, no calibrated PA/Linear Advance, firmware retraction not configured. |
| **Skin/skeleton "locked" infill** | `skin_infill_*`, `skeleton_infill_*`, `infill_lock_depth`, `infill_shift_step`, `infill_overhang_angle`, `interlocking_beam*` | Bambu multi-density cut-infill / interlocking-region feature; inert with our crosshatch single-material infill. |
| **Per-extruder bookkeeping & "silent mode"** | `master_extruder_id`, `physical_extruder_map`, `extruder_offset`, `printer_extruder_variant`, `silent_mode` + the 2nd value of every `machine_max_*` pair | Single tool; the S1 has one motion profile (no StealthChop dual-mode). |
| **Cosmetic / metadata / estimates** | `filament_colour`, `extruder_colour`, `thumbnails`, `*_notes`, `filament_cost`/`density`/`time_cost`, `filename_format`, `inherits_group`, `different_settings_to_system`, `filament_ids/vendor/settings_id` | GUI swatches, cost/weight readouts, preset bookkeeping — **zero** print effect. |

That's ~120–150 hardware-dead keys plus ~80 cosmetic/bookkeeping/variant keys —
the reason 571 resolved settings map to only ~150–200 that matter for *this*
machine, and ~40 worth ever turning into a knob.

---

## 4. UI recommendation — highest-value knobs to add next

Beyond the current 6 (`infill`, `wall_speed`, `jerk`, `bed_temp`, `nozzle_temp`,
`flow`), these are the settings worth a dedicated control, grouped into the UI
sections they'd live in. Each adds a `slice_overrides` mapping + a slider/dropdown.
Ordered within each group by tuning/calibration value.

### Quality
| Knob | OrcaSlicer key | Why it's worth a control |
|---|---|---|
| Layer height | `layer_height` | The headline quality↔speed↔time tradeoff. Belongs next to infill as a top-level dropdown (0.12 / 0.16 / **0.2** / 0.24 / 0.28). |
| Walls (perimeters) | `wall_loops` | Primary strength knob; the most intuitive "make it stronger" lever (2 → 3–4). |
| Top / bottom solid layers | `top_shell_layers` / `bottom_shell_layers` | Surface watertightness & strength; pairs naturally with wall count. |
| Top surface speed | `top_surface_speed` | Top-3 surface-finish lever; slow tops are visibly smoother. |
| Seam position | `seam_position` | Very visible, easy to understand dropdown (aligned / back / nearest / random). |
| Vase mode | `spiral_mode` | Crowd-pleaser toggle; one switch turns any cup/vase into a clean single-wall print. |
| Ironing | `ironing_type` | One dropdown ("off / top surfaces / topmost") for glossy flat tops. |
| Fuzzy skin | `fuzzy_skin` (+ `fuzzy_skin_thickness`) | Popular decorative/grippy texture users actively want to toggle. |

### Speed
| Knob | OrcaSlicer key | Why |
|---|---|---|
| Max volumetric speed | `filament_max_volumetric_speed` | The **true** ceiling on every print speed — the correct "make it faster safely" knob (12 → 15–18 after a flow/temp tower). Higher impact than raising individual speeds. |
| Infill speed | `sparse_infill_speed` | Big time saver with no visual cost (hidden geometry). |
| Print acceleration | `machine_max_acceleration_extruding` (+ `outer_wall_acceleration`) | Single biggest motion lever on a no-input-shaping S1; better surfaced as a **"quality ↔ speed" preset** (500 / 1000 / 1500) than a raw number. |

### Temperature & cooling
| Knob | OrcaSlicer key | Why |
|---|---|---|
| First-layer temps | `nozzle_temperature_initial_layer` + `textured_plate_temp_initial_layer` | Where most adhesion problems are actually tuned; split first-layer from main temps. |
| Min fan / first-layers fan-off | `fan_min_speed` + `close_fan_the_first_x_layers` | Cooling-aggressiveness pair; bumping fan-off layers to 2–3 is the classic "first layer won't stick" fix. |
| Overhang quality | `overhang_4_4_speed` (+ band) + `overhang_fan_speed` | Group the overhang slowdown + fan as one "overhang quality" control — what lets the S1 do clean unsupported overhangs. |

### Adhesion & first layer
| Knob | OrcaSlicer key | Why |
|---|---|---|
| First-layer height | `initial_layer_print_height` | One of the best one-click adhesion fixes (0.2 → 0.24–0.28) on a slightly off-level bed. |
| First-layer speed | `initial_layer_speed` | #1 adhesion fix for beginners; expose as **absolute mm/s** (our committed value is a `%`). |
| Brim | `brim_type` + `brim_width` | The primary "add a brim" control for tall/small-footprint or warpy parts. |
| Elephant-foot compensation | `elefant_foot_compensation` | First-layer dimensional accuracy for fit tolerances. |
| Raft | `raft_layers` | Simple on/off "nuclear option" for adhesion/warp. |

### Accuracy & calibration (Calibration wizard)
| Knob | OrcaSlicer key | Why |
|---|---|---|
| Retraction length | `retraction_length` | #1 stringing knob — and **ours (2 mm) is high** for the short-path Sprite; a 0.5–1.5 mm sweep is the single best reliability win. Prime candidate. |
| XY hole / contour compensation | `xy_hole_compensation` / `xy_contour_compensation` | Per-machine dimensional calibration for press-fits and accurate outer dims (drive from a calibration cube). |
| Infill pattern | `sparse_infill_pattern` | Pair with the existing infill-density slider (crosshatch / gyroid / grid). |
| Supports | `enable_support` + `support_threshold_angle` (+ `support_type`) | The toggle every overhang part needs; threshold angle controls how much support is generated. |

**Suggested phase-2 (highest leverage, ~10 knobs):** `layer_height`, `wall_loops`,
`filament_max_volumetric_speed`, `top_shell_layers`/`bottom_shell_layers`,
`seam_position`, `spiral_mode`, `initial_layer_print_height`, `brim_width`,
`retraction_length`, `enable_support` + `support_threshold_angle`. Each is a
one-line `slice_overrides` addition.

---

## 5. Escape hatch — generic "advanced raw overrides"

**Recommendation: add a power-user "Advanced raw overrides" control — a free-form
`key=value` editor — and ship it.** This is decisive and low-cost because the
plumbing already exists.

**How it maps onto what we have.** `slice_overrides()` is just a typed front-end
that produces `{"process": {...}, "machine": {...}, "filament": {...}}` and hands
it to `profile_with_overrides()`, which does `data.update(overrides)` on the
committed JSON and slices the copy. A raw-override control is the **same path with
the typed layer removed**: parse the user's `key=value` lines, route each key to
the right profile bucket, and merge. Because OrcaSlicer resolves `inherits` from
its own install, the patched copy can set **any** of the 571 keys — there is no
allow-list in the slicer. So a raw editor unlocks the full config surface
(`gap_fill_target=everywhere`, `wall_loops=3`, `ironing_type=topmost surface`, …)
**without any code change per setting**.

**Concrete shape.**
- UI: a textarea, one `key = value` per line, e.g.
  ```ini
  wall_loops = 3
  top_surface_pattern = monotonic
  gap_fill_target = everywhere
  retraction_length = 0.8
  ```
- Routing: the editor needs to know which profile each key belongs to
  (process / machine / filament). Reuse the value-shape rules already documented
  in `profile_with_overrides`: **process keys are scalars** (`"3"`, `"30%"`),
  **filament temps/flow are 1-element arrays** (`["60"]`), **per-axis machine
  limits are 2-element arrays** (`["12","12"]`). Build the key→bucket map from the
  union of our three committed JSONs (every key we already ship is bucketed);
  fall back to "process" for unknown keys (the largest bucket) or surface an
  "unknown key" warning.
- Wire-up: merge the raw map **after** the typed `slice_overrides` so the raw
  editor can override even the 6 surfaced knobs, then pass straight to
  `profile_with_overrides`. No new slicer flags, no profile regeneration.

**The risk, stated plainly.** This bypasses every guardrail:
- **Typos / invalid keys** silently do nothing — `data.update()` happily adds a
  key OrcaSlicer ignores, so the user thinks they changed something and didn't.
- **Wrong value shape** (scalar where an array is expected, or vice-versa) can make
  the slice **fail** or be silently dropped.
- **Footguns that pass validation but ruin/abort the print**: blanking
  `layer_change_gcode` (breaks slicing — the `G92 E0` patch is load-bearing),
  `use_relative_e_distances=0` (fights the M83 start g-code), `z_offset` (first-layer
  crash), `print_sequence=by object` (gantry collision), `enable_arc_fitting=1`
  (stock firmware may mishandle G2/G3), enabling `use_firmware_retraction` or
  pressure advance without calibration.

**Mitigations (do these, then ship it):**
1. **Validate keys against the resolved-config key set** and flag unknowns *before*
   slicing — turns silent typos into a visible warning.
2. **Validate value shape** from the same key→bucket map (array vs scalar) and
   reject mismatches with a clear message.
3. **Lock a small denylist** of load-bearing machine keys (`layer_change_gcode`,
   `use_relative_e_distances`, `gcode_flavor`, `machine_start/end_gcode`, the
   `printable_*` build-volume keys) so a raw override can't break the pipeline or
   defeat the build-volume gate.
4. **Label it "advanced / unsupported"** and keep the typed knobs (§4) as the
   first-class path — the raw editor is the escape hatch, not the default.

This gives a power user the full 571-key surface with no per-setting engineering,
while the denylist + shape/key validation contain the blast radius.

---

## Appendix — known discrepancies worth reconciling

Surfaced by the audit; harmless today but worth a cleanup pass:

- **`curr_bed_type` = "Cool Plate"** but `default_bed_type` = "Textured PEI Plate".
  Both resolve to 60 °C so output is unaffected, but the CLI should pin
  `curr_bed_type` to Textured PEI so the right variant always drives. (`slice_overrides`
  already writes all plate variants when `bed_temp` is set, which masks this.)
- **`printable_height` = 300** in the profile vs **280** in
  `services/cad/src/cad/printer.py`. Parts are gated at 280 upstream so slicing is
  unaffected, but align the profile to 280.
- **`support_base_pattern_spacing` = 0.2 mm** is near-solid (most profiles use
  ~2.5 mm) — would make supports wasteful and hard to remove on any overhang print.
  Review `process.json`.
- **`gap_fill_target` = "nowhere"** disables gap fill entirely (inherited). For
  watertight/functional PLA parts, `everywhere` or `topbottom` is usually better —
  verify this is intentional.
- Several committed speeds use relative `%` values that resolve to absolute mm/s
  (`initial_layer_speed` 35%→30, `initial_layer_infill_speed`,
  `support_interface_speed` 100%→80). Surface them as absolute mm/s in any UI.
- **`retraction_length` = 2 mm** is heavier than ideal for the short-path Sprite
  direct drive (0.5–1.5 mm typical); a tuning sweep is the top calibration win.
