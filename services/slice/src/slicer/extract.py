"""Extract plain Marlin G-code (and print stats) from an OrcaSlicer ``.gcode.3mf``.

THE critical gotcha from the spec: OrcaSlicer's CLI has no ``--export-gcode``.
``--export-3mf`` writes a ZIP archive (``something.gcode.3mf``) whose real
Marlin G-code lives at ``Metadata/plate_1.gcode``. The Ender 5 S1 needs the
*plain* ``.gcode`` on its SD card, so we must unzip it out first.

``Metadata/slice_info.config`` (XML) carries the print-time / filament-usage /
layer estimates we surface in the control panel.
"""

from __future__ import annotations

import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

# G-code for plate N lives here inside the archive.
_PLATE_GCODE_RE = re.compile(r"^Metadata/plate_(\d+)\.gcode$")
_SLICE_INFO = "Metadata/slice_info.config"


@dataclass
class PlateInfo:
    """Per-plate estimates parsed from ``slice_info.config``."""

    index: int
    metadata: dict[str, str] = field(default_factory=dict)
    filaments: list[dict[str, str]] = field(default_factory=list)

    @property
    def print_time_s(self) -> float | None:
        raw = self.metadata.get("prediction") or self.metadata.get("printTime")
        return float(raw) if raw else None

    @property
    def weight_g(self) -> float | None:
        raw = self.metadata.get("weight")
        return float(raw) if raw else None


def list_plate_gcode(archive: str | Path) -> dict[int, str]:
    """Map plate index -> archive member name for every ``plate_N.gcode``."""
    with zipfile.ZipFile(archive) as zf:
        found: dict[int, str] = {}
        for name in zf.namelist():
            m = _PLATE_GCODE_RE.match(name)
            if m:
                found[int(m.group(1))] = name
    return found


def extract_gcode(
    archive: str | Path,
    out_path: str | Path | None = None,
    plate: int = 1,
) -> Path:
    """Extract ``Metadata/plate_<plate>.gcode`` to a plain ``.gcode`` file.

    Returns the path to the written plain G-code. Defaults to writing next to the
    archive with the doubled ``.gcode.3mf`` suffix reduced to ``.gcode``.
    """
    archive = Path(archive)
    plates = list_plate_gcode(archive)
    if plate not in plates:
        raise FileNotFoundError(
            f"plate {plate} not found in {archive.name}; "
            f"available plates: {sorted(plates) or 'none'}"
        )

    if out_path is None:
        # foo.gcode.3mf -> foo.gcode  ;  foo.3mf -> foo.gcode
        stem = archive.name
        for suffix in (".gcode.3mf", ".3mf"):
            if stem.endswith(suffix):
                stem = stem[: -len(suffix)]
                break
        out_path = archive.with_name(f"{stem}.gcode")
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(archive) as zf, zf.open(plates[plate]) as src:
        out_path.write_bytes(src.read())
    return out_path


def read_slice_info(archive: str | Path) -> list[PlateInfo]:
    """Parse ``slice_info.config`` into per-plate metadata + filament usage.

    Best-effort and version-tolerant: OrcaSlicer/Bambu vary the exact keys, so we
    collect whatever ``metadata``/``filament`` elements are present. Returns an
    empty list if the archive has no slice info.
    """
    archive = Path(archive)
    with zipfile.ZipFile(archive) as zf:
        if _SLICE_INFO not in zf.namelist():
            return []
        raw = zf.read(_SLICE_INFO)

    try:
        root = ElementTree.fromstring(raw)
    except ElementTree.ParseError:
        return []

    plates: list[PlateInfo] = []
    for plate_el in root.iter("plate"):
        meta: dict[str, str] = {}
        filaments: list[dict[str, str]] = []
        for child in plate_el:
            if child.tag == "metadata":
                key = child.get("key")
                if key is not None:
                    meta[key] = child.get("value", "")
            elif child.tag == "filament":
                filaments.append(dict(child.attrib))
        index = int(meta.get("index", len(plates) + 1))
        plates.append(PlateInfo(index=index, metadata=meta, filaments=filaments))
    return plates


def summarize(archive: str | Path) -> dict[str, Any]:
    """Compact, UI-friendly summary of an archive's plates."""
    plates = read_slice_info(archive)
    return {
        "archive": str(archive),
        "plates": [
            {
                "index": pl.index,
                "print_time_s": pl.print_time_s,
                "weight_g": pl.weight_g,
                "filaments": pl.filaments,
                "metadata": pl.metadata,
            }
            for pl in plates
        ],
    }
