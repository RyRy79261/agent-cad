# Research findings & roadmap

Outcome of two deep, fact-checked research passes (2026-06-13) into *"is there an
established way to do prompt→CAD→print, and how should agent-cad be built?"* Every
claim below survived adversarial verification against primary sources (papers,
official repos, registries); citations are at the end. Pass 1 covered the
CAD/LLM science; pass 2 covered the practical printer/slicer/viewer stack.

## TL;DR

**Yes — there is an established way, and agent-cad is already doing it.** The proven
paradigm for prompt-to-CAD is *a general LLM writing parametric Python code-CAD,
iterated through a generate → execute → render → inspect → self-correct loop* — not
training a bespoke "CAD AI". It lives on GitHub, and the closest existing project
([cad-khana](https://github.com/cyberchitta/cad-khana)) is a near-twin of our design.
**Build, don't buy:** the only hosted text-to-CAD option (Zoo/KittyCAD) is paid and
not self-hostable. Our free/self-hosted, build123d + Claude approach is the
state of the art.

The one hard truth: **even the best models still fail ~1 in 5 parametric CAD tasks**
(top score 0.80 on the CadQueryEval benchmark). So for a *beginner* tool,
reliability engineering (templates + hard checks + a capped retry loop) is not
polish — it *is* the product.

## Part 1 — The paradigm is validated (pass 1)

- **LLM-emits-Python-code-CAD beats trained CAD models.** Three independent
  peer-reviewed works converge on it: Text-to-CadQuery (arXiv 2505.06507) shows a
  fine-tuned general LLM emitting CadQuery beats a task-specific command-sequence
  model; Query2CAD (2406.00144) shows an off-the-shelf LLM can generate *and* refine
  CAD macros with no training; CAD-Coder (2505.19713, NeurIPS 2025) reformulates
  text-to-CAD as generating CadQuery scripts precisely to enable geometric validation.
- **Python code-CAD > OpenSCAD for LLMs.** The CADCodeVerify paper (2410.05340,
  ICLR 2025) explicitly switched *from* OpenSCAD *to* CadQuery because Python's huge
  corpus suits LLM generation and yields more concise code. This directly rebuts the
  "OpenSCAD has more training data" worry. (Caveat: the papers benchmark *CadQuery*,
  not build123d — same OCCT kernel + Python, so the evidence transfers by analogy,
  but there is **no published build123d-vs-CadQuery head-to-head**.)
- **The self-correct loop is quantitatively validated** — but with limits. CADCodeVerify's
  generate → render → VLM-inspect → refine loop set SOTA (e.g. +5.5pp compile rate to
  96.5% for GPT-4). BUT improvements are modest, VLM verification accuracy is only
  ~65%, and **there is no measurable gain past ~2 refinements**. → Cap the retry loop.
- **Machine-readable geometric checks are essential, not optional.** CadQueryEval's
  pass criteria are a copyable spec: watertight/manifold + single connected component +
  bounding box within 1 mm + volume within 2 %. cad-khana additionally emits
  diagnostics (interferences, clearances, wall thickness, overhangs).

## Part 2 — Reference projects on GitHub (the map)

| Project | License | What it is | Use to us |
| --- | --- | --- | --- |
| [cad-khana](https://github.com/cyberchitta/cad-khana) | Apache-2.0 | build123d + **Claude Code skill**, diagnostics-first loop, `khana draw` engineering-PNG renders | **Closest twin** — borrow the loop + diagnostics; watch as dep (alpha) |
| [CadQueryEval](https://github.com/danwahl/cadqueryeval) | MIT | 25-task eval harness (bbox/manifold/volume checks) | **Copy the verification pattern**; run our own eval across build123d *and* CadQuery |
| [CQAsk](https://github.com/OpenOrion/CQAsk) | MIT | LLM→CadQuery→web-UI POC | Architecture reference for the web side (early, OpenAI dep) |
| [Zoo/KittyCAD text-to-cad-ui](https://github.com/KittyCAD/text-to-cad-ui) | MIT (archived) | Frontend for hosted Text-to-CAD | UI patterns only — engine is **paid + not self-hostable** |
| [Text2CAD](https://github.com/SadilKhan/Text2CAD) | NeurIPS'24 | Trained model + 170K dataset (CC-BY-NC-SA) | Few-shot **example data**, not the engine |
| [yet-another-cad-viewer (YACV)](https://github.com/yeicor-3d/yet-another-cad-viewer) | MIT | Web viewer for OCP (build123d) models + in-browser playground | Borrow patterns; but it pre-converts to glTF server-side — we use occt-import-js for native STEP |
| [build123d-f3d-render](https://github.com/jdegenstein/build123d-f3d-render) | OSS | Headless build123d→PNG in GitHub Actions via f3d EGL (no xvfb) | **Copy for CI** + better vision renders |

## Part 3 — Practical stack is validated (pass 2)

- **Slicing:** OrcaSlicer ships an **official "Creality Ender-5 S1 0.4 nozzle"** machine
  profile (merged PR #974) and a CLI that slices 3MF→G-code. Confirmed gotcha (already
  handled in our `slice` service): the CLI emits a `.gcode.3mf` ZIP — the real Marlin
  g-code is at `Metadata/plate_1.gcode`, with print/filament estimates at
  `Metadata/slice_info.config`. (To verify on a live install before hard-coding: the
  exact preset name strings, and whether any flag emits bare `.gcode` directly.)
- **Web preview:** `occt-import-js` (WASM OCCT) imports STEP fully client-side and its
  output maps **directly** to a three.js `BufferGeometry` (`ReadStepFile` → `meshes[]`
  → position/normal/index attributes). `gcode-preview` (MIT) gives `buildVolume:{x,y,z}`
  (our bed = 220×220×280) and a `startLayer`/`endLayer` slider via clipping planes.
  Our viewer choices are correct.
- **CI:** `build123d-f3d-render` proves fully headless build123d→PNG in CI using f3d's
  built-in EGL — only needs `libegl1 libgl1 libglx-mesa0`, **no xvfb**. This is also a
  better *vision-feedback render* than our current SVG line-art.

## Part 4 — Roadmap

### Keep (validated)
build123d Python engine · the generate→execute→render→inspect→fix loop ·
OrcaSlicer CLI + official Ender 5 S1 profile + `.gcode.3mf` extraction ·
occt-import-js / three.js / gcode-preview viewers · the build-volume fit check
(already added) · the parametric-text-as-source-of-truth + Git-LFS-for-prints model.

### Add (the reliability + UX the research says are mandatory)
1. **Known-good template library** — curated parametric starters (box, bracket,
   holder, knob, …) the agent retrieves and adapts. *Single biggest reliability lever.*
2. **Spec-verification harness** (CadQueryEval-style) — manifold/watertight,
   single-component, bbox-tolerance, volume-tolerance checks before slicing. Extend the
   metadata the runner already emits.
3. **Cap the self-correction loop at ~2 rounds** (research: no gains beyond; vision-only
   is ~65% reliable) — one traceback-fix pass, one spec/vision-fix pass, then ask the user.
4. **Upgrade the render** SVG → shaded/orthographic **PNG via f3d** (headless EGL) for
   stronger vision inspection, à la cad-khana's `khana draw`.
5. **Creation Wizard** (the UX) — guided: describe → pick material (teaches filament,
   see [filament-guide.md](filament-guide.md)) → preview → fit-check → slice → SD; gate
   first-time users through printer setup + calibration. Borrow YACV's in-browser playground feel.
6. **Calibration-first gating** — before a custom print, walk the user through the
   [printer setup + calibration sequence](printer-ender5s1.md). (Their explicit request.)
7. **CI** — adopt the f3d headless-render-in-Actions pattern to test + preview generated
   geometry on every change.

### Open questions worth a cheap experiment
- Run our **own CadQueryEval-style eval across build123d vs CadQuery** to replace the
  "reasonable by analogy" library choice with data.
- Verify the exact OrcaSlicer preset-name strings + `.gcode.3mf` behavior on a live install.

## Part 5 — First concrete actions (do these before any custom print)

0. **Confirm the filament** (ask the housemate / read the spool). Assume black PLA
   until told otherwise → Ender 5 S1 starting temps **205 °C nozzle / 60 °C bed**
   (official Creality manual).
1. **Set up the printer** — two-stage leveling + live Z-offset; mind the long nozzle and
   SD-card rules. See [printer-ender5s1.md](printer-ender5s1.md).
2. **Calibration-first** — first-layer test → XYZ cube → temp tower → retraction → Benchy,
   reading each result. See the calibration section in the printer doc.
3. *Only then* — the first promptable custom part.

## Paid tools verdict

Nothing here is worth paying for. The only "buy" (Zoo hosted text-to-CAD) is both
not-cheap-per-call and not self-hostable, failing the free/shareable requirement. Stay
the course: free, self-hosted, tokens-not-euros.

## Sources

Pass 1 (CAD/LLM): arxiv.org/abs/2505.06507 · arxiv.org/abs/2406.00144 ·
arxiv.org/pdf/2505.19713 · arxiv.org/pdf/2410.05340 · github.com/cyberchitta/cad-khana ·
github.com/danwahl/cadqueryeval · github.com/OpenOrion/CQAsk ·
github.com/KittyCAD/text-to-cad-ui · github.com/SadilKhan/Text2CAD

Pass 2 (practical): github.com/OrcaSlicer/OrcaSlicer (PR #974, wiki) ·
printago.io/blog/orca-slicer-cli-reference · github.com/kovacsv/occt-import-js ·
github.com/remcoder/gcode-preview · github.com/yeicor-3d/yet-another-cad-viewer ·
github.com/jdegenstein/build123d-f3d-render · wiki.creality.com Ender-5 S1 manual ·
teachingtechyt.github.io/calibration.html · 3dwithus.com Ender 5 S1 review
