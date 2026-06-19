# OrcaSlicer headless capabilities & Agent CAD integration roadmap

> Scope: everything OrcaSlicer **2.3.2** (AppImage at `/home/ryan/Applications/OrcaSlicer.AppImage`)
> can do headlessly, and exactly how to wire each capability into Agent CAD's slice pipeline.
> Every CLI behaviour below was either run live against the committed Ender 5 S1 profiles and
> `projects/benchy/3DBenchy.stl`, or cross-checked against OrcaSlicer source + upstream docs.
> Empirically-proven facts are tagged **[PoC]**; web/source-verified facts **[verified]**; the
> few things we could not confirm are flagged **[unverified]** and must not be relied on.

---

## 1. Executive summary

OrcaSlicer's CLI is a **single binary driven entirely by flags + JSON preset files — there are no
per-setting flags and no calibration flags** [verified, live `--help` + source `src/OrcaSlicer.cpp`].
Headlessly (under `xvfb-run -a`) we can reliably: **slice STL/3MF → plain g-code** (already our
production path), **inspect models** (`--info`: bbox, manifold, volume — a free pre-slice gate),
**dump the fully-resolved 580-key config** (`--export-settings` — invaluable for debugging profiles),
**plate multiple copies** (`--clone-objects "N" --arrange 1`), **scale** (`--scale` *paired with*
`--arrange`), and **slice OrcaSlicer's shipped calibration projects** that ship as full `.3mf`s.
The single strongest calibration win is **Pressure Advance** (`pa_pattern.3mf` slices today on our
Ender profile with all 71 `M900 K` overrides preserved [PoC]); **Flow** works via
`Orca-LinearFlow.3mf` + `--arrange 1` [PoC]; **Temperature / Speed / Retraction / VFA towers ship as
bare 700 mm Draco master meshes with no temperature banding**, so they require us to construct the
model placement + per-height `custom_gcode_per_layer.xml` ourselves [PoC]. The 9,961 vendor presets
ship inside the AppImage and resolve their `inherits` chains from there; we load **standalone
flattened JSONs** instead (our proven pattern). Our override system (`profile_with_overrides`) is
already the correct mechanism — the roadmap is mostly **additive**: more typed settings, a real
filament-preset picker, and a calibration-print feature built on the sliceable `.3mf` assets.

---

## 2. CLI command surface

### 2.1 Mental model

OrcaSlicer's CLI is **JSON-settings-driven with NO per-setting flags**. You never pass
`--layer-height 0.2`; you point it at preset JSONs. A slice combines three buckets:

| Bucket | Flag | Holds |
|---|---|---|
| **machine** (printer) | `--load-settings "machine.json;…"` | bed size, kinematics, nozzle, G-code macros, base retraction |
| **process** (print) | `--load-settings "…;process.json"` | layer height, walls, infill, speeds, supports |
| **filament** | `--load-filaments "petg.json;…"` | temps, flow, cooling, per-material retraction overrides |

