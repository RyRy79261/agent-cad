"""Tests for the API completion: interview, refine, STL import, calibrate (API-8/9/10/11)."""

from __future__ import annotations

import time
from pathlib import Path

from fastapi.testclient import TestClient

from api.chats import get_chat, save_chat
from api.interview import _parse_interview, interview_turn
from api.main import app, store

_CUBE_STL = Path(__file__).resolve().parents[2] / "slice" / "tests" / "fixtures" / "cube20.stl"


def _wait_terminal(c: TestClient, job_id: str, timeout: float = 30.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        j = c.get(f"/jobs/{job_id}").json()
        if j["status"] in ("succeeded", "failed", "interrupted"):
            return j
        time.sleep(0.05)
    raise AssertionError("job did not finish")


# --- interview parse (pure, no network) ----------------------------------- #


def test_interview_parse_question_and_ready():
    q = _parse_interview('{"status":"question","question":"How wide?","suggestions":["60mm","80mm"]}')
    assert q["status"] == "question" and q["suggestions"] == ["60mm", "80mm"]
    assert _parse_interview('blah {"status":"ready"} trailing')["status"] == "ready"
    assert _parse_interview("not json at all")["status"] == "ready"  # graceful fallback


def test_interview_turn_degrades_to_ready_without_key():
    # No ANTHROPIC_API_KEY in tests -> driver unavailable -> must not block intake.
    out = interview_turn("a phone stand", driver="anthropic")
    assert out["status"] == "ready"


# --- HTTP: import (fully exercised) + interview/refine/calibrate (structural) #


def test_api_completion_http():
    with TestClient(app) as c:
        # --- STL import (real validation against the cube fixture) ---
        with _CUBE_STL.open("rb") as fh:
            r = c.post("/imports", files={"file": ("cube20.stl", fh, "model/stl")})
        assert r.status_code == 200, r.text
        imp = r.json()
        assert imp["bbox"]["x"] == 20 and imp["bbox"]["z"] == 20
        assert imp["fits_build_volume"] is True
        assert (store.imports_dir / f"{imp['id']}.stl").exists()
        # a non-STL upload is rejected
        assert c.post("/imports", files={"file": ("x.stl", b"not a mesh", "model/stl")}).status_code == 400

        # attach the import into a chat -> becomes the current model
        cid = c.post("/chats", json={"prompt": "import test"}).json()["id"]
        chat = c.post(f"/chats/{cid}/imports/{imp['id']}/attach").json()
        assert chat["current_stl"] == "model.stl" and chat["status"] == "model-ready"
        assert chat["messages"][-1]["artifact_refs"][0]["kind"] == "import"
        assert c.post(f"/chats/{cid}/imports/nope/attach").status_code == 404

        # --- interview (no key -> job succeeds with ready) ---
        j = c.post(f"/chats/{cid}/interview", json={"prompt": "a 90mm coaster"}).json()
        res = _wait_terminal(c, j["job_id"])["result"]
        assert res["ready"] is True  # degraded gracefully

        # --- refine: 409 with no model.py, then a job submits (real gen needs a key) ---
        empty = c.post("/chats", json={"title": "empty"}).json()["id"]
        assert c.post(f"/chats/{empty}/refine", json={"instruction": "taller"}).status_code == 409
        # the imported chat has model.stl but no model.py -> still 409 (refine edits source)
        assert c.post(f"/chats/{cid}/refine", json={"instruction": "wider"}).status_code == 409
        # a chat with a model.py present -> refine submits a job
        gen = c.post("/chats", json={"title": "gen"}).json()["id"]
        (store.artifacts_dir(gen) / "model.py").write_text("def build(p): return None\n")
        ch = get_chat(store, gen); ch.current_stl = "model.stl"; save_chat(store, ch)
        assert c.post(f"/chats/{gen}/refine", json={"instruction": "wider"}).status_code == 200

        # --- calibrate: cube target builds + slices in one job (slice needs OrcaSlicer) ---
        cal = c.post("/calibrate", json={"target": "cube"})
        assert cal.status_code == 200 and cal.json()["kind"] == "calibrate"
        # the cube build half runs even without OrcaSlicer -> the cube STL gets created
        _wait_terminal(c, cal.json()["job_id"])
        assert any(Path(".agent-cad-builds").glob("calibration-*-cube/*.stl"))
        # an invalid target is rejected by the Literal
        assert c.post("/calibrate", json={"target": "sphere"}).status_code == 422
