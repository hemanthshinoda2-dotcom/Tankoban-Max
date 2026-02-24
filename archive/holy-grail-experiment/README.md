# Holy Grail Experiment — Archived Implementation

**Archived:** February 2026
**Status:** Fully functional on master, archived to simplify the app back to Qt-only playback.

---

## What It Was

A zero-copy GPU pipeline for embedding mpv video playback directly inside Electron, with full HTML overlay support (HUD, transport controls, subtitles, etc.).

### The Problem It Solved

Tankoban's video playback launched an external Qt player window. This worked but meant:
- No integrated playback experience (separate window, no DOM overlays)
- Two processes to manage (Electron + Qt player)
- Limited UI customization

Embedding mpv directly had two known approaches, both flawed:
- **HWND embedding**: mpv renders fast (GPU-direct) but HTML overlays can't sit on top of native windows
- **Software render to canvas**: HTML overlays work but CPU-copying frames kills performance for HD/4K

### The Holy Grail Solution

```
mpv decode → GPU → D3D11 texture → Electron sharedTexture → VideoFrame (GPU-backed) → Canvas → DOM
```

Frames never leave the GPU. HTML overlays compose naturally via DOM layering on top of the canvas.

---

## Architecture

### Layer Diagram

```
┌──────────────────────────────────────────────────────┐
│ Renderer Process (src/domains/video/video.js)        │
│   ┌──────────────────────────────────────────┐       │
│   │ player_hg/ (Shadow DOM embed)            │       │
│   │   boot.js → adapter.js → backends:       │       │
│   │     holy_grail_backend.js (VideoAdapter)  │       │
│   │     html5_backend.js (fallback)           │       │
│   │   hud.js, playlist.js, tracks_drawer.js   │       │
│   │   diagnostics.js, context_menu.js, etc.   │       │
│   └──────────────────┬───────────────────────┘       │
│                      │ onVideoFrame(callback)         │
│                      ▼                                │
│   preload/namespaces/holy_grail.js                   │
│     sharedTexture.setSharedTextureReceiver()          │
│     importedSharedTexture.getVideoFrame() → callback  │
└──────────────────────┬───────────────────────────────┘
                       │ IPC (20+ channels)
┌──────────────────────┴───────────────────────────────┐
│ Main Process (main/domains/holyGrail/index.js)       │
│   Frame loop (setInterval @ 60fps)                    │
│   Event polling (mpv_wait_event, separate timer)      │
│   Property observation (mpv_observe_property)         │
│   Hot-property coalescing (batches at 33ms)           │
│   SharedTexture cache (reuses handles per size)       │
│   Diagnostics tracking with token lifecycle           │
│                      │                                │
│                      ▼                                │
│   native/holy_grail/src/addon.cc (N-API C++ addon)   │
│     Dynamic DLL loading:                              │
│       libmpv-2.dll, libEGL.dll, libGLESv2.dll         │
│     D3D11 device + DXGI shared texture                │
│     ANGLE EGL context (D3D11-backed)                  │
│     Double-buffer pattern:                            │
│       Internal texture (ANGLE renders to)             │
│       CopyResource → External texture (Electron reads)│
│     mpv OpenGL render API → ANGLE → D3D11             │
└──────────────────────────────────────────────────────┘
```

### Key Insight: Double-Buffer Pattern

ANGLE renders into an internal D3D11 texture. After each frame, `CopyResource` copies to an external texture with `MISC_SHARED_NTHANDLE | MISC_SHARED_KEYEDMUTEX`. Electron imports the external texture's NT handle via `sharedTexture.importSharedTexture()`, converts to a `VideoFrame`, and sends it to the renderer. This avoids GPU pipeline stalls — ANGLE can start the next frame while Electron reads the previous one.

