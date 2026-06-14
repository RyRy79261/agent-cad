"""Integration tests for the FastAPI control-plane.

Covers the synchronous extract endpoint and the full async job lifecycle
(submit -> poll -> succeeded) using the scan service against a real temp mesh.
"""

from __future__ import annotations

import time
import zipfile
from pathlib import Path

import trimesh
from api.main import app
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
