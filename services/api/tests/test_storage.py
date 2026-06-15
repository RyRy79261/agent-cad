"""Tests for storage usage + data-management (API-12)."""

from __future__ import annotations

from api import storage
from api.chats import create_chat
from api.registry import default_printer, seed_first_run
from api.store import Store


def test_usage_counts_chats_models_slices(tmp_path):
    s = Store(tmp_path)
    seed_first_run(s)
    c = create_chat(s, "x")
    art = s.artifacts_dir(c.id)
    (art / "model.stl").write_bytes(b"solid\nendsolid\n")
    (art / "model.gcode").write_bytes(b"G28\n")
    (art / "model.py").write_text("build = None\n")
    u = storage.usage(s)
    assert u["chats"] == 1
    assert u["models"] == 1
    assert u["slices"] == 1
    assert u["bytes_used"] > 0


def test_clear_artifacts_keeps_sources(tmp_path):
    s = Store(tmp_path)
    seed_first_run(s)
    c = create_chat(s, "x")
    art = s.artifacts_dir(c.id)
    (art / "model.stl").write_bytes(b"x" * 100)
    (art / "model.gcode").write_bytes(b"y" * 50)
    (art / "model.py").write_text("keep me\n")
    freed = storage.clear_artifacts(s)
    assert freed == 150
    assert not (art / "model.stl").exists()
    assert not (art / "model.gcode").exists()
    assert (art / "model.py").exists()  # source kept


def test_clear_chats(tmp_path):
    s = Store(tmp_path)
    seed_first_run(s)
    create_chat(s, "a")
    create_chat(s, "b")
    assert storage.clear_chats(s) == 2
    assert storage.usage(s)["chats"] == 0


def test_reset_reseeds(tmp_path):
    s = Store(tmp_path)
    seed_first_run(s)
    create_chat(s, "a")
    storage.reset_store(s)
    assert storage.usage(s)["chats"] == 0
    assert default_printer(s).id == "ender5s1"  # re-seeded
