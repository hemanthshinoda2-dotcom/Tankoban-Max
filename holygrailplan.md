# Holy Grail mpv Integration Plan

## Branching and Ownership

Holy Grail integration is now mainline work on `master`.
All follow-up phases, fixes, and parity work should be planned and committed on `master` unless a separate temporary branch is explicitly needed for a scoped task.

## Current Status

- Phases 0-2 are integrated into the main app codebase.
- Packaging support for Holy Grail native artifacts is wired into release prep.
- Qt playback remains as the fallback path when Holy Grail is unavailable.
- Phase 3 + 4C work is in progress on `master`:
  - native live surface resize is wired (`HG_RESIZE` end-to-end),
  - embedded fullscreen/resize now resizes the native render surface instead of canvas-only scaling,
  - Qt strict key semantics are being aligned (`K`, `Shift+N/P`, `N/P`),
  - auto-advance is gated by true end-state checks,
  - embedded screenshot path uses mpv command flow,
  - subtitle HUD lift + margin behavior is now exposed in embedded player settings.
- Phase 5 fallback/cleanup is now applied in mainline:
  - Qt fallback remains intact and is used automatically when Holy Grail is unavailable,
  - BUILD14 hide-window flow remains Qt-only,
  - force-Qt mode is available as a persisted app setting (diagnostics override),
  - stale Qt-only/deprecated branch framing was removed from active video flow.

## Context

Tankoban Max historically played video via an external Python/Qt subprocess: the Electron window hides, the Qt player takes over, and progress syncs via file-based IPC. The "holy grail" PoC (`experiments/mpv-holy-grail/`) proved that mpv can render GPU-accelerated frames directly into an Electron canvas via ANGLE -> D3D11 -> sharedTexture -> VideoFrame, with zero CPU copies at 60fps. The goal is in-app playback with Qt-level feature parity.

**Reference implementations:**
- **Build 110** (embedding patterns): Native addon with property observation, track management, bounds management, load-gate pattern
- **Qt player** (feature target): 25+ keyboard shortcuts, audio/subtitle track switching, speed control, chapter navigation, playlist, subtitle delay/styling, volume OSD, quality modes

**Key insight**: Tankoban Max already had most infrastructure for embedded playback: IPC channels (`LIBMPV_*`), keyboard hotkeys, HUD styling, progress persistence, and a player adapter pattern in `ensurePlayer()`.

---

## Phase 0 - Addon Hardening (native C++)

Extend the proven PoC addon with missing capabilities needed for production use.

### 0A: Relocate addon source
- Copy `experiments/mpv-holy-grail/native/src/addon.cc` -> `native/holy_grail/src/addon.cc`
- Copy `binding.gyp` alongside it
- Create `tools/build_holy_grail.bat` -> copies to `D:\hg-build\`, runs electron-rebuild, copies `.node` back
- Build workaround remains necessary for apostrophes in project path

### 0B: Add property observation
- Load `mpv_observe_property` and `mpv_wait_event` function pointers
- Add `observeProperty(name)` N-API export -> calls `mpv_observe_property` with typed formats
- Add `pollEvents()` N-API export -> drains mpv event queue, returns array of property/event changes
- Called each frame-loop iteration alongside `renderFrame()`

### 0C: Add track list querying
- Load `mpv_free_node_contents` function pointer
- Add `getPropertyNode(name)` -> calls `mpv_get_property` with `MPV_FORMAT_NODE`, recursively converts `mpv_node` trees to JS objects/arrays
- Handles `track-list` (id/type/lang/title/codec/etc.)

### 0D: Add reinit support
- Split `destroy()` -> `destroyPlayer()` (tears down mpv + ANGLE, keeps DLLs loaded) and `destroyAll()` (also frees DLLs, for app quit)
- `destroyPlayer()` enables loading a new video without restarting the app

**Files:** `native/holy_grail/src/addon.cc`, `native/holy_grail/binding.gyp`, `tools/build_holy_grail.bat`

---

## Phase 1 - Main Process Domain + IPC Wiring

Wire the addon into Tankoban Max's standard domain/IPC/preload/gateway architecture.

### 1A: `main/domains/holyGrail/index.js`
- Loads `holy_grail.node`
- Resolves DLL paths (libmpv from `resources/mpv/windows/`, ANGLE from Electron runtime paths)
- Manages frame loop (renderFrame -> sharedTexture.import -> sharedTexture.send -> pollEvents -> push property changes to renderer)
- Exports:
  - `probe`, `initGpu`, `loadFile`, `startFrameLoop`, `stopFrameLoop`
  - `command`, `getProperty`, `setProperty`, `getState`, `getTrackList`, `observeProperty`
  - `destroy`, `destroyAll`

### 1B: IPC channels in `shared/ipc.js`
Add `HG_*` channel block:
```
HG_PROBE, HG_INIT, HG_LOAD, HG_START_FRAME_LOOP, HG_STOP_FRAME_LOOP,
HG_COMMAND, HG_GET_PROPERTY, HG_SET_PROPERTY, HG_GET_STATE,
HG_GET_TRACK_LIST, HG_OBSERVE_PROPERTY, HG_DESTROY
```
Events:
- `HG_PROPERTY_CHANGE`
- `HG_EOF`
- `HG_FILE_LOADED`

### 1C: `main/ipc/register/holy_grail.js`
- Standard register module, wired through `main/ipc/index.js`

### 1D: `preload/namespaces/holy_grail.js`
- IPC invoke wrappers for all `HG_*` channels
- Configures `sharedTexture.setSharedTextureReceiver()` for `VideoFrame` delivery
- Exposes `onVideoFrame(cb)` and event listeners (`onPropertyChange`, `onEof`, `onFileLoaded`)

### 1E: API gateway in `src/services/api_gateway.js`
- Adds `holyGrail` namespace wrappers, following existing gateway patterns

**Files:** `main/domains/holyGrail/index.js`, `shared/ipc.js`, `main/ipc/register/holy_grail.js`, `main/ipc/index.js`, `preload/namespaces/holy_grail.js`, `preload/index.js`, `src/services/api_gateway.js`

---

## Phase 2 - Renderer Adapter (First Visible Frame)

### 2A: `src/domains/video/holy_grail_adapter.js`
Creates a player adapter matching what `video.js` expects from `state.player`:
- Creates and owns canvas in `#mpvHost`
- Calls `Tanko.api.holyGrail.initGpu()` -> `loadFile()` -> `startFrameLoop()`
- Draws incoming `VideoFrame`s with `ctx.drawImage(videoFrame)`
- Listens to `HG_PROPERTY_CHANGE` and maps to adapter state + events
- Adapter identity:
  - `kind: 'mpv'`
  - `windowMode: 'embedded-libmpv'`
  - `capabilities: { tracks, delays, transforms, externalSubtitles }`
