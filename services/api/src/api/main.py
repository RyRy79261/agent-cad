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
import uuid
from collections.abc import Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api import storage as storage_mod
from api.chats import (
    append_message,
    create_chat,
    delete_chat,
    get_chat,
    list_chats,
    save_chat,
)
from api.descriptor import build_descriptor
from api.jobs import JobStore
from api.logging_setup import setup_logging
from api.projects import get_part, list_parts
from api.references import add_reference, reference_attachments, remove_reference
from api.registry import (
    default_printer,
    delete_printer,
    get_printer,
    list_printers,
    load_settings,
    remove_filament,
    save_printer,
    save_settings,
    seed_first_run,
    set_default_printer,
    slugify,
    upsert_filament,
)
from api.schemas import (
    ArtifactRef,
    BuildRequest,
    CalibrateIn,
    Chat,
    ChatCreate,
    ChatGenerateIn,
    ChatInterviewIn,
    ChatMessageIn,
    ChatRefineIn,
    ChatSliceIn,
    ExtractRequest,
    FilamentProfile,
    GenerateRequest,
    JobRef,
    OrcaSliceRequest,
    Printer,
    PrusaSliceRequest,
    ResetIn,
    ScanCleanRequest,
    Settings,
    SettingsDescriptor,
    SliceSettings,
)
from api.store import Store

store = Store()
setup_logging(store.root / "logs")  # rotating log file + stderr → debuggable failures
jobs = JobStore(store=store)  # durable: survives restart, recovers terminal results

# Where API-triggered builds write their artifacts. Served read-only over HTTP at
# /artifacts so the web viewer can fetch STL/3MF/SVG directly in the browser.
BUILDS_DIR = Path(os.environ.get("AGENT_CAD_BUILDS_DIR", ".agent-cad-builds")).resolve()
BUILDS_DIR.mkdir(parents=True, exist_ok=True)


def _sync_active_printer() -> None:
    """Point the build-volume fit check at the registry's default printer (FOUND-8)."""
    from cad.printer import BuildVolume, Printer, set_active_printer

    p = default_printer(store)
    if p is not None:
        set_active_printer(
            Printer(
                name=p.name,
                build_volume=BuildVolume(p.build_volume.x, p.build_volume.y, p.build_volume.z),
                bed_margin_mm=p.bed_margin_mm,
            )
        )


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN201, ARG001
    seed_first_run(store)  # create + seed ~/.agent-cad on first run (idempotent)
    _sync_active_printer()  # fit checks target the registry's default printer
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


@app.get("/settings", response_model=Settings, tags=["settings"])
def get_settings() -> Settings:
    """The app settings (seeded defaults when settings.json is absent)."""
    return load_settings(store)


@app.put("/settings", response_model=Settings, tags=["settings"])
def put_settings(settings: Settings) -> Settings:
    """Persist app settings atomically; out-of-range values are rejected (422)."""
    return save_settings(store, settings)


# --------------------------------------------------------------------------- #
# Storage & data management                                                   #
# --------------------------------------------------------------------------- #
@app.get("/storage/info", tags=["storage"])
def storage_info_ep() -> dict:
    return storage_mod.storage_info(store, app_version=app.version)


@app.get("/storage/usage", tags=["storage"])
def storage_usage_ep() -> dict:
    """Disk usage computed from the store (chats / models / slices / bytes)."""
    return storage_mod.usage(store)


@app.post("/storage/reveal", tags=["storage"])
def storage_reveal_ep() -> dict:
    """Best-effort 'open folder' on the storage root (xdg-open / open / wslview / explorer.exe)."""
    import shutil
    import subprocess

    root = str(store.root)
    for opener in ("wslview", "xdg-open", "open", "explorer.exe"):
        if shutil.which(opener):
            try:
                subprocess.Popen([opener, root])  # noqa: S603 - fixed openers, controlled path
                return {"ok": True, "opener": opener, "path": root}
            except OSError:
                continue
    return {"ok": False, "path": root}


@app.post("/storage/clear-artifacts", tags=["storage"])
def clear_artifacts_ep() -> dict:
    """Delete regenerable geometry/g-code (keeps model.py / chat.json sources)."""
    return {"bytes_freed": storage_mod.clear_artifacts(store)}


@app.post("/storage/clear-chats", tags=["storage"])
def clear_chats_ep() -> dict:
    return {"removed": storage_mod.clear_chats(store)}


@app.post("/storage/reset", tags=["storage"])
def storage_reset_ep(body: ResetIn) -> dict:
    """Danger: wipe the store and re-seed first-run state. Requires confirm=true."""
    if not body.confirm:
        raise HTTPException(status_code=400, detail="confirm required for reset")
    storage_mod.reset_store(store)
    _sync_active_printer()
    return {"ok": True}


@app.get(
    "/printers/{printer_id}/settings-descriptor",
    response_model=SettingsDescriptor,
    tags=["settings"],
)
def get_settings_descriptor(printer_id: str, filament: str | None = None) -> SettingsDescriptor:
    """The schema-driven settings descriptor for a printer (+ optional filament)."""
    printer = get_printer(store, printer_id)
    if printer is None:
        raise HTTPException(status_code=404, detail=f"Unknown printer: {printer_id}")
    fil = None
    if filament is not None:
        fil = next((f for f in printer.filaments if f.id == filament), None)
        if fil is None:
            raise HTTPException(status_code=404, detail=f"Unknown filament: {filament}")
    return build_descriptor(printer, fil)