This is the same pattern used by **media-kit** (Flutter's video player) in production, proving the pipeline is viable at scale.

---

## How the C++ Native Addon Worked

**File:** `native/holy_grail/src/addon.cc`

The addon is a single ~1,500-line C++ file using N-API (node-addon-api). It avoids all header dependencies for libmpv, EGL, and GLES by defining types and constants inline, then loading all functions dynamically at runtime via `LoadLibraryW` + `GetProcAddress`.

### Initialization Flow

1. **`loadLibraries(mpvDir)`** — Loads `libmpv-2.dll`, `libEGL.dll`, `libGLESv2.dll` from the specified directory. All function pointers resolved via `GetProcAddress`.

2. **`initGpu(width, height)`**:
   - Creates D3D11 device (`D3D11CreateDevice` with `D3D_DRIVER_TYPE_HARDWARE`)
   - Gets ANGLE's D3D11 device via `eglQueryDeviceAttribEXT(EGL_D3D11_DEVICE_ANGLE)`
   - Creates EGL display, context, and pbuffer surface
   - Creates two D3D11 textures:
     - **Internal** (ANGLE render target): `DXGI_FORMAT_B8G8R8A8_UNORM`, `D3D11_BIND_RENDER_TARGET | SHADER_RESOURCE`
     - **External** (shared with Electron): same format + `MISC_SHARED_NTHANDLE | MISC_SHARED_KEYEDMUTEX`
   - Creates mpv instance, sets mpv options (`vo=libmpv`, `hwdec=auto`), initializes mpv
   - Creates mpv render context with ANGLE's OpenGL context

3. **`renderFrame()`**:
   - Calls `mpv_render_context_render()` to render to internal texture via ANGLE
   - `CopyResource` from internal → external texture
   - Returns the NT shared handle as a Buffer for Electron's `sharedTexture.importSharedTexture()`

4. **`pollEvents()`** — Calls `mpv_wait_event(0)` in a loop, returns array of events (property changes, EOF, file-loaded, etc.)

5. **`destroyPlayer()`** — Destroys mpv instance but keeps DLLs loaded for quick reinit
   **`destroyAll()`** — Full teardown including DLL unload

### Build Requirements

- Visual Studio Build Tools 2022 (or later) with Windows SDK
- `node-gyp` + `@electron/rebuild` (to match Electron's Node.js ABI)
- **Workaround**: node-gyp fails when CWD contains an apostrophe (e.g., `Hemanth's Folder`). The build script copies to `D:\hg-build\` to work around this.

### Build Command

```bash
# From project root:
npm run build:holy-grail
# Or manually:
tools\build_holy_grail.bat
```

---

## How the IPC Bridge Worked

**Files:** `shared/ipc.js`, `main/ipc/register/holy_grail.js`

20+ IPC channels prefixed `holyGrail:`:

| Channel | Purpose |
|---------|---------|
| `HG_PROBE` | Check if addon + DLLs are available |
| `HG_INIT` | Initialize GPU pipeline (create D3D11 device, ANGLE context, mpv) |
| `HG_RESIZE` | Resize render surface (recreates textures) |
| `HG_LOAD` | Load media file in mpv |
| `HG_START_FRAME_LOOP` | Start 60fps frame rendering + event polling |
| `HG_STOP_FRAME_LOOP` | Stop frame loop |
| `HG_COMMAND` | Send arbitrary mpv command |
| `HG_GET_PROPERTY` | Read mpv property |
| `HG_SET_PROPERTY` | Set mpv property |
| `HG_GET_STATE` | Get current playback state snapshot |
| `HG_GET_TRACK_LIST` | Get audio/subtitle/video track info |
| `HG_OBSERVE_PROPERTY` | Subscribe to property change events |
| `HG_DESTROY` | Teardown mpv (keeps DLLs for reinit) |
| `HG_SET_PRESENTATION_ACTIVE` | Hint renderer visibility (pause frame loop when hidden) |
| `HG_GET/SET_DIAGNOSTICS_ENABLED` | Toggle diagnostics collection |
| `HG_RESET_DIAGNOSTICS` | Reset counters |

Events (main → renderer): `HG_PROPERTY_CHANGE`, `HG_EOF`, `HG_FILE_LOADED`, `HG_DIAGNOSTICS`

---

## How the Preload Namespace Worked

**File:** `preload/namespaces/holy_grail.js`

The preload script did two things:

1. **Bound the sharedTexture receiver** — Called `sharedTexture.setSharedTextureReceiver()` which registered a callback. When the main process sent a shared texture handle, Electron called this callback with `importedSharedTexture`. The preload converted it to a `VideoFrame` via `.getVideoFrame()`, then forwarded it to the renderer's registered frame handler.

2. **Exposed the API** — `Tanko.api.holyGrail.*` with methods for all IPC channels plus `onVideoFrame(handler)` for frame callbacks.

---

## How the Renderer Worked

**Files:** `player_hg/renderer/` (16 modules)

### Shadow DOM Embed

The video.js renderer created a Shadow DOM on `#mpvHost`, loaded player_hg's stylesheet, and built the player UI inside the shadow root. This gave bulletproof CSS isolation — player_hg's styles couldn't leak into the main app and vice versa.

### VideoAdapter Pattern

`adapter.js` selected between two backends:
- **`holy_grail_backend.js`** — Received GPU VideoFrames via `onVideoFrame`, drew them to a `<canvas>` with `ctx.drawImage(videoFrame, ...)`, properly closed frames after drawing
- **`html5_backend.js`** — Fallback using a standard `<video>` element

### Player UI Modules

Each module was self-contained, building its own DOM:
- `hud.js` — Seek bar, transport controls, time display
- `top_strip.js` — Title bar with filename
- `volume_hud.js` — Volume slider
- `center_flash.js` — Play/pause/seek feedback animations
- `toast.js` — Notification toasts
- `context_menu.js` — Right-click menu
- `playlist.js` — Playlist drawer
- `tracks_drawer.js` — Audio/subtitle track selection
- `diagnostics.js` — FPS, frame timing, GPU stats overlay
- `player_state.js` — State machine for playback lifecycle
- `boot.js` — Entry point, wired everything together

---

## Key Learnings and Gotchas

1. **D3D11 texture format**: Must be `DXGI_FORMAT_B8G8R8A8_UNORM` (not RGBA) for ANGLE compatibility
2. **Keyed mutex**: The shared texture needs `MISC_SHARED_KEYEDMUTEX` for safe cross-process access
3. **ANGLE instance**: Must be a standalone ANGLE instance (not Electron's internal one) because mpv's render API needs exclusive OpenGL context ownership
4. **Frame loop decoupling**: Frame rendering and event polling run on separate timers for responsiveness
5. **Hot-property coalescing**: Properties like `time-pos` fire every frame; batching them at 33ms prevents IPC flooding
6. **SharedTexture cache**: Reusing texture handles when dimensions don't change eliminates per-frame allocation overhead
7. **Apostrophe in path**: node-gyp breaks when CWD contains `'`. Workaround: build in a clean path and copy artifacts back
8. **Electron 40 requirement**: The `sharedTexture` module is experimental and only available in Electron 40+
9. **VideoFrame.close()**: Must close VideoFrames after drawing or they leak GPU memory rapidly
10. **Ghostery/ad blockers**: Network-level ad blockers hook `session.webRequest` and can break download events silently

---

## Why It Was Archived

The pipeline was fully functional and integrated, but:
- The Qt player is simpler, more mature, and handles all video formats reliably
- The native addon adds build complexity (VS Build Tools, node-gyp, @electron/rebuild)
- The 160KB .node binary + 120MB libmpv-2.dll add to distribution size
- Maintaining two player paths (embedded + Qt fallback) doubled testing surface
- The experiment proved the concept works — it can be revisited when the embedded experience is worth the complexity

---

## File Inventory (what's in this archive)

```
archive/holy-grail-experiment/
  README.md                          ← This file
  holygrailplan.md                   ← Integration plan and phases
  SESSION_2_STATUS.md                ← Shadow DOM embed session notes
  native/holy_grail/                 ← C++ native addon
    src/addon.cc                     ← The addon source (~1,500 lines)
    binding.gyp                      ← node-gyp build config
    build/Release/holy_grail.node    ← Pre-built binary
    package.json                     ← Build dependencies
  experiments/mpv-holy-grail/        ← Phase 1 PoC standalone app
    README.md, main.js, renderer.js, preload.js, index.html, styles.css
    native/src/addon.cc              ← PoC addon (earlier prototype)
    binding.gyp, package.json
  player_hg/                         ← Embedded player UI
    index.html, main.js, preload.js, preload_hg.js
    renderer/                        ← 16 UI modules
      adapter.js, boot.js, center_flash.js, context_menu.js,
      diagnostics.js, drawer.js, holy_grail_backend.js, html5_backend.js,
      hud.js, player_state.js, playlist.js, toast.js, top_strip.js,
      tracks_drawer.js, utils.js, volume_hud.js
    styles/                          ← Player CSS
  main/domains/holyGrail/index.js    ← Main process domain handler
  main/ipc/register/holy_grail.js    ← IPC registration module
  preload/namespaces/holy_grail.js   ← Preload namespace (sharedTexture binding)
  tools/build_holy_grail.bat         ← Native addon build script
  tools/validate_holy_grail_artifacts.js ← Artifact validator
```
