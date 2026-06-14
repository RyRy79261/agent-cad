"""Calibration cube — the canonical XYZ test cube (20 mm).

A faithful re-creation of the standard XYZ calibration cube: a solid cube with
**X / Y / Z engraved on three faces**, so you can both confirm orientation and
measure each axis with calipers. It's the right thing to print first — a good
printer gives ~`size` mm on every axis.

    cad build services/cad/src/cad/templates/cube.py
"""

from __future__ import annotations

from typing import Any

from build123d import (
    Align,
    Box,
    BuildPart,
    BuildSketch,
    Mode,
    Part,
    Plane,
    Text,
    extrude,
)

DESCRIPTION = "XYZ calibration cube (20mm) — canonical first print; X/Y/Z faces, caliper-measurable."

PARAMS: dict[str, dict[str, Any]] = {
    "size": {"default": 20.0, "min": 10.0, "max": 200.0, "unit": "mm", "desc": "Cube edge length"},
    "engrave_depth": {"default": 0.6, "min": 0.0, "max": 2.0, "unit": "mm", "desc": "Letter depth (0 = plain)"},
}

DEFAULTS: dict[str, Any] = {k: v["default"] for k, v in PARAMS.items()}


def build(params: dict[str, Any] | None = None) -> Part:
    p = {**DEFAULTS, **(params or {})}
    s = p["size"]
    depth = min(p["engrave_depth"], s / 4)
    font = s * 0.55
    half = s / 2  # cube is centred in X/Y, sits on z=0 -> faces at ±half, top at s

    with BuildPart() as cube:
        Box(s, s, s, align=(Align.CENTER, Align.CENTER, Align.MIN))

        if depth > 0:
            # Each letter: a sketch placed at a face centre, engraved inward.
            # z_dir is the outward normal; x_dir is the letter's rightward axis
            # (chosen so the letter reads upright + un-mirrored from outside).
            faces = [
                ("Z", Plane(origin=(0, 0, s), x_dir=(1, 0, 0), z_dir=(0, 0, 1))),
                ("X", Plane(origin=(half, 0, half), x_dir=(0, 1, 0), z_dir=(1, 0, 0))),
                ("Y", Plane(origin=(0, half, half), x_dir=(-1, 0, 0), z_dir=(0, 1, 0))),
            ]
            for letter, plane in faces:
                with BuildSketch(plane):
                    Text(letter, font_size=font)
                extrude(amount=-depth, mode=Mode.SUBTRACT)

    return cube.part


result = build(DEFAULTS)
