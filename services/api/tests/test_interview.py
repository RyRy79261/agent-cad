"""Interview intake: STL-engage guidance + safe degradation without an LLM."""

from __future__ import annotations

from api.interview import INTERVIEW_SYSTEM, _parse_interview, interview_turn


def test_first_reply_guidance_and_interpretation_capture():
    # The prompt instructs a first-turn interpretation, and the parser keeps it.
    assert "always show your interpretation" in INTERVIEW_SYSTEM and "LATER REPLIES" in INTERVIEW_SYSTEM
    q = _parse_interview(
        '{"status":"question","interpretation":"A flat 90mm disc, 4mm thick, with a raised rim.",'
        '"question":"How tall a rim?","suggestions":["2mm","4mm"]}'
    )
    assert q["interpretation"].startswith("A flat 90mm disc") and q["question"] == "How tall a rim?"
    # an interpretation can ride along even on a "ready" reply
    r = _parse_interview('{"status":"ready","interpretation":"A simple 30mm cube."}')
    assert r["status"] == "ready" and r["interpretation"] == "A simple 30mm cube."
    # plain replies still parse with no interpretation key
    assert "interpretation" not in _parse_interview('{"status":"ready"}')


def test_interview_turn_accepts_first_turn_flag():
    # first_turn must be accepted + still degrade safely without a driver.
    out = interview_turn("a phone stand", first_turn=True, driver="claude-code")
    assert out["status"] == "ready"  # no driver in tests → graceful degrade


def test_system_prompt_has_stl_engage_guidance():
    # When an STL is attached the agent must rebuild parametrically and ask about features.
    assert "rebuild it as fresh parametric code" in INTERVIEW_SYSTEM
    assert "VIEW each render with the Read tool" in INTERVIEW_SYSTEM
    # image sketches stay frictionless
    assert "keep sketch→model frictionless" in INTERVIEW_SYSTEM


def test_interview_degrades_to_ready_with_references_and_no_driver():
    # conftest points the claude bin at an unavailable binary; passing attachments/ref_note
    # must not raise — intake degrades to ready so nothing deadlocks.
    out = interview_turn(
        "add a lip to this",
        attachments=["/tmp/nonexistent-render.png"],
        ref_note="\n- 'plate.stl': an STL reference, 80×50×4 mm.",
        driver="claude-code",
    )
    assert out["status"] == "ready"
