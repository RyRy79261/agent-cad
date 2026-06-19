"""OrcaSlicer filament-preset reader — enumerate compatible presets from the local install."""

from __future__ import annotations

import pytest
from slicer.orca import resolve_bin
from slicer.orca_presets import list_filament_presets, machine_name_for, resolve_filament_preset

_HAS_ORCA = resolve_bin() is not None


def test_machine_name_mapping():
    assert machine_name_for("ender5s1") == "Creality Ender-5 S1 0.4 nozzle"
    assert machine_name_for("nonexistent") is None


def test_unknown_machine_returns_empty():
    # No OrcaSlicer match (and no extraction needed) → empty, never raises.
    assert list_filament_presets("No Such Machine 9.9 nozzle") == []


@pytest.mark.skipif(not _HAS_ORCA, reason="OrcaSlicer not installed")
def test_ender5s1_presets_enumerated_from_local_install():
    machine = machine_name_for("ender5s1")
    presets = list_filament_presets(machine)
    names = {p["name"] for p in presets}
    # The Creality Generic family is what ships compatible with the Ender 5 S1.
    assert {"Creality Generic PLA", "Creality Generic PETG"} <= names
    pla = next(p for p in presets if p["name"] == "Creality Generic PLA")
    assert pla["material"] == "PLA" and pla["vendor"] == "Creality"


@pytest.mark.skipif(not _HAS_ORCA, reason="OrcaSlicer not installed")
def test_resolve_flattens_inherits_chain():
    # OrcaSlicer won't resolve a loose preset's inherits — so we must. PETG inherits 255°C.
    machine = machine_name_for("ender5s1")
    flat = resolve_filament_preset("Creality Generic PETG", machine)
    assert flat is not None
    assert flat["nozzle_temperature"] == ["255"]  # pulled from the fdm_filament_pet base
    assert flat.get("filament_type") == ["PETG"]
    assert "inherits" not in flat  # self-contained: the CLI won't try to re-resolve
    assert flat.get("from") == "system"  # kept — OrcaSlicer rejects a sourceless filament
    # an unknown preset name → None
    assert resolve_filament_preset("No Such Preset", machine) is None
