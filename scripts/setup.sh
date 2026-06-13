#!/usr/bin/env bash
# Install all workspace dependencies. Idempotent; safe to re-run.
#
# Used both manually and as a SessionStart hook (.claude/settings.json) so that
# ephemeral Claude-Code-on-the-web containers come up able to build and test.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
echo "[agent-cad setup] repo: $(pwd)"

# --- Python (uv workspace: cad / slicer / scanner / apiserver) --------------- #
if command -v uv >/dev/null 2>&1; then
  echo "[agent-cad setup] uv sync --all-packages ..."
  uv sync --all-packages || echo "[agent-cad setup] WARN: uv sync failed"
else
  echo "[agent-cad setup] WARN: uv not found — see https://docs.astral.sh/uv/"
fi

# --- JS (pnpm + Turborepo) --------------------------------------------------- #
if command -v pnpm >/dev/null 2>&1; then
  echo "[agent-cad setup] pnpm install ..."
  pnpm install || echo "[agent-cad setup] WARN: pnpm install failed"
else
  echo "[agent-cad setup] WARN: pnpm not found — run 'corepack enable pnpm'"
fi

echo "[agent-cad setup] done. Try: uv run pytest  ·  pnpm turbo run build"
