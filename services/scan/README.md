# scanner — scan/LiDAR mesh cleanup

Turns a raw capture (Scaniverse / Polycam OBJ/STL) into a single manifold
reference mesh you can measure against, then design a parametric mount around.

```bash
uv run --package scanner scan clean raw.obj --out heater.clean.stl --target-faces 50000
uv run --package scanner scan info heater.clean.stl
```

Pipeline: weld close vertices → drop duplicate/degenerate faces → keep the largest
connected component (drops floaters) → fix normals → fill holes → optional quadric
decimation → recenter → report before/after stats (faces, watertight, bbox).

Backend: **trimesh** + **fast-simplification** (required, lightweight). Open3D /
PyMeshLab are optional enhanced backends (`pip install 'scanner[open3d]'`).

> Mesh → editable B-rep is not automatic — treat scans as references; design the
> mount as clean parametric build123d around the measured numbers.
