"""Tests for the build-volume fit check (no CAD engine required — pure geometry)."""

from __future__ import annotations

from cad.printer import ENDER_5_S1, BuildVolume, Printer, fits


def test_ender5s1_profile() -> None:
    assert ENDER_5_S1.name == "Creality Ender 5 S1"
    assert ENDER_5_S1.build_volume.as_dict() == {"x": 220.0, "y": 220.0, "z": 280.0}
    # 5 mm margin per edge -> 210 mm usable footprint, full Z.
    assert ENDER_5_S1.usable_volume().as_dict() == {"x": 210.0, "y": 210.0, "z": 280.0}


def test_part_within_usable_bed_fits() -> None:
    result = fits({"x": 210.0, "y": 180.0, "z": 70.0})
    assert result.fits is True
    assert result.requires_rotation is False
    assert result.overflow_mm == {"x": 0.0, "y": 0.0, "z": 0.0}


def test_part_wider_than_bed_does_not_fit() -> None:
    # The original fridge_drawer width (240 mm) overran the 210 mm usable bed.
    result = fits({"x": 240.0, "y": 180.0, "z": 70.0})
    assert result.fits is False
    assert result.overflow_mm["x"] == 30.0  # 240 - 210
    assert result.overflow_mm["y"] == 0.0
    assert result.overflow_mm["z"] == 0.0


def test_too_tall_does_not_fit() -> None:
    result = fits({"x": 100.0, "y": 100.0, "z": 300.0})
    assert result.fits is False
    assert result.overflow_mm["z"] == 20.0  # 300 - 280


def test_rotation_helps_on_a_non_square_bed() -> None:
    # A deliberately rectangular machine so a 90° Z rotation actually matters.
    rect = Printer("Rect", BuildVolume(300.0, 200.0, 250.0), bed_margin_mm=0.0)
    # 280 × 150: too deep as modelled (150 < 200 ok, 280 < 300 ok) actually fits...
    # Use 190 × 280: as modelled x=190<=300 ok, y=280>200 -> overruns by 80.
    result = fits({"x": 190.0, "y": 280.0, "z": 10.0}, rect)
    assert result.fits is True
    assert result.requires_rotation is True
    assert result.overflow_mm == {"x": 0.0, "y": 0.0, "z": 0.0}


def test_rotation_can_be_disabled() -> None:
    rect = Printer("Rect", BuildVolume(300.0, 200.0, 250.0), bed_margin_mm=0.0)
    result = fits({"x": 190.0, "y": 280.0, "z": 10.0}, rect, allow_rotation=False)
    assert result.fits is False
    assert result.requires_rotation is False
    assert result.overflow_mm["y"] == 80.0  # 280 - 200


def test_margin_override() -> None:
    # Zero margin makes the full 220 mm bed usable.
    result = fits({"x": 220.0, "y": 220.0, "z": 50.0}, margin=0.0)
    assert result.fits is True
