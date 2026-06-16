"""Tests for slice_info length_m + layer_count (API-5)."""

from __future__ import annotations

from slicer.extract import PlateInfo, count_gcode_layers


def test_length_and_weight_from_filaments():
    pl = PlateInfo(
        index=1,
        metadata={"prediction": "6720", "weight": "15.9"},
        filaments=[{"id": "1", "type": "PLA", "used_m": "5.32", "used_g": "15.9"}],
    )
    assert pl.print_time_s == 6720.0
    assert pl.weight_g == 15.9
    assert pl.length_m == 5.32


def test_length_sums_multiple_filaments_and_falls_back_to_mm():
    pl = PlateInfo(
        index=1,
        filaments=[{"used_m": "2.0"}, {"used_mm": "1500"}],
    )
    assert pl.length_m == 3.5  # 2.0 + 1500mm/1000


def test_layer_count_from_metadata():
    assert PlateInfo(index=1, metadata={"total_layer_count": "198"}).layer_count == 198


def test_count_gcode_layers_from_markers(tmp_path):
    g = tmp_path / "x.gcode"
    g.write_text("G28\n;LAYER_CHANGE\nG1 Z0.2\n; LAYER_CHANGE\nG1 Z0.4\n")
    assert count_gcode_layers(g) == 2


def test_count_gcode_layers_from_header(tmp_path):
    g = tmp_path / "x.gcode"
    g.write_text("; total layer number: 100\nG28\n;LAYER_CHANGE\n")
    assert count_gcode_layers(g) == 100  # header wins over marker count


def test_empty_plate_has_no_length_or_layers():
    pl = PlateInfo(index=1)
    assert pl.length_m is None
    assert pl.layer_count is None
