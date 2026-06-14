"""Bundled, committed slicer profiles for the target printer(s).

Keeping the profiles in-repo makes slicing deterministic and self-hosted — the
pipeline doesn't depend on a user exporting profiles from their local slicer.
See ``profiles/ender5s1/README.md`` for provenance + the one OrcaSlicer patch.
"""

from __future__ import annotations

from pathlib import Path

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


__all__ = [
    "ENDER_5_S1_DIR",
    "ENDER_5_S1_FILAMENT",
    "ENDER_5_S1_MACHINE",
    "ENDER_5_S1_PROCESS",
    "ender5s1_profiles",
]
