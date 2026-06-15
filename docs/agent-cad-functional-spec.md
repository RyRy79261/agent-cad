# Agent CAD — Functional Spec (functionality before form)

> Source of truth for building the **Agent CAD** app from the finished `chat-ui.pen` design.
> **Functionality before form:** the design shows the intended look, but this spec ranks what each
> screen *does* (behaviour, data, API, states) over pixel-matching. Where the design is stylized —
> especially the glowing/gradient 3D model + g-code toolpath renders — that is **optional polish**
> that must not block shipping. Status: **DRAFT.**

## 0. Principles (read first)

- **Single-user, local-first.** This is a desktop-style app for the owner, not a hosted/shared
  teaching product. The **AI chat is the expert**; the **UI does not educate or hand-hold** — when a
  print comes out wrong, the owner asks the AI.
- **Form-vs-function rule for the 3D views.** The functional requirement is "render the STL" and
  "render the g-code toolpath with a working per-layer scrub." The existing viewers
  (`StlViewer` three.js/R3F, `GcodeViewer` gcode-preview) already satisfy this. The neon glow,
  gradient, vignette, and bloom are **cosmetic**: reproduce cheaply (dark canvas + brand-blue
  extrusion ≈ 80% of the look) and, if the rest is hard, **ship the plain functional viewer.**
- **Naming.** The design says "Forge"; render everywhere as **Agent CAD**.

## 1. Architecture & launch

| Concern | Today | Target |
|---|---|---|
| Launch | two commands (`pnpm py:api` :8000 + `next dev` :3000) | **`pnpm start`** runs API + web together, waits for health, opens the browser |
| Ports | 8000 / 3000 | **API :8420 · web :3420** (env-overridable); `DEFAULT_API_URL` → `http://127.0.0.1:8420`; CORS default includes `:3420` |
| Persistence | browser localStorage + gitignored `.agent-cad-builds/` + in-memory jobs | **`~/.agent-cad/`** on-disk store, atomic writes (temp+rename) |
| Printer/filament | Ender 5 S1 + PLA hardcoded in ~4 places | a **registry** seeded with Ender 5 S1 + PLA on first run |

**On-disk store `~/.agent-cad/`** (created + seeded on first run; root overridable via `AGENT_CAD_HOME`):
```
settings.json                      # active_model, effort, default_printer_id, storage_location, theme, auto_clear_days, user_name
printers/<printer-id>.json         # {id,name,kind,build_volume{x,y,z},nozzle_diameter_mm,firmware,bed_margin_mm,default, filaments[]}
chats/<chat-id>/chat.json          # {id,title,created_at,updated_at, messages[]}
chats/<chat-id>/artifacts/         # model.py, *.stl/.step/.3mf/.svg, *.gcode (per-chat — NOT a shared slug)
imports/<id>.stl                   # user-uploaded STLs
jobs.json (or per-chat)            # durable job records (survive restart)
```

## 2. Screens (11) + component kit

Chat flow: **New Chat → Interview → Model Preview → Sliced**.
Settings: **Storage & Data · Equipment · Printer Detail**.
Per-filament: **Filament · Calibration · Cube Result · Benchy Result** (+ shared **Calib Context Header**).
Plus **Appearance** & **About** (nav items; see §5). Design system = **33 components** to populate
`packages/ui` (today it only exports `cn()`; primitives live in `apps/web/components/ui`).

---

## 3. SHARED CONTRACTS & reconciliations (resolve these once — every area depends on them)

These are the cross-cutting decisions the review flagged; they are settled here so the areas don't diverge.

