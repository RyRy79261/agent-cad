# Ender 5 S1 slicer profiles (OrcaSlicer)

Self-hosted, deterministic OrcaSlicer profiles for the Creality Ender 5 S1, so the
pipeline slices the same way everywhere without depending on a user's local
profile export.

- `machine.json` — derived from OrcaSlicer's official **"Creality Ender-5 S1 0.4
  nozzle"** system profile, with patches: (1) `layer_change_gcode` set to `G92 E0`
  (the Creality base leaves it empty, and OrcaSlicer's own validator rejects an empty
  `layer_change_gcode` for relative-extruder (M83) profiles). (2) **`machine_max_jerk_x/y`
  raised `8 → 12`** — stock Ender 5 S1 Marlin uses *classic jerk* (not junction
  deviation), so this is honored via the emitted `M205`; a *higher* jerk shortens the
  deceleration/dwell at each corner, which *reduces* corner bulging (the inverse of the
  ringing fix — only safe because the walls show no ringing). (3) `default_bed_type`
  set to *Textured PEI Plate* (GUI hint; the headless CLI still defaults to Cool Plate,
  so the bed temp is pinned in `filament.json` instead — see below).
- `process.json` — "0.20mm Standard @Creality Ender5S1". **Corner-bulging tune**
  (stock firmware, no Linear Advance available): `outer_wall_speed` /
  `inner_wall_speed` lowered `40 → 25` mm/s (less melt pressure dumped at corners —
  the best fix available without pressure advance), and `precise_outer_wall` enabled
  (removes wall overlap so the cube measures truer; requires the inner→outer
  `wall_infill_order`, which we keep). **Accelerations are deliberately left at `0`
  (firmware-capped 500 mm/s², jerk 8) — lowering them lengthens corner dwell and
  makes bulging *worse*.** See `docs/troubleshooting-cube.md`.
- `filament.json` — "Creality Generic PLA". `fan_max_speed` pinned to `100` (the
  `fdm_filament_pla` base only inherits 80%); full PLA cooling sets each fast layer
  before the next. **Bed temp pinned to 60 °C** on *every* plate type
  (`{cool,supertack,hot,textured}_plate_temp` + their `_initial_layer` twins): the
  generic `fdm_filament_pla` base resolves the bed to **35 °C** (Cool Plate), far too
  cold for PLA on the Ender 5 S1's textured PC/PEI sheet → poor adhesion/warping. The
  headless CLI ignores plate selection and falls back to Cool Plate, so we set *all*
  plates to 60 — PLA gets 60 °C regardless of which plate resolves.

**Inherited-default corrections** (from a full settings audit — see
`docs/orcaslicer-settings-ender5s1.md`): `support_base_pattern_spacing` 0.2 → 2.5 mm
(0.2 = near-solid supports, unremovable); `gap_fill_target` → `everywhere` (base
disabled gap fill); `retraction_length` 2 → 1 mm (2 mm is heavy for the short-path
Sprite direct drive → stringing/heat-creep); `printable_height` 300 → 280 mm (matches
the real bed and `services/cad/.../printer.py`).

These keep their `inherits` keys, so OrcaSlicer resolves the base profiles from its
own installation at slice time (the `fdm_creality_common` / `fdm_machine_common`
bases ship inside OrcaSlicer). Source: OrcaSlicer (GPL/AGPL) `resources/profiles/`.

Regenerate with `slice ender5s1 <model.stl>` (see `services/slice`).
