"""Scan-to-mesh cleanup for the agent-cad pipeline.

Turns a raw LiDAR/photogrammetry capture into a single manifold reference mesh
you can measure against, then design a parametric mount around.
"""

from scanner.pipeline import ScanResult, ScanStats, clean_mesh

__all__ = ["ScanResult", "ScanStats", "clean_mesh"]
