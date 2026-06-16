"""Clarify-before-generate interview (API-9).

A one-off LLM turn that decides whether a part brief is detailed enough to design, or
asks ONE clarifying question with a few suggested answers. Uses only the pluggable
``Driver.complete(system, messages)`` — no new driver method. Always degrades to
``{"status": "ready"}`` on any failure so intake never deadlocks.
"""

from __future__ import annotations

import json
import re

from cad.generate.base import Message
from cad.generate.drivers import resolve_driver

INTERVIEW_SYSTEM = """\
You are a CAD intake assistant. The user wants to 3D-print a part and gave a brief
description. Decide if the brief has enough detail to design a printable part (rough
dimensions, shape, key features). Reply with ONE LINE of strict JSON, no prose, no code
fences:
- If a single most-useful clarifying question would materially improve the design:
  {"status":"question","question":"<one short question>","suggestions":["<2-4 short answers>"]}
- If the brief is already sufficient to start designing:
  {"status":"ready"}
Ask at most ONE question. Keep the question and each suggestion under ~8 words. Never ask
about slicer or printer settings (those are handled elsewhere).
"""

_OBJ_RE = re.compile(r"\{.*\}", re.DOTALL)  # outermost {...}, tolerates fences/prose


def _parse_interview(reply: str) -> dict:
    m = _OBJ_RE.search(reply or "")
    if not m:
        return {"status": "ready"}
    try:
        data = json.loads(m.group(0))
    except (ValueError, TypeError):
        return {"status": "ready"}
    if not isinstance(data, dict):  # json may be a list/number/string
        return {"status": "ready"}
    if data.get("status") == "question" and isinstance(data.get("question"), str):
        sugg = data.get("suggestions")
        sugg = [str(s) for s in sugg][:4] if isinstance(sugg, list) else []
        return {"status": "question", "question": data["question"].strip(), "suggestions": sugg}
    return {"status": "ready"}


def interview_turn(brief: str, *, driver: str | None = "anthropic", model: str | None = None) -> dict:
    """One clarifying turn. Returns ``{status: question, question, suggestions}`` or
    ``{status: ready}`` — never raises, never blocks intake."""
    try:
        drv = resolve_driver(driver, model=model)
    except ValueError as exc:
        return {"status": "ready", "reason": f"interview skipped: {exc}"}
    usable, reason = drv.available()
    if not usable:
        return {"status": "ready", "reason": f"interview skipped: {reason}"}
    user = f"Part brief so far:\n\n{brief.strip()}\n\nReply with the JSON object only."
    try:
        reply = drv.complete(INTERVIEW_SYSTEM, [Message("user", user)])
    except Exception as exc:  # noqa: BLE001 - any backend failure must not block intake
        return {"status": "ready", "reason": f"interview error: {exc}"}
    return _parse_interview(reply)
