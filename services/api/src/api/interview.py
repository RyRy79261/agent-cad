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


def interview_turn(
    brief: str, *, driver: str | None = None, model: str | None = None, effort: str | None = None
) -> dict:
    """One clarifying turn. Returns ``{status: question, question, suggestions}`` or
    ``{status: ready}`` — never raises, never blocks intake."""
    try:
        drv = resolve_driver(driver, model=model, effort=effort)
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
    result = _parse_interview(reply)
    result["usage"] = getattr(drv, "last_usage", None)
    return result


RESPOND_SYSTEM = """\
You are a 3D-CAD design collaborator in an ongoing chat about a part that ALREADY EXISTS.
The current model is summarised below. The user just sent a message — decide what they want and
reply with ONE LINE of strict JSON, no prose, no code fences:

- They want to CHANGE the model (add / remove / resize / fix a feature, etc.):
  {"action":"edit","instruction":"<one clear, specific, self-contained edit instruction>"}
- They're asking a QUESTION, giving an opinion, or thinking out loud (what's possible, materials,
  trade-offs, "what if…", "why is it…"):
  {"action":"chat","reply":"<a concise, helpful reply — answer, suggest options, or ask a
  clarifying question; talk like a collaborator. If you think an edit is implied, suggest it and
  ask whether to apply it. NEVER write code here.>"}

Be conservative about editing: only choose "edit" when they clearly want the model changed NOW.
When in doubt, choose "chat" and help them think — do not silently regenerate.

Current model:
{summary}
"""


def _parse_respond(reply: str) -> dict:
    """Parse the respond classifier. Ambiguous/garbled → 'chat' (never a surprise rebuild)."""
    m = _OBJ_RE.search(reply or "")
    if not m:
        return {"action": "chat", "reply": (reply or "").strip()[:600] or "Could you say a bit more?"}
    try:
        data = json.loads(m.group(0))
    except (ValueError, TypeError):
        return {"action": "chat", "reply": "Could you rephrase that — do you want me to change the model?"}
    if isinstance(data, dict):
        if data.get("action") == "edit" and isinstance(data.get("instruction"), str) and data["instruction"].strip():
            return {"action": "edit", "instruction": data["instruction"].strip()}
        if data.get("action") == "chat" and isinstance(data.get("reply"), str):
            return {"action": "chat", "reply": data["reply"].strip()}
    return {"action": "chat", "reply": "Did you want me to make a change, or talk it through first?"}


def respond_turn(
    message: str,
    current_summary: str | None,
    *,
    driver: str | None = None,
    model: str | None = None,
    effort: str | None = None,
) -> dict:
    """Classify a message on an existing model: a conversational reply, or an edit instruction.

    Degrades to ``{"action":"edit","instruction":message}`` only when the driver is unavailable,
    so behaviour without an LLM matches the old 'every message refines' flow.
    """
    try:
        drv = resolve_driver(driver, model=model, effort=effort)
    except ValueError:
        return {"action": "edit", "instruction": message.strip()}
    usable, _ = drv.available()
    if not usable:
        return {"action": "edit", "instruction": message.strip()}
    system = RESPOND_SYSTEM.replace("{summary}", (current_summary or "(no summary available)").strip())
    user = f"User's latest message:\n\n{message.strip()}\n\nReply with the JSON object only."
    try:
        reply = drv.complete(system, [Message("user", user)])
    except Exception:  # noqa: BLE001 - any backend failure falls back to a safe chat reply
        return {"action": "chat", "reply": "Sorry, I had trouble there — try again?"}
    result = _parse_respond(reply)
    result["usage"] = getattr(drv, "last_usage", None)
    return result
