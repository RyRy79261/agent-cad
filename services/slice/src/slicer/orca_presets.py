"""Read OrcaSlicer's bundled filament presets from the *local* install (no redistribution).

OrcaSlicer ships ~10k system presets inside its AppImage at
``resources/profiles/<Vendor>/filament/*.json``. We extract that tree to a cache once
(keyed by the binary's mtime) and enumerate the filament presets a given machine is
compatible with — so the app can offer the user the real preset *names* ("Creality
Generic PETG") instead of a redundant free-text material/brand form. We never copy the
presets into the repo; they're read from whatever OrcaSlicer the user already has.
"""

from __future__ import annotations

import glob
import json
import os
import subprocess
from pathlib import Path

from .orca import resolve_bin

_CACHE_ROOT = Path(
    os.environ.get("AGENT_CAD_ORCA_CACHE", os.path.expanduser("~/.cache/agent-cad/orca-profiles"))
)
_MATERIALS = ("PLA-CF", "PA-CF", "PETG", "PLA", "ABS", "ASA", "TPU", "PA", "PC", "PVA", "HIPS")


def _first(v: object) -> object:
    """OrcaSlicer stores many scalars as 1-element arrays."""
    return v[0] if isinstance(v, list) and v else v


def _infer_material(name: str) -> str | None:
    """Best-effort material from a preset name when ``filament_type`` is inherited/unset."""
    up = name.upper()
    for m in _MATERIALS:
        if m in up:
            return m
    return None


def resources_profiles_dir(bin_path: str | None = None) -> Path | None:
    """The OrcaSlicer ``resources/profiles`` dir, extracted from the AppImage + cached.

    Cached under ``~/.cache/agent-cad/orca-profiles/<bin>-<mtime>/`` so the (one-time,
    multi-second) AppImage extraction only happens when the slicer changes. Returns
    ``None`` when no slicer is installed (the caller degrades to custom-only filaments).
    """
    b = resolve_bin(bin_path)
    if not b:
        return None
    bp = Path(b)
    # A macOS .app / extracted install: profiles sit beside the binary under resources/.
    for rel in ("../../Resources/profiles", "../resources/profiles", "resources/profiles"):
        cand = (bp.parent / rel).resolve()
        if cand.is_dir():
            return cand
    # Linux AppImage: extract resources/profiles once into the cache.
    try:
        key = f"{bp.stem}-{int(bp.stat().st_mtime)}"
    except OSError:
        return None
    cache = _CACHE_ROOT / key
    profiles = cache / "squashfs-root" / "resources" / "profiles"
    if profiles.is_dir():
        return profiles
    cache.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            [str(bp), "--appimage-extract", "resources/profiles/*"],
            cwd=str(cache),
            capture_output=True,
            timeout=300,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return profiles if profiles.is_dir() else None


def list_filament_presets(machine_name: str, *, bin_path: str | None = None) -> list[dict]:
    """Selectable filament presets whose ``compatible_printers`` names ``machine_name``.

    ``machine_name`` is the OrcaSlicer machine identity (e.g. our committed
    ``"Creality Ender-5 S1 0.4 nozzle"``). Returns ``[{id, name, vendor, material}]``
    sorted by name, de-duped, abstract base presets excluded. Empty when no slicer.
    """
    root = resources_profiles_dir(bin_path)
    if root is None:
        return []
    out: dict[str, dict] = {}
    for f in glob.glob(str(root / "*" / "filament" / "*.json")):
        try:
            d = json.loads(Path(f).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if str(d.get("instantiation")).lower() != "true":  # skip abstract base presets
            continue
        if machine_name not in (d.get("compatible_printers") or []):
            continue
        name = d.get("name")
        if not name or name in out:
            continue
        out[name] = {
            "id": name,  # the preset name is unique within OrcaSlicer — use it as the id
            "name": name,
            "vendor": Path(f).parts[-3],
            "material": _first(d.get("filament_type")) or _infer_material(name),
        }
    return sorted(out.values(), key=lambda p: p["name"])


def _filament_index(root: Path) -> dict[str, Path]:
    """name → leaf path for EVERY filament preset (incl. abstract ``inherits`` bases)."""
    idx: dict[str, Path] = {}
    for f in glob.glob(str(root / "*" / "filament" / "*.json")):
        try:
            name = json.loads(Path(f).read_text(encoding="utf-8")).get("name")
        except (OSError, ValueError):
            continue
        if name and name not in idx:
            idx[name] = Path(f)
    return idx


# Only the ``inherits`` pointer is dropped from a flattened preset (so the CLI won't try, and
# fail, to re-resolve it). We KEEP ``from`` ("system" — OrcaSlicer rejects a filament without
# a supported source) and ``compatible_printers`` (rejected if it can't see the machine).
_PLUMBING = ("inherits",)


def resolve_filament_preset(
    preset_id: str, machine_name: str, *, bin_path: str | None = None
) -> dict | None:
    """A fully-FLATTENED filament config for ``preset_id``.

    OrcaSlicer does NOT resolve a preset's ``inherits`` chain when the file is loaded loosely
    via ``--load-filaments`` (it falls back to defaults — e.g. PETG's 255°C silently becomes
    200°C). So we walk the chain ourselves (leaf → base → …), merge with the child winning,
    and strip the preset plumbing — yielding a self-contained filament safe to pass to the CLI.
    Returns ``None`` when the preset isn't found / isn't compatible with ``machine_name``.
    """
    root = resources_profiles_dir(bin_path)
    if root is None:
        return None
    idx = _filament_index(root)
    leaf = idx.get(preset_id)
    if leaf is None:
        return None
    try:
        leaf_data = json.loads(leaf.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if machine_name not in (leaf_data.get("compatible_printers") or []):
        return None
    chain: list[dict] = []
    name: str | None = preset_id
    seen: set[str] = set()
    while name and name in idx and name not in seen:
        seen.add(name)
        try:
            d = json.loads(idx[name].read_text(encoding="utf-8"))
        except (OSError, ValueError):
            break
        chain.append(d)
        nxt = d.get("inherits")
        name = nxt if isinstance(nxt, str) else None
    merged: dict = {}
    for d in reversed(chain):  # base first → child keys overwrite
        merged.update(d)
    for k in _PLUMBING:
        merged.pop(k, None)
    merged["type"] = "filament"
    merged["name"] = preset_id
    return merged


# OrcaSlicer machine identity for a registered printer. v1 ships one printer; this is the
# seam where a future printer record carries its own OrcaSlicer machine name.
_MACHINE_NAMES = {"ender5s1": "Creality Ender-5 S1 0.4 nozzle"}


def machine_name_for(printer_id: str) -> str | None:
    return _MACHINE_NAMES.get(printer_id)
