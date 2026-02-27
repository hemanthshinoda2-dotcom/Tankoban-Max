# Project Butterfly

## What This Is

Tankoban Max is migrating from Electron to a PySide6 + QWebEngineView hybrid architecture.

The Qt player (`player_qt/run_player.py`) already proves that PySide6 + mpv delivers a production-quality video experience. Project Butterfly expands that foundation into the full app shell — Qt becomes the host, the existing web UI runs inside `QWebEngineView`, and mpv renders natively as a sibling widget. No more detached player process. No more file-based IPC polling. Single window, single process.

## Why "Butterfly"

The app sheds its Electron shell and emerges as a native Qt application, while keeping its existing web UI intact inside QWebEngineView — same identity, new form.

## Architecture: Before and After

### Before (Electron)
```
Electron Main Process (Node.js)
├── BrowserWindow
│   └── Chromium renderer (src/index.html + all JS/CSS)
│       └── preload bridge (contextBridge → ipcRenderer → ipcMain)
│
└── child_process.spawn → TankobanPlayer.exe (separate window)
    └── PySide6 + mpv (file-based IPC back to Electron)
```

### After (Qt Hybrid)
```
PySide6 QApplication
└── QMainWindow
    ├── QStackedWidget
    │   ├── QWebEngineView (hosts src/index.html — all existing UI)
    │   └── MpvRenderHost (native mpv widget — from run_player.py)
    │
    ├── QWebChannel bridge (replaces Electron preload + ipcMain)
    │   └── Python domain modules (ported from main/domains/)
    │
    └── QWebEngineProfile
        ├── Download interception (replaces session.will-download)
        ├── Cookie/cache management
        └── Per-tab QWebEngineView instances (browser feature)
```

## Migration Phases

### Phase 1 — Qt App Shell + QWebChannel Bridge
Build the PySide6 host application that can:
- Create a `QMainWindow` with `QStackedWidget`
- Load `src/index.html` in a `QWebEngineView`
- Expose a `QWebChannel` bridge matching the existing `window.Tanko.api.*` surface
- Switch between QWebEngineView (library/books/browser UI) and MpvRenderHost (video playback)

### Phase 2 — Port Backend Domains to Python
Rewrite `main/domains/*` as Python modules:
- 21 trivial JSON CRUD stores (mechanical 1:1 translation)
- Storage layer (`main/lib/storage.js` → `storage.py` with `QStandardPaths`)
- File dialog domains (`QFileDialog` replaces Electron `dialog`)
- Archive handling (`zipfile`/`rarfile` replaces `zlib`/`node-unrar-js`)
- Scanner workers (Python `threading` or keep Node subprocess)

### Phase 3 — Port Electron-Specific Features
- Download manager: `QWebEngineProfile.downloadRequested` + `QWebEngineDownloadRequest`
- Ad blocking: `QWebEngineUrlRequestInterceptor`
- Permissions: `QWebEnginePage.featurePermissionRequested`
- TTS: `edge-tts` (pip) replaces `msedge-tts` (npm)
- Tor proxy: `QNetworkProxy` replaces `session.setProxy()`
- Torrent client: `libtorrent` (pip) replaces `webtorrent` (npm)

### Phase 4 — Renderer Adaptation
- Minimal `src/index.html` changes (load `qwebchannel.js`, init bridge)
- `video.js` openVideo routing → internal widget switch instead of process spawn
- `web.js` tab management → QWebChannel calls to Python for QWebEngineView creation
- Remove Holy Grail embedded path code (no longer needed)

### Phase 5 — (Optional) Incremental Native UI Replacement
Once the Qt shell is stable, individual UI sections can be surgically replaced:
- Comic reader: `QGraphicsView` + `QGraphicsPixmapItem` (GPU-accelerated)
- Book reader: native Qt text rendering or isolated `QWebEngineView`
- Library grids: `QListView` + custom `QStyledItemDelegate`
- Browser tabs: stay as `QWebEngineView` forever (correct widget for web content)

## What Survives Untouched
- All renderer JS/CSS/HTML (~55% of codebase)
- All styles
- All dev tools and QA scripts
- mpv/FFmpeg resource binaries
- `shared/ipc.js` channel name registry
- Worker scan logic (filesystem walking algorithms)

## What Gets Ported (logic survives, language changes)
- 21 JSON data store domains → Python (~25% of codebase)
- Storage layer, file dialogs, archive handling
- Scanner workers

## What Gets Replaced (Electron-specific, no salvageable logic)
- Electron main process shell → PySide6 app shell
- preload bridge (12 namespace files) → QWebChannel `@Slot` decorators
- IPC register layer (46 files) → direct Python method exposure
- player_core (external process management) → internal widget
- Download/session/permission Electron hooks → Qt equivalents

## File Structure
```
projectbutterfly/
├── BUTTERFLY.md          ← this file
├── app.py                ← QApplication + QMainWindow entrypoint
├── bridge.py             ← QWebChannel API surface (replaces preload/)
├── storage.py            ← JSON persistence (replaces main/lib/storage.js)
├── domains/              ← Python backend modules (replaces main/domains/)
│   ├── archives.py
│   ├── books.py
│   ├── books_metadata.py
│   ├── library.py
│   ├── video.py
│   ├── video_metadata.py
│   ├── player.py         ← mpv widget integration (absorbs player_core + run_player.py)
│   ├── web_sources.py
│   ├── web_browser.py
│   ├── web_torrent.py
│   └── ...
├── workers/              ← Scanner threading (or Node subprocess wrapper)
└── requirements.txt      ← PySide6, python-mpv, edge-tts, libtorrent, rarfile, etc.
```

## Build Order (recommended implementation sequence)
1. `storage.py` — foundation, everything depends on it
2. `app.py` — minimal QMainWindow + QWebEngineView that loads `src/index.html`
3. `bridge.py` — QWebChannel skeleton with a single working domain (e.g., `HEALTH_PING`)
4. Trivial CRUD domains (one by one, test each via the bridge)
5. Library/books/video scan domains (with file dialogs)
6. Player integration (merge run_player.py mpv widget into the QStackedWidget)
7. Web browser domains (downloads, permissions, ad blocking)
8. Torrent/Tor domains
9. Renderer-side adaptations (index.html, video.js, web.js)
10. Packaging (PyInstaller spec for the full app)
