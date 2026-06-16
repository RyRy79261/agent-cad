"""Schema-driven settings descriptor builder (§3a, FOUND-13).

Builds a ``SettingsDescriptor`` for a printer (+ optional filament) that the UI iterates
to render controls. The contract:

- ``key`` is the real ``SliceSettings`` field name; ``label`` is cosmetic (engineer-owned).
- ``min``/``max`` are **derived** from ``SliceSettings`` ``ge``/``le`` (a test asserts parity);
  ``options`` are **derived** from the field's ``Literal`` args; ``step`` is a hand-authored
  presentation hint with no backend source.
- ``scope`` is the OrcaSlicer profile bucket (routing); ``binding`` is which screen renders it.

v1 builds the base descriptor (single Ender 5 S1). The per-printer overlay (different
jerk/speed ranges, omitting fields) is deferred until a second printer ships; ``jerk`` is
demoted to ``advanced`` rather than building omission logic.
"""

from __future__ import annotations

import typing
from typing import TYPE_CHECKING, Any

from annotated_types import Ge, Le

from api.schemas import (
    FilamentProfile,
    Printer,
    SettingsDescriptor,
    SettingsField,
    SettingsGroup,
    SliceSettings,
)

if TYPE_CHECKING:
    from pydantic.fields import FieldInfo

# Section order + identity (mirrors the design's panel groups). Presentation only.
_GROUPS: list[tuple[str, str, bool]] = [
    ("quality", "Quality", True),
    ("infill", "Infill", True),
    ("shells", "Shells", False),
    ("temps", "Temperatures", False),
    ("supports", "Supports", True),
    ("advanced", "Advanced", False),
]

# key -> curated presentation meta. min/max + options are DERIVED from SliceSettings;
# step/label/inputType/scope/binding/group/default are authored here (the design is a
# visual guide — labels are cosmetic, the key is the contract).
_FIELDS: list[dict[str, Any]] = [
    {
        "key": "layer_height",
        "label": "Layer height",
        "input": "select",
        "scope": "process",
        "binding": "per-slice",
        "group": "quality",
        "unit": "mm",
        "step": 0.04,
        "default": 0.2,
        "options": ["0.12", "0.16", "0.2", "0.24", "0.28"],
    },
    {
        "key": "wall_loops",
        "label": "Walls",
        "input": "number",
        "scope": "process",
        "binding": "per-slice",
        "group": "quality",
        "unit": "loops",
        "step": 1,
        "default": 2,
    },
    {
        "key": "wall_speed",
        "label": "Print speed",
        "input": "slider",
        "scope": "process",
        "binding": "per-slice",
        "group": "quality",
        "unit": "mm/s",
        "step": 1,
        "default": 25,
        "help": "Outer/inner wall feedrate.",
    },
    {
        "key": "infill_density",
        "label": "Infill",
        "input": "percent",
        "scope": "process",
        "binding": "per-slice",
        "group": "infill",
        "unit": "%",
        "step": 5,
        "default": 15,
        "help": "Value is a bare int 0-100; the % is display only.",
    },
    {
        "key": "infill_pattern",
        "label": "Infill pattern",
        "input": "select",
        "scope": "process",
        "binding": "per-slice",
        "group": "infill",
        "default": "crosshatch",
    },
    {
        "key": "top_layers",
        "label": "Top solid layers",
        "input": "number",
        "scope": "process",
        "binding": "per-slice",
        "group": "shells",
        "unit": "layers",
        "step": 1,
        "default": 7,
    },
    {
        "key": "bottom_layers",
        "label": "Bottom solid layers",
        "input": "number",
        "scope": "process",
        "binding": "per-slice",
        "group": "shells",
        "unit": "layers",
        "step": 1,
        "default": 5,
    },
    {
        "key": "nozzle_temp",
        "label": "Nozzle temperature",
        "input": "number",
        "scope": "filament",
        "binding": "per-filament",
        "group": "temps",
        "unit": "°C",
        "step": 5,
        "default": 220,
    },
    {
        "key": "bed_temp",
        "label": "Bed temperature",
        "input": "number",
        "scope": "filament",
        "binding": "per-filament",
        "group": "temps",
        "unit": "°C",
        "step": 5,
        "default": 60,
    },
    {
        "key": "flow",
        "label": "Flow rate",
        "input": "number",
        "scope": "filament",
        "binding": "per-filament",
        "group": "temps",
        "unit": "×",
        "step": 0.01,
        "default": 0.95,
        "help": "Filament flow ratio; the #1 firmware-free lever.",
    },
    {
        "key": "retraction_length",
        "label": "Retraction",
        "input": "number",
        "scope": "machine",
        "binding": "per-slice",
        "group": "advanced",
        "unit": "mm",
        "step": 0.1,
        "default": 1.0,
    },
    {
        "key": "support",
        "label": "Supports",
        "input": "toggle",
        "scope": "process",
        "binding": "per-slice",
        "group": "supports",
        "default": False,
    },
    {
        "key": "support_threshold",
        "label": "Support overhang threshold",
        "input": "slider",
        "scope": "process",
        "binding": "per-slice",
        "group": "supports",
        "unit": "°",
        "step": 1,
        "default": 30,
        "depends_on": {"field": "support", "equals": True},
    },
    {
        "key": "brim_width",
        "label": "Brim width",
        "input": "number",
        "scope": "process",
        "binding": "per-slice",
        "group": "advanced",
        "unit": "mm",
        "step": 0.5,
        "default": 0,
    },
    {
        "key": "seam_position",
        "label": "Seam position",
        "input": "select",
        "scope": "process",
        "binding": "per-slice",
        "group": "advanced",
        "default": "aligned",
    },
    {
        "key": "jerk",
        "label": "Max jerk",
        "input": "number",
        "scope": "machine",
        "binding": "per-printer",
        "group": "advanced",
        "unit": "mm/s",
        "step": 1,
        "default": 25,
        "advanced": True,
        "help": "Near-inert at low wall speeds — a guardrail, not a tuning lever.",
    },
]


