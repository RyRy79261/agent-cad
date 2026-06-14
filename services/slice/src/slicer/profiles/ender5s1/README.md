# Ender 5 S1 slicer profiles (OrcaSlicer)

Self-hosted, deterministic OrcaSlicer profiles for the Creality Ender 5 S1, so the
pipeline slices the same way everywhere without depending on a user's local
profile export.

- `machine.json` — derived from OrcaSlicer's official **"Creality Ender-5 S1 0.4
  nozzle"** system profile, with **one patch**: `layer_change_gcode` is set to
  `G92 E0`. The Creality base leaves it empty, and OrcaSlicer's own validator
  rejects an empty `layer_change_gcode` for relative-extruder (M83) profiles
  (`"Relative extruder addressing requires resetting the extruder position at each
  layer ... Add 'G92 E0' to layer_gcode"`).
- `process.json` — "0.20mm Standard @Creality Ender5S1".
- `filament.json` — "Creality Generic PLA".

These keep their `inherits` keys, so OrcaSlicer resolves the base profiles from its
own installation at slice time (the `fdm_creality_common` / `fdm_machine_common`
bases ship inside OrcaSlicer). Source: OrcaSlicer (GPL/AGPL) `resources/profiles/`.

Regenerate with `slice ender5s1 <model.stl>` (see `services/slice`).
