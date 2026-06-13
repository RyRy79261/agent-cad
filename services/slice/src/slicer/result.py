"""Shared result type for slicing operations (JSON-serialisable for the API/CLI)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class SliceResult:
    ok: bool
    slicer: str
    model_path: str
    command: list[str] = field(default_factory=list)
    gcode_path: str | None = None
    archive_path: str | None = None
    info: dict[str, Any] = field(default_factory=dict)
    stdout: str = ""
    stderr: str = ""
    error: str | None = None
    returncode: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "slicer": self.slicer,
            "model_path": self.model_path,
            "command": self.command,
            "gcode_path": self.gcode_path,
            "archive_path": self.archive_path,
            "info": self.info,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "error": self.error,
            "returncode": self.returncode,
        }
