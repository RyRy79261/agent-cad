"""The respond classifier: parse chat-vs-edit, and degrade safely without an LLM."""

from __future__ import annotations

from api.interview import _parse_respond, respond_turn


def test_parse_edit_action():
    out = _parse_respond('{"action":"edit","instruction":"make it 6mm thick"}')
    assert out == {"action": "edit", "instruction": "make it 6mm thick"}


def test_parse_chat_action():
    out = _parse_respond('{"action":"chat","reply":"PLA is a good choice here."}')
    assert out == {"action": "chat", "reply": "PLA is a good choice here."}


def test_parse_tolerates_prose_and_fences():
    out = _parse_respond('Sure!\n```json\n{"action":"chat","reply":"Use PETG for heat."}\n```')
    assert out["action"] == "chat" and "PETG" in out["reply"]


def test_garbled_defaults_to_chat_not_a_surprise_rebuild():
    # An unparseable reply must NOT silently trigger a regeneration.
    assert _parse_respond("???").get("action") == "chat"
    assert _parse_respond("").get("action") == "chat"


def test_edit_without_instruction_falls_back_to_chat():
    assert _parse_respond('{"action":"edit"}').get("action") == "chat"


def test_respond_turn_degrades_to_edit_when_driver_unavailable():
    # conftest points AGENT_CAD_CLAUDE_BIN at an unavailable binary → preserve old
    # 'a message is an edit' behaviour rather than dropping the request.
    out = respond_turn("make it taller", "a 100mm plate", driver="claude-code")
    assert out == {"action": "edit", "instruction": "make it taller"}
