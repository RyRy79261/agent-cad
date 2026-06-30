"""Ender 5 S1 slicing: bundled profiles always present; live slice when OrcaSlicer is.

The live slice is local-only (OrcaSlicer is an external binary, not in CI), so it
skips gracefully when the slicer isn't found — same pattern as the build123d tests.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from slicer import orca
from slicer.profiles import (
    ENDER_5_S1_PROCESS,
    ender5s1_profiles,
    merge_overrides,
    profile_with_overrides,
    route_raw_overrides,
    slice_overrides,
)

FIXTURE = Path(__file__).parent / "fixtures" / "cube20.stl"


def test_bundled_profiles_exist() -> None:
    profiles = ender5s1_profiles()
    assert set(profiles) == {"machine", "process", "filament"}
    for name, path in profiles.items():
        assert path.exists(), f"{name} profile missing: {path}"


def test_slice_overrides_maps_settings_to_profile_keys() -> None:
    ov = slice_overrides(infill_density=30, wall_speed=25, jerk=12, bed_temp=60, nozzle_temp=205, flow=0.95)
    assert ov["process"]["sparse_infill_density"] == "30%"
    assert ov["process"]["outer_wall_speed"] == "25" and ov["process"]["inner_wall_speed"] == "25"
    assert ov["machine"]["machine_max_jerk_x"] == ["12", "12"]
    assert ov["machine"]["machine_max_jerk_y"] == ["12", "12"]
    # Every plate temp is pinned so the headless CLI's Cool-Plate default still gets 60.
    assert ov["filament"]["cool_plate_temp"] == ["60"]
    assert ov["filament"]["textured_plate_temp_initial_layer"] == ["60"]
    assert ov["filament"]["nozzle_temperature"] == ["205"]
    assert ov["filament"]["filament_flow_ratio"] == ["0.95"]


def test_slice_overrides_empty_when_nothing_set() -> None:
    assert slice_overrides() == {}


def test_slice_overrides_phase2_knobs() -> None:
    ov = slice_overrides(layer_height=0.16, wall_loops=3, top_layers=9, support=True,
                         support_threshold=45, brim_width=4, retraction_length=1, seam_position="back")
    assert ov["process"]["layer_height"] == "0.16"
    assert ov["process"]["wall_loops"] == "3"
    assert ov["process"]["top_shell_layers"] == "9"
    assert ov["process"]["enable_support"] == "1"
    assert ov["process"]["support_threshold_angle"] == "45"
    assert ov["process"]["brim_width"] == "4" and ov["process"]["brim_type"] == "outer_only"
    assert ov["process"]["seam_position"] == "back"
    assert ov["machine"]["retraction_length"] == ["1"]


def test_slice_overrides_wall_generator_and_zhop() -> None:
    ov = slice_overrides(wall_generator="arachne", z_hop=0.4)
    assert ov["process"]["wall_generator"] == "arachne"  # process scope
    assert ov["machine"]["z_hop"] == ["0.4"]  # machine scope, per-extruder array


def test_slice_overrides_brim_zero_is_off() -> None:
    # brim_width 0 must turn the brim OFF, not leave "auto_brim" (which can still add one).
    ov = slice_overrides(brim_width=0)
    assert ov["process"]["brim_type"] == "no_brim"


def test_route_raw_overrides_buckets_by_committed_shape() -> None:
    ov, warnings = route_raw_overrides({
        "wall_loops": "4",              # process, scalar
        "filament_flow_ratio": "0.95",  # filament, 1-element array
        "machine_max_jerk_x": "15",     # machine, 2-element array (per-extruder)
    })
    assert ov["process"]["wall_loops"] == "4"
    assert ov["filament"]["filament_flow_ratio"] == ["0.95"]
    # arity replicated to match the committed 2-element array, not ["15"]
    assert ov["machine"]["machine_max_jerk_x"] == ["15", "15"]
    assert warnings == []


def test_route_raw_overrides_unknown_key_warns() -> None:
    ov, warnings = route_raw_overrides({"totally_made_up_key": "1"})
    assert ov["process"]["totally_made_up_key"] == "1"  # routed to process
    assert any("unknown key" in w for w in warnings)


def test_route_raw_overrides_refuses_denylisted_keys() -> None:
    ov, warnings = route_raw_overrides({"layer_change_gcode": "", "wall_loops": "3"})
    # the load-bearing key is refused (not in output) but the safe one passes.
    assert "layer_change_gcode" not in ov.get("machine", {})
    assert ov["process"]["wall_loops"] == "3"
    assert any("layer_change_gcode" in w and "refused" in w for w in warnings)


def test_route_raw_overrides_refuses_gcode_suffix_and_structural_keys() -> None:
    ov, warnings = route_raw_overrides({
        "machine_pause_gcode": "M0",   # *_gcode suffix -> refused
        "inherits": "evil_profile",    # structural identity key -> refused
        "compatible_printers": "x",    # long-array structural key -> refused
        "outer_wall_speed": "30",      # legit -> passes
    })
    for k in ("machine_pause_gcode", "inherits", "compatible_printers"):
        assert all(k not in b for b in ov.values())
        assert any(k in w and "refused" in w for w in warnings)
    assert ov["process"]["outer_wall_speed"] == "30"


def test_merge_overrides_raw_wins() -> None:
    typed = {"process": {"wall_loops": "2", "layer_height": "0.2"}}
    raw = {"process": {"wall_loops": "5"}}
    assert merge_overrides(typed, raw)["process"] == {"wall_loops": "5", "layer_height": "0.2"}


def test_profile_with_overrides_preserves_committed_profile(tmp_path: Path) -> None:
    dest = tmp_path / "proc.json"
    out = profile_with_overrides(slice_overrides(infill_density=42)["process"], dest, base=ENDER_5_S1_PROCESS)
    assert out == dest
    data = json.loads(dest.read_text())
    base = json.loads(ENDER_5_S1_PROCESS.read_text())
    # The override applied...
    assert data["sparse_infill_density"] == "42%"
    assert base["sparse_infill_density"] != "42%"  # base really differs
    # ...and the rest of the committed profile (incl. the ribbing tune) is intact.
    assert data["outer_wall_speed"] == base["outer_wall_speed"] == "25"
    assert data["precise_outer_wall"] == base["precise_outer_wall"]
    assert data["inherits"] == base["inherits"]


@pytest.mark.skipif(
    orca.resolve_bin() is None,
    reason="OrcaSlicer not found (set ORCA_SLICER_BIN); slicing runs locally, not in CI",
)
def test_ender5s1_slices_cube_to_marlin_gcode(tmp_path: Path) -> None:
    profiles = ender5s1_profiles()
    result = orca.slice_model(
        FIXTURE,
        machine=profiles["machine"],
        process=profiles["process"],
        filaments=[profiles["filament"]],
        output=tmp_path / "cube.gcode.3mf",
        extract=True,
    )
    assert result.ok, result.error or (result.stderr or "")[-600:]
    assert result.gcode_path, "no plain g-code extracted from the archive"

    gcode = Path(result.gcode_path).read_text()
    assert "G28" in gcode  # homing
    assert "G92 E0" in gcode  # the machine-profile patch (relative-E reset)
    assert "M104" in gcode or "M109" in gcode  # hotend temperature


@pytest.mark.skipif(
    orca.resolve_bin() is None,
    reason="OrcaSlicer not found (set ORCA_SLICER_BIN); slicing runs locally, not in CI",
)
def test_infill_override_changes_gcode(tmp_path: Path) -> None:
    """A per-slice infill override reaches OrcaSlicer and lands in the g-code."""
    profiles = ender5s1_profiles()
    process = profile_with_overrides(
        slice_overrides(infill_density=55)["process"], tmp_path / "proc.json", base=profiles["process"]
    )
    result = orca.slice_model(
        FIXTURE,
        machine=profiles["machine"],
        process=process,
        filaments=[profiles["filament"]],
        output=tmp_path / "cube55.gcode.3mf",
        extract=True,
    )
    assert result.ok, result.error or (result.stderr or "")[-600:]
    # OrcaSlicer dumps the resolved config as comments at the end of the g-code.
    assert "sparse_infill_density = 55%" in Path(result.gcode_path).read_text()


@pytest.mark.skipif(
    orca.resolve_bin() is None,
    reason="OrcaSlicer not found (set ORCA_SLICER_BIN); slicing runs locally, not in CI",
)
def test_machine_jerk_override_changes_gcode(tmp_path: Path) -> None:
    """A per-slice machine override (jerk) reaches OrcaSlicer's emitted M205."""
    profiles = ender5s1_profiles()
    machine = profile_with_overrides(
        slice_overrides(jerk=20)["machine"], tmp_path / "machine.json", base=profiles["machine"]
    )
    result = orca.slice_model(
        FIXTURE,
        machine=machine,
        process=profiles["process"],
        filaments=[profiles["filament"]],
        output=tmp_path / "cube_jerk.gcode.3mf",
        extract=True,
    )
    assert result.ok, result.error or (result.stderr or "")[-600:]
    assert "M205 X20" in Path(result.gcode_path).read_text()  # the requested jerk, live
