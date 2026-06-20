"""Interview intake: STL-engage guidance + safe degradation without an LLM."""

from __future__ import annotations

from api.interview import INTERVIEW_SYSTEM, interview_turn


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
