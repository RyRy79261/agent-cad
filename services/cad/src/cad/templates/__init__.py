"""Known-good parametric template library.

The single biggest reliability lever for LLM-driven CAD (research: even SOTA models
fail ~20% of from-scratch parametric tasks) is to start from a *known-good*
parametric part and adapt it, rather than generate geometry from nothing. Each
template here is a self-contained ``model.py`` (a ``build(params)`` function plus a
``PARAMS`` schema) that is tested to build and pass the spec-verification checks.

Workflow: ``cad templates`` to list, ``cad templates <name>`` to see its params
(``--source`` to print the model.py), ``cad new <name> projects/<part>`` to
scaffold a project from one.
"""

from __future__ import annotations

import importlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_DIR = Path(__file__).parent

# name -> one-line description. Kept here (not read from the modules) so listing is
# cheap and does NOT import build123d.
_TEMPLATES: dict[str, str] = {
    "cube": "Solid calibration cube — the canonical first print; measure it to check dimensional accuracy.",
    "box": "Hollow open-top box / enclosure with walls, floor, optional rounded corners and bolt holes.",
    "plate": "Flat mounting plate with rounded corners, top chamfer and a grid of bolt holes.",
    "bracket": "L-shaped angle bracket: horizontal + vertical flange, each with a row of bolt holes.",
    "standoff": "Round or hex standoff / spacer pillar with a central through bore.",
}


@dataclass(frozen=True)
class Template:
    """A reusable parametric part. Reads from ``cad/templates/<name>.py``."""

    name: str
    description: str
    path: Path

    def source(self) -> str:
        # Explicit UTF-8: template docstrings contain non-ASCII (×, —, °), which
        # an ascii-locale read would choke on independently of $PYTHONUTF8.
        return self.path.read_text(encoding="utf-8")

    def _module(self):
        return importlib.import_module(f"cad.templates.{self.name}")

    @property
    def defaults(self) -> dict[str, Any]:
        return dict(self._module().DEFAULTS)

    @property
    def param_schema(self) -> dict[str, Any]:
        return dict(getattr(self._module(), "PARAMS", {}))

    def build(self, params: dict[str, Any] | None = None):
        return self._module().build(params or {})


def list_templates() -> list[Template]:
    """All templates, sorted by name (cheap — no build123d import)."""
    return [Template(n, _TEMPLATES[n], _DIR / f"{n}.py") for n in sorted(_TEMPLATES)]


def get_template(name: str) -> Template:
    if name not in _TEMPLATES:
        available = ", ".join(sorted(_TEMPLATES))
        raise KeyError(f"unknown template {name!r}. Available: {available}")
    return Template(name, _TEMPLATES[name], _DIR / f"{name}.py")


__all__ = ["Template", "get_template", "list_templates"]
