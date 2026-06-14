"""Integration tests for the FastAPI control-plane.

Covers the synchronous extract endpoint and the full async job lifecycle
(submit -> poll -> succeeded) using the scan service against a real temp mesh.
"""

from __future__ import annotations

import shutil
import time
import zipfile
from pathlib import Path

import trimesh
from api.main import BUILDS_DIR, _slugify, app
from fastapi.testclient import TestClient

client = TestClient(app)


def _poll(job_id: str, timeout: float = 30.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        body = client.get(f"/jobs/{job_id}").json()
        if body["status"] in ("succeeded", "failed"):
            return body
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not finish within {timeout}s")


def test_health() -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_scan_clean_job_lifecycle(tmp_path: Path) -> None:
    raw = tmp_path / "raw.stl"
    trimesh.creation.box(extents=(20.0, 10.0, 5.0)).export(raw)
    out = tmp_path / "clean.stl"

    resp = client.post(
        "/scan/clean", json={"input_path": str(raw), "output_path": str(out)}
    )
    assert resp.status_code == 200
    ref = resp.json()
    # The pool may pick the job up before the response serialises — both states
    # are valid "accepted" snapshots.
    assert ref["status"] in ("queued", "running")

    job = _poll(ref["job_id"])
    assert job["status"] == "succeeded", job
    assert job["result"]["ok"] is True
    assert out.exists()


def test_slice_extract_sync(tmp_path: Path) -> None:
    archive = tmp_path / "part.gcode.3mf"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("Metadata/plate_1.gcode", b"G28\n")
    resp = client.post("/slice/extract", json={"archive": str(archive)})
    assert resp.status_code == 200
    assert Path(resp.json()["gcode_path"]).read_bytes() == b"G28\n"


def test_extract_missing_plate_is_400(tmp_path: Path) -> None:
    archive = tmp_path / "empty.gcode.3mf"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("3D/3dmodel.model", b"<model/>")
    resp = client.post("/slice/extract", json={"archive": str(archive)})
    assert resp.status_code == 400


def test_unknown_job_is_404() -> None:
    assert client.get("/jobs/does-not-exist").status_code == 404


def test_parts_endpoint_returns_list() -> None:
    resp = client.get("/parts")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_templates_endpoint_lists_library() -> None:
    resp = client.get("/templates")
    assert resp.status_code == 200
    names = {t["name"] for t in resp.json()}
    assert {"box", "plate", "bracket", "standoff"} <= names


def test_build_template_serves_renderable_stl() -> None:
    # The full web vertical slice: build a template, then fetch its STL over HTTP.
    ref = client.post("/templates/box/build").json()
    assert ref["status"] in ("queued", "running")

    job = _poll(ref["job_id"])
    assert job["status"] == "succeeded", job
    result = job["result"]
    assert result["verification"]["printable"] is True
    stl_url = result["artifact_urls"]["stl"]
    assert stl_url == "/artifacts/box/box.stl"

    served = client.get(stl_url)
    assert served.status_code == 200
    assert len(served.content) > 0  # a real STL the browser viewer can load


def test_build_unknown_template_is_404() -> None:
    assert client.post("/templates/nope/build").status_code == 404


def test_slugify() -> None:
    assert _slugify("Hello, World!") == "hello-world"
    assert _slugify("  ") == "part"  # empty -> fallback
    # Long prompts are clipped to the first few words for a readable dir name.
    assert _slugify("a really long part description with many words here") == "a-really-long-part-description-with"


def test_generate_endpoint_builds_and_serves(monkeypatch: object) -> None:
    """Endpoint wiring (slug, job, artifact_urls, /artifacts) with the LLM faked.

    The generator itself is unit-tested in the cad service against a FakeDriver;
    here we only need the API plumbing, so we stub ``generate_part`` to drop a real
    STL in the expected layout and return a printable result.
    """
    import cad.generate as gen
    from cad.generate import GenerateResult

    def fake_generate(prompt, dest, *, name=None, out_dir=None, **_kw):  # noqa: ANN001, ANN202
        d = Path(out_dir or dest)
        d.mkdir(parents=True, exist_ok=True)
        stl = d / f"{name}.stl"
        trimesh.creation.box(extents=(10.0, 10.0, 10.0)).export(stl)
        return GenerateResult(
            ok=True, driver="fake", description=prompt, dest=str(d), rounds=1,
            model_path=str(d / "model.py"), source="x = 1",
            build={"ok": True, "artifacts": {"stl": str(stl)},
                   "verification": {"printable": True, "summary": "ok"}},
        )

    monkeypatch.setattr(gen, "generate_part", fake_generate)  # type: ignore[attr-defined]

    ref = client.post("/generate", json={"prompt": "a 10mm cube widget"}).json()
    assert ref["status"] in ("queued", "running")
    job = _poll(ref["job_id"])
    assert job["status"] == "succeeded", job
    result = job["result"]
    assert result["name"] == "a-10mm-cube-widget"
    assert result["ok"] is True
    stl_url = result["artifact_urls"]["stl"]
    assert stl_url == "/artifacts/a-10mm-cube-widget/a-10mm-cube-widget.stl"
    served = client.get(stl_url)
    assert served.status_code == 200 and len(served.content) > 0


def test_generate_rejects_too_short_prompt() -> None:
    assert client.post("/generate", json={"prompt": "x"}).status_code == 422


def test_samples_lists_benchy() -> None:
    resp = client.get("/samples")
    assert resp.status_code == 200
    benchy = next((s for s in resp.json() if s["name"] == "benchy"), None)
    assert benchy is not None and "description" in benchy and "available" in benchy


def test_stage_unknown_sample_is_404() -> None:
    assert client.post("/samples/nope/stage").status_code == 404


def test_sample_available_detects_lfs_pointer(tmp_path: Path) -> None:
    from api.main import _sample_available

    real = tmp_path / "real.stl"
    real.write_bytes(b"solid x\nfacet ...\n")
    pointer = tmp_path / "pointer.stl"
    pointer.write_text("version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 123\n")
    assert _sample_available(real) is True
    assert _sample_available(pointer) is False  # unfetched LFS pointer -> not usable
    assert _sample_available(tmp_path / "missing.stl") is False


def test_stage_benchy_serves_stl_when_present() -> None:
    # The committed 3DBenchy may or may not be present (LFS); handle both.
    available = next(s for s in client.get("/samples").json() if s["name"] == "benchy")["available"]
    resp = client.post("/samples/benchy/stage")
    if not available:
        assert resp.status_code == 409  # STL missing -> clear error, not a crash
        return
    job = _poll(resp.json()["job_id"])
    assert job["status"] == "succeeded", job
    result = job["result"]
    assert result["artifact_urls"]["stl"] == "/artifacts/benchy/benchy.stl"
    assert result["metadata"]["fits_build_volume"] is True
    assert client.get(result["artifact_urls"]["stl"]).status_code == 200


def test_slice_requires_build_first() -> None:
    shutil.rmtree(BUILDS_DIR / "bracket", ignore_errors=True)  # ensure not built
    assert client.post("/templates/bracket/slice").status_code == 409


def test_slice_settings_out_of_range_is_422() -> None:
    # Body validation happens before the handler, so no build needed.
    assert client.post("/templates/box/slice", json={"infill_density": 150}).status_code == 422
    assert client.post("/templates/box/slice", json={"jerk": 999}).status_code == 422
    assert client.post("/templates/box/slice", json={"layer_height": 5}).status_code == 422


def test_slice_empty_body_ok() -> None:
    # No settings -> committed-profile defaults; 409 because box isn't built here.
    shutil.rmtree(BUILDS_DIR / "plate", ignore_errors=True)
    assert client.post("/templates/plate/slice").status_code == 409
    assert client.post("/templates/plate/slice", json={}).status_code == 409


def test_build_then_slice_to_gcode() -> None:
    # Build, then slice. Succeeds with a gcode_url when OrcaSlicer is installed;
    # fails gracefully (clear error) when it isn't (e.g. CI) — never crashes.
    build = _poll(client.post("/templates/box/build").json()["job_id"])
    assert build["status"] == "succeeded", build

    ref = client.post("/templates/box/slice").json()
    assert ref["status"] in ("queued", "running")
    job = _poll(ref["job_id"], timeout=180)
    result = job["result"]

    if job["status"] == "succeeded":
        assert result["gcode_url"] == "/artifacts/box/box.gcode"
        served = client.get(result["gcode_url"])
        assert served.status_code == 200 and "G28" in served.text
    else:
        # No slicer available -> graceful failure, not a crash.
        assert "orcaslicer" in (result.get("error") or "").lower()
