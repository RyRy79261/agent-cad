"""Parametric standoff / spacer — round or hex pillar with a through bore.

Known-good agent-cad template. A simple pillar to space two things apart, with a
central clearance bore (for an M3 etc.). Round by default; set ``hex`` true for a
spanner-grippable hex body.

    cad build services/cad/src/cad/templates/standoff.py
"""

from __future__ import annotations

import math
from typing import Any

from build123d import (
    Align,
    BuildPart,
    BuildSketch,
    Cylinder,
    Locations,
    Mode,
    Part,
    RegularPolygon,
    extrude,
)

DESCRIPTION = "Round or hex standoff / spacer pillar with a central through bore."

PARAMS: dict[str, dict[str, Any]] = {
    "height": {"default": 20.0, "min": 2.0, "max": 280.0, "unit": "mm", "desc": "Pillar height"},
    "outer_diameter": {"default": 10.0, "min": 4.0, "max": 80.0, "unit": "mm", "desc": "Outer diameter"},
    "bore_diameter": {"default": 3.2, "min": 0.0, "max": 60.0, "unit": "mm", "desc": "Bore diameter (0=solid)"},
    "hex": {"default": False, "unit": "bool", "desc": "Hex body instead of round"},
}

DEFAULTS: dict[str, Any] = {k: v["default"] for k, v in PARAMS.items()}


def build(params: dict[str, Any] | None = None) -> Part:
    p = {**DEFAULTS, **(params or {})}
    h, outer, bore = p["height"], p["outer_diameter"], p["bore_diameter"]

    # The bore must stay inside the body's *narrowest* width — for a hex that's the
    # across-flats distance (outer * cos30°), not the across-corners diameter — with
    # a minimum wall left, else the part is removed or split into slivers.
    min_wall = 0.8
    narrowest = outer * math.cos(math.pi / 6) if p["hex"] else outer
    bore = max(0.0, min(bore, narrowest - 2 * min_wall))

    with BuildPart() as standoff:
        if p["hex"]:
            with BuildSketch():
                RegularPolygon(radius=outer / 2, side_count=6)
            extrude(amount=h)
        else:
            Cylinder(outer / 2, h, align=(Align.CENTER, Align.CENTER, Align.MIN))

        if bore > 0:
            # Overshoot both ends so the bore is a clean through hole.
            with Locations((0, 0, -0.1)):
                Cylinder(
                    bore / 2,
                    h + 0.2,
                    align=(Align.CENTER, Align.CENTER, Align.MIN),
                    mode=Mode.SUBTRACT,
                )

    return standoff.part


result = build(DEFAULTS)