`--load-settings` takes a **`;`-separated list** holding *both* machine and process presets in one arg
(order doesn't matter — OrcaSlicer keys them by `printer_settings_id`/`print_settings_id`). Each preset
keeps its `inherits` key; OrcaSlicer resolves the base chain **from its own bundled
`resources/profiles/`**, so committed JSONs can be tiny patches and can live anywhere on disk. Verified:
slicing with `--datadir` pointed at an *empty* dir still works, because `inherits` resolves from the
AppImage, not the datadir [PoC].

**Config priority** (verbatim from `--help`, confirmed live): **(1) CLI flags > (2)
`--load-settings`/`--load-filaments` JSONs > (3) settings baked into the input `.3mf`** [verified].
Because there is no per-setting flag, the repo's override mechanism
(`services/slice/src/slicer/profiles/__init__.py` → `profile_with_overrides`) is the correct pattern:
**copy the committed profile JSON, mutate the key, slice with the copy.** There is no CLI shortcut.

### 2.2 Flag reference (grouped by use)

**Inputs / presets**
- `--load-settings "a.json;b.json"` — load process + machine presets (`;`-joined). **We use this.**
- `--load-filaments "f1.json;f2.json"` — load filament presets, one per logical filament. **We use this.**
- `--load-filament-ids "1,2,3,1"` / `--load-defaultfila` — map objects→filaments (multi-material). Not needed (single filament).
- `--load-custom-gcodes file.json` — inject custom toolchange/layer gcode from JSON.
- `--load-assemble-list file.json` — companion to `--assemble`.
- `--datadir DIR` — alternate config/preset store. **Optional but recommended** to isolate from a user's `~/.config/OrcaSlicer` (prevents a stray local preset leaking in). Empty datadir still slices [PoC].
- `--allow-newer-file` — accept a `.3mf` written by a newer OrcaSlicer. **We use this** (cheap version-skew insurance).
- `--uptodate` / `--uptodate-settings` / `--uptodate-filaments` — migrate an input 3mf's embedded config to current preset values. Maintenance-only.

**Slice / export**
- `--slice 0|N` — **`0` = all plates, `N` = slice only plate N**. We pass `--slice 1`. Anything but a valid int is rejected.
- `--export-3mf out.gcode.3mf` — write the sliced **project archive** (the gcode lives *inside* it, at `Metadata/plate_N.gcode`). **We use this.** There is **no `--export-gcode`**.
- `--outputdir DIR` — output directory; auto-creates the dir and drops the `.gcode.3mf`, a plain `plate_1.gcode` (**byte-identical to what we unzip — verified via md5** [PoC]), and a `result.json` manifest (`return_code`, `triangle_count`, `sliced_time`, per-plate `warning_message`). **Worth adopting** to skip our own `extract.py` and get a clean success/warning signal.
- `--export-settings resolved.json` — dump the **fully-resolved** config (all `inherits` flattened → 580 keys) [PoC]. **Great for "what did my profile actually resolve to" + diffing profile changes.**
- `--export-slicedata DIR` / `--load-slicedata DIR` — intended slice-cache. **In 2.3.2 headless `--export-slicedata` wrote nothing** for a plain-STL slice [PoC]; do not build caching on it.
- `--export-stl` / `--export-stls DIR` — export merged / per-object STL (no slicing). Useful as a Draco→STL round-trip (it read `temperature_tower.drc` and emitted a 212,484-tri STL [PoC]); positional ordering is finicky.
- `--no-check` — skip validity checks (e.g. gcode path-conflict). Still slices; use only to bypass a false-positive on a known-good part.
- `--min-save` — write a minimum-size 3mf. `--normative-check`, `--downward-check` + `--downward-settings` — multi-printer preset validators; not relevant single-printer.

**Plating: transforms (run BEFORE `--slice`; order and pairing matter)**
- `--arrange 0|1|auto` — auto-place objects. **Works** (`--arrange 1` + `--slice 1` slices cleanly) [PoC]. Required whenever you change object count or scale.
- `--orient 0|1|auto` — auto-orient for printability. Works — but **be careful**: on the temp tower it "succeeded" only by laying the 700 mm master flat (maxZ 3.4 mm — useless) [PoC].
- `--scale FACTOR` — uniform float scale. **Gotcha: `--scale` alone fails** (`found slicing or export error for partplate 1` — scaling shifts the object off-plate). **Pair with `--arrange 1`** and it works (`--scale 0.9 --arrange 1` → max_z 43.20 = 48×0.9) [PoC].
- `--clone-objects "N"` — duplicate each input into N instances. **The comma-list length must equal the number of input files**; one STL → a single number (`--clone-objects "3" --arrange 1` → 3 objects) [PoC]. `--clone-objects "1,3"` with one input errors.
- `--repetitions COUNT` — **broken for us**: rejected as `Invalid params: can not set repetitions when slice all` with **both** `--slice 1` and `--slice 0` [PoC]. Use `--clone-objects` instead.
- `--rotate DEG` / `--rotate-x` / `--rotate-y` — **HARD-BROKEN in 2.3.2 headless: every rotate variant SEGFAULTS** (`Segmentation fault (core dumped)`), with or without `--arrange` [PoC]. **Do not use `--rotate*` from the CLI — bake orientation into the STL/3mf upstream in build123d.**
- `--ensure-on-bed` — lift a partially-sunk object onto the bed. Safe alongside scale/arrange.
- `--convert-unit` — inch↔mm. No-op on an already-mm STL (benchy dims unchanged) [PoC].
- `--assemble` + `--load-assemble-list` — merge multiple inputs into one object.
- `--skip-objects "3,5"` / `--skip-modified-gcodes`, `--allow-rotations`, `--allow-multicolor-oneplate`, `--allow-mix-temp`, `--avoid-extrusion-cali-region` — arrange/selection modifiers.

**Inspection**
- `--info FILE` — **works, no slicing, fast** [PoC]. Prints per-object `size_x/y/z`, `min/max` bbox, `number_of_facets`, `manifold = yes/no`, `number_of_parts`, `volume`. The headless equivalent of our build123d bbox/manifold check and a cheap pre-slice gate (reject `manifold = no`; check bbox vs the 210×210 usable bed).

**Diagnostics / misc**
- `--debug 0..5` (fatal→trace) — bump to 4/5 when a slice fails mysteriously.
- `--pipe pipename` — stream progress (NDJSON) to a named pipe for a UI progress bar [verified].
- `--enable-timelapse`, `--mstpp` (max slice time/plate), `--mtcpp` (max triangle count/plate), `--metadata-name/-value`, `--makerlab-*`. Niche.

> **Not in 2.3.2** [verified]: `--filament-colour`, `--help-fff`, `--save`, `--version` — all rejected. Treat any flag not in the live `--help` as version-dependent.

### 2.3 CLI exit codes [verified, DeepWiki]

`0` ok · `-1` env setup · `-2` bad params · `-3` missing input · `-4` 3MF not first arg ·
`-5` corrupt preset config · `-6` unparseable model · `-7` unsupported printer · `-14` OOM ·
`-50` empty plate/no objects · `-51` invalid slicing config · `-100` slicing failed ·
`-101` g-code path conflict · `-102` g-code outside printable area.
Our wrapper keys success off `proc.returncode == 0 and output.exists()` — correct, but the negative
codes above are worth surfacing to the user (e.g. `-101` ⇒ "objects overlap", `-7`/`-5` ⇒ "preset mismatch").

### 2.4 The proven pipelines

**(1) Slice STL/3mf → plate gcode** — exactly what `slice_model()` in `services/slice/src/slicer/orca.py` runs:
```bash
xvfb-run -a /home/ryan/Applications/OrcaSlicer.AppImage \
  --slice 1 \
  --load-settings "ender5s1/machine.json;ender5s1/process.json" \
  --load-filaments "ender5s1/filament.json" \
  --allow-newer-file \
  --export-3mf out.gcode.3mf \
  model.stl
```
Produces `out.gcode.3mf`; `extract.py` pulls `Metadata/plate_1.gcode` and parses
`Metadata/slice_info.config` for `prediction` (print-time s), filament length, layer count. Confirmed
the profile patches land in the gcode: `M205 X25.00 Y25.00` (jerk) and `M204 P500` (accel cap) [PoC].

**(2) Multi-up plating** — `--clone-objects "N" --arrange 1` (NOT `--repetitions`); if scaling, always add `--arrange`:
```bash
xvfb-run -a …OrcaSlicer.AppImage --slice 1 \
  --load-settings "machine.json;process.json" --load-filaments "filament.json" \
  --allow-newer-file --scale 0.9 --clone-objects "4" --arrange 1 \
  --export-3mf plate.gcode.3mf model.stl
```

**(3) Model inspection** — `--info model.stl` (no profiles needed); parse `manifold`, bbox, `volume`.

**(4) Resolved-config dump** — add `--export-settings resolved.json` → flattened 580-key effective config.

**(5) Calibration project (PA) on our printer** — slice a shipped `.3mf` and override the machine/process/filament to ours:
```bash
xvfb-run -a …OrcaSlicer.AppImage --slice 1 \
  --load-settings "ender5s1/machine.json;ender5s1/process.json" \
  --load-filaments "ender5s1/filament.json" --allow-newer-file \
  --export-3mf pa_ender.gcode.3mf \
  /tmp/orca-research/squashfs-root/resources/calib/pressure_advance/pa_pattern.3mf
```
**[PoC] EXIT 0; 72.6 KB / 3,495-line gcode; all 71 `M900 K` overrides preserved; our Ender start-gcode present; footprint X 2–129.5, Y 25–121 mm — fits the bed.** The embedded sweep rides in `custom_gcode_per_layer.xml` and survives the profile swap.

### 2.5 Limitations & gotchas (call-outs)

1. **No per-setting flags** — the reason we copy-and-mutate profile JSONs. [verified]
2. **No calibration flags** — confirmed in `--help` *and* at source level (calibration test-model generation is GUI-only: `src/slic3r/GUI/Calibration*.cpp`, `CalibUtils.cpp`, `calib_dlg.cpp`; the CLI's only `calib` references are calibration *thumbnails*, not models) [verified].
3. **`--rotate*` SEGFAULTS** in 2.3.2 headless — orient in build123d. [PoC]
4. **`--repetitions` is unusable** (rejected with both `--slice 1` and `--slice 0`) — use `--clone-objects "N"`. [PoC]
5. **`--scale` must be paired with `--arrange`/`--orient`** or it errors on partplate 1. [PoC]
6. **`--clone-objects` list length must equal input-file count.** [PoC]
7. **Needs a display** — Qt GUI app; headless requires `xvfb-run -a` (handled by `_headless_prefix()`). The `libEGL/MESA/ZINK/glew "init opengl failed! skip thumbnail generating"` lines under xvfb are **harmless** — only thumbnails are skipped; the slice completes with exit 0. [PoC]
8. **`.gcode.3mf` extraction quirk** — `--export-3mf` writes a ZIP; the real gcode is `Metadata/plate_N.gcode`. We unzip it (or use `--outputdir`). The SD card needs the *plain* `.gcode`, never the `.gcode.3mf`. [verified + repo behaviour]
9. **Validator strictness** — OrcaSlicer rejects an empty `layer_change_gcode` for M83 (relative-extruder) machine profiles, which is why `machine.json` patches it to `G92 E0` (see `profiles/ender5s1/README.md`). The headless CLI **ignores GUI bed-plate selection and falls back to Cool Plate**, so bed temps are pinned across all plate types in `filament.json`. [verified + repo]
10. **`printer_model` mismatch** — slicing a `.3mf` whose embedded `printer_model` differs from the loaded machine JSON can be rejected (exit `-7`/`-5`); the community fix is to patch the 3mf's `printer_model` before slicing. Relevant if we ever slice arbitrary third-party 3mfs (not our STL path). [verified]

---

## 3. Calibration suite

### 3.1 How OrcaSlicer calibration works (the architecture we must replicate)

There are **no calibration CLI flags** [verified]. Each GUI test = **model geometry + a parameter
sweep injected one of three ways**. Which pattern a test uses dictates headless difficulty:

| Pattern | Mechanism | On-disk evidence | Headless difficulty |
|---|---|---|---|
| **A. Ready `.3mf` project** | model + full `project_settings.config` + `custom_gcode_per_layer.xml` baked in | `pa_pattern.3mf`, `auto_pa_line_single/dual.3mf` | **Easy** — slice the `.3mf` directly (override machine/process/filament to ours) |
| **B. Per-layer custom g-code** | a model + `(height → M-command)` pairs written into `Metadata/custom_gcode_per_layer.xml` (OrcaSlicer's "custom gcode at height") | `pa_pattern.3mf`'s 71 `M900 K…` bands; temp tower uses the same hook with `M104 S…` | **Medium** — we build the model `.3mf` + the XML |
| **C. Per-object config modifiers** | N geometry copies, each tagged with a different `flow_ratio`/PA via `model_settings.config`; applied at slice time | `flowrate-test-pass1.3mf` = 9 objects, geometry-only, zero config | **Hardest** — CLI can't set per-object overrides; slice OrcaSlicer's prebuilt project or sweep one-block-per-slice |

**Critical config-priority fact:** because `CLI > --load-settings/--load-filaments > 3mf`, for
Pattern-A/C `.3mf` projects we can slice them directly and override the machine/process/filament to the
Ender 5 S1, while the embedded **custom g-code sweep** (Pattern B) survives the swap [PoC — PA proven].

**Model-format gotcha:** the loose models on disk are **`.drc` = Draco-compressed mesh** (magic bytes
`DRACO`). `.drc` is **not a blocker** — the CLI round-trips it to STL via `--export-stl` [PoC] — but a
bare `.drc`/STL won't slice as-is: the temp-tower master is **700 mm tall** (44.5 × 10 × 700 mm), the
GUI's parametric master that the GUI *trims* to the chosen band; slicing it raw fails with `Nothing to
be sliced … no object inside the print volume` [PoC]. Tests shipping a `.3mf` are ready; tests shipping
only a `.drc` need us to (a) place/cap the mesh **and** (b) inject the per-band sweep XML.

### 3.2 Full suite — ready vs build

| Test | Model file (under `resources/calib/`) | Format | Pattern | Headless status |
|---|---|---|---|---|
| **PA Pattern** | `pressure_advance/pa_pattern.3mf` | 3mf | A+B | **Slices today** on our profile, 71×`M900 K` preserved [PoC] — strongest win |
| **PA Line** | `pressure_advance/auto_pa_line_single.3mf` (`…_dual` for 2 heads) | 3mf | A/C | Slices today (same project structure) |
| **Flow Linear** | `filament_flow/Orca-LinearFlow.3mf` (`…_fine`) | 3mf (geo-only) | C | **Slices with `--arrange 1`** → 964 KB / 37,842-line gcode [PoC] |
| **Flow 2-pass (legacy)** | `filament_flow/flowrate-test-pass{1,2}.3mf`, `pass1.3mf` | 3mf (geo-only) | C | **FAILS** even with `--arrange 1`: stacked blocks overlap → `-101 gcode path conflict` [PoC]. GUI-only; replace with per-block `flow_ratio` sweep |
| **Tolerance** | (bundled normal model, not in `calib/`) | STL | A (no sweep) | Slice as-is, or generate our own clearance coupon in build123d |
| **Temperature** | `temperature_tower/temperature_tower.drc` | Draco | B | **Build**: place/cap 700 mm master + inject `M104 S…` XML [PoC] |
| **PA Tower** | `pressure_advance/pressure_advance_test.drc` (+ `tower_with_seam.drc`) | Draco | B | Build: decode/place + `M900 K…` XML |
| **Retraction** | `retraction/retraction_tower.drc` | Draco | B | Build: per-band retract; or N fixed `retraction_length` slices |
| **Max Vol. Speed** | `volumetric_speed/SpeedTestStructure.drc` | Draco | B | Build: per-band feedrate; or N fixed `filament_max_volumetric_speed` slices |
| **VFA** | `vfa/vfa.drc` | Draco | B | Build: per-band speed `F`; or N fixed-speed slices |
| **Input Shaping** | `input_shaping/{ringing_tower,fast_tower_test}.drc` | Draco | B | Build: per-band `M593 F…` (Marlin) / `SET_INPUT_SHAPER` (Klipper) — **needs firmware support the stock Ender 5 S1 lacks** |
| **Cornering / SCV** | `cornering/SCV-V2.drc` | Draco | B | Build: per-band `M205 J…`; **low priority** (jerk/accel are dead knobs at our 25 mm/s walls — see memory) |

> Two reusable primitives unlock every Pattern-B test: **(1)** generate the tower parametrically in
> build123d (cleaner than wiring a Draco decoder, and we already author build123d), and **(2)** a
> `custom_gcode_per_layer.xml` writer + `.3mf` packer taking `[(z_height, gcode_line)]` → a sliceable
> project. Mirror the verified archive layout from `pa_pattern.3mf`: `3D/3dmodel.model`,
> `Metadata/custom_gcode_per_layer.xml`, `[Content_Types].xml`, `_rels/.rels`.

### 3.3 Concrete recipes (the four the user named first)

#### Temperature tower — **needs construction (Pattern B)**
- **Measures:** filament viscosity vs nozzle temp — stringing, layer adhesion, overhangs, surface finish.
- **GUI defaults** [verified, `calib_dlg.cpp`]: PLA start **230 °C** → end **190 °C**, **step fixed 5 °C**; ABS/ASA 270→230. Each ~10 mm band steps down 5 °C bottom→top. Auto-scales to nozzle diameter in 2.3.x.
- **Recipe:**
  1. **Generate** a stacked 9-block tower in build123d (`(230−190)/5 + 1 = 9` blocks, each 10 mm, ~90 mm total). Prefer this over capping the 700 mm Draco master (uniform scaling distorts; capping needs a shapely cut face — present in the cad env but not wired) [PoC].
  2. Compute band layers: `layer = round(block_height / layer_height)` (our 0.2 mm process → 50 layers/band).
  3. Write `custom_gcode_per_layer.xml` with one `<layer>` entry per band boundary emitting `M104 S{temp_n}` (n=0…8, 230→190). **Do not** pass a competing `nozzle_temp` override — the per-layer M104 must win.
  4. Pack `.3mf` and slice with our Ender profiles. Confirmed a placed tower slices clean (EXIT 0) but a raw slice requests only one print temp (S150/S200/S0) — the banding XML is mandatory [PoC].
  - **Simplest fallback (no XML):** emit 9 single-block STLs, slice each with `slice_overrides(nozzle_temp=T)`, concatenate g-code with `M104` between segments. Less faithful but trivial.

#### Speed / Max Volumetric Speed — **needs construction (Pattern B)**
- **Measures:** true max flow (mm³/s) before under-extrusion — the ceiling that caps all print speeds.
- **GUI defaults** [verified]: start **5 mm³/s** → end **20 mm³/s**, step **0.5**. Flow maps linearly to Z; read the height where extrusion breaks down.
- **Recipe (faithful):** generate the cone-spike in build123d, inject per-band feedrate scaling into `custom_gcode_per_layer.xml` (volumetric speed isn't one clean M-code, so the band changes effective feedrate the way `pa_pattern` bakes its toolpath).
- **Recipe (practical, ship first):** slice the spike (or a simple bar) at several **fixed** `filament_max_volumetric_speed` overrides via `profile_with_overrides`/`slice_overrides`, compare. Maps perfectly onto the existing override helper — **this is the recommended Phase-1 speed test.**
- *Sibling — VFA* (vertical fine artifacts) is the print-speed analogue: start **40 mm/s** → end **200 mm/s**, step **10**; same per-band `F` or N-fixed-speed approach.

#### Flow (flow ratio) — **Linear ready; 2-pass needs replacement**
- **Measures:** extrusion multiplier `flow_ratio` for correct wall thickness / top-fill.
- **Linear (recommended):** slice `filament_flow/Orca-LinearFlow.3mf` with **`--arrange 1`** [PoC] — one plate of graduated lines, read the best visually, no second print.
- **Legacy 2-pass:** Pass 1 = 9 blocks, modifiers −20…+20 % (step 5); Pass 2 = 10 blocks, −9…0 % (step 1). `new_flow_ratio = old × (100 + chosen) / 100`. **The shipped `.3mf`s FAIL headless (`-101` overlap)** [PoC] — to support 2-pass we must regenerate: emit 9/10 single-pad STLs and slice each with `slice_overrides(flow=base×(100+mod)/100)`, then arrange/photograph.
- Terminology: 2.3.x renamed "flow rate" → **"flow ratio"**; the underlying key is `flow_ratio` (our `flow` field) [verified].

#### Pressure Advance — **ready today (Pattern A) — strongest win**
- **Measures:** `M900 K` value compensating nozzle-pressure lag — fixes corner bulge and gaps.
- **Recipe:** slice `pressure_advance/pa_pattern.3mf` (or `auto_pa_line_single.3mf`) with our Ender profiles as `--load-settings`/`--load-filaments`. **[PoC] all 71 `M900 K0…K0.04` overrides preserved, our Ender start-gcode present, fits the bed.** GUI defaults: start 0.0, end 0.08, step 0.005 (DDE).
- **Caveat (printer reality):** `M900 K` only takes effect with **firmware Linear Advance**, which the **stock Ender 5 S1 Marlin does not have** (consistent with the user's firmware constraint in memory). The test still *slices* fine — but surface it with a "needs Linear Advance firmware to take effect" warning so the user isn't misled.

**Recommended build order (user priorities first):** (1) **PA Pattern** — free, slices today; (2)
**Temperature tower** — highest print-quality impact, needs the build123d tower + `M104` XML; (3)
**Max Volumetric Speed** — ship the N-fixed-`filament_max_volumetric_speed` variant first; (4) **Flow
Linear** — `Orca-LinearFlow.3mf` + `--arrange 1`.

---

## 4. Presets & known filaments

### 4.1 Where the 9,961 presets live & how they're organized

`/tmp/orca-research/squashfs-root/resources/profiles/` holds **one subtree per vendor** (~60 vendors:
`Creality/`, `BBL/`, `Elegoo/`, `Prusa/`, plus the vendor-agnostic `OrcaFilamentLibrary/`). Each
vendor dir has `machine/ process/ filament/` subfolders + a sibling **`<Vendor>.json` index**:

```
profiles/
  Creality.json                         # vendor INDEX (pointers only, no settings)
  Creality/
    machine/   *.json                   # printer presets (bed, kinematics, start/end gcode)
    process/   *.json                   # "print" presets (layer height, walls, infill, speeds)
    filament/  *.json                   # material presets (temps, fan, flow, vol speed)
```

Creality's index (`version 02.03.02.60`) reports **34 machine models, 86 machine presets, 311 process
presets, 70 filament presets**. The index is a manifest with `machine_model_list` (physical printer
cards), `machine_list` (sliceable machine presets incl. non-instantiable bases), `process_list`,
`filament_list` — each entry a `{name, sub_path}` pointer. **License: AGPL-3.0** [verified] — there is
**no upstream grant of public-domain reuse** for vendor presets, so treat any committed copies as
AGPL-3.0 (preserve attribution / keep open). **[flag for §8.]**

### 4.2 Inheritance (`inherits` / `from` / `instantiation`)

Every preset is a thin diff over a parent named by **`inherits`**; resolve by walking to the root and
merging **base-first, child-overrides-parent**. Metadata keys (not settings): `inherits`, `from`,
`instantiation`, `setting_id`, `filament_id`, `type`. `from: "system"` = built-in; `instantiation:
"true"` = UI-selectable (bases like `fdm_filament_pla` are `"false"` — abstract). Resolved chains:

| Preset | Chain (leaf → root) |
|---|---|
| Machine `Creality Ender-5 S1 0.4 nozzle` | → `fdm_creality_common` → `fdm_machine_common` |
| Process `0.20mm Standard @Creality Ender5S1` | → `fdm_process_creality_common` → `fdm_process_common` |
| Filament `Creality Generic PLA` | → `fdm_filament_pla` → `fdm_filament_common` |

`inherits` resolves **by name within the same vendor dir first**, falling back to `OrcaFilamentLibrary`
(every vendor ships its own `fdm_filament_pla.json` etc.).

### 4.3 Compatibility gating

A filament/process is offered for a printer if it matches the printer's machine-preset name via
**`compatible_printers`** (explicit array — the 6 Creality generics list `Creality Ender-5 S1 0.4
nozzle`), **`compatible_printers_condition`** (a boolean expr), or **`compatible_printers: []`**
(universal — the `OrcaFilamentLibrary` `Generic … @System` bases show for every printer). The printer
model's `"default_materials": "Creality Generic PLA;Creality Generic PETG;Creality Generic ABS"` is
what the UI pre-selects.

### 4.4 Known filaments compatible with the Creality Ender-5 S1

**6 vendor presets** explicitly gated to `Creality Ender-5 S1 0.4 nozzle` (resolved; OrcaSlicer values
are per-extruder arrays):

| Filament | Nozzle °C | Bed °C (cool) | Max vol mm³/s | Fan min/max % | Flow ratio | Chain |
|---|---|---|---|---|---|---|
| **Creality Generic PLA** | 220 | 45 (35) | **12** | 100/100 | 0.98 | `fdm_filament_pla` |
| **Creality Generic PETG** | 255 | 80 (60) | **10** | 40/90 | 0.95 | `fdm_filament_pet` |
| **Creality Generic ABS** | 260 | 105 | **12** | 10/80 | 0.926 | `fdm_filament_abs` |
| **Creality Generic ASA** | 260 | 105 | **12** | 10/80 | 0.926 | `fdm_filament_asa` |
| **Creality Generic PLA-CF** | 220 | 45 (35) | **12** | 100/100 | 0.95 | `fdm_filament_pla` |
| **Creality Generic PA-CF** | 290 | 100 | **8** | 10/30 | 1.0 | `fdm_filament_pa` |

For the user's defaults — **PETG** (interior) and **ASA** (sun/heat) — those rows are the source of
truth. Always-available universal fallbacks (`compatible_printers: []`, from `OrcaFilamentLibrary`):
`Generic PLA/PETG/ABS/ASA/TPU @System` (+ HF/Matte/Silk/CF variants).

### 4.5 Loading headlessly + the committed-profile bug

Two loading models — **we use #2:**
1. `--datadir DIR` — point at a full data dir; OrcaSlicer resolves presets *by name* via the vendor
   index + inheritance. Heavy, version-coupled (must replicate the whole tree).
2. `--load-filaments "f.json"` / `--load-settings "machine.json;process.json"` — hand it **standalone
   JSONs**. This is what `orca.py:81` does, with profiles committed at
   `services/slice/src/slicer/profiles/ender5s1/{machine,process,filament}.json`.

**Real bug to fix:** `profiles/ender5s1/filament.json` is **not flattened** — it still carries
`"inherits": "fdm_filament_pet"` but no base ships alongside, so resolved-only keys come back null when
loaded standalone (`nozzle_temperature: None`, `filament_type: None`, while `hot_plate_temp` and
`filament_max_volumetric_speed` are present because set directly in the leaf). It slices today only
because `--load-filaments` merges over the input 3mf/system defaults. **To be self-contained and to
expose true temps to the UI, re-export each filament as a fully flattened preset** (walk `inherits` to
root, merge base-first, drop `inherits`/`from`/`instantiation`/`setting_id`), using the §4.4 values.
**[flag — also affects every filament preset we ship; see §8.]**

---

## 5. Settings schema — categorized, highest-value first

OrcaSlicer has no per-setting flags; the tunable surface is the JSON keys in the three preset files.
Keys are typed-by-file: **process** = how the part slices (geometry/speed/support); **filament** =
material thermal/flow/cooling (every value is a **JSON array** for multi-extruder, e.g.
`"nozzle_temperature": ["220"]`); **machine** = kinematics + base retraction + G-code.

> **Retraction gotcha:** for our single-extruder printer the *effective* retraction lives in
> **machine** (`retraction_length`, `retraction_speed`, `z_hop`, `wipe`). The filament-side
> `filament_retraction_length` etc. are *per-material overrides*, empty/`nil` by default. Expose
> retraction as machine-level; offer filament overrides only in an advanced editor.

### Quality (process.json)
`layer_height`★, `initial_layer_print_height`★, `wall_loops`★, `top_shell_layers`/`bottom_shell_layers`★,
`top_shell_thickness`/`bottom_shell_thickness`, `seam_position`★, `wall_generator` (classic/arachne),
`precise_outer_wall`, `top_surface_pattern`/`bottom_surface_pattern`, `resolution`,
`elefant_foot_compensation`, `ironing_type`, `xy_hole_compensation`/`xy_contour_compensation`.

### Strength (process.json)
`sparse_infill_density`★ (string `"15%"`), `sparse_infill_pattern`★ (grid/gyroid/crosshatch/cubic),
`infill_direction`, `infill_wall_overlap`, `infill_combination`, `minimum_sparse_infill_area`
(+ shares `wall_loops`, `top/bottom_shell_layers`).

### Speed (process.json)
`outer_wall_speed`★, `inner_wall_speed`★, `sparse_infill_speed`★, `internal_solid_infill_speed`,
`top_surface_speed`, `travel_speed`★, `initial_layer_speed`★ (string `"35%"` or mm/s),
`initial_layer_infill_speed`, `bridge_speed`, `gap_infill_speed`, `overhang_{1..4}_4_speed`,
and `*_acceleration` caps (`default/travel/outer_wall/inner_wall/initial_layer/top_surface` — **keep at
0 / firmware default** for the bulging tune; see profile README).

### Support (process.json)
`enable_support`★, `support_type`★ (normal(auto)/tree(auto)/manual), `support_threshold_angle`★,
`support_top_z_distance`★, `support_bottom_z_distance`, `support_on_build_plate_only`,
`support_base_pattern`/`_spacing`, `support_interface_top_layers`/`_bottom_layers`,
`support_interface_spacing`, `support_object_xy_distance`, `support_style`,
`raft_layers`/`brim_width`/`brim_object_gap`.

### Cooling (filament.json — arrays)
`fan_max_speed`★, `fan_min_speed`★, `slow_down_layer_time`★, `slow_down_min_speed`,
`slow_down_for_layer_cooling`, `fan_cooling_layer_time`, `close_fan_the_first_x_layers`,
`full_fan_speed_layer`, `overhang_fan_speed`/`overhang_fan_threshold`, `reduce_fan_stop_start_freq`.

### Thermal / flow / retraction / PA (filament + machine)
`nozzle_temperature`★ (filament), `nozzle_temperature_initial_layer`★ (filament),
`hot_plate_temp`/`_initial_layer`★ + cool/textured/supertack/eng twins (filament — **pin all together**;
headless CLI resolves Cool Plate), `filament_flow_ratio`★ (filament), `filament_max_volumetric_speed`★
(filament — the real speed ceiling), `pressure_advance`/`enable_pressure_advance`★ (filament — **no-op
without firmware Linear Advance**), `retraction_length`★ / `retraction_speed` / `deretraction_speed`
(machine), `z_hop`/`z_hop_types` (machine), `wipe`/`retract_before_wipe`/`retraction_minimum_travel`
(machine), `filament_type`/`filament_diameter`/`filament_density`/`filament_cost` (filament).

### Machine kinematics & G-code (machine.json — hold back from beginners)
`nozzle_diameter`, `printable_area`/`printable_height`, `max_/min_layer_height`, `gcode_flavor` (must be
`marlin`), `machine_max_jerk_x/y` (we raised 8→25 to cut corner bulging), `machine_max_acceleration_*`/
`machine_max_speed_*`, `machine_start_gcode`/`machine_end_gcode`/`layer_change_gcode` (**breaking these
breaks slicing**), `default_bed_type` (ignored headless).

### The ~25 to expose first (★ = always-show), with the **real `SliceSettings` field name** where one exists today

| # | UI control | OrcaSlicer key (file) | In `SliceSettings` today? |
|---|---|---|---|
| 1★ | Layer height | `layer_height` (process) | ✅ `layer_height` |
| 2 | First-layer height | `initial_layer_print_height` (process) | ➕ add |
| 3★ | Walls | `wall_loops` (process) | ✅ `wall_loops` |
| 4★ | Top layers | `top_shell_layers` (process) | ✅ `top_layers` |
| 5★ | Bottom layers | `bottom_shell_layers` (process) | ✅ `bottom_layers` |
| 6★ | Infill % | `sparse_infill_density` (process) | ✅ `infill_density` |
| 7★ | Infill pattern | `sparse_infill_pattern` (process) | ✅ `infill_pattern` |
| 8★ | Seam | `seam_position` (process) | ✅ `seam_position` |
| 9★ | Supports on/off | `enable_support` (process) | ✅ `support` |
| 10★ | Support type | `support_type` (process) | ➕ add |
| 11★ | Support angle | `support_threshold_angle` (process) | ✅ `support_threshold` |
| 12★ | Support gap | `support_top_z_distance` (process) | ➕ add |
| 13 | Brim | `brim_width` (process) | ✅ `brim_width` |
| 14★ | Outer-wall speed | `outer_wall_speed` (process) | ✅ `wall_speed` (maps to wall speeds) |
| 15 | Infill speed | `sparse_infill_speed` (process) | ➕ add |
| 16★ | First-layer speed | `initial_layer_speed` (process) | ➕ add |
| 17 | Travel speed | `travel_speed` (process) | ➕ add |
| 18★ | Nozzle temp | `nozzle_temperature` (filament) | ✅ `nozzle_temp` |
| 19 | First-layer nozzle | `nozzle_temperature_initial_layer` (filament) | ➕ add |
| 20★ | Bed temp | `hot_plate_temp` + siblings (filament) | ✅ `bed_temp` |
| 21★ | Flow ratio | `filament_flow_ratio` (filament) | ✅ `flow` |
| 22★ | Max volumetric speed | `filament_max_volumetric_speed` (filament) | ➕ add (calibration lever) |
| 23★ | Max fan | `fan_max_speed` (filament) | ➕ add |
| 24 | Min layer time | `slow_down_layer_time` (filament) | ➕ add |
| 25★ | Retraction length | `retraction_length` (machine) | ✅ `retraction_length` |
| 26 | Retraction speed | `retraction_speed` (machine) | ➕ add |
| 27 | Z-hop | `z_hop` (machine) | ➕ add |
| — | Jerk (advanced) | `machine_max_jerk_x/y` (machine) | ✅ `jerk` |

**Hold back from beginners (advanced/expert tab):** all `*_acceleration`/`machine_max_*` (the bulging
tune deliberately keeps these at firmware defaults — exposing them invites the corner-dwell
regression), `pressure_advance`/`enable_pressure_advance` (no-op without a firmware flash — show only
with a "needs Linear Advance firmware" warning), all `*_gcode` keys (break slicing), prime-tower/
multi-material keys (single-extruder), and BBL-only experimental keys (`skin_infill_density`, `scarf_*`,
circle-compensation) the Creality base doesn't ship.

---

## 6. Current integration & gaps

### 6.1 How a slice flows today (verified against `main.py`)

One shared slice core, reused by every entry point:

1. **HTTP entry** (`services/api/src/api/main.py`):
   - `POST /templates/{name}/slice` (:459), `POST /generated/{name}/slice` (:516), `POST /samples/{name}/slice` (:1196) → all call `_submit_slice(name, settings)` (:450) → resolves `<builds>/<name>/<name>.stl` → `_slice_stl`.
   - `POST /chats/{chat_id}/slice` (:1000) → `_resolve_filament_settings(chat, body)` (:601, explicit override > chat filament profile > default) → `_slice_stl(..., chat_id=…)`.
   - `POST /calibrate` (:1060) → builds/stages a cube or Benchy STL → `_run_slice_inline` directly (:1106).
   - `POST /slice/orca` (:1205) / `POST /slice/prusa` (:1224) / `POST /slice/extract` (:1241) → low-level passthroughs that **bypass the override system** (raw machine/process/filament JSON paths via `OrcaSliceRequest`).
2. **Job + override layer** — `_slice_stl` (:368) wraps `_run_slice_inline` in `jobs.submit("slice.ender5s1", …)` and, for chats, calls `_update_chat_after_slice` (:578) on completion.
3. **Override core** — `_run_slice_inline` (:400): `settings.model_dump(exclude={"raw"}, exclude_none=True)` → typed dict + `settings.raw` → raw dict; `slice_overrides(**typed)` (`profiles/__init__.py:57`) and `route_raw_overrides(raw)` (:168) map UI keys → OrcaSlicer keys bucketed into `{process, machine, filament}`; `merge_overrides` (:201, raw wins) → each bucket with overrides → `profile_with_overrides` (:32) writes `out_dir/_{kind}_override.json` (committed profile + overrides); `orca.slice_model(stl, machine=, process=, filaments=[…], extract=True)` (`orca.py:81`) builds the CLI command, prefixes `xvfb-run -a` headless, runs it, and on success calls `extract.summarize` + `extract.extract_gcode`.
4. **Extraction** — `extract.py` pulls `Metadata/plate_1.gcode` from the `.gcode.3mf` and parses `Metadata/slice_info.config`; `_run_slice_inline` adds `gcode_url` and backfills `layer_count`.

### 6.2 Parameterized vs hardcoded

**Mature / parameterized:** the **17 typed `SliceSettings` fields** (`schemas.py:23` — `infill_density`,
`wall_speed`, `jerk`, `bed_temp`, `nozzle_temp`, `flow`, `layer_height`, `wall_loops`, `top_layers`,
`bottom_layers`, `infill_pattern`, `seam_position`, `brim_width`, `support`, `support_threshold`,
`retraction_length`, + `raw`), each mapped in `slice_overrides()`; a power-user `raw: dict[str,str]`
routed by `route_raw_overrides()` with a `_RAW_DENYLIST` protecting `*_gcode`/firmware/identity keys
(`profiles/__init__.py:137,184`); value-arity handling via `_committed_key_buckets()` (:151); the
schema-driven UI (`descriptor.py` derives min/max/options from field metadata; web `SettingsForm`
renders by `field.key` with zero per-field code; bounds single-sourced in `schemas.py` **and**
`packages/types/src/index.ts:156` — a parity test asserts they match); per-filament saved settings
(`FilamentProfile.settings`/`default_settings`, `schemas.py:59`) + a multi-printer registry
(`registry.py`).

**Hardcoded / single-printer:**
- `ender5s1_profiles()` (`profiles/__init__.py:23`) always returns the three committed JSONs; there is **one** committed filament profile (Creality Generic PLA) — material variation lives only as numeric overrides, not separate base profiles.
- `_run_slice_inline` calls `ender5s1_profiles()` unconditionally — **ignores `chat.printer_id`** for profile selection.
- The descriptor is single-printer (`_FIELDS`/`_GROUPS`, `descriptor.py:49,37`); per-printer overlays are explicitly deferred (`descriptor.py:12`).
- Calibration is two hardcoded targets — `CalibrateIn.target: Literal["cube","benchy"]` (`schemas.py:237`); **none of OrcaSlicer's shipped calib models are wired in**.
- `orca.slice_model` always single-plate/single-filament; `extra_args` exists (`orca.py:89`) but **no caller populates it** for `--arrange`/`--scale`/`--clone-objects`.

### 6.3 Where each capability lands

| Concern | Backend | Schema (both sides) | Frontend |
|---|---|---|---|
| New typed setting | `slice_overrides()` (`profiles/__init__.py`); `_FIELDS` (`descriptor.py`) | `SliceSettings` (`schemas.py` + `packages/types/src/index.ts`) | none (auto via `SettingsForm`) |
| Filament-preset picker | `_run_slice_inline` (resolve base path), new resolver in `profiles/__init__.py`, new `GET /presets/filaments` | add `base_preset` to `FilamentProfile` | `apps/web/components/settings/filament-dialog.tsx` |
| Calibration prints | new `slice_calibration` helper in `orca.py`; extend `calibrate()` `work()` (main.py:1060) | extend `CalibrateIn.target` + TS `CalibrateRequest` | calibrate page under `apps/web/app/settings/equipment/…/calibrate/[target]` |
| Multi-up / transforms | thread `extra_args` from `_run_slice_inline` → `slice_model` | (optional) add `clones`/`scale` to a request model | optional plating control |
| Per-print overrides | **done** — optional *merge* in `_resolve_filament_settings` (:601) | — | **done** (`print-settings-panel.tsx`, `SettingsForm`) |
| Multi-printer profiles | make `_run_slice_inline` pick profiles by `printer_id` | per-printer descriptor overlay (`descriptor.py`) | none |

**Key files:** `services/slice/src/slicer/{orca.py,extract.py,profiles/__init__.py}` +
`profiles/ender5s1/{machine,process,filament}.json`; `services/api/src/api/{main.py,schemas.py,
descriptor.py,registry.py}`; `packages/types/src/index.ts`; `apps/web/components/{chat/
print-settings-panel.tsx,settings/settings-form.tsx,settings/filament-dialog.tsx}`, `apps/web/lib/api.ts`.

---

## 7. Proposed roadmap

Effort: **S** ≈ <½ day · **M** ≈ 1–2 days · **L** ≈ 3+ days. Every item is additive on the existing
override core; nothing requires touching the proven `slice_model` invocation except threading
`extra_args`.

### Phase 1 — the user's explicit asks (temperature calib · speed calib · known-filament presets)

**1A. Fix the filament-profile flattening bug** — *prereq for everything thermal.* **S, low risk.**
Re-export `profiles/ender5s1/filament.json` as a fully-flattened PLA preset (drop `inherits`, inline
resolved values from §4.4). Add a small build/test asserting `nozzle_temperature`/`filament_type` are
non-null when loaded standalone. *Where:* `services/slice/src/slicer/profiles/ender5s1/filament.json`
(+ a guard test in `services/slice`).

**1B. Known-filament presets (PETG, ASA, ABS, PLA-CF, PA-CF)** — **M, low–med risk.**
- Commit 5 flattened filament JSONs alongside PLA at `profiles/ender5s1/` using §4.4 values (treat as AGPL-3.0 — see §8). [unverified: exact per-material cooling sub-keys beyond the table — pull each from its resolved chain at build time.]
- Add a resolver `ender5s1_filament(material: str) -> Path` in `profiles/__init__.py`; add `base_preset: str` (or `material`) to `FilamentProfile` (`schemas.py` + `packages/types/src/index.ts`).
- In `_run_slice_inline`, resolve the filament base from the chat/record's `base_preset` instead of always PLA; keep numeric `SliceSettings` as overrides on top.
- `GET /presets/filaments` → list available bases; picker control in `filament-dialog.tsx`.
- *Risk:* a non-Generic base may not list the printer in `compatible_printers` — validate at load (or strip `compatible_printers` in our flattened copies, since we pass profiles explicitly).

**1C. Promote ~10 high-value settings to typed controls** — **S each, low risk.**
Add to `SliceSettings` (+ TS) + `slice_overrides()` + `descriptor.py._FIELDS`: `initial_layer_speed`,
`sparse_infill_speed`, `travel_speed`, `nozzle_temperature_initial_layer`, `support_type`,
`support_top_z_distance`, `filament_max_volumetric_speed`, `fan_max_speed`, `retraction_speed`,
`z_hop`. (The web form needs no change — it renders by `field.key`.) These are already settable via
`raw` today; this just promotes them to validated controls.

**1D. Calibration: Pressure Advance + Flow Linear (the ready ones)** — **M, low risk.**
- Add a `slice_calibration(asset_3mf, machine, process, filaments, extra_args)` helper in `orca.py` that slices a shipped `.3mf` with our profiles (machine/process/filament override the embedded Bambu config; the `custom_gcode_per_layer.xml` sweep survives — **proven for PA** [PoC]).
- Extend `CalibrateIn.target` → add `"pressure_advance"` and `"flow"` (+ TS `CalibrateRequest`); in `calibrate()` `work()`, copy the matching asset (`pressure_advance/pa_pattern.3mf`; `filament_flow/Orca-LinearFlow.3mf`) into `out_dir` and slice it. **Flow passes `--arrange 1` via `extra_args`.**
- Surface the **"M900 K needs Linear Advance firmware"** warning on the PA result.
- *Risk:* low — both proven headless this session. Do **not** wire the legacy `flowrate-test-pass1.3mf` (it `-101`s).

**1E. Calibration: Temperature tower** — **M–L, med risk** (the user's #1 named feature).
- Generate a parametric 9-block tower in build123d (230→190 °C, 5 °C/10 mm band) — a new template/generator under `services/cad` or a small helper in `services/slice`.
- Add a `custom_gcode_per_layer.xml` writer + `.3mf` packer (the second reusable primitive; mirror `pa_pattern.3mf`'s archive layout) taking `[(z, "M104 S{t}")]`.
- Extend `CalibrateIn.target` → `"temp_tower"`; `work()` builds the tower `.3mf` and slices it via `slice_calibration`. Ship the **no-XML fallback** (9 fixed-temp STL slices concatenated) first if the XML packer slips.
- *Risk:* medium — the XML layer-mapping (z↔layer) must match our 0.2 mm process; verify the emitted gcode contains the `M104 S###` band sequence before calling it done. **Cap self-correction at 2 rounds.**

**Phase-1 schema delta (the concrete contract):**
```python
# schemas.py — SliceSettings: add the 1C fields (mirror in packages/types)
initial_layer_speed: int | None = Field(None, ge=5, le=120)
infill_speed: int | None = Field(None, ge=10, le=300)
travel_speed: int | None = Field(None, ge=20, le=400)
nozzle_temp_initial: int | None = Field(None, ge=150, le=300)
support_type: Literal["normal", "tree"] | None = None
support_gap: float | None = Field(None, ge=0, le=0.5)
max_volumetric_speed: float | None = Field(None, ge=1, le=30)
fan_max: int | None = Field(None, ge=0, le=100)
retraction_speed: int | None = Field(None, ge=10, le=60)
z_hop: float | None = Field(None, ge=0, le=2)

# FilamentProfile: add the base-preset selector
base_preset: Literal["pla","petg","abs","asa","pla-cf","pa-cf"] = "pla"

# CalibrateIn.target: extend
target: Literal["cube","benchy","pressure_advance","flow","temp_tower"]
```

### Phase 2 — depth & polish

- **2A. Max-Volumetric-Speed + VFA calibration** (N-fixed-override variant) — **M.** Reuse `slice_calibration`/`slice_overrides`; sweep `filament_max_volumetric_speed` / print speed across N slices, concatenate. Faithful tower (per-band feedrate XML) deferred.
- **2B. `--info` pre-slice gate** — **S.** Call `--info` before slicing; reject `manifold = no` and bbox > 210×210 with a clear message (cheaper than a failed slice). *Where:* a guard in `_run_slice_inline`/`orca.py`.
- **2C. Adopt `--outputdir` + `result.json`** — **S.** Replace bespoke extraction with OrcaSlicer's auto-extracted `plate_1.gcode` + read `result.json` `return_code`/`warning_message`. *Where:* `orca.py` + `extract.py`.
- **2D. Per-print override *merge*** — **S.** `_resolve_filament_settings` (:601) currently *replaces* the filament's saved settings with an explicit `settings` object; merge partial overrides on top instead. Confirm the web client sends only changed keys.
- **2E. Plating transforms** — **S.** Thread `extra_args` from `_run_slice_inline` → `slice_model`; expose `clones`/`scale` (`--clone-objects "N" --arrange 1`, `--scale F --arrange 1`). **Never** expose `--rotate*` (segfaults) or `--repetitions` (broken).

### Phase 3 — multi-printer & remaining calibrations

- **3A. Printer-aware profile selection** — **M.** Make `_run_slice_inline` pick profiles by `chat.printer_id`; per-printer descriptor overlay in `descriptor.py`.
- **3B. Retraction / Cornering / Input-Shaping towers** — **L, low value.** All bare `.drc` Pattern-B; gate behind firmware-capability flags. Input-shaping + PA require Linear-Advance/input-shaper firmware the stock Ender 5 S1 lacks; cornering is a dead knob at our 25 mm/s walls (memory). Build only on demand.

---

## 8. Open questions / decisions for the user

1. **Filament-preset license (AGPL-3.0).** Vendor preset JSONs ship inside an AGPL-3.0 repo with **no
   explicit public-domain grant** [verified]. We plan to commit *flattened* Creality Ender-5 S1
   filament presets (§4.4/1B). Decision: **commit them with attribution + keep open (AGPL-friendly),
   or regenerate equivalent presets from our own measured values to avoid relicensing ambiguity?**
   (Conservative default: attribute + keep open.)
2. **Pressure Advance is a no-op without firmware.** The PA calibration *slices* perfectly [PoC], but
   `M900 K` does nothing on the stock Ender 5 S1 Marlin (no Linear Advance — matches the user's
   firmware constraint). **Ship PA calibration with a clear "needs a firmware flash to take effect"
   warning, or omit it for now?** (Recommend ship-with-warning — it's free and educational.)
3. **Temperature tower: faithful XML vs simple fallback.** The custom-gcode-XML approach is faithful
   but adds a `.3mf` packer; the 9-fixed-temp-STL fallback is trivial but less elegant. **Start with
   the fallback (ship fast) or invest in the XML packer up front** (it also unlocks every Pattern-B
   tower)? (Recommend: ship fallback in Phase 1, build the packer in Phase 1E/2A.)
4. **`--outputdir` migration.** Adopting it removes our hand-rolled unzip (`extract.py`) and gives a
   clean `result.json` success/warning signal — but is a behavioural change to a proven path. **Worth
   doing now (2C), or leave the working extractor alone?**
5. **Legacy 2-pass flow.** The shipped 2-pass `.3mf`s are unsliceable headless (`-101` overlap [PoC]).
   **Is single-pass `Orca-LinearFlow` sufficient, or do we want to regenerate the 2-pass coupons** as
   per-block `flow_ratio` sweeps (more work, classic workflow)? (Recommend Linear-only.)
6. **Multi-printer scope.** Phase 1–2 stay single-printer (Ender 5 S1). **Confirm multi-printer
   (§3A/registry-driven profile selection) is genuinely Phase 3+** and not needed sooner.

---

*Verification provenance:* live `xvfb-run` runs of OrcaSlicer 2.3.2 against the committed Ender 5 S1
profiles + `3DBenchy.stl` and the shipped `resources/calib/*` assets (`[PoC]`); OrcaSlicer source
(`src/OrcaSlicer.cpp`, `src/libslic3r/calib.{hpp,cpp}`, `src/slic3r/GUI/Calibration*.cpp`), the
OrcaSlicer wiki/orcaslicer.com calibration guides, the Printago CLI reference, and DeepWiki's CLI page
(`[verified]`). Repo line numbers confirmed against `main.py`, `schemas.py`, `descriptor.py`,
`orca.py`, `profiles/__init__.py`, and `packages/types/src/index.ts` at the time of writing.
