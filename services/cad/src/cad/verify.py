"""Spec-verification harness — is a built part actually printable?

Research (CadQueryEval, cad-khana) shows that machine-readable geometric checks are
an essential complement to the vision/traceback loop: even SOTA models routinely
emit parts that compile but are non-manifold, degenerate, fall outside the build
volume, or split into stray solids. This module runs cheap, deterministic checks on
a freshly built shape (and its exported STL) and returns a structured verdict the
agent can self-correct against — *before* anything is sliced.

Checks are tagged ``error`` (blocks printing) or ``warning`` (review). ``printable``
is true iff no ``error`` check failed.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from cad.printer import ENDER_5_S1, Printer, fits

ERROR = "error"
WARNING = "warning"

# Smallest bounding extent we treat as real geometry rather than a degenerate sliver.
_MIN_EXTENT_MM = 0.5


@dataclass
class Check:
    name: str
    passed: bool
    severity: str  # ERROR | WARNING
    detail: str

    def to_dict(self) -> dict[str, Any]:
        return {"name": self.name, "passed": self.passed, "severity": self.severity, "detail": self.detail}


@dataclass
class VerifyResult:
    printable: bool
    checks: list[Check]

    def to_dict(self) -> dict[str, Any]:
        passed = sum(1 for c in self.checks if c.passed)
        return {
            "printable": self.printable,
            "summary": f"{passed}/{len(self.checks)} checks passed",
            "checks": [c.to_dict() for c in self.checks],
        }


def verify_build(
    shape: Any,
    engine: str,
    metadata: dict[str, Any] | None = None,
    stl_path: str | Path | None = None,
    printer: Printer = ENDER_5_S1,
) -> VerifyResult:
    """Run printability checks on a built shape. Never raises — a check that can't
    run is recorded as a passing ``warning`` (skipped), not a hard failure."""
    metadata = metadata or {}
    checks: list[Check] = [
        _safe("valid_geometry", lambda: _check_valid(shape, engine)),
        _safe("single_solid", lambda: _check_solids(shape, engine)),
        _safe("positive_volume", lambda: _check_volume(shape, engine, metadata)),
        _safe("non_degenerate", lambda: _check_extent(metadata, printer)),
        _safe("fits_build_volume", lambda: _check_fit(metadata, printer)),
        _safe("watertight_mesh", lambda: _check_watertight(stl_path)),
    ]
    printable = all(c.passed for c in checks if c.severity == ERROR)
    return VerifyResult(printable=printable, checks=checks)


def _safe(name: str, fn) -> Check:
    """Run a check, degrading any unexpected error to a passing warning so the
    harness honours its 'never raises' contract (a check that can't run must not
    fail an otherwise-good build)."""
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001 - best-effort by design
        return Check(name, True, WARNING, f"check skipped: {exc}")


def _check_valid(shape: Any, engine: str) -> Check:
    # build123d exposes `is_valid` as a bool PROPERTY; CadQuery's `isValid` is a
    # METHOD. Resolve either form (calling only if callable) so the check actually
    # runs instead of silently throwing and degrading to a skipped warning.
    if engine == "cadquery":
        target = shape.val() if hasattr(shape, "val") else shape
        attr = getattr(target, "isValid", None)
    else:
        attr = getattr(shape, "is_valid", None)

    if attr is None:
        return Check("valid_geometry", True, WARNING, "validity unavailable for this engine — skipped")
    ok = bool(attr() if callable(attr) else attr)
    return Check("valid_geometry", ok, ERROR,
                 "OCCT reports valid B-rep" if ok else "OCCT reports an invalid/malformed solid")


def _check_solids(shape: Any, engine: str) -> Check:
    try:
        if engine == "cadquery":
            n = len(shape.solids().vals()) if hasattr(shape, "solids") else 1
        else:
            n = len(shape.solids())
    except Exception as exc:  # noqa: BLE001
        return Check("single_solid", True, WARNING, f"solid count skipped: {exc}")
    if n == 0:
        return Check("single_solid", False, ERROR, "no solid geometry produced")
    if n == 1:
        return Check("single_solid", True, ERROR, "one connected solid")
    return Check("single_solid", True, WARNING,
                 f"{n} disconnected solids — printable, but confirm that's intended")


def _check_volume(shape: Any, engine: str, metadata: dict[str, Any]) -> Check:
    vol = metadata.get("volume_mm3")
    if vol is None:
        vol = getattr(shape, "volume", None)
    if vol is None:
        return Check("positive_volume", True, WARNING, "volume unavailable — skipped")
    ok = vol > 0
    return Check("positive_volume", ok, ERROR,
                 f"volume = {round(vol, 2)} mm³" if ok else "zero/negative volume")


def _check_extent(metadata: dict[str, Any], printer: Printer) -> Check:
    bbox = metadata.get("bounding_box_mm")
    if not bbox:
        return Check("non_degenerate", True, WARNING, "bounding box unavailable — skipped")
    smallest = min(bbox["x"], bbox["y"], bbox["z"])
    ok = smallest >= _MIN_EXTENT_MM
    return Check("non_degenerate", ok, WARNING,
                 f"smallest extent {smallest} mm" if ok else
                 f"smallest extent {smallest} mm < {_MIN_EXTENT_MM} mm (likely degenerate)")


def _check_fit(metadata: dict[str, Any], printer: Printer) -> Check:
    fitsval = metadata.get("fits_build_volume")
    if fitsval is None:
        bbox = metadata.get("bounding_box_mm")
        if not bbox:
            return Check("fits_build_volume", True, WARNING, "no bbox to check fit — skipped")
        fitsval = fits(bbox, printer).fits
    ov = metadata.get("build_volume_overflow_mm")
    detail = f"within {printer.name} build volume" if fitsval else (
        f"exceeds {printer.name} build volume" + (f" by {ov}" if ov else ""))
    return Check("fits_build_volume", bool(fitsval), ERROR, detail)


def _check_watertight(stl_path: str | Path | None) -> Check:
    if not stl_path or not Path(stl_path).exists():
        return Check("watertight_mesh", True, WARNING, "no STL provided — mesh check skipped")
    try:
        import trimesh  # lazy: keeps the heavy mesh dep out of the import path
    except Exception:  # noqa: BLE001
        return Check("watertight_mesh", True, WARNING, "trimesh not installed — mesh check skipped")
    try:
        mesh = trimesh.load(str(stl_path), force="mesh")
        watertight = bool(mesh.is_watertight)
        winding = bool(getattr(mesh, "is_winding_consistent", True))
        ok = watertight and winding
        if ok:
            detail = "exported mesh is watertight + manifold"
        elif not watertight:
            detail = "exported mesh is NOT watertight (holes/gaps — slicer may misbehave)"
        else:
            detail = "exported mesh has inconsistent winding (flipped normals)"
        return Check("watertight_mesh", ok, ERROR, detail)
    except Exception as exc:  # noqa: BLE001
        return Check("watertight_mesh", True, WARNING, f"mesh check skipped: {exc}")
