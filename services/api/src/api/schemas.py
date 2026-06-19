"""Pydantic request/response models.

These are the contract the typed TS SDK (`packages/types`) mirrors via the
generated OpenAPI spec — keep field names in sync with the frontend.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


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

    x: float = Field(..., gt=0)
    y: float = Field(..., gt=0)
    z: float = Field(..., gt=0)


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
    color: str | None = None  # a spool label (not an OrcaSlicer setting) — e.g. "Black"
    base_preset: str | None = None  # OrcaSlicer filament preset name this is based on
    settings: SliceSettings = Field(default_factory=SliceSettings)
    default_settings: SliceSettings = Field(default_factory=SliceSettings)


class FilamentPreset(BaseModel):
    """A selectable OrcaSlicer filament preset (read from the local install, not redistributed)."""

    id: str  # the preset name (unique within OrcaSlicer)
    name: str
    vendor: str
    material: str | None = None


class FirmwareCapabilities(BaseModel):
    """What the machine's firmware can actually do.

    Load-bearing: the app gates calibrations/settings on these so it never offers
    something the firmware would silently ignore (e.g. ``M900 K`` Pressure Advance on a
    stock Creality Marlin that wasn't built with ``LIN_ADVANCE``). Defaults match a
    stock Ender 5 S1 (everything off).
    """

    name: str = "Marlin (stock)"
    linear_advance: bool = False  # M900 K — Pressure Advance. Needs LIN_ADVANCE firmware.
    input_shaping: bool = False  # M593 — ringing/fast-tower. Needs input-shaper firmware.
    arc_moves: bool = False  # G2/G3 arc fitting — needs ARC_SUPPORT firmware.


class Printer(BaseModel):
    """A registered machine + its filament profiles (the net-new registry record).

    Replaces the hardcoded ``ENDER_5_S1`` constant. ``nozzle_diameter_mm`` and
    ``firmware`` are net-new fields the frozen constant lacks; ``firmware`` is now a
    capability block (was a plain display string — legacy string records are coerced).
    """

    id: str
    name: str
    kind: str = "FDM"
    build_volume: BuildVolume
    nozzle_diameter_mm: float = Field(default=0.4, gt=0)
    firmware: FirmwareCapabilities = Field(default_factory=FirmwareCapabilities)
    bed_margin_mm: float = Field(default=5.0, ge=0)
    default: bool = False
    filaments: list[FilamentProfile] = Field(default_factory=list)

    @field_validator("firmware", mode="before")
    @classmethod
    def _coerce_firmware(cls, v: object) -> object:
        # Back-compat: legacy registry records stored firmware as a plain name string.
        if isinstance(v, str):
            return {"name": v}
        return v


class Settings(BaseModel):
    """App settings persisted to ``~/.agent-cad/settings.json``.

    ``active_model`` is the model id/alias passed to the LLM driver (``--model``), and
    ``effort`` the reasoning level (``--effort``). v1 uses the ``claude-code`` driver
    (the user's Claude subscription — no metered API key). Passing both explicitly also
    stops generation from inheriting a stray ``CLAUDE_EFFORT`` from the launching shell.
    """

    active_model: str = "claude-opus-4-8"
    effort: Literal["low", "medium", "high", "xhigh", "max"] = "high"
    default_printer_id: str | None = None
    storage_location: str | None = None
    theme: str = "system"
    auto_clear_days: int = Field(default=0, ge=0)
    user_name: str | None = None


class SettingsField(BaseModel):
    """One control in the schema-driven settings UI (§3a).

    ``key`` is the real ``SliceSettings`` field name (the contract); ``label`` is
    cosmetic. ``min``/``max``/``options`` are DERIVED from ``SliceSettings``; ``step`` is
    a presentation hint. ``scope`` is the profile bucket (routing); ``binding`` is which
    screen renders it (not the same as scope).
    """

    key: str
    label: str
    help: str | None = None
    input_type: Literal["slider", "number", "percent", "select", "toggle", "text"]
    scope: Literal["process", "machine", "filament", "raw"]
    binding: Literal["per-slice", "per-filament", "per-printer"]
    group: str
    unit: str | None = None
    default: Any | None = None
    min: float | None = None
    max: float | None = None
    step: float | None = None
    options: list[str] | None = None
    advanced: bool = False
    depends_on: dict[str, Any] | None = None  # e.g. {"field": "support", "equals": true}


class SettingsGroup(BaseModel):
    id: str
    label: str
    default_expanded: bool = True


class SettingsDescriptor(BaseModel):
    """Per printer (+ filament) descriptor the UI iterates to render settings controls."""

    printer_id: str
    printer_name: str
    filament_id: str | None = None
    schema_version: int = 1
    groups: list[SettingsGroup]
    fields: list[SettingsField]


class ArtifactRef(BaseModel):
    """An artifact attached to a chat turn (lives in chats/<id>/artifacts/)."""

    kind: str  # generated | template | sample | import | gcode
    name: str  # filename in the chat's artifacts dir
    url: str   # /chats/<id>/artifacts/<name>
    fmt: str | None = None  # stl | gcode | step | 3mf | svg
    bbox: dict[str, float] | None = None
    fits_build_volume: bool | None = None
    slice_info: dict[str, Any] | None = None


class Message(BaseModel):
    role: str  # user | assistant | system
    content: str
    ts: float = 0.0
    quick_replies: list[str] | None = None
    artifact_refs: list[ArtifactRef] = Field(default_factory=list)
    # Assistant-turn telemetry: token usage (input/output/cache) + wall-clock duration.
    usage: dict[str, int] | None = None
    duration_ms: float | None = None


class Chat(BaseModel):
    id: str
    title: str
    created_at: float
    updated_at: float
    status: str = "new"  # new | generating | model-ready | slicing | ready-to-print
    printer_id: str | None = None
    filament_id: str | None = None
    current_stl: str | None = None  # filename of the slice target in artifacts/
    messages: list[Message] = Field(default_factory=list)


class ChatCreate(BaseModel):
    title: str | None = None
    prompt: str | None = None  # optional first user message


class ChatMessageIn(BaseModel):
    role: str = "user"
    content: str = Field(..., min_length=1)


class ChatGenerateIn(BaseModel):
    prompt: str = Field(..., min_length=3)


class ChatSliceIn(BaseModel):
    filament_id: str | None = None
    settings: SliceSettings | None = None


class ResetIn(BaseModel):
    confirm: bool = False


class ChatInterviewIn(BaseModel):
    prompt: str = Field(..., min_length=1)


class ChatRefineIn(BaseModel):
    instruction: str = Field(..., min_length=1)


class CalibrateIn(BaseModel):
    target: Literal["cube", "benchy"]
    printer_id: str | None = None
    filament_id: str | None = None
    settings: SliceSettings | None = None


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