# --------------------------------------------------------------------------- #
# Printer + filament registry (the net-new multi-printer registry)            #
# --------------------------------------------------------------------------- #
@app.get("/printers", response_model=list[Printer], tags=["printers"])
def list_printers_ep() -> list[Printer]:
    return list_printers(store)


@app.post("/printers", response_model=Printer, tags=["printers"])
def create_printer_ep(printer: Printer) -> Printer:
    """Create a printer (id slugified from name when blank)."""
    if not printer.id:
        printer.id = slugify(printer.name)
    save_printer(store, printer)
    if printer.default:
        set_default_printer(store, printer.id)
    _sync_active_printer()
    result = get_printer(store, printer.id)
    assert result is not None
    return result


@app.get("/printers/{printer_id}", response_model=Printer, tags=["printers"])
def get_printer_ep(printer_id: str) -> Printer:
    printer = get_printer(store, printer_id)
    if printer is None:
        raise HTTPException(status_code=404, detail=f"Unknown printer: {printer_id}")
    return printer


@app.put("/printers/{printer_id}", response_model=Printer, tags=["printers"])
def update_printer_ep(printer_id: str, printer: Printer) -> Printer:
    if get_printer(store, printer_id) is None:
        raise HTTPException(status_code=404, detail=f"Unknown printer: {printer_id}")
    printer.id = printer_id  # the path is authoritative
    save_printer(store, printer)
    if printer.default:
        set_default_printer(store, printer_id)
    _sync_active_printer()
    result = get_printer(store, printer_id)
    assert result is not None
    return result


@app.delete("/printers/{printer_id}", tags=["printers"])
def delete_printer_ep(printer_id: str) -> dict[str, bool]:
    try:
        delete_printer(store, printer_id)
    except ValueError as exc:  # last printer
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    _sync_active_printer()
    return {"ok": True}


@app.post("/printers/{printer_id}/filaments", response_model=Printer, tags=["printers"])
def add_filament_ep(printer_id: str, filament: FilamentProfile) -> Printer:
    printer = upsert_filament(store, printer_id, filament)
    if printer is None:
        raise HTTPException(status_code=404, detail=f"Unknown printer: {printer_id}")
    return printer


@app.put("/printers/{printer_id}/filaments/{filament_id}", response_model=Printer, tags=["printers"])
def update_filament_ep(printer_id: str, filament_id: str, filament: FilamentProfile) -> Printer:
    filament.id = filament_id  # the path is authoritative
    printer = upsert_filament(store, printer_id, filament)
    if printer is None:
        raise HTTPException(status_code=404, detail=f"Unknown printer: {printer_id}")
    return printer


@app.delete("/printers/{printer_id}/filaments/{filament_id}", response_model=Printer, tags=["printers"])
def delete_filament_ep(printer_id: str, filament_id: str) -> Printer:
    printer = remove_filament(store, printer_id, filament_id)
    if printer is None:
        raise HTTPException(status_code=404, detail=f"Unknown printer: {printer_id}")
    return printer


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


def _slice_stl(
    stl: Path,
    out_dir: Path,
    url_prefix: str,
    settings: SliceSettings | None = None,
    *,
    chat_id: str | None = None,
) -> JobRef:
    """Slice an STL for the Ender 5 S1 into ``out_dir``, serving the g-code under ``url_prefix``.

    The shared slice core (template / generated / sample / chat all use it). ``settings``
    overrides the committed profile: typed fields via :func:`slice_overrides`, plus arbitrary
    ``raw`` pairs via :func:`route_raw_overrides` (raw wins). The result echoes the applied
    settings + warnings, adds ``gcode_url`` (``{url_prefix}/<file>``), and fills
    ``layer_count`` from the extracted g-code when slice_info lacked it (API-5). When
    ``chat_id`` is set, the chat is updated on completion (status + an assistant turn with the
    g-code ref). Fails gracefully (``ok: false``) without OrcaSlicer.
    """
    if not stl.exists():
        raise HTTPException(status_code=409, detail=f"no STL to slice at {stl}")
    resolved = settings or SliceSettings()

    def work() -> dict:
        result = _run_slice_inline(stl, out_dir, url_prefix, resolved)
        if chat_id is not None:
            _update_chat_after_slice(chat_id, result, result.get("gcode_path"))
        return result

    job = jobs.submit("slice.ender5s1", work, chat_id=chat_id)
    return JobRef(job_id=job.id, kind=job.kind, status=job.status.value)


