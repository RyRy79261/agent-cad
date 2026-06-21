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
from cad.generate.base import Message, extract_summary, strip_code_fences
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

    def complete(self, system: str, messages: list[Message], on_progress=None) -> str:
        self.calls.append(list(messages))
        if on_progress is not None:
            on_progress("thinking")  # exercise the progress hook
        return self._replies.pop(0)


# --- strip_code_fences -------------------------------------------------------

def test_strip_fences_plain_text() -> None:
    assert strip_code_fences("x = 1") == "x = 1\n"


def test_strip_fences_single_block() -> None:
    assert strip_code_fences("here:\n```python\nx = 1\n```\nthanks") == "x = 1\n"


def test_strip_fences_takes_longest_block() -> None:
    text = "```py\nshort\n```\nand\n```python\nlonger = block = here\n```"
    assert strip_code_fences(text) == "longer = block = here\n"


def test_extract_summary() -> None:
    assert extract_summary("# SUMMARY: a 90mm coaster — raised rim\nimport x\n") == "a 90mm coaster — raised rim"
    assert extract_summary('"""docstring"""\n# SUMMARY: still found\nx=1') == "still found"
    assert extract_summary("import x\n# SUMMARY: too late\n") is None  # past real code
    assert extract_summary("x = 1\n") is None


def test_generate_captures_summary(tmp_path: Path) -> None:
    src = "# SUMMARY: a smooth gyroid-infilled shelf with filleted brackets\n" + GOOD_SOURCE
    result = generate_part("a shelf", tmp_path / "p", driver=FakeDriver([src]))
    assert result.ok and result.summary == "a smooth gyroid-infilled shelf with filleted brackets"


def test_generate_captures_token_usage(tmp_path: Path) -> None:
    drv = FakeDriver([GOOD_SOURCE])
    drv.last_usage = {  # type: ignore[attr-defined]
        "input_tokens": 9, "cache_creation_tokens": 6491, "cache_read_tokens": 800, "output_tokens": 450,
    }
    result = generate_part("a cube", tmp_path / "p", driver=drv)
    assert result.ok
    assert result.usage == {
        "input_tokens": 9, "cache_creation_tokens": 6491, "cache_read_tokens": 800, "output_tokens": 450,
    }


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


def test_claude_code_decodes_utf8_and_passes_model_effort(monkeypatch: pytest.MonkeyPatch) -> None:
    """Regression: the CLI's JSON echoes model.py with non-ASCII (— → °); decoding it
    must be UTF-8, not the process locale (which crashed with UnicodeDecodeError), and
    --model / --effort must reach the command."""
    from types import SimpleNamespace

    import cad.generate.drivers as drivers_mod

    captured: dict = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        captured["kwargs"] = kwargs
        body = json.dumps({"is_error": False, "result": "x = 1  # smooth lattice — 45° chamfer →"})
        return SimpleNamespace(returncode=0, stdout=body, stderr="")

    monkeypatch.setattr(drivers_mod.subprocess, "run", fake_run)
    drv = ClaudeCodeDriver(model="claude-sonnet-4-6", effort="medium")
    out = drv.complete("system —", [Message("user", "smooth the L-brackets — round 90° joints")])

    assert "—" in out and "→" in out and "°" in out  # non-ASCII round-trips
    assert captured["kwargs"].get("encoding") == "utf-8"  # locale-independent decode
    assert "--model" in captured["cmd"] and "claude-sonnet-4-6" in captured["cmd"]
    assert "--effort" in captured["cmd"] and "medium" in captured["cmd"]


