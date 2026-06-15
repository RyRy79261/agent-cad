"""On-disk store for the local-first Agent CAD app (``~/.agent-cad/``).

Single source of truth for where settings, the printer/filament registry, chats and
their artifacts, imported STLs, and job records live. All writes are **atomic**
(temp file in the target dir + ``os.replace``) so a crash mid-write never leaves a
half-written file — the prior contents stay intact.

Layout::

    ~/.agent-cad/
      settings.json
      printers/<printer-id>.json
      chats/<chat-id>/chat.json
      chats/<chat-id>/artifacts/
      imports/<id>.stl
      jobs.json

Root resolution: explicit ``root`` arg > ``$AGENT_CAD_HOME`` > ``~/.agent-cad``.
(A persisted ``settings.storage_location`` can later override the default — the caller
passes it in as ``root``.)
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

ENV_HOME = "AGENT_CAD_HOME"
_DEFAULT_DIRNAME = ".agent-cad"


def default_root() -> Path:
    """The store root: ``$AGENT_CAD_HOME`` if set, else ``~/.agent-cad``."""
    env = os.environ.get(ENV_HOME)
    if env:
        return Path(env).expanduser().resolve()
    return (Path.home() / _DEFAULT_DIRNAME).resolve()


class Store:
    """Filesystem-backed store rooted at ``~/.agent-cad`` (or an override)."""

    def __init__(self, root: Path | str | None = None) -> None:
        self.root = Path(root).expanduser().resolve() if root else default_root()

    # --- path helpers --------------------------------------------------- #
    @property
    def settings_path(self) -> Path:
        return self.root / "settings.json"

    @property
    def printers_dir(self) -> Path:
        return self.root / "printers"

    @property
    def chats_dir(self) -> Path:
        return self.root / "chats"

    @property
    def imports_dir(self) -> Path:
        return self.root / "imports"

    @property
    def jobs_path(self) -> Path:
        return self.root / "jobs.json"

    def printer_path(self, printer_id: str) -> Path:
        return self.printers_dir / f"{printer_id}.json"

    def chat_dir(self, chat_id: str) -> Path:
        return self.chats_dir / chat_id

    def chat_path(self, chat_id: str) -> Path:
        return self.chat_dir(chat_id) / "chat.json"

    def artifacts_dir(self, chat_id: str) -> Path:
        return self.chat_dir(chat_id) / "artifacts"

    # --- structure ------------------------------------------------------ #
    def ensure_dirs(self) -> None:
        """Create the top-level subdirectories (idempotent)."""
        for d in (self.root, self.printers_dir, self.chats_dir, self.imports_dir):
            d.mkdir(parents=True, exist_ok=True)

    def is_empty(self) -> bool:
        """True when the store has not been seeded yet (no ``settings.json``)."""
        return not self.settings_path.exists()

    # --- atomic IO ------------------------------------------------------ #
    def atomic_write_json(self, path: Path | str, data: Any) -> None:
        """Write ``data`` as JSON to ``path`` atomically.

        The temp file is created in the *target's directory* so ``os.replace`` is a
        same-filesystem rename and therefore atomic; an interrupted write leaves any
        prior file intact and never leaves a stray temp file behind.
        """
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(data, fh, indent=2, ensure_ascii=False)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def read_json(self, path: Path | str, default: Any = None) -> Any:
        """Read JSON from ``path``; return ``default`` if the file is absent."""
        path = Path(path)
        if not path.exists():
            return default
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)
