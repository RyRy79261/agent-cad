"""Importing external CAD geometry as **editable** build123d parts.

Unlike an STL (a triangle mesh — no design intent, can't be meaningfully edited), a STEP or
BREP file carries real B-rep geometry that build123d can read back in. So we can import it,
edit it *on top of the real part* (boolean cuts/unions, fillets…), and re-export — preserving
the original exactly instead of doing a lossy mesh rebuild.

This module is the seam: classify a file by extension, measure an editable file's bounding
box, and scaffold the wrapper ``model.py`` that imports it so the chat can edit it like any
generated part.
"""

from __future__ import annotations

from pathlib import Path

# Editable B-rep formats build123d can read (and we can therefore modify in code).
EDITABLE_EXTS = {".step", ".stp", ".brep"}
# Mesh formats — viewable/printable but not meaningfully editable.
MESH_EXTS = {".stl"}
# Formats we can't read — map each to the practical fix (almost always "export STEP").
UNSUPPORTED_EXTS = {
    ".f3d": "Fusion 360 native — in Fusion: File → Export → STEP (.step), then import that.",
    ".iges": "IGES isn't supported — re-export it as STEP (.step) from your CAD tool.",
    ".igs": "IGES isn't supported — re-export it as STEP (.step) from your CAD tool.",
    ".sldprt": "SolidWorks native — export STEP (.step) and import that.",
    ".ipt": "Inventor native — export STEP (.step) and import that.",
    ".obj": "OBJ is a mesh (not editable) — export STEP for editing, or STL to just print.",
    ".3mf": "3MF is a mesh container (not editable) — export STEP for editing.",
}


def classify(filename: str) -> str:
    """``'editable'`` (STEP/BREP), ``'mesh'`` (STL), or ``'unsupported'``."""
    ext = Path(filename).suffix.lower()
    if ext in EDITABLE_EXTS:
        return "editable"
    if ext in MESH_EXTS:
        return "mesh"
    return "unsupported"


def unsupported_reason(filename: str) -> str:
    """A helpful, human message for a format we can't import."""
    ext = Path(filename).suffix.lower()
    return UNSUPPORTED_EXTS.get(
        ext, f"'{ext}' isn't a supported CAD format — export STEP (.step) to edit, or STL to print."
    )


def import_shape(path: str | Path):
    """Load a STEP/BREP file as a build123d shape (raises ValueError for other extensions)."""
    from build123d import import_brep, import_step

    ext = Path(path).suffix.lower()
    if ext in (".step", ".stp"):
        return import_step(str(path))
    if ext == ".brep":
        return import_brep(str(path))
    raise ValueError(f"not an editable CAD format: {ext}")


def cad_bbox(path: str | Path) -> tuple[list[float], float]:
    """``([x, y, z] extents in mm, volume_mm3)`` for an editable CAD file."""
    shape = import_shape(path)
    bb = shape.bounding_box()
    extents = [float(bb.size.X), float(bb.size.Y), float(bb.size.Z)]
    return extents, float(getattr(shape, "volume", 0.0) or 0.0)


def scaffold_source(reference_filename: str) -> str:
    """The wrapper ``model.py`` that imports ``reference_filename`` and leaves room to edit it.

    The chat refines this file: it adds build123d operations to ``build()`` while keeping the
    import, so edits land on the real imported geometry.
    """
    fn = "import_brep" if Path(reference_filename).suffix.lower() == ".brep" else "import_step"
    # Keep this source ASCII-only — it's written to disk in environments whose default text
    # encoding may be ASCII (a stray non-ASCII char would raise UnicodeEncodeError on write).
    return f'''# SUMMARY: Imported "{reference_filename}" as an editable model - tell me what to add, cut, or resize.
"""Editable wrapper around an imported CAD part.

The real B-rep geometry is loaded from the reference file with build123d's {fn}, so the
original design is preserved EXACTLY. Modify it by adding build123d operations to build()
below (boolean union/cut, fillets, etc.); never hand-recreate the imported geometry.
"""

from pathlib import Path

from build123d import {fn}  # noqa: F401 - also re-exported for edits that add geometry

REFERENCE = Path(__file__).parent / "{reference_filename}"
DEFAULTS: dict = {{}}


def build(params: dict):
    part = {fn}(str(REFERENCE))
    # --- edits go here. e.g. to drill a hole:
    #     from build123d import Pos, Cylinder
    #     part = part - Pos(x, y, 0) * Cylinder(radius=r, height=thickness + 1)
    return part
'''
