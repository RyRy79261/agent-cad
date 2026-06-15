"""FastAPI app fronting the agent-cad services.

Design: heavy work (CAD build, slicing, scan cleanup) is enqueued as a background
job and polled via ``/jobs/{id}``; cheap, instant work (g-code extraction, listing
parts) is synchronous. The OpenAPI schema this exposes is the contract the typed
TS SDK in ``packages/types`` is generated from.

Run locally::

    uv run --package apiserver uvicorn api.main:app --reload --port 8420
    # or: agent-cad-api
"""

from __future__ import annotations

import os
import re
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
    GenerateRequest,
    JobRef,
    OrcaSliceRequest,
    PrusaSliceRequest,
    ScanCleanRequest,
    SliceSettings,
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

# The Next.js control panel runs on a different port in dev. Origins are
# env-configurable (AGENT_CAD_CORS_ORIGINS, comma-separated) so the web can run on a
# non-default port (e.g. when :3420 is taken) without a code change; defaults cover :3420.
_cors_origins = [o.strip() for o in os.environ.get("AGENT_CAD_CORS_ORIGINS", "").split(",") if o.strip()] or [
    "http://localhost:3420",
    "http://127.0.0.1:3420",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
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


def _submit_slice(name: str, settings: SliceSettings | None = None) -> JobRef:
    """Slice ``<builds>/<name>/<name>.stl`` for the Ender 5 S1 and serve the g-code.

    Shared by template / generated / sample slicing — all write the same layout. The
    ``settings`` body overrides the committed profile for this slice: typed fields via
    :func:`slice_overrides`, plus arbitrary ``raw`` key→value pairs via
    :func:`route_raw_overrides` (raw wins on conflict). The job result echoes the applied
    settings + any override warnings and adds ``gcode_url`` (under ``/artifacts``); it
    fails gracefully (``ok: false``) without OrcaSlicer.
    """
    settings = settings or SliceSettings()
    typed = settings.model_dump(exclude={"raw"}, exclude_none=True)
    raw = settings.raw or {}
    part_dir = BUILDS_DIR / name
    stl = part_dir / f"{name}.stl"
    if not stl.exists():
        raise HTTPException(status_code=409, detail=f"build {name!r} first — no STL at {stl}")
    archive = part_dir / f"{name}.gcode.3mf"

    def work() -> dict:
        from slicer import orca
        from slicer.profiles import (
            ender5s1_profiles,
            merge_overrides,
            profile_with_overrides,
            route_raw_overrides,
            slice_overrides,
        )

        profiles = ender5s1_profiles()
        paths = dict(profiles)  # machine / process / filament -> Path
        raw_overrides, warnings = route_raw_overrides(raw)
        merged = merge_overrides(slice_overrides(**typed), raw_overrides)  # raw wins
        for kind, override in merged.items():
            paths[kind] = profile_with_overrides(
                override, part_dir / f"_{kind}_override.json", base=profiles[kind]
            )
        result = orca.slice_model(
            stl,
            machine=paths["machine"],
            process=paths["process"],
            filaments=[paths["filament"]],
            output=archive,
            extract=True,
        ).to_dict()
        result["settings"] = typed
        result["raw_overrides"] = raw
        result["override_warnings"] = warnings
        gpath = result.get("gcode_path")
        if result.get("ok") and gpath:
            result["gcode_url"] = f"/artifacts/{name}/{Path(gpath).name}"
        return result

    job = jobs.submit("slice.ender5s1", work)
    return JobRef(job_id=job.id, kind=job.kind, status=job.status.value)


@app.post("/templates/{name}/slice", response_model=JobRef, tags=["slice"])
def slice_template(name: str, settings: SliceSettings | None = None) -> JobRef:
    """Slice a built template's STL (build it first via ``POST /templates/{name}/build``)."""
    return _submit_slice(name, settings)


# --------------------------------------------------------------------------- #
# Generate (free-text → CAD)                                                   #
# --------------------------------------------------------------------------- #
def _slugify(text: str, *, fallback: str = "part") -> str:
    """A filesystem/URL-safe short slug from a free-text prompt."""
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    slug = "-".join(slug.split("-")[:6])  # keep it short and readable
    return slug[:48] or fallback


@app.post("/generate", response_model=JobRef, tags=["cad"])
def generate(req: GenerateRequest) -> JobRef:
    """Generate a part from a free-text prompt, build + verify it, serve artifacts.

    Runs the pluggable LLM generator (default driver ``claude-code`` — the local
    ``claude`` CLI on the user's plan) → ``model.py`` → build with printability
    checks → capped self-correction. The job result is the ``GenerateResult`` plus
    ``name`` and ``artifact_urls`` (under ``/artifacts``) for the browser viewer;
    slice it afterwards with ``POST /generated/{name}/slice``.
    """
    from cad.generate import generate_part

    # Deterministic slug by design: re-generating the same prompt updates the part in
    # place rather than accumulating junk dirs (single-user local tool). Pass an explicit
    # `name` to keep distinct variants apart; the slug is sanitised by `_slugify`.
    name = _slugify(req.name or req.prompt)
    dest = BUILDS_DIR / name

    def work() -> dict:
        result = generate_part(
            req.prompt,
            dest,
            driver=req.driver,
            model=req.model,
            max_rounds=req.max_rounds,
            verify=True,
            name=name,
            out_dir=str(dest),
        )
        payload = result.to_dict()
        payload["name"] = name
        artifacts = (result.build or {}).get("artifacts", {}) if result.build else {}
        payload["artifact_urls"] = {
            fmt: f"/artifacts/{name}/{Path(path).name}" for fmt, path in artifacts.items()
        }
        return payload

    job = jobs.submit("cad.generate", work)
    return JobRef(job_id=job.id, kind=job.kind, status=job.status.value)


@app.post("/generated/{name}/slice", response_model=JobRef, tags=["slice"])
def slice_generated(name: str, settings: SliceSettings | None = None) -> JobRef:
    """Slice a generated part's STL for the Ender 5 S1 (generate it first)."""
    return _submit_slice(name, settings)


# --------------------------------------------------------------------------- #
# Sample models (committed reference STLs — e.g. the 3DBenchy torture test)    #
# --------------------------------------------------------------------------- #
def _samples() -> dict[str, dict]:
    """Registry of committed, ready-to-slice reference models (imported STLs)."""
    from api.projects import projects_root

    root = projects_root()
    return {
        "benchy": {
            "stl": root / "benchy" / "3DBenchy.stl",
            "description": "3DBenchy — the classic 3D-printing torture-test boat (CC0 / public domain). "
            "Print it after the calibration cube reads true.",
        },
    }


def _sample_available(path: Path) -> bool:
    """A sample is usable only if its STL is the real file — not a missing path or an
    unfetched Git-LFS pointer (an 11 MB STL is committed via LFS; a clone/CI without
    ``lfs: true`` leaves a ~130-byte pointer that trimesh can't load)."""
    try:
        with path.open("rb") as fh:
            return not fh.read(64).startswith(b"version https://git-lfs.github.com/spec/")
    except OSError:
        return False  # missing / unreadable


@app.get("/samples", tags=["cad"])
def samples() -> list[dict]:
    """Committed reference models that can be staged and sliced (no build step)."""
    return [
        {"name": n, "description": s["description"], "available": _sample_available(s["stl"])}
        for n, s in _samples().items()
    ]


@app.post("/samples/{name}/stage", response_model=JobRef, tags=["cad"])
def stage_sample(name: str) -> JobRef:
    """Copy a sample STL into the served builds dir + report bbox / bed fit.

    Mirrors a template build (so the web viewer can render it and then slice via
    ``POST /samples/{name}/slice``), but the geometry is an imported STL, not built.
    """
    sample = _samples().get(name)
    if sample is None:
        raise HTTPException(status_code=404, detail=f"unknown sample {name!r}")
    src = sample["stl"]
    if not _sample_available(src):
        raise HTTPException(
            status_code=409,
            detail=f"sample {name!r} STL missing or an unfetched Git-LFS pointer at {src}",
        )
    out_dir = BUILDS_DIR / name

    def work() -> dict:
        import shutil

        import trimesh
        from cad.printer import fits

        out_dir.mkdir(parents=True, exist_ok=True)
        dst = out_dir / f"{name}.stl"
        shutil.copyfile(src, dst)
        mesh = trimesh.load(dst, force="mesh")
        ext = [float(v) for v in mesh.extents]
        fit = fits({"x": ext[0], "y": ext[1], "z": ext[2]})
        return {
            "ok": True,
            "name": name,
            "metadata": {
                "bounding_box_mm": {"x": round(ext[0], 2), "y": round(ext[1], 2), "z": round(ext[2], 2)},
                "fits_build_volume": fit.fits,
                "build_volume_mm": fit.build_volume_mm,
            },
            "artifact_urls": {"stl": f"/artifacts/{name}/{name}.stl"},
        }

    job = jobs.submit("cad.stage_sample", work)
    return JobRef(job_id=job.id, kind=job.kind, status=job.status.value)


@app.post("/samples/{name}/slice", response_model=JobRef, tags=["slice"])
def slice_sample(name: str, settings: SliceSettings | None = None) -> JobRef:
    """Slice a staged sample's STL for the Ender 5 S1 (stage it first)."""
    return _submit_slice(name, settings)


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

    uvicorn.run("api.main:app", host="127.0.0.1", port=8420, reload=False)


__all__ = ["app", "run"]
