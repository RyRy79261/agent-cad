"""Tests for the headless CAD runner.

These exercise the two halves of the agent loop: a clean build produces real
geometry whose dimensions match the params, and a broken model returns a
captured traceback (ok=False) rather than raising — which is what lets Claude
read the error and self-correct.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

pytest.importorskip("build123d", reason="build123d (OCCT) not installed")

from cad.runner import build_model  # noqa: E402

EXAMPLE = (
    Path(__file__).resolve().parents[1]
    / "src"
    / "cad"
    / "examples"
    / "box_with_holes.py"
)


def test_example_builds_all_formats(tmp_path: Path) -> None:
    result = build_model(EXAMPLE, out_dir=tmp_path, name="box")
    assert result.ok, result.error
    assert result.engine == "build123d"
    for fmt in ("stl", "step", "3mf", "svg"):
        artifact = Path(result.artifacts[fmt])
        assert artifact.exists() and artifact.stat().st_size > 0


def test_params_drive_dimensions(tmp_path: Path) -> None:
    result = build_model(
        EXAMPLE,
        params={"width": 120.0, "depth": 50.0, "height": 30.0},
        out_dir=tmp_path,
        name="box",
    )
    assert result.ok, result.error
    bbox = result.metadata["bounding_box_mm"]
    assert bbox == {"x": 120.0, "y": 50.0, "z": 30.0}


def test_metadata_reports_build_volume_fit(tmp_path: Path) -> None:
    # box_with_holes defaults (80 × 60 × 40) comfortably fit the Ender 5 S1.
    result = build_model(EXAMPLE, out_dir=tmp_path, name="box")
    assert result.ok, result.error
    meta = result.metadata
    assert meta["printer"] == "Creality Ender 5 S1"
    assert meta["build_volume_mm"] == {"x": 220.0, "y": 220.0, "z": 280.0}
    assert meta["fits_build_volume"] is True
    assert meta["build_volume_overflow_mm"] == {"x": 0.0, "y": 0.0, "z": 0.0}
    assert meta["requires_rotation"] is False


def test_oversize_part_flagged_unfit(tmp_path: Path) -> None:
    # 240 mm wide overruns the 210 mm usable bed by 30 mm.
    result = build_model(
        EXAMPLE,
        params={"width": 240.0, "depth": 100.0, "height": 50.0},
        out_dir=tmp_path,
        name="box",
    )
    assert result.ok, result.error
    assert result.metadata["fits_build_volume"] is False
    assert result.metadata["build_volume_overflow_mm"]["x"] == 30.0


def test_broken_model_returns_traceback(tmp_path: Path) -> None:
    model = tmp_path / "broken.py"
    model.write_text(
        textwrap.dedent(
            """
            from build123d import BuildPart, Box

            def build(params):
                with BuildPart() as p:
                    Box(10, 10, 10)
                return undefined_variable  # NameError on purpose
            """
        )
    )
    result = build_model(model, out_dir=tmp_path / "out")
    assert result.ok is False
    assert result.error is not None
    assert "NameError" in result.error


def test_missing_entrypoint_is_reported(tmp_path: Path) -> None:
    model = tmp_path / "no_entry.py"
    model.write_text("x = 1\n")
    result = build_model(model, out_dir=tmp_path / "out")
    assert result.ok is False
    assert "build(params)" in (result.error or "")
