"""Tests for the durable job store (FOUND-4)."""

from __future__ import annotations

import time

from api.jobs import JobStatus, JobStore
from api.store import Store


def _wait_done(js: JobStore, job_id: str, timeout: float = 5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = js.get(job_id)
        if job and job.status in (JobStatus.SUCCEEDED, JobStatus.FAILED):
            return job
        time.sleep(0.02)
    raise AssertionError("job did not finish in time")


def test_submit_persists_and_completes(tmp_path):
    s = Store(tmp_path)
    js = JobStore(store=s)
    job = js.submit("build", lambda: {"ok": True, "value": 42})
    done = _wait_done(js, job.id)
    assert done.status is JobStatus.SUCCEEDED
    data = s.read_json(s.jobs_path)
    assert any(d["id"] == job.id and d["status"] == "succeeded" for d in data)
    js.shutdown()


def test_failed_job_records_error(tmp_path):
    s = Store(tmp_path)
    js = JobStore(store=s)
    job = js.submit("build", lambda: {"ok": False, "error": "boom"})
    done = _wait_done(js, job.id)
    assert done.status is JobStatus.FAILED and done.error == "boom"
    js.shutdown()


def test_recovery_marks_inflight_interrupted_and_keeps_results(tmp_path):
    s = Store(tmp_path)
    s.atomic_write_json(
        s.jobs_path,
        [
            {
                "id": "r1", "kind": "generate", "status": "running", "created_at": 1.0,
                "started_at": 1.0, "finished_at": None, "result": None, "error": None,
                "phase": "generating", "chat_id": "c1",
            },
            {
                "id": "s1", "kind": "slice", "status": "succeeded", "created_at": 2.0,
                "started_at": 2.0, "finished_at": 3.0,
                "result": {"ok": True, "gcode_url": "/x.gcode"}, "error": None,
                "phase": "done", "chat_id": "c1",
            },
        ],
    )
    js = JobStore(store=s)
    r1 = js.get("r1")
    assert r1 is not None and r1.status is JobStatus.INTERRUPTED and r1.finished_at is not None
    s1 = js.get("s1")
    assert s1 is not None and s1.status is JobStatus.SUCCEEDED
    assert s1.result["gcode_url"] == "/x.gcode" and s1.chat_id == "c1"
    js.shutdown()


def test_chat_id_and_phase_persist(tmp_path):
    s = Store(tmp_path)
    js = JobStore(store=s)
    job = js.submit("generate", lambda: {"ok": True}, chat_id="chat-7")
    assert job.chat_id == "chat-7"
    js.set_phase(job.id, "building")
    data = s.read_json(s.jobs_path)
    rec = next(d for d in data if d["id"] == job.id)
    assert rec["chat_id"] == "chat-7"
    _wait_done(js, job.id)
    js.shutdown()


def test_in_memory_store_without_persistence(tmp_path):
    js = JobStore()  # store=None -> pure in-memory, no jobs.json written
    job = js.submit("x", lambda: {"ok": True})
    done = _wait_done(js, job.id)
    assert done.status is JobStatus.SUCCEEDED
    assert not (tmp_path / "jobs.json").exists()
    js.shutdown()