1. **`SliceSettings` is the single source of slice knobs + bounds — and its Zod schema is NET-NEW.**
   It exists today only as Pydantic (`services/api/.../schemas.py`); there is **no** Zod type in
   `packages/types`. Authoring `SliceSettings` in `packages/types` is a **prerequisite**: it drives the
   Filament editor controls, the chat print-settings panel, and the filament registry. Fields (with
   bounds that become UI min/max/step): `infill_density 0–100`, `layer_height 0.08–0.32`, `wall_loops 1–10`,
   `flow 0.8–1.2`, `top_layers/bottom_layers 0–20`, `bed_temp 0–110`, `nozzle_temp 150–300`,
   `wall_speed 5–120`, `retraction_length 0–6`, `jerk 1–40`, `infill_pattern`, `seam_position`,
   `brim_width 0–20`, `support`, `support_threshold 0–90`, `raw{}`. **Honest derivation:** the numeric
   `min/max` for the ~13 bounded fields **are** derivable from the Pydantic `ge/le` (a test asserts
   descriptor==schema); `step` is a hand-authored presentation hint with **no** backend source; and
   `infill_pattern`/`seam_position` are bare `str` (no enum) today — **recommend promoting both to
   `Literal[…]`** so their option lists are derived *and* the server actually rejects garbage (it
   silently accepts any string now). `nozzle_temp`'s default (≈220) is inherited from OrcaSlicer's base
   PLA profile, not present in our committed JSON — treat as an approximate fallback default.
2. **The settings panels are SCHEMA-DRIVEN; the design is a visual guide.** The `.pen` fixes only the
   *layout*, the *component vocabulary* (Slider / number / percent / Select / Switch / Segmented), and
   the *look*. The **field set, labels, input types, ranges, defaults, and which fields appear are
   engineer-owned** via a `SettingsDescriptor` (see **§3a**) — driven by what `SliceSettings` /
   `slice_overrides()` can actually drive, and varying per printer. A design label like "Print speed" or
   "Shells" is **cosmetic text** mapped onto the real backend key (`wall_speed`, `wall_loops`); the key
   is the contract, the label is free. If the pipeline can't drive a knob it isn't in the descriptor and
   never renders, whatever the mockup shows.
3. **Printer profile gains `nozzle_diameter_mm` + `firmware` as NET-NEW fields.** Today `cad.printer.Printer`
   / `ENDER_5_S1` carry only `{name, build_volume, bed_margin_mm}`. The "0.4 mm nozzle" / "firmware"
   shown in the header and Printer Detail are **new registry fields**, not derived from today's model.
   Firmware is editable display metadata, not load-bearing for slicing.
4. **`effort` is NET-NEW driver plumbing (or dropped).** The driver layer accepts only a model id today.
   `settings.effort` does not feed anything yet. Either (a) wire it as a claude-code option and define
   what it maps to, or (b) drop it. The chat model-selector (`driver`+`model`) and `settings`
   (`active_model`+`effort`) must describe the **same** thing — pick one.
5. **Per-chat artifacts re-plumb STL lookup (not just a URL rewrite).** Today `_submit_slice` and generate
   hardcode `BUILDS_DIR/<name>/<name>.stl`. Moving to `chats/<id>/artifacts/` means: the slice core resolves
   the STL by **path from the chat's artifact dir** (not a global slug); `/artifacts` serves per-chat
   subtrees; the deterministic slug is scoped **inside** a chat. `/generated/{name}/slice`'s fixed-path
   lookup is **replaced**.
6. **Every chat artifact carries a `kind` = `generated | template | sample | import`** that selects the
   slice route, and **importing/staging replaces the right-panel STL exactly like generation does.** The
   STL-import endpoint (§5) and the viewer are wired together through this.
7. **`slice_info` gains `layer_count` + `length_m` (NET-NEW backend).** `PlateInfo` today exposes only
   `print_time_s` + `weight_g`. The stats row needs filament length (m) and layer count — add them to
   `read_slice_info` (parse `slice_info.config` or count Z moves in the extracted g-code). Do **not**
   source layer count from the viewer's `maxLayerIndex` (the stats row can render without the canvas).
8. **The localStorage "settings-versions / starrable default" feature is superseded.** Per-filament saved
   settings (on disk) replace `agent-cad:settings-versions`; the Filament **"Original" toggle is the
   successor to the starrable-default concept**, not a parallel one. Existing local snapshots are
   **discarded** (single-user, fresh install) — there is no migration. There is exactly one "default"
   concept: the filament's `defaultSliceSettings` (the committed-profile baseline).
