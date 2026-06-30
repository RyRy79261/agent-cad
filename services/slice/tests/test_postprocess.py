"""Checkpoints: inject per-height setting changes (temp/bed/fan/flow/speed) after slicing."""

from __future__ import annotations

from slicer.postprocess import _EXTRUDE, apply_checkpoints


def test_extrude_regex_matches_only_real_printing_moves():
    assert _EXTRUDE.match("G1 X10 Y10 E1.5 F600")  # printing (absolute)
    assert _EXTRUDE.match("G1 X32.017 Y29.432 E.03956")  # printing (M83 relative — leading-dot E)
    assert not _EXTRUDE.match("G1 E-2.0 F1800")  # retract (no X/Y, negative E)
    assert not _EXTRUDE.match("G1 E5 F1800")  # prime / de-retract (no X/Y)
    assert not _EXTRUDE.match("G1 Z50 F600")  # Z clearance
    assert not _EXTRUDE.match("G0 X10 Y10 F9000")  # travel


def _synthetic_gcode(tmp_path):
    # Ten printing layers, Z 0.2 .. 2.0 (max 2.0mm), each preceded by a ;LAYER_CHANGE marker
    # and followed by an extruding move.
    lines = [";START", "G1 Z50 F600 ; start-gcode clearance, no extrusion"]
    for i in range(1, 11):
        lines.append(";LAYER_CHANGE")
        lines.append(f"G1 Z{i * 0.2:.1f} F300")
        lines.append(f"G1 X10 Y10 E{i} ; layer {i}")
    g = tmp_path / "out.gcode"
    g.write_text("\n".join(lines) + "\n")
    return g


def test_layer_anchored_checkpoint(tmp_path):
    g = _synthetic_gcode(tmp_path)
    # "from layer 8 up" → inject at the 8th ;LAYER_CHANGE (Z1.6), not a %.
    assert len(apply_checkpoints(g, [{"from_layer": 8, "nozzle_temp": 190}])) == 1
    out = g.read_text().splitlines()
    inj = next(i for i, line in enumerate(out) if "M104 S190" in line)
    # it lands in layer 8: after the 8th ;LAYER_CHANGE and at/after Z1.6, before layer 9 (Z1.8).
    assert out.index("G1 Z1.6 F300") < inj < out.index("G1 Z1.8 F300")
    assert "@layer 8" in out[inj]


def test_multiple_checkpoints_inject_at_their_heights(tmp_path):
    g = _synthetic_gcode(tmp_path)
    applied = apply_checkpoints(
        g,
        [
            {"from_pct": 50, "nozzle_temp": 205, "fan_percent": 80},
            {"from_pct": 90, "nozzle_temp": 195, "fan_percent": 100, "speed_percent": 60},
        ],
    )
    assert len(applied) == 2
    out = g.read_text()
    # print height = 2.0 → 50% lands at Z1.0, 90% at Z1.8; each set injects once, in order.
    assert out.count("M104 S205") == 1 and out.count("M104 S195") == 1
    assert "M106 S204" in out  # 80% → round(255*0.8)=204
    assert "M106 S255" in out and "M220 S60" in out  # the top checkpoint
    assert out.index("M104 S205") < out.index("M104 S195")  # 50% checkpoint before the 90% one
    # the start-gcode Z50 clearance is left untouched (not treated as the print height)
    assert out.index("Z50") < out.index("M104 S205")


def test_fan_off_uses_m107_and_flow_scales(tmp_path):
    g = _synthetic_gcode(tmp_path)
    apply_checkpoints(g, [{"from_pct": 0, "fan_percent": 0, "flow_percent": 95}])
    out = g.read_text()
    assert "M107 ; checkpoint @0%: fan off" in out and "M221 S95" in out


def test_motion_settings_inject_m205_and_m204(tmp_path):
    g = _synthetic_gcode(tmp_path)
    assert len(apply_checkpoints(g, [{"from_pct": 0, "jerk": 12, "accel": 800}])) == 1
    out = g.read_text()
    assert "M205 X12 Y12 ; checkpoint @0%: jerk" in out
    assert "M204 P800 ; checkpoint @0%: acceleration" in out


def test_noop_when_no_settings(tmp_path):
    g = _synthetic_gcode(tmp_path)
    assert apply_checkpoints(g, [{"from_pct": 80}]) == []  # no fields set → nothing to inject
    assert apply_checkpoints(g, []) == []
