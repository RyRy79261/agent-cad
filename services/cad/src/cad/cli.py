"""``cad`` command-line entry point.

    cad build projects/fridge_drawer/model.py \
        --params projects/fridge_drawer/params.json \
        --out projects/fridge_drawer/artifacts

Use ``--json`` for machine-readable output (this is what the agent / API parse).
On a modelling failure the process exits non-zero and prints the traceback, so
Claude Code can read it from the CLI output and self-correct.
"""

from __future__ import annotations

import argparse
import json
import sys

from cad.runner import DEFAULT_FORMATS, build_model, load_params


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
    build.add_argument("--json", action="store_true", help="Emit JSON only.")

    args = parser.parse_args(argv)

    if args.command == "build":
        return _cmd_build(args)
    parser.error(f"unknown command {args.command!r}")
    return 2


def _cmd_build(args: argparse.Namespace) -> int:
    result = build_model(
        model_path=args.model,
        params=load_params(args.params),
        out_dir=args.out,
        name=args.name,
        formats=tuple(f.strip() for f in args.formats.split(",") if f.strip()),
    )

    if args.json:
        print(json.dumps(result.to_dict(), indent=2))
    else:
        _print_human(result)

    return 0 if result.ok else 1


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
    else:
        print(f"✗ build failed: {result.model_path}", file=sys.stderr)
        if result.stdout:
            print(result.stdout, file=sys.stderr)
        print(result.error, file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