9. **Durable, restart-surviving job store** replaces the in-memory `JobStore`; jobs link `chat_id`, carry a
   `phase`, and recover their terminal result so a reloaded chat re-attaches to its last artifact.
10. **AI narration is templated client-side from metadata** (bbox/fit/printability/slice stats) — **not** a
    second LLM call — to keep refine/slice turns cheap and deterministic.

### 3a. The schema-driven settings model (how every settings panel works)

Every settings surface (the chat print-settings panel, the Filament·Calibration editor) renders from a
**`SettingsDescriptor`** the API serves per printer (+ filament). The UI iterates `fields[]` and renders
each with the design's component by `switch (field.inputType)` — it has **zero knowledge of any specific
field**, so adding/removing/renaming a field, or a different printer exposing different fields, is a
**data change, no UI edit**.

**`SettingsField`** (the unit the UI renders):
```
{ key,            // EXACT SliceSettings field name == request-body key — the CONTRACT
  label, help,    // cosmetic, engineer-chosen (may differ from the design's wording)
  inputType,      // slider | number | percent | select | toggle | text
  scope,          // process | machine | filament | raw  — which profile bucket slice_overrides() patches
  binding,        // per-slice | per-filament | per-printer — which SCREEN renders it (NOT the same as scope)
  group,          // section id (mirrors the design's panel sections)
  unit, default,  // default = committed-profile value, for reset + diff badges
  min, max, step, // min/max DERIVED from SliceSettings ge/le (numeric fields); step is a presentation hint
  options,        // select/segmented choices (see derivation note in §3.1)
  advanced,       // collapse behind an "Advanced" disclosure
  dependsOn }     // optional {field, equals} so e.g. support_threshold gates on support — generically
```
**Component map** (engineer picks `inputType`; design fixes the look): `slider`→Slider, `number`→Input,
`percent`→Input/Slider with a `%` suffix **(value stays an int 0–100; never put `%` in the request body —
`slice_overrides()` adds it)**, `select`→Select (or Segmented for ≤3), `toggle`→Switch, `text`→Input (raw rows).

**Write path (unchanged, server is the authority).** Controls bind by `field.key`. On Slice the UI POSTs a
flat **`SliceSettings`-shaped body** (real keys) `+ optional raw{}` to the existing `/slice` endpoints →
`model_dump(exclude={"raw"})` → `slice_overrides()` buckets into process/machine/filament → profile patch →
OrcaSlicer; `raw` flows through `route_raw_overrides()` (denylist refuses every `*_gcode`/firmware/
build-volume/identity key). The descriptor is **read-only render + client pre-validate** metadata; FastAPI
re-validates against `SliceSettings`, so client and server agree by construction.

**`scope` ≠ screen.** `scope` is the profile bucket for routing only; **`binding`/`group` decide which screen
shows the control.** `retraction_length` is `scope=machine` but `binding=per-slice` (it's a per-slice
override that lives in the filament editor) — don't place controls by `scope` or `retraction`/`jerk` get
mis-surfaced.

**Design-label → real-key quick map** (labels are cosmetic): Infill→`infill_density` · Layer height→
`layer_height` · Walls→`wall_loops` · Flow rate→`flow` (`filament_flow_ratio`, a 0.8–1.2 ×) · **Shells→
`top_shell_layers` + `bottom_shell_layers`** (two keys) · **Bed→** the `*_plate_temp[_initial_layer]` family
(one control, fans to ~10 keys) · **Print speed→`wall_speed`** (drives outer+inner) · Retraction→
`retraction_length`. `slice_overrides()` owns every fan-out; diff/reset operate on the **SliceSettings field
value**, not the underlying OrcaSlicer keys.

