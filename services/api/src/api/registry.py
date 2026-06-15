"""Printer + filament registry and app settings, persisted under ``~/.agent-cad/``.

Store-level load/save + the first-run seed. (HTTP CRUD for printers is the API layer's
job — see API-14; the ``/settings`` endpoints live in ``main.py``.) The seed reuses the
Ender 5 S1 envelope from ``cad.printer.ENDER_5_S1`` so the registry default stays in
parity with the single source of truth for the machine.
"""

from __future__ import annotations

from api.schemas import BuildVolume, FilamentProfile, Printer, Settings, SliceSettings
from api.store import Store


def default_settings() -> Settings:
    return Settings()


def _seed_pla() -> FilamentProfile:
    """The committed Ender 5 S1 OrcaSlicer defaults, as the seed PLA profile."""
    pla = SliceSettings(
        flow=0.95,
        nozzle_temp=220,
        bed_temp=60,
        wall_speed=25,
        retraction_length=1.0,
        layer_height=0.2,
        wall_loops=2,
        top_layers=7,
        bottom_layers=5,
        infill_density=15,
        infill_pattern="crosshatch",
        seam_position="aligned",
        brim_width=0,
        support=False,
        support_threshold=30,
        jerk=25,
    )
    return FilamentProfile(
        id="pla",
        name="Generic PLA",
        material="PLA",
        settings=pla,
        default_settings=pla.model_copy(deep=True),
    )


def seed_ender5s1() -> Printer:
    """The seeded Ender 5 S1 record (default printer, one PLA filament)."""
    from cad.printer import ENDER_5_S1  # local import: keep cad off the module-load path

    bv = ENDER_5_S1.build_volume
    return Printer(
        id="ender5s1",
        name=ENDER_5_S1.name,
        kind="FDM",
        build_volume=BuildVolume(x=bv.x, y=bv.y, z=bv.z),
        nozzle_diameter_mm=0.4,
        firmware="Marlin",
        bed_margin_mm=ENDER_5_S1.bed_margin_mm,
        default=True,
        filaments=[_seed_pla()],
    )


# --- settings ------------------------------------------------------------- #
def load_settings(store: Store) -> Settings:
    data = store.read_json(store.settings_path)
    return Settings.model_validate(data) if data is not None else default_settings()


def save_settings(store: Store, settings: Settings) -> Settings:
    store.atomic_write_json(store.settings_path, settings.model_dump())
    return settings


# --- printers ------------------------------------------------------------- #
def list_printers(store: Store) -> list[Printer]:
    if not store.printers_dir.exists():
        return []
    return [
        Printer.model_validate(store.read_json(p))
        for p in sorted(store.printers_dir.glob("*.json"))
    ]


def get_printer(store: Store, printer_id: str) -> Printer | None:
    data = store.read_json(store.printer_path(printer_id))
    return Printer.model_validate(data) if data is not None else None


def save_printer(store: Store, printer: Printer) -> Printer:
    store.atomic_write_json(store.printer_path(printer.id), printer.model_dump())
    return printer


def delete_printer(store: Store, printer_id: str) -> None:
    path = store.printer_path(printer_id)
    if path.exists():
        path.unlink()


def default_printer(store: Store) -> Printer | None:
    """The printer marked default (or the first one, or None when empty)."""
    printers = list_printers(store)
    for p in printers:
        if p.default:
            return p
    return printers[0] if printers else None


# --- first-run seed ------------------------------------------------------- #
def seed_first_run(store: Store) -> None:
    """Create + populate ``~/.agent-cad`` on first run. Idempotent: never clobbers."""
    store.ensure_dirs()
    if store.is_empty():  # no settings.json yet
        ender = seed_ender5s1()
        save_printer(store, ender)
        save_settings(
            store,
            Settings(default_printer_id=ender.id, storage_location=str(store.root)),
        )
