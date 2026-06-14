"""Calibration cube — a solid cube, the canonical first 3D print.

Print it, then measure each edge with calipers: a well-tuned printer gives ~`size`
mm on every axis. It validates dimensional accuracy, first-layer adhesion and
general quality *before* you trust the printer with a real part — so it's the
right thing to print first.

    cad build services/cad/src/cad/templates/cube.py
"""

from __future__ import annotations

from typing import Any

from build123d import Align, Box, BuildPart, Part

DESCRIPTION = "Solid calibration cube — the canonical first print; measure it to check dimensional accuracy."

PARAMS: dict[str, dict[str, Any]] = {
    "size": {"default": 20.0, "min": 5.0, "max": 200.0, "unit": "mm", "desc": "Cube edge length"},
}

DEFAULTS: dict[str, Any] = {k: v["default"] for k, v in PARAMS.items()}


def build(params: dict[str, Any] | None = None) -> Part:
    p = {**DEFAULTS, **(params or {})}
    s = p["size"]
    with BuildPart() as cube:
        Box(s, s, s, align=(Align.CENTER, Align.CENTER, Align.MIN))
    return cube.part


result = build(DEFAULTS)
