"""Reference part: a parametric box with a hollow interior and corner bolt holes.

This is the canonical "Stage 1" benchmark from the spec — a box-with-holes that
Claude can regenerate from changed params. It demonstrates the `build(params)`
convention the runner expects.

Run it with the CLI::

    cad build services/cad/src/cad/examples/box_with_holes.py
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
    chamfer,
)

# Defaults; overridden by params.json when run through the pipeline.
DEFAULTS: dict[str, Any] = {
    "width": 80.0,
    "depth": 60.0,
    "height": 40.0,
    "wall": 3.0,
    "bolt_diameter": 4.2,
    "bolt_inset": 8.0,
    "chamfer": 1.5,
}


def build(params: dict[str, Any] | None = None) -> Part:
    p = {**DEFAULTS, **(params or {})}
    w, d, h = p["width"], p["depth"], p["height"]
    wall = p["wall"]
    grid_x = w - 2 * p["bolt_inset"]
    grid_y = d - 2 * p["bolt_inset"]

    with BuildPart() as part:
        # Outer shell sitting on the build plate (base at z = 0).
        Box(w, d, h, align=(Align.CENTER, Align.CENTER, Align.MIN))

        # Soften the top rim *while it is still a solid* — at this point there
        # are exactly four clean outer top edges, so the chamfer is robust.
        if p["chamfer"] > 0:
            top_edges = part.edges().group_by(Axis.Z)[-1]
            chamfer(top_edges, length=p["chamfer"])

        # Hollow it out from above, leaving `wall`-thick sides + floor and an
        # open top. The cavity floor sits at z = wall; the overshoot above the
        # rim is harmless for a subtraction and guarantees an open top.
        with Locations((0, 0, wall)):
            Box(
                w - 2 * wall,
                d - 2 * wall,
                h,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
                mode=Mode.SUBTRACT,
            )

        # Corner bolt holes pierced through the floor.
        with GridLocations(grid_x, grid_y, 2, 2):
            Cylinder(
                radius=p["bolt_diameter"] / 2,
                height=wall * 3,
                align=(Align.CENTER, Align.CENTER, Align.CENTER),
                mode=Mode.SUBTRACT,
            )

    return part.part


# Module-level `result` is also supported by the runner.
result = build(DEFAULTS)
