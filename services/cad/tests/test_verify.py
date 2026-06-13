"""Tests for the printability spec-verification harness."""

from __future__ import annotations

from pathlib import Path

import pytest

pytest.importorskip("build123d", reason="build123d (OCCT) not installed")

from cad.runner import build_model  # noqa: E402
from cad.verify import verify_build  # noqa: E402

EXAMPLE = (
    Path(__file__).resolve().parents[1] / "src" / "cad" / "examples" / "box_with_holes.py"
)


def _checks_by_name(result_dict: dict) -> dict[str, dict]:
    return {c["name"]: c for c in result_dict["verification"]["checks"]}


def test_good_part_is_printable(tmp_path: Path) -> None:
    result = build_model(EXAMPLE, out_dir=tmp_path, name="box", verify=True)
    assert result.ok, result.error
    assert result.verification is not None
    assert result.verification["printable"] is True
    checks = _checks_by_name(result.to_dict())
    assert checks["valid_geometry"]["passed"]
    assert checks["single_solid"]["passed"]
    assert checks["watertight_mesh"]["passed"]  # real trimesh check on the exported STL
    assert checks["fits_build_volume"]["passed"]


def test_valid_geometry_check_actually_runs(tmp_path: Path) -> None:
    # Regression: build123d exposes is_valid as a PROPERTY, so the check must run
    # for real (severity error, passing) — not silently degrade to a skipped warning.
    result = build_model(EXAMPLE, out_dir=tmp_path, name="box", verify=True)
    vc = _checks_by_name(result.to_dict())["valid_geometry"]
    assert vc["passed"] is True
    assert vc["severity"] == "error"
    assert "valid B-rep" in vc["detail"]
    assert "skipped" not in vc["detail"]


def test_oversize_part_not_printable(tmp_path: Path) -> None:
    result = build_model(
        EXAMPLE,
        params={"width": 260.0, "depth": 100.0, "height": 50.0},
        out_dir=tmp_path,
        name="box",
        verify=True,
    )
    assert result.ok, result.error
    assert result.verification["printable"] is False
    fit = _checks_by_name(result.to_dict())["fits_build_volume"]
    assert fit["passed"] is False
    assert fit["severity"] == "error"


def test_verify_off_by_default(tmp_path: Path) -> None:
    result = build_model(EXAMPLE, out_dir=tmp_path, name="box")
    assert result.ok, result.error
    assert result.verification is None


def test_verify_build_tolerates_malformed_metadata() -> None:
    # Contract: verify_build NEVER raises — malformed metadata degrades to warnings.
    class _FakeSolid:
        is_valid = True  # property-style bool, like build123d

        def solids(self) -> list[int]:
            return [1]

    bad_meta = {"bounding_box_mm": {"x": 10.0, "y": 10.0}, "volume_mm3": "not-a-number"}
    vr = verify_build(_FakeSolid(), "build123d", bad_meta, stl_path=None)  # must not raise
    assert isinstance(vr.printable, bool)
    names = {c.name for c in vr.checks}
    assert "fits_build_volume" in names and "non_degenerate" in names


def test_verify_build_never_raises_without_stl() -> None:
    # Watertight check must degrade to a passing warning, not blow up, when no STL.
    class _FakeSolid:
        def is_valid(self) -> bool:
            return True

        def solids(self) -> list[int]:
            return [1]

        volume = 1000.0

    meta = {
        "bounding_box_mm": {"x": 10.0, "y": 10.0, "z": 10.0},
        "volume_mm3": 1000.0,
        "fits_build_volume": True,
    }
    vr = verify_build(_FakeSolid(), "build123d", meta, stl_path=None)
    assert vr.printable is True
    watertight = next(c for c in vr.checks if c.name == "watertight_mesh")
    assert watertight.passed and watertight.severity == "warning"
