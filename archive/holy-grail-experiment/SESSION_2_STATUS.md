# Session 2 Status: Make player_hg Embeddable + True Embed

**Date:** 2026-02-23
**Branch:** `master`
**Previous commit:** `5e504bd FEAT-HG-S1: Holy Grail GPU backend for standalone player_hg`
**Plan file:** `C:\Users\Admin\.claude\plans\moonlit-bubbling-zephyr.md`

---

## The Big Picture (What We're Building)

The current embedded Holy Grail player has a poor UI. Its renderer-side code (`holy_grail_adapter.js` at 1,608 lines and `hg_ui/` with 11 controller files) was built from scratch as a completely different architecture from `player_hg/`. Every attempt to improve it has failed.

Meanwhile, `player_hg/` is a standalone player with excellent UI/UX: self-contained modules that build their own DOM, a clean adapter pattern, full HUD with seek bar and transport controls, playlist drawer, tracks drawer, context menu, diagnostics overlay, toast notifications, etc. But it only ran as a standalone Electron window.

**Goal:** Truly embed `player_hg` into the main Tankoban window using Shadow DOM, with the Holy Grail GPU rendering backend. Then delete all the old embedded HG code.

**Approach:** Shadow DOM on `#mpvHost` gives bulletproof CSS isolation. player_hg's scripts load in the main window's renderer process. The sharedTexture pipeline already delivers VideoFrames to the main window — we just put the canvas inside the shadow DOM instead of directly in the DOM.

---

## 4-Session Plan Overview

| Session | Goal | Status |
|---------|------|--------|
| **Session 1** | HG backend for standalone player_hg | DONE (commit `5e504bd`) |
| **Session 2** | Make player_hg embeddable + create Shadow DOM host | **IN PROGRESS** (code done, testing blocked by seek bar bug) |
| **Session 3** | Wire video.js integration + remove old code | NOT STARTED |
| **Session 4** | Polish, edge cases, final test | NOT STARTED |

---

## What Session 1 Delivered

- Created `player_hg/renderer/holy_grail_backend.js` (939 lines) — full adapter implementing the VideoAdapter interface using the mpv + D3D11 + sharedTexture pipeline
- Created `player_hg/preload_hg.js` (159 lines) — HG-mode preload exposing `PlayerBridge` + `HolyGrailBridge`
- Modified `player_hg/main.js` — detects HG availability, loads HG domain, registers IPC handlers, uses `preload_hg.js` when available
- Modified `player_hg/renderer/adapter.js` — factory now supports `'holy_grail'` backend name
- Standalone player launches, detects HG, video renders on canvas via GPU pipeline

---

## What Session 2 Has Done So Far

### 1. Extracted boot.js from index.html (DONE)

**File:** `player_hg/renderer/boot.js` (656 lines) — **NEW**

The massive inline `<script>` block (680 lines) in `index.html` was extracted into a callable `boot()` function. This is the key to embedding — both standalone and embedded mode call the same function with different options.

```javascript
window.TankoPlayer.boot = function(opts) {
  // opts.root        — Shadow root or document (default: document)
  // opts.backend     — 'html5' | 'holy_grail' | 'auto' (default: auto)
  // opts.embedded    — true when running inside main app
  // opts.holyGrailBridge — HG bridge object
  // opts.onExit      — callback when user requests exit
  // opts.onFileSwitch — callback when playlist navigates

  return { adapter, loadFile, initAdapter, destroy, doSeek, changeVolume, ... };
}
```

**Key behaviors by mode:**
- **Standalone:** Full keyboard shortcuts, drag-and-drop, double-click fullscreen, mouse wheel volume, `--file` launch args, fullscreen state sync
- **Embedded:** All of above disabled. Keyboard handled by video.js. Creates a polyfill `PlayerBridge` that routes through `Tanko.api.*` (window management, file dialogs, settings, screenshots)

`index.html` is now 59 lines (was 740):
```html
<script src="renderer/boot.js"></script>
<script>window.TankoPlayer.boot({});</script>
```

### 2. Root-Awareness for Shadow DOM (DONE)

8 modules modified to accept an optional shadow root instead of hardcoded `document`:

