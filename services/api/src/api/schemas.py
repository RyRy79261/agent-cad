"""Pydantic request/response models.

These are the contract the typed TS SDK (`packages/types`) mirrors via the
generated OpenAPI spec — keep field names in sync with the frontend.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class BuildRequest(BaseModel):
    model_path: str = Field(..., description="Path to the parametric model .py")
    params: dict[str, Any] = Field(default_factory=dict)
    out_dir: str | None = None
    name: str | None = None
    formats: list[str] = Field(default_factory=lambda: ["stl", "step", "3mf", "svg"])
    verify: bool = Field(default=False, description="Run printability checks on the result.")


class SliceSettings(BaseModel):
    """Per-slice overrides of the committed Ender 5 S1 profile — all optional.

    Unset fields keep the committed default. ``raw`` is the power-user escape hatch:
    arbitrary OrcaSlicer ``key: value`` pairs (see ``slicer.profiles.route_raw_overrides``).
    """

    infill_density: int | None = Field(default=None, ge=0, le=100)
    wall_speed: int | None = Field(default=None, ge=5, le=120)
    jerk: int | None = Field(default=None, ge=1, le=40)
    bed_temp: int | None = Field(default=None, ge=0, le=110)
    nozzle_temp: int | None = Field(default=None, ge=150, le=300)
    flow: float | None = Field(default=None, ge=0.8, le=1.2)
    layer_height: float | None = Field(default=None, ge=0.08, le=0.32)
    wall_loops: int | None = Field(default=None, ge=1, le=10)
    top_layers: int | None = Field(default=None, ge=0, le=20)
    bottom_layers: int | None = Field(default=None, ge=0, le=20)
    infill_pattern: Literal["crosshatch", "gyroid", "grid", "cubic"] | None = None
    seam_position: Literal["aligned", "nearest", "back", "random"] | None = None
    brim_width: float | None = Field(default=None, ge=0, le=20)
    support: bool | None = None
    support_threshold: int | None = Field(default=None, ge=0, le=90)
    retraction_length: float | None = Field(default=None, ge=0, le=6)
    raw: dict[str, str] | None = Field(
        default=None, description="Advanced: arbitrary OrcaSlicer key→value overrides."
    )


class BuildVolume(BaseModel):
    """Print envelope in millimetres (mirrors ``cad.printer.BuildVolume``)."""

    x: float
    y: float
    z: float


class FilamentProfile(BaseModel):
    """A material profile saved on a printer.

    ``settings`` are the saved per-filament slice values (the ``SliceSettings`` shape,
    so they map 1:1 onto ``slice_overrides()``); ``default_settings`` is the baseline
    the "Original" toggle compares/reverts to.
    """

    id: str
    name: str
    material: str  # PLA | PETG | ASA | ABS | TPU …
    brand: str | None = None
    color: str | None = None
    settings: SliceSettings = Field(default_factory=SliceSettings)
    default_settings: SliceSettings = Field(default_factory=SliceSettings)


class Printer(BaseModel):
    """A registered machine + its filament profiles (the net-new registry record).

    Replaces the hardcoded ``ENDER_5_S1`` constant. ``nozzle_diameter_mm`` and
    ``firmware`` are net-new display/registry fields the frozen constant lacks.
    """

    id: str
    name: str
    kind: str = "FDM"
    build_volume: BuildVolume
    nozzle_diameter_mm: float = 0.4
    firmware: str = "Marlin"  # editable display metadata; not load-bearing for slicing
    bed_margin_mm: float = 5.0
    default: bool = False
    filaments: list[FilamentProfile] = Field(default_factory=list)


class Settings(BaseModel):
    """App settings persisted to ``~/.agent-cad/settings.json``.

    No ``effort`` knob — generation runs at MAX effort (locked decision);
    ``active_model`` is the Anthropic model id.
    """

    active_model: str = "claude-opus-4-8"
    default_printer_id: str | None = None
    storage_location: str | None = None
    theme: str = "system"
    auto_clear_days: int = Field(default=0, ge=0)
    user_name: str | None = None


class GenerateRequest(BaseModel):
    """Free-text → generated build123d part."""

    prompt: str = Field(..., min_length=3, description="Natural-language part description.")
    name: str | None = Field(
        default=None, description="Project slug (derived from the prompt when omitted)."
    )
    driver: str | None = Field(
        default=None, description="LLM backend: claude-code (default) | anthropic | ollama."
    )
    model: str | None = Field(default=None, description="Model id/alias for the chosen driver.")
    max_rounds: int = Field(default=2, ge=0, le=4, description="Self-correction passes.")


class OrcaSliceRequest(BaseModel):
    model: str
    machine: str = Field(..., description="Printer profile JSON path.")
    process: str = Field(..., description="Print-settings JSON path.")
    filaments: list[str] = Field(..., min_length=1)
    output: str | None = None
    extract: bool = True
    extra_args: list[str] = Field(default_factory=list)


class PrusaSliceRequest(BaseModel):
    model: str
    configs: list[str] = Field(..., min_length=1)
    output: str | None = None
    repair: bool = False
    extra_args: list[str] = Field(default_factory=list)


class ExtractRequest(BaseModel):
    archive: str
    out: str | None = None
    plate: int = 1


class ScanCleanRequest(BaseModel):
    input_path: str
    output_path: str | None = None
    keep_largest: bool = True
    fill_holes: bool = True
    fix_normals: bool = True
    target_faces: int | None = None
    recenter: bool = True


class JobRef(BaseModel):
    """Returned immediately when a long job is enqueued."""

    job_id: str
    kind: str
    status: str
