# Agent CAD — Task breakdown & build plan

> Generated from `docs/agent-cad-functional-spec.md`. **82 tasks** across 4 tracks (FOUND backend platform · API app endpoints · UIP frontend platform · SCR screens), sequenced into **6 milestones** with the first end-to-end vertical slice at M2. Status: **DRAFT — confirm, then execute.**

## Decisions to lock before starting

These §3/§10 open questions gate sequencing; recommendations in **bold**:

- **effort** — *drop for v1*; keep only per-chat `driver`+`model`. (Unblocks FOUND-3, SCR-005, API-7.)
- **Literal promotion** of `infill_pattern`/`seam_position` — *yes* (FOUND-5). Cheap; closes a validation hole + makes select options derived. Zero-dep critical-path root.
- **Refine versioning** — *`artifacts/v<N>/`, keep every*. (API-8 layout; needed before SCR-008, M3.)
- **Interview shape** — *job-based, capped at 3 rounds, always skippable*; uses a thin prompt+parse over the existing driver (no new driver method). (API-9, M3.)
- **anthropic driver key** — *hide non-`claude-code` drivers for v1* (show disabled); `claude-code` works on the subscription with no key. (SCR-005.)
- **Multi-printer** — *registry-only scaffolding*; Ender 5 S1 is the only sliceable printer. Do NOT build per-printer range overlays. (FOUND-13, SCR-017/018.)
- **/setup + /troubleshooting** — */setup survives* as the one-time hardware manual (verify it renders after the dark retheme, UIP-2); *fold troubleshooting into chat* (AI is the expert).

## Milestone roadmap (build order)

### M0 — Foundation: store, ports, types substrate
**Goal:** Stand up the ~/.agent-cad on-disk store, the new ports/launch, and the SliceSettings/registry data models + Zod mirrors that every later track binds to. Nothing user-visible changes yet, but the persistence substrate, validation bounds, and type contracts all exist.

**Tasks:** FOUND-1, FOUND-5, FOUND-15, FOUND-6, FOUND-9, FOUND-3, FOUND-4, FOUND-7, FOUND-2, FOUND-8, FOUND-10, FOUND-11, FOUND-12, FOUND-16

**Why here:** FOUND-1 (store) and FOUND-5 (Literal promotion) are the two zero-dep roots the whole graph hangs off. FOUND-5 must land first because FOUND-6/9/13 derive option lists + bounds from it. FOUND-6/7 (registry models+persistence) and FOUND-3/4 (settings + durable jobs) are what the alias ids FOUND-STORE/CHATMODEL/REGISTRY/JOBS resolve to, so they gate the entire API track. FOUND-2 (first-run seed) needs 5+7 done. FOUND-9 (SliceSettings Zod) is the single-source-of-bounds prerequisite for UIP-13 and the editor; FOUND-10/11/12 are the remaining Zod mirrors (FOUND-TYPES). FOUND-15/16 (ports + pnpm start) are near-zero-dep launch wins folded here so API/web come up on 8420/3420 from day one. FOUND-8 (wire registry default into fits) rides on FOUND-7. FOUND-13/14 (descriptor) are deferred to M2's backend since only the print-settings panel + filament editor consume them.

### M1 — Design-system kit + viewer + typed client (presentational)
**Goal:** Turn packages/ui from a cn()-only scaffold into the token-driven kit the screens assemble from, prop-drive the viewers, retheme to Agent CAD dark-slate, and create the typed API client + job-poll hook. Pure frontend plumbing with almost no backend dependency, runs in parallel with M0.

**Tasks:** UIP-1, UIP-9, UIP-15, UIP-2, UIP-3, UIP-10, UIP-11, UIP-12, UIP-4, UIP-5, UIP-6, UIP-7, UIP-8, UIP-18, UIP-16, UIP-17

**Why here:** UIP-1 (token plumbing), UIP-9 (prop-drive viewer colors) and UIP-15 (typed client) are the three zero-dep roots; they unblock the track and depend on nothing from M0 except DEFAULT_API_URL being :8420 (FOUND-15, also early). UIP-3 (migrate+add shadcn primitives incl. Slider/Select/Switch) is the chokepoint gating UIP-4/5/6/7/8/11/12/17/18. UIP-17 (ViewerPanel) needs the viewer states (10/11/12) and UIP-18's stable-height canvas, both built here so the chat rail can render in M2. UIP-16 (useJob with timeout) rides on UIP-15. The schema-driven renderer UIP-13/14 and the shells UIP-19/20/21 are deferred to M2/M3/M4 because they bind to descriptor types and shell composition the first slice introduces just-in-time.

### M2 — FIRST END-TO-END VERTICAL SLICE: one chat prompt->generate->slice->download
**Goal:** One working chat: type a prompt, create a persisted chat, generate a build123d model, view the STL, slice it with the default PLA filament, scrub the toolpath, download plain g-code, all on the new ports with on-disk persistence. Rough but real, end to end.

**Tasks:** API-14, FOUND-13, FOUND-14, API-1, API-3, API-4, API-5, API-7, API-6, UIP-13, UIP-19, SCR-001, SCR-007, SCR-009, SCR-010, SCR-011, SCR-012, SCR-013

**Why here:** The thin line from prompt to g-code. Backend: API-1 (chats CRUD), API-3 (per-chat artifact paths, replacing the global slug), API-4 (artifact kind), API-7 (thread-aware generate), API-5 (slice_info length/layer, zero-dep, lands early), API-6 (filament-aware per-chat slice). API-NEW-PRINTER-CRUD (the MISSING HTTP /printers + /printers/{id}/filaments endpoints, see gaps) MUST be specced+built here so SCR-009's selectors and API-6's filament resolution have a source. FOUND-13/14 (descriptor builder + endpoint) are pulled into this milestone because UIP-13 + SCR-009 consume the descriptor. Frontend: UIP-19 (chat 3-pane shell, needs UIP-7/17/18 from M1), UIP-13 (schema-driven renderer) for the compact print-settings panel. Screens: SCR-001 (hero composer -> create+generate), SCR-007 (3D Model rail + templated turn), SCR-009 (compact print-settings), SCR-010 (slice -> auto-switch), SCR-011 (toolpath+scrub+stats), SCR-012 (download), SCR-013 (header state). Interview (API-9/SCR-006) and refine (API-8/SCR-008) are EXCLUDED from the first slice, generate-now path only.

### M3 — Conversational depth: interview, refine, sidebar, model-selector
**Goal:** Make the chat feel like a conversation: clarify-before-generate interview, versioned conversational refine, the recent-chats sidebar with search and rehydration, and the per-chat model selector. The chat experience reaches its intended shape.

**Tasks:** API-9, API-8, API-13, UIP-14, SCR-002, SCR-003, SCR-004, SCR-005, SCR-006, SCR-008

**Why here:** With the slice proven, layer the net-new conversational features. API-9 (interview) + SCR-006 (interview thread) are the FR-CHAT-2 layer; API-8 (versioned refine) + SCR-008 (refine UI) are FR-CHAT-4/GEN-2. SCR-003/004 (sidebar recent + search) + API-13 (chat_id/phase surface, restart re-attach) deliver FR-CHAT-10 rehydration. SCR-005 (model-selector chip) is the FR-CHAT-11 should. SCR-002 (quick-start chips) is pure assembly over SCR-001. UIP-14 (diff/reset body builder) supports refine and the upcoming filament editor.

### M4 — Settings shell + Storage & Data + Equipment registry
**Goal:** The preferences surface: 2-pane settings shell with deep-linked nav, real on-disk storage usage + maintenance (clear-cache/history/reset with re-seed), and full multi-printer/filament registry CRUD whose default drives the fit check.

**Tasks:** UIP-20, UIP-21, API-12, SCR-016, SCR-014, SCR-015, SCR-017, SCR-018, SCR-019, SCR-020, SCR-021, SCR-028, SCR-029

**Why here:** UIP-20 (settings 2-pane shell, needs UIP-7/18 from M1) frames the section; UIP-21 (narrow-width reflow for both shells, needs UIP-19+UIP-20) lands once both shells exist. API-12 (storage usage + clear/reset/data-management) backs SCR-014/015. SCR-016 (nav+routing+owner) is the entry; SCR-017/018/019/020/021 are the printer registry + filament CRUD chain (each depends on the prior), reusing API-NEW-PRINTER-CRUD from M2. SCR-028 (appearance) + SCR-029 (about) are cheap should/nice items rounding out the nav.

### M5 — Filament calibration editor + cube/Benchy results + cleanup
**Goal:** Per-filament settings editor (descriptor-driven, Save/Cancel/Original), cube + Benchy test slices with shared result screens, STL import, and retirement of the transitional BuildDemo page. Completes the calibration loop and closes the kit.

**Tasks:** UIP-22, API-10, API-11, SCR-024, SCR-022, SCR-023, SCR-025, SCR-026, SCR-027, SCR-030

**Why here:** The deepest screen chain lands last. SCR-022 (descriptor-driven filament editor) needs UIP-13 + FOUND-14 + the printer CRUD endpoints, all earlier. SCR-023 (Original toggle) is the section-3.8 successor to starrable-default. SCR-024 (Calib Context Header) is shared across editor + results. API-11 (calibrate endpoint) backs SCR-025 (cube/Benchy slice cards); SCR-026/027 (cube/Benchy results, one shared ResultView) consume it + API-5's slice_info fields. API-10 (STL import) is grouped here as the last net-new artifact source (kind=import). UIP-22 (kit barrel + 33-component smoke test) is the closing completeness gate. SCR-030 (retire BuildDemo) is explicitly last so the reference page survives build-out, gated on the M2 slice screens reaching parity.

## First end-to-end vertical slice (M2)

