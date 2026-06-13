"""Fridge drawer tray — example van part (build123d, B-rep).

Self-contained parametric model: the source of truth is this plain-text file plus
``params.json`` (both diff beautifully in Git). The runner calls ``build(params)``.

    cad build projects/fridge_drawer/model.py --params projects/fridge_drawer/params.json
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

DEFAULTS: dict[str, Any] = {
    # Sized to the Ender 5 S1 usable bed (220 mm − 2×5 mm margin = 210 mm). A
    # wider slot needs the drawer split into joinable halves — one piece can't
    # exceed the build volume. See docs/printer-ender5s1.md.
    "width": 210.0,      # along the fridge slot (≤ usable bed width)
    "depth": 180.0,      # into the cabinet
    "height": 70.0,
    "wall": 2.4,         # 6 perimeters @ 0.4mm nozzle
    "floor": 3.0,
    "corner_radius": 6.0,
    "bolt_diameter": 4.5,  # M4 clearance
    "bolt_inset": 12.0,
}


def build(params: dict[str, Any] | None = None) -> Part:
    p = {**DEFAULTS, **(params or {})}
    w, d, h = p["width"], p["depth"], p["height"]
    wall, floor = p["wall"], p["floor"]

    with BuildPart() as drawer:
        # Solid outer block sitting on the plate.
        Box(w, d, h, align=(Align.CENTER, Align.CENTER, Align.MIN))

        # Round the four vertical corners (selected before hollowing).
        if p["corner_radius"] > 0:
            verticals = drawer.edges().filter_by(Axis.Z)
            fillet(verticals, radius=p["corner_radius"])

        # Hollow from the top, leaving `wall` sides and a `floor`-thick base.
        with Locations((0, 0, floor)):
            Box(
                w - 2 * wall,
                d - 2 * wall,
                h,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
                mode=Mode.SUBTRACT,
            )

        # Floor mounting holes (front + back pairs) for fixing into the cabinet.
        with GridLocations(w - 2 * p["bolt_inset"], d - 2 * p["bolt_inset"], 2, 2):
            Cylinder(
                radius=p["bolt_diameter"] / 2,
                height=floor * 3,
                align=(Align.CENTER, Align.CENTER, Align.CENTER),
                mode=Mode.SUBTRACT,
            )

    return drawer.part


result = build(DEFAULTS)
