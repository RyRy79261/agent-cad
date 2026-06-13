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

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

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
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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
        ).to_dict()

    job = jobs.submit("cad.build", work)
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
