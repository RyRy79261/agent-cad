"""Tests for the scan cleanup pipeline using synthetic trimesh primitives."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

import trimesh

from scanner.pipeline import clean_mesh


def _box_with_floater() -> trimesh.Trimesh:
    """A clean 40x30x20 box plus a tiny detached cube far away (noise)."""
    box = trimesh.creation.box(extents=(40.0, 30.0, 20.0))
    floater = trimesh.creation.box(extents=(2.0, 2.0, 2.0))
    floater.apply_translation([200.0, 200.0, 200.0])
    return trimesh.util.concatenate([box, floater])


def test_keep_largest_component_drops_floater(tmp_path: Path) -> None:
    raw = tmp_path / "raw.stl"
    _box_with_floater().export(raw)

    result = clean_mesh(raw, output_path=tmp_path / "clean.stl")
    assert result.ok, result.error
    assert result.after["components"] == 1
    # The kept component is the 40x30x20 box, not the 2mm floater.
    bbox = result.after["bbox_mm"]
    assert (bbox["x"], bbox["y"], bbox["z"]) == (40.0, 30.0, 20.0)
    assert "keep-largest-component" in result.operations


def test_output_is_watertight_and_recentered(tmp_path: Path) -> None:
    raw = tmp_path / "raw.stl"
    trimesh.creation.box(extents=(10.0, 10.0, 10.0)).export(raw)

    result = clean_mesh(raw, output_path=tmp_path / "clean.stl", recenter=True)
    assert result.ok, result.error
    assert result.after["watertight"] is True

    cleaned = trimesh.load(tmp_path / "clean.stl", force="mesh")
    assert np.allclose(cleaned.bounding_box.centroid, [0, 0, 0], atol=1e-6)


def test_decimation_reduces_faces(tmp_path: Path) -> None:
    raw = tmp_path / "sphere.stl"
    sphere = trimesh.creation.icosphere(subdivisions=4)  # ~20k faces
    sphere.export(raw)

    target = 2000
    result = clean_mesh(raw, output_path=tmp_path / "clean.stl", target_faces=target)
    assert result.ok, result.error
    # fast-simplification reaches roughly the target; assert a real reduction.
    assert result.after["faces"] < result.before["faces"]
    assert result.after["faces"] <= target * 1.2


def test_missing_file_returns_error(tmp_path: Path) -> None:
    result = clean_mesh(tmp_path / "nope.stl")
    assert result.ok is False
    assert result.error