| Module | Change |
|--------|--------|
| `hud.js` | `var root = window.TankoPlayer._root \|\| document; stageEl = root.getElementById('playerStage')` |
| `toast.js` | Same pattern — `root.getElementById('playerStage')` |
| `center_flash.js` | Same pattern |
| `top_strip.js` | Same pattern |
| `diagnostics.js` | Same pattern |
| `volume_hud.js` | Same pattern |
| `drawer.js` | Same pattern — uses root for host element lookup |
| `context_menu.js` | Uses `_stageEl` variable for backdrop/menu appending; `init()` uses root |

**Pattern:** `boot.js` sets `window.TankoPlayer._root = root;` before calling any module's `init()`. Each module reads `window.TankoPlayer._root || document` at init time. Standalone mode: `_root` is null, falls back to `document`. Embedded mode: `_root` is the shadow root.

### 3. Bridge Parameter for HG Backend (DONE)

`holy_grail_backend.js` now accepts `opts.bridge` to receive the HG bridge object explicitly:
```javascript
var hg = (opts && opts.bridge) || window.HolyGrailBridge;
```
This lets embedded mode pass `Tanko.api.holyGrail` (from the main app's preload) instead of relying on `window.HolyGrailBridge` (which only exists in the standalone preload).

### 4. Shadow DOM Hosting in video.js (DONE)

Two new functions added to `src/domains/video/video.js` at line 6381:

```javascript
function createPlayerHgEmbed() {
  // Creates Shadow DOM on el.mpvHost
  // Injects :host styles (font, color, user-select)
  // Links player_hg/styles/player.css
  // Creates #playerStage div + hidden <video> element
  // Returns shadowRoot
}

function destroyPlayerHgEmbed() {
  // Clears shadow DOM contents
}
```

**Not yet wired** — these functions exist but `ensurePlayer()` still creates the old `createHolyGrailAdapter()`. Wiring happens in Session 3.

### 5. Script Loading in deferred_modules.js (DONE)

Added player_hg script loading between the hg_ui optional scripts and video.js:

```
Chain: utils.js → player_state.js → adapter.js → holy_grail_backend.js
Group (parallel): hud.js, top_strip.js, volume_hud.js, center_flash.js, toast.js,
                  context_menu.js, drawer.js, playlist.js, tracks_drawer.js, diagnostics.js
Chain: boot.js
```

Wrapped in try/catch so failures don't block video domain bootstrap.

---

## Active Bug: Seek Bar Doesn't Work (Property Events Never Reach Renderer)

### Symptom
When playing a video in standalone player_hg with the Holy Grail backend, the seek bar is completely non-functional. Duration is always 0. Clicking the seek bar does nothing.

### Root Cause (Narrowed Down)
The HG backend registers property observers for `time-pos`, `duration`, `pause`, etc. via `hg.observeProperty()`. The main process domain receives these and polls for changes via `addon.pollEvents()`. **Property-change events never appear in the poll results.** File-loaded and end-file events work fine — only property-change events are missing.

The event pipeline:
```
Renderer:  hg.observeProperty('duration')
  → IPC → Main:  addon.observeProperty('duration')  ← this is called successfully
  → Main:  addon.pollEvents() loop  ← returns file-loaded, end-file, but NOT property-change
  → Main:  handleAddonEvents() → emitToOwner() → renderer  ← never fires for properties
```

### Diagnostic State

**Temporary diagnostics currently in the code (MUST BE REMOVED before commit):**

1. **`player_hg/renderer/hud.js`** — Two `console.log` statements:
   - Line ~267: `console.log('[hud-seek] mousedown, adapter:', !!adapter, 'duration:', duration);`
   - Line ~369: `console.log('[hud-seek] duration event:', d);`

2. **`player_hg/main.js`** — Line 126:
   - `win.webContents.openDevTools({ mode: 'detach' });` (auto-opens DevTools on launch)

3. **`main/domains/holyGrail/index.js`** — Three `fs.appendFileSync` blocks:
   - `observeDefaults()`: Logs each property observation attempt to `D:/hg_diag.log`
   - `initGpu()`: Logs GPU init success to `D:/hg_diag.log`
   - `handleAddonEvents()`: Logs every event batch + individual property-change events to `D:/hg_diag.log`

### What We Know
- `initGpu()` succeeds (video renders, frames appear on canvas)
- `observeDefaults()` is called (it's called inside `initGpu()` after success)
- `file-loaded` events work (console shows `[hg-backend] file loaded`)
- `time-pos` and `duration` property-change events NEVER reach the renderer
- The `duration` event callback in hud.js (`onDurationEvent`) never fires
- Main process `console.log` doesn't show up in terminal output (known Electron issue)
- File-based logging (`D:/hg_diag.log`) was added but **hasn't been tested yet** — the player needs to be relaunched and a video opened

### Next Step to Debug
1. Launch standalone player_hg
2. Open a video
3. Check `D:/hg_diag.log` — this will reveal:
   - Did `initGpu` succeed? (Should say YES based on video rendering)
   - Did `observeDefaults` register all properties?
   - Does `pollEvents()` return ANY property-change events?
4. If pollEvents returns nothing: the bug is in the native addon (`holy_grail.node`) — it's not forwarding mpv property observations back to JavaScript
5. If pollEvents returns events but they don't reach the renderer: the bug is in `emitToOwner()` or the IPC channel routing

### Likely Root Cause
This is almost certainly a **native addon bug**. The addon's `observeProperty()` registers an mpv property observer, but `pollEvents()` doesn't return the resulting events. This is a Session 1 (or earlier) issue — the property observation code in the C++ addon may never have worked. Note that in the old embedded HG code (`holy_grail_adapter.js`), property polling was implemented differently — it used `getState()` on a timer to read values directly rather than relying on event-based property observation.

### Possible Fix Approaches
1. **Fix the native addon** — Make `pollEvents()` correctly return property-change events (requires C++ work in `native/holy_grail/`)
2. **Polling workaround** — Instead of relying on property-change events, poll `getState()` periodically (like the old adapter did). This would mean adding a `setInterval` in `holy_grail_backend.js` that calls `hg.getState()` every ~250ms and emits synthetic events
3. **Hybrid** — Use events for what works (file-loaded, end-file) and poll for properties (time-pos, duration, etc.)

**Recommendation:** Option 2 or 3 is fastest. The old adapter used polling successfully. We can add polling to `holy_grail_backend.js` without touching C++ code. Fix the addon later as a separate task.

---

## Files Modified (Not Yet Committed)

### Production Changes (keep)
| File | Change | Lines |
|------|--------|-------|
| `player_hg/index.html` | Replaced 680-line inline boot with boot.js reference | 740 → 59 |
| `player_hg/renderer/boot.js` | **NEW** — Callable boot function for standalone + embedded | 656 lines |
| `player_hg/renderer/hud.js` | Root-awareness (`_root \|\| document`) | +4 lines |
| `player_hg/renderer/toast.js` | Root-awareness | +2 lines |
| `player_hg/renderer/center_flash.js` | Root-awareness | +2 lines |
| `player_hg/renderer/top_strip.js` | Root-awareness | +2 lines |
| `player_hg/renderer/diagnostics.js` | Root-awareness | +2 lines |
| `player_hg/renderer/volume_hud.js` | Root-awareness | +2 lines |
| `player_hg/renderer/drawer.js` | Root-awareness | +2 lines |
| `player_hg/renderer/context_menu.js` | Root-awareness (3 changes: `_stageEl`, backdrop, init) | +8 lines |
| `player_hg/renderer/holy_grail_backend.js` | Bridge parameter (`opts.bridge`) | +2 lines |
| `src/domains/video/video.js` | `createPlayerHgEmbed()` + `destroyPlayerHgEmbed()` | +45 lines |
| `src/state/deferred_modules.js` | player_hg script loading | +26 lines |

### Temporary Diagnostic Changes (REMOVE before commit)
| File | What | Action |
|------|------|--------|
| `player_hg/renderer/hud.js` | 2x `console.log` in seek/duration handlers | Remove |
| `player_hg/main.js` | `openDevTools({ mode: 'detach' })` | Remove |
| `main/domains/holyGrail/index.js` | 3x `fs.appendFileSync` diagnostic blocks | Remove |

### Unrelated Change (separate concern)
| File | What |
|------|------|
| `main/domains/webSources/index.js` | +22 lines — appears to be a separate change, not part of this session |

### Generated File (do not commit)
| File | What |
|------|------|
| `player_hg/player_settings.json` | Auto-generated when standalone player saves settings |

---

## What Remains for Session 2

1. **Fix the seek bar bug** — Either fix native addon or add polling workaround to `holy_grail_backend.js`
2. **Remove all temporary diagnostics** from hud.js, main.js, holyGrail/index.js
3. **Test standalone player fully works** — play, pause, seek, volume, speed, track selection
4. **Test embedded mode in main app** — open a video from Tankoban library, verify Shadow DOM player works
5. **Commit** — `FEAT-HG-S2: Make player_hg embeddable via Shadow DOM + boot.js`

---

## What Session 3 Will Do

1. **Wire `ensurePlayer()` to use player_hg** — Replace `createHolyGrailAdapter()` call with `createPlayerHgEmbed()` + `TankoPlayer.boot()`
2. **Wire `bindPlayerUi()` events** — Adapter contract is already compatible (both use `kind: 'mpv'`, `windowMode: 'embedded-libmpv'`, same methods)
3. **Handle lifecycle** — `teardownMpvPlayer()` calls `destroyPlayerHgEmbed()`; mode switches clean up Shadow DOM
4. **Delete old code:**
   - `src/domains/video/holy_grail_adapter.js` (1,608 lines)
   - `src/domains/video/hg_ui/` (11 files, ~35KB)
   - Remove hg_ui loading from `deferred_modules.js`
   - Remove old adapter creation + hg_ui wiring from `video.js`
5. **Test full playback lifecycle** — play, pause, seek, track selection, progress save, auto-advance

---

## What Session 4 Will Do

1. Polish edge cases: rapid file switching, memory cleanup, corrupted files
2. Verify: playlist auto-advance, continue watching, series management
3. Verify: mode switching (video → comics → video), window resize, fullscreen
4. Verify: Qt fallback still works when HG unavailable
5. Final cleanup and commit

---

## Key Architecture Decisions

### Why Shadow DOM?
- Bulletproof CSS isolation — player_hg's styles work exactly as in standalone
- Same renderer process — no IPC overhead for UI interactions
- sharedTexture delivers VideoFrames to the main window already
- Canvas composites normally inside shadow DOM
- Standard web platform API

### Why Not iframe / WebContentsView?
- iframe: Cross-origin restrictions, no access to sharedTexture
- WebContentsView: Renders natively ON TOP of DOM (z-ordering nightmare), separate process = IPC overhead

### Namespace Isolation
- `window.TankoPlayer` — player_hg namespace. NOT used anywhere in `src/`
- `window.Tanko` — main app namespace. NOT used in `player_hg/`
- `window.PlayerBridge` — standalone player bridge. NOT used in `src/`
- `window.HolyGrailBridge` — standalone HG bridge. NOT used in `src/` (main app uses `Tanko.api.holyGrail`)
- Zero conflicts between the two

### Adapter Contract Compatibility
Both the old `holy_grail_adapter.js` and player_hg's `holy_grail_backend.js` implement the same interface:
- `kind: 'mpv'`, `windowMode: 'embedded-libmpv'`
- Same capabilities: `{ tracks: true, delays: true, transforms: true, externalSubtitles: true, screenshots: true }`
- Same methods: `load`, `play`, `pause`, `seekTo`, `seekBy`, `setVolume`, `setSpeed`, `cycleAudioTrack`, `cycleSubtitleTrack`, etc.
- Same events: `time`, `duration`, `play`, `pause`, `ended`, `volume`, `speed`, `tracks`, `chapters`, `file-loaded`, `error`
- player_hg adds: `first-frame`, `shutdown`, `delays`, `transforms` (extras that video.js can bind to)

This means video.js can swap `state.player` from the old adapter to the new one with minimal changes to `bindPlayerUi()`.

---

## File Inventory (Full Plan)

### New Files (Session 1 + 2)
- `player_hg/renderer/holy_grail_backend.js` — Session 1 (939 lines)
- `player_hg/preload_hg.js` — Session 1 (159 lines)
- `player_hg/renderer/boot.js` — Session 2 (656 lines)

### Files to Delete (Session 3)
- `src/domains/video/holy_grail_adapter.js` — 1,608 lines
- `src/domains/video/hg_ui/utils.js`
- `src/domains/video/hg_ui/drawer.js`
- `src/domains/video/hg_ui/toast.js`
- `src/domains/video/hg_ui/center_flash.js`
- `src/domains/video/hg_ui/volume_hud.js`
- `src/domains/video/hg_ui/diagnostics.js`
- `src/domains/video/hg_ui/top_strip.js`
- `src/domains/video/hg_ui/hud.js`
- `src/domains/video/hg_ui/playlist.js`
- `src/domains/video/hg_ui/tracks_drawer.js`
- `src/domains/video/hg_ui/context_menu.js`

Total deletion: ~12 files, ~3,200+ lines
