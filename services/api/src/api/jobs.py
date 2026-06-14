"""In-memory background job store with status polling.

Long-running work (slicing, scan cleanup, heavy CAD builds) is submitted as a
job; the route returns a job id immediately and the client polls ``/jobs/{id}``.
This mirrors the enqueue -> poll pattern production print farms use, kept simple
for a local single-user tool (in-memory, thread pool — restart loses history).
"""

from __future__ import annotations

import threading
import time
import traceback
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


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
        }


class JobStore:
    """Thread-safe job registry backed by a small thread pool."""

    def __init__(self, max_workers: int = 2) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._pool = ThreadPoolExecutor(max_workers=max_workers)

    def submit(self, kind: str, fn: Callable[..., dict[str, Any]], *args: Any, **kwargs: Any) -> Job:
        job = Job(id=uuid.uuid4().hex, kind=kind)
        with self._lock:
            self._jobs[job.id] = job
        self._pool.submit(self._run, job, fn, args, kwargs)
        return job

    def _run(self, job: Job, fn: Callable[..., dict[str, Any]], args: tuple, kwargs: dict) -> None:
        with self._lock:
            job.status = JobStatus.RUNNING
            job.started_at = time.time()
        try:
            result = fn(*args, **kwargs)
            with self._lock:
                job.result = result
                # A service that returns {"ok": False} is a failed job.
                job.status = (
                    JobStatus.FAILED
                    if isinstance(result, dict) and result.get("ok") is False
                    else JobStatus.SUCCEEDED
                )
                if job.status is JobStatus.FAILED:
                    job.error = result.get("error") if isinstance(result, dict) else None
        except Exception:  # noqa: BLE001 - record any worker crash on the job
            with self._lock:
                job.status = JobStatus.FAILED
                job.error = traceback.format_exc()
        finally:
            with self._lock:
                job.finished_at = time.time()

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def list(self) -> list[Job]:
        with self._lock:
            return sorted(self._jobs.values(), key=lambda j: j.created_at, reverse=True)

    def shutdown(self) -> None:
        self._pool.shutdown(wait=False, cancel_futures=True)
