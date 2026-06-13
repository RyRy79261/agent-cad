"""``cad`` command-line entry point.

    cad build projects/fridge_drawer/model.py \
        --params projects/fridge_drawer/params.json \
        --out projects/fridge_drawer/artifacts --verify

    cad templates                       # list known-good part templates
    cad templates box                   # show a template's params
    cad new box projects/my_box         # scaffold a project from a template

Use ``--json`` for machine-readable output (this is what the agent / API parse).
On a modelling failure the process exits non-zero and prints the traceback, so
Claude Code can read it from the CLI output and self-correct.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from cad.runner import DEFAULT_FORMATS, build_model, load_params

# print.json scaffold — PLA by default (the beginner's loaded material).
_PRINT_STUB = {
    "status": "designed",
    "_status_values": ["designed", "sliced", "printing", "printed-ok", "printed-fail"],
    "printer": "Creality Ender 5 S1",
    "slicer": "orca",
    "machine_profile": "Creality Ender-5 S1 0.4 nozzle",
    "process_profile": "0.20mm Standard @Creality Ender-5 S1 0.4",
    "filament": {
        "material": "PLA",
        "rationale": "Default starter material. See docs/filament-guide.md to choose "
        "(PETG for interior van parts, ASA for sun/heat-exposed).",
    },
    "settings": {"layer_height_mm": 0.2, "walls": 4, "infill_percent": 20, "infill_pattern": "gyroid"},
    "notes": "Orient so layer lines run across the load path, not along it.",
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="cad", description="Headless code-CAD runner.")
    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build", help="Run a model.py and export geometry.")
    build.add_argument("model", help="Path to the parametric model .py")
    build.add_argument("--params", help="Path to params.json", default=None)
    build.add_argument("--out", help="Output directory (default: <model_dir>/artifacts)")
    build.add_argument("--name", help="Artifact base name (default: model filename)")
    build.add_argument(
        "--formats",
        default=",".join(DEFAULT_FORMATS),
        help=f"Comma-separated formats (default: {','.join(DEFAULT_FORMATS)})",
    )
    build.add_argument("--verify", action="store_true", help="Run printability checks on the result.")
    build.add_argument(
        "--strict", action="store_true",
        help="With --verify, exit non-zero if the part is not printable.",
    )
    build.add_argument("--json", action="store_true", help="Emit JSON only.")

    tpl = sub.add_parser("templates", help="List or show known-good part templates.")
    tpl.add_argument("name", nargs="?", help="Template to show (omit to list all).")
    tpl.add_argument("--source", action="store_true", help="Print the template's model.py source.")
    tpl.add_argument("--json", action="store_true", help="Emit JSON.")

    new = sub.add_parser("new", help="Scaffold a project from a template.")
    new.add_argument("template", help="Template name (see `cad templates`).")
    new.add_argument("dest", help="Destination directory, e.g. projects/my_part")
    new.add_argument("--force", action="store_true", help="Overwrite an existing model.py.")

    args = parser.parse_args(argv)

    if args.command == "build":
        return _cmd_build(args)
    if args.command == "templates":
        return _cmd_templates(args)
    if args.command == "new":
        return _cmd_new(args)
    parser.error(f"unknown command {args.command!r}")
    return 2


def _cmd_build(args: argparse.Namespace) -> int:
    result = build_model(
        model_path=args.model,
        params=load_params(args.params),
        out_dir=args.out,
        name=args.name,
        formats=tuple(f.strip() for f in args.formats.split(",") if f.strip()),
        verify=args.verify,
    )

    if args.json:
        print(json.dumps(result.to_dict(), indent=2))
    else:
        _print_human(result)

    exit_code = 0 if result.ok else 1
    if args.strict and result.verification and not result.verification["printable"]:
        exit_code = 1
    return exit_code


def _cmd_templates(args: argparse.Namespace) -> int:
    from cad.templates import get_template, list_templates

    if not args.name:
        items = list_templates()
        if args.json:
            print(json.dumps([{"name": t.name, "description": t.description} for t in items], indent=2))
        else:
            print("Known-good templates  (cad new <name> <dest> to scaffold):\n")
            for t in items:
                print(f"  {t.name:10} {t.description}")
        return 0

    try:
        t = get_template(args.name)
    except KeyError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    if args.source:
        print(t.source())
        return 0

    if args.json:
        print(json.dumps({"name": t.name, "description": t.description, "params": t.param_schema}, indent=2))
    else:
        print(f"{t.name} — {t.description}\n")
        print("Parameters:")
        for key, spec in t.param_schema.items():
            unit = spec.get("unit", "")
            print(f"  {key:16} = {str(spec.get('default')):8} {unit:6} {spec.get('desc', '')}")
        print(f"\nScaffold:  cad new {t.name} projects/<part>")
    return 0


def _cmd_new(args: argparse.Namespace) -> int:
    from cad.templates import get_template

    try:
        t = get_template(args.template)
    except KeyError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    dest = Path(args.dest)
    model_path = dest / "model.py"
    if model_path.exists() and not args.force:
        print(f"✗ {model_path} already exists (use --force to overwrite)", file=sys.stderr)
        return 1

    dest.mkdir(parents=True, exist_ok=True)
    model_path.write_text(t.source())
    # --force refreshes the model template only; never clobber edited params/print.
    if not (dest / "params.json").exists():
        (dest / "params.json").write_text(json.dumps(t.defaults, indent=2) + "\n")
    if not (dest / "print.json").exists():
        (dest / "print.json").write_text(json.dumps(_PRINT_STUB, indent=2) + "\n")

    print(f"✓ scaffolded '{t.name}' → {dest}/")
    print(f"  edit {model_path} and {dest}/params.json, then build + verify:")
    print(f"  cad build {model_path} --params {dest}/params.json --verify")
    return 0


def _print_human(result) -> None:  # noqa: ANN001 - simple internal helper
    if result.ok:
        print(f"✓ built {result.model_path} [{result.engine}]")
        for fmt, path in result.artifacts.items():
            print(f"  {fmt:>5}: {path}")
        bbox = result.metadata.get("bounding_box_mm")
        if bbox:
            print(f"  bbox : {bbox['x']} × {bbox['y']} × {bbox['z']} mm")
        if result.metadata.get("volume_mm3") is not None:
            print(f"  vol  : {result.metadata['volume_mm3']} mm³")
        _print_fit(result.metadata)
        _print_verification(result.verification)
    else:
        print(f"✗ build failed: {result.model_path}", file=sys.stderr)
        if result.stdout:
            print(result.stdout, file=sys.stderr)
        print(result.error, file=sys.stderr)


def _print_fit(metadata: dict) -> None:  # noqa: ANN001 - simple internal helper
    """Report whether the part fits the target printer's build volume."""
    fits = metadata.get("fits_build_volume")
    if fits is None:
        return
    bv = metadata.get("build_volume_mm", {})
    printer = metadata.get("printer", "printer")
    envelope = f"{bv.get('x')}×{bv.get('y')}×{bv.get('z')} mm" if bv else "?"
    if fits:
        note = " (rotate 90° on the bed)" if metadata.get("requires_rotation") else ""
        print(f"  bed  : ✓ fits {printer} [{envelope}]{note}")
    else:
        ov = metadata.get("build_volume_overflow_mm", {})
        over = ", ".join(
            f"{axis}+{ov[axis]}" for axis in ("x", "y", "z") if ov.get(axis)
        )
        print(
            f"  bed  : ⚠ DOES NOT FIT {printer} [{envelope}] — over by {over} mm. "
            "Shrink it or split into joinable pieces.",
            file=sys.stderr,
        )


def _print_verification(verification: dict | None) -> None:
    """Print the printability verdict (only when --verify was requested)."""
    if not verification:
        return
    printable = verification["printable"]
    header = "PRINTABLE ✓" if printable else "NOT PRINTABLE ✗"
    stream = sys.stdout if printable else sys.stderr
    print(f"  check: {header} — {verification['summary']}", file=stream)
    for c in verification["checks"]:
        if c["passed"] and printable:
            continue  # keep clean output focused on problems when all good
        mark = "✓" if c["passed"] else "✗"
        tag = "" if c["passed"] else f" [{c['severity']}]"
        print(f"         {mark} {c['name']}: {c['detail']}{tag}", file=stream)


if __name__ == "__main__":
    raise SystemExit(main())