def _bounds(field: FieldInfo) -> tuple[float | None, float | None]:
    """Pull (ge, le) numeric bounds out of a Pydantic field's metadata."""
    lo: float | None = None
    hi: float | None = None
    for m in field.metadata:
        if isinstance(m, Ge):
            lo = m.ge  # type: ignore[assignment]
        elif isinstance(m, Le):
            hi = m.le  # type: ignore[assignment]
    return lo, hi


def _literal_options(annotation: Any) -> list[str] | None:
    """Derive select options from a ``Literal[...]`` (possibly wrapped in Optional)."""
    if typing.get_origin(annotation) is typing.Literal:
        return [str(x) for x in typing.get_args(annotation)]
    for arg in typing.get_args(annotation):
        if typing.get_origin(arg) is typing.Literal:
            return [str(x) for x in typing.get_args(arg)]
    return None


def build_descriptor(printer: Printer, filament: FilamentProfile | None = None) -> SettingsDescriptor:
    """Build the settings descriptor for ``printer`` (+ ``filament`` for its saved defaults)."""
    model_fields = SliceSettings.model_fields
    saved = filament.settings.model_dump() if filament is not None else {}

    fields: list[SettingsField] = []
    for meta in _FIELDS:
        key = meta["key"]
        info = model_fields[key]
        lo, hi = _bounds(info)
        options = meta.get("options") or _literal_options(info.annotation)
        # default: the filament's saved value if set, else the curated baseline.
        default = saved.get(key)
        if default is None:
            default = meta.get("default")
        fields.append(
            SettingsField(
                key=key,
                label=meta["label"],
                help=meta.get("help"),
                input_type=meta["input"],
                scope=meta["scope"],
                binding=meta["binding"],
                group=meta["group"],
                unit=meta.get("unit"),
                default=default,
                min=lo,
                max=hi,
                step=meta.get("step"),
                options=options,
                advanced=meta.get("advanced", False),
                depends_on=meta.get("depends_on"),
            )
        )

    groups = [SettingsGroup(id=g, label=label, default_expanded=exp) for g, label, exp in _GROUPS]
    return SettingsDescriptor(
        printer_id=printer.id,
        printer_name=printer.name,
        filament_id=(filament.id if filament is not None else None),
        groups=groups,
        fields=fields,
    )
