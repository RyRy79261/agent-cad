"""G-code post-processing — changes that the slicer config can't express per-height.

The cooling checkpoint: on a tall print, the lower layers print perfectly but heat soaks
into the part and the chamber, so the top layers ooze/string. This injects a one-time nozzle
temperature drop and/or a fan boost once the print passes a chosen fraction of its height —
leaving everything below that point untouched.
"""

from __future__ import annotations

import re
from pathlib import Path

# A G0/G1 move carrying a Z value (before any inline comment).
_Z_MOVE = re.compile(r"^G[01]\b[^;]*\bZ(-?\d+(?:\.\d+)?)")
# A G1 that extrudes (carries an E) — i.e. actual printing, at the current layer Z. Used to find
# the real print height, ignoring the end-of-print bed drop / Z lifts (which carry no extrusion).
_EXTRUDE = re.compile(r"^G1\b[^;]*\bE-?\d")


def apply_cooling_checkpoint(
    gcode_path: str | Path,
    *,
    from_pct: float,
    nozzle_temp: int | None = None,
    fan_percent: int | None = None,
) -> bool:
    """Once the print passes ``from_pct``% of its total height, set ``nozzle_temp`` (°C, via a
    non-blocking ``M104``) and/or ``fan_percent`` (0–100, via ``M106``) — once. Edits the g-code
    in place. Returns ``True`` if a change was injected, ``False`` if there was nothing to do.
    """
    if nozzle_temp is None and fan_percent is None:
        return False
    path = Path(gcode_path)
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()

    # Print height = the highest Z that actually EXTRUDED — so the end-of-print bed drop / Z lifts
    # (which move Z high but don't print) don't inflate it and push the checkpoint past the top.
    z = 0.0
    print_top = 0.0
    for line in lines:
        if (m := _Z_MOVE.match(line)) is not None:
            z = float(m.group(1))
        if z > print_top and _EXTRUDE.match(line) is not None:
            print_top = z
    if print_top <= 0:  # fall back to any Z if we somehow saw no extrusion
        heights = [float(m.group(1)) for line in lines if (m := _Z_MOVE.match(line))]
        print_top = max(heights, default=0.0)
    if print_top <= 0:
        return False
    threshold = max(0.0, (from_pct / 100.0) * print_top)

    inject: list[str] = []
    if nozzle_temp is not None:
        inject.append(f"M104 S{int(nozzle_temp)} ; cooling checkpoint: nozzle temp from {from_pct:.0f}% height")
    if fan_percent is not None:
        pwm = max(0, min(255, round(255 * fan_percent / 100)))
        inject.append(f"M106 S{pwm} ; cooling checkpoint: fan {fan_percent:.0f}% from {from_pct:.0f}% height")

    out: list[str] = []
    z = 0.0
    injected = False
    for line in lines:
        if (m := _Z_MOVE.match(line)) is not None:
            z = float(m.group(1))
        # Inject right before the first EXTRUDING move at/above the threshold — i.e. the start of
        # the first printing layer past the checkpoint. Gating on extrusion skips the start-g-code
        # Z raise (clearance move with no extrusion) that would otherwise trigger at z >= threshold.
        if not injected and z >= threshold and _EXTRUDE.match(line) is not None:
            out.extend(inject)
            injected = True
        out.append(line)
    if injected:
        path.write_text("\n".join(out) + "\n", encoding="utf-8")
    return injected