def test_claude_code_attaches_images_with_read_scope(monkeypatch: pytest.MonkeyPatch) -> None:
    """An attached reference image → allow ONLY Read, scope it to the image dir, and
    reference the path in the prompt so the model views it."""
    from types import SimpleNamespace

    import cad.generate.drivers as drivers_mod

    captured: dict = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        return SimpleNamespace(returncode=0, stdout=json.dumps({"is_error": False, "result": "x = 1"}), stderr="")

    monkeypatch.setattr(drivers_mod.subprocess, "run", fake_run)
    ClaudeCodeDriver().complete("sys", [Message("user", "build this", attachments=("/tmp/imgs/sketch.png",))])

    cmd = captured["cmd"]
    assert "--allowedTools" in cmd and "Read" in cmd
    assert "--disallowedTools" not in cmd  # images mode allows only Read
    assert "--add-dir" in cmd and "/tmp/imgs" in cmd
    assert "/tmp/imgs/sketch.png" in cmd[2]  # path appended to the -p prompt


def test_claude_code_no_attachments_denies_all_tools(monkeypatch: pytest.MonkeyPatch) -> None:
    from types import SimpleNamespace

    import cad.generate.drivers as drivers_mod

    captured: dict = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        return SimpleNamespace(returncode=0, stdout=json.dumps({"is_error": False, "result": "x = 1"}), stderr="")

    monkeypatch.setattr(drivers_mod.subprocess, "run", fake_run)
    ClaudeCodeDriver().complete("sys", [Message("user", "build a cube")])
    cmd = captured["cmd"]
    assert "--disallowedTools" in cmd and "Read" in cmd and "--allowedTools" not in cmd


def test_claude_code_retries_transient_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    """A dropped connection ('Connection closed … Try again') is transient — retry, don't fail."""
    from types import SimpleNamespace

    import cad.generate.drivers as drivers_mod

    n = {"calls": 0}

    def fake_run(cmd, **kwargs):
        n["calls"] += 1
        if n["calls"] == 1:  # first attempt: the exact transient failure the user hit
            msg = "API Error: Connection closed while thinking, before producing a response. Try again."
            return SimpleNamespace(returncode=1, stdout=json.dumps({"is_error": True, "result": msg}), stderr="")
        return SimpleNamespace(returncode=0, stdout=json.dumps({"is_error": False, "result": "x = 1"}), stderr="")

    monkeypatch.setattr(drivers_mod.subprocess, "run", fake_run)
    monkeypatch.setattr(drivers_mod.time, "sleep", lambda *_: None)
    out = ClaudeCodeDriver().complete("sys", [Message("user", "hi")])
    assert out == "x = 1" and n["calls"] == 2  # retried once, then succeeded


def test_claude_code_does_not_retry_fatal(monkeypatch: pytest.MonkeyPatch) -> None:
    from types import SimpleNamespace

    import cad.generate.drivers as drivers_mod

    n = {"calls": 0}

    def fake_run(cmd, **kwargs):
        n["calls"] += 1
        body = json.dumps({"is_error": True, "result": "Invalid model id: bogus"})
        return SimpleNamespace(returncode=1, stdout=body, stderr="")

    monkeypatch.setattr(drivers_mod.subprocess, "run", fake_run)
    monkeypatch.setattr(drivers_mod.time, "sleep", lambda *_: None)
    with pytest.raises(RuntimeError, match="Invalid model id"):
        ClaudeCodeDriver().complete("sys", [Message("user", "hi")])
    assert n["calls"] == 1  # non-transient → no retry


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


def test_generate_negative_max_rounds_is_clean_error(tmp_path: Path) -> None:
    # max_rounds < 0 must fail cleanly, not crash on an empty attempts list.
    drv = FakeDriver([f"```python\n{GOOD_SOURCE}```"])
    result = generate_part("a cube", tmp_path / "p", driver=drv, max_rounds=-1)
    assert result.ok is False
    assert "max_rounds" in (result.error or "")


def test_generate_no_verify_skips_printability(tmp_path: Path) -> None:
    # Oversize part: would fail verification, but --no-verify accepts any valid build.
    drv = FakeDriver([OVERSIZE_SOURCE])
    result = generate_part("a big cube", tmp_path / "p", driver=drv, verify=False)
    assert result.ok is True
    assert result.attempts[0].printable is True  # not checked -> treated as fine
