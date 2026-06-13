"""Execute a parametric CAD script headlessly and export manufacturing geometry.

Convention for a ``model.py``:

* Define a function ``build(params: dict) -> Shape`` (preferred — receives the
  contents of ``params.json``), **or**
* Assign a module-level variable ``result`` holding the finished shape.

The returned object may be a build123d ``BuilderContext`` (we read ``.part`` /
``.sketch`` / ``.line``), a build123d ``Shape`` (``Part``/``Solid``/``Compound``),
or a CadQuery ``Workplane`` (fallback engine).

The whole point of this module is the agent loop: on a compile/exec error we
capture the full traceback as a string and hand it back so Claude can self-fix.
"""

from __future__ import annotations

import io
import json
import runpy
import traceback
from contextlib import redirect_stderr, redirect_stdout
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Formats we know how to export. STEP/BREP require a B-rep engine (build123d /
# CadQuery); STL/3MF work for either.
DEFAULT_FORMATS = ("stl", "step", "3mf", "svg")

# Default isometric-ish camera origin for the SVG projection (mm).
DEFAULT_VIEW_ORIGIN = (-100.0, -100.0, 75.0)


@dataclass
class BuildResult:
    """Structured outcome of a build, JSON-serialisable for the API / CLI."""

    ok: bool
    model_path: str
    artifacts: dict[str, str] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)
    stdout: str = ""
    stderr: str = ""
    error: str | None = None
    engine: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "model_path": self.model_path,
            "artifacts": self.artifacts,
            "metadata": self.metadata,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "error": self.error,
            "engine": self.engine,
        }


def load_params(params_path: str | Path | None) -> dict[str, Any]:
    """Load a ``params.json`` if present; an absent path yields ``{}``."""
    if params_path is None:
        return {}
    path = Path(params_path)
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def build_model(
    model_path: str | Path,
    params: dict[str, Any] | None = None,
    out_dir: str | Path | None = None,
    name: str | None = None,
    formats: tuple[str, ...] = DEFAULT_FORMATS,
    view_origin: tuple[float, float, float] = DEFAULT_VIEW_ORIGIN,
) -> BuildResult:
    """Run ``model_path`` headlessly and export the requested ``formats``.

    Never raises for *modelling* errors: a failed build returns ``ok=False`` with
    the traceback in ``.error`` so the agent can iterate. (It may still raise for
    truly exceptional I/O problems.)
    """
    model_path = Path(model_path).resolve()
    params = params or {}
    name = name or model_path.stem
    out_dir = Path(out_dir) if out_dir else model_path.parent / "artifacts"

    out = io.StringIO()
    err = io.StringIO()
    try:
        with redirect_stdout(out), redirect_stderr(err):
            shape, engine = _execute(model_path, params)
            out_dir.mkdir(parents=True, exist_ok=True)
            artifacts = _export(shape, out_dir, name, formats, engine, view_origin)
            metadata = _metadata(shape, engine)
    except Exception:  # noqa: BLE001 - we deliberately surface every failure
        return BuildResult(
            ok=False,
            model_path=str(model_path),
            stdout=out.getvalue(),
            stderr=err.getvalue(),
            error=traceback.format_exc(),
        )

    return BuildResult(
        ok=True,
        model_path=str(model_path),
        artifacts={k: str(v) for k, v in artifacts.items()},
        metadata=metadata,
        stdout=out.getvalue(),
        stderr=err.getvalue(),
        engine=engine,
    )


def _execute(model_path: Path, params: dict[str, Any]) -> tuple[Any, str]:
    """Run the script and return ``(shape, engine_name)``."""
    namespace = runpy.run_path(str(model_path), init_globals={"PARAMS": params})

    builder = namespace.get("build")
    if callable(builder):
        raw = builder(params)
    elif "result" in namespace:
        raw = namespace["result"]
    else:
        raise ValueError(
            f"{model_path.name} must define a `build(params)` function or a "
            "module-level `result` variable holding the finished shape."
        )

    if raw is None:
        raise ValueError("Model produced `None`; expected a CAD shape.")

    return _coerce_shape(raw)


