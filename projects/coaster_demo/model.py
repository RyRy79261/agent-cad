"""Round coaster with a raised rim — a flat drink coaster that catches drips.

A solid circular base disc with a raised annular rim around the perimeter, so
condensation/spills stay in the well. Prints flat-on-bed, no supports.

    cad build projects/coaster/model.py
"""

from __future__ import annotations

from typing import Any

from build123d import (
    Align,
    Axis,
    BuildPart,
    Cylinder,
    Mode,
    Part,
    fillet,
)

DESCRIPTION = "90mm round coaster with a raised rim — flat base disc plus an annular lip to catch drips."

PARAMS: dict[str, dict[str, Any]] = {
    "diameter": {"default": 90.0, "min": 40.0, "max": 200.0, "unit": "mm", "desc": "Overall coaster diameter"},
    "base_thickness": {"default": 3.0, "min": 1.2, "max": 10.0, "unit": "mm", "desc": "Floor thickness"},
    "rim_height": {"default": 4.0, "min": 0.0, "max": 20.0, "unit": "mm", "desc": "Height of rim above the floor (0 = flat)"},
    "rim_width": {"default": 4.0, "min": 1.2, "max": 20.0, "unit": "mm", "desc": "Radial thickness of the rim wall"},
    "top_fillet": {"default": 1.0, "min": 0.0, "max": 5.0, "unit": "mm", "desc": "Rounding on the top rim edges (0 = sharp)"},
}

DEFAULTS: dict[str, Any] = {k: v["default"] for k, v in PARAMS.items()}


def build(params: dict[str, Any] | None = None) -> Part:
    p = {**DEFAULTS, **(params or {})}
    eps = 0.01

    radius = p["diameter"] / 2.0
    base_t = p["base_thickness"]
    rim_h = p["rim_height"]
    # Rim can't be wider than the available radius.
    rim_w = min(p["rim_width"], radius - eps)
    inner_radius = radius - rim_w

    with BuildPart() as coaster:
        # Solid base disc, sitting on the plate (base at z = 0).
        Cylinder(
            radius=radius,
            height=base_t,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
        )

        # Raised annular rim on top of the base: outer ring, hollow centre.
        if rim_h > 0 and inner_radius > eps:
            with BuildPart(mode=Mode.ADD) as ring:
                Cylinder(
                    radius=radius,
                    height=rim_h,
                    align=(Align.CENTER, Align.CENTER, Align.MIN),
                )
                Cylinder(
                    radius=inner_radius,
                    height=rim_h,
                    align=(Align.CENTER, Align.CENTER, Align.MIN),
                    mode=Mode.SUBTRACT,
                )
            # Lift the ring to sit on the base, then fuse it in.
            ring_solid = ring.part.translate((0, 0, base_t))
            from build123d import add

            add(ring_solid)

        # Soften the topmost edges of the rim for comfort / print quality.
        fr = min(p["top_fillet"], rim_w / 2 - eps, rim_h / 2 - eps if rim_h > 0 else rim_w / 2)
        if fr > eps:
            top_edges = coaster.edges().filter_by(Axis.Z, reverse=True).group_by(Axis.Z)[-1]
            if top_edges:
                fillet(top_edges, radius=fr)

    return coaster.part


result = build(DEFAULTS)
