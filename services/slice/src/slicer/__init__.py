"""Headless slicing for the agent-cad pipeline.

* ``orca``  — OrcaSlicer CLI wrapper (built-in Ender 5 S1 profile) + auto extract
* ``prusa`` — PrusaSlicer CLI wrapper (plain .gcode, bring-your-own .ini)
* ``extract`` — pull ``plate_1.gcode`` + print stats out of a ``.gcode.3mf``
* ``sdcard`` — copy plain G-code to a FAT32 SD card root with a Marlin-safe name
"""

from slicer.extract import extract_gcode, list_plate_gcode, read_slice_info, summarize
from slicer.result import SliceResult
from slicer.sdcard import copy_to_sd, sanitize_name

__all__ = [
    "SliceResult",
    "copy_to_sd",
    "extract_gcode",
    "list_plate_gcode",
    "read_slice_info",
    "sanitize_name",
    "summarize",
]
