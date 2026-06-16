"""Target-printer profile and build-volume fit checks.

The pipeline targets a single machine — the Creality **Ender 5 S1** — so every
part the runner builds is checked against its build volume. This module is the
**single source of truth** for that envelope on the Python side; the TypeScript
control plane mirrors the same numbers in ``packages/types`` (``ENDER_5_S1``),
exactly as the API schemas and Zod types are kept in parity.

See ``docs/printer-ender5s1.md`` for the full machine reference (firmware, nozzle,
materials). Here we only care about the printable envelope.
"""

from __future__ import annotations

from dataclasses import dataclass

# Tolerance (mm) for floating-point bbox comparisons — a part whose extent equals
# the usable envelope to within this counts as fitting.
_EPS = 1e-6


@dataclass(frozen=True)
class BuildVolume:
    """Print envelope in millimetres (X × Y bed footprint, Z height)."""

    x: float
    y: float
    z: float

    def as_dict(self) -> dict[str, float]:
        return {"x": self.x, "y": self.y, "z": self.z}


@dataclass(frozen=True)
class Printer:
    """A target machine: its build volume plus a recommended bed-edge margin."""

    name: str
    build_volume: BuildVolume
    # Clearance kept free on each X/Y bed edge (skirt/brim room, imperfect
    # homing, bed-clip clearance). Applied to the footprint only, never to Z.
    bed_margin_mm: float = 0.0

    def usable_volume(self, margin: float | None = None) -> BuildVolume:
        """The footprint actually safe to place a part on, after the margin."""
        m = self.bed_margin_mm if margin is None else margin
        return BuildVolume(
            x=self.build_volume.x - 2 * m,
            y=self.build_volume.y - 2 * m,
            z=self.build_volume.z,
        )


# Single source of truth for the target machine's envelope (see docs).
ENDER_5_S1 = Printer(
    name="Creality Ender 5 S1",
    build_volume=BuildVolume(220.0, 220.0, 280.0),
    bed_margin_mm=5.0,
)


# The fit check targets the registry's *default* printer. The API sets this at startup
# from ~/.agent-cad (``set_active_printer``); it defaults to the Ender 5 S1 so the CLI
# and tests work with zero setup.
_active_printer: Printer = ENDER_5_S1


def set_active_printer(printer: Printer) -> None:
    """Point fit checks at ``printer`` (the registry's default machine)."""
    global _active_printer
    _active_printer = printer


def active_printer() -> Printer:
    """The printer ``fits()`` checks against when no explicit printer is given."""
    return _active_printer


@dataclass(frozen=True)
class FitResult:
    """Outcome of checking a part's bounding box against a build volume."""

    fits: bool
    printer: str
    build_volume_mm: dict[str, float]
    usable_mm: dict[str, float]
    # mm each axis exceeds the usable envelope (0.0 when within), reported for the
    # best-fitting orientation so it reads as "shrink by this much to fit".
    overflow_mm: dict[str, float]
    # True only when the part does NOT fit as modelled but DOES fit rotated 90°
    # about Z (swapping its X/Y extents).
    requires_rotation: bool

    def as_dict(self) -> dict[str, object]:
        return {
            "fits": self.fits,
            "printer": self.printer,
            "build_volume_mm": self.build_volume_mm,
            "usable_mm": self.usable_mm,
            "overflow_mm": self.overflow_mm,
            "requires_rotation": self.requires_rotation,
        }


def fits(
    size_mm: dict[str, float] | tuple[float, float, float],
    printer: Printer | None = None,
    *,
    allow_rotation: bool = True,
    margin: float | None = None,
) -> FitResult:
    """Check whether a part of bounding box ``size_mm`` fits ``printer``.

    The X/Y footprint is tested against the usable bed (build volume minus
    ``margin`` on each edge); Z against the full build height. When
    ``allow_rotation`` is set, a 90° rotation about Z (swapping the X/Y extents)
    is considered and the better-fitting orientation is reported. ``margin``
    overrides the printer's default ``bed_margin_mm`` when given.
    """
    if printer is None:
        printer = _active_printer
    if isinstance(size_mm, dict):
        sx, sy, sz = float(size_mm["x"]), float(size_mm["y"]), float(size_mm["z"])
    else:
        sx, sy, sz = (float(v) for v in size_mm)

    usable = printer.usable_volume(margin)
    z_over = max(0.0, sz - usable.z)

    def xy_overflow(fx: float, fy: float) -> tuple[float, float]:
        return max(0.0, fx - usable.x), max(0.0, fy - usable.y)

    ox, oy = xy_overflow(sx, sy)
    fits_as_modelled = (ox + oy + z_over) <= _EPS

    bx, by = ox, oy
    rotated_better = False
    if allow_rotation:
        rx, ry = xy_overflow(sy, sx)  # swap the X/Y footprint
        if (rx + ry) < (ox + oy):
            bx, by, rotated_better = rx, ry, True

    fits_best = (bx + by + z_over) <= _EPS
    return FitResult(
        fits=fits_best,
        printer=printer.name,
        build_volume_mm=printer.build_volume.as_dict(),
        usable_mm=usable.as_dict(),
        overflow_mm={"x": round(bx, 4), "y": round(by, 4), "z": round(z_over, 4)},
        requires_rotation=fits_best and rotated_better and not fits_as_modelled,
    )
