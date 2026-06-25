"""Checkpoints: inject per-height setting changes (temp/bed/fan/flow/speed) after slicing."""

from __future__ import annotations

from slicer.postprocess import apply_checkpoints


def _synthetic_gcode(tmp_path):
    # Ten printing layers, Z 0.2 .. 2.0 (max 2.0mm), each Z move followed by an extruding move.
    lines = [";START", "G1 Z50 F600 ; start-gcode clearance, no extrusion"]
    for i in range(1, 11):
        lines.append(f"G1 Z{i * 0.2:.1f} F300")
        lines.append(f"G1 X10 Y10 E{i} ; layer {i}")
    g = tmp_path / "out.gcode"
    g.write_text("\n".join(lines) + "\n")
    return g


def test_multiple_checkpoints_inject_at_their_heights(tmp_path):
    g = _synthetic_gcode(tmp_path)
    n = apply_checkpoints(
        g,
        [
            {"from_pct": 50, "nozzle_temp": 205, "fan_percent": 80},
            {"from_pct": 90, "nozzle_temp": 195, "fan_percent": 100, "speed_percent": 60},
        ],
    )
    assert n == 2
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


def test_noop_when_no_settings(tmp_path):
    g = _synthetic_gcode(tmp_path)
    assert apply_checkpoints(g, [{"from_pct": 80}]) == 0  # no fields set → nothing to inject
    assert apply_checkpoints(g, []) == 0
