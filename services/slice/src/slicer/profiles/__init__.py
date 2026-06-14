"""Bundled, committed slicer profiles for the target printer(s).

Keeping the profiles in-repo makes slicing deterministic and self-hosted — the
pipeline doesn't depend on a user exporting profiles from their local slicer.
See ``profiles/ender5s1/README.md`` for provenance + the one OrcaSlicer patch.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_DIR = Path(__file__).parent

# Creality Ender 5 S1 — OrcaSlicer machine / process / filament (machine patched).
ENDER_5_S1_DIR = _DIR / "ender5s1"
ENDER_5_S1_MACHINE = ENDER_5_S1_DIR / "machine.json"
ENDER_5_S1_PROCESS = ENDER_5_S1_DIR / "process.json"
ENDER_5_S1_FILAMENT = ENDER_5_S1_DIR / "filament.json"


def ender5s1_profiles() -> dict[str, Path]:
    """The bundled OrcaSlicer profile set for the Ender 5 S1."""
    return {
        "machine": ENDER_5_S1_MACHINE,
        "process": ENDER_5_S1_PROCESS,
        "filament": ENDER_5_S1_FILAMENT,
    }


def profile_with_overrides(
    overrides: dict[str, Any], dest: str | Path, *, base: str | Path
) -> Path:
    """Write a copy of a committed profile with ``overrides`` applied; return its path.

    OrcaSlicer's CLI has no reliable per-setting override flag, so to change a slice
    parameter at request time we copy the committed profile (machine/process/filament
    — the source of truth), apply the overrides, and slice with the copy. ``inherits``
    still resolves from OrcaSlicer's own install, so the copy can live anywhere (we drop
    it next to the build's artifacts). Values are written as-is; OrcaSlicer expects
    strings — scalars for process keys (``"30%"``), 1-element arrays for filament temps
    (``["60"]``), 2-element arrays for per-axis machine limits (``["12", "12"]``).
    """
    data = json.loads(Path(base).read_text(encoding="utf-8"))
    data.update(overrides)
    dest = Path(dest)
    dest.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return dest


# Bed-type plate names whose PLA temp the headless CLI might resolve to (it defaults to
# Cool Plate); we override every one so the requested temp wins regardless of selection.
_BED_PLATES = ("cool", "supertack", "hot", "textured", "eng")


def slice_overrides(
    *,
    infill_density: int | None = None,
    wall_speed: int | None = None,
    jerk: int | None = None,
    bed_temp: int | None = None,
    nozzle_temp: int | None = None,
    flow: float | None = None,
    layer_height: float | None = None,
    wall_loops: int | None = None,
    top_layers: int | None = None,
    bottom_layers: int | None = None,
    infill_pattern: str | None = None,
    seam_position: str | None = None,
    brim_width: float | None = None,
    support: bool | None = None,
    support_threshold: int | None = None,
    retraction_length: float | None = None,
) -> dict[str, dict[str, Any]]:
    """Map user-facing slice settings → per-profile OrcaSlicer key overrides.

    Returns ``{"process": {...}, "machine": {...}, "filament": {...}}`` with only the
    profiles that have overrides. Single source of truth for *which* OrcaSlicer key each
    UI setting drives, so the API/CLI never hard-code slicer key names. ``None`` = leave
    the committed-profile default.
    """
    process: dict[str, Any] = {}
    machine: dict[str, Any] = {}
    filament: dict[str, Any] = {}

    # --- the original six -------------------------------------------------- #
    if infill_density is not None:
        process["sparse_infill_density"] = f"{int(infill_density)}%"
    if wall_speed is not None:
        process["outer_wall_speed"] = str(wall_speed)
        process["inner_wall_speed"] = str(wall_speed)
    if jerk is not None:
        machine["machine_max_jerk_x"] = [str(jerk), str(jerk)]
        machine["machine_max_jerk_y"] = [str(jerk), str(jerk)]
    if bed_temp is not None:
        for plate in _BED_PLATES:
            filament[f"{plate}_plate_temp"] = [str(bed_temp)]
            filament[f"{plate}_plate_temp_initial_layer"] = [str(bed_temp)]
    if nozzle_temp is not None:
        filament["nozzle_temperature"] = [str(nozzle_temp)]
        filament["nozzle_temperature_initial_layer"] = [str(nozzle_temp)]
    if flow is not None:
        filament["filament_flow_ratio"] = [str(flow)]

    # --- curated phase-2 knobs --------------------------------------------- #
    if layer_height is not None:
        process["layer_height"] = str(layer_height)
    if wall_loops is not None:
        process["wall_loops"] = str(int(wall_loops))
    if top_layers is not None:
        process["top_shell_layers"] = str(int(top_layers))
    if bottom_layers is not None:
        process["bottom_shell_layers"] = str(int(bottom_layers))
    if infill_pattern is not None:
        process["sparse_infill_pattern"] = str(infill_pattern)
    if seam_position is not None:
        process["seam_position"] = str(seam_position)
    if brim_width is not None:
        process["brim_width"] = str(brim_width)
        # a width with the inherited "auto_brim" may add nothing — force a real brim.
        process["brim_type"] = "outer_only" if float(brim_width) > 0 else "auto_brim"
    if support is not None:
        process["enable_support"] = "1" if support else "0"
    if support_threshold is not None:
        process["support_threshold_angle"] = str(int(support_threshold))
    if retraction_length is not None:
        machine["retraction_length"] = [str(retraction_length)]

    return {k: v for k, v in (("process", process), ("machine", machine), ("filament", filament)) if v}


# Keys an "advanced raw override" must never touch — load-bearing for the pipeline
# (the G92 E0 layer patch, relative-E/M83 start g-code, the build-volume gate).
_RAW_DENYLIST = frozenset({
    "layer_change_gcode", "machine_start_gcode", "machine_end_gcode",
    "before_layer_change_gcode", "change_filament_gcode",
    "use_relative_e_distances", "gcode_flavor",
    "printable_area", "printable_height", "nozzle_diameter",
})


def _committed_key_buckets() -> dict[str, tuple[str, int]]:
    """``{key: (bucket, arity)}`` from the union of our committed profiles.

    Tells the raw router which profile a key belongs to and its value *arity*: ``0``
    for a scalar (most process keys), or the array length for filament temps (``1``)
    and per-axis/per-extruder machine limits (``2``). A raw value is then replicated
    to that arity so e.g. ``machine_max_jerk_x=15`` becomes ``["15", "15"]``, not
    ``["15"]`` — which OrcaSlicer would reject/misread.
    """
    out: dict[str, tuple[str, int]] = {}
    profiles = (("machine", ENDER_5_S1_MACHINE), ("process", ENDER_5_S1_PROCESS), ("filament", ENDER_5_S1_FILAMENT))
    for bucket, path in profiles:
        for key, value in json.loads(Path(path).read_text(encoding="utf-8")).items():
            out[key] = (bucket, len(value) if isinstance(value, list) else 0)
    return out


def route_raw_overrides(raw: dict[str, str]) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Route free-form ``key=value`` overrides to profile buckets; return (overrides, warnings).

    The escape hatch behind §5 of the settings reference: a power user can set *any*
    OrcaSlicer key. We bucket by committed-profile membership (falling back to process
    for unknown keys), match the value shape (array vs scalar), and refuse a denylist of
    load-bearing keys. Unknown keys are passed through with a warning — OrcaSlicer simply
    ignores a key it doesn't recognise, so a typo is surfaced, not silently "applied".
    """
    keymap = _committed_key_buckets()
    buckets: dict[str, dict[str, Any]] = {"process": {}, "machine": {}, "filament": {}}
    warnings: list[str] = []
    for raw_key, value in raw.items():
        key = raw_key.strip()
        if not key:
            continue
        if key in _RAW_DENYLIST:
            warnings.append(f"{key}: refused — load-bearing key, not overridable")
            continue
        bucket, arity = keymap.get(key, ("process", 0))
        if key not in keymap:
            warnings.append(f"{key}: unknown key — routed to process as a scalar (OrcaSlicer may ignore it)")
        buckets[bucket][key] = [str(value)] * arity if arity else str(value)
    return {k: v for k, v in buckets.items() if v}, warnings


def merge_overrides(*override_sets: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Deep-merge per-bucket override dicts; later sets win (e.g. raw over typed)."""
    out: dict[str, dict[str, Any]] = {}
    for override in override_sets:
        for bucket, keys in override.items():
            out.setdefault(bucket, {}).update(keys)
    return out


__all__ = [
    "ENDER_5_S1_DIR",
    "ENDER_5_S1_FILAMENT",
    "ENDER_5_S1_MACHINE",
    "ENDER_5_S1_PROCESS",
    "ender5s1_profiles",
    "merge_overrides",
    "profile_with_overrides",
    "route_raw_overrides",
    "slice_overrides",
]
