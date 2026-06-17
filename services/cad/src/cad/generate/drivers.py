"""Concrete LLM backends and the driver registry.

Three interchangeable drivers, selected by name (``$AGENT_CAD_LLM_DRIVER`` or the
``driver=`` argument), default ``claude-code``:

* ``claude-code`` — shells out to the local ``claude`` CLI in headless ``-p`` mode.
  Runs on the user's existing Claude **subscription**; no metered API key needed.
* ``anthropic``  — the official Anthropic SDK + ``ANTHROPIC_API_KEY`` (metered;
  a part is a few K tokens → roughly $0.01–0.05 with the templates prompt-cached).
* ``ollama``     — a local Ollama server over stdlib HTTP (offline, zero new deps).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import urllib.error
import urllib.request

from cad.generate.base import Driver, Message

# Default models per backend. Claude Code resolves "the latest" itself when None;
# the API path pins Opus 4.8 (best for code-gen); Ollama needs a locally-pulled tag.
_DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8"
_DEFAULT_OLLAMA_MODEL = "qwen2.5-coder"


class ClaudeCodeDriver:
    """Headless ``claude -p`` — runs on the user's Claude Code subscription."""

    name = "claude-code"

    def __init__(self, model: str | None = None, effort: str | None = None) -> None:
        # None → let the CLI use the session's default. A value maps to `--model`
        # (alias like "opus" or a full id) / `--effort` (low|medium|high|xhigh|max).
        # Passing these EXPLICITLY also stops the spawned `claude -p` from inheriting
        # a stray CLAUDE_EFFORT from the parent process.
        self.model = model
        self.effort = effort
        self.bin = os.environ.get("AGENT_CAD_CLAUDE_BIN", "claude")
        self.timeout = int(os.environ.get("AGENT_CAD_CLAUDE_TIMEOUT", "600"))

    def available(self) -> tuple[bool, str]:
        if shutil.which(self.bin) is None:
            return False, (
                f"the `{self.bin}` CLI is not on PATH. Install Claude Code, or set "
                "AGENT_CAD_LLM_DRIVER=anthropic / ollama."
            )
        return True, ""

    def complete(self, system: str, messages: list[Message]) -> str:
        # The CLI is single-prompt; fold the running conversation into one turn so
        # retries carry the prior model.py + the error feedback.
        prompt = _flatten_conversation(messages)
        cmd = [
            self.bin, "-p", prompt,
            "--system-prompt", system,
            "--output-format", "json",
            # Pure text generation — deny every tool so it never tries to touch
            # the filesystem or shell, and runs fast.
            "--disallowedTools", "Bash", "Edit", "Write", "Read", "WebSearch", "WebFetch",
        ]
        if self.model:
            cmd += ["--model", self.model]
        if self.effort:
            cmd += ["--effort", self.effort]
        proc = subprocess.run(  # noqa: S603 - args are controlled, not shell-interpolated
            cmd, capture_output=True, text=True, timeout=self.timeout
        )
        if proc.returncode != 0:
            raise RuntimeError(
                f"claude CLI exited {proc.returncode}: {(proc.stderr or proc.stdout).strip()[:500]}"
            )
        payload = json.loads(proc.stdout)
        if payload.get("is_error"):
            raise RuntimeError(f"claude CLI error: {payload.get('result', payload)}")
        return payload["result"]


class AnthropicDriver:
    """Official Anthropic SDK — metered API key, Opus 4.8 by default."""

    name = "anthropic"

    def __init__(self, model: str | None = None, effort: str | None = None) -> None:
        self.model = model or os.environ.get("AGENT_CAD_ANTHROPIC_MODEL", _DEFAULT_ANTHROPIC_MODEL)
        self.effort = effort
        self.max_tokens = int(os.environ.get("AGENT_CAD_ANTHROPIC_MAX_TOKENS", "8000"))

    def available(self) -> tuple[bool, str]:
        try:
            import anthropic  # noqa: F401
        except ImportError:
            return False, "the `anthropic` package is not installed (uv sync --extra anthropic)."
        if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
            return False, "set ANTHROPIC_API_KEY to use the metered Anthropic API driver."
        return True, ""

    def complete(self, system: str, messages: list[Message]) -> str:
        import anthropic

        client = anthropic.Anthropic()
        # Cache the (large, static) system prompt so retries and repeat parts only
        # pay ~10% for it — see the skill's prompt-caching note.
        system_blocks = [
            {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}
        ]
        api_messages = [{"role": m.role, "content": m.content} for m in messages]
        # Stream (the reply can be long) and collect the final message.
        with client.messages.stream(
            model=self.model,
            max_tokens=self.max_tokens,
            system=system_blocks,
            messages=api_messages,
            thinking={"type": "adaptive"},
        ) as stream:
            final = stream.get_final_message()
        return "".join(b.text for b in final.content if b.type == "text")


class OllamaDriver:
    """Local Ollama server over its HTTP API (offline, stdlib only)."""

    name = "ollama"

    def __init__(self, model: str | None = None, effort: str | None = None) -> None:
        self.model = model or os.environ.get("AGENT_CAD_OLLAMA_MODEL", _DEFAULT_OLLAMA_MODEL)
        self.effort = effort  # accepted for a uniform driver signature; not used by Ollama
        self.host = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
        self.timeout = int(os.environ.get("AGENT_CAD_OLLAMA_TIMEOUT", "600"))

    def available(self) -> tuple[bool, str]:
        try:
            with urllib.request.urlopen(f"{self.host}/api/tags", timeout=5):  # noqa: S310
                return True, ""
        except (urllib.error.URLError, OSError) as exc:
            return False, f"no Ollama server reachable at {self.host} ({exc}). Run `ollama serve`."

    def complete(self, system: str, messages: list[Message]) -> str:
        body = json.dumps({
            "model": self.model,
            "system": system,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": False,
            "options": {"temperature": 0.2},
        }).encode()
        req = urllib.request.Request(  # noqa: S310 - host is operator-configured
            f"{self.host}/api/chat", data=body, headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310
            payload = json.loads(resp.read())
        return payload["message"]["content"]


def _flatten_conversation(messages: list[Message]) -> str:
    """Collapse a multi-turn conversation into one prompt for single-shot CLIs."""
    if len(messages) == 1:
        return messages[0].content
    parts = []
    for m in messages:
        label = "REQUEST" if m.role == "user" else "YOUR PREVIOUS model.py"
        parts.append(f"## {label}\n{m.content}")
    return "\n\n".join(parts)


# name (and a couple of aliases) → factory.
_REGISTRY: dict[str, type] = {
    "claude-code": ClaudeCodeDriver,
    "claude_code": ClaudeCodeDriver,
    "claude": ClaudeCodeDriver,
    "anthropic": AnthropicDriver,
    "api": AnthropicDriver,
    "ollama": OllamaDriver,
    "local": OllamaDriver,
}

DRIVER_NAMES = ("claude-code", "anthropic", "ollama")


def resolve_driver(name: str | None = None, *, model: str | None = None, effort: str | None = None) -> Driver:
    """Pick a driver: explicit ``name`` > ``$AGENT_CAD_LLM_DRIVER`` > ``claude-code``."""
    chosen = (name or os.environ.get("AGENT_CAD_LLM_DRIVER") or "claude-code").strip().lower()
    factory = _REGISTRY.get(chosen)
    if factory is None:
        raise ValueError(
            f"unknown LLM driver {chosen!r}. Available: {', '.join(DRIVER_NAMES)}"
        )
    return factory(model=model, effort=effort)