def _run_slice_inline(stl: Path, out_dir: Path, url_prefix: str, settings: SliceSettings) -> dict:
    """The slice computation itself (no job, no chat side-effects) — returns the result dict.

    Reused by the job-based slice routes (:func:`_slice_stl`) and by ``/calibrate`` (which
    builds/stages a reference object then slices it in one job). Adds ``gcode_url`` under
    ``url_prefix`` and fills ``layer_count`` from the extracted g-code (API-5).
    """
    from slicer import orca
    from slicer.extract import count_gcode_layers
    from slicer.profiles import (
        ender5s1_profiles,
        merge_overrides,
        profile_with_overrides,
        route_raw_overrides,
        slice_overrides,
    )

    # `checkpoints` are post-slice g-code edits, not OrcaSlicer keys — keep them out of the overrides.
    typed = settings.model_dump(exclude={"raw", "checkpoints"}, exclude_none=True)
    raw = settings.raw or {}
    archive = out_dir / f"{stl.stem}.gcode.3mf"
    profiles = ender5s1_profiles()
    paths = dict(profiles)  # machine / process / filament -> Path
    raw_overrides, warnings = route_raw_overrides(raw)
    merged = merge_overrides(slice_overrides(**typed), raw_overrides)  # raw wins
    for kind, override in merged.items():
        paths[kind] = profile_with_overrides(
            override, out_dir / f"_{kind}_override.json", base=profiles[kind]
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
        if settings.checkpoints:
            from slicer.postprocess import apply_checkpoints

            cps = [c.model_dump() for c in settings.checkpoints]
            result["checkpoints"] = {"applied": apply_checkpoints(gpath, cps), "requested": cps}
        result["gcode_url"] = f"{url_prefix}/{Path(gpath).name}"
        layers = count_gcode_layers(gpath)
        if layers is not None:
            for plate in (result.get("info") or {}).get("plates", []):
                if plate.get("layer_count") is None:
                    plate["layer_count"] = layers
    return result


def _submit_slice(name: str, settings: SliceSettings | None = None) -> JobRef:
    """Slice ``<builds>/<name>/<name>.stl`` (template / generated / sample path)."""
    part_dir = BUILDS_DIR / name
    stl = part_dir / f"{name}.stl"
    if not stl.exists():
        raise HTTPException(status_code=409, detail=f"build {name!r} first — no STL at {stl}")
    return _slice_stl(stl, part_dir, f"/artifacts/{name}", settings)


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
# Chats (the local-first chat workspace; artifacts namespaced per chat)       #
# --------------------------------------------------------------------------- #
def _narrate_build(payload: dict) -> str:
    """A short, templated (no-LLM) summary of a build result for the chat thread."""
    if not payload.get("ok"):
        err = payload.get("error") or ""
        low = err.lower()
        if any(h in low for h in ("connection closed", "try again", "overloaded", "connection error", "timed out")):
            return (
                "The model service dropped the connection mid-generation — this happens on long, "
                "high-effort runs. I retried a few times without luck. Please try again, or switch to "
                "Sonnet · Medium in the model dropdown for a faster, more reliable response."
            )
        return "I couldn't produce a printable model — " + (err or "have a look at the attempts.")
    build = payload.get("build") or {}
    meta = build.get("metadata") or {}
    bbox = meta.get("bounding_box_mm")
    verif = build.get("verification") or {}
    # Lead with the model's own plain-language reply (what it made / changed); fall back
    # to a generic opener. Then a compact status so the dims don't dominate the message.
    summary = (payload.get("summary") or "").strip()
    bits = [summary] if summary else ["Here's your model."]
    status: list[str] = []
    if bbox:
        status.append(f"{bbox['x']:.0f}×{bbox['y']:.0f}×{bbox['z']:.0f} mm")
    if meta.get("fits_build_volume") is True:
        status.append("fits the bed")
    elif meta.get("fits_build_volume") is False:
        status.append("⚠ doesn't fit the bed as-is")
    if verif.get("printable") is True:
        status.append("printable")
    if status:
        bits.append(f"({' · '.join(status)})")
    return " ".join(bits)


def _narrate_slice(result: dict) -> str:
    if not result.get("ok"):
        err = (result.get("error") or "").lower()
        if not err or "orca" in err or "not found" in err:
            return "Slicing failed — is OrcaSlicer installed? See the Printer setup page."
        return f"Slicing failed: {result.get('error')}"
    plate = ((result.get("info") or {}).get("plates") or [{}])[0]
    bits = ["Sliced and ready to print."]
    if t := plate.get("print_time_s"):
        bits.append(f"~{int(t // 3600)}h {int((t % 3600) // 60)}m,")
    if plate.get("length_m"):
        bits.append(f"{plate['length_m']:.1f} m /")
    if plate.get("weight_g"):
        bits.append(f"{plate['weight_g']:.1f} g filament,")
    if plate.get("layer_count"):
        bits.append(f"{plate['layer_count']} layers.")
    return " ".join(bits)


def _update_chat_after_slice(chat_id: str, result: dict, gpath: object) -> None:
    chat = get_chat(store, chat_id)
    if chat is None:
        return
    refs: list[ArtifactRef] = []
    if result.get("ok") and gpath:
        gname = Path(str(gpath)).name
        chat.status = "ready-to-print"
        refs = [
            ArtifactRef(
                kind="gcode",
                name=gname,
                fmt="gcode",
                url=f"/chats/{chat_id}/artifacts/{gname}",
                slice_info=result.get("info"),
            )
        ]
    else:
        chat.status = "model-ready"
    save_chat(store, chat)
    append_message(store, chat_id, "assistant", _narrate_slice(result), artifact_refs=refs)


def _resolve_filament_settings(chat: Chat, body: ChatSliceIn | None) -> SliceSettings:
    """The SliceSettings to slice with: explicit override > the chat's filament > default."""
    if body is not None and body.settings is not None:
        return body.settings
    fil_id = (body.filament_id if body else None) or chat.filament_id
    printer = get_printer(store, chat.printer_id) if chat.printer_id else default_printer(store)
    if printer is not None:
        fil = None
        if fil_id:
            fil = next((f for f in printer.filaments if f.id == fil_id), None)
        if fil is None and printer.filaments:
            fil = printer.filaments[0]
        if fil is not None:
            return fil.settings
    return SliceSettings()


def _attach_build_to_chat(chat_id: str, result_obj: object, duration_ms: float | None = None) -> dict:
    """Record a generate/refine build's artifacts on the chat + post a narration turn."""
    payload = result_obj.to_dict()  # type: ignore[attr-defined]
    build = getattr(result_obj, "build", None) or {}
    artifacts = (build.get("artifacts") or {}) if build else {}
    refs: list[ArtifactRef] = []
    stl_name: str | None = None
    for fmt, path in artifacts.items():
        fname = Path(path).name
        refs.append(
            ArtifactRef(kind="generated", name=fname, fmt=fmt, url=f"/chats/{chat_id}/artifacts/{fname}")
        )
        if fmt == "stl":
            stl_name = fname
    payload["artifact_urls"] = {
        fmt: f"/chats/{chat_id}/artifacts/{Path(p).name}" for fmt, p in artifacts.items()
    }
    c = get_chat(store, chat_id)
    if c is not None:
        if stl_name:
            c.current_stl = stl_name
        c.status = "model-ready" if payload.get("ok") else "new"
        save_chat(store, c)
        append_message(
            store, chat_id, "assistant", _narrate_build(payload), artifact_refs=refs,
            usage=payload.get("usage"), duration_ms=duration_ms,
        )
    return payload


@app.get("/chats", response_model=list[Chat], tags=["chats"])
def list_chats_ep() -> list[Chat]:
    return list_chats(store)


@app.post("/chats", response_model=Chat, tags=["chats"])
def create_chat_ep(body: ChatCreate) -> Chat:
    title = body.title or (body.prompt[:48] if body.prompt else None)
    chat = create_chat(store, title)
    if body.prompt:
        chat = append_message(store, chat.id, "user", body.prompt) or chat
    return chat


@app.get("/chats/{chat_id}", response_model=Chat, tags=["chats"])
def get_chat_ep(chat_id: str) -> Chat:
    chat = get_chat(store, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail=f"Unknown chat: {chat_id}")
    return chat


@app.delete("/chats/{chat_id}", tags=["chats"])
def delete_chat_ep(chat_id: str) -> dict[str, bool]:
    delete_chat(store, chat_id)
    return {"ok": True}


@app.post("/chats/{chat_id}/messages", response_model=Chat, tags=["chats"])
def append_message_ep(chat_id: str, body: ChatMessageIn) -> Chat:
    chat = append_message(store, chat_id, body.role, body.content)
    if chat is None:
        raise HTTPException(status_code=404, detail=f"Unknown chat: {chat_id}")
    return chat


@app.get("/chats/{chat_id}/artifacts/{filename}", tags=["chats"])
def get_chat_artifact(chat_id: str, filename: str) -> FileResponse:
    """Serve a chat's artifact (STL / g-code / …) read-only, guarding path traversal."""
    art_dir = store.artifacts_dir(chat_id).resolve()
    path = (art_dir / filename).resolve()
    if art_dir not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="artifact not found")
    return FileResponse(str(path))


