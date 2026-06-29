"""Tests for the schema-driven settings descriptor (FOUND-13)."""

from __future__ import annotations

from annotated_types import Ge, Le
from api.descriptor import build_descriptor
from api.registry import seed_ender5s1
from api.schemas import SliceSettings


def _ge_le(key: str):
    lo = hi = None
    for m in SliceSettings.model_fields[key].metadata:
        if isinstance(m, Ge):
            lo = m.ge
        elif isinstance(m, Le):
            hi = m.le
    return lo, hi


def test_descriptor_bounds_match_slicesettings():
    """The single-source-of-bounds invariant: descriptor min/max == SliceSettings ge/le."""
    d = build_descriptor(seed_ender5s1())
    for f in d.fields:
        lo, hi = _ge_le(f.key)
        if lo is not None:
            assert f.min == lo, f"{f.key} min"
        if hi is not None:
            assert f.max == hi, f"{f.key} max"


def test_literal_options_are_derived():
    fields = {f.key: f for f in build_descriptor(seed_ender5s1()).fields}
    assert set(fields["infill_pattern"].options) == {"crosshatch", "gyroid", "grid", "cubic"}
    assert set(fields["seam_position"].options) == {"aligned", "nearest", "back", "random"}


def test_covers_all_slicesettings_fields_except_raw():
    keys = {f.key for f in build_descriptor(seed_ender5s1()).fields}
    # `raw` (arbitrary overrides) and `checkpoints` (post-slice per-height setting changes)
    # aren't flat descriptor-driven controls — they have their own UI.
    expected = set(SliceSettings.model_fields) - {"raw", "checkpoints"}
    assert keys == expected


def test_per_filament_default_override():
    p = seed_ender5s1()
    fil = p.filaments[0]  # PLA, flow 0.95
    fil.settings = fil.settings.model_copy(update={"flow": 1.0})
    d = build_descriptor(p, fil)
    flow = next(f for f in d.fields if f.key == "flow")
    assert flow.default == 1.0
    assert d.filament_id == "pla"


def test_support_threshold_gates_on_support():
    d = build_descriptor(seed_ender5s1())
    st = next(f for f in d.fields if f.key == "support_threshold")
    assert st.depends_on == {"field": "support", "equals": True}


def test_jerk_is_advanced_and_print_speed_maps_to_wall_speed():
    d = build_descriptor(seed_ender5s1())
    by_key = {f.key: f for f in d.fields}
    assert by_key["jerk"].advanced is True
    # the design label "Print speed" is the cosmetic label on the real key wall_speed
    assert by_key["wall_speed"].label == "Print speed"