**Per-printer (v1 scope).** Build the **base descriptor** now from `SliceSettings` (the global numeric
bounds) for the process/filament fields, plus `layer_height`'s range **clamped from `machine.json`'s real
`min/max_layer_height`** (genuinely nozzle-dependent). The full **multi-printer overlay** — per-printer jerk/
speed *ranges* and omitting fields a machine can't use — is **deferred**: `machine.json` holds operating
*values*, not UI *ranges*, so real per-printer bounds need **net-new fields on the printer registry** (§3.3)
and only matter once a second printer ships (open Q6). For v1's single Ender 5 S1, **demote `jerk` to
`advanced`** (it's a near-dead knob at 25 mm/s walls) rather than building the per-printer omission machinery.

---

## 4. AREA — Chat flow (New Chat → Interview → Model Preview → Sliced)

**Purpose.** The owner's main workspace: one chat = one part, carried from a vague prompt to
downloadable SD-card g-code. The AI interviews to sharpen the spec, generates a build123d model, lets
the owner refine it conversationally, then slices it. The right rail (viewer + print settings) is bound
to the chat's latest artifact; the thread is the control channel + narration.

**Functional requirements** (must unless noted):
- **FR-CHAT-1** New chat from the hero Composer: submit (≥3 chars) creates a persisted chat and starts the flow; quick-start chips prefill+submit.
- **FR-CHAT-2** **Interview** (net-new): 1–3 capped clarifying turns via the LLM driver, returning a question + 2–4 quick-reply chips, or `ready`; always offer "generate now / skip." Accumulated Q&A → the generation prompt. *Spec the interview call as job-based (poll) like generate; note the shared 2-worker pool serializes long calls.*
- **FR-CHAT-3** Generate via `POST /chats/{id}/generate` → poll job (~300 s budget). On success store stl/metadata/verification on the chat, render STL, post a templated AI turn (dims + fit + printable). On failure show the error and any non-printable STL.
- **FR-CHAT-4** **Refine** (net-new): a typed/chip instruction re-drives generation seeded with the prior `model.py` + thread so it **edits**, producing a **new versioned artifact without losing the prior** (versioning scheme in §5). Capped + poll-based.
- **FR-CHAT-5** Right rail tabs **3D Model | Slice Preview**, each gated on its artifact; auto-switch to Slice Preview on slice success; "awaiting model" placeholder before any model.
- **FR-CHAT-6** Compact print-settings panel (Printer, Filament, Layer height, Infill) under the viewer; the full `SliceSettings` set may hide behind "advanced." Disabled until a model exists. Printer/Filament come from the registry (default Ender 5 S1 + a PLA filament).
- **FR-CHAT-7** "Slice model" slices the chat's current artifact (by its `kind`, §3.6) with the selected filament's settings → poll (~180 s) → toolpath + stats; "Re-slice" re-runs.
- **FR-CHAT-8** Stats row: print time / filament length / filament weight / **layer count** (length + layers are net-new, §3.7).
- **FR-CHAT-9** "Download g-code" downloads the plain `.gcode` (never the `.gcode.3mf`), short SD-friendly name; enabled only after a successful slice.
- **FR-CHAT-10** Whole chat (thread + artifacts + state) persists to `chats/<id>/`; sidebar lists Recent (newest-first) + client-side search; selecting one rehydrates thread + rail to its last state.
- **FR-CHAT-11** *(should)* Model-selector chip in the Composer → `driver`+`model` (default `claude-code`), per-chat persisted. Aligns with `settings.active_model` (§3.4). Handle "anticipate `anthropic` driver with no API key" with a clear inert/error state.
- **FR-CHAT-12** *(should)* Header title + state badge (Interviewing / Model ready / Ready to print + printer) + the DESCRIBE→INTERVIEW→GENERATE→SLICE&PRINT footer, all derived from `chat.status`.
- **FR-CHAT-13** Long ops disable their controls (no double-fire); progress is **poll-driven** ("thinking/generating/slicing…" placeholder + panel spinner) — token streaming is **not** required (net-new if wanted, §5 FR-JOB-2). Define **poll-timeout** behaviour: on budget elapse, keep the job and show "still working / check back" rather than orphaning it.

**Reuse:** `/generate`, job polling, `StlViewer`, slice routes + `slice_info`, g-code extraction +
download, bbox/fit/printable badges — all exist in `BuildDemo.tsx` + `api/main.py`; lifted into the
chat-bound flow. **Net-new:** interview, refine, chat persistence, the sidebar/thread shell.
**Form vs function:** required = the prompt→interview→generate→refine→slice→download progression bound
to the rail; optional = the glowing hero/model/toolpath styling and token-streaming.

---

## 5. AREA — Filament · Calibration (per-filament settings editor + cube/Benchy test slices)

**Purpose.** Edit the slice settings stored on **one filament profile**, save them onto that filament,
and test them by slicing two **fixed** reference objects — the 20 mm cube (parametric template) and the
3DBenchy (committed CC0 sample) — then download the g-code to print and eyeball. The **"Original" toggle**
compares/reverts to the filament's defaults. **Not** a wizard, tuning routine, or OrcaSlicer-wizard call.

**Functional requirements:**
- **FR-FIL-1** Editor renders the filament's **`SettingsDescriptor`** (§3a) — the field set, labels, input types, ranges and grouping are **descriptor-driven, not hardcoded**; each control binds by its real key to the filament's saved value, and the design's components (sliders / number inputs / selects / switches) are the visual treatment. (Today's design shows Infill, Layer height, Walls, Flow rate, Shells, Bed, Print speed, Retraction — those are the *labels*; the keys are `infill_density`, `layer_height`, `wall_loops`, `flow`, `top_shell_layers`/`bottom_shell_layers`, `bed_temp`, `wall_speed`, `retraction_length`.)
- **FR-FIL-2** "Save changes" persists to `printers/<id>.json → filaments[].sliceSettings`; validates against bounds; clears dirty.
- **FR-FIL-3** "Cancel" reverts to last-saved; Save enabled only when dirty.
- **FR-FIL-4** **"Original" toggle** shows/compares the filament's `defaultSliceSettings` (the committed-profile baseline) and offers reset-to-original (still needs Save). This is the §3.8 successor to the old starrable default — no parallel concept.
- **FR-CAL-1** Cube card "Slice": build the parametric cube (default **20 mm**, no params body — the endpoint takes none today, §3-note) then slice with the filament's saved settings → Cube Result. *(Passing custom size/engrave is net-new if ever wanted.)*
- **FR-CAL-2** Benchy card "Slice": stage the committed Benchy then slice with the filament's settings → Benchy Result.
- **FR-CAL-3** Gate the Benchy card when `GET /samples → available=false` (unfetched LFS / missing). Cube is never gated.
- **FR-FIL-5** *(should)* Slices use **saved** values; if the form is dirty, prompt to Save first (don't slice stale values).
- **FR-RES-1** Result screens render the g-code toolpath + layer scrub (reuse `GcodeViewer`) with filename + Ready badge.
- **FR-RES-2** Stats row: print time / filament length / weight / **layer count** (length + layers net-new, §3.7).
- **FR-RES-3** "Download g-code" = plain `.gcode`.
- **FR-RES-4** "Back to test prints" returns to the editor preserving printer+filament context.
- **FR-HDR-1** Shared Calib Context Header on all three screens: printer name + filament chip + "Original" toggle + specs ("FDM · 0.4 mm nozzle · 220×220×280 mm"). Nozzle is the net-new registry field (§3.3).

**Form vs function:** required = editable settings (correct bounds), Save/Cancel/Original, slice cube
(template) + Benchy (`/samples`) at saved settings, gate Benchy, toolpath+scrub, the four stats, plain
`.gcode` download. Optional = the glowing toolpath look, floating viewer tools, header polish. The two
objects are **fixed** (20 mm cube + Benchy) — no size/variant picker required.

---

## 6. AREA — Settings shell + Storage & Data + Equipment + Printer Detail

**Purpose.** The preferences surface: a left nav (Storage & Data, Equipment, Appearance, About) over a
content pane; the `~/.agent-cad/` storage view with real disk usage + maintenance; the **multi-printer +
per-printer filament registry** that replaces the hardcoded Ender 5 S1; and Printer Detail, which lists
filament profiles and hands each off to the Filament·Calibration editor.

**Functional requirements:**
- **FR-SET-1** Fixed left nav, 4 sections, active section deep-linked (`/settings/equipment`) + survives reload; owner avatar/name pinned bottom (non-interactive, single-user). Default landing = Equipment.
- **FR-STO-1** Show the resolved storage root (default `~/.agent-cad/`); "Open folder" reveals it (`xdg-open`/`open`/`explorer`); "Change" = validate-writable + persist (native folder-picker is nice-to-have; existing data is **not** auto-migrated — say so).
- **FR-STO-2** Usage cards computed from disk (Projects/chats, Models/STL, Slices/g-code, Disk used) via `GET /storage/usage`; loading + zero-state.
- **FR-STO-3** Clear cached artifacts deletes regenerable geometry (keeps `model.py`/`chat.json`/sources), reports bytes freed, re-fetches usage.
- **FR-STO-4** *(should)* "Auto-clear older than 30 days" toggle persists `auto_clear_days`; enforced on startup/sweep.
- **FR-STO-5** Clear chat history deletes `chats/` (confirm); disabled at 0.
- **FR-STO-6** Reset all data wipes `chats/ printers/ imports/ artifacts`, resets `settings.json`, **re-seeds** Ender 5 S1 + PLA; strong confirm; refuse while a job runs.
- **FR-EQ-1..3** Printer registry: list cards (name, Default badge, type, build volume, profile count, Manage); Add/Edit printer (name, build volume>0, nozzle 0.4 default, firmware free-text, bed margin 5, set-default); exactly one default; delete blocked for the last/auto-promotes. **The default printer feeds the build-volume fit check** (today hardcoded to `ENDER_5_S1` — wiring the registry default into `cad.printer.fits` is net-new).
- **FR-PD-1..4** Printer Detail: header stats (build volume, nozzle, firmware, profile count) + Edit; filament-profile list (material, brand/colour, nozzle temp, bed temp, **Print speed = `wall_speed`**, Edit); Add filament (validated against `SliceSettings` ranges so registry values are always sliceable, `flow` default 0.95); a row's **Edit → Filament·Calibration** editor (deep-linked).
- **FR-APP-1** *(should)* Appearance = theme System/Light/Dark (reuse `next-themes`); optionally mirror into `settings.json`.
- **FR-ABOUT-1** *(nice)* About = app name/version/links/health; informational.
- **FR-SET-2** All destructive actions: confirm dialog naming exactly what's removed + disabled-while-busy; Reset uses the strongest confirm.

**Form vs function:** required = nav+routing, a real on-disk store, usage **computed** (not faux),
working clear/reset that deletes the right files + preserves sources, full printer CRUD whose default
drives slice+fit, filament profiles that validate to `SliceSettings` and map to `slice_overrides()`,
the Edit→Calibration handoff, confirmation gating. Optional = card glow/avatar treatment; a **native
folder-picker** (a validated path field is equivalent; folder-*reveal* is the only OS bit that matters).
**Keep `/setup`** (one-time physical leveling guidance) distinct from Equipment (the data registry).

---

## 7. AREA — Viewer, layout/shell, design system (the most form-vs-function area)

**Purpose.** The functional viewer, the two app shells, and the shared kit that frame every screen.

**Functional requirements:**
- **FR-VIEW-1..3** Render an STL with orbit/zoom/pan (`StlViewer`), **auto-frame** any part 20–200 mm (drei `<Bounds fit>`), and correct **Z-up→Y-up** (rotate on a clone — `useLoader` caches by URL; mutating in place double-rotates). All already work.
- **FR-VIEW-4** Render a g-code toolpath with a **per-layer scrub** (`GcodeViewer`, `endLayer` slider, camera dolly). Already works.
- **FR-VIEW-5** Tab **3D Model | Slice Preview** in one right rail; each tab gated on its artifact; auto-select Slice Preview on slice. (Rename today's "Model | Toolpath.")
- **FR-VIEW-6** *(should)* Floating viewer-tool overlay — **reset/fit is required**; zoom±/screenshot are nice.
- **FR-VIEW-7** Viewer **empty / loading (SSR-guarded `next/dynamic`) / error** states; add an R3F error boundary to `StlViewer` (small net-new) so a bad STL shows a message. Define what the viewer shows when Settings "clear/reset" deletes the artifact it points at (fall back to empty state).
- **FR-VIEW-8** *(nice)* Treat glow/gradient/vignette as **optional**; cheap 80%: dark canvas + brand-blue extrusion. If the bloom is hard, ship plain.
- **FR-VIEW-9** *(nice)* `StepViewer` is a stub — **never gate shipping on STEP** (STL covers the printable viewer).
- **FR-LAYOUT-1..5** Chat shell = **3-pane** (sidebar | thread+composer | viewer-over-settings rail); Settings shell = **2-pane** (nav | content); narrow-width reflow (collapse sidebar to drawer, stack the rail) — desktop-first, mobile best-effort; the **Viewer Canvas must own a stable non-zero height** (R3F/gcode-preview render 0 px without it). Specify presence/stacking/gating/reflow, **not pixels**.
- **FR-DS-1..4** Populate `packages/ui` with the 33-component kit (lift cross-cutting/composite components — Sidebar, ViewerCanvas, ViewerTool, Message, Composer, StatCard, etc.; keep shadcn primitives in `apps/web`); all components **token-driven** (retheme the CSS-var tokens warm-tan → dark slate/blue; the one exception is the viewers' hardcoded colors — pass props); brand reads **Agent CAD**.

**Form vs function:** function = render STL + toolpath, scrub, Z-up fix, tab gating, reset tool,
empty/loading/error, stable canvas height, the two shells + reflow, token-driven kit, "Agent CAD" brand —
**the existing viewers already satisfy the core.** Optional = the entire stylized look (glow/gradient/
vignette/bloom) and exact pixel proportions. **Explicit rule: if the stylization is hard, ship the plain
functional viewer.**

---

## 8. AREA — Backend (data model, API, persistence, launch)

**Purpose.** The local-first foundation: the `~/.agent-cad/` durable store, the HTTP surface (reusing
today's pipeline + adding chats/settings/registry/interview/refine/import/calibrate/data-management), and
the plumbing (durable jobs, per-chat artifacts, ports, `pnpm start`, CORS).

**Functional requirements** (all `must` unless noted):
- **FR-STORE-1** Create + seed `~/.agent-cad/` on first run; atomic writes; root env-overridable.
- **FR-SET-1** `GET/PUT /settings` ↔ `settings.json` (`active_model, effort` (§3.4), `default_printer_id, storage_location, theme, auto_clear_days`); reject out-of-range (422).
- **FR-PRN-1 / FR-FIL-1** Printer + nested filament CRUD (`/printers`, `/printers/{id}/filaments`); each filament is the `SliceSettings` shape (so it maps 1:1 to `slice_overrides()`), validated to its ranges; seed Ender 5 S1 + PLA. The default printer feeds `cad.printer.fits` (net-new wiring).
- **FR-CHAT-1/2** Chat CRUD + `messages` append + per-chat **artifact namespacing** (§3.5/3.6) under `chats/<id>/artifacts/`; `/artifacts` (or `/chats/{id}/artifacts/{file}`) serves them.
- **FR-INT-1** `POST /chats/{id}/interview` — clarifying-question agent (net-new) → `{questions[]}` or `{ready, resolved_prompt}`.
- **FR-GEN-1** `POST /chats/{id}/generate` wraps `generate_part` (claude-code, build→verify→cap≤2), writes into the chat namespace, returns JobRef + auto-appends a templated assistant message.
- **FR-GEN-2** `POST /chats/{id}/refine` (net-new) re-generates with **prior `model.py` + thread context**; **versioned** artifact (define the on-disk version scheme, e.g. `artifacts/v<N>/`) so prior versions aren't lost.
- **FR-IMP-1** `POST /imports` (multipart STL) validates mesh (trimesh: positive volume, watertight, bbox vs default printer) → `imports/<id>.stl`; attach into a chat (kind=`import`). No upload exists today.
- **FR-SLC-1** `POST /chats/{id}/artifacts/{artifactId}/slice {filament_id|settings}` resolves the filament's settings, runs `_submit_slice` (slice_overrides + raw escape hatch), writes g-code into the chat namespace; result = `gcode_url` + `slice_info` (incl. `length_m`, `layer_count` — §3.7) + applied settings.
- **FR-CAL-1** `POST /calibrate {target:cube|benchy, filament_id}` — cube via the template, Benchy via `/samples`; the **only** calibration we offer.
- **FR-JOB-1** Durable job store (survives restart; `phase` + `chat_id`); `/jobs` API shape preserved; in-flight jobs marked interrupted on restart, not lost. Refuse to slice an **unprintable/does-not-fit** part (gate on `verification.printable` / `fits_build_volume`).
- **FR-JOB-2** *(should)* Progress beyond 250 ms polling: a `phase` field (queued→generating→building→verifying→self-correcting N→done) and optional SSE; polling stays the fallback.
- **FR-DATA-1** `GET /storage/usage` + `POST /data/{clear-cache|clear-history|reset}` (confirm flag, report bytes freed).
- **FR-DATA-2** *(nice)* Auto-clear sweep honouring `auto_clear_days` (logged, never touches printers/settings).
- **FR-LAUNCH-1/2** `pnpm start` → API :8420 + web :3420 + open browser; CORS + `DEFAULT_API_URL` aligned to the new ports.
- **FR-SYNC-1** Every net-new request/response gets a **Zod schema in `packages/types`** mirroring the Python — including the net-new `SliceSettings` (§3.1), Printer, Filament, Chat, Message, ArtifactRef, InterviewResult, ImportResult, StorageReport. Also: **re-validate `fits_build_volume`** when the default printer's build volume changes (a stored fit can go stale).

**Reuse:** `/generate` + `generate_part`, `_submit_slice` + slice routes, `slice_info`, `/samples` + cube
template, `/artifacts`, `/jobs` API shape. **Net-new:** the store, registry, chats, interview, refine,
import, durable jobs, data-management, ports/launch, the Zod mirrors. **Form vs function:** all
function — the only safely-simplifiable parts are SSE-vs-polling and the exact on-disk layout.

---

## 9. Net-new vs reuse — the build at a glance

**Reuse almost verbatim:** the CAD→verify→slice→download pipeline, `StlViewer`/`GcodeViewer`,
`slice_overrides`, build-volume fit math, `/samples` + cube template, job polling, shadcn primitives,
`next-themes`. **Net-new (the real work):** `~/.agent-cad/` persistence + atomic writes; the
printer/filament **registry** (+ wiring the default into the fit check); **chat** history + per-chat
artifact namespacing; the **interview** layer; **conversational refine** (one-shot today); **STL import**;
durable **job store**; **storage/data-management**; the **`SliceSettings` + registry Zod schemas**;
`slice_info` **layer_count + length_m**; `pnpm start` + **ports 3420/8420**; the **3-pane/2-pane shells**
+ `packages/ui` kit + retheme.

## 10. Open questions

1. **`effort`** — wire it to a claude-code option (define the mapping) or drop it? (§3.4)
2. **Refine versioning** — keep every generation (`artifacts/v<N>/`) or only last+current?
3. **Interview** — confirm "job-based, capped at 3, always skippable."
4. **`anthropic` driver** — surface API-key state in Settings, or hide non-`claude-code` drivers for v1?
5. **`/setup` + `/troubleshooting`** — keep `/setup` as the one-time hardware manual (AI covers troubleshooting), or fold both into chat? (Per the single-user/AI-is-expert principle, troubleshooting-as-a-page is likely redundant.)
6. **Multi-printer scope** — is the Prusa MINI+ in Equipment functional in v1 (no Prusa profile ships), or registry-only scaffolding with Ender 5 S1 as the only sliceable printer? (The schema-driven settings model is built so this is a data change, but v1 can ship single-printer — §3a.)
7. **Promote `infill_pattern` + `seam_position` to `Literal` in `SliceSettings`?** Cheap one-line change that closes a real validation hole (they accept any string today) *and* makes their `select` options derived instead of hand-curated (§3.1 / §3a). Recommended.