- Methods:
  - Core playback: `load`, `play`, `pause`, `togglePlay`, `seekTo`, `seekBy`, `stop`, `unload`, `destroy`, `getState`
  - Media control: `setVolume`, `setMuted`, `setSpeed`
  - Tracks/subtitles: `getAudioTracks`, `getSubtitleTracks`, `setAudioTrack`, `setSubtitleTrack`, `cycleAudioTrack`, `cycleSubtitleTrack`, `toggleSubtitles`, `addExternalSubtitle`
  - Sync/transforms: `setAudioDelay`, `setSubtitleDelay`, `setAspectRatio`, `setCrop`, `resetVideoTransforms`
- Emits events expected by `video.js`:
  - `time`, `duration`, `play`, `pause`, `ended`, `volume`, `speed`, `file-loaded`, `ready`, `error`, `delays`, `transforms`

### 2B: Modify `ensurePlayer()` in `video.js`
- Probe and prefer `state.holyGrailAvailable`
- Instantiate `window.createHolyGrailAdapter({ hostEl: el.mpvHost })`

### 2C: Probe Holy Grail at video bootstrap
- `await Tanko.api.holyGrail.probe()` -> store in `state.holyGrailAvailable` and error state

### 2D: Modify `openVideo()`
- If Holy Grail is available: enter in-app player flow
- Else: fall back to Qt launcher path
- Keep existing teardown path (`showVideoLibrary()`) authoritative

**Files:** `src/domains/video/holy_grail_adapter.js`, `src/domains/video/video.js`, `src/state/deferred_modules.js`

### Milestone
Open a video -> in-app playback starts, HUD updates, pause/seek/scrubber/progress flow works, fallback path remains available.

---

## Packaging Support

- Add `tools/validate_holy_grail_artifacts.js` to validate required `.node` artifact before packaging
- Add scripts in `package.json`:
  - `build:holy-grail`
  - `validate:holy-grail`
- Update `release:prep` to include Holy Grail build/validate alongside existing player prep
- Add `extraResources` entry so packaged app ships `holy_grail.node`
- Ensure loader in `main/domains/holyGrail/index.js` checks both dev and packaged locations deterministically

---

## Phase 3 - Feature Parity (follow-up)

Each item maps adapter methods to mpv properties/commands. UI scaffolding already exists.

| Feature | mpv property/command | Existing UI |
|---------|----------------------|-------------|
| 3A: Track switching | `aid`, `sid`, `track-list`, `sub-add` | Track panels, A/S hotkeys |
| 3B: Speed control | `speed` | Speed panel, C/X/Z hotkeys |
| 3C: Volume | `volume`, `mute` | Arrows, M hotkey, volume OSD |
| 3D: Audio/sub delay | `audio-delay`, `sub-delay` | Delay controls in tracks panel |
| 3E: Aspect ratio | `video-aspect-override` | Context menu aspect submenu |
| 3F: Chapter navigation | `chapter-list`, chapter commands | Shift+N/P, scrubber markers |
| 3G: Episode next/prev | `loadfile` command | N/P hotkeys, auto-advance |
| 3H: Screenshots | `screenshot-to-file` command | Context menu |
| 3I: External subtitles | `sub-add` | File dialog in tracks panel |

---

## Phase 4 - Polish

- 4A: Fullscreen UX polish (`body.videoFullscreen`, F key, button)
- 4B: Cursor auto-hide tuning (`.hideCursor`)
- 4C: Canvas responsiveness / reinit policy for major resolution changes
- 4D: Quality modes (`gpu-hq` and related profiles/options)
- 4E: Subtitle styling controls (`sub-ass-override`, margins)

---

## Phase 5 - Fallback and Cleanup

- 5A: Keep Qt fallback behind `state.holyGrailAvailable`
- 5B: Keep BUILD14 hide-window behavior Qt-only
- 5C: Optional setting to force Qt mode for diagnostics
- 5D: Remove dead legacy embedded paths after stable parity

---

## Verification Plan

1. Phase 0: Build addon, verify `observeProperty`, `pollEvents`, `getPropertyNode("track-list")`
2. Phase 1: Renderer console probe returns `{ ok: true }` from `Tanko.api.holyGrail.probe()`
3. Phase 2: Open video in-app, verify pause/seek/scrubber/progress behavior
4. Phase 3: Validate each parity feature individually (tracks, speed, delays, chapters, next/prev, external subs)
5. Phase 4-5: Verify fullscreen/cursor polish and Qt fallback behavior
