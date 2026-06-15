"""Tests for the printer/filament registry + settings + first-run seed (FOUND-2/3/6/7)."""

from __future__ import annotations

from api.registry import (
    default_printer,
    get_printer,
    list_printers,
    load_settings,
    save_printer,
    save_settings,
    seed_ender5s1,
    seed_first_run,
)
from api.schemas import Settings
from api.store import Store


def test_seed_first_run_creates_store(tmp_path):
    s = Store(tmp_path)
    seed_first_run(s)
    assert s.settings_path.exists()
    assert (s.printers_dir / "ender5s1.json").exists()
    assert s.chats_dir.is_dir()
    assert s.imports_dir.is_dir()


def test_seed_is_idempotent(tmp_path):
    s = Store(tmp_path)
    seed_first_run(s)
    save_settings(s, load_settings(s).model_copy(update={"theme": "dark"}))
    seed_first_run(s)  # must NOT clobber edited settings
    assert load_settings(s).theme == "dark"


def test_seeded_printer_is_ender_default_with_pla(tmp_path):
    s = Store(tmp_path)
    seed_first_run(s)
    p = default_printer(s)
    assert p is not None
    assert p.id == "ender5s1" and p.default is True
    assert p.build_volume.x == 220 and p.build_volume.z == 280
    assert p.nozzle_diameter_mm == 0.4
    assert len(p.filaments) == 1
    fil = p.filaments[0]
    assert fil.material == "PLA"
    assert fil.settings.flow == 0.95 and fil.settings.bed_temp == 60


def test_settings_roundtrip(tmp_path):
    s = Store(tmp_path)
    save_settings(s, Settings(active_model="claude-opus-4-8", auto_clear_days=30, theme="dark"))
    loaded = load_settings(s)
    assert loaded.auto_clear_days == 30 and loaded.theme == "dark"


def test_load_settings_defaults_when_absent(tmp_path):
    s = Store(tmp_path)
    assert load_settings(s).active_model == "claude-opus-4-8"


def test_printer_crud_at_store_level(tmp_path):
    s = Store(tmp_path)
    seed_first_run(s)
    ender = seed_ender5s1()
    ender.name = "My Ender"
    save_printer(s, ender)
    assert get_printer(s, "ender5s1").name == "My Ender"
    assert any(p.id == "ender5s1" for p in list_printers(s))
