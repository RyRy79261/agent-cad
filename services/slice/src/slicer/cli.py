"""``slice`` command-line entry point.

    slice orca model.3mf --machine ender5s1.json --process std.json --filament petg.json
    slice prusa model.stl --config ender5s1.ini --config petg.ini
    slice extract out.gcode.3mf            # pull plate_1.gcode out of the archive
    slice info out.gcode.3mf               # print-time / filament estimates
    slice sd out.gcode /media/SDCARD       # copy to FAT32 card root, short name
"""

from __future__ import annotations

import argparse
import json

from slicer import extract as extract_mod
from slicer import orca, prusa, sdcard


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="slice", description="Headless slicing tools.")
    sub = parser.add_subparsers(dest="command", required=True)

    p_orca = sub.add_parser("orca", help="Slice with OrcaSlicer (+ extract g-code).")
    p_orca.add_argument("model")
    p_orca.add_argument("--machine", required=True, help="Printer profile JSON.")
    p_orca.add_argument("--process", required=True, help="Print-settings JSON.")
    p_orca.add_argument("--filament", action="append", required=True, help="Filament JSON (repeatable).")
    p_orca.add_argument("--output", help="Archive output path (.gcode.3mf).")
    p_orca.add_argument("--no-extract", action="store_true", help="Skip g-code extraction.")
    p_orca.add_argument("--bin", help="OrcaSlicer executable path.")
    p_orca.add_argument("--json", action="store_true")

    p_e5s1 = sub.add_parser(
        "ender5s1", help="Slice for the Ender 5 S1 with the bundled profiles (+ extract g-code)."
    )
    p_e5s1.add_argument("model", help="STL / 3MF to slice.")
    p_e5s1.add_argument("--output", help="Archive output path (.gcode.3mf).")
    p_e5s1.add_argument("--bin", help="OrcaSlicer executable path.")
    p_e5s1.add_argument("--json", action="store_true")

    p_prusa = sub.add_parser("prusa", help="Slice with PrusaSlicer (plain g-code).")
    p_prusa.add_argument("model")
    p_prusa.add_argument("--config", action="append", required=True, help=".ini config (repeatable).")
    p_prusa.add_argument("--output", help="Output .gcode path.")
    p_prusa.add_argument("--repair", action="store_true", help="Repair non-manifold mesh.")
    p_prusa.add_argument("--bin", help="PrusaSlicer executable path.")
    p_prusa.add_argument("--json", action="store_true")

    p_extract = sub.add_parser("extract", help="Extract plate_N.gcode from a .gcode.3mf.")
    p_extract.add_argument("archive")
    p_extract.add_argument("--out", help="Output .gcode path.")
    p_extract.add_argument("--plate", type=int, default=1)
    p_extract.add_argument("--json", action="store_true")

    p_info = sub.add_parser("info", help="Show print-time / filament estimates.")
    p_info.add_argument("archive")

    p_sd = sub.add_parser("sd", help="Copy plain g-code to an SD card root.")
    p_sd.add_argument("gcode")
    p_sd.add_argument("sd_root")
    p_sd.add_argument("--name", help="Override filename (will be sanitized).")

    args = parser.parse_args(argv)
    return _DISPATCH[args.command](args)


def _cmd_orca(args: argparse.Namespace) -> int:
    result = orca.slice_model(
        args.model,
        machine=args.machine,
        process=args.process,
        filaments=args.filament,
        output=args.output,
        bin=args.bin,
        extract=not args.no_extract,
    )
    print(json.dumps(result.to_dict(), indent=2) if args.json else _fmt_slice(result))
    return 0 if result.ok else 1


def _cmd_ender5s1(args: argparse.Namespace) -> int:
    from slicer.profiles import ender5s1_profiles

    profiles = ender5s1_profiles()
    result = orca.slice_model(
        args.model,
        machine=profiles["machine"],
        process=profiles["process"],
        filaments=[profiles["filament"]],
        output=args.output,
        bin=args.bin,
        extract=True,
    )
    print(json.dumps(result.to_dict(), indent=2) if args.json else _fmt_slice(result))
    return 0 if result.ok else 1


def _cmd_prusa(args: argparse.Namespace) -> int:
    result = prusa.slice_model(
        args.model,
        configs=args.config,
        output=args.output,
        bin=args.bin,
        repair=args.repair,
    )
    print(json.dumps(result.to_dict(), indent=2) if args.json else _fmt_slice(result))
    return 0 if result.ok else 1


def _cmd_extract(args: argparse.Namespace) -> int:
    path = extract_mod.extract_gcode(args.archive, out_path=args.out, plate=args.plate)
    if args.json:
        print(json.dumps({"gcode_path": str(path)}))
    else:
        print(f"extracted -> {path}")
    return 0


def _cmd_info(args: argparse.Namespace) -> int:
    print(json.dumps(extract_mod.summarize(args.archive), indent=2))
    return 0


def _cmd_sd(args: argparse.Namespace) -> int:
    dest = sdcard.copy_to_sd(args.gcode, args.sd_root, name=args.name)
    print(f"copied -> {dest}")
    return 0


def _fmt_slice(result) -> str:  # noqa: ANN001
    if not result.ok:
        return f"✗ {result.slicer} failed: {result.error or result.stderr[-400:]}"
    lines = [f"✓ sliced with {result.slicer}"]
    if result.gcode_path:
        lines.append(f"  gcode  : {result.gcode_path}")
    if result.archive_path:
        lines.append(f"  archive: {result.archive_path}")
    for plate in result.info.get("plates", []):
        t, w = plate.get("print_time_s"), plate.get("weight_g")
        lines.append(f"  plate {plate['index']}: time={t}s weight={w}g")
    return "\n".join(lines)


_DISPATCH = {
    "orca": _cmd_orca,
    "ender5s1": _cmd_ender5s1,
    "prusa": _cmd_prusa,
    "extract": _cmd_extract,
    "info": _cmd_info,
    "sd": _cmd_sd,
}


if __name__ == "__main__":
    raise SystemExit(main())
