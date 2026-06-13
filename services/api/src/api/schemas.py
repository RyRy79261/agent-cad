"""Pydantic request/response models.

These are the contract the typed TS SDK (`packages/types`) mirrors via the
generated OpenAPI spec — keep field names in sync with the frontend.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class BuildRequest(BaseModel):
    model_path: str = Field(..., description="Path to the parametric model .py")
    params: dict[str, Any] = Field(default_factory=dict)
    out_dir: str | None = None
    name: str | None = None
    formats: list[str] = Field(default_factory=lambda: ["stl", "step", "3mf", "svg"])


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
