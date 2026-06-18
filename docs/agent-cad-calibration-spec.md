# Agent CAD — Calibration / Test prints (design brief)

> **Standalone brief — you don't need any other file.** Agent CAD is a local-first desktop app
> that turns a plain-language prompt into a 3D-printable model: a chat on the left, a 3D viewer +
> print settings on the right, and a Settings area for printers & filaments. This doc specs **one
> screen — the "Calibration / Test prints" section inside Settings.** Status: **DRAFT.**

> **Re-grounded against the finished `chat-ui.pen` design (scanned 2026-06-16 via the Pencil CLL).**
> The design realises this as **three screens** — the per-filament **Filament · Calibration** editor
> and its two **Result** screens (Cube / Benchy) — reached from **Printer Detail**. This doc now
> matches that. It stays simple (no tuning wizard), but the settings are **editable in place** and
> slicing opens a **real result screen** (toolpath + stats + download), not a bare file download.

## 1. What it is (and what it is NOT)

A per-**printer × filament** screen that (a) lets you **edit the filament's slice profile** — the
saved per-material defaults the AI applies automatically — and (b) **slices the two reference
objects** (XYZ **calibration cube**, **3DBenchy**) with those settings so you can print and eyeball
them. Slicing opens a **Result screen** with the g-code toolpath + stats + download.

It's a **place to set a filament's settings and test them**, not a tuning tool. The page **doesn't
explain or teach** — when a print comes out wrong you **ask the AI in chat** (it's the expert).
Single-user tool for the owner; no hand-holding.

**NOT in scope** (so this doesn't grow into a wizard):
- ❌ No step-by-step calibration flow · ❌ no measure → recommend → adjust loop · ❌ no per-variable
  tuning towers/sweeps · ❌ no OrcaSlicer wizards · ❌ no symptom picker / recommendation engine.

## 2. Where it lives (3 screens)

```
Settings → Equipment → [Printer Detail] → [Filament profile]            (the editor)
                                              ├─ "Test prints" → Cube   → Cube Result
                                              └─ "Test prints" → Benchy → Benchy Result
```
A shared **Calib Context Header** sits at the top of all three: printer thumb + name, a **filament
chip** (colour swatch + "PETG · Slate Grey"), an **"Original"** chip, and the spec line
("FDM · 0.4 mm nozzle · 220 × 220 × 280 mm"). Breadcrumb: Equipment › Printer › Filament › [object].

## 3. Filament · Calibration editor

1. **Calib Context Header** (shared).
2. **Slice settings** section — *"Edit the values used to slice this filament's test prints, then
   save your changes."* An **editable, schema-driven form** rendered from the printer+filament
   `SettingsDescriptor` (§3a of the functional spec): **all available settings**, grouped, bound by
   real `SliceSettings` key — not a hand-picked subset. The design's headline controls (Infill,
   Layer height, Walls, Flow rate, Nozzle, Bed, Print speed, Retraction) are the *visual guide*; the
   engineer-owned descriptor is the contract, so the full set renders.
   - **Action bar:** hint *"Changes apply to this filament's test prints"* + **Cancel** (revert to
     last-saved) + **Save** (persist to `printers/<id>.json → filaments[].settings`; enabled only
     when dirty). Save validates against `SliceSettings` bounds.
3. **"Original" (the one default concept, §3.8):** the filament's `default_settings` is the
   committed-profile baseline. The header **"Original"** chip shows whether the current values match
   it; when they differ it offers **Reset to original** (still needs Save). There is no second
   "default" — editing + Save *is* setting the filament's saved defaults the AI uses.
4. **Test prints** section — two cards (**Calibration cube**, **3DBenchy**), each with a 3D preview
   chip + a **Slice** button that **navigates to the Result screen** for that object. Benchy is
   gated when `GET /samples → benchy.available = false`.

## 4. Cube / Benchy Result screen (one shared `ResultView`)

Reached from a test-print card. On open it **runs the calibrate job** (`POST /calibrate
{target, printer_id, filament_id}`) at the filament's **saved** settings, polls, then shows:
- **Result header:** object icon + *"Calibration cube — sliced"* / *"3DBenchy — sliced"* + a **Sliced** badge.
- **Toolpath viewer** (`GcodeViewer`) + **layer scrub** ("Layer 100 / 100").
- **Stats row:** print time · filament length · filament weight · **layer count**.
- **Actions:** **Download G-code** (plain `.gcode`) + **Back to test prints** (→ the editor).
- **States:** slicing (spinner), success (the above), or a graceful **OrcaSlicer-missing / slice
  error** message (the chat is where you'd ask why) — never a crash or dead end.

## 5. Reuse (mostly assembly — no net-new backend)

| Need | Reuse |
|------|-------|
| Slice cube / Benchy at saved settings | `POST /calibrate {target, printer_id, filament_id}` → job → `gcode_url` + `info` |
| Settings form | the `SettingsDescriptor` + the `SettingsForm` renderer (shared with the chat panel) |
| Toolpath + scrub + stats | `GcodeViewer` + the `StatsRow` (print time / length / weight / layer count) |
| Filament persistence | `PUT /printers/{id}/filaments/{fid}` (settings) ; `default_settings` = the "Original" baseline |
| Benchy gating | `GET /samples → benchy.available` |

## 6. Create-profile flow (Printer Detail)

Printer Detail lists filament profiles (swatch + material + brand/colour + Nozzle/Bed/Speed specs).
**Add Filament** creates a new profile (name/material/brand/colour + material-appropriate temp
defaults) and **opens the Filament · Calibration editor** so you immediately set its full settings.
Editing a row opens the same editor. (Identity-only quick edits may stay a small dialog.)
