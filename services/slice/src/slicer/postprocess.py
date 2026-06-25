"""G-code post-processing — per-height setting changes the slicer config can't express.

A **checkpoint** says "from this fraction of the print height upward, use these settings". Only
things that can change mid-print via a single g-code command are supported — nozzle temp (M104),
bed temp (M140), fan (M106/M107), flow / extrusion multiplier (M221), and feed-rate / speed
factor (M220). Retraction and structural settings (walls, infill) are baked into the toolpaths,
so they can't change mid-print without a re-slice.

Stack several checkpoints to ramp settings up the print (e.g. drop temp + boost fan near the top
where heat soak causes stringing, while the lower layers keep the profile's settings).
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from pathlib import Path

# A G0/G1 move carrying a Z value (before any inline comment).
_Z_MOVE = re.compile(r"^G[01]\b[^;]*\bZ(-?\d+(?:\.\d+)?)")
# A G1 that extrudes (carries an E) — i.e. actual printing, at the current layer Z. Used to find
# the real print height, ignoring the start-g-code Z clearance / end-of-print bed drop (no E).
_EXTRUDE = re.compile(r"^G1\b[^;]*\bE-?\d")


def _checkpoint_gcode(cp: Mapping, from_pct: float) -> list[str]:
    """The M-codes for one checkpoint (only the fields that are set)."""
    tag = f"checkpoint @{from_pct:.0f}%"
    out: list[str] = []
    if cp.get("nozzle_temp") is not None:
        out.append(f"M104 S{int(cp['nozzle_temp'])} ; {tag}: nozzle temp")
    if cp.get("bed_temp") is not None:
        out.append(f"M140 S{int(cp['bed_temp'])} ; {tag}: bed temp")
    if cp.get("fan_percent") is not None:
        pct = int(cp["fan_percent"])
        if pct <= 0:
            out.append(f"M107 ; {tag}: fan off")
        else:
            out.append(f"M106 S{max(1, min(255, round(255 * pct / 100)))} ; {tag}: fan {pct}%")
    if cp.get("flow_percent") is not None:
        out.append(f"M221 S{int(cp['flow_percent'])} ; {tag}: flow %")
    if cp.get("speed_percent") is not None:
        out.append(f"M220 S{int(cp['speed_percent'])} ; {tag}: speed %")
    return out


def apply_checkpoints(gcode_path: str | Path, checkpoints: Sequence[Mapping]) -> int:
    """Inject each checkpoint's settings at the first printing layer past its height %. Edits the
    g-code in place. Returns how many checkpoints actually injected something."""
    if not checkpoints:
        return 0
    path = Path(gcode_path)
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()

    # Print height = the highest Z that actually EXTRUDED — so the start-g-code Z clearance and
    # the end-of-print bed drop (which move Z high but don't print) don't throw off the %.
    z = 0.0
    print_top = 0.0
    for line in lines:
        if (m := _Z_MOVE.match(line)) is not None:
            z = float(m.group(1))
        if z > print_top and _EXTRUDE.match(line) is not None:
            print_top = z
    if print_top <= 0:
        heights = [float(m.group(1)) for line in lines if (m := _Z_MOVE.match(line))]
        print_top = max(heights, default=0.0)
    if print_top <= 0:
        return 0

    # [threshold_mm, gcode_lines, injected?] per checkpoint, in height order.
    pending: list[list] = []
    for cp in sorted(checkpoints, key=lambda c: c.get("from_pct", 0.0)):
        gcode = _checkpoint_gcode(cp, float(cp.get("from_pct", 0.0)))
        if gcode:
            pending.append([(float(cp.get("from_pct", 0.0)) / 100.0) * print_top, gcode, False])
    if not pending:
        return 0

    out: list[str] = []
    z = 0.0
    applied = 0
    for line in lines:
        if (m := _Z_MOVE.match(line)) is not None:
            z = float(m.group(1))
        # At the first EXTRUDING move past a checkpoint's height, inject its settings (gating on
        # extrusion skips the start-g-code Z raise that has no extrusion).
        if _EXTRUDE.match(line) is not None:
            for entry in pending:
                if not entry[2] and z >= entry[0]:
                    out.extend(entry[1])
                    entry[2] = True
                    applied += 1
        out.append(line)
    if applied:
        path.write_text("\n".join(out) + "\n", encoding="utf-8")
    return applied