@app.post("/chats/{chat_id}/references", response_model=Chat, tags=["chats"])
async def add_chat_reference(chat_id: str, file: Annotated[UploadFile, File()]) -> Chat:
    """Pin an image or STL reference to the chat — applied to every generate/refine."""
    if get_chat(store, chat_id) is None:
        raise HTTPException(status_code=404, detail=f"Unknown chat: {chat_id}")
    data = b""
    max_bytes = 50 * 1024 * 1024  # 50 MB cap
    while chunk := await file.read(1024 * 1024):
        data += chunk
        if len(data) > max_bytes:
            raise HTTPException(status_code=413, detail="reference too large (50 MB max)")
    ref = add_reference(store, chat_id, file.filename or "reference", data)
    if ref is None:
        raise HTTPException(status_code=400, detail="unsupported reference (use an image or a .stl file)")
    result = get_chat(store, chat_id)
    assert result is not None
    return result


@app.delete("/chats/{chat_id}/references/{ref_id}", response_model=Chat, tags=["chats"])
def delete_chat_reference(chat_id: str, ref_id: str) -> Chat:
    chat = remove_reference(store, chat_id, ref_id)
    if chat is None:
        raise HTTPException(status_code=404, detail=f"Unknown chat: {chat_id}")
    return chat


@app.get("/chats/{chat_id}/references/{filename}", tags=["chats"])
def get_chat_reference_file(chat_id: str, filename: str) -> FileResponse:
    """Serve a reference image/render read-only, guarding path traversal."""
    rdir = (store.chat_dir(chat_id) / "references").resolve()
    path = (rdir / filename).resolve()
    if rdir not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="reference not found")
    return FileResponse(str(path))


