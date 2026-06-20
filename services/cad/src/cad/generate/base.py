"""Core types for the pluggable free-text → build123d generator.

The generator turns a natural-language part description into a build123d
``model.py`` and runs it through the existing build→verify→retry pipeline. Which
LLM produces the code is pluggable via the small ``Driver`` protocol below, so
the same orchestration works whether the model runs on the user's Claude Code
subscription, a metered Anthropic API key, or a fully-local Ollama server.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class Message:
    """One turn in the generation conversation."""

    role: str  # "user" | "assistant"
    content: str
    #: Absolute paths to reference images/files the model should view (sketches, STL renders).
    attachments: tuple[str, ...] = ()


@runtime_checkable
class Driver(Protocol):
    """An LLM backend: turns a (system, conversation) pair into raw model text."""

    #: short identifier, e.g. ``"claude-code"`` — also what ``$AGENT_CAD_LLM_DRIVER`` selects.
    name: str

    def available(self) -> tuple[bool, str]:
        """``(usable, reason)``. ``reason`` is human-readable when not usable."""
        ...

    def complete(self, system: str, messages: list[Message]) -> str:
        """Return the assistant's raw text reply (may still contain code fences)."""
        ...


# Matches a fenced code block, optionally tagged ```python / ```py.
_FENCE_RE = re.compile(r"```(?:python|py)?\s*\n(.*?)```", re.DOTALL)


def strip_code_fences(text: str) -> str:
    """Extract Python source from an LLM reply.

    Models often wrap code in a ```python … ``` block even when told not to. If
    one or more fenced blocks are present we take the **longest** (the model.py,
    not an inline snippet); otherwise we assume the whole reply is source. The
    result always ends with a trailing newline so it writes cleanly to a file.
    """
    blocks = _FENCE_RE.findall(text)
    if blocks:
        return max(blocks, key=len).strip() + "\n"
    return text.strip() + "\n"


_SUMMARY_RE = re.compile(r"#\s*SUMMARY:\s*(.+)", re.IGNORECASE)


def extract_summary(source: str) -> str | None:
    """The model's plain-language ``# SUMMARY: …`` note near the top of model.py.

    It's the conversational chat reply (what the model is / what changed) — surfaced
    to the user instead of a canned metadata line. Returns ``None`` if absent.
    """
    for line in source.splitlines()[:12]:
        s = line.strip()
        m = _SUMMARY_RE.match(s)
        if m:
            return m.group(1).strip()
        if s and not s.startswith(("#", '"', "'")):
            break  # past the header — a real statement; stop looking
    return None
