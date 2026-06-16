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
