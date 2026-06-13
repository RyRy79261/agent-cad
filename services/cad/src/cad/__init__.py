"""Headless code-CAD runner for the agent-cad pipeline.

The source of truth for every part is a plain-text ``model.py`` (build123d, with
CadQuery as a fallback). This package executes that script headlessly and exports
manufacturing geometry (STL/STEP/3MF) plus an SVG projection for the agent's
"generate -> render -> inspect -> fix" loop.
"""

from cad.printer import ENDER_5_S1, BuildVolume, FitResult, Printer, fits
from cad.runner import BuildResult, build_model, load_params
from cad.templates import Template, get_template, list_templates
from cad.verify import VerifyResult, verify_build

__all__ = [
    "ENDER_5_S1",
    "BuildResult",
    "BuildVolume",
    "FitResult",
    "Printer",
    "Template",
    "VerifyResult",
    "build_model",
    "fits",
    "get_template",
    "list_templates",
    "load_params",
    "verify_build",
]
