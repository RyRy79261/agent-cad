"""``scan`` command-line entry point.

    scan clean raw.obj --out heater.clean.stl --target-faces 50000
    scan info heater.clean.stl
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict

import trimesh

from scanner.pipeline import ScanStats, clean_mesh


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="scan", description="Scan mesh cleanup.")
    sub = parser.add_subparsers(dest="command", required=True)

    clean = sub.add_parser("clean", help="Clean a raw scan into a reference mesh.")
    clean.add_argument("input")
    clean.add_argument("--out", help="Output path (default: <input>.clean.stl)")
    clean.add_argument("--target-faces", type=int, default=None)
    clean.add_argument("--no-keep-largest", action="store_true")
    clean.add_argument("--no-recenter", action="store_true")
    clean.add_argument("--no-fill-holes", action="store_true")
    clean.add_argument("--json", action="store_true")

    info = sub.add_parser("info", help="Print stats for a mesh.")
    info.add_argument("mesh")

    args = parser.parse_args(argv)

    if args.command == "clean":
        return _cmd_clean(args)
    if args.command == "info":
        return _cmd_info(args)
    parser.error(f"unknown command {args.command!r}")
    return 2


def _cmd_clean(args: argparse.Namespace) -> int:
    result = clean_mesh(
        args.input,
        output_path=args.out,
        keep_largest=not args.no_keep_largest,
        recenter=not args.no_recenter,
        fill_holes=not args.no_fill_holes,
        target_faces=args.target_faces,
    )
    if args.json:
        print(json.dumps(result.to_dict(), indent=2))
    elif result.ok:
        b, a = result.before, result.after
        print(f"✓ cleaned {result.input_path} -> {result.output_path}")
        print(f"  faces    : {b['faces']} -> {a['faces']}")
        print(f"  watertight: {b['watertight']} -> {a['watertight']}")
        print(f"  bbox mm  : {a['bbox_mm']}")
        print(f"  ops      : {', '.join(result.operations)}")
    else:
        print(f"✗ scan cleanup failed: {result.error}")
    return 0 if result.ok else 1


def _cmd_info(args: argparse.Namespace) -> int:
    mesh = trimesh.load(args.mesh, force="mesh")
    print(json.dumps(asdict(ScanStats.of(mesh)), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
