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
    """Headless STL → a 4-view PNG (iso / front / top / right) via matplotlib (Agg, no GL).

    Multiple labelled angles so the model can read the *actual geometry* — holes, cut-outs,
    fittings — not just the silhouette. Best-effort; False on failure.
    """
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import trimesh
        from mpl_toolkits.mplot3d.art3d import Poly3DCollection

        mesh = trimesh.load(stl_path, force="mesh")
        lo, hi = mesh.bounds
        aspect = tuple(max(e, 1e-3) for e in mesh.extents)
        views = [("iso", 24, -58), ("front (−Y)", 6, -90), ("top (+Z)", 88, -90), ("right (+X)", 6, 0)]
        fig = plt.figure(figsize=(8, 8))
        for i, (label, elev, azim) in enumerate(views, 1):
            ax = fig.add_subplot(2, 2, i, projection="3d")
            ax.add_collection3d(
                Poly3DCollection(
                    mesh.triangles, facecolor="#9cc0e6", edgecolor="#2d4a6b", linewidths=0.15, alpha=0.97
                )
            )
            ax.set_xlim(lo[0], hi[0])
            ax.set_ylim(lo[1], hi[1])
            ax.set_zlim(lo[2], hi[2])
            ax.set_box_aspect(aspect)
            ax.view_init(elev=elev, azim=azim)
            ax.set_axis_off()
            ax.set_title(label, fontsize=9, color="#33506e")
        fig.tight_layout()
        fig.savefig(png_path, dpi=95, facecolor="white")
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

        try:
            mesh = trimesh.load(stl, force="mesh")
            ext3 = [round(float(v), 2) for v in mesh.extents]
        except Exception:  # noqa: BLE001 - a malformed .stl is a controlled rejection, not a 500
            _log.warning("rejected unparseable STL reference %s", filename)
            stl.unlink(missing_ok=True)
            return None
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
        # Delete the ref's files by EXACT name per extension — never glob a user-supplied
        # ``ref_id`` (a '*' would match and delete unrelated references in the chat).
        for ext in (*_IMAGE_EXTS, ".stl", ".png"):
            (rdir / f"{ref_id}{ext}").unlink(missing_ok=True)
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
                f"- '{r.name}': an STL reference, {r.bbox.x:.0f}×{r.bbox.y:.0f}×{r.bbox.z:.0f} mm. "
                "Its render shows FOUR views (iso / front / top / right). REPLICATE its actual geometry "
                "— every hole, cut-out, slot, fitting and feature you can see — not just the overall size."
            )
        else:
            notes.append(f"- '{r.name}': a reference image")
    note = (
        "\n\nPinned references for this design — VIEW each render with the Read tool before coding:\n"
        + "\n".join(notes)
    ) if notes else ""
    return paths, note
