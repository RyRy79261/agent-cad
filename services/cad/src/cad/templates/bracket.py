"""Parametric L-bracket / angle bracket — two perpendicular flanges with bolt holes.

Known-good agent-cad template. Built from two unioned flanges (robust, no fragile
edge selection): a horizontal flange on the plate and a vertical flange rising from
one edge, each with a row of through-holes. The classic structural fixing part.

    cad build services/cad/src/cad/templates/bracket.py
"""

from __future__ import annotations

from typing import Any

from build123d import (
    Align,
    Box,
    BuildPart,
    Cylinder,
    GridLocations,
    Locations,
    Mode,
    Part,
)

DESCRIPTION = "L-shaped angle bracket: a horizontal and a vertical flange, each with a row of bolt holes."

PARAMS: dict[str, dict[str, Any]] = {
    "length": {"default": 60.0, "min": 15.0, "max": 210.0, "unit": "mm", "desc": "Horizontal flange length (X)"},
    "height": {"default": 60.0, "min": 15.0, "max": 280.0, "unit": "mm", "desc": "Vertical flange height (Z)"},
    "width": {"default": 40.0, "min": 10.0, "max": 210.0, "unit": "mm", "desc": "Bracket width (Y)"},
    "thickness": {"default": 4.0, "min": 2.0, "max": 15.0, "unit": "mm", "desc": "Flange thickness"},
    "hole_diameter": {"default": 5.0, "min": 1.0, "max": 16.0, "unit": "mm", "desc": "Bolt-hole diameter"},
    "hole_inset": {"default": 12.0, "min": 5.0, "max": 60.0, "unit": "mm", "desc": "Hole inset from edges"},
    "holes": {"default": 2, "min": 1, "max": 8, "unit": "count", "desc": "Holes across the width on each flange"},
}

DEFAULTS: dict[str, Any] = {k: v["default"] for k, v in PARAMS.items()}


def build(params: dict[str, Any] | None = None) -> Part:
    p = {**DEFAULTS, **(params or {})}
    length, height, width = p["length"], p["height"], p["width"]
    t = p["thickness"]
    inset = p["hole_inset"]
    n = int(p["holes"])
    y_span = (width - 2 * inset) if n > 1 else 0.0

    # Clamp the bore so it clears the corner root and the flange edges, and (for a
    # row) doesn't overlap its neighbours — keeps the bracket watertight/valid.
    max_dia = 2 * (inset - t - 1.0)
    max_dia = min(max_dia, width - 2.0, length - inset - 1.0, height - inset - 1.0)
    if n > 1:
        max_dia = min(max_dia, 0.9 * y_span / (n - 1))
    hole_dia = max(0.0, min(p["hole_diameter"], max_dia))

    with BuildPart() as bracket:
        # Horizontal flange: x 0..length, z 0..thickness, centred in Y.
        with Locations((length / 2, 0, t / 2)):
            Box(length, width, t)
        # Vertical flange: x 0..thickness, z 0..height — unions with the corner.
        with Locations((t / 2, 0, height / 2)):
            Box(t, width, height)

        if hole_dia > 0:
            # Holes through the horizontal flange (drilled down Z, near the far end).
            with Locations((length - inset, 0, t / 2)):
                with GridLocations(0, y_span, 1, n):
                    Cylinder(hole_dia / 2, t * 3, mode=Mode.SUBTRACT)

            # Holes through the vertical flange (drilled along X, near the top).
            with Locations((t / 2, 0, height - inset)):
                with GridLocations(0, y_span, 1, n):
                    Cylinder(
                        hole_dia / 2,
                        t * 3,
                        rotation=(0, 90, 0),  # lay the bore along X
                        align=(Align.CENTER, Align.CENTER, Align.CENTER),
                        mode=Mode.SUBTRACT,
                    )

    return bracket.part


result = build(DEFAULTS)
