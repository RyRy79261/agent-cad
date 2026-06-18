"""Durable background job store with status polling.

Long-running work (CAD build, generation, slicing, scan cleanup) is submitted as a
job; the route returns a job id immediately and the client polls ``/jobs/{id}``.

**Durable:** every state transition is persisted to ``<store>/jobs.json`` atomically, so
a terminal job's result survives an API restart and a chat can re-attach to its last
artifact. In-flight (queued/running) jobs found on startup are marked ``interrupted``
rather than silently lost. Kept simple for a local single-user tool (a small 2-worker
thread pool). Pass ``store=None`` for a pure in-memory store (e.g. tests).
"""

from __future__ import annotations

import contextlib
import threading
import time
import traceback
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from api.logging_setup import get_logger

if TYPE_CHECKING:
    from api.store import Store

_log = get_logger("jobs")


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    INTERRUPTED = "interrupted"  # was in-flight when the API restarted


_ACTIVE = {JobStatus.QUEUED, JobStatus.RUNNING}


@dataclass
class Job:
    id: str
    kind: str
    status: JobStatus = JobStatus.QUEUED
    created_at: float = field(default_factory=time.time)
    started_at: float | None = None
    finished_at: float | None = None
    result: dict[str, Any] | None = None
    error: str | None = None
    # Coarse progress label for long chat generations (queued -> generating ->
    # building -> verifying -> slicing -> done); see FR-JOB-2.
    phase: str | None = None
    # Links a job to its chat so a reloaded chat re-attaches its last result.
    chat_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "status": self.status.value,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "result": self.result,
            "error": self.error,
            "phase": self.phase,
            "chat_id": self.chat_id,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Job:
        return cls(
            id=d["id"],
            kind=d["kind"],
            status=JobStatus(d.get("status", "queued")),
            created_at=d.get("created_at", time.time()),
            started_at=d.get("started_at"),
            finished_at=d.get("finished_at"),
            result=d.get("result"),
            error=d.get("error"),
            phase=d.get("phase"),
            chat_id=d.get("chat_id"),
        )


class JobStore:
    """Thread-safe, restart-surviving job registry backed by a small thread pool."""

    def __init__(self, max_workers: int = 2, store: Store | None = None) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._max_workers = max_workers
        self._pool = ThreadPoolExecutor(max_workers=max_workers)
        self._closed = False
        self._store = store
        if store is not None:
            self._recover()

    # --- persistence ---------------------------------------------------- #
    def _recover(self) -> None:
        """Load persisted jobs once; mark any still in-flight as interrupted."""
        assert self._store is not None
        data = self._store.read_json(self._store.jobs_path, default=[]) or []
        if not isinstance(data, list):  # a corrupt jobs.json must not brick startup
            data = []
        changed = False
        with self._lock:
            for d in data:
                try:
                    job = Job.from_dict(d)
                except (TypeError, KeyError, ValueError):
                    changed = True  # drop the bad record + rewrite
                    continue
                if job.status in _ACTIVE:
                    job.status = JobStatus.INTERRUPTED
                    if job.finished_at is None:
                        job.finished_at = time.time()
                    changed = True
                self._jobs[job.id] = job
            if changed:
                self._persist_locked()

    def _persist_locked(self) -> None:
        """Write all jobs to jobs.json atomically. The caller must hold the lock."""
        if self._store is None:
            return
        snapshot = [j.to_dict() for j in self._jobs.values()]
        # Persistence is best-effort; never let a disk hiccup crash a job.
        with contextlib.suppress(OSError):
            self._store.atomic_write_json(self._store.jobs_path, snapshot)

    # --- lifecycle ------------------------------------------------------ #
    def submit(
        self,
        kind: str,
        fn: Callable[..., dict[str, Any]],
        *args: Any,
        chat_id: str | None = None,
        **kwargs: Any,
    ) -> Job:
        job = Job(id=uuid.uuid4().hex, kind=kind, chat_id=chat_id)
        with self._lock:
            if self._closed:  # revive after a prior shutdown (e.g. a restarted lifespan)
                self._pool = ThreadPoolExecutor(max_workers=self._max_workers)
                self._closed = False
            self._jobs[job.id] = job
            self._persist_locked()
        self._pool.submit(self._run, job, fn, args, kwargs)
        return job

    def set_phase(self, job_id: str, phase: str) -> None:
        """Update a running job's coarse progress label (persisted)."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job.phase = phase
                self._persist_locked()

    def _run(self, job: Job, fn: Callable[..., dict[str, Any]], args: tuple, kwargs: dict) -> None:
        with self._lock:
            job.status = JobStatus.RUNNING
            job.started_at = time.time()
            self._persist_locked()
        result: dict[str, Any] | None
        crashed = False
        try:
            result = fn(*args, **kwargs)
            # A service that returns {"ok": False} is a failed job.
            failed = isinstance(result, dict) and result.get("ok") is False
            status = JobStatus.FAILED if failed else JobStatus.SUCCEEDED
            error = result.get("error") if (failed and isinstance(result, dict)) else None
        except Exception:  # noqa: BLE001 - record any worker crash on the job
            result, status, error, crashed = None, JobStatus.FAILED, traceback.format_exc(), True
        # Set the terminal state AND persist atomically under one lock. `get()` takes the
        # same lock, so any caller that observes the terminal status is guaranteed to also
        # see it written to jobs.json — no window where in-memory is done but disk is stale.
        with self._lock:
            job.result = result
            job.status = status
            job.error = error
            job.finished_at = time.time()
            self._persist_locked()
        if status is JobStatus.FAILED:
            _log.error("job %s (%s) %s: %s", job.id, job.kind, "crashed" if crashed else "failed", error)

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def list(self) -> list[Job]:
        with self._lock:
            return sorted(self._jobs.values(), key=lambda j: j.created_at, reverse=True)

    def shutdown(self) -> None:
        self._pool.shutdown(wait=False, cancel_futures=True)
        self._closed = True
