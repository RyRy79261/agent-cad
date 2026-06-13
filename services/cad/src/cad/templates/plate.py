"""Parametric mounting plate — flat plate with a grid of bolt holes.

Known-good agent-cad template. A flat rectangular plate with rounded corners, a
top-edge chamfer and a configurable grid of through-holes — the workhorse for
mounting things to a wall, panel or frame.

    cad build services/cad/src/cad/templates/plate.py
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
    Mode,
    Part,
    chamfer,
    fillet,
)

DESCRIPTION = "Flat mounting plate with rounded corners, top chamfer and a configurable grid of bolt holes."

PARAMS: dict[str, dict[str, Any]] = {
    "width": {"default": 100.0, "min": 10.0, "max": 210.0, "unit": "mm", "desc": "Plate X size"},
    "depth": {"default": 60.0, "min": 10.0, "max": 210.0, "unit": "mm", "desc": "Plate Y size"},
    "thickness": {"default": 4.0, "min": 1.0, "max": 30.0, "unit": "mm", "desc": "Plate thickness"},
    "corner_radius": {"default": 4.0, "min": 0.0, "max": 40.0, "unit": "mm", "desc": "Corner fillet (0 = sharp)"},
    "chamfer": {"default": 0.6, "min": 0.0, "max": 3.0, "unit": "mm", "desc": "Top-edge chamfer (0 = none)"},
    "hole_diameter": {"default": 5.0, "min": 1.0, "max": 20.0, "unit": "mm", "desc": "Through-hole diameter"},
    "holes_x": {"default": 2, "min": 1, "max": 10, "unit": "count", "desc": "Holes across X"},
    "holes_y": {"default": 2, "min": 1, "max": 10, "unit": "count", "desc": "Holes across Y"},
    "hole_margin": {"default": 10.0, "min": 4.0, "max": 80.0, "unit": "mm", "desc": "Hole inset from edges"},
}

DEFAULTS: dict[str, Any] = {k: v["default"] for k, v in PARAMS.items()}


def build(params: dict[str, Any] | None = None) -> Part:
    p = {**DEFAULTS, **(params or {})}
    w, d, t = p["width"], p["depth"], p["thickness"]
    nx, ny = int(p["holes_x"]), int(p["holes_y"])
    margin = p["hole_margin"]

    # Clamp geometry-dependent params so any param combo still builds cleanly.
    eps = 0.01
    corner_radius = min(p["corner_radius"], min(w, d) / 2 - eps)
    chamfer_len = min(p["chamfer"], t - eps, min(w, d) / 2 - eps)
    span_x = (w - 2 * margin) if nx > 1 else 0.0
    span_y = (d - 2 * margin) if ny > 1 else 0.0
    # Keep holes inside the plate (clear of the edge) and non-overlapping.
    max_dia = 2 * (margin - 0.5)
    if nx > 1:
        max_dia = min(max_dia, 0.9 * span_x / (nx - 1))
    if ny > 1:
        max_dia = min(max_dia, 0.9 * span_y / (ny - 1))
    hole_dia = max(0.0, min(p["hole_diameter"], max_dia))

    with BuildPart() as plate:
        Box(w, d, t, align=(Align.CENTER, Align.CENTER, Align.MIN))

        if corner_radius > 0:
            fillet(plate.edges().filter_by(Axis.Z), radius=corner_radius)

        if chamfer_len > 0:
            chamfer(plate.edges().group_by(Axis.Z)[-1], length=chamfer_len)

        # Grid of through-holes. GridLocations spacing is ignored when count == 1.
        if hole_dia > 0:
            with GridLocations(span_x, span_y, nx, ny):
                Cylinder(
                    radius=hole_dia / 2,
                    height=t * 3,
                    align=(Align.CENTER, Align.CENTER, Align.CENTER),
                    mode=Mode.SUBTRACT,
                )

    return plate.part


result = build(DEFAULTS)
