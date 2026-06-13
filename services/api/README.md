# apiserver — local FastAPI control plane

Fronts the cad / slicer / scanner services over HTTP with background jobs.

```bash
uv run --package apiserver uvicorn api.main:app --reload --port 8000
# or:  pnpm py:api   ·   or the console script:  agent-cad-api
# docs at http://127.0.0.1:8000/docs
```

Heavy work (`/cad/build`, `/slice/*`, `/scan/clean`) is enqueued → returns
`{job_id}` → poll `GET /jobs/{id}`. Cheap work (`/slice/extract`, `/parts`) is
synchronous. The OpenAPI schema is the contract mirrored by `@agent-cad/types`.

Endpoints: `/health`, `/cad/build`, `/slice/orca|prusa|extract`, `/scan/clean`,
`/jobs[/{id}]`, `/parts[/{name}]`. The job store is in-memory (single-user local
tool — restart clears history). Engine imports are lazy, so the server starts even
without build123d installed.