@app.post("/chats/{chat_id}/generate", response_model=JobRef, tags=["chats"])
def chat_generate(chat_id: str, body: ChatGenerateIn) -> JobRef:
    """Generate a model into the chat's namespace (claude-code driver — Claude subscription)."""
    chat = get_chat(store, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail=f"Unknown chat: {chat_id}")
    append_message(store, chat_id, "user", body.prompt)
    chat = get_chat(store, chat_id)
    assert chat is not None
    chat.status = "generating"
    save_chat(store, chat)
    art_dir = store.artifacts_dir(chat_id)
    _settings = load_settings(store)
    sel_model, sel_effort = _settings.active_model, _settings.effort
    ref_paths, ref_note = reference_attachments(store, chat)  # pinned image/STL references
    prompt = body.prompt + ref_note

    # claude-code driver (the user's Claude subscription, no metered API key); model + effort
    # come from settings and are passed EXPLICITLY so generation doesn't inherit a stray
    # CLAUDE_EFFORT from the launching shell.
    def work(report: Callable[[str], None]) -> dict:
        return _generate_build(
            chat_id, art_dir, prompt, model=sel_model, effort=sel_effort,
            attachments=ref_paths, on_progress=report,
        )

    job = jobs.submit("cad.generate", work, chat_id=chat_id)
    return JobRef(job_id=job.id, kind=job.kind, status=job.status.value)


@app.post("/chats/{chat_id}/interview", response_model=JobRef, tags=["chats"])
def chat_interview(chat_id: str, body: ChatInterviewIn) -> JobRef:
    """Clarify-before-generate: one LLM turn that asks a question or signals ready (cap 6)."""
    chat = get_chat(store, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail=f"Unknown chat: {chat_id}")
    append_message(store, chat_id, "user", body.prompt)
    chat = get_chat(store, chat_id)
    assert chat is not None
    rounds = sum(1 for m in chat.messages if m.role == "assistant" and m.quick_replies is not None)
    brief = "\n".join(m.content for m in chat.messages if m.role == "user")
    art_dir = store.artifacts_dir(chat_id)
    _settings = load_settings(store)
    sel_model, sel_effort = _settings.active_model, _settings.effort
    ref_paths, ref_note = reference_attachments(store, chat)  # references attached pre-generation

    def work(report: Callable[[str], None]) -> dict:
        import time

        from api.interview import interview_turn

        # claude-code (subscription); model + effort from settings, passed explicitly.
        # Reference renders are passed so the interview can SEE an STL and engage about it.
        report("Reading your description")
        t0 = time.monotonic()
        result = interview_turn(
            brief, first_turn=(rounds == 0), attachments=ref_paths, ref_note=ref_note,
            model=sel_model, effort=sel_effort,
        )
        dur_ms = (time.monotonic() - t0) * 1000
        interp = result.get("interpretation")
        has_q = result.get("status") == "question"
        # The first turn ALWAYS pauses so the user can review the agent's interpretation of the
        # shape before it asks/builds; later turns pause only for a real question (capped at 6).
        pause = (has_q or (rounds == 0 and bool(interp))) and rounds < 6
        if pause:
            question = result.get("question") or "Shall I build it as described, or change anything?"
            suggestions = result.get("suggestions") or ([] if has_q else ["Build it as described"])
            body = f"{interp}\n\n{question}" if interp else question
            append_message(
                store, chat_id, "assistant", body,
                quick_replies=suggestions,
                usage=result.get("usage"), duration_ms=dur_ms,
            )
            c2 = get_chat(store, chat_id)
            if c2 is not None:
                c2.status = "interviewing"
                save_chat(store, c2)
            return {"ok": True, "ready": False, "question": question, "suggestions": suggestions}
        # Ready → generate INLINE in this same job. The user's brief is already on the thread
        # (appended above), so we don't re-post it — this is what fixed the duplicate message.
        c = get_chat(store, chat_id)
        if c is not None:
            c.status = "generating"
            save_chat(store, c)
        return _generate_build(chat_id, art_dir, brief + ref_note, model=sel_model, effort=sel_effort,
                               attachments=ref_paths, on_progress=report)

    job = jobs.submit("chat.interview", work, chat_id=chat_id)
    return JobRef(job_id=job.id, kind=job.kind, status=job.status.value)


def _generate_build(
    chat_id: str, art_dir: Path, prompt: str, *, model: str | None, effort: str | None,
    attachments: list[str], on_progress: Callable[[str], None] | None = None,
) -> dict:
    """Generate a fresh model into the chat and post the result. The user's message must already
    be on the thread — this does NOT append it (avoids the interview→generate double-post)."""
    import time

    from cad.generate import generate_part

    t0 = time.monotonic()
    result = generate_part(
        prompt, art_dir, model=model, effort=effort, attachments=attachments, max_rounds=2,
        verify=True, name="model", out_dir=str(art_dir), on_progress=on_progress,
    )
    return _attach_build_to_chat(chat_id, result, duration_ms=(time.monotonic() - t0) * 1000)


def _current_model_summary(art_dir: Path) -> str:
    """The current model's `# SUMMARY:` line (what exists now) — context for the respond classifier."""
    model_py = art_dir / "model.py"
    if not model_py.exists():
        return ""
    from cad.generate.base import extract_summary

    return extract_summary(model_py.read_text(encoding="utf-8")) or ""


