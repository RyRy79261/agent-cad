"""FastAPI app fronting the agent-cad services.

Design: heavy work (CAD build, slicing, scan cleanup) is enqueued as a background
job and polled via ``/jobs/{id}``; cheap, instant work (g-code extraction, listing
parts) is synchronous. The OpenAPI schema this exposes is the contract the typed
TS SDK in ``packages/types`` is generated from.

Run locally::

    uv run --package apiserver uvicorn api.main:app --reload --port 8000
    # or: agent-cad-api
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.jobs import JobStore
from api.projects import get_part, list_parts
from api.schemas import (
    BuildRequest,
    ExtractRequest,
    JobRef,
    OrcaSliceRequest,
    PrusaSliceRequest,
    ScanCleanRequest,
)

jobs = JobStore()

# Where API-triggered builds write their artifacts. Served read-only over HTTP at
# /artifacts so the web viewer can fetch STL/3MF/SVG directly in the browser.
BUILDS_DIR = Path(os.environ.get("AGENT_CAD_BUILDS_DIR", ".agent-cad-builds")).resolve()
BUILDS_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN201, ARG001
    yield
    jobs.shutdown()


app = FastAPI(
    title="agent-cad API",
    version="0.0.0",
    description="Local control-plane for the code-to-CAD & scan-to-mesh pipeline.",
    lifespan=lifespan,
)

# The Next.js control panel runs on a different port in dev.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve built geometry so the browser viewer can load it (read-only).
app.mount("/artifacts", StaticFiles(directory=str(BUILDS_DIR)), name="artifacts")


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}


# --------------------------------------------------------------------------- #
# CAD                                                                          #
# --------------------------------------------------------------------------- #
@app.post("/cad/build", response_model=JobRef, tags=["cad"])
def cad_build(req: BuildRequest) -> JobRef:
    from cad.runner import build_model

    def work() -> dict:
        return build_model(
            model_path=req.model_path,
            params=req.params,
            out_dir=req.out_dir,
            name=req.name,
            formats=tuple(req.formats),
            verify=req.verify,
        ).to_dict()

    job = jobs.submit("cad.build", work)
    return JobRef(job_id=job.id, kind=job.kind, status=job.status.value)


@app.get("/templates", tags=["cad"])
def templates() -> list[dict]:
    """The known-good template library (box / plate / bracket / standoff)."""
    from cad.templates import list_templates

    return [{"name": t.name, "description": t.description} for t in list_templates()]


@app.post("/templates/{name}/build", response_model=JobRef, tags=["cad"])
def build_template(name: str) -> JobRef:
    """Build a template into the served artifacts dir (with printability checks).

    The job result adds ``artifact_urls`` — browser-loadable paths under
    ``/artifacts`` — so the web viewer can render the STL directly.
    """
    from cad.runner import build_model
    from cad.templates import get_template

    try:
        template = get_template(name)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    out_dir = BUILDS_DIR / name

    def work() -> dict:
        result = build_model(
            model_path=str(template.path),
            out_dir=str(out_dir),
            name=name,
            verify=True,
        ).to_dict()
        result["artifact_urls"] = {
            fmt: f"/artifacts/{name}/{name}.{fmt}" for fmt in result.get("artifacts", {})
        }
        return result

    job = jobs.submit("cad.build_template", work)
    return JobRef(job_id=job.id, kind=job.kind, status=job.status.value)


# --------------------------------------------------------------------------- #
# Slice                                                                        #
# --------------------------------------------------------------------------- #
@app.post("/slice/orca", response_model=JobRef, tags=["slice"])
def slice_orca(req: OrcaSliceRequest) -> JobRef:
    from slicer import orca

    def work() -> dict:
        return orca.slice_model(
            req.model,
            machine=req.machine,
            process=req.process,
            filaments=req.filaments,
            output=req.output,
            extract=req.extract,
            extra_args=req.extra_args,
        ).to_dict()

    job = jobs.submit("slice.orca", work)
    return JobRef(job_id=job.id, kind=job.kind, status=job.status.value)


@app.post("/slice/prusa", response_model=JobRef, tags=["slice"])
def slice_prusa(req: PrusaSliceRequest) -> JobRef:
    from slicer import prusa

    def work() -> dict:
        return prusa.slice_model(
            req.model,
            configs=req.configs,
            output=req.output,
            repair=req.repair,
            extra_args=req.extra_args,
        ).to_dict()

    job = jobs.submit("slice.prusa", work)
    return JobRef(job_id=job.id, kind=job.kind, status=job.status.value)


@app.post("/slice/extract", tags=["slice"])
def slice_extract(req: ExtractRequest) -> dict:
    """Synchronous: pulling g-code out of an archive is instant."""
    from slicer.extract import extract_gcode, summarize

    try:
        gcode_path = extract_gcode(req.archive, out_path=req.out, plate=req.plate)
    except (FileNotFoundError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"gcode_path": str(gcode_path), "info": summarize(req.archive)}


# --------------------------------------------------------------------------- #
# Scan                                                                         #
# --------------------------------------------------------------------------- #
@app.post("/scan/clean", response_model=JobRef, tags=["scan"])
def scan_clean(req: ScanCleanRequest) -> JobRef:
    from scanner.pipeline import clean_mesh

    def work() -> dict:
        return clean_mesh(
            req.input_path,
            output_path=req.output_path,
            keep_largest=req.keep_largest,
            fill_holes=req.fill_holes,
            fix_normals=req.fix_normals,
            target_faces=req.target_faces,
            recenter=req.recenter,
        ).to_dict()

    job = jobs.submit("scan.clean", work)
    return JobRef(job_id=job.id, kind=job.kind, status=job.status.value)


# --------------------------------------------------------------------------- #
# Jobs                                                                         #
# --------------------------------------------------------------------------- #
@app.get("/jobs", tags=["jobs"])
def list_jobs() -> list[dict]:
    return [job.to_dict() for job in jobs.list()]


@app.get("/jobs/{job_id}", tags=["jobs"])
def get_job(job_id: str) -> dict:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"job {job_id} not found")
    return job.to_dict()


# --------------------------------------------------------------------------- #
# Parts (projects/ design data)                                               #
# --------------------------------------------------------------------------- #
@app.get("/parts", tags=["parts"])
def parts() -> list[dict]:
    return list_parts()


@app.get("/parts/{name}", tags=["parts"])
def part(name: str) -> dict:
    found = get_part(name)
    if found is None:
        raise HTTPException(status_code=404, detail=f"part {name!r} not found")
    return found


def run() -> None:
    """Console-script entry point (`agent-cad-api`)."""
    import uvicorn

    uvicorn.run("api.main:app", host="127.0.0.1", port=8000, reload=False)


__all__ = ["app", "run"]
