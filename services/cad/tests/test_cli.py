"""Tests for the ``cad`` CLI: templates, scaffolding, and build --verify/--strict."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

pytest.importorskip("build123d", reason="build123d (OCCT) not installed")

from cad.cli import main  # noqa: E402


def test_templates_list(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["templates"]) == 0
    out = capsys.readouterr().out
    for name in ("box", "plate", "bracket", "standoff"):
        assert name in out


def test_templates_show_params(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["templates", "box"]) == 0
    assert "width" in capsys.readouterr().out


def test_templates_source(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["templates", "box", "--source"]) == 0
    assert "def build" in capsys.readouterr().out


def test_new_scaffolds_a_project(tmp_path: Path) -> None:
    dest = tmp_path / "mybox"
    assert main(["new", "box", str(dest)]) == 0
    assert (dest / "model.py").exists()
    assert (dest / "print.json").exists()
    assert "width" in json.loads((dest / "params.json").read_text())


def test_new_refuses_overwrite_then_force_preserves_params(tmp_path: Path) -> None:
    dest = tmp_path / "mybox"
    assert main(["new", "box", str(dest)]) == 0
    (dest / "params.json").write_text('{"width": 123.0}\n')

    assert main(["new", "box", str(dest)]) == 1  # refuse without --force
    assert main(["new", "box", str(dest), "--force"]) == 0  # --force allowed
    # --force refreshes model.py only; an edited params.json must be preserved.
    assert json.loads((dest / "params.json").read_text())["width"] == 123.0


def test_new_unknown_template_is_error(tmp_path: Path) -> None:
    assert main(["new", "nope", str(tmp_path / "x")]) == 2


def test_build_verify_json_reports_printable(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    dest = tmp_path / "b"
    main(["new", "box", str(dest)])
    capsys.readouterr()  # discard the scaffold output so only the JSON remains
    code = main([
        "build", str(dest / "model.py"),
        "--params", str(dest / "params.json"),
        "--out", str(dest / "art"), "--verify", "--json",
    ])
    assert code == 0
    data = json.loads(capsys.readouterr().out)
    assert data["verification"]["printable"] is True


def test_build_strict_fails_on_oversize(tmp_path: Path) -> None:
    dest = tmp_path / "big"
    main(["new", "box", str(dest)])
    (dest / "params.json").write_text(json.dumps({"width": 260, "depth": 100, "height": 50}))
    # --json keeps output ascii-safe (locale-independent); --strict still gates exit.
    code = main([
        "build", str(dest / "model.py"),
        "--params", str(dest / "params.json"),
        "--out", str(dest / "art"), "--verify", "--strict", "--json",
    ])
    assert code == 1  # built, but not printable -> non-zero under --strict
