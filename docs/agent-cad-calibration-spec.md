# Agent CAD — Calibration / Test prints (design brief)

> **Standalone brief — you don't need any other file.** Agent CAD is a local-first desktop app
> that turns a plain-language prompt into a 3D-printable model: a chat on the left, a 3D viewer +
> print settings on the right, and a Settings area for printers & filaments. This doc specs **one
> screen — the "Calibration / Test prints" section inside Settings.** Status: **DRAFT.**

## 1. What it is (and what it is NOT)

A small **section inside Settings** where the two reference test objects — the **XYZ calibration
cube** and the **3DBenchy** — live. It shows the **current settings** for the selected
printer + filament, and gives you a button to **slice either object with those settings and
download the g-code**, so you can print it and eyeball whether your settings are good.

That's the whole feature. It is a **place to test your settings**, not a tuning tool. The page
**doesn't explain or teach** — when a print comes out wrong you just **ask the AI in chat** (it's
the expert printer here); the UI only slices and downloads. This is a **single-user tool for the
owner**, not a learn-to-print app for other people — so don't add hand-holding.

**NOT in scope** (explicitly — so this doesn't grow back into a wizard):
- ❌ No step-by-step calibration flow.
- ❌ No measure → recommend → adjust loop.
- ❌ No per-variable tuning (temperature / retraction / flow towers, sweeps, validation).
- ❌ No tapping into OrcaSlicer's automated calibration wizards (they're GUI-only anyway).
- ❌ No symptom picker / measurement inputs / recommendation engine.

## 2. Where it lives

Settings → **Equipment** → *[Printer]* → *[Filament]* — a **"Test prints"** (or
"Calibration") section, scoped to that **printer × filament**. It slices using **that filament's
current saved settings** (the same defaults a normal slice would use).

## 3. What's on it

1. **Context header** — which printer + filament these settings belong to
   (e.g. "Creality Ender 5 S1 · PETG – Slate Grey").
2. **Current settings** — a compact, **read-only** summary of the values that will be used to
   slice (layer height, walls, infill, flow, nozzle/bed temp, speed, retraction). An
   **"Edit settings"** link jumps to the Filament Editor to change them.
3. **Two test-object cards:**
   - **Calibration Cube** — one line: *"20 mm XYZ cube — quick dimensional & surface check."*
   - **3DBenchy** — one line: *"The classic torture test — overhangs, bridging, fine detail."*
   - Each card: an optional small 3D preview + a **`Slice & Download`** button.
4. **After slicing** (reuses the existing slice result UI): print-time / filament / layer
   estimates, an optional g-code toolpath preview, and the **g-code download** (for the SD card).

No guidance, links, or "what to do next" copy on the page — if the result looks off, the owner
asks the AI in the chat.

## 4. Behaviour

- **`Slice & Download` (Cube):** build the parametric cube template at its default (20 mm) →
  slice with the filament's current settings → return g-code to download.
- **`Slice & Download` (Benchy):** stage the committed 3DBenchy STL → slice with the filament's
  current settings → return g-code to download.
- Same async/job + download flow the app already uses elsewhere; same friendly
  "OrcaSlicer missing → see Printer setup" error; gate the Benchy button if its asset is
  unavailable (LFS not fetched).

## 5. Reuse (this is mostly assembly — almost no net-new backend)

| Need | Reuse |
|------|-------|
| Cube object | `services/cad/src/cad/templates/cube.py` (default 20 mm) → build → slice |
| Benchy object | `projects/benchy/` via `GET /samples` (gate on `available`) → `/samples/benchy/stage` → `/slice` |
| Slice + stats + download | existing slice routes + `slice_info` (print time / filament / layers) + g-code download |
| Settings used to slice | the filament's saved settings → `SliceSettings` → `slice_overrides()` |
| Viewer (optional preview) | existing `StlViewer` / `GcodeViewer` |

## 6. Open questions

1. **Cube size:** fixed at 20 mm, or expose the size field? (Template supports 10–200 mm; 20 is standard.)
2. **Show a 3D preview** on each card, or just the slice + download?
3. **Label:** "Test prints" or "Calibration"?
