"""Read-only view over the ``projects/`` directory (the Git-tracked design data).

Each part is a directory: ``model.py`` + ``params.json`` + ``print.json`` +
``artifacts/``. The source of truth is text; artifacts are reproducible output.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def projects_root() -> Path:
    """Resolve the projects directory (env override > repo default)."""
    env = os.environ.get("AGENT_CAD_PROJECTS_DIR")
    if env:
        return Path(env)
    # services/api/src/api/projects.py -> repo root is parents[4]
    return Path(__file__).resolve().parents[4] / "projects"


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def describe_part(part_dir: Path) -> dict[str, Any]:
    artifacts_dir = part_dir / "artifacts"
    artifacts = (
        sorted(p.name for p in artifacts_dir.iterdir() if p.is_file())
        if artifacts_dir.is_dir()
        else []
    )
    return {
        "name": part_dir.name,
        "path": str(part_dir),
        "has_model": (part_dir / "model.py").exists(),
        "params": _read_json(part_dir / "params.json"),
        "print": _read_json(part_dir / "print.json"),
        "artifacts": artifacts,
    }


def list_parts() -> list[dict[str, Any]]:
    root = projects_root()
    if not root.is_dir():
        return []
    return [
        describe_part(d)
        for d in sorted(root.iterdir())
        if d.is_dir() and not d.name.startswith(".")
    ]


def get_part(name: str) -> dict[str, Any] | None:
    part_dir = projects_root() / name
    return describe_part(part_dir) if part_dir.is_dir() else None
