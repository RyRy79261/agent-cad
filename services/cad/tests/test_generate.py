"""Tests for the free-text → build123d generator.

The LLM call is the one part we never exercise for real in CI (no network, no
`claude` CLI), so a tiny ``FakeDriver`` returns canned ``model.py`` source and the
*rest* of the loop — build, printability verification, retry feedback, the retry
cap, scaffolding — runs against the real pipeline. Source strings reuse the
known-good ``cube`` template so the build genuinely succeeds.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from cad.generate import GenerateResult, generate_part, resolve_driver
from cad.generate.base import Message, strip_code_fences
from cad.generate.drivers import AnthropicDriver, ClaudeCodeDriver, OllamaDriver

# strip_code_fences is pure; the loop needs build123d.
_build123d = pytest.importorskip("build123d", reason="build123d (OCCT) not installed")

from cad.templates import get_template  # noqa: E402

GOOD_SOURCE = get_template("cube").source()
# A part that builds fine but is far too big for the bed -> not printable.
OVERSIZE_SOURCE = GOOD_SOURCE.replace('"default": 20.0', '"default": 400.0')
assert OVERSIZE_SOURCE != GOOD_SOURCE, "oversize fixture must actually change the size default"
BROKEN_SOURCE = "def build(params):\n    raise RuntimeError('boom')\n"


class FakeDriver:
    """A scripted Driver: yields each queued reply in turn."""

    name = "fake"

    def __init__(self, replies: list[str], *, usable: bool = True, reason: str = "") -> None:
        self._replies = list(replies)
        self._usable = usable
        self._reason = reason
        self.calls: list[list[Message]] = []

    def available(self) -> tuple[bool, str]:
        return self._usable, self._reason

    def complete(self, system: str, messages: list[Message]) -> str:
        self.calls.append(list(messages))
        return self._replies.pop(0)


# --- strip_code_fences -------------------------------------------------------

def test_strip_fences_plain_text() -> None:
    assert strip_code_fences("x = 1") == "x = 1\n"


def test_strip_fences_single_block() -> None:
    assert strip_code_fences("here:\n```python\nx = 1\n```\nthanks") == "x = 1\n"


def test_strip_fences_takes_longest_block() -> None:
    text = "```py\nshort\n```\nand\n```python\nlonger = block = here\n```"
    assert strip_code_fences(text) == "longer = block = here\n"


# --- driver resolution -------------------------------------------------------

def test_resolve_default_is_claude_code() -> None:
    assert isinstance(resolve_driver(), ClaudeCodeDriver)


def test_resolve_by_name_and_aliases() -> None:
    assert isinstance(resolve_driver("anthropic"), AnthropicDriver)
    assert isinstance(resolve_driver("api"), AnthropicDriver)
    assert isinstance(resolve_driver("ollama"), OllamaDriver)
    assert isinstance(resolve_driver("local"), OllamaDriver)


def test_resolve_env_var(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_CAD_LLM_DRIVER", "ollama")
    assert isinstance(resolve_driver(), OllamaDriver)


def test_resolve_unknown_raises() -> None:
    with pytest.raises(ValueError, match="unknown LLM driver"):
        resolve_driver("gpt9")


def test_anthropic_unavailable_without_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    usable, reason = AnthropicDriver().available()
    # Either the package is missing or the key is — both are "not usable".
    assert usable is False and reason


# --- orchestration loop ------------------------------------------------------

def test_generate_succeeds_first_round(tmp_path: Path) -> None:
    drv = FakeDriver([f"```python\n{GOOD_SOURCE}```"])
    result = generate_part("a calibration cube", tmp_path / "p", driver=drv)
    assert isinstance(result, GenerateResult)
    assert result.ok is True
    assert result.rounds == 1
    assert result.build["verification"]["printable"] is True
    # The model and scaffold land on disk.
    assert (tmp_path / "p" / "model.py").exists()
    assert json.loads((tmp_path / "p" / "params.json").read_text())  # DEFAULTS extracted
    assert (tmp_path / "p" / "print.json").exists()


def test_generate_retries_then_succeeds(tmp_path: Path) -> None:
    drv = FakeDriver([BROKEN_SOURCE, f"```python\n{GOOD_SOURCE}```"])
    result = generate_part("a cube", tmp_path / "p", driver=drv)
    assert result.ok is True
    assert result.rounds == 2
    # The 2nd call must have been handed feedback (prior model.py + the error).
    assert len(drv.calls[1]) > len(drv.calls[0])
    assert any("fix" in m.content.lower() or "error" in m.content.lower() for m in drv.calls[1])


def test_generate_feeds_back_printability_failure(tmp_path: Path) -> None:
    # First reply builds but is oversize (not printable); second is good.
    drv = FakeDriver([OVERSIZE_SOURCE, f"```python\n{GOOD_SOURCE}```"])
    result = generate_part("a cube", tmp_path / "p", driver=drv)
    assert result.ok is True
    assert result.attempts[0].printable is False
    assert result.attempts[1].ok is True


def test_generate_caps_retries(tmp_path: Path) -> None:
    drv = FakeDriver([BROKEN_SOURCE, BROKEN_SOURCE], )  # never recovers
    result = generate_part("a cube", tmp_path / "p", driver=drv, max_rounds=1)
    assert result.ok is False
    assert result.rounds == 2  # max_rounds=1 -> 2 attempts total
    assert "2 attempts" in result.error


def test_generate_reports_unavailable_backend(tmp_path: Path) -> None:
    drv = FakeDriver([], usable=False, reason="no API key")
    result = generate_part("a cube", tmp_path / "p", driver=drv)
    assert result.ok is False
    assert "unavailable" in result.error and "no API key" in result.error


def test_generate_unknown_driver_name_is_clean_error(tmp_path: Path) -> None:
    result = generate_part("a cube", tmp_path / "p", driver="gpt9")
    assert result.ok is False
    assert "unknown LLM driver" in result.error


def test_generate_no_verify_skips_printability(tmp_path: Path) -> None:
    # Oversize part: would fail verification, but --no-verify accepts any valid build.
    drv = FakeDriver([OVERSIZE_SOURCE])
    result = generate_part("a big cube", tmp_path / "p", driver=drv, verify=False)
    assert result.ok is True
    assert result.attempts[0].printable is True  # not checked -> treated as fine
