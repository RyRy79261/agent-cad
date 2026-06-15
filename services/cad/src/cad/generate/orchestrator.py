"""Free-text → printable build123d project: the generate→build→verify→retry loop.

This is the heart of the feature. Given a natural-language description it asks the
chosen LLM :class:`~cad.generate.base.Driver` for a ``model.py``, runs it through
the existing :func:`cad.runner.build_model` with printability verification, and on
failure feeds the traceback (or failing checks) back for another attempt. The loop
is **capped** — research shows automated refinement yields no measurable gain past
the second correction pass — and the cap is surfaced to the caller, never silent.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from cad.generate.base import Driver, Message, strip_code_fences
from cad.generate.drivers import resolve_driver
from cad.generate.prompt import build_retry_prompt, build_system_prompt, build_user_prompt
from cad.runner import DEFAULT_FORMATS, BuildResult, build_model


@dataclass
class Attempt:
    """One generate→build round, recorded for transparency in the result."""

    round: int
    ok: bool
    printable: bool | None  # None when the build itself failed
    summary: str  # one-line outcome (error head or verification summary)


@dataclass
class GenerateResult:
    """Outcome of a generation run — JSON-serialisable for the CLI / API."""

    ok: bool
    driver: str
    description: str
    dest: str
    rounds: int
    attempts: list[Attempt] = field(default_factory=list)
    model_path: str | None = None
    source: str | None = None
    build: dict[str, Any] | None = None  # final BuildResult.to_dict()
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        return d


# print.json scaffold (PLA default) — mirrors `cad new`. Kept here so a generated
# project is immediately sliceable without round-tripping through the CLI.
_PRINT_STUB = {
    "status": "designed",
    "_status_values": ["designed", "sliced", "printing", "printed-ok", "printed-fail"],
    "printer": "Creality Ender 5 S1",
    "slicer": "orca",
    "machine_profile": "Creality Ender-5 S1 0.4 nozzle",
    "process_profile": "0.20mm Standard @Creality Ender-5 S1 0.4",
    "filament": {"material": "PLA", "rationale": "Default starter material."},
    "settings": {"layer_height_mm": 0.2, "walls": 4, "infill_percent": 20, "infill_pattern": "gyroid"},
    "notes": "Generated from a free-text prompt. Sanity-check dimensions before printing.",
}


def generate_part(
    description: str,
    dest: str | Path,
    *,
    driver: str | Driver | None = None,
    model: str | None = None,
    max_rounds: int = 2,
    verify: bool = True,
    formats: tuple[str, ...] = DEFAULT_FORMATS,
    name: str | None = None,
    out_dir: str | Path | None = None,
) -> GenerateResult:
    """Generate a ``model.py`` for ``description`` into ``dest`` and build it.

    Returns a :class:`GenerateResult`; never raises for *modelling* failure (the
    traceback lands in ``.error`` / the last attempt). ``max_rounds`` bounds the
    self-correction passes after the first attempt (so up to ``max_rounds + 1``
    generations total). When ``driver`` is a string (or ``None``) it is resolved
    via :func:`resolve_driver`; a ``Driver`` instance is used directly.

    ``name`` / ``out_dir`` control the exported artifacts' base name and directory
    (default ``model`` in ``dest/artifacts`` — matching ``cad build``). The API
    passes these to place artifacts as ``<builds>/<name>/<name>.stl`` so the same
    slice path serves templates and generated parts alike.
    """
    try:
        drv: Driver = driver if isinstance(driver, Driver) else resolve_driver(driver, model=model)
    except ValueError as exc:
        return GenerateResult(
            ok=False, driver=str(driver), description=description, dest=str(dest),
            rounds=0, error=str(exc),
        )
    usable, reason = drv.available()
    if not usable:
        return GenerateResult(
            ok=False, driver=drv.name, description=description, dest=str(dest),
            rounds=0, error=f"LLM backend '{drv.name}' unavailable: {reason}",
        )

    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    model_path = dest / "model.py"
    artifacts_dir = Path(out_dir) if out_dir else dest / "artifacts"

    system = build_system_prompt()
    conversation: list[Message] = [Message("user", build_user_prompt(description))]
    result = GenerateResult(
        ok=False, driver=drv.name, description=description, dest=str(dest), rounds=0,
        model_path=str(model_path),
    )
    if max_rounds < 0:
        result.error = "max_rounds must be >= 0"
        return result

    last_build: BuildResult | None = None
    for round_no in range(max_rounds + 1):
        result.rounds = round_no + 1
        try:
            reply = drv.complete(system, conversation)
        except Exception as exc:  # noqa: BLE001 - surface backend failures to the caller
            result.error = f"LLM backend error ({drv.name}): {exc}"
            result.attempts.append(Attempt(round_no + 1, False, None, str(exc)[:200]))
            return result

        source = strip_code_fences(reply)
        model_path.write_text(source, encoding="utf-8")
        result.source = source
        conversation.append(Message("assistant", source))

        last_build = build_model(model_path, params={}, out_dir=artifacts_dir,
                                 name=name, formats=formats, verify=verify)
        printable = _is_printable(last_build, verify)
        result.attempts.append(Attempt(round_no + 1, last_build.ok, printable,
                                        _summary(last_build, verify)))

        if last_build.ok and printable is not False:
            result.ok = True
            result.build = last_build.to_dict()
            _scaffold_project(dest, last_build.metadata.get("defaults") or {})
            return result

        # Failed — feed it back unless we've exhausted the cap.
        if round_no < max_rounds:
            feedback, p = _feedback(last_build, verify)
            conversation.append(Message("user", build_retry_prompt(feedback, printable=p)))

    # Exhausted the retry cap without a printable part.
    result.build = last_build.to_dict() if last_build else None
    result.error = (
        f"Could not produce a printable part in {max_rounds + 1} attempts "
        f"(driver={drv.name}). Last outcome: {result.attempts[-1].summary}"
    )
    return result


def _is_printable(build: BuildResult, verify: bool) -> bool | None:
    """True/False printability, or None when the build itself failed."""
    if not build.ok:
        return None
    if not verify or build.verification is None:
        return True
    return bool(build.verification["printable"])


def _summary(build: BuildResult, verify: bool) -> str:
    if not build.ok:
        lines = (build.error or "").strip().splitlines()
        return f"build failed: {lines[-1][:160] if lines else 'unknown'}"
    if verify and build.verification is not None:
        v = build.verification
        return f"{'printable' if v['printable'] else 'NOT printable'} — {v['summary']}"
    return "built"


def _feedback(build: BuildResult, verify: bool) -> tuple[str, bool | None]:
    """(error text, printable flag) to hand back for the next correction round."""
    if not build.ok:
        return (build.error or "unknown build error"), None
    v = build.verification or {}
    failing = [c for c in v.get("checks", []) if not c["passed"]]
    lines = [f"- {c['name']}: {c['detail']} [{c['severity']}]" for c in failing]
    return "\n".join(lines) or v.get("summary", "not printable"), False


def _scaffold_project(dest: Path, defaults: dict[str, Any]) -> None:
    """Write params.json (the model's DEFAULTS, captured during the build) + a print.json stub.

    ``defaults`` comes from the build result's metadata, so we never re-execute the
    generated ``model.py`` just to read its ``DEFAULTS``.
    """
    if not (dest / "params.json").exists():
        try:
            payload = json.dumps(defaults, indent=2)
        except (TypeError, ValueError):  # non-JSON-serialisable defaults — best effort
            payload = "{}"
        (dest / "params.json").write_text(payload + "\n", encoding="utf-8")
    if not (dest / "print.json").exists():
        (dest / "print.json").write_text(json.dumps(_PRINT_STUB, indent=2) + "\n", encoding="utf-8")
