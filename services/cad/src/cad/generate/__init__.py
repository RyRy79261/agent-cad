"""Free-text → build123d generation with a pluggable LLM backend.

Public API::

    from cad.generate import generate_part, resolve_driver, DRIVER_NAMES

    result = generate_part("a 40mm cube with a 10mm hole through it",
                           "projects/holey_cube")          # default driver
    result = generate_part(..., driver="anthropic")        # metered API
    result = generate_part(..., driver="ollama")           # fully local

Backend selection order: explicit ``driver=`` > ``$AGENT_CAD_LLM_DRIVER`` >
``claude-code`` (runs on the user's Claude subscription via the ``claude`` CLI).
"""

from __future__ import annotations

from cad.generate.base import Driver, Message, strip_code_fences
from cad.generate.drivers import DRIVER_NAMES, resolve_driver
from cad.generate.orchestrator import Attempt, GenerateResult, generate_part

__all__ = [
    "Attempt",
    "DRIVER_NAMES",
    "Driver",
    "GenerateResult",
    "Message",
    "generate_part",
    "resolve_driver",
    "strip_code_fences",
]
