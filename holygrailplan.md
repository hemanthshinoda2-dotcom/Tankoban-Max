# Holy Grail mpv Integration Plan

## Mainline Status

Holy Grail is now a mainline playback path on `master`.
Embedded playback is the primary target path, and Qt remains a required fallback/override path.

## Current Track (Incremental, player_hg-driven)

This plan is now tracked as incremental convergence work, not a side-branch experiment.
The goal is practical parity slices that ship usable improvements each pass.

### Completed Foundation (Phases 0-2 + Packaging)

- Native addon baseline is integrated in `native/holy_grail`.
- Main-process Holy Grail domain, IPC wiring, preload namespace, and API gateway are integrated.
- Renderer Holy Grail adapter is integrated and provides in-app frame rendering.
- Packaged artifact validation/build hooks are integrated (`build:holy-grail`, `validate:holy-grail`, release prep wiring).

### Active Upgrade Batch (HG-P3R)

1. Routing and preference cleanup
- Embedded is default when Holy Grail is healthy.
- Qt only opens on explicit user choice or hard embedded failure.
- Legacy localStorage forcing (`tankobanUseQtPlayer`) is removed from routing decisions.

2. Engine truth and diagnostics
- Runtime engine state is tracked (`embedded`, `qt`, `none`).
- Last open-route reason is tracked (`explicit_qt`, `explicit_embedded`, `user_pref_qt`, `probe_failed`, `init_failed`, `load_failed`).
- Player bar shows active engine badge and route reason tooltip.

3. player_hg UI module import (composable layer)
- `src/domains/video/hg_ui/` is the integration namespace.
- Modules are loaded in the deferred video chain:
  - `utils.js`, `drawer.js`, `toast.js`, `center_flash.js`, `volume_hud.js`, `diagnostics.js`, `top_strip.js`, `playlist.js`, `tracks_drawer.js`, `context_menu.js`, `hud.js`.
- These modules are mounted into the existing Tankoban video shell; no full page replacement.

4. Behavior convergence
- Embedded auto-advance is EOF-driven and single-trigger; countdown overlay is removed by default.
- Fullscreen and major layout changes force native surface resize through the Holy Grail resize path.
- HUD feedback uses player_hg-style controllers (toast/center-flash/volume overlay/diagnostics) on top of existing controls.

5. Progress persistence and cross-engine sync
- `video_progress.json` remains the single source of truth for resume.
- Embedded saves on poll/pause/seek/end/unload.
- Qt and embedded resume behavior remains shared by the same persistence pipeline.

## Architecture (Authoritative)

### Native and main process

- Native addon: `native/holy_grail/src/addon.cc`
- Domain: `main/domains/holyGrail/index.js`
- IPC channels/events: `shared/ipc.js`, `main/ipc/register/holy_grail.js`
- Preload namespace: `preload/namespaces/holy_grail.js`

### Renderer

- Adapter: `src/domains/video/holy_grail_adapter.js`
- Video domain: `src/domains/video/video.js`
- UI module layer: `src/domains/video/hg_ui/*.js`

## Phase Map

## Phase 3 (Incremental Convergence)

- Route correctness and fallback clarity.
- Hotkey and interaction convergence.
- Playlist/tracks/context/HUD behavior alignment with player_hg patterns.
- Auto-advance reliability and no false next-episode jumps.

## Phase 4 (Polish and Fidelity)

- Fullscreen edge-to-edge behavior and resize/reinit stability.
- Cursor/HUD timing polish.
- Render-quality and subtitle-safe-margin refinements.
- Additional UI polish in chips/drawers/feedback states.

## Phase 5 (Cleanup and Hardening)

- Keep Qt fallback path intact.
- Keep optional force-Qt diagnostics override.
- Remove dead legacy embedded paths only after sustained stability.

## Verification Checklist

1. Automated
- `npm run ipc:check`
- `node tools/validate_holy_grail_artifacts.js`
- `npm run smoke`

2. Runtime routing and engine truth
- Embedded opens by default when healthy.
- Explicit Open with Qt/Open with Embedded both work from show, episode, and continue contexts.
- Engine badge always matches actual path used.

3. Runtime playback reliability
- No false "next in X seconds" auto-advance behavior in embedded mode.
- EOF-only auto-advance occurs once and only when enabled.
- Fullscreen/windowed transitions stay sharp after resize.

4. Progress sync
- Embedded save/resume works.
- Qt close point resumes in embedded.
- Embedded close point resumes in Qt.

## How To Verify Active Engine

- Player bar badge:
  - `Embedded (HG)` means in-app Holy Grail route is active.
  - `Qt` means external Qt route is active.
- Route reason tooltip on the badge explains why that path was selected.
- Renderer logs include `[video-route]` entries with engine + reason + timestamp.