def _refine_build(
    chat_id: str,
    art_dir: Path,
    instruction: str,
    *,
    model: str | None,
    effort: str | None,
    attachments: list[str],
    ref_note: str,
    on_progress: Callable[[str], None] | None = None,
) -> dict:
    """Surgically edit the chat's current model.py and post the result. Snapshots the prior
    version (artifacts/history/model.v<N>.py) so nothing is lost."""
    import shutil
    import time
    import uuid

    from cad.generate import generate_part

    t0 = time.monotonic()
    prior_py = art_dir / "model.py"
    hist = art_dir / "history"
    hist.mkdir(exist_ok=True)
    # Keep the readable v<N> ordering, but suffix a short unique id so two concurrent refines
    # on the same chat can't compute the same N and overwrite each other's snapshot.
    n = len(list(hist.glob("model.v*.py"))) + 1
    shutil.copyfile(prior_py, hist / f"model.v{n}-{uuid.uuid4().hex[:6]}.py")
    prior = prior_py.read_text(encoding="utf-8")
    augmented = (
        "You are EDITING an existing build123d part — this is a surgical edit, not a "
        "redesign. Here is its current `model.py`:\n\n"
        f"```python\n{prior.strip()}\n```\n\n"
        "Make EXACTLY this change, and nothing else:\n\n"
        f"{instruction.strip()}\n\n"
        "RULES (critical):\n"
        "- Preserve every OTHER feature, parameter, dimension and detail of the current model "
        "EXACTLY as-is. Do not remove, rename, resize, simplify, re-interpret, or 'improve' "
        "anything the request didn't explicitly ask to change.\n"
        "- Treat the request additively where possible: 'add a fence' means ADD a fence and "
        "leave the tray, brackets, fittings, holes and everything else untouched.\n"
        "- Keep the existing DEFAULTS / PARAMS; add new parameters ONLY for the new feature.\n"
        "- If the requested change is impossible or conflicts with the existing geometry, do "
        "NOT guess — keep the model as-is and explain the conflict in the `# SUMMARY:` line.\n"
        "Update the `# SUMMARY:` first line to say plainly what you changed (and confirm what "
        "you kept). Return the COMPLETE updated model.py." + ref_note
    )
    result = generate_part(
        augmented, art_dir, model=model, effort=effort, attachments=attachments, max_rounds=2,
        verify=True, name="model", out_dir=str(art_dir), on_progress=on_progress,
    )
    return _attach_build_to_chat(chat_id, result, duration_ms=(time.monotonic() - t0) * 1000)


@app.post("/chats/{chat_id}/respond", response_model=JobRef, tags=["chats"])
def chat_respond(chat_id: str, body: ChatRefineIn) -> JobRef:
    """A message on an existing model: the agent either TALKS BACK (answer/discuss/ask) or, when
    you clearly want a change, makes a surgical edit. Replaces 'every message regenerates'."""
    chat = get_chat(store, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail=f"Unknown chat: {chat_id}")
    art_dir = store.artifacts_dir(chat_id)
    if not (art_dir / "model.py").exists():
        raise HTTPException(status_code=409, detail="no model yet — generate one first")
    append_message(store, chat_id, "user", body.instruction)
    message = body.instruction
    summary = _current_model_summary(art_dir)
    _settings = load_settings(store)
    sel_model, sel_effort = _settings.active_model, _settings.effort
    ref_paths, ref_note = reference_attachments(store, chat)

    def work(report: Callable[[str], None]) -> dict:
        import time

        from api.interview import respond_turn

        report("Reading your message")
        t0 = time.monotonic()
        decision = respond_turn(message, summary, model=sel_model, effort=sel_effort)
        if decision.get("action") == "edit":
            # Mark generating so the UI shows the build state, then do the surgical edit.
            c = get_chat(store, chat_id)
            if c is not None:
                c.status = "generating"
                save_chat(store, c)
            return _refine_build(
                chat_id, art_dir, decision.get("instruction") or message,
                model=sel_model, effort=sel_effort, attachments=ref_paths, ref_note=ref_note,
                on_progress=report,
            )
        # Conversational turn — reply in words, no regeneration.
        append_message(
            store, chat_id, "assistant", decision.get("reply") or "…",
            usage=decision.get("usage"), duration_ms=(time.monotonic() - t0) * 1000,
        )
        return {"ok": True, "action": "chat"}

    job = jobs.submit("chat.respond", work, chat_id=chat_id)
    return JobRef(job_id=job.id, kind=job.kind, status=job.status.value)


