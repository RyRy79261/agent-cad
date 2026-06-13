"""Headless code-CAD runner for the agent-cad pipeline.

The source of truth for every part is a plain-text ``model.py`` (build123d, with
CadQuery as a fallback). This package executes that script headlessly and exports
manufacturing geometry (STL/STEP/3MF) plus an SVG projection for the agent's
"generate -> render -> inspect -> fix" loop.
"""

from cad.runner import BuildResult, build_model, load_params

__all__ = ["BuildResult", "build_model", "load_params"]
