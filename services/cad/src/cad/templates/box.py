"""Parametric box / enclosure — walls, floor, optional rounded corners and bolt holes.

Known-good agent-cad template. A hollow open-top box sitting on the build plate;
the canonical starting point for trays, enclosures and organisers. Copy this into
``projects/<name>/model.py`` and adjust params (or scaffold with ``cad new box``).

    cad build services/cad/src/cad/templates/box.py
"""

from __future__ import annotations

from typing import Any

from build123d import (
    Align,
    Axis,
    Box,
    BuildPart,
    Cylinder,
    GridLocations,
    Locations,
    Mode,
    Part,
    fillet,
)

DESCRIPTION = "Hollow open-top box / enclosure with walls, floor, optional rounded corners and floor bolt holes."

# Param schema (drives the future Creation Wizard; also documents valid ranges).
PARAMS: dict[str, dict[str, Any]] = {
    "width": {"default": 80.0, "min": 10.0, "max": 210.0, "unit": "mm", "desc": "Outer X size"},
    "depth": {"default": 60.0, "min": 10.0, "max": 210.0, "unit": "mm", "desc": "Outer Y size"},
    "height": {"default": 40.0, "min": 5.0, "max": 280.0, "unit": "mm", "desc": "Outer Z size"},
    "wall": {"default": 2.4, "min": 0.8, "max": 10.0, "unit": "mm", "desc": "Side wall thickness"},
    "floor": {"default": 2.0, "min": 0.8, "max": 10.0, "unit": "mm", "desc": "Floor thickness"},
    "corner_radius": {"default": 3.0, "min": 0.0, "max": 30.0, "unit": "mm", "desc": "Corner fillet (0=sharp)"},
    "bolt_diameter": {"default": 0.0, "min": 0.0, "max": 12.0, "unit": "mm", "desc": "Floor bolt holes (0=none)"},
    "bolt_inset": {"default": 10.0, "min": 4.0, "max": 60.0, "unit": "mm", "desc": "Bolt-hole inset from edges"},
}

DEFAULTS: dict[str, Any] = {k: v["default"] for k, v in PARAMS.items()}


def build(params: dict[str, Any] | None = None) -> Part:
    p = {**DEFAULTS, **(params or {})}
    w, d, h = p["width"], p["depth"], p["height"]
    wall, floor = p["wall"], p["floor"]

    # Clamp geometry-dependent params to what the dimensions can actually support,
    # so the template stays buildable across (and beyond) its declared ranges.
    eps = 0.01
    corner_radius = min(p["corner_radius"], min(w, d) / 2 - eps)
    inner_w, inner_d = w - 2 * wall, d - 2 * wall

    with BuildPart() as box:
        # Solid outer block on the plate (base at z = 0).
        Box(w, d, h, align=(Align.CENTER, Align.CENTER, Align.MIN))

        # Round the four vertical corners *before* hollowing (clean edges).
        if corner_radius > 0:
            fillet(box.edges().filter_by(Axis.Z), radius=corner_radius)

        # Hollow from the top, leaving `wall` sides and a `floor`-thick base.
        # Skip if the walls are so thick there's no interior left (stays solid).
        if inner_w > eps and inner_d > eps and floor < h:
            with Locations((0, 0, floor)):
                Box(
                    inner_w,
                    inner_d,
                    h,
                    align=(Align.CENTER, Align.CENTER, Align.MIN),
                    mode=Mode.SUBTRACT,
                )

        # Optional floor mounting holes.
        if p["bolt_diameter"] > 0:
            with GridLocations(w - 2 * p["bolt_inset"], d - 2 * p["bolt_inset"], 2, 2):
                Cylinder(
                    radius=p["bolt_diameter"] / 2,
                    height=floor * 3,
                    align=(Align.CENTER, Align.CENTER, Align.CENTER),
                    mode=Mode.SUBTRACT,
                )

    return box.part


result = build(DEFAULTS)