@app.post("/chats/{chat_id}/refine", response_model=JobRef, tags=["chats"])
def chat_refine(chat_id: str, body: ChatRefineIn) -> JobRef:
    """Refine the chat's current model by editing its model.py (prior versions kept)."""
    chat = get_chat(store, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail=f"Unknown chat: {chat_id}")
    art_dir = store.artifacts_dir(chat_id)
    if not (art_dir / "model.py").exists():
        raise HTTPException(status_code=409, detail="nothing to refine — generate a model first")
    append_message(store, chat_id, "user", body.instruction)
    chat = get_chat(store, chat_id)
    assert chat is not None
    chat.status = "generating"
    save_chat(store, chat)
    instruction = body.instruction
    _settings = load_settings(store)
    sel_model, sel_effort = _settings.active_model, _settings.effort
    ref_paths, ref_note = reference_attachments(store, chat)  # pinned image/STL references

    def work(report: Callable[[str], None]) -> dict:
        return _refine_build(
            chat_id, art_dir, instruction, model=sel_model, effort=sel_effort,
            attachments=ref_paths, ref_note=ref_note, on_progress=report,
        )

    job = jobs.submit("cad.refine", work, chat_id=chat_id)
    return JobRef(job_id=job.id, kind=job.kind, status=job.status.value)


def _stl_bbox_fit(stl_path: Path) -> tuple[dict, bool]:
    """(bbox dict, fits_bed) for a produced model.stl."""
    import trimesh
    from cad.printer import fits

    mesh = trimesh.load(stl_path, force="mesh")
    ext = [float(v) for v in mesh.extents]
    fit = fits({"x": ext[0], "y": ext[1], "z": ext[2]})
    return {"x": round(ext[0], 2), "y": round(ext[1], 2), "z": round(ext[2], 2)}, fit.fits


@app.post("/chats/{chat_id}/imports/{import_id}/attach", response_model=Chat, tags=["chats"])
def attach_import(chat_id: str, import_id: str) -> Chat:
    """Attach an uploaded model into a chat. An **STL** becomes a (non-editable) mesh model; a
    **STEP/BREP** becomes an **editable** model — we scaffold a build123d wrapper that imports it,
    so the chat can modify the real geometry instead of doing a lossy rebuild."""
    import shutil

    from cad.imports import classify, scaffold_source

    chat = get_chat(store, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail=f"Unknown chat: {chat_id}")
    src = next(store.imports_dir.glob(f"{import_id}.*"), None)
    if src is None:
        raise HTTPException(status_code=404, detail=f"unknown import: {import_id}")
    art_dir = store.artifacts_dir(chat_id)
    art_dir.mkdir(parents=True, exist_ok=True)
    fmt = src.suffix.lower().lstrip(".")

    if classify(src.name) == "editable":
        from cad.runner import build_model

        ref_name = f"reference{src.suffix.lower()}"
        shutil.copyfile(src, art_dir / ref_name)
        (art_dir / "model.py").write_text(scaffold_source(ref_name), encoding="utf-8")
        result = build_model(art_dir / "model.py", {}, out_dir=art_dir, name="model", formats=("stl", "step"))
        chat = get_chat(store, chat_id)
        assert chat is not None
        if not result.ok or not (art_dir / "model.stl").exists():
            chat.status = "new"
            save_chat(store, chat)
            tail = (result.error or "could not read the file").strip().splitlines()[-1][:200]
            append_message(
                store, chat_id, "assistant",
                f"I couldn't open that {fmt.upper()} as an editable model — {tail}",
            )
            out = get_chat(store, chat_id)
            assert out is not None
            return out
        bbox, fits_bed = _stl_bbox_fit(art_dir / "model.stl")
        chat.current_stl = "model.stl"
        chat.status = "model-ready"
        save_chat(store, chat)
        fit_msg = "Fits the bed." if fits_bed else "⚠ Doesn't fit the bed as-is."
        ref = ArtifactRef(
            kind="import", name="model.stl", fmt="stl",
            url=f"/chats/{chat_id}/artifacts/model.stl", bbox=bbox, fits_build_volume=fits_bed,
        )
        append_message(
            store, chat_id, "assistant",
            f"Imported your **.{fmt}** as an editable model — {bbox['x']:.0f}×{bbox['y']:.0f}×{bbox['z']:.0f} mm. "
            f"{fit_msg} This is the real geometry (not a mesh), so just tell me what to add, cut, or resize "
            "and I'll edit the original design.",
            artifact_refs=[ref],
        )
        out = get_chat(store, chat_id)
        assert out is not None
        return out

    # Mesh (STL): viewable + printable, but no editable source.
    shutil.copyfile(src, art_dir / "model.stl")
    bbox, fits_bed = _stl_bbox_fit(art_dir / "model.stl")
    chat.current_stl = "model.stl"
    chat.status = "model-ready"
    save_chat(store, chat)
    fit_msg = "Fits the bed." if fits_bed else "⚠ Doesn't fit the bed as-is."
    ref = ArtifactRef(
        kind="import", name="model.stl", fmt="stl",
        url=f"/chats/{chat_id}/artifacts/model.stl", bbox=bbox, fits_build_volume=fits_bed,
    )
    append_message(
        store, chat_id, "assistant",
        f"Imported your **.{fmt}** — {bbox['x']:.0f}×{bbox['y']:.0f}×{bbox['z']:.0f} mm. {fit_msg} "
        "Heads up: an STL is a mesh, so I can show and slice it but can't *edit* it. To modify a design, "
        "import a **STEP (.step)** file instead and I can change the real geometry.",
        artifact_refs=[ref],
    )
    result = get_chat(store, chat_id)
    assert result is not None
    return result


