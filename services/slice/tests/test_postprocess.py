"""Cooling checkpoint: inject a one-time temp/fan change once the print passes a height %."""

from __future__ import annotations

from slicer.postprocess import apply_cooling_checkpoint


def _synthetic_gcode(tmp_path):
    # Ten layers, Z 0.2 .. 2.0 (max 2.0mm).
    lines = [";START"]
    for i in range(1, 11):
        lines.append(f"G1 Z{i * 0.2:.1f} F300")
        lines.append(f"G1 X10 Y10 E1 ; layer {i}")
    g = tmp_path / "out.gcode"
    g.write_text("\n".join(lines) + "\n")
    return g


def test_injects_once_near_the_top(tmp_path):
    g = _synthetic_gcode(tmp_path)
    # 80% of the 2.0mm height = 1.6mm → the change lands at the Z1.6 layer, once.
    assert apply_cooling_checkpoint(g, from_pct=80, nozzle_temp=200, fan_percent=100) is True
    out = g.read_text()
    assert out.count("M104 S200") == 1 and out.count("M106 S255") == 1
    # injected near the top: after Z1.6, and the bottom layers are untouched.
    assert out.index("G1 Z0.4") < out.index("G1 Z1.6") < out.index("M104 S200")


def test_fan_percent_scales_to_pwm(tmp_path):
    g = tmp_path / "o.gcode"
    g.write_text("G1 Z1.0 F300\nG1 X1 Y1 E1\nG1 Z2.0 F300\nG1 X2 Y2 E2\n")
    apply_cooling_checkpoint(g, from_pct=0, fan_percent=50)
    assert "M106 S128" in g.read_text()  # 50% → round(255*0.5) = 128


def test_ignores_start_gcode_z_raise(tmp_path):
    # OrcaSlicer's start g-code raises Z high (clearance) BEFORE printing — that must not be
    # mistaken for the print height nor trigger the injection.
    g = tmp_path / "o.gcode"
    g.write_text(
        "G28\nG1 Z50 F600 ; start-gcode clearance, no extrusion\n"
        "G1 Z0.2 F300\nG1 X1 Y1 E0.5 ; prime\n"  # printing starts low
        "G1 Z2.0 F300\nG1 X2 Y2 E1 ; top layer\n"
    )
    assert apply_cooling_checkpoint(g, from_pct=80, fan_percent=100) is True
    out = g.read_text()
    # print height is 2.0 (not 50); the boost lands at the top extruding layer, after Z2.0,
    # and NOT at the early Z50 clearance move.
    assert out.index("G1 Z2.0") < out.index("M106 S255")
    assert out.index("Z50") < out.index("G1 Z2.0")  # the Z50 came first and was left alone


def test_noop_when_nothing_to_change(tmp_path):
    g = tmp_path / "o.gcode"
    g.write_text("G1 Z1.0 F300\n")
    assert apply_cooling_checkpoint(g, from_pct=50) is False
    assert "M104" not in g.read_text() and "M106" not in g.read_text()
