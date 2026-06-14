# 3DBenchy — torture-test boat

The classic 3D-printing benchmark. Print it **after** the calibration cube reads
true (20.00 mm) to stress-test the harder stuff: overhangs (the hull, the roof),
bridging (the doorway), small cylinders (the smokestack/funnel), fine text (the
hull name/draft marks), and dimensional accuracy on curves.

- `3DBenchy.stl` — the canonical OG single-part model. **CC0 / public domain**;
  provenance + sha256 in [`NOTICE`](./NOTICE). (Imported asset — no `model.py`;
  the STL itself is the source.)
- `print.json` — recommended Ender 5 S1 / PLA torture-test profile.

## Slice it

CLI:

```bash
slice ender5s1 projects/benchy/3DBenchy.stl
```

App: pick **3DBenchy** under *Test models*, set the infill, and slice — same flow
as a template, with the model + toolpath preview.

## What a good Benchy tells you

| Feature | What it tests | A bad result means |
| --- | --- | --- |
| Hull sides / curves | dimensional accuracy, ringing | re-check the cube; tune speed/flow |
| Overhanging roof & stern | cooling, overhang speed | raise fan, slow overhangs |
| Doorway / windows | bridging | tune bridge speed/flow, cooling |
| Funnel (Ø ~7 mm hole) | small-circle accuracy, cooling | slow down, check flow |
| Hull name & draft marks | fine detail, pressure/seam | the corner-bulging story (see `/troubleshooting`) |
| Chimney (thin tower) | tall thin cooling, ringing | slow it, check belts |
