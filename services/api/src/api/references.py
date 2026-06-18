"""Persistent chat references — images and STL renders the model views every turn.

An image reference is stored as-is; an STL reference is stored alongside a headless
matplotlib render (so the model can *see* its shape) plus its bounding box (so it can
match the size). ``reference_attachments`` resolves the viewable image paths + a prompt
note, which generate/refine pass to the multimodal driver.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import TYPE_CHECKING

from api.chats import get_chat, save_chat
from api.logging_setup import get_logger
from api.schemas import Chat, Reference

if TYPE_CHECKING:
    from api.store import Store

_log = get_logger("references")
_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def references_dir(store: Store, chat_id: str) -> Path:
    d = store.chat_dir(chat_id) / "references"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _render_stl_to_png(stl_path: Path, png_path: Path) -> bool:
    """Headless STL → PNG via matplotlib (Agg, no GL). Best-effort; False on failure."""
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import trimesh
        from mpl_toolkits.mplot3d.art3d import Poly3DCollection

        mesh = trimesh.load(stl_path, force="mesh")
        fig = plt.figure(figsize=(4, 4))
        ax = fig.add_subplot(111, projection="3d")
        ax.add_collection3d(
            Poly3DCollection(mesh.triangles, facecolor="#8fb3d9", edgecolor="#33506e", linewidths=0.1, alpha=0.95)
        )
        lo, hi = mesh.bounds
        ax.set_xlim(lo[0], hi[0])
        ax.set_ylim(lo[1], hi[1])
        ax.set_zlim(lo[2], hi[2])
        ax.set_box_aspect(tuple(max(e, 1e-3) for e in mesh.extents))
        ax.view_init(elev=22, azim=-58)
        ax.set_axis_off()
        fig.savefig(png_path, dpi=80, bbox_inches="tight")
        plt.close(fig)
        return True
    except Exception:  # noqa: BLE001 - rendering is best-effort; dims still help
        _log.exception("STL render failed for %s", stl_path)
        return False


def add_reference(store: Store, chat_id: str, filename: str, data: bytes) -> Reference | None:
    """Store an image or STL reference on the chat. Returns None if the chat/type is invalid."""
    chat = get_chat(store, chat_id)
    if chat is None:
        return None
    rdir = references_dir(store, chat_id)
    rid = uuid.uuid4().hex[:10]
    ext = Path(filename).suffix.lower()

    if ext in _IMAGE_EXTS:
        out = rdir / f"{rid}{ext}"
        out.write_bytes(data)
        ref = Reference(id=rid, kind="image", name=filename, image_url=f"/chats/{chat_id}/references/{out.name}")
    elif ext == ".stl":
        stl = rdir / f"{rid}.stl"
        stl.write_bytes(data)
        import trimesh

        mesh = trimesh.load(stl, force="mesh")
        ext3 = [round(float(v), 2) for v in mesh.extents]
        bbox = {"x": ext3[0], "y": ext3[1], "z": ext3[2]}
        png = rdir / f"{rid}.png"
        rendered = _render_stl_to_png(stl, png)
        ref = Reference(
            id=rid,
            kind="stl",
            name=filename,
            image_url=f"/chats/{chat_id}/references/{png.name}" if rendered else "",
            bbox=bbox,
        )
    else:
        return None

    chat.references.append(ref)
    save_chat(store, chat)
    return ref


def remove_reference(store: Store, chat_id: str, ref_id: str) -> Chat | None:
    chat = get_chat(store, chat_id)
    if chat is None:
        return None
    chat.references = [r for r in chat.references if r.id != ref_id]
    rdir = store.chat_dir(chat_id) / "references"
    if rdir.exists():
        for f in rdir.glob(f"{ref_id}.*"):
            f.unlink(missing_ok=True)
    return save_chat(store, chat)


def reference_attachments(store: Store, chat: Chat) -> tuple[list[str], str]:
    """(image file paths to attach, a prompt note describing the refs). Both empty when none."""
    rdir = store.chat_dir(chat.id) / "references"
    paths: list[str] = []
    notes: list[str] = []
    for r in chat.references:
        if r.image_url:
            p = rdir / r.image_url.rsplit("/", 1)[-1]
            if p.exists():
                paths.append(str(p.resolve()))
        if r.kind == "stl" and r.bbox:
            notes.append(
                f"- '{r.name}': an STL reference ({r.bbox['x']:.0f}×{r.bbox['y']:.0f}×{r.bbox['z']:.0f} mm) — "
                "view its render for the shape"
            )
        else:
            notes.append(f"- '{r.name}': a reference image")
    note = ("\n\nPinned references for this design (view each with Read):\n" + "\n".join(notes)) if notes else ""
    return paths, note
