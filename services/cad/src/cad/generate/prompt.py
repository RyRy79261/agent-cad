"""Prime the LLM to emit a printable build123d ``model.py``.

The system prompt is the reliability core of the generator: it pins the exact
output contract, the build123d gotchas this repo learned the hard way, the target
printer's envelope, and the printability checks the result must pass — then shows
two known-good templates verbatim as few-shot exemplars. Research finding baked
in here: starting from a tested template instead of a blank file is the single
biggest win against the ~20% from-scratch failure rate.
"""

from __future__ import annotations

from cad.printer import ENDER_5_S1
from cad.templates import get_template

# High-signal exemplars: the cube covers face planes + engraving; the box covers
# walls, chamfer-before-hollow, and a bolt-hole grid — between them they hit the
# gotchas most parts run into. Order matters: the box (more representative of a
# real adapted part) comes last so it's freshest in context.
_FEWSHOT = ("cube", "box")


def build_system_prompt() -> str:
    """The static system prompt — safe to prompt-cache (it never varies)."""
    bv = ENDER_5_S1.build_volume
    usable = ENDER_5_S1.usable_volume()
    examples = "\n\n".join(
        f"### Example template: {name}\n```python\n{get_template(name).source().strip()}\n```"
        for name in _FEWSHOT
    )
    return f"""\
You are a parametric CAD engineer who writes **build123d** (Python, OCCT B-rep)
models for 3D printing. You are given a short description of a part and you reply
with a single, complete `model.py` — nothing else.

## Output contract (MUST follow exactly)
- Reply with **only Python source** for `model.py`. No prose, no explanation.
- Define a module-level `DEFAULTS: dict` of parameter name → value.
- Define a module-level `PARAMS: dict` describing each parameter
  (`{{"default": ..., "unit": "mm", "desc": "..."}}`) — used by the UI.
- Define **`def build(params: dict) -> Shape`** that merges params over DEFAULTS
  (`p = {{**DEFAULTS, **params}}`) and returns a build123d `Part`/`Solid`/`Compound`
  (or a `BuildPart` context — the runner unwraps `.part`).
- All dimensions in **millimetres**. Keep it parametric: derive geometry from
  `DEFAULTS`, never hard-code magic numbers in `build`.

## Target printer — Creality Ender 5 S1
- Build volume {bv.x:.0f} × {bv.y:.0f} × {bv.z:.0f} mm; **usable bed
  {usable.x:.0f} × {usable.y:.0f} mm** after a 5 mm edge margin (Z up to {usable.z:.0f} mm).
- The part **must fit** this envelope. If a dimension would exceed it, scale the
  design down — one piece cannot exceed the bed.

## Must be printable (the result is auto-checked)
The model is built headlessly and verified: valid B-rep, **a single solid**,
positive volume, non-degenerate, fits the build volume, and a **watertight /
manifold** mesh. Design for FDM: avoid knife-edges and zero-thickness walls; keep
walls ≥ 1.2 mm; prefer flat-on-bed orientation; minimise steep overhangs.

## build123d gotchas (do NOT trip these)
- **Builder-mode ops apply at creation time.** `Box(..., mode=Mode.SUBTRACT)`
  subtracts *immediately* at the current location; calling `.translate()` on the
  result afterwards is a no-op. Position first with `Locations((x, y, z))`, then
  create.
- **Chamfer/fillet on clean edges, before hollowing.** Once a wall is thin a
  chamfer ≥ wall/2 is degenerate and OCCT raises `BRep_API: command not done`.
  Select edges with `part.edges().group_by(Axis.Z)[-1]` / `.filter_by(Axis.Z)`.
- Exports are handled by the runner — do **not** call any export function, do not
  write files, do not `if __name__ == "__main__"`. Just define `build`.
- Import what you use from `build123d` (`from build123d import *` is fine).

Study these two known-good templates and follow their structure closely. When the
request is close to one of them, **adapt it** rather than starting from scratch.

{examples}
"""


def build_user_prompt(description: str) -> str:
    """First-round user turn: the part request."""
    return (
        f"Design this part as a build123d `model.py`:\n\n{description.strip()}\n\n"
        "Reply with only the Python source."
    )


def build_retry_prompt(error: str, *, printable: bool) -> str:
    """Feedback turn after a failed build / failed printability check."""
    if printable is False and not error:
        head = "The model built but is NOT printable. Failing checks:"
    elif error and printable is None:
        head = "The model failed to build. Fix the error and return the full corrected model.py:"
    else:
        head = "The model needs fixing:"
    return (
        f"{head}\n\n```\n{error.strip()}\n```\n\n"
        "Return the complete corrected `model.py` (only Python source)."
    )
