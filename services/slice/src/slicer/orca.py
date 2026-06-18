"""OrcaSlicer headless CLI wrapper for the Creality Ender 5 S1.

Reference invocation (from the spec)::

    orca-slicer \\
        --slice 1 \\
        --load-settings "ender5s1_machine.json;0.20_standard_process.json" \\
        --load-filaments "petg.json" \\
        --allow-newer-file \\
        --export-3mf output.gcode.3mf \\
        model.3mf

OrcaSlicer ships a built-in "Creality Ender-5 S1 0.4 nozzle" profile with
"0.16mm Optimal" / "0.20mm Standard" process presets. The CLI writes a
``.gcode.3mf`` archive, so by default we immediately extract the plain
``plate_1.gcode`` (see ``extract.py``).
"""

from __future__ import annotations

import glob
import os
import shutil
import subprocess
from collections.abc import Sequence
from pathlib import Path

from slicer.extract import extract_gcode, summarize
from slicer.result import SliceResult

_ENV_BIN = "ORCA_SLICER_BIN"
_DEFAULT_BIN = "orca-slicer"

# Probed when the binary isn't explicit / on PATH, so a box with the AppImage in a
# normal spot "just works" without anyone exporting $ORCA_SLICER_BIN (Linux AppImage,
# ~/bin, /opt, and the macOS app bundle). Newest match wins.
_FALLBACK_GLOBS = (
    "~/Applications/OrcaSlicer*.AppImage",
    "~/Applications/Orca*.AppImage",
    "~/.local/bin/OrcaSlicer*.AppImage",
    "~/bin/OrcaSlicer*.AppImage",
    "/opt/OrcaSlicer*/**/orca-slicer",
    "/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer",
)


def resolve_bin(explicit: str | None = None) -> str | None:
    """Locate the OrcaSlicer executable.

    Order: explicit arg > ``$ORCA_SLICER_BIN`` > ``orca-slicer`` on PATH > a probe of
    common install locations (an AppImage in ``~/Applications`` etc.).
    """
    candidate = explicit or os.environ.get(_ENV_BIN) or _DEFAULT_BIN
    if Path(candidate).is_file():
        return str(Path(candidate))
    found = shutil.which(candidate)
    if found:
        return found
    for pattern in _FALLBACK_GLOBS:
        matches = sorted(glob.glob(os.path.expanduser(pattern), recursive=True))
        if matches:
            return matches[-1]
    return None


def _headless_prefix() -> list[str]:
    """``xvfb-run`` prefix when there's no display.

    OrcaSlicer is a Qt GUI app and wants a display even for CLI slicing (it fails
    to init the window otherwise); on a headless box we run it under a virtual
    framebuffer. Skipped when a display exists or ``AGENT_CAD_NO_XVFB`` is set.
    """
    if os.environ.get("AGENT_CAD_NO_XVFB"):
        return []
    if os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"):
        return []
    xvfb = shutil.which("xvfb-run")
    return [xvfb, "-a"] if xvfb else []


def slice_model(
    model: str | Path,
    *,
    machine: str | Path,
    process: str | Path,
    filaments: Sequence[str | Path],
    output: str | Path | None = None,
    bin: str | None = None,
    extra_args: Sequence[str] = (),
    extract: bool = True,
    timeout: float | None = 600.0,
) -> SliceResult:
    """Slice ``model`` with OrcaSlicer and (by default) extract plain G-code.

    ``machine`` is the printer profile JSON, ``process`` the print-settings JSON,
    ``filaments`` one or more filament JSONs. ``extra_args`` are passed through
    verbatim (e.g. ``["--layer-height", "0.1"]``) and override loaded settings.
    """
    # Absolute paths so we can run the slicer with cwd=output dir (OrcaSlicer drops
    # a result.json in its working directory — keep that out of the repo).
    model = Path(model).resolve()
    output = (Path(output) if output else model.with_suffix(".gcode.3mf")).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    binary = resolve_bin(bin)
    settings = ";".join(str(p) for p in (machine, process))
    filament_arg = ";".join(str(p) for p in filaments)
    command = [
        binary or _DEFAULT_BIN,
        "--slice",
        "1",
        "--load-settings",
        settings,
        "--load-filaments",
        filament_arg,
        "--allow-newer-file",
        *extra_args,
        "--export-3mf",
        str(output),
        str(model),
    ]

    if binary is None:
        return SliceResult(
            ok=False,
            slicer="orca",
            model_path=str(model),
            command=command,
            error=(
                f"OrcaSlicer executable not found. Set ${_ENV_BIN} or put "
                f"'{_DEFAULT_BIN}' on PATH."
            ),
        )

    run_command = _headless_prefix() + command
    try:
        proc = subprocess.run(
            run_command,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            cwd=str(output.parent),  # contain OrcaSlicer's result.json dropping
        )
    except subprocess.TimeoutExpired as exc:
        return SliceResult(
            ok=False,
            slicer="orca",
            model_path=str(model),
            command=run_command,
            error=f"OrcaSlicer timed out after {timeout}s: {exc}",
        )

    result = SliceResult(
        ok=proc.returncode == 0 and output.exists(),
        slicer="orca",
        model_path=str(model),
        command=run_command,
        archive_path=str(output) if output.exists() else None,
        stdout=proc.stdout,
        stderr=proc.stderr,
        returncode=proc.returncode,
    )
    if not result.ok:
        result.error = result.error or "OrcaSlicer did not produce an archive."
        return result

    result.info = summarize(output)
    if extract:
        try:
            result.gcode_path = str(extract_gcode(output))
        except (FileNotFoundError, OSError) as exc:
            result.ok = False
            result.error = f"G-code extraction failed: {exc}"
    return result
