"""Centralised logging for the API.

Writes to a rotating file under the store's ``logs/`` dir **and** stderr, so a
generation / slice failure is debuggable after the fact — the full error (and
traceback for crashes) lands in ``~/.agent-cad/logs/agent-cad.log`` instead of only
a truncated string on the job record. Use :func:`get_logger` everywhere.
"""

from __future__ import annotations

import logging
import logging.handlers
import os
from pathlib import Path

_ROOT_NAME = "agent_cad"
_configured_path: Path | None = None


def setup_logging(log_dir: Path | str, *, level: int | None = None) -> Path:
    """Configure the ``agent_cad`` logger once; return the log file path.

    Level defaults to ``$AGENT_CAD_LOG_LEVEL`` (else INFO); tests set CRITICAL to keep
    background-job failure logs out of captured stderr.
    """
    global _configured_path
    if level is None:
        level = getattr(logging, os.environ.get("AGENT_CAD_LOG_LEVEL", "INFO").upper(), logging.INFO)
    log_dir = Path(log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "agent-cad.log"
    if _configured_path is not None:
        return _configured_path

    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    file_handler = logging.handlers.RotatingFileHandler(
        log_file, maxBytes=2_000_000, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(fmt)
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(fmt)

    root = logging.getLogger(_ROOT_NAME)
    root.setLevel(level)
    root.handlers = [file_handler, stream_handler]
    root.propagate = False
    _configured_path = log_file
    return log_file


def log_path() -> Path | None:
    """The active log file path (None until :func:`setup_logging` has run)."""
    return _configured_path


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"{_ROOT_NAME}.{name}")
