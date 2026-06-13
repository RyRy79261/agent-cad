"""Automated cleanup for LiDAR / photogrammetry scans (Scaniverse, Polycam, ...).

The realistic van workflow treats a scan as a *reference* mesh: clean it up here,
measure it on screen, then design a parametric build123d mount around the numbers.
So this pipeline's job is to turn a messy raw capture into a single, manifold,
right-sized reference mesh.

Recipe (per the spec):
  weld close vertices -> drop duplicate/degenerate faces -> keep the largest
  connected component -> fix normals/winding -> fill holes -> optional quadric
  decimation to a target face count -> recenter -> verify watertight.

trimesh is the required backend; Open3D / PyMeshLab are optional enhanced paths.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import trimesh


@dataclass
class ScanStats:
    vertices: int
    faces: int
    watertight: bool
    components: int
    bbox_mm: dict[str, float]
    volume_mm3: float | None

    @classmethod
    def of(cls, mesh: "trimesh.Trimesh") -> "ScanStats":
        x, y, z = (float(v) for v in mesh.extents)
        watertight = bool(mesh.is_watertight)
        return cls(
            vertices=int(len(mesh.vertices)),
            faces=int(len(mesh.faces)),
            watertight=watertight,
            components=int(mesh.body_count),
            bbox_mm={"x": round(x, 4), "y": round(y, 4), "z": round(z, 4)},
            volume_mm3=round(abs(float(mesh.volume)), 4) if watertight else None,
        )


@dataclass
class ScanResult:
    ok: bool
    input_path: str
    output_path: str | None = None
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None
    operations: list[str] = field(default_factory=list)
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "input_path": self.input_path,
            "output_path": self.output_path,
            "before": self.before,
            "after": self.after,
            "operations": self.operations,
            "error": self.error,
        }


def clean_mesh(
    input_path: str | Path,
    output_path: str | Path | None = None,
    *,
    keep_largest: bool = True,
    weld: bool = True,
    fill_holes: bool = True,
    fix_normals: bool = True,
    target_faces: int | None = None,
    recenter: bool = True,
) -> ScanResult:
    """Clean a scan mesh and write the result. Returns a structured report.

    ``target_faces`` decimates to (approximately) that triangle count if set.
    ``recenter`` moves the mesh so its bounding-box centre sits at the origin
    (handy for measuring against a parametric model).
    """
    input_path = Path(input_path)
    ops: list[str] = []
    try:
        mesh = trimesh.load(input_path, force="mesh")
        if not isinstance(mesh, trimesh.Trimesh) or mesh.is_empty:
            raise ValueError(f"could not load a mesh from {input_path}")
        before = asdict(ScanStats.of(mesh))

        if weld:
            mesh.merge_vertices()
            mesh.update_faces(mesh.nondegenerate_faces())
            mesh.update_faces(mesh.unique_faces())
            mesh.remove_unreferenced_vertices()
            ops.append("weld+dedupe")

        if keep_largest:
            mesh = _largest_component(mesh)
            ops.append("keep-largest-component")

        if fix_normals:
            mesh.fix_normals()
            ops.append("fix-normals")

        if fill_holes:
            try:
                mesh.fill_holes()
                ops.append("fill-holes")
            except Exception:  # noqa: BLE001 - hole filling is best-effort
                pass

        if target_faces and len(mesh.faces) > target_faces:
            mesh = _decimate(mesh, target_faces)
            ops.append(f"decimate->{target_faces}")

        if recenter:
            mesh.apply_translation(-mesh.bounding_box.centroid)
            ops.append("recenter")

        output_path = (
            Path(output_path)
            if output_path
            else input_path.with_name(f"{input_path.stem}.clean.stl")
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        mesh.export(output_path)

        return ScanResult(
            ok=True,
            input_path=str(input_path),
            output_path=str(output_path),
            before=before,
            after=asdict(ScanStats.of(mesh)),
            operations=ops,
        )
    except Exception as exc:  # noqa: BLE001 - surface failures to the caller
        return ScanResult(
            ok=False, input_path=str(input_path), operations=ops, error=str(exc)
        )


def _largest_component(mesh: "trimesh.Trimesh") -> "trimesh.Trimesh":
    """Return the connected component with the most faces (drops floaters)."""
    parts = mesh.split(only_watertight=False)
    if len(parts) <= 1:
        return mesh
    return max(parts, key=lambda m: len(m.faces))


def _decimate(mesh: "trimesh.Trimesh", target_faces: int) -> "trimesh.Trimesh":
    """Quadric-decimate to ~``target_faces`` (no-op if backend unavailable)."""
    try:
        return mesh.simplify_quadric_decimation(face_count=target_faces)
    except Exception:  # noqa: BLE001 - fall back to the undecimated mesh
        return mesh