M2 is the first end-to-end vertical slice (prompt->generate->slice->download, persisted, on :8420/:3420). EXACT tasks: API-1 (chats CRUD + chat.json persistence), API-3 (resolve/serve artifacts under chats/<id>/artifacts/, replacing the global BUILDS_DIR slug), API-4 (artifact kind tag), API-5 (slice_info gains length_m+layer_count, zero-dep, land early), API-7 (POST /chats/{id}/generate: durable job, store stl+metadata, auto-append templated turn), API-6 (POST /chats/{id}/artifacts/{artifactId}/slice resolving the default PLA filament's SliceSettings), API-14 (NET-NEW and currently UNSPECCED, the HTTP /printers + /printers/{id}/filaments endpoints so the filament resolves and SCR-009's selectors populate), FOUND-13 + FOUND-14 (descriptor builder + endpoint, pulled into M2's backend so UIP-13/SCR-009 have data), UIP-13 (SettingsForm renderer), UIP-19 (chat shell, itself needs UIP-7/17/18 from M1), SCR-001 (hero composer -> create+generate), SCR-007 (3D Model rail + templated turn), SCR-009 (compact print-settings panel), SCR-010 (Slice model -> auto-switch to Slice Preview), SCR-011 (toolpath + scrub + 4 stats), SCR-012 (download plain .gcode), SCR-013 (header state badge + footer stepper). EXCLUDED from the first slice: interview (API-9/SCR-006) and refine (API-8/SCR-008), generate-now path only. Foundation prereqs from M0 (FOUND-1 store, FOUND-2 seed, FOUND-4 durable jobs, FOUND-5/6/7 registry+seed, FOUND-9/10/11/12 Zod, FOUND-15/16 ports+launch) and M1 (UIP-1/3/9/15/16/17/18 kit+viewer+client) must already be done.

## Critical path

```
FOUND-5 (Literal promotion, zero-dep root, gates registry/descriptor/Zod bounds)
 -> FOUND-6 (printer+filament models with net-new nozzle/firmware fields)
 -> FOUND-7 (registry persistence + seed builder = FOUND-REGISTRY)
 -> FOUND-9 (SliceSettings Zod, single source of bounds)
 -> FOUND-13 (SettingsDescriptor builder, min/max from Pydantic ge/le)
 -> FOUND-14 (GET /printers/{id}/settings-descriptor)
 -> API-1 (chats CRUD = FOUND-CHATMODEL/API-CHAT-CRUD, needs FOUND-1 store)
 -> API-3 (per-chat artifact path resolution, re-plumbs the STL lookup off BUILDS_DIR)
 -> API-7 (thread-aware generate = API-CHAT-GENERATE)
 -> API-6 (filament-aware per-chat slice = API-CHAT-SLICE, needs API-3/4/5 + registry)
 -> UIP-3 (shadcn primitives incl. Slider/Select/Switch, gates the kit)
 -> UIP-13 (schema-driven SettingsForm, the reuse engine, needs FOUND-13/14 descriptor types)
 -> UIP-19 (chat 3-pane shell)
 -> SCR-001 (hero composer: create chat + generate)
 -> SCR-009 (compact print-settings panel)
 -> SCR-010 (slice button -> Slice Preview)
 -> SCR-011 (toolpath + stats)
 -> SCR-012 (download g-code)
```

## Known gaps & alias resolution

- MISSING ENDPOINT (real spec gap, highest priority): 8 SCR tasks (SCR-009/017/018/019/020/021/022/024) plus API-6/API-10/API-11 depend on the alias `API-PRINTER-CRUD`, the HTTP /printers + /printers/{id}/filaments CRUD endpoints, but NO numbered task creates them. FOUND-7 explicitly scopes itself to store-level persistence only and says 'The HTTP CRUD endpoints are the API- track's job', yet no API-1..API-13 task owns printer/filament HTTP CRUD. A new task (call it API-14 / API-NEW-PRINTER-CRUD, depending on FOUND-7+FOUND-6+FOUND-14) MUST be added before M2 can resolve a filament for slicing and before the Equipment milestone (M4).
- ALIAS IDS DON'T MATCH TASK IDS (33 unresolved dependsOn refs): every SCR and API task references symbolic aliases not present in the numbered id set (FOUND-1..16, API-1..13, UIP-1..22). They resolve cleanly but a literal graph build flags all SCR/API tasks as having missing deps. RESOLUTION MAP: FOUND-STORE->FOUND-1; FOUND-CHATMODEL->FOUND-1 (Chat/Message persistence) + FOUND-11 (Chat Zod); FOUND-TYPES->FOUND-9/10/11/12; FOUND-JOBS->FOUND-4; FOUND-REGISTRY->FOUND-6+FOUND-7; API-CHAT-CRUD->API-1; API-CHAT-GENERATE->API-7; API-CHAT-INTERVIEW->API-9; API-CHAT-REFINE->API-8; API-CHAT-SLICE->API-6; API-SETTINGS->FOUND-3; API-SETTINGS-DESCRIPTOR->FOUND-14; API-STORAGE/API-DATA->API-12; API-CALIBRATE->API-11; API-SLICE-INFO->API-5; API-PRINTER-CRUD->[MISSING, see above]; UIP-CHAT-SHELL->UIP-19; UIP-COMPOSER->UIP-6; UIP-SIDEBAR->UIP-7; UIP-MESSAGE->UIP-5; UIP-VIEWER-RAIL->UIP-17; UIP-SETTINGS-RENDERER->UIP-13; UIP-SETTINGS-SHELL->UIP-20; UIP-KIT-CHIP->UIP-3 (Button/Chip); UIP-KIT-CARD->UIP-3 (Card); UIP-KIT-STATCARD->UIP-4.
- UNOWNED UI COMPOSITES: UIP-KIT-HEADER (Calib Context Header shell, used by SCR-022/024) and UIP-KIT-CONFIRM (confirm dialog composite, used by SCR-014/018) are referenced but no numbered UIP task explicitly lifts them. UIP-3 adds the Dialog primitive and UIP-22 is the barrel gate, but the Confirm composite and the shared Calib header shell need an explicit owner, fold into UIP-3/UIP-8 scope or add small tasks.
- DESCRIPTOR ORDERING TENSION (resolved by pulling forward): UIP-13 (SettingsForm) and SCR-009 (compact print-settings panel) are required for the first slice (M2) and both consume the SettingsDescriptor from FOUND-14, which needs FOUND-13. So FOUND-13/14 sit on the critical path for the FIRST SLICE even though FR-FIL-1 reads as a calibration concern. Mitigation chosen: pull FOUND-13/14 into M2's backend. Alternative: ship SCR-009 against a hand-stubbed minimal descriptor (printer/filament/layer_height/infill only) and defer the full descriptor to M5.

**Symbolic dependsOn aliases → canonical task ids:** `FOUND-STORE`→FOUND-1; `FOUND-CHATMODEL`→FOUND-1/11; `FOUND-TYPES`→FOUND-9/10/11/12; `FOUND-JOBS`→FOUND-4; `FOUND-REGISTRY`→FOUND-6/7; `API-CHAT-CRUD`→API-1; `API-CHAT-GENERATE`→API-7; `API-CHAT-INTERVIEW`→API-9; `API-CHAT-REFINE`→API-8; `API-CHAT-SLICE`→API-6; `API-SETTINGS`→FOUND-3; `API-SETTINGS-DESCRIPTOR`→FOUND-14; `API-STORAGE`→API-12; `API-DATA`→API-12; `API-CALIBRATE`→API-11; `API-SLICE-INFO`→API-5; `API-PRINTER-CRUD`→API-14; `API-NEW-PRINTER-CRUD`→API-14; `UIP-CHAT-SHELL`→UIP-19; `UIP-COMPOSER`→UIP-6; `UIP-SIDEBAR`→UIP-7; `UIP-MESSAGE`→UIP-5; `UIP-VIEWER-RAIL`→UIP-17; `UIP-SETTINGS-RENDERER`→UIP-13; `UIP-SETTINGS-SHELL`→UIP-20; `UIP-KIT-CHIP`→UIP-3; `UIP-KIT-CARD`→UIP-3; `UIP-KIT-STATCARD`→UIP-4; `UIP-KIT-HEADER`→UIP-3; `UIP-KIT-CONFIRM`→UIP-3.

## Risks / sequencing notes

- Section 3.4 / Open Q1 (effort vs model-selector): FOUND-3 (settings.effort), SCR-005 (composer model-selector), and API-7 (generate driver/model passthrough) must describe the SAME thing. Decision needed BEFORE FOUND-3 finalizes: wire effort to a claude-code option (define mapping) or drop it. Blocks FOUND-3 acceptance criterion 4 and SCR-005 alignment. Recommend dropping effort for v1, keep only per-chat driver+model.
- Section 3.1 / Open Q7 (Literal promotion): FOUND-5 is RECOMMENDED and is a zero-dep critical-path root that FOUND-6/9/13 derive option lists from. Cheap, low risk, but if NOT done the infill_pattern/seam_position select options must be hand-curated and the server keeps silently accepting garbage. Lock 'yes' before FOUND-6/9 start.
- Section 5 / Open Q2 (refine versioning): API-8 + SCR-008 need the on-disk version scheme decided (every v<N> vs last+current). Not on the first-slice path (refine is M3), so it doesn't block M2, but API-8's artifact layout must be fixed before SCR-008. Recommend artifacts/v<N>/ (keep every) per the task notes.
- Open Q3 (interview shape): API-9 + SCR-006 assume job-based, capped at 3, always skippable. Needs confirmation; M3 so not blocking the slice. The Driver.complete() returns model text today, so the clarify call needs a thin prompt+parse path, NOT a new driver method (per API-9 notes). Risk: scope widens if a new driver method is mistakenly required.
- Open Q4 (anthropic driver key state): SCR-005 surfaces an inert/error state for anthropic-no-key. Decision: surface key state in Settings vs hide non-claude-code drivers for v1. Low risk; default claude-code (subscription) works without a key. Recommend hiding non-claude-code for v1 (show disabled).
- Open Q6 (multi-printer scope): FOUND-13 builds only the single Ender 5 S1 base descriptor + layer_height clamp; per-printer overlay is DEFERRED. SCR-017/018 build full printer CRUD but v1 is single-sliceable-printer. Scope-creep risk if a second (Prusa) printer is treated as functional, keep it registry-only scaffolding per the notes; do NOT build per-printer range overlays.
- Open Q5 (/setup + /troubleshooting fate): NOT represented in any of the 81 tasks. Spec section 6 says keep /setup distinct from Equipment. /setup survives by omission, but UIP-2's acceptance requires /setup to still render after the warm-tan->dark retheme. Low risk; just verify /setup renders post-retheme.
- DESCRIPTOR==SCHEMA TEST (section 3.1): FOUND-9 (Zod bounds) and FOUND-13 (descriptor min/max from Pydantic ge/le) must stay in lockstep with the Pydantic SliceSettings (a test asserts descriptor==schema). If FOUND-5/6/9/13 land out of order or bounds drift, this test fails and blocks the registry+editor. Sequence strictly FOUND-5 -> FOUND-6/9 -> FOUND-13.
- Per-chat artifact re-plumb (section 3.5): API-3 is a REAL backend change (resolve STL by path from chats/<id>/artifacts/, not BUILDS_DIR/<slug>/<slug>.stl), and API-6/API-7 refactor _submit_slice/generate_part to take explicit paths/out_dir. This is the riskiest single backend refactor on the first-slice path; _submit_slice currently hardcodes BUILDS_DIR/<name>/<name>.stl (services/api/src/api/main.py). Budget extra time; it gates the entire slice.

## Task catalog

### FOUNDATION / BACKEND PLATFORM (FOUND-)

_FOUNDATION track decomposed into 16 vertically-thin, buildable tasks that establish the local-first platform every other track depends on: the ~/.agent-cad on-disk store with atomic temp+rename writes and first-run seed; settings.json + GET/PUT /settings; the printer+filament registry (printers/<id>.json with nested filaments[], CRUD, seed Ender 5 S1 + PLA) and wiring its default into cad.printer.fits (replacing the frozen ENDER_5_S1); the durable restart-surviving job store (phase + chat_id) replacing the in-memory JobStore; the net-new SliceSettings Zod schema in packages/types as the single source of bounds, plus Zod mirrors for Printer/Filament/Chat/Message/ArtifactRef/etc (FR-SYNC-1); the SettingsDescriptor builder (§3a — numeric min/max derived from SliceSettings ge/le, layer_height clamped from machine.json, jerk demoted to advanced) + GET /printers/{id}/settings-descriptor; the recommended Literal promotion of infill_pattern/seam_position; and the ports 3420/8420 + pnpm start + open-browser + CORS + DEFAULT_API_URL launch wiring._

#### FOUND-1 — ~/.agent-cad store module: paths, atomic writes, env-overridable root  · `M` · `new`
Create a new services/api/src/api/store.py with a Store class that resolves the root (default ~/.agent-cad, overridable via AGENT_CAD_HOME, then settings.storage_location), exposes path helpers (settings_path, printers_dir, chats_dir, imports_dir, jobs_path), and provides atomic_write_json/read_json using a temp file + os.replace (rename) so a crash never leaves a half-written file. No seeding yet.
- **FRs:** FR-STORE-1  ·  **Depends on:** —
- **Accept:** Store().root resolves to ~/.agent-cad by default and to $AGENT_CAD_HOME when set · atomic_write_json writes via a sibling temp file then os.replace; partial-write interruption leaves the prior file intact · read_json on a missing path raises a typed/None result the caller can branch on (documented) · Path helpers return absolute Paths under root for settings/printers/chats/imports/jobs
- **Notes:** os.replace is atomic within a filesystem — keep the temp file in the same dir as the target. AGENT_CAD_HOME is the documented env override (spec §1). This module is the substrate for FOUND-2/3/4/6.

#### FOUND-2 — First-run seed: create + populate ~/.agent-cad on startup  · `M` · `new`
Add a seed_first_run(store) that, when the store root is empty, creates settings.json (defaults), printers/ with one seeded Ender 5 S1 printer JSON carrying one PLA filament, and empty chats/ and imports/ dirs. Wire it into the FastAPI lifespan so it runs once on boot. Idempotent: never overwrites existing files.
- **FRs:** FR-STORE-1  ·  **Depends on:** FOUND-1, FOUND-5, FOUND-7
- **Accept:** Booting against an empty $AGENT_CAD_HOME creates settings.json + printers/<ender-id>.json + chats/ + imports/ · The seeded printer is Ender 5 S1 (220x220x280, bed_margin 5, nozzle 0.4, default=true) with one PLA filament (flow default 0.95) · Re-running the seed against a populated store changes nothing (idempotent) · Seed runs inside the FastAPI lifespan startup, before any request is served
- **Notes:** Depends on the settings shape (FOUND-5) and the printer/filament dataclasses (FOUND-7) being defined first. Re-seed-on-reset (FR-STO-6) reuses this same function — keep it callable standalone. PLA flow default 0.95 per FR-PD-1.

#### FOUND-3 — Settings model + GET/PUT /settings ↔ settings.json  · `M` · `new`
Define a Pydantic Settings model (active_model, effort, default_printer_id, storage_location, theme, auto_clear_days, user_name) with validated ranges, add GET /settings and PUT /settings that read/write settings.json atomically via the store, and reject out-of-range values with 422.
- **FRs:** FR-SET-1  ·  **Depends on:** FOUND-1, FOUND-5
- **Accept:** GET /settings returns the persisted settings.json (or seeded defaults) · PUT /settings writes atomically and round-trips the same JSON on the next GET · An out-of-range field (e.g. negative auto_clear_days) returns 422, not a silent clamp · effort is present in the model with the §3.4 decision resolved (wired to a claude-code option or explicitly marked drop-pending)
- **Notes:** FLAG §3.4 / open Q1: effort vs the chat model-selector must describe the same thing — coordinate the decision with the API-/UIP- chat tracks before finalizing. storage_location persistence here feeds FR-STO-1 in the SCR- track.

#### FOUND-4 — Durable job store: persist jobs.json, phase + chat_id, restart recovery  · `L` · `extend`
Replace the in-memory JobStore (services/api/src/api/jobs.py) with a durable variant that persists every job record to ~/.agent-cad/jobs.json atomically on each state transition, adds phase and chat_id fields to Job, and on startup marks any job left in queued/running as 'interrupted' (never silently lost). Preserve the existing /jobs and /jobs/{id} response shape plus the 2-worker pool.
- **FRs:** FR-JOB-1  ·  **Depends on:** FOUND-1
- **Accept:** Job records survive a process restart and reload from jobs.json · Job carries phase (queued|generating|building|verifying|self-correcting|slicing|done) and an optional chat_id; both serialize in to_dict() · On boot, jobs found in queued/running are marked interrupted, not left dangling · GET /jobs and GET /jobs/{id} return the same field shape as today plus phase + chat_id
- **Notes:** FLAG §3.9. Keep ThreadPoolExecutor(max_workers=2) — the shared pool serializes long generate/interview calls (spec §4 FR-CHAT-2). phase enum is FR-JOB-2 (should); chat_id lets a reloaded chat re-attach (FR-CHAT-10). Write under a lock; terminal results must be recoverable so the chat re-attaches its last artifact.

#### FOUND-5 — Promote infill_pattern + seam_position to Literal in SliceSettings (Pydantic)  · `S` · `extend`
In services/api/src/api/schemas.py, promote SliceSettings.infill_pattern and seam_position from bare str to Literal[...] of the OrcaSlicer-valid option lists, so the server rejects garbage (it silently accepts any string today) and the option lists become derivable for the SettingsDescriptor.
- **FRs:** FR-SYNC-1  ·  **Depends on:** —
- **Accept:** infill_pattern is a Literal of valid OrcaSlicer sparse_infill_pattern values (e.g. grid, gyroid, honeycomb, …) · seam_position is a Literal of valid values (e.g. aligned, nearest, back, random) · POSTing an unknown infill_pattern returns 422 instead of being silently accepted · slice_overrides() still maps the promoted values to sparse_infill_pattern/seam_position unchanged
- **Notes:** FLAG §3.1 / open Q7 (recommended). Cheap one-line-ish change that closes a real validation hole AND lets FOUND-13 derive the select options instead of hand-curating them. Confirm the exact value lists against the committed process.json / OrcaSlicer enums.

#### FOUND-6 — Printer + filament dataclasses/models (registry shape) with net-new fields  · `M` · `new`
Define the registry data model (Pydantic): Printer {id, name, kind, build_volume{x,y,z}, nozzle_diameter_mm, firmware, bed_margin_mm, default, filaments[]} and Filament {id, material, brand, color, sliceSettings (SliceSettings shape), defaultSliceSettings} — adding nozzle_diameter_mm + firmware as net-new fields (§3.3). Each filament's sliceSettings/defaultSliceSettings validate against SliceSettings ranges so they map 1:1 to slice_overrides().
- **FRs:** FR-PRN-1, FR-FIL-1, FR-SYNC-1  ·  **Depends on:** FOUND-5
- **Accept:** Printer model includes nozzle_diameter_mm (default 0.4) and firmware (free-text) as new fields beyond today's {name, build_volume, bed_margin_mm} · Filament.sliceSettings is the SliceSettings shape and rejects out-of-range values · Filament carries both sliceSettings (current) and defaultSliceSettings (committed-profile baseline, the 'Original' source per §3.8) · A printer can hold multiple filaments; exactly one printer can be marked default
- **Notes:** FLAG §3.3 (nozzle_diameter_mm + firmware net-new) and §3.8 (defaultSliceSettings is the one 'default' concept — the Filament 'Original' toggle's source; no parallel starrable-default). firmware is editable display metadata, not load-bearing for slicing.

#### FOUND-7 — Registry persistence: load/save printers/<id>.json with seeded Ender 5 S1 + PLA  · `M` · `new`
Add registry CRUD-free persistence helpers to the store: list_printers, get_printer, save_printer, delete_printer reading/writing printers/<id>.json atomically, plus a build_seed_printer() that returns the seeded Ender 5 S1 (with PLA filament whose defaultSliceSettings mirror the committed Ender 5 S1 process/filament profile values). Used by FOUND-2's first-run seed.
- **FRs:** FR-PRN-1, FR-FIL-1  ·  **Depends on:** FOUND-1, FOUND-6
- **Accept:** save_printer writes printers/<id>.json atomically; get_printer/list_printers read them back · build_seed_printer() returns Ender 5 S1 (220x220x280, bed_margin 5, nozzle 0.4, firmware text) with one PLA filament · The seeded PLA filament's defaultSliceSettings reflect the committed ender5s1 profile (e.g. flow 0.95, bed/nozzle temps) so it slices identically to today out of the box · delete_printer removes the file; list reflects the change
- **Notes:** Seed values should mirror services/slice/src/slicer/profiles/ender5s1/*.json so a fresh install slices the same as the hardcoded path today. The HTTP CRUD endpoints (/printers, /printers/{id}/filaments) are the API- track's job — this task only provides the store-level persistence + seed builder they call.

#### FOUND-8 — Wire the registry default printer into cad.printer.fits (replace frozen ENDER_5_S1)  · `M` · `extend`
Make the build-volume fit check use the registry's default printer instead of the hardcoded ENDER_5_S1. Add a way to construct a cad.printer.Printer from a registry printer record (build_volume + bed_margin_mm), and have the API's build/generate/stage code path pass the default printer into fits()/build_model so a registry edit actually changes the fit verdict. Keep ENDER_5_S1 as a fallback when no registry/default exists.
- **FRs:** FR-EQ-3, FR-SYNC-1  ·  **Depends on:** FOUND-7
- **Accept:** fits() / the runner's fit check uses the registry default printer's build_volume + bed_margin when one exists · Changing the default printer's build volume changes fits_build_volume on a subsequent build (no longer pinned to 220x220x280) · When the registry is empty/unavailable, behavior falls back to ENDER_5_S1 (no regression) · A registry printer record converts cleanly to a cad.printer.Printer (build_volume, bed_margin_mm)
- **Notes:** Today cad.printer.fits defaults its printer arg to ENDER_5_S1 and build_model/stage_sample call it without an explicit printer (services/api/src/api/main.py, services/cad/src/cad/runner.py). §3.3/FR-EQ-3: the default printer feeds the fit check. Also note FR-SYNC-1 're-validate fits_build_volume when the default's build volume changes' — a stored fit can go stale.

#### FOUND-9 — SliceSettings Zod schema in packages/types (the single source of bounds)  · `M` · `new`
Author the net-new SliceSettings Zod object in packages/types/src/index.ts mirroring the Pydantic model field-for-field WITH the bounds (infill_density 0-100, layer_height 0.08-0.32, wall_loops 1-10, flow 0.8-1.2, top/bottom_layers 0-20, bed_temp 0-110, nozzle_temp 150-300, wall_speed 5-120, retraction_length 0-6, jerk 1-40, brim_width 0-20, support_threshold 0-90, support bool, infill_pattern/seam_position enums, raw record). This is the single source of bounds the UI controls read.
- **FRs:** FR-SYNC-1  ·  **Depends on:** FOUND-5
- **Accept:** packages/types exports SliceSettings (Zod) + its inferred TS type with every bounded field's min/max matching the Pydantic ge/le · infill_pattern/seam_position are z.enum() matching the promoted Literal lists (FOUND-5) · raw is an optional record<string,string>; all typed fields are optional/nullish (overrides) · pnpm turbo run typecheck passes for packages/types
- **Notes:** FLAG §3.1 — this is a prerequisite for the Filament editor controls, chat print-settings panel, and registry validation. Bounds here MUST equal the Pydantic ge/le (a descriptor==schema test is specified in §3.1). Keep DEFAULT_API_URL/ENDER_5_S1 mirrors in the same file consistent.

#### FOUND-10 — Zod mirrors: Printer, Filament, BuildVolume update, ArtifactRef  · `M` · `extend`
Add Zod schemas in packages/types for the registry: Printer {id,name,kind,build_volume,nozzle_diameter_mm,firmware,bed_margin_mm,default,filaments[]}, Filament {id,material,brand,color,sliceSettings,defaultSliceSettings}, and ArtifactRef {id,kind(generated|template|sample|import),filename,url,...}. Reconcile the existing PrinterProfile interface/ENDER_5_S1 with the new Printer shape.
- **FRs:** FR-SYNC-1  ·  **Depends on:** FOUND-9, FOUND-6
- **Accept:** Printer + Filament Zod schemas exist and their inferred types match the Pydantic models (FOUND-6) · ArtifactRef carries a kind discriminator of generated|template|sample|import (§3.6) · The existing ENDER_5_S1/PrinterProfile export is reconciled (kept or superseded) without breaking BuildDemo.tsx imports · pnpm turbo run typecheck passes
- **Notes:** FLAG §3.6 (the kind discriminator selects the slice route and drives import/staging). ArtifactRef's exact fields depend on the per-chat artifact namespacing decision (API- track, §3.5) — define the minimal shape here and let API- extend.

#### FOUND-11 — Zod mirrors: Chat, Message, Settings, JobRef/Job (phase+chat_id)  · `M` · `extend`
Add Zod schemas for Chat {id,title,created_at,updated_at,messages[]}, Message {role,content,...}, and Settings {active_model,effort,default_printer_id,storage_location,theme,auto_clear_days,user_name}; extend the existing Job/JobRef Zod to include the net-new phase + chat_id fields from FOUND-4.
- **FRs:** FR-SYNC-1  ·  **Depends on:** FOUND-9, FOUND-3, FOUND-4
- **Accept:** Chat + Message + Settings Zod schemas exist and match their Pydantic counterparts · Job Zod gains phase + chat_id (nullable) consistent with FOUND-4's to_dict() · Settings Zod ranges match the Pydantic validation (FOUND-3) · pnpm turbo run typecheck passes for packages/types
- **Notes:** Message/Chat shapes are co-owned with the API- chat track (§3.5); keep them minimal here and let API- add fields. The existing Job Zod is at packages/types/src/index.ts lines ~68-78 — extend it, don't duplicate.

#### FOUND-12 — Zod mirrors: InterviewResult, ImportResult, StorageReport, SettingsDescriptor  · `M` · `new`
Add the remaining net-new response Zod schemas in packages/types: InterviewResult {questions[]|{ready,resolved_prompt}}, ImportResult (import id + mesh validation verdict), StorageReport (usage cards + bytes), and SettingsDescriptor/SettingsField (§3a shape) so the UI can type the descriptor it iterates.
- **FRs:** FR-SYNC-1  ·  **Depends on:** FOUND-9
- **Accept:** InterviewResult, ImportResult, StorageReport Zod schemas exist with inferred types · SettingsField Zod matches §3a (key,label,help,inputType,scope,binding,group,unit,default,min,max,step,options,advanced,dependsOn) · SettingsDescriptor Zod is {printerId, filamentId?, fields: SettingsField[]} · pnpm turbo run typecheck passes
- **Notes:** These are response-shape mirrors only; the producing endpoints live in API-/SCR- tracks. SettingsField.inputType is the slider|number|percent|select|toggle|text enum the UI switches on (§3a). Co-defined with FOUND-13's server-side descriptor builder.

#### FOUND-13 — SettingsDescriptor builder: derive min/max from SliceSettings, clamp layer_height from machine.json  · `L` · `new`
Build the server-side base SettingsDescriptor (§3a) that introspects SliceSettings ge/le to populate each field's min/max, attaches hand-authored step/label/help/group/scope/binding/inputType per field, derives infill_pattern/seam_position options from the promoted Literals, clamps layer_height's range from machine.json's min/max_layer_height, demotes jerk to advanced, and gates support_threshold via dependsOn {field:'support',equals:true}.
- **FRs:** FR-FIL-1, FR-SYNC-1  ·  **Depends on:** FOUND-5, FOUND-6
- **Accept:** For every bounded SliceSettings field, descriptor.min/max == the Pydantic ge/le (a test asserts descriptor==schema) · layer_height min/max come from machine.json (0.08/0.32) not from a hardcoded constant · infill_pattern/seam_position options are derived from the Literal lists; jerk is marked advanced; support_threshold dependsOn support · Each field carries scope (process|machine|filament|raw) and binding (per-slice|per-filament|per-printer) per §3a (e.g. retraction_length scope=machine, binding=per-slice)
- **Notes:** FLAG §3a / §3.1. step/label/help/group are hand-authored presentation hints with NO backend source. Per-printer overlay is DEFERRED (open Q6) — build only the base descriptor + layer_height clamp for the single Ender 5 S1. Mind the label→key map (§3a): Shells→top_shell_layers+bottom_shell_layers (one design label, two keys), Bed→the *_plate_temp family.

#### FOUND-14 — GET /printers/{id}/settings-descriptor endpoint  · `S` · `new`
Expose the SettingsDescriptor builder over HTTP: GET /printers/{id}/settings-descriptor (optionally ?filament_id=) returns the descriptor for that printer (+ filament) so the Filament/Calibration editor and chat print-settings panel render from data. 404 on unknown printer.
- **FRs:** FR-FIL-1, FR-SYNC-1  ·  **Depends on:** FOUND-13, FOUND-7
- **Accept:** GET /printers/{id}/settings-descriptor returns a SettingsDescriptor whose fields match FOUND-13 · An optional filament_id binds the filament's saved values as field defaults · Unknown printer id returns 404 · Response validates against the SettingsDescriptor Zod (FOUND-12)
- **Notes:** Read-only render + client pre-validate metadata (§3a) — FastAPI still re-validates writes against SliceSettings, so client/server agree by construction. layer_height clamp is per-printer (machine.json), so the endpoint is correctly keyed by printer id.

#### FOUND-15 — Ports 8420 (API) + 3420 (web) + CORS + DEFAULT_API_URL alignment  · `S` · `extend`
Change the API to default to port 8420 (run() + uvicorn invocation), default CORS origins to include http://localhost:3420 and http://127.0.0.1:3420 (still AGENT_CAD_CORS_ORIGINS-overridable), set the web dev/start scripts to port 3420, and update DEFAULT_API_URL in packages/types from http://127.0.0.1:8000 to http://127.0.0.1:8420.
- **FRs:** FR-LAUNCH-2  ·  **Depends on:** —
- **Accept:** API serves on :8420 by default (env-overridable); CORS default allows :3420 origins · web runs on :3420 (next dev -p 3420 / next start -p 3420) · DEFAULT_API_URL in packages/types is http://127.0.0.1:8420 and BuildDemo.tsx still resolves the API · AGENT_CAD_CORS_ORIGINS override still works
- **Notes:** Touch points: services/api/src/api/main.py (run() port, _cors_origins default list), root package.json py:api script, apps/web/package.json dev/start scripts, packages/types/src/index.ts DEFAULT_API_URL. Spec §1: web :3420 · API :8420.

#### FOUND-16 — pnpm start: launch API + web together, wait for health, open browser  · `M` · `new`
Add a root `pnpm start` script that runs the FastAPI server (:8420) and the Next.js app (:3420) concurrently (via the concurrently dev dep), waits for the API /health to be ok, then opens the default browser to http://127.0.0.1:3420. Single command replaces today's two-terminal flow.
- **FRs:** FR-LAUNCH-1  ·  **Depends on:** FOUND-15
- **Accept:** `pnpm start` boots both the API (:8420) and web (:3420) processes together · It waits for GET /health to return ok before opening the browser (no race against a cold API) · The default browser opens to the web app URL once healthy · Ctrl-C cleanly stops both processes
- **Notes:** Add `concurrently` (and a wait-on-health step — wait-on or a tiny node poll) as root devDeps; no such dep exists today. Open-browser via `open`/`xdg-open`/`explorer` per-OS (mirror the FR-STO-1 reveal logic). Spec §1: pnpm start runs API + web, waits for health, opens browser. The container is ephemeral (scripts/setup.sh) — keep the dep install light.

### API (APP ENDPOINTS, prefix API-)

_Net-new HTTP surface wrapping the existing CAD->verify->slice->download pipeline into chat-bound, filament-aware, per-chat-namespaced endpoints. The existing pipeline (POST /generate, _submit_slice + slice routes, slice_info, /samples + cube template, /artifacts, /jobs, generate_part) is reused almost verbatim; the real work is re-plumbing STL lookup off the global slug onto chats/<id>/artifacts/ paths (§3.5), tagging artifacts with kind (§3.6), and adding chats CRUD, interview, thread-aware generate/refine, STL import, filament-aware slice, calibrate, slice_info length_m+layer_count (§3.7), and storage/data-management. Most API- tasks depend on FOUND- tasks: the ~/.agent-cad store + atomic writes (FOUND store), the durable JobStore with chat_id+phase (FOUND jobs), the printer/filament registry incl. SliceSettings shape (FOUND registry), the chat persistence model (FOUND chat model), and the SliceSettings Zod mirror (FOUND types). I assumed the following FOUND- task ids exist as dependencies and reference them by intent: FOUND-STORE (on-disk store), FOUND-JOBS (durable job store), FOUND-REGISTRY (printer/filament registry + seed), FOUND-CHATMODEL (chat/message/artifact persistence model), FOUND-TYPES (Zod mirrors incl. SliceSettings), FOUND-LAUNCH (ports/CORS/pnpm start). Each API task carries its real endpoint + the key gotcha. Flagged §3 shared-contract dependencies inline in notes: §3.1 (SliceSettings Zod), §3.4 (effort/driver reconciliation), §3.5 (per-chat path lookup), §3.6 (kind tag), §3.7 (slice_info fields)._

#### API-1 — Chats CRUD endpoints (list/create/get/delete)  · `M` · `new`
Add POST /chats (create empty chat -> chat.json), GET /chats (list newest-first), GET /chats/{id} (rehydrate thread+state), DELETE /chats/{id} (remove chats/<id>/). Persist via the FOUND store with atomic writes; return the Chat shape {id,title,created_at,updated_at,messages[],status}.
- **FRs:** FR-CHAT-1, FR-CHAT-10, FR-CHATMODEL, FR-STORE-1  ·  **Depends on:** FOUND-1, FOUND-1/11, FOUND-9/10/11/12
- **Accept:** POST /chats creates chats/<id>/chat.json and returns the new chat with a server-assigned id · GET /chats returns chats newest-first by updated_at; DELETE /chats/{id} removes the directory and 404s afterward · GET /chats/{id} on a missing id returns 404; on a real id returns messages[] + status
- **Notes:** Depends on FOUND- defining the Chat/Message persistence model + atomic writer. Title can default from the first user prompt. Keep status derivable (new/interviewing/model-ready/sliced) so FR-CHAT-12 header badge works.

#### API-2 — Append messages to a chat (POST /chats/{id}/messages)  · `S` · `new`
Append a message {role,content,meta?} to chats/<id>/chat.json (atomic), bump updated_at, return the updated thread. Used by the client to record user turns and (server-side) by generate/refine to auto-append templated assistant turns.
- **FRs:** FR-CHAT-1, FR-CHAT-10  ·  **Depends on:** API-1, FOUND-1, FOUND-1/11
- **Accept:** POST /chats/{id}/messages appends and persists; GET /chats/{id} reflects it · Append bumps updated_at so the sidebar re-sorts · Appending to a missing chat returns 404
- **Notes:** §3.10: assistant narration is templated client-side from metadata, so this endpoint just stores text — it does NOT call the LLM. Generate/refine reuse the same append internally.

#### API-3 — Per-chat artifact path resolution + serving (re-plumb STL lookup)  · `M` · `extend`
Replace the global-slug STL lookup. Resolve a chat artifact by path under chats/<id>/artifacts/ (scoped slug INSIDE the chat), and serve per-chat subtrees via GET /chats/{id}/artifacts/{file} (or mount the chat artifact dir). This is the real backend change behind §3.5 — not a URL rewrite.
- **FRs:** FR-CHAT-1, FR-CHAT-10  ·  **Depends on:** API-1, FOUND-1, FOUND-1/11
- **Accept:** A helper resolves an artifact's on-disk path from (chat_id, artifact_id) without referencing BUILDS_DIR/<global-slug> · GET /chats/{id}/artifacts/{file} returns the stored STL/g-code bytes; path traversal (../) is rejected · An existing artifact_urls payload points at the per-chat path, not /artifacts/<slug>/
- **Notes:** §3.5 shared contract: today _submit_slice/generate hardcode BUILDS_DIR/<name>/<name>.stl. The deterministic slug stays as the filename, scoped per-chat. /generated/{name}/slice's fixed-path lookup is REPLACED by the path resolver. Block on FOUND store layout (chats/<id>/artifacts/).

#### API-4 — Artifact 'kind' tag (generated|template|sample|import) on the artifact record  · `S` · `new`
Add a kind field to each stored ArtifactRef = generated|template|sample|import (§3.6). It selects the slice route and tells the viewer which STL to render. Persist it when an artifact is created (generate/refine/import/stage/template).
- **FRs:** FR-CHAT-7, FR-IMP-1  ·  **Depends on:** API-1, FOUND-1/11, FOUND-9/10/11/12
- **Accept:** Each artifact record stores a kind in {generated,template,sample,import} · The slice endpoint reads kind to choose how to resolve/stage the STL · ArtifactRef Zod mirror in packages/types includes kind
- **Notes:** §3.6 shared contract. kind drives the slice route and the right-panel STL swap. Pair with FOUND-TYPES for the ArtifactRef Zod mirror.

#### API-5 — slice_info gains layer_count + length_m (PlateInfo / read_slice_info)  · `M` · `extend`
Add length_m (total filament length in metres) and layer_count to PlateInfo and surface them in read_slice_info/summarize. Parse slice_info.config (filament 'used_m'/length attrs; layer count from config or by counting Z moves in the extracted plate g-code) — do NOT source layer_count from the viewer's maxLayerIndex.
- **FRs:** FR-CHAT-8, FR-RES-2  ·  **Depends on:** —
- **Accept:** PlateInfo exposes length_m and layer_count (None when unparseable, like the existing props) · summarize()/the slice result include length_m + layer_count alongside print_time_s + weight_g · A unit test against a sample archive (or a synthetic slice_info.config) asserts the new fields parse
- **Notes:** §3.7 shared contract. Pure slicer-service change (services/slice/.../extract.py); has no FOUND dep, so it can land early and unblock the stats row everywhere. Layer count may need a g-code Z-move count fallback if slice_info lacks it.

#### API-6 — Filament-aware slice: POST /chats/{id}/artifacts/{artifactId}/slice  · `L` · `extend`
Slice a chat's current artifact by its kind (§3.6) with a resolved filament's SliceSettings. Body = {filament_id} (resolve from registry) | {settings} (explicit SliceSettings + optional raw{}). Reuse the _submit_slice core (slice_overrides + route_raw_overrides), but resolve the STL via the per-chat path (API-3) and write g-code into chats/<id>/artifacts/. Result = gcode_url + slice_info (incl. length_m, layer_count) + applied settings.
- **FRs:** FR-CHAT-7, FR-SLC-1  ·  **Depends on:** API-3, API-4, API-5, FOUND-6/7, FOUND-4, FOUND-9/10/11/12
- **Accept:** POST .../slice with {filament_id} resolves that filament's saved SliceSettings and slices the chat's STL · Result returns gcode_url under the per-chat path + slice_info with length_m + layer_count + applied settings · Slicing is refused (409) when the artifact is not printable / does not fit (gate on verification.printable / fits_build_volume) · out-of-range settings -> 422 (re-validated against SliceSettings)
- **Notes:** §3.5+§3.6+§3.7. Refactor _submit_slice to take an explicit STL path + output dir instead of the global slug. Filament resolution needs FOUND-REGISTRY (printers/<id>.json filaments[].sliceSettings). Job is durable (FOUND-JOBS) and links chat_id. ~180s budget per FR-CHAT-7.

#### API-7 — Thread-aware generate: POST /chats/{id}/generate  · `M` · `extend`
Wrap generate_part into the chat namespace: generate model.py into chats/<id>/artifacts/ (kind=generated), run build->verify->cap<=2, return a JobRef linked to chat_id. On success store stl/metadata/verification on the chat and auto-append a templated assistant message (FR-CHAT-3). Use the accumulated interview Q&A (if any) as the generation prompt.
- **FRs:** FR-CHAT-3, FR-GEN-1  ·  **Depends on:** API-1, API-3, API-4, FOUND-4, FOUND-1
- **Accept:** POST /chats/{id}/generate enqueues a durable job (chat_id set) and returns a JobRef immediately · On success the chat record gains the artifact (kind=generated) with stl path + metadata + verification, and an assistant message is appended · On failure the error is stored and any non-printable STL is still referenced · Artifacts land under chats/<id>/artifacts/, never BUILDS_DIR/<slug>/
- **Notes:** Reuses generate_part(out_dir=chat artifact dir, name=scoped slug). Driver/model come from chat (driver+model, §3.4/§3.11). ~300s budget. Auto-append uses API-2. effort wiring is a §3.4 open question — pass through if FOUND resolves it, else ignore.

#### API-8 — Conversational refine: POST /chats/{id}/refine (versioned artifact)  · `L` · `extend`
Re-drive generation seeded with the prior model.py + thread context so it EDITS the part, producing a NEW versioned artifact without losing the prior (on-disk scheme e.g. chats/<id>/artifacts/v<N>/). Capped + poll-based. Requires exposing a conversation/source seed on generate_part (net-new param) so the prior model.py is the assistant's first turn.
- **FRs:** FR-CHAT-4, FR-GEN-2  ·  **Depends on:** API-7, FOUND-4, FOUND-1
- **Accept:** POST /chats/{id}/refine with an instruction seeds the prior model.py + thread and produces v<N+1> artifacts · The prior version's artifacts remain on disk and resolvable · The chat's 'current' artifact pointer advances to the new version on success · Refine is capped (max_rounds<=2) and job-based like generate
- **Notes:** §5/FR-GEN-2 versioning scheme (open Q2: keep every v<N> vs last+current). Needs a small generate_part extension to accept a seed conversation/source (the orchestrator currently builds conversation from scratch). Block on FOUND store for the version dir layout.

#### API-9 — Interview endpoint: POST /chats/{id}/interview (clarify-before-generate)  · `L` · `new`
Net-new clarify agent: call the LLM driver to return either {questions:[{prompt, chips:[2-4]}]} (1-3 capped turns) or {ready:true, resolved_prompt}. Always allow generate-now/skip. Accumulated Q&A is stored on the chat and feeds generate (API-7). Spec as job-based (poll) like generate; the shared 2-worker pool serializes long calls.
- **FRs:** FR-CHAT-2, FR-INT-1  ·  **Depends on:** API-1, API-2, FOUND-4, FOUND-1, FOUND-9/10/11/12
- **Accept:** POST /chats/{id}/interview returns {questions[...]} with 2-4 quick-reply chips OR {ready, resolved_prompt} · The clarify loop is capped at 3 turns server-side; a 4th call short-circuits to ready · Accumulated Q&A persists on the chat and is consumed by /chats/{id}/generate · InterviewResult has a Zod mirror in packages/types
- **Notes:** Open Q3: confirm job-based, capped at 3, always skippable. Needs a new driver call path (the Driver protocol's complete() returns model text today — a clarify call wants structured Q&A; add a thin prompt+parse rather than a new driver method). Default driver claude-code (subscription).

#### API-10 — STL import: POST /imports + attach to chat (kind=import)  · `M` · `new`
Multipart STL upload validated via trimesh (positive volume, watertight/manifold, bbox vs default printer's build volume) -> imports/<id>.stl. Then attach the import into a chat as an artifact with kind=import (mirrors stage_sample so the viewer swaps the right-panel STL exactly like generation, §3.6).
- **FRs:** FR-IMP-1  ·  **Depends on:** API-1, API-3, API-4, FOUND-1, FOUND-6/7
- **Accept:** POST /imports accepts a multipart STL, runs trimesh checks, and writes imports/<id>.stl · Invalid mesh (non-watertight / zero volume / oversize vs default printer) returns a 4xx with the reason · Attaching an import to a chat creates an artifact kind=import resolvable via the per-chat path · ImportResult has a Zod mirror in packages/types
- **Notes:** No upload exists today. Bbox check uses the default printer from FOUND-REGISTRY (the registry default feeds cad.printer.fits). Reuse the stage_sample copy+bbox+fit pattern for the attach step.

#### API-11 — Calibrate endpoint: POST /calibrate {target:cube|benchy, filament_id}  · `M` · `extend`
The only calibration offered: cube via the parametric template (default 20mm, no params body), Benchy via the committed sample (/samples). Build/stage into a scratch namespace, slice with the resolved filament's settings, return g-code + slice_info (incl. length_m + layer_count). Gate Benchy on GET /samples available=false; cube never gated.
- **FRs:** FR-CAL-1, FR-CAL-2, FR-CAL-3  ·  **Depends on:** API-5, API-6, FOUND-6/7, FOUND-4
- **Accept:** POST /calibrate {target:cube, filament_id} builds the 20mm cube template and slices at the filament's saved settings · POST /calibrate {target:benchy} stages the committed Benchy and slices; returns 409 when /samples reports benchy unavailable (LFS pointer/missing) · Both return gcode_url + slice_info with print_time_s, weight_g, length_m, layer_count · filament_id resolves the saved SliceSettings from the registry
- **Notes:** Reuses cube template + /samples + the API-6 slice core. _sample_available() already detects unfetched LFS pointers. Filament resolution via FOUND-REGISTRY. Cube takes no params body today (§3-note in FR-CAL-1).

#### API-12 — Storage usage + data-management endpoints  · `M` · `new`
GET /storage/usage (compute from disk: chats/projects count, models/STL bytes, slices/g-code bytes, total disk used). POST /data/clear-cache (delete regenerable geometry, keep model.py/chat.json/sources), POST /data/clear-history (delete chats/), POST /data/reset (wipe chats/printers/imports/artifacts, reset settings.json, RE-SEED Ender 5 S1 + PLA). All report bytes freed; reset refuses while a job runs.
- **FRs:** FR-DATA-1, FR-STO-2, FR-STO-3, FR-STO-5, FR-STO-6  ·  **Depends on:** FOUND-1, FOUND-6/7, FOUND-4, FOUND-9/10/11/12
- **Accept:** GET /storage/usage returns real computed sizes (chats/STL/g-code/total), with a zero-state when empty · POST /data/clear-cache deletes geometry but preserves model.py/chat.json/sources and reports bytes freed · POST /data/reset wipes the data dirs, resets settings, re-seeds Ender 5 S1 + PLA, and refuses (409) while a job is running · StorageReport has a Zod mirror in packages/types
- **Notes:** Re-seed must call the same FOUND-REGISTRY seeding used on first run. 'job running' gate reads FOUND-JOBS state. Auto-clear sweep (FR-STO-4/FR-DATA-2) is a separate nice-to-have, not in this task.

#### API-13 — Job durability surface: chat_id + phase on /jobs, restart recovery  · `M` · `extend`
Expose chat_id and a phase field (queued->generating->building->verifying->self-correcting N->done) on the job records returned by /jobs and /jobs/{id}, preserving the existing /jobs API shape. On restart, mark in-flight jobs interrupted (not lost) and let a reloaded chat re-attach to its last terminal artifact. Define poll-timeout behaviour: on budget elapse keep the job + show 'still working'.
- **FRs:** FR-JOB-1, FR-JOB-2, FR-CHAT-13  ·  **Depends on:** FOUND-4, API-1
- **Accept:** GET /jobs and /jobs/{id} include chat_id and phase, preserving today's fields (id,kind,status,result,error,timestamps) · Jobs in-flight at shutdown are restored as 'interrupted', not dropped · A reloaded chat resolves its last terminal job result and re-attaches the artifact
- **Notes:** FOUND-JOBS owns the durable store + persistence; this task is the HTTP-surface contract (phase/chat_id) + the generate/slice/refine workers reporting phase. §3.9. If FOUND-JOBS already emits phase, this is thin.

#### API-14 — Printer + filament HTTP CRUD endpoints  · `M` · `new`
Expose the registry over HTTP: GET /printers, GET/POST/PUT/DELETE /printers/{id}, and POST/PUT/DELETE /printers/{id}/filaments[/{fid}], backed by FOUND-7 store persistence. The MISSING endpoint the sequencer flagged — FOUND-7 is store-level only.
- **FRs:** FR-EQ-1, FR-EQ-2, FR-EQ-3, FR-PD-1, FR-PD-2, FR-PD-3  ·  **Depends on:** FOUND-6, FOUND-7, FOUND-9, FOUND-14
- **Accept:** GET /printers lists registry printers incl. the seeded Ender 5 S1 default · CRUD round-trips to printers/<id>.json via the store · Filament values validate against SliceSettings ranges (422 on out-of-range) · Deleting the last/default printer is rejected or auto-promotes another
- **Notes:** GATES M2 filament resolution (API-6) + the Equipment screens (M4 SCR-017..021). Alias 'API-PRINTER-CRUD' in deps resolves here.

### FRONTEND PLATFORM (UIP-)

_Decomposes the shared frontend foundation that every Agent CAD screen sits on into 22 buildable, vertically-thin tasks. Today: packages/ui exports only cn() with an empty styles.css; shadcn primitives (alert/badge/button/card/input/separator/tabs) live in apps/web/components/ui; tokens are warm-tan in apps/web/app/globals.css; viewers (StlViewer/GcodeViewer working, StepViewer stub) live in packages/viewer with hardcoded colors, no error boundary, no reset tool; BuildDemo.tsx is a single-page demo holding the slice panel + tabbed Model/Toolpath viewer + inline fetch/poll logic; DEFAULT_API_URL is :8000; no SettingsDescriptor/SettingsField types or schema-driven renderer exist._

#### UIP-1 — Wire Tailwind + shadcn token plumbing into packages/ui  · `M` · `extend`
Turn packages/ui from a cn()-only scaffold into a real shadcn-capable package: add its own tailwind.config + a populated styles.css that declares the CSS-var token contract (:root + .dark), add the tailwind-merge/clsx + radix/cva runtime deps, and a components.json so shadcn primitives can live here. No colors finalized yet (UIP-2 does the retheme) -- just the token NAMES (--background, --foreground, --primary, --card, --muted, --accent, --border, --ring, --radius, etc.) and the Tailwind colors[] mapping that reads them.
- **FRs:** FR-DS-1, FR-DS-3  ·  **Depends on:** —
- **Accept:** packages/ui/src/styles.css declares all token CSS vars under @layer base for :root and .dark and is imported by the app build · packages/ui exposes a tailwind preset/config consuming hsl(var(--token)) so components in the package are token-driven · pnpm turbo run typecheck passes for @agent-cad/ui and apps/web still builds · cn() still exported from @agent-cad/ui with no regression
- **Notes:** Today packages/ui/src/styles.css is empty and only cn() is exported; tokens live solely in apps/web/app/globals.css. apps/web/tailwind.config.ts is the reference colors[] mapping to copy. Keep app's globals.css importing the package token layer (or move tokens into the package and have the app re-export) so there is ONE token source. components.json baseColor currently 'neutral'.

#### UIP-2 — Retheme tokens warm-tan -> dark slate/blue + 'Agent CAD' brand  · `S` · `extend`
Replace the warm-tan/brown HSL token values with the dark slate-blue palette (dark-canvas + brand-blue primary) for both :root and .dark, and set the brand string to 'Agent CAD' everywhere (layout header, metadata title). Pick brand-blue --primary and a slate --background/--card scale; ensure WCAG-AA contrast for foreground/muted text.
- **FRs:** FR-DS-4  ·  **Depends on:** UIP-1
- **Accept:** --primary is the brand blue and --background/--card are dark slate in both :root and .dark; no warm-tan (28/30 hue, #c9a27a) values remain in token CSS · Header brand renders 'Agent CAD' (replacing 'agent-cad'); document.title/metadata.title = 'Agent CAD' · muted-foreground vs background and foreground vs background meet AA contrast · Existing pages (BuildDemo, /setup) render with no broken/unreadable colors
- **Notes:** Naming rule from spec S0: design says 'Forge', render 'Agent CAD'. Current brand markup in apps/web/app/layout.tsx ('agent<span>-cad</span>') and metadata.title='agent-cad'. The viewers' hardcoded #c9a27a / 0xf7f7f7 are handled separately in UIP-9 (pass as props), not via tokens.

#### UIP-3 — Migrate shadcn primitives into packages/ui  · `L` · `extend`
Move the existing shadcn primitives (button, card, input, badge, alert, separator, tabs) from apps/web/components/ui into @agent-cad/ui as token-driven exports, and add the remaining primitives the kit needs (Select, Switch, Slider, Dialog, Tooltip, Label, Textarea, ScrollArea). Keep them as thin shadcn components; re-export apps/web's @/components/ui to the package so existing imports keep working during migration.
- **FRs:** FR-DS-1, FR-DS-3  ·  **Depends on:** UIP-1
- **Accept:** @agent-cad/ui exports Button, Card(+parts), Input, Badge, Alert, Separator, Tabs and new Select, Switch, Slider, Dialog, Tooltip, Label, Textarea, ScrollArea · All primitives reference CSS-var tokens only (no hardcoded colors) · apps/web compiles with primitives sourced from the package (shim or updated imports) · pnpm turbo run typecheck passes across web + ui
- **Notes:** Spec FR-DS-1: keep shadcn primitives, lift cross-cutting/composite. Existing primitives in apps/web/components/ui (7 files). New radix deps needed: @radix-ui/react-select, -switch, -slider, -dialog, -tooltip, -label, -scroll-area. Slider/Select/Switch are required by the schema-driven renderer (UIP-13) and SliceSettings panel.

#### UIP-4 — StatCard + Stat row component  · `S` · `new`
Lift a token-driven StatCard (label + value + optional unit/icon) and a StatRow container used by the chat stats row (print time / filament length / weight / layer count) and Settings usage cards. Pure presentational, no data fetching.
- **FRs:** FR-DS-2  ·  **Depends on:** UIP-3
- **Accept:** @agent-cad/ui exports StatCard({label,value,unit?,icon?}) and StatRow · Renders with token colors only; supports a loading/skeleton state · Renders correctly with a 4-stat row at narrow width (wraps, no overflow) · A vitest render test mounts StatCard with sample props
- **Notes:** Consumed by SCR chat stats row (FR-CHAT-8) and SCR calibration result (FR-RES-2) and Settings usage (FR-STO-2). Stats values come from slice_info incl. net-new length_m + layer_count (S3.7) -- this component is value-agnostic.

#### UIP-5 — Message + thread primitives (Message, MessageList)  · `M` · `new`
Lift token-driven chat-thread primitives: Message (role=user|assistant|system, content slot, optional quick-reply chips slot, optional badges slot) and MessageList (scrollable column, auto-scroll-to-bottom hook). Presentational; consumes children/props, no LLM logic.
- **FRs:** FR-DS-2  ·  **Depends on:** UIP-3
- **Accept:** @agent-cad/ui exports Message and MessageList with role-based styling via tokens · Message renders a chips slot (quick replies) and a badges slot (dims/fit/printable) · MessageList scrolls within a fixed-height parent and pins to bottom on new children · vitest render test mounts a user + assistant message
- **Notes:** Consumed by SCR chat thread (FR-CHAT-2/3/12). Quick-reply chips (FR-CHAT-2) and templated AI narration (S3.10) are rendered as children by the screen; this is the shell only.

#### UIP-6 — Composer component (hero + inline) with model-selector + send chips slot  · `M` · `new`
Lift a token-driven Composer: a multiline textarea + send button with disabled/busy states, a quick-start chips row slot, and a left-side slot for a model-selector chip. Two layout variants: hero (centered, large) and inline (docked under thread). Emits onSubmit(text); min-length and disabled-while-busy enforced by props.
- **FRs:** FR-DS-2  ·  **Depends on:** UIP-3
- **Accept:** @agent-cad/ui exports Composer({variant:'hero'|'inline', onSubmit, disabled, chips?, leftSlot?}) · Submit is blocked when trimmed length < minLength (default 3) and when disabled/busy · Quick-start chips prefill+submit via the chips slot; Enter submits, Shift+Enter newlines · vitest test asserts onSubmit fires with trimmed text and is blocked when disabled
- **Notes:** Consumed by SCR new-chat hero (FR-CHAT-1) and chat composer (FR-CHAT-11 model-selector chip -> driver+model). The model-selector chip content is passed via leftSlot; the 'anthropic driver no API key' inert/error state (FR-CHAT-11) is the screen's concern. Lift the prompt-form pattern from BuildDemo.tsx onPromptSubmit.

#### UIP-7 — Sidebar shell component (collapsible + drawer)  · `M` · `new`
Lift a token-driven Sidebar: a fixed-width vertical rail with a brand/header slot, a scrollable list-of-items slot (recent chats / nav sections), an optional search slot, and a pinned footer slot. Collapses to an off-canvas drawer at narrow widths (controlled open state + overlay).
- **FRs:** FR-DS-2, FR-LAYOUT-3  ·  **Depends on:** UIP-3
- **Accept:** @agent-cad/ui exports Sidebar with header/search/items/footer slots, token-driven · At >= md it is a static rail; below md it renders as a drawer toggled by an open prop with a click-away overlay · Active item highlighting via an isActive prop on items · Keyboard accessible (focus trap when drawer open, Esc closes)
- **Notes:** Used by both the chat 3-pane shell (FR-LAYOUT-1, recent-chats list FR-CHAT-10) and the settings 2-pane nav (FR-LAYOUT-2, FR-SET-1). The recent-chats data + client-side search (FR-CHAT-10) and settings nav routing (FR-SET-1) are screen concerns; this is the shell + slots.

#### UIP-8 — SettingRow + SettingsSection layout primitives  · `S` · `new`
Lift token-driven layout primitives for settings surfaces: SettingRow (label + help/info + control slot + optional diff/reset badge slot, horizontal at wide / stacked at narrow) and SettingsSection (titled group with optional 'Advanced' disclosure). These are the visual frame the schema-driven renderer (UIP-13) drops controls into.
- **FRs:** FR-DS-2  ·  **Depends on:** UIP-3
- **Accept:** @agent-cad/ui exports SettingRow({label,help?,control,badge?}) and SettingsSection({title,advanced?,children}) · Info/help renders as an accessible tooltip (reuse the InfoTip pattern, keyboard-focusable) · SettingsSection 'advanced' wraps children in a collapsible disclosure · Token-driven; renders a diff/reset badge slot when provided
- **Notes:** The InfoTip + FieldLabel + NumField/SelectField patterns to lift live in apps/web/app/BuildDemo.tsx. group/advanced map to SettingsField.group + .advanced (S3a). Consumed by UIP-13 renderer, the chat print-settings panel (FR-CHAT-6) and Filament editor (FR-FIL-1).

#### UIP-9 — Prop-drive viewer colors (remove hardcoded palette)  · `S` · `extend`
Parameterize the hardcoded colors in StlViewer (mesh #c9a27a) and GcodeViewer (background 0xf7f7f7, extrusion 0xc9a27a) so callers pass brand-blue + dark-canvas values; keep sane defaults. This is the FR-DS-3 carve-out: the viewers stay color-prop-driven rather than token-driven.
- **FRs:** FR-DS-3, FR-VIEW-8  ·  **Depends on:** —
- **Accept:** StlViewer accepts a color prop (already present) and a canvas/background prop; default no longer warm-tan · GcodeViewer accepts backgroundColor + extrusionColor props with brand-blue/dark defaults · No 0xc9a27a / #c9a27a / 0xf7f7f7 literals remain except as documented defaults · Existing BuildDemo usage still renders
- **Notes:** Spec FR-DS-3 explicit exception: 'the one exception is the viewers hardcoded colors -- pass props'. FR-VIEW-8 cheap-80%: dark canvas + brand-blue extrusion. Files: packages/viewer/src/StlViewer.tsx, GcodeViewer.tsx. Bloom/glow is explicitly optional and out of scope.

#### UIP-10 — R3F error boundary for StlViewer  · `S` · `extend`
Add a React error boundary around the R3F/Suspense tree in StlViewer so a bad/corrupt STL (loader throw) shows a readable 'Couldn't render this model' message instead of crashing the page. Surface the error text and a retry affordance.
- **FRs:** FR-VIEW-7  ·  **Depends on:** UIP-9
- **Accept:** A thrown STLLoader error renders an in-canvas error message, not a white-screen crash · Error boundary resets when the url prop changes (new model clears the error) · GcodeViewer already surfaces load errors inline -- verify parity of message styling · A test simulates a loader throw and asserts the fallback renders
- **Notes:** Spec FR-VIEW-7 calls this out as 'small net-new'. StlViewer uses useLoader(STLLoader) inside Suspense -- the boundary must wrap the Canvas subtree. GcodeViewer.tsx already has a try/catch -> setError pattern to match.

#### UIP-11 — Viewer empty / loading / error state components  · `S` · `new`
Create shared ViewerEmpty, ViewerLoading, and ViewerError state components (token-driven, centered in the canvas frame) used when there is no artifact, while an artifact loads, or when render fails. Define the 'artifact deleted' fallback (Settings clear/reset removed the pointed-at file) -> ViewerEmpty.
- **FRs:** FR-VIEW-7  ·  **Depends on:** UIP-3
- **Accept:** @agent-cad/ui (or viewer) exports ViewerEmpty/ViewerLoading/ViewerError with a message prop · Empty state shows the 'awaiting model' placeholder; loading shows a spinner; error shows the message · Components fill a parent with a fixed height and center their content · Documented usage: when the bound artifact 404s, render ViewerEmpty
- **Notes:** Spec FR-VIEW-7: viewer must define behaviour when clear/reset deletes the artifact -> fall back to empty state. The 'awaiting model' / 'Build a part to see it here' placeholder exists inline in BuildDemo.tsx today. SSR-guarded next/dynamic loading is handled by the screen's dynamic import (FR-VIEW-7).

#### UIP-12 — ViewerTool overlay + reset/fit tool  · `M` · `new`
Build a floating ViewerTool overlay (absolutely positioned button cluster over the canvas) and wire a required reset/fit tool that re-frames the STL (drei Bounds refresh) and recenters the g-code camera. Zoom +/- and screenshot are optional stubs/slots.
- **FRs:** FR-VIEW-6  ·  **Depends on:** UIP-9
- **Accept:** ViewerTool overlay renders over both StlViewer and GcodeViewer without blocking orbit/drag on the rest of the canvas · Reset/fit re-frames the STL (Bounds refit) and dollies the g-code camera back to the part · Token-driven styling; reset is keyboard-focusable with an aria-label · Zoom/screenshot render as optional slots that no-op when not provided
- **Notes:** Spec FR-VIEW-6: reset/fit is REQUIRED, zoom/screenshot are nice. StlViewer uses <Bounds fit observe>; refit needs a ref to the Bounds api or a remount key. GcodeViewer already dollies camera in its effect (lerp 0.62) -- expose that as a reset action.

#### UIP-13 — Generic schema-driven settings renderer (SettingsForm)  · `L` · `new`
Build the generic SettingsForm that takes a SettingsDescriptor + a values object and renders fields[] by switch(field.inputType) -> the design components (slider->Slider, number->Input, percent->Input/Slider with % suffix, select->Select or Segmented for <=3, toggle->Switch, text->Input/Textarea). It has ZERO knowledge of any specific field; binds controls by field.key; emits onChange(key,value). Includes client pre-validate against min/max/step and dependsOn gating (hide/disable a field when {field,equals} unmet).
- **FRs:** FR-DS-2  ·  **Depends on:** UIP-3, UIP-8
- **Accept:** SettingsForm renders an arbitrary descriptor with no field-specific code; adding a field is a data change only · switch(inputType) maps to Slider/Input/percent-Input/Select(or Segmented<=3)/Switch/Input per the S3a component map · percent fields keep an int 0-100 value (the '%' is display-only; never in emitted value) · dependsOn={field,equals} hides/disables the dependent field generically (e.g. support_threshold gates on support); client pre-validate flags out-of-range before submit · advanced fields collapse behind an Advanced disclosure
- **Notes:** DEPENDS ON SHARED CONTRACT S3a: needs SettingsField/SettingsDescriptor Zod types in packages/types (FOUND/API track) -- {key,label,help,inputType,scope,binding,group,unit,default,min,max,step,options,advanced,dependsOn}. Until those land, type against a local interface and swap. This is THE reuse engine for FR-CHAT-6 (chat panel) and FR-FIL-1 (Filament editor). Min/max derive from SliceSettings ge/le (S3.1); step is a presentation hint. Do NOT hardcode the field list from BuildDemo.tsx -- that hardcoded panel is exactly what this replaces.

#### UIP-14 — SliceSettings-shaped request body builder + diff/reset helpers  · `S` · `extend`
Add a pure helper that turns the SettingsForm's flat values object into the SliceSettings-shaped POST body (real keys + optional raw{}), plus diff(values, defaults) and reset-to-default helpers that operate on SliceSettings field VALUES (not the underlying OrcaSlicer keys). Lift + replace the inline body assembly and parseRawOverrides from BuildDemo.tsx.
- **FRs:** FR-DS-2  ·  **Depends on:** UIP-13
- **Accept:** buildSliceBody(values) returns a flat SliceSettings body; raw textarea parsed to raw{} only when non-empty · diff(values, defaults) returns the set of changed SliceSettings fields for diff badges · reset(values, defaults, key?) reverts one or all fields to defaults · percent/value typing matches the server contract (int 0-100, no '%')
- **Notes:** DEPENDS ON SHARED CONTRACT S3.1 (SliceSettings Zod, FOUND/API) for the body shape + S3a (diff/reset on field value, not OrcaSlicer key). slice_overrides() owns key fan-out server-side (Shells->2 keys, Bed->~10 keys) -- the client only ever sends SliceSettings field values. parseRawOverrides + the body object live in apps/web/app/BuildDemo.tsx today (sliceForPrint).

#### UIP-15 — Typed API client module pointed at :8420  · `M` · `extend`
Create a single typed API client in apps/web (lib/api.ts) wrapping fetch: base URL from env -> DEFAULT_API_URL, postJson/getJson helpers, and typed methods for the endpoints the platform needs (chats, generate, slice, settings, printers, storage, imports). Replace the ad-hoc fetch calls scattered in BuildDemo.tsx. Validate responses with the packages/types Zod schemas where available.
- **FRs:** FR-LAUNCH-2  ·  **Depends on:** —
- **Accept:** lib/api.ts exports a client with base = NEXT_PUBLIC_AGENT_CAD_API_URL ?? DEFAULT_API_URL · postJson/getJson throw on non-2xx with a useful message; JSON parse guarded · Methods are typed against @agent-cad/types Zod schemas (parse on response) where the schema exists · BuildDemo (or its successor) uses the client instead of inline fetch
- **Notes:** DEPENDS ON SHARED CONTRACT: endpoint shapes + Zod mirrors (FR-SYNC-1) are authored by FOUND/API. DEFAULT_API_URL must become http://127.0.0.1:8420 (FR-LAUNCH-2) -- that constant lives in packages/types/src/index.ts (currently :8000) and is a FOUND change; this client reads it. postJson/pollJob patterns to lift are at the bottom of BuildDemo.tsx.

#### UIP-16 — Job-poll hook (useJob) with phase + timeout behaviour  · `M` · `extend`
Extract the inline pollJob loop into a reusable useJob/pollJob hook: polls GET /jobs/{id} at ~250ms, resolves on succeeded/failed, exposes the job's phase field for progress text (queued->generating->building->verifying->self-correcting->done), and on budget elapse keeps the job and surfaces 'still working / check back' rather than orphaning it.
- **FRs:** FR-LAUNCH-2  ·  **Depends on:** UIP-15
- **Accept:** useJob(jobId, {budgetMs}) returns {status, phase, result, error, timedOut} · On timeout it does NOT throw-and-forget: timedOut=true while the job id is retained for re-poll · Exposes phase for a progress placeholder; falls back gracefully when phase is absent · Budgets are caller-set (generate ~300s, slice ~180s, build ~60s)
- **Notes:** Spec FR-CHAT-13 poll-timeout: 'keep the job and show still working / check back rather than orphaning it'. FR-JOB-2 phase field (queued->generating->building->verifying->self-correcting N->done); SSE optional, polling is the fallback. Current pollJob in BuildDemo.tsx throws 'job timed out' (orphans) -- this fixes that. Durable job store is a FOUND/API concern (FR-JOB-1).

#### UIP-17 — Tabbed Viewer panel (3D Model | Slice Preview)  · `M` · `extend`
Build the ViewerPanel composite: a tabbed right-rail panel with '3D Model' and 'Slice Preview' tabs (renamed from today's Model|Toolpath), each gated on its artifact (disabled tab when absent), auto-switching to Slice Preview on slice success, showing the 'awaiting model' empty state before any model. Wires StlViewer + GcodeViewer (SSR-guarded dynamic import), the ViewerTool reset overlay, and empty/loading/error states.
- **FRs:** FR-VIEW-5, FR-VIEW-1, FR-VIEW-2, FR-VIEW-3, FR-VIEW-4  ·  **Depends on:** UIP-3, UIP-10, UIP-11, UIP-12
- **Accept:** Tabs read '3D Model' and 'Slice Preview'; each is disabled until its artifact url exists · On a successful slice the panel auto-selects 'Slice Preview' · Before any model, the 3D Model tab shows ViewerEmpty ('awaiting model') · Viewers load via SSR-guarded next/dynamic; reset tool + error boundary present
- **Notes:** Lifts + renames the tabbed viewer block in apps/web/app/BuildDemo.tsx (Tabs value 'model'|'gcode', Model|Toolpath -> 3D Model|Slice Preview). Auto-switch-on-slice already present (setView('gcode')). Z-up->Y-up fix + auto-frame already work in StlViewer (FR-VIEW-1..3). Consumed by SCR chat rail (FR-CHAT-5) and calibration result (FR-RES-1).

#### UIP-18 — AppShell / panel layout primitives with stable canvas height  · `S` · `new`
Build the low-level layout primitives the two shells share: a flex/grid Panel + ResizablePane wrapper and a ViewerCanvas container that GUARANTEES a stable non-zero height (min-h / aspect lock) so R3F and gcode-preview never render at 0px. These are the building blocks for UIP-19 and UIP-20.
- **FRs:** FR-LAYOUT-5, FR-DS-2  ·  **Depends on:** UIP-3
- **Accept:** ViewerCanvas always reports a non-zero height (>=1px) even before content loads, verified by a layout test · Panel primitives compose into 2- and 3-column grids without content overflow · Canvas container clips overflow and fills its grid cell · Token-driven borders/background
- **Notes:** Spec FR-LAYOUT-5: 'the Viewer Canvas must own a stable non-zero height (R3F/gcode-preview render 0 px without it)'. Today BuildDemo wraps the viewer in a Card.h-[460px]. ViewerCanvas is the FR-DS-2 composite named in the spec. This is the height contract UIP-17/19 depend on.

#### UIP-19 — Chat 3-pane shell (sidebar | thread+composer | viewer-over-settings rail)  · `M` · `new`
Build the ChatShell: a 3-pane desktop layout -- left Sidebar slot, center thread+composer column, right rail with the Viewer panel stacked over the print-settings rail. Specifies presence/stacking/gating slots, not pixels. Narrow-width reflow handled in UIP-21.
- **FRs:** FR-LAYOUT-1, FR-LAYOUT-4  ·  **Depends on:** UIP-7, UIP-17, UIP-18
- **Accept:** ChatShell exposes sidebar / thread / composer / viewer / settingsRail slots · Right rail stacks Viewer over settings with the viewer owning a stable non-zero height · Center column scrolls the thread while keeping the composer docked at the bottom · Renders with placeholder content at desktop width with no overflow
- **Notes:** Spec FR-LAYOUT-1. The screen track (SCR) fills slots with real Sidebar items, thread, Composer, ViewerPanel, and the schema-driven settings panel (FR-CHAT-6). Reflow (collapse sidebar to drawer, stack the rail) is UIP-21.

#### UIP-20 — Settings 2-pane shell (nav | content)  · `S` · `new`
Build the SettingsShell: a 2-pane desktop layout -- left fixed nav (Sidebar with the 4 sections + pinned owner footer slot) over a scrollable content pane. Active-section highlighting via prop; routing/deep-linking is the screen's concern.
- **FRs:** FR-LAYOUT-2  ·  **Depends on:** UIP-7, UIP-18
- **Accept:** SettingsShell exposes nav (with footer slot) and content slots · Content pane scrolls independently of the fixed nav · Active nav item is highlighted via an activeSection prop · Renders with placeholder nav + content with no overflow at desktop width
- **Notes:** Spec FR-LAYOUT-2. Nav sections (Storage & Data, Equipment, Appearance, About) + owner avatar/name pinned bottom (non-interactive) are FR-SET-1; deep-link /settings/equipment routing is the SCR track's job. Reuses the Sidebar from UIP-7.

#### UIP-21 — Narrow-width reflow for both shells  · `M` · `extend`
Add desktop-first / mobile-best-effort reflow: below the breakpoint the chat shell collapses the Sidebar to a drawer and stacks the right rail under the thread; the settings shell collapses its nav to a drawer/top-tabs. Viewer keeps its stable non-zero height when stacked.
- **FRs:** FR-LAYOUT-3  ·  **Depends on:** UIP-19, UIP-20
- **Accept:** Below the breakpoint the chat Sidebar becomes a toggleable drawer and the viewer/settings rail stacks under the thread · Below the breakpoint the settings nav collapses (drawer or top-tabs) and content takes full width · Viewer canvas retains a non-zero height when stacked (no 0px collapse) · No horizontal overflow at a 375px-wide viewport
- **Notes:** Spec FR-LAYOUT-3: desktop-first, mobile best-effort; 'specify presence/stacking/gating/reflow, not pixels'. Sidebar drawer mode comes from UIP-7. Pixel-matching is explicitly out of scope (S0 functionality-before-form).

#### UIP-22 — Kit barrel export + design-system smoke test (33-component coverage)  · `S` · `new`
Finalize @agent-cad/ui as the single import surface: a barrel index exporting all primitives + composites, a styles.css entrypoint the app imports, and a render smoke-test that mounts each exported component once to catch token/prop regressions. Document the 33-component inventory mapping to the spec's named kit.
- **FRs:** FR-DS-1, FR-DS-2, FR-DS-3  ·  **Depends on:** UIP-4, UIP-5, UIP-6, UIP-7, UIP-8, UIP-11, UIP-12, UIP-13
- **Accept:** @agent-cad/ui index exports the full kit (primitives + Sidebar, ViewerCanvas, ViewerTool, Message, Composer, StatCard, SettingRow, SettingsForm, etc.) reaching the 33-component target · A vitest smoke test mounts each exported component once without throwing · apps/web imports components only from @agent-cad/ui (no remaining app-local duplicates) · pnpm turbo run typecheck + test pass for ui + web
- **Notes:** Spec S2/FR-DS-1: design system = 33 components to populate packages/ui (today only cn()). This is the closing 'is the kit complete + consistent' gate. ViewerCanvas comes from UIP-18, SettingsForm from UIP-13. Consumed by every SCR screen task.

### SCREENS

_Decomposition of the 11 Agent CAD screens (prefix SCR-) into vertically-thin, buildable tasks wired to the API (API- track) over the platform shells/renderers/viewers/kit (UIP- track) and the on-disk foundation (FOUND- track). Today's reuse base is BuildDemo.tsx (apps/web/app/BuildDemo.tsx): the prompt->generate->poll->StlViewer->slice->stats->download-gcode pipeline, the slice print-settings panel, StlViewer/GcodeViewer (packages/viewer), and the existing /setup + /troubleshooting pages. Net-new is the bulk: the chat shell (sidebar + thread + rail) replacing the single-page BuildDemo, the interview thread, conversational refine, chat persistence, the Settings 2-pane (Storage/Equipment/Printer Detail), the descriptor-driven Filament·Calibration editor with Original toggle + cube/Benchy slice cards, Cube/Benchy Result screens, Appearance, and About. Screens are SCHEMA-DRIVEN where settings appear (§3a SettingsDescriptor) and bind controls by real SliceSettings keys (§3.1). Tasks group per-screen into thin slices: e.g. New Chat splits into composer-hero, quick-start chips, and the Recent/search sidebar. Cross-track dependencies are stated as UIP-* (shell/renderer/viewer/kit), API-* (endpoints), FOUND-* (store/ports). Where a §3 shared-contract decision gates a task it is flagged in notes (SliceSettings Zod §3.1, SettingsDescriptor §3a, per-chat artifacts §3.5/3.6, slice_info layer_count/length_m §3.7, effort §3.4, refine versioning §5/openQ2, anthropic-driver state openQ4). The existing BuildDemo is a transitional reference that these screens supersede; it should be deleted once New Chat + Model Preview + Sliced reach parity._

#### SCR-001 — New Chat screen — hero composer that creates a chat and starts generation  · `M` · `extend`
Build the New Chat landing in the chat shell's center pane: a hero headline + Composer (multiline input + submit) bound to POST /chats then POST /chats/{id}/generate; submit (>=3 chars) creates a persisted chat, navigates into it, and kicks off the poll-driven generate flow. Lift the prompt-submit + pollJob logic from BuildDemo into the chat-bound flow.
- **FRs:** FR-CHAT-1, FR-CHAT-3, FR-CHAT-13  ·  **Depends on:** UIP-19, UIP-6, API-1, API-7
- **Accept:** Submitting a >=3-char prompt creates a chat (POST /chats) and routes to /chat/{id}; submit is disabled/validated under 3 chars · After create, generation is enqueued (POST /chats/{id}/generate) and the UI shows a poll-driven 'generating…' state with controls disabled (no double-fire) · On a fresh load with no chat selected, the hero + composer render as the empty/landing state · The composer clears and the thread shows the user's prompt turn once submitted
- **Notes:** Reuse onPromptSubmit + pollJob from BuildDemo.tsx (lines 287-392, 970-981). Endpoints are net-new (API-CHAT-CRUD, API-CHAT-GENERATE per FR-CHAT-1/FR-GEN-1). Poll budget ~300s; define poll-timeout 'still working / check back' behaviour (FR-CHAT-13). Depends on the §3.5 per-chat artifact decision (STL resolves from chats/{id}/artifacts, not a global slug).

#### SCR-002 — New Chat — quick-start chips (prefill + submit)  · `S` · `new`
Render a small row of quick-start prompt chips under the hero composer; clicking a chip prefills the composer with that prompt text and immediately submits, reusing SCR-001's create+generate path.
- **FRs:** FR-CHAT-1  ·  **Depends on:** SCR-001, UIP-3
- **Accept:** At least 3 quick-start chips render on the New Chat landing · Clicking a chip fills the composer with its prompt and triggers the same create+generate flow as a manual submit · Chips are disabled while a create/generate is in flight
- **Notes:** Chip prompt list is a static client constant for v1 (no backend). Uses the Chip/Button component from UIP-KIT-CHIP. Pure assembly over SCR-001.

#### SCR-003 — Sidebar — Recent chats list (newest-first) + select-to-rehydrate  · `M` · `new`
Build the chat-shell left sidebar: list chats from GET /chats newest-first with title + timestamp, a 'New chat' button, and selecting a chat routes to /chat/{id} and rehydrates its thread + rail to last state. Active chat is highlighted.
- **FRs:** FR-CHAT-10  ·  **Depends on:** UIP-19, UIP-7, API-1
- **Accept:** GET /chats renders Recent newest-first with each chat's title; the active chat row is visually marked · 'New chat' returns to the New Chat landing (SCR-001) · Selecting a chat navigates to /chat/{id} and the thread + rail rehydrate to that chat's last persisted state · Empty state ('No chats yet') renders when the list is empty
- **Notes:** Rehydration of the rail (last artifact) depends on §3.5/3.6 per-chat artifacts + FR-JOB-1 durable jobs re-attaching the terminal result. Sidebar component from UIP-SIDEBAR (lifted into packages/ui per FR-DS-1).

#### SCR-004 — Sidebar — client-side chat search/filter  · `S` · `new`
Add a search box atop the Recent sidebar that filters the loaded chat list client-side by title (case-insensitive substring); clearing restores the full list.
- **FRs:** FR-CHAT-10  ·  **Depends on:** SCR-003
- **Accept:** Typing in the search box filters the visible chat rows by title substring (case-insensitive) · Clearing the box restores the full newest-first list · A 'no matches' state renders when the filter excludes everything
- **Notes:** Pure client filter over SCR-003's already-loaded list — no API call (FR-CHAT-10 says client-side search).

#### SCR-005 — Model-selector chip in the Composer (driver+model, per-chat)  · `M` · `new`
Add a model-selector control to the Composer mapping to {driver, model} (default claude-code), persisted per-chat; the selection is sent with generate/refine. Anticipate the anthropic driver with no API key by surfacing a clear inert/error state.
- **FRs:** FR-CHAT-11  ·  **Depends on:** SCR-001, UIP-6, API-1
- **Accept:** A composer chip shows/sets driver+model, defaulting to claude-code; the value persists on the chat (PATCH/PUT /chats/{id}) · Selecting anthropic with no key configured shows an inert/disabled state with a clear message instead of silently failing · The selected driver+model is included in the generate/refine request body
- **Notes:** SHOULD. Must align with settings.active_model (§3.4 — the chat selector and settings describe the SAME thing). anthropic-key state is openQ4 — flag if FOUND-/API- choose to hide non-claude-code drivers for v1. driver/model already exist on GenerateRequest (schemas.py).

#### SCR-006 — Interview screen — thread questions + answer chips + skip/generate-now  · `L` · `new`
Render the interview as thread turns: POST /chats/{id}/interview (job-based, poll) returns a question + 2-4 quick-reply chips or ready; show the question as an assistant turn with clickable answer chips (or free text), always offering 'generate now / skip'. Accumulated Q&A feeds the generation prompt.
- **FRs:** FR-CHAT-2  ·  **Depends on:** SCR-001, UIP-5, UIP-3, API-9
- **Accept:** On a new chat the interview runs (POST /chats/{id}/interview, poll) and renders the returned question + 2-4 answer chips as a thread turn · Clicking an answer chip (or typing) appends the answer and advances to the next question, capped at 3 turns · 'Generate now' and 'Skip' are always visible and jump straight to generation with the Q&A accumulated so far · A 'ready' response auto-proceeds to generation
- **Notes:** Net-new interview layer (FR-INT-1). Job-based/poll like generate; shared 2-worker pool serializes long calls (openQ3 confirms cap=3, always skippable). Reuses pollJob. Message/Composer components from UIP-.

#### SCR-007 — Model Preview — right rail 3D Model tab bound to chat artifact + templated AI turn  · `M` · `extend`
Wire the chat's right rail '3D Model' tab to the chat's latest STL artifact via StlViewer, with an 'awaiting model' placeholder before any model; on generate success post a client-templated assistant turn (dims + fit + printable) from metadata. Lift the StlViewer + bbox/fit/printable badges from BuildDemo.
- **FRs:** FR-CHAT-3, FR-CHAT-5, FR-CHAT-12  ·  **Depends on:** SCR-001, UIP-17, UIP-5, API-7
- **Accept:** On generate success the 3D Model tab renders the chat's STL (auto-framed) and shows bbox / fits-bed / printable badges · Before any model exists the tab shows an 'awaiting model' placeholder · A templated assistant turn (dimensions + fit + printability) is posted from metadata with no second LLM call · On generate failure the error shows and any non-printable STL still renders
- **Notes:** Reuse StlViewer dynamic import + badges from BuildDemo.tsx (lines 16-19, 477-503, 730-742). AI narration is client-templated (§3.10). STL URL resolves per-chat (§3.5). Tabs 3D Model | Slice Preview rename from today's Model | Toolpath (FR-VIEW-5, owned by UIP-VIEWER-RAIL).

#### SCR-008 — Model Preview — conversational Refine (typed/chip instruction -> versioned re-generate)  · `M` · `new`
Add refine to the thread: a typed instruction or refine chip POSTs /chats/{id}/refine (seeded with prior model.py + thread) and polls; on success the rail swaps to the new versioned STL without losing the prior version, and a templated turn narrates the change.
- **FRs:** FR-CHAT-4  ·  **Depends on:** SCR-007, UIP-6, UIP-3, API-8
- **Accept:** Submitting a refine instruction enqueues POST /chats/{id}/refine and shows a poll-driven 'refining…' state · On success the rail renders the new artifact version and the prior version remains retrievable (not overwritten) · A templated assistant turn narrates the refined result (new dims/fit/printable) · Refine controls disable while in flight
- **Notes:** Net-new refine (FR-GEN-2). On-disk version scheme (artifacts/v<N>/) is openQ2 — flag dependency on API-CHAT-REFINE's chosen scheme. Reuses the SCR-001 poll pattern.

#### SCR-009 — Model Preview — compact print-settings panel (Printer/Filament/Layer height/Infill)  · `M` · `extend`
Under the rail viewer render the compact print-settings panel: Printer + Filament selectors (from the registry, default Ender 5 S1 + PLA), Layer height, and Infill, with the full SliceSettings set behind an 'advanced' disclosure. Disabled until a model exists; values seed the slice request.
- **FRs:** FR-CHAT-6  ·  **Depends on:** SCR-007, UIP-13, API-14, FOUND-14
- **Accept:** Printer + Filament selectors populate from the registry, defaulting to Ender 5 S1 + a PLA filament · Layer height + Infill controls render compactly and bind by real SliceSettings keys; the rest hides behind 'advanced' · The whole panel is disabled until a model artifact exists · Changing Printer/Filament loads that filament's saved settings into the controls
- **Notes:** Schema-driven via SettingsDescriptor (§3a, UIP-SETTINGS-RENDERER renders fields by inputType). Compact subset = fields with binding=per-slice surfaced compactly. Reuse the slice-settings layout from BuildDemo.tsx (lines 510-563) but descriptor-drive it. Registry default feeds fit (FR-EQ-1). Depends on §3.1 SliceSettings Zod.

#### SCR-010 — Model Preview — Slice model button (poll -> auto-switch to Slice Preview)  · `M` · `extend`
Wire 'Slice model' to POST /chats/{id}/artifacts/{artifactId}/slice with the selected filament's settings (by artifact kind §3.6), poll (~180s), and on success auto-switch the rail to the Slice Preview tab. Disabled until a model exists; gated on printable/fits.
- **FRs:** FR-CHAT-7, FR-CHAT-5  ·  **Depends on:** SCR-009, UIP-17, API-6
- **Accept:** 'Slice model' enqueues the chat-artifact slice with the current filament settings and shows a poll-driven slicing state · On success the rail auto-switches to the Slice Preview tab showing the toolpath · Slice is refused/disabled for a non-printable or does-not-fit part with a clear message · A friendly 'OrcaSlicer missing -> see Printer setup' error shows when the slicer is unconfigured
- **Notes:** Reuse sliceForPrint + the OrcaSlicer error mapping from BuildDemo.tsx (lines 334-382). Per-chat slice route replaces /generated/{name}/slice (§3.5). Gate on verification.printable / fits_build_volume (FR-JOB-1). GcodeViewer rail tab from UIP-VIEWER-RAIL.

#### SCR-011 — Sliced screen — toolpath + per-layer scrub + stats row  · `M` · `extend`
Render the Slice Preview tab: GcodeViewer toolpath with the per-layer scrub, plus a stats row of print time / filament length / filament weight / layer count from slice_info. Length + layer count are net-new backend fields (§3.7).
- **FRs:** FR-CHAT-8  ·  **Depends on:** SCR-010, UIP-17, API-6
- **Accept:** Slice Preview renders the g-code toolpath with a working per-layer scrub (GcodeViewer) · The stats row shows print time, filament length (m), filament weight (g), and layer count from slice_info · Stats render even if the canvas hasn't (layer count comes from slice_info, not the viewer's maxLayerIndex)
- **Notes:** Reuse GcodeViewer + fmtTime/fmtFilament from BuildDemo.tsx (lines 20-23, 681-689, 944-957). length_m + layer_count are NET-NEW in read_slice_info (§3.7, API-SLICE-INFO) — flag dependency. Do NOT source layer count from the viewer (§3.7).

#### SCR-012 — Sliced screen — Download g-code + Re-slice  · `S` · `extend`
Add the 'Download g-code' action (plain .gcode, short SD-friendly name, never the .gcode.3mf), enabled only after a successful slice, plus a 'Re-slice' that re-runs SCR-010 with current settings.
- **FRs:** FR-CHAT-9, FR-CHAT-7  ·  **Depends on:** SCR-011
- **Accept:** 'Download g-code' fetches the plain .gcode with a short SD-friendly filename and is disabled until a successful slice · Downloading never yields a .gcode.3mf archive · 'Re-slice' re-runs the slice with the current filament settings and updates the toolpath + stats
- **Notes:** Reuse downloadGcode (BuildDemo.tsx lines 934-942). gcode_url already points at the extracted plain g-code (main.py _submit_slice). Short name e.g. <chat-slug>.gcode (FR-CHAT-9).

#### SCR-013 — Chat header — title + state badge + flow footer  · `S` · `new`
Add the chat header (title + state badge: Interviewing / Model ready / Ready to print + printer name) and the DESCRIBE->INTERVIEW->GENERATE->SLICE&PRINT footer stepper, all derived from chat.status.
- **FRs:** FR-CHAT-12  ·  **Depends on:** SCR-007, UIP-19, API-1
- **Accept:** The header shows the chat title and a state badge derived from chat.status (Interviewing / Model ready / Ready to print + default printer) · The footer renders the 4-step DESCRIBE->INTERVIEW->GENERATE->SLICE&PRINT progression with the current step marked · Both update reactively as the chat advances through phases
- **Notes:** SHOULD. State derives entirely from chat.status (no extra calls). Printer name from the registry default (API-PRINTER-CRUD). Uses the StatCard/Badge kit from UIP-.

#### SCR-014 — Settings shell — Storage & Data screen (usage cards + maintenance actions)  · `L` · `new`
Build the Storage & Data section in the Settings 2-pane: show the resolved storage root with Open-folder + Change, usage cards (Projects/chats, Models/STL, Slices/g-code, Disk used) from GET /storage/usage, and the maintenance actions clear-cache / clear-history / reset-all with confirm dialogs.
- **FRs:** FR-STO-1, FR-STO-2, FR-STO-3, FR-STO-5, FR-STO-6, FR-SET-2  ·  **Depends on:** UIP-20, UIP-4, UIP-3, API-12, API-12
- **Accept:** Usage cards render real values from GET /storage/usage with loading + zero states · 'Open folder' reveals the storage root; 'Change' validates-writable + persists (says existing data is not auto-migrated) · Clear-cache / clear-history / reset-all each show a confirm dialog naming exactly what's removed, report bytes freed, and re-fetch usage · Reset uses the strongest confirm and is refused while a job runs
- **Notes:** Auto-clear toggle (FR-STO-4) is a SHOULD — split into SCR-015. Confirm dialog + StatCard from UIP- kit. All actions disabled-while-busy (FR-SET-2). Backend: GET /storage/usage + POST /data/{clear-cache|clear-history|reset} (API-STORAGE/API-DATA).

#### SCR-015 — Storage & Data — auto-clear-older-than-N-days toggle  · `S` · `new`
Add the 'Auto-clear older than 30 days' toggle to Storage & Data that persists auto_clear_days via PUT /settings.
- **FRs:** FR-STO-4  ·  **Depends on:** SCR-014, FOUND-3
- **Accept:** Toggling persists auto_clear_days through PUT /settings and reflects the stored value on reload · The control shows the current threshold (default 30 days)
- **Notes:** SHOULD. Enforcement (the sweep) is backend (FR-DATA-2); this task is just the UI toggle binding to settings.json via API-SETTINGS.

#### SCR-016 — Settings shell — left nav + routing + pinned owner identity  · `M` · `new`
Build the Settings 2-pane left nav (Storage & Data, Equipment, Appearance, About) with deep-linked active section (/settings/equipment) that survives reload, default landing on Equipment, and a non-interactive owner avatar/name pinned bottom.
- **FRs:** FR-SET-1  ·  **Depends on:** UIP-20, FOUND-3
- **Accept:** The 4-section nav renders; clicking a section deep-links (e.g. /settings/equipment) and the active item is marked · Reloading a deep link lands on the same section; the default landing is Equipment · The owner avatar + name (from settings.user_name) is pinned bottom and non-interactive
- **Notes:** Routing via Next.js app-router segments under /settings. user_name from settings.json (API-SETTINGS). Nav is the Settings shell's responsibility but this task owns the section list + routing wiring.

#### SCR-017 — Equipment screen — printer registry list (cards + Manage)  · `M` · `new`
Build the Equipment section: list printer cards from GET /printers (name, Default badge, type/kind, build volume, filament-profile count, Manage button); Manage routes to Printer Detail.
- **FRs:** FR-EQ-1  ·  **Depends on:** SCR-016, UIP-3, API-14
- **Accept:** GET /printers renders one card per printer with name, type/kind, build volume, and profile count · Exactly one card shows the Default badge · Each card's 'Manage' routes to the Printer Detail screen for that printer · Loading + empty states render
- **Notes:** Printer registry is net-new (FR-PRN-1). kind/nozzle/firmware are net-new registry fields (§3.3). Single-printer v1 is fine (openQ6). Card from UIP-KIT-CARD.

#### SCR-018 — Equipment — Add / Edit / Delete printer (form dialog)  · `L` · `new`
Add printer CRUD to Equipment: an Add/Edit form (name, build volume>0, nozzle 0.4 default, firmware free-text, bed margin 5, set-default) POSTing/PUTting to /printers, and Delete (blocked for the last printer / auto-promotes the default). Exactly one default enforced.
- **FRs:** FR-EQ-2, FR-EQ-3, FR-SET-2  ·  **Depends on:** SCR-017, UIP-3, UIP-13, API-14
- **Accept:** Add/Edit form validates build volume>0, defaults nozzle 0.4 / bed margin 5, accepts free-text firmware, and persists via POST/PUT /printers · Setting a printer default unsets the previous one (exactly one default) · Delete is blocked for the last printer and, when deleting the default, auto-promotes another; delete shows a confirm naming the printer · Saving updates the Equipment list without a full reload
- **Notes:** The default printer feeds cad.printer.fits (FR-EQ-1, net-new wiring in API-/FOUND-). nozzle_diameter_mm + firmware are net-new fields (§3.3). Confirm gating per FR-SET-2.

#### SCR-019 — Printer Detail — header stats + Edit  · `S` · `new`
Build Printer Detail header: build volume, nozzle diameter, firmware, and profile count for the printer (GET /printers/{id}), with an Edit button that opens the SCR-018 printer form.
- **FRs:** FR-PD-1  ·  **Depends on:** SCR-017, SCR-018, UIP-4, API-14
- **Accept:** Header shows build volume, nozzle diameter, firmware, and filament-profile count from GET /printers/{id} · 'Edit' opens the printer form pre-filled with this printer's values · A missing/unknown printer id shows a not-found state
- **Notes:** nozzle + firmware are the net-new registry fields (§3.3). StatCard from UIP-. Deep-linked by printer id.

#### SCR-020 — Printer Detail — filament-profile list + row Edit -> Calibration  · `M` · `new`
List the printer's filament profiles (material, brand/colour, nozzle temp, bed temp, Print speed = wall_speed) each with an Edit that deep-links into the Filament·Calibration editor for that printer x filament.
- **FRs:** FR-PD-2, FR-PD-4  ·  **Depends on:** SCR-019, API-14
- **Accept:** Each filament row shows material, brand/colour, nozzle temp, bed temp, and Print speed (wall_speed) · A row's 'Edit' deep-links to the Filament·Calibration editor scoped to this printer + filament · Empty state renders when the printer has no filament profiles
- **Notes:** Print speed label maps to wall_speed key (§3a label map). Edit->Calibration handoff is the §6 contract (FR-PD-4). Filaments are nested under the printer (API-PRINTER-CRUD /printers/{id}/filaments).

#### SCR-021 — Printer Detail — Add filament (validated to SliceSettings ranges)  · `M` · `new`
Add an 'Add filament' form to Printer Detail capturing material/brand/colour + the SliceSettings-shaped values (flow default 0.95), validated against SliceSettings ranges so registry values are always sliceable, POSTing to /printers/{id}/filaments.
- **FRs:** FR-PD-3  ·  **Depends on:** SCR-020, UIP-13, API-14
- **Accept:** The Add-filament form validates every value against its SliceSettings range and defaults flow to 0.95 · Saving POSTs to /printers/{id}/filaments and the new profile appears in the list · Out-of-range values are blocked client-side before submit
- **Notes:** Each filament is the SliceSettings shape (maps 1:1 to slice_overrides). Client pre-validate uses the §3.1 SliceSettings Zod bounds; server re-validates (FR-FIL-1). Depends on the SliceSettings Zod schema being authored (§3.1).

#### SCR-022 — Filament·Calibration — descriptor-driven settings editor (Save/Cancel)  · `L` · `new`
Build the per-filament editor that renders the filament's SettingsDescriptor (§3a) — field set, labels, input types, ranges, grouping all descriptor-driven — each control binding by real key to the filament's saved value. Save persists to printers/{id}.json filaments[].sliceSettings; Cancel reverts to last-saved; Save enabled only when dirty.
- **FRs:** FR-FIL-1, FR-FIL-2, FR-FIL-3  ·  **Depends on:** UIP-13, UIP-3, FOUND-14, API-14
- **Accept:** The editor renders entirely from GET descriptor — adding/removing a field is a data change with no UI edit · Each control binds by field.key (e.g. wall_speed, top_shell_layers) to the filament's saved value · Save validates against bounds, persists to printers/{id}.json filaments[].sliceSettings, and clears dirty · Cancel reverts to last-saved; Save is disabled until the form is dirty
- **Notes:** Core schema-driven screen (§3a). The renderer (switch on inputType) is UIP-SETTINGS-RENDERER; this task assembles it into the editor + Save/Cancel + dirty tracking. Labels are cosmetic, keys are the contract. Descriptor served by API-SETTINGS-DESCRIPTOR; depends on §3.1 SliceSettings Zod for client bounds.

#### SCR-023 — Filament·Calibration — 'Original' toggle (compare + reset-to-default)  · `M` · `new`
Add the 'Original' toggle that shows/compares the filament's defaultSliceSettings (committed-profile baseline) against current values and offers reset-to-original (still requires Save). This is the §3.8 successor to the old starrable default.
- **FRs:** FR-FIL-4  ·  **Depends on:** SCR-022
- **Accept:** Toggling 'Original' shows/compares the filament's defaultSliceSettings against the current values (diff indicated per field) · 'Reset to original' loads the defaults into the form but does not persist until Save · There is exactly one default concept (the filament's defaultSliceSettings) — no parallel starrable feature
- **Notes:** defaultSliceSettings is the committed-profile baseline returned with the filament (API-PRINTER-CRUD). Replaces the localStorage settings-versions/starrable-default in BuildDemo (§3.8) — those are discarded, no migration. Diff/reset operate on SliceSettings field values.

#### SCR-024 — Filament·Calibration — Calib Context Header (printer + filament chip + specs)  · `S` · `new`
Add the shared Calib Context Header used on Calibration + both Result screens: printer name + filament chip + 'Original' toggle slot + specs line ('FDM · 0.4 mm nozzle · 220×220×280 mm'). Nozzle is the net-new registry field.
- **FRs:** FR-HDR-1  ·  **Depends on:** UIP-3, API-14
- **Accept:** Header shows the printer name, a filament chip, and the specs line (FDM · nozzle mm · build volume mm) · Nozzle diameter and build volume come from the printer registry (not hardcoded) · The same header component renders on Calibration, Cube Result, and Benchy Result
- **Notes:** Shared across SCR-022/026/027. Nozzle is the net-new §3.3 registry field. The 'Original' toggle (SCR-023) docks into the header's toggle slot. Header component lifted into packages/ui (UIP-KIT-HEADER).

#### SCR-025 — Filament·Calibration — cube + Benchy slice cards (slice at saved settings)  · `M` · `extend`
Add the two test-object cards: Cube ('Slice') builds the parametric 20mm cube then slices with the filament's saved settings -> Cube Result; Benchy ('Slice') stages the committed Benchy then slices -> Benchy Result. Gate the Benchy card when GET /samples available=false; Cube is never gated. If the form is dirty, prompt to Save first.
- **FRs:** FR-CAL-1, FR-CAL-2, FR-CAL-3, FR-FIL-5  ·  **Depends on:** SCR-022, UIP-3, API-11, API-7
- **Accept:** Cube 'Slice' builds the 20mm cube and slices at the filament's saved settings, then navigates to Cube Result · Benchy 'Slice' stages + slices the committed Benchy at saved settings, then navigates to Benchy Result · The Benchy card is gated/disabled when GET /samples reports available=false; the Cube card is never gated · If the editor is dirty, slicing prompts to Save first (never slices stale values)
- **Notes:** POST /calibrate {target:cube|benchy, filament_id} (FR-CAL-1, API-CALIBRATE) is the only calibration. Reuses /samples gating from BuildDemo.tsx (lines 436-457, available flag). Slices use SAVED values (FR-FIL-5). Both objects are fixed (20mm cube + Benchy) — no size/variant picker.

#### SCR-026 — Cube Result screen — toolpath + stats + download + back  · `M` · `extend`
Build the Cube Result: the Calib Context Header + GcodeViewer toolpath with layer scrub + Ready badge + filename, a stats row (print time / filament length / weight / layer count), plain .gcode download, and 'Back to test prints' preserving printer+filament context.
- **FRs:** FR-RES-1, FR-RES-2, FR-RES-3, FR-RES-4  ·  **Depends on:** SCR-024, SCR-025, UIP-17, API-11, API-5
- **Accept:** Renders the cube g-code toolpath with a per-layer scrub, a Ready badge, and the filename · Stats row shows print time, filament length, weight, and layer count from slice_info · 'Download g-code' downloads the plain .gcode · 'Back to test prints' returns to the Calibration editor with printer+filament context intact
- **Notes:** Reuses GcodeViewer + stats + downloadGcode + header (SCR-024). length_m + layer_count are net-new in slice_info (§3.7, API-SLICE-INFO). Shares the result layout with SCR-027 (extract a common ResultView).

#### SCR-027 — Benchy Result screen — toolpath + stats + download + back  · `S` · `extend`
Build the Benchy Result mirroring Cube Result (Calib Context Header + GcodeViewer toolpath + scrub + Ready badge + filename + 4 stats + plain .gcode download + 'Back to test prints'), reusing the shared ResultView from SCR-026.
- **FRs:** FR-RES-1, FR-RES-2, FR-RES-3, FR-RES-4  ·  **Depends on:** SCR-026
- **Accept:** Renders the Benchy g-code toolpath with a per-layer scrub, Ready badge, and filename · Stats row shows print time, filament length, weight, and layer count · 'Download g-code' downloads the plain .gcode and 'Back to test prints' preserves printer+filament context
- **Notes:** Near-identical to SCR-026 — reuse the shared ResultView; the only difference is the target=benchy slice source. Keep DRY.

#### SCR-028 — Appearance screen — theme System/Light/Dark  · `S` · `extend`
Build the Appearance settings section: a theme selector (System/Light/Dark) using next-themes, optionally mirrored into settings.json.theme.
- **FRs:** FR-APP-1  ·  **Depends on:** SCR-016, FOUND-3
- **Accept:** A System/Light/Dark control switches the app theme via next-themes immediately · The selected theme persists across reloads · If mirrored to settings.json.theme, the stored value matches the selection
- **Notes:** SHOULD. Reuse next-themes (already wired: components/theme-provider.tsx, mode-toggle.tsx). Optional mirror to settings.json via API-SETTINGS.

#### SCR-029 — About screen — app name/version/links/health  · `S` · `new`
Build the informational About settings section: app name (Agent CAD), version, links, and an API health indicator (GET /health).
- **FRs:** FR-ABOUT-1  ·  **Depends on:** SCR-016, FOUND-3
- **Accept:** Shows 'Agent CAD', a version, and project links · An API health indicator reflects GET /health (ok / unreachable) · The section is purely informational (no destructive actions)
- **Notes:** NICE. Brand reads 'Agent CAD' everywhere, never 'Forge' (§0). Reuse the /health endpoint (main.py).

#### SCR-030 — Retire BuildDemo single-page once chat-flow screens reach parity  · `S` · `extend`
Once New Chat + Model Preview + Sliced (SCR-001/007/009/010/011/012) ship, remove the transitional BuildDemo.tsx single-page and repoint the root route to the chat shell, deleting the superseded localStorage settings-versions code.
- **FRs:** FR-CHAT-1, FR-CHAT-7  ·  **Depends on:** SCR-001, SCR-007, SCR-009, SCR-010, SCR-011, SCR-012
- **Accept:** The root route renders the chat shell (New Chat landing), not BuildDemo · BuildDemo.tsx and its localStorage settings-versions code are removed (or reduced to lifted helpers) · BuildDemo.test.tsx is updated/replaced so the suite still passes (pnpm turbo run test)
- **Notes:** Cleanup task closing the §3.8 supersession. Keep any lifted helpers (downloadGcode, fmtTime, pollJob) moved into shared modules. Do last to avoid losing the reference during build-out.
