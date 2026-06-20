"""Persistent chat references — image stored, STL rendered + measured, attachments resolved."""

from __future__ import annotations

from pathlib import Path

import pytest
from api.chats import create_chat, get_chat
from api.references import add_reference, reference_attachments, remove_reference
from api.store import Store

_trimesh = pytest.importorskip("trimesh")
_pil = pytest.importorskip("PIL")


def test_image_and_stl_references(tmp_path: Path) -> None:
    from PIL import Image

    s = Store(tmp_path)
    chat = create_chat(s, "refs")

    img = tmp_path / "sketch.png"
    Image.new("RGB", (40, 40), "white").save(img)
    r1 = add_reference(s, chat.id, "sketch.png", img.read_bytes())
    assert r1 is not None and r1.kind == "image" and r1.image_url.endswith(".png")

    box = _trimesh.creation.box((20.0, 30.0, 40.0))
    stl = tmp_path / "panel.stl"
    box.export(stl)
    r2 = add_reference(s, chat.id, "panel.stl", stl.read_bytes())
    assert r2 is not None and r2.kind == "stl"
    assert r2.bbox is not None
    assert (r2.bbox.x, r2.bbox.y, r2.bbox.z) == (20.0, 30.0, 40.0)  # bbox from trimesh extents

    chat = get_chat(s, chat.id)
    assert chat is not None and len(chat.references) == 2
    paths, note = reference_attachments(s, chat)
    assert all(Path(p).exists() for p in paths)
    assert "STL reference, 20×30×40 mm" in note and "reference image" in note

    remove_reference(s, chat.id, r2.id)
    chat = get_chat(s, chat.id)
    assert chat is not None and [r.id for r in chat.references] == [r1.id]


def test_unsupported_reference_type(tmp_path: Path) -> None:
    s = Store(tmp_path)
    chat = create_chat(s, "refs")
    assert add_reference(s, chat.id, "notes.txt", b"hello") is None
    assert add_reference(s, "no-such-chat", "x.png", b"x") is None


def test_malformed_stl_is_a_controlled_rejection(tmp_path: Path) -> None:
    """A corrupt .stl upload returns None (not an unhandled 500), and leaves nothing behind."""
    s = Store(tmp_path)
    chat = create_chat(s, "refs")
    assert add_reference(s, chat.id, "broken.stl", b"this is not a mesh") is None
    rdir = s.chat_dir(chat.id) / "references"
    assert not (rdir.exists() and list(rdir.glob("*.stl")))  # the bad file was cleaned up


def test_remove_reference_does_not_glob_user_ref_id(tmp_path: Path) -> None:
    """A wildcard ref_id must not delete other references' files (no glob on user input)."""
    from PIL import Image

    s = Store(tmp_path)
    chat = create_chat(s, "refs")
    img = tmp_path / "a.png"
    Image.new("RGB", (4, 4)).save(img)
    r1 = add_reference(s, chat.id, "a.png", img.read_bytes())
    assert r1 is not None
    rdir = s.chat_dir(chat.id) / "references"
    before = set(rdir.glob("*"))
    remove_reference(s, chat.id, "*")  # a wildcard/garbage id — must be a no-op on files
    assert set(rdir.glob("*")) == before
    chat = get_chat(s, chat.id)
    assert [r.id for r in chat.references] == [r1.id]