@app.post("/chats/{chat_id}/slice", response_model=JobRef, tags=["chats"])
def chat_slice(chat_id: str, body: ChatSliceIn | None = None) -> JobRef:
    """Slice the chat's current model with a filament's settings, into the chat namespace."""
    chat = get_chat(store, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail=f"Unknown chat: {chat_id}")
    if not chat.current_stl:
        raise HTTPException(status_code=409, detail="no model to slice — generate or import one first")
    art_dir = store.artifacts_dir(chat_id)
    stl = art_dir / chat.current_stl
    settings = _resolve_filament_settings(chat, body)
    chat.status = "slicing"
    save_chat(store, chat)
    return _slice_stl(stl, art_dir, f"/chats/{chat_id}/artifacts", settings, chat_id=chat_id)


# --------------------------------------------------------------------------- #
# STL import + calibration test prints                                        #
# --------------------------------------------------------------------------- #
@app.post("/imports", tags=["imports"])
async def import_model(file: Annotated[UploadFile, File()]) -> dict:
    """Upload + validate a model, stored under ~/.agent-cad/imports/<id><ext>.

    **STL** (a mesh — view/print only) or **STEP/BREP** (editable B-rep geometry). Unsupported
    formats (``.f3d``, ``.iges``, …) are rejected with a pointer to export STEP."""
    from cad.imports import cad_bbox, classify, unsupported_reason
    from cad.printer import fits

    name = Path(file.filename or "import.stl").name
    ext = Path(name).suffix.lower()
    kind = classify(name)
    if kind == "unsupported":
        raise HTTPException(status_code=415, detail=unsupported_reason(name))

    store.imports_dir.mkdir(parents=True, exist_ok=True)
    import_id = uuid.uuid4().hex[:12]
    dst = store.imports_dir / f"{import_id}{ext}"
    max_bytes = 100 * 1024 * 1024  # 100 MB cap, streamed to disk (no full-payload in RAM)
    size, too_big = 0, False
    with dst.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > max_bytes:
                too_big = True
                break
            out.write(chunk)
    if too_big:
        dst.unlink(missing_ok=True)
        raise HTTPException(status_code=413, detail="file too large (max 100 MB)")

    if kind == "mesh":
        import trimesh

        try:
            mesh = trimesh.load(dst, force="mesh")
            extents = [float(v) for v in mesh.extents]
        except Exception as exc:  # noqa: BLE001 - reject anything trimesh can't load as a mesh
            dst.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail=f"not a loadable STL mesh: {exc}") from exc
        watertight = bool(mesh.is_watertight)
    else:  # editable STEP / BREP
        try:
            extents, _vol = cad_bbox(dst)
        except Exception as exc:  # noqa: BLE001 - reject anything build123d can't read
            dst.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail=f"could not read this CAD file: {exc}") from exc
        watertight = True
    if min(extents) <= 0:
        dst.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="degenerate geometry (zero extent)")
    fit = fits({"x": extents[0], "y": extents[1], "z": extents[2]})
    return {
        "id": import_id,
        "name": name,
        "bbox": {"x": round(extents[0], 2), "y": round(extents[1], 2), "z": round(extents[2], 2)},
        "fits_build_volume": fit.fits,
        "watertight": watertight,
        "editable": kind == "editable",
    }


@app.post("/calibrate", response_model=JobRef, tags=["calibration"])
def calibrate(body: CalibrateIn) -> JobRef:
    """Slice a reference object (cube or Benchy) at a filament's settings — the test print."""
    if body.printer_id:
        printer = get_printer(store, body.printer_id)
        if printer is None:
            raise HTTPException(status_code=404, detail=f"Unknown printer: {body.printer_id}")
    else:
        printer = default_printer(store)
    settings = body.settings
    if settings is None and printer is not None:
        if body.filament_id:
            fil = next((f for f in printer.filaments if f.id == body.filament_id), None)
            if fil is None:
                raise HTTPException(status_code=404, detail=f"Unknown filament: {body.filament_id}")
        else:
            fil = printer.filaments[0] if printer.filaments else None
        if fil is not None:
            settings = fil.settings
    resolved = settings or SliceSettings()
    target = body.target
    if target == "benchy" and not _sample_available(_samples()["benchy"]["stl"]):
        raise HTTPException(
            status_code=409, detail="Benchy STL unavailable (unfetched Git-LFS pointer)"
        )
    key = f"calibration-{(printer.id if printer else 'default')}-{body.filament_id or 'default'}-{target}"
    out_dir = BUILDS_DIR / key

    def work() -> dict:
        import shutil

        out_dir.mkdir(parents=True, exist_ok=True)
        if target == "cube":
            from cad.runner import build_model
            from cad.templates import get_template

            built = build_model(
                model_path=str(get_template("cube").path),
                out_dir=str(out_dir),
                name=key,
                verify=False,
            ).to_dict()
            if not built.get("ok"):
                return {"ok": False, "error": built.get("error") or "cube build failed", "target": target}
        else:
            shutil.copyfile(_samples()["benchy"]["stl"], out_dir / f"{key}.stl")
        result = _run_slice_inline(out_dir / f"{key}.stl", out_dir, f"/artifacts/{key}", resolved)
        result["target"] = target
        return result

    job = jobs.submit("calibrate", work)
    return JobRef(job_id=job.id, kind=job.kind, status=job.status.value)


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
