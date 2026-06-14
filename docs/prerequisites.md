# Prerequisites & setup

What you need installed to run the full pipeline (design → slice → g-code → print).
The CAD/web toolchains are handled by `uv` / `pnpm`; the **slicer** is the one
external thing you install yourself, because slicing isn't a Python library — it's
a separate, mature engine we drive as a subprocess (see `docs/STACK.md`).

## 1. Core toolchains (scripted)

- **Node ≥ 22** + **pnpm ≥ 10**, **Python 3.11+** + [uv](https://docs.astral.sh/uv/).
- Then: `uv sync --all-packages` and `pnpm install`. (`scripts/setup.sh` runs both;
  it's wired as a SessionStart hook.)

## 2. Slicer — OrcaSlicer (for producing g-code)

We use **OrcaSlicer's CLI** because it ships the official *Creality Ender-5 S1 0.4
nozzle* profile. It's a GUI app, but we only call its headless command-line mode.

### On WSL / Linux

> **Ubuntu version matters.** The current OrcaSlicer AppImage targets **Ubuntu
> 24.04** (needs `libtiff.so.6`, webkit-4.1). On 22.04 it won't run — upgrade with
> `sudo do-release-upgrade`, or use the older `_Ubuntu2204_` AppImage. Put the
> AppImage on the **Linux filesystem** (`~/Applications/…`), *not* under `/mnt/c`
> (slow + often `noexec`).

```bash
mkdir -p ~/Applications
# download the Linux x86_64 OrcaSlicer .AppImage from github.com/SoftFever/OrcaSlicer/releases
chmod +x ~/Applications/OrcaSlicer.AppImage

# runtime libraries the AppImage expects from the system (Ubuntu 24.04):
sudo apt install -y libglu1-mesa libwebkit2gtk-4.1-0 libjavascriptcoregtk-4.1-0

# smoke test:
~/Applications/OrcaSlicer.AppImage --help        # prints usage = good
```

Point the pipeline at it (the slice service reads `$ORCA_SLICER_BIN`, else `PATH`):

```bash
export ORCA_SLICER_BIN=$HOME/Applications/OrcaSlicer.AppImage   # add to your .env / shell
```

**Headless display:** OrcaSlicer is a Qt app and wants a display even to slice. On a
machine with no desktop the slice service auto-wraps it in `xvfb-run` (install with
`sudo apt install -y xvfb`; disable with `AGENT_CAD_NO_XVFB=1`). The harmless
`libEGL/MESA … skip thumbnail generating` warnings just mean the preview thumbnail
was skipped — the slice still completes.

### Try it

```bash
slice ender5s1 services/slice/tests/fixtures/cube20.stl --output /tmp/cube.gcode.3mf
# -> slices with the bundled Ender 5 S1 profiles and extracts plain cube.gcode
```

The Ender 5 S1 profiles are **committed** in `services/slice/src/slicer/profiles/
ender5s1/` (so slicing is deterministic and you don't need to export your own). The
machine profile carries one patch — `layer_change_gcode = G92 E0` — without which
OrcaSlicer's own validator rejects the relative-extruder Creality profile.

## 3. To actually print

- A **micro-SD card**, **FAT32**-formatted, with a card reader. Plugged into Windows
  it appears inside WSL at e.g. `/mnt/d/`, so the pipeline can copy g-code straight to
  it. Use short 8.3 filenames in the card **root** (Marlin requirement).
- A leveled bed — the web UI's "Get your printer ready" panel walks you through it
  (see `docs/printer-ender5s1.md`).

## Optional / fallback

- **PrusaSlicer** (`sudo apt install prusa-slicer`) — apt-installed, plain g-code,
  no AppImage lib wrangling; needs a bring-your-own Ender 5 S1 `.ini`. Use if
  OrcaSlicer is a hassle on your distro.
- **git-lfs** — only needed before committing binary print artifacts.
