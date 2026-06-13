"""Copy plain G-code to the Ender 5 S1's SD card.

Marlin on the Ender 5 S1 reads plain ``.gcode`` (also ``.gco``/``.g``) from a
**FAT32** card and selects files by short DOS 8.3-style names. Practical rules
baked in here: write to the card **root**, use a short, upper-snake filename
with no spaces/special characters.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

_SAFE = re.compile(r"[^A-Z0-9_]+")


def sanitize_name(name: str, max_stem: int = 8) -> str:
    """Make a Marlin-friendly 8.3-ish filename: ``FRIDGE_D.gcode``.

    Keeps a ``.gcode`` extension, uppercases, replaces unsafe runs with ``_``,
    and truncates the stem so the short name is robustly selectable on the LCD.
    """
    stem = Path(name).stem
    stem = _SAFE.sub("_", stem.upper()).strip("_") or "PART"
    return f"{stem[:max_stem]}.gcode"


def copy_to_sd(
    gcode_path: str | Path,
    sd_root: str | Path,
    name: str | None = None,
    *,
    overwrite: bool = True,
) -> Path:
    """Copy ``gcode_path`` to the SD card root with a sanitized short name.

    Returns the destination path. Raises if the source is missing or the
    destination exists and ``overwrite`` is False.
    """
    src = Path(gcode_path)
    if not src.is_file():
        raise FileNotFoundError(f"G-code not found: {src}")

    root = Path(sd_root)
    if not root.is_dir():
        raise NotADirectoryError(f"SD card root is not a directory: {root}")

    dest = root / sanitize_name(name or src.name)
    if dest.exists() and not overwrite:
        raise FileExistsError(f"refusing to overwrite existing file: {dest}")

    shutil.copyfile(src, dest)
    return dest
