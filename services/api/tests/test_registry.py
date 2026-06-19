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


def test_seeded_printer_firmware_is_stock_ender(tmp_path):
    """The Ender 5 S1 seed reports stock firmware — PA / input-shaping off (not ours to reflash)."""
    s = Store(tmp_path)
    seed_first_run(s)
    p = default_printer(s)
    assert p.firmware.name == "Creality Marlin (stock)"
    assert p.firmware.linear_advance is False
    assert p.firmware.input_shaping is False


def test_firmware_legacy_string_coerces(tmp_path):
    """Back-compat: registry records that stored firmware as a plain name string still load."""
    from api.schemas import Printer

    p = Printer.model_validate(
        {"id": "x", "name": "X", "build_volume": {"x": 200, "y": 200, "z": 200}, "firmware": "Marlin"}
    )
    assert p.firmware.name == "Marlin"
    assert p.firmware.linear_advance is False
    # round-trips through the store as the capability object now
    s = Store(tmp_path)
    save_printer(s, p)
    assert get_printer(s, "x").firmware.name == "Marlin"


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


def test_set_active_printer_drives_fits():
    """FOUND-8: the fit check targets the settable active printer, not the frozen constant."""
    from cad.printer import (
        ENDER_5_S1,
        BuildVolume,
        Printer,
        active_printer,
        fits,
        set_active_printer,
    )

    try:
        # A 150mm cube fits the Ender (usable 210) but not a 100mm machine (usable 90).
        assert fits((150, 150, 50)).fits is True  # default active = Ender 5 S1
        set_active_printer(Printer(name="Tiny", build_volume=BuildVolume(100, 100, 100), bed_margin_mm=5))
        assert active_printer().name == "Tiny"
        assert fits((150, 150, 50)).fits is False
    finally:
        set_active_printer(ENDER_5_S1)  # restore the global for other tests
