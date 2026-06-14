"""Tests for the known-good template library.

The whole point of the template library is that every entry reliably builds AND
passes the printability checks — otherwise it isn't "known-good". So we build every
template with its defaults and assert it verifies clean.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from cad.templates import get_template, list_templates

pytest.importorskip("build123d", reason="build123d (OCCT) not installed")

from cad.runner import build_model  # noqa: E402

TEMPLATE_NAMES = [t.name for t in list_templates()]


def test_registry_lists_templates() -> None:
    assert set(TEMPLATE_NAMES) == {"cube", "box", "plate", "bracket", "standoff"}
    for t in list_templates():
        assert t.description
        assert t.path.exists()


@pytest.mark.parametrize("name", TEMPLATE_NAMES)
def test_every_template_builds_and_verifies(name: str, tmp_path: Path) -> None:
    template = get_template(name)
    result = build_model(template.path, out_dir=tmp_path / name, name=name, verify=True)
    assert result.ok, f"{name} failed to build: {result.error}"
    assert result.verification is not None
    assert result.verification["printable"] is True, (
        f"{name} built but is not printable: {result.verification['summary']}"
    )
    # Every template ships a param schema with defaults.
    assert template.defaults
    assert template.param_schema


# Edge-of-range param combos the adversarial review found previously broke a
# template or produced degenerate/non-watertight geometry. After clamping, every
# one must build AND verify printable.
EDGE_CASES = [
    ("box", {"corner_radius": 30}),  # = depth/2, used to fail the fillet
    ("box", {"width": 10, "depth": 10, "corner_radius": 5}),
    ("box", {"wall": 10, "width": 20}),  # degenerate cavity -> stays solid
    ("plate", {"thickness": 1, "chamfer": 3}),  # chamfer >= thickness
    ("plate", {"corner_radius": 40}),  # > depth/2
    ("plate", {"holes_x": 10, "holes_y": 10, "hole_diameter": 20}),  # overlap
    ("plate", {"width": 10, "depth": 10, "hole_diameter": 20, "hole_margin": 4}),
    ("bracket", {"hole_diameter": 16}),  # used to be non-watertight at default geom
    ("bracket", {"thickness": 2, "hole_diameter": 16, "holes": 1}),
    ("standoff", {"hex": True, "bore_diameter": 8.67}),  # > across-flats -> slivers
    ("standoff", {"bore_diameter": 10, "outer_diameter": 10}),  # bore >= outer
    ("standoff", {"hex": True, "bore_diameter": 60}),
]


@pytest.mark.parametrize("name,params", EDGE_CASES)
def test_template_edge_params_build_and_verify(name: str, params: dict, tmp_path: Path) -> None:
    template = get_template(name)
    result = build_model(template.path, params=params, out_dir=tmp_path, name=name, verify=True)
    assert result.ok, f"{name} {params} failed to build: {result.error}"
    assert result.verification["printable"] is True, (
        f"{name} {params} not printable: {result.verification['summary']}"
    )


def test_hex_standoff_variant_builds(tmp_path: Path) -> None:
    template = get_template("standoff")
    result = build_model(
        template.path, params={"hex": True}, out_dir=tmp_path, name="hex", verify=True
    )
    assert result.ok, result.error
    assert result.verification["printable"] is True


def test_unknown_template_raises() -> None:
    with pytest.raises(KeyError):
        get_template("does-not-exist")