def _coerce_shape(raw: Any) -> tuple[Any, str]:
    """Unwrap builder contexts and detect which engine produced the shape."""
    # build123d Builder context -> finished geometry attribute.
    for attr in ("part", "sketch", "line"):
        inner = getattr(raw, attr, None)
        if inner is not None and type(inner).__module__.startswith("build123d"):
            return inner, "build123d"

    module = type(raw).__module__
    if module.startswith("build123d"):
        return raw, "build123d"
    if module.startswith("cadquery"):
        return raw, "cadquery"

    raise TypeError(
        f"Unsupported result type {type(raw)!r} from module {module!r}. "
        "Return a build123d or CadQuery object."
    )


# --------------------------------------------------------------------------- #
# Export                                                                       #
# --------------------------------------------------------------------------- #
def _export(
    shape: Any,
    out_dir: Path,
    name: str,
    formats: tuple[str, ...],
    engine: str,
    view_origin: tuple[float, float, float],
) -> dict[str, Path]:
    if engine == "cadquery":
        return _export_cadquery(shape, out_dir, name, formats)
    return _export_build123d(shape, out_dir, name, formats, view_origin)


def _export_build123d(
    shape: Any,
    out_dir: Path,
    name: str,
    formats: tuple[str, ...],
    view_origin: tuple[float, float, float],
) -> dict[str, Path]:
    import build123d as b3d

    artifacts: dict[str, Path] = {}
    for fmt in formats:
        path = out_dir / f"{name}.{fmt}"
        if fmt == "stl":
            b3d.export_stl(shape, str(path))
        elif fmt == "step":
            b3d.export_step(shape, str(path))
        elif fmt == "brep":
            b3d.export_brep(shape, str(path))
        elif fmt == "3mf":
            mesher = b3d.Mesher()
            mesher.add_shape(shape)
            mesher.write(str(path))
        elif fmt == "svg":
            _render_svg_build123d(shape, path, view_origin)
        else:
            continue
        artifacts[fmt] = path
    return artifacts


def _render_svg_build123d(
    shape: Any, path: Path, view_origin: tuple[float, float, float]
) -> None:
    """Project the 3D part to a 2D SVG (visible + hidden edges) — headless, no GPU.

    This is the cheap "render" the agent can vision-check against the spec.
    """
    import build123d as b3d

    visible, hidden = shape.project_to_viewport(view_origin)
    bbox = b3d.Compound(children=list(visible) + list(hidden)).bounding_box()
    max_dim = max(bbox.size.X, bbox.size.Y, bbox.size.Z) or 1.0

    exporter = b3d.ExportSVG(scale=100.0 / max_dim, margin=10.0)
    exporter.add_layer("visible", line_weight=0.3)
    exporter.add_layer(
        "hidden", line_color=(160, 160, 160), line_type=b3d.LineType.ISO_DOT
    )
    exporter.add_shape(list(visible), layer="visible")
    exporter.add_shape(list(hidden), layer="hidden")
    exporter.write(str(path))


def _export_cadquery(
    shape: Any, out_dir: Path, name: str, formats: tuple[str, ...]
) -> dict[str, Path]:
    from cadquery import exporters

    fmt_map = {"stl": "STL", "step": "STEP", "3mf": "3MF", "svg": "SVG"}
    artifacts: dict[str, Path] = {}
    for fmt in formats:
        if fmt not in fmt_map:
            continue
        path = out_dir / f"{name}.{fmt}"
        exporters.export(shape, str(path), exportType=fmt_map[fmt])
        artifacts[fmt] = path
    return artifacts


# --------------------------------------------------------------------------- #
# Metadata (cheap sanity checks for the agent / UI)                            #
# --------------------------------------------------------------------------- #
def _metadata(shape: Any, engine: str) -> dict[str, Any]:
    try:
        if engine == "cadquery":
            solid = shape.val() if hasattr(shape, "val") else shape
            bb = solid.BoundingBox()
            size = {"x": bb.xlen, "y": bb.ylen, "z": bb.zlen}
            volume = solid.Volume() if hasattr(solid, "Volume") else None
        else:
            bb = shape.bounding_box()
            size = {"x": bb.size.X, "y": bb.size.Y, "z": bb.size.Z}
            volume = getattr(shape, "volume", None)
        return {
            "bounding_box_mm": {k: round(v, 4) for k, v in size.items()},
            "volume_mm3": round(volume, 4) if volume is not None else None,
        }
    except Exception:  # noqa: BLE001 - metadata is best-effort
        return {}
