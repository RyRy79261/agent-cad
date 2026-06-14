"""Ender 5 S1 slicing: bundled profiles always present; live slice when OrcaSlicer is.

The live slice is local-only (OrcaSlicer is an external binary, not in CI), so it
skips gracefully when the slicer isn't found — same pattern as the build123d tests.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from slicer import orca
from slicer.profiles import ender5s1_profiles

FIXTURE = Path(__file__).parent / "fixtures" / "cube20.stl"


def test_bundled_profiles_exist() -> None:
    profiles = ender5s1_profiles()
    assert set(profiles) == {"machine", "process", "filament"}
    for name, path in profiles.items():
        assert path.exists(), f"{name} profile missing: {path}"


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
