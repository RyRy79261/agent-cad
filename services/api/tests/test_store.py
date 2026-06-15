"""Tests for the ~/.agent-cad on-disk store (FOUND-1)."""

from __future__ import annotations

from pathlib import Path

from api.store import Store, default_root


def test_default_root_uses_env(monkeypatch, tmp_path):
    monkeypatch.setenv("AGENT_CAD_HOME", str(tmp_path / "home"))
    assert default_root() == (tmp_path / "home").resolve()


def test_default_root_falls_back_to_home(monkeypatch):
    monkeypatch.delenv("AGENT_CAD_HOME", raising=False)
    assert default_root() == (Path.home() / ".agent-cad").resolve()


def test_path_helpers(tmp_path):
    s = Store(tmp_path)
    assert s.settings_path == tmp_path / "settings.json"
    assert s.printer_path("ender5s1") == tmp_path / "printers" / "ender5s1.json"
    assert s.chat_path("abc") == tmp_path / "chats" / "abc" / "chat.json"
    assert s.artifacts_dir("abc") == tmp_path / "chats" / "abc" / "artifacts"
    assert s.jobs_path == tmp_path / "jobs.json"


def test_ensure_dirs(tmp_path):
    s = Store(tmp_path)
    s.ensure_dirs()
    assert s.printers_dir.is_dir()
    assert s.chats_dir.is_dir()
    assert s.imports_dir.is_dir()


def test_atomic_write_and_read_roundtrip(tmp_path):
    s = Store(tmp_path)
    s.atomic_write_json(s.settings_path, {"theme": "dark", "n": 1})
    assert s.read_json(s.settings_path) == {"theme": "dark", "n": 1}


def test_read_json_missing_returns_default(tmp_path):
    s = Store(tmp_path)
    assert s.read_json(s.settings_path, default={"seed": True}) == {"seed": True}


def test_atomic_write_leaves_no_temp_files(tmp_path):
    s = Store(tmp_path)
    s.atomic_write_json(s.settings_path, {"a": 1})
    leftovers = sorted(p.name for p in tmp_path.iterdir() if p.name != "settings.json")
    assert leftovers == []


def test_atomic_write_overwrites_existing(tmp_path):
    s = Store(tmp_path)
    s.atomic_write_json(s.settings_path, {"v": 1})
    s.atomic_write_json(s.settings_path, {"v": 2})
    assert s.read_json(s.settings_path) == {"v": 2}


def test_is_empty(tmp_path):
    s = Store(tmp_path)
    assert s.is_empty()
    s.atomic_write_json(s.settings_path, {})
    assert not s.is_empty()
