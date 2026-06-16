"""Test setup: point the on-disk store at a throwaway dir.

`api.main` instantiates a module-level `Store()` (and seeds it in the app lifespan),
so without this any test that imports the app would create/seed the *real*
``~/.agent-cad``. conftest is imported before the test modules, so setting
``AGENT_CAD_HOME`` here lands before `api.main` is first imported.
"""

from __future__ import annotations

import os
import tempfile

# Force isolation: always a throwaway dir, even if AGENT_CAD_HOME is already set in the env.
os.environ["AGENT_CAD_HOME"] = tempfile.mkdtemp(prefix="agentcad-test-")

# Make the LLM hermetic: v1 defaults to the `claude-code` driver, which shells out to
# the local `claude` CLI. Point it at a bogus binary so generate/interview jobs degrade
# instantly (driver unavailable) instead of making a real subscription LLM call — which
# would be slow, consume tokens, and block interpreter exit on the worker thread.
os.environ["AGENT_CAD_CLAUDE_BIN"] = "claude-test-unavailable"
os.environ.pop("AGENT_CAD_LLM_DRIVER", None)
