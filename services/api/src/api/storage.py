"""Storage usage + data-management over the ``~/.agent-cad`` store (API-12).

Backs the Storage & Data settings screen: real disk usage computed from the store,
plus clear-artifacts (keep sources) / clear-chats / reset.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from api.registry import seed_first_run
from api.store import Store

# Regenerable geometry / g-code — safe to clear (sources like model.py/chat.json stay).
_REGENERABLE = {".stl", ".step", ".stp", ".3mf", ".gcode", ".svg", ".brep", ".obj", ".ply"}


def _dir_size(path: Path) -> int:
    total = 0
    if path.exists():
        for p in path.rglob("*"):
            if p.is_file():
                try:
                    total += p.stat().st_size
                except OSError:
                    pass
    return total


def storage_info(store: Store, app_version: str | None = None) -> dict[str, Any]:
    import os

    return {
        "storage_root": str(store.root),
        "writable": os.access(store.root, os.W_OK) if store.root.exists() else False,
        "app_version": app_version,
    }


def usage(store: Store) -> dict[str, Any]:
    chats_dir = store.chats_dir
    n_chats = (
        sum(1 for d in chats_dir.iterdir() if (d / "chat.json").exists())
        if chats_dir.exists()
        else 0
    )
    models = len(list(store.root.rglob("*.stl"))) if store.root.exists() else 0
    slices = (
        len([p for p in store.root.rglob("*.gcode") if not p.name.endswith(".gcode.3mf")])
        if store.root.exists()
        else 0
    )
    artifact_bytes = (
        sum(_dir_size(d / "artifacts") for d in chats_dir.iterdir()) if chats_dir.exists() else 0
    )
    return {
        "chats": n_chats,
        "models": models,
        "slices": slices,
        "bytes_used": _dir_size(store.root),
        "artifact_bytes": artifact_bytes,
    }


def clear_artifacts(store: Store) -> int:
    """Delete regenerable geometry/g-code under chats; keep sources. Returns bytes freed."""
    freed = 0
    if not store.chats_dir.exists():
        return 0
    for d in store.chats_dir.iterdir():
        art = d / "artifacts"
        if not art.exists():
            continue
        for p in art.iterdir():
            if p.is_file() and (p.suffix in _REGENERABLE or p.name.endswith(".gcode.3mf")):
                try:
                    freed += p.stat().st_size
                    p.unlink()
                except OSError:
                    pass
    return freed


def clear_chats(store: Store) -> int:
    """Delete all chats. Returns the number removed."""
    if not store.chats_dir.exists():
        return 0
    dirs = [d for d in store.chats_dir.iterdir() if d.is_dir()]
    for d in dirs:
        shutil.rmtree(d)  # let failures propagate rather than report a false count
    return len(dirs)


def reset_store(store: Store) -> None:
    """Wipe the store and re-seed it to first-run state (Ender 5 S1 + PLA)."""
    if store.root.exists():
        shutil.rmtree(store.root)  # surface failures rather than report a false {ok: true}
    seed_first_run(store)
