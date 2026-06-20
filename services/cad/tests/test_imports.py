"""Importing external CAD geometry as editable build123d parts (STEP/BREP)."""

from __future__ import annotations

from pathlib import Path

from build123d import Box, BuildPart, Cylinder, Mode, export_step
from cad.imports import cad_bbox, classify, scaffold_source, unsupported_reason
from cad.runner import build_model


def test_classify_by_extension():
    assert classify("part.step") == "editable"
    assert classify("part.STP") == "editable"
    assert classify("part.brep") == "editable"
    assert classify("part.stl") == "mesh"
    assert classify("design.f3d") == "unsupported"
    assert classify("part.iges") == "unsupported"


def test_unsupported_reason_points_to_step():
    assert "STEP" in unsupported_reason("design.f3d")
    assert "STEP" in unsupported_reason("model.iges")


def test_step_roundtrip_is_editable(tmp_path: Path):
    """A STEP imports as REAL geometry that we can re-export and edit (not a mesh)."""
    with BuildPart() as ref:
        Box(40, 30, 10)
        Cylinder(radius=5, height=20, mode=Mode.SUBTRACT)
    step = tmp_path / "reference.step"
    export_step(ref.part, str(step))

    extents, volume = cad_bbox(step)
    assert [round(e) for e in extents] == [40, 30, 10]
    assert volume > 0  # a real solid, not an empty mesh shell

    # the scaffolded wrapper builds through the real runner → a printable model.stl
    (tmp_path / "model.py").write_text(scaffold_source("reference.step"))
    result = build_model(tmp_path / "model.py", {}, out_dir=tmp_path, name="model", formats=("stl", "step"))
    assert result.ok, result.error
    assert (tmp_path / "model.stl").exists()
    assert "import_step" in (tmp_path / "model.py").read_text()  # the edit seam the chat refines
