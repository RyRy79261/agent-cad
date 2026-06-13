"""PrusaSlicer headless CLI wrapper — the "plain .gcode, no extraction" path.

PrusaSlicer/Slic3r support a true ``--export-gcode`` that writes a plain
``.gcode`` directly (and ``--repair`` to fix non-manifold meshes), so there is
no archive to unzip. You must supply your own Ender 5 S1 ``.ini`` configs
(PrusaSlicer does not ship an Ender 5 S1 profile).

    prusa-slicer --export-gcode --load ender5s1.ini --load petg.ini \\
        -o out.gcode model.stl
"""

from __future__ import annotations

import os
import shutil
import subprocess
from collections.abc import Sequence
from pathlib import Path

from slicer.result import SliceResult

_ENV_BIN = "PRUSA_SLICER_BIN"
_DEFAULT_BIN = "prusa-slicer"


def resolve_bin(explicit: str | None = None) -> str | None:
    candidate = explicit or os.environ.get(_ENV_BIN) or _DEFAULT_BIN
    if Path(candidate).is_file():
        return candidate
    return shutil.which(candidate)


def slice_model(
    model: str | Path,
    *,
    configs: Sequence[str | Path],
    output: str | Path | None = None,
    bin: str | None = None,
    repair: bool = False,
    extra_args: Sequence[str] = (),
    timeout: float | None = 600.0,
) -> SliceResult:
    """Slice ``model`` with PrusaSlicer, writing a plain ``.gcode`` directly.

    ``configs`` is one or more ``.ini`` files (printer + print + filament),
    applied in order via repeated ``--load``.
    """
    model = Path(model)
    output = Path(output) if output else model.with_suffix(".gcode")
    output.parent.mkdir(parents=True, exist_ok=True)

    binary = resolve_bin(bin)
    command = [binary or _DEFAULT_BIN, "--export-gcode"]
    if repair:
        command.append("--repair")
    for cfg in configs:
        command += ["--load", str(cfg)]
    command += [*extra_args, "-o", str(output), str(model)]

    if binary is None:
        return SliceResult(
            ok=False,
            slicer="prusa",
            model_path=str(model),
            command=command,
            error=(
                f"PrusaSlicer executable not found. Set ${_ENV_BIN} or put "
                f"'{_DEFAULT_BIN}' on PATH."
            ),
        )

    try:
        proc = subprocess.run(
            command, capture_output=True, text=True, timeout=timeout, check=False
        )
    except subprocess.TimeoutExpired as exc:
        return SliceResult(
            ok=False,
            slicer="prusa",
            model_path=str(model),
            command=command,
            error=f"PrusaSlicer timed out after {timeout}s: {exc}",
        )

    return SliceResult(
        ok=proc.returncode == 0 and output.exists(),
        slicer="prusa",
        model_path=str(model),
        command=command,
        gcode_path=str(output) if output.exists() else None,
        stdout=proc.stdout,
        stderr=proc.stderr,
        returncode=proc.returncode,
        error=None if output.exists() else "PrusaSlicer did not produce G-code.",
    )
