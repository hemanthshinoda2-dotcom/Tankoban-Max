# Project Butterfly — Progress & Roadmap

## Current Status: Phase 5 Complete

**bridge.py**: 9,133 lines | **47 namespace classes** implemented | **0 stubs** remaining

## Completed Work

### Foundation (Session 1)
- `storage.py` — JSON persistence layer with `QStandardPaths`
- `app.py` — `QMainWindow` + `QWebEngineView` + `QWebChannel` host
- `bridge.py` — skeleton with `BridgeRoot`, JS shim, `JsonCrudMixin`, `_err()/_ok()` helpers

### Batch 0 — JsonCrudMixin Domains (Session 1)
18 namespaces using the shared `JsonCrudMixin` for flat key-value JSON stores:

| Namespace | File | Methods |
|-----------|------|---------|
| WindowBridge | — | `minimize`, `maximize`, `close`, `setTitle`, `isMaximized`, `setFullscreen` |
| ShellBridge | — | `getMode`, `setMode`, `getLastSection`, `setLastSection`, `setTheme` |
| ClipboardBridge | — | `writeText`, `readText` |
| ProgressBridge | `progress.json` | `get`, `save` (KV) |
| SeriesSettingsBridge | `series_settings.json` | `get`, `save` (KV) |
| BooksProgressBridge | `books_progress.json` | `get`, `save`, `getAll`, `remove` (KV) |
| BooksTtsProgressBridge | `books_tts_progress.json` | `get`, `save`, `remove` (KV) |
| BooksBookmarksBridge | `books_bookmarks.json` | `get`, `save`, `remove`, `getAll` (KV) |
| BooksAnnotationsBridge | `books_annotations.json` | `get`, `save`, `remove`, `getAll` (KV) |
| BooksDisplayNamesBridge | `books_display_names.json` | `get`, `save` (KV) |
| BooksSettingsBridge | `books_settings.json` | `get`, `save` (KV) |
| BooksUiBridge | `books_ui.json` | `get`, `save` (KV) |
| VideoProgressBridge | `video_progress.json` | `get`, `save`, `getAll`, `remove` (KV) |
| VideoSettingsBridge | `video_settings.json` | `get`, `save` (KV) |
| VideoDisplayNamesBridge | `video_display_names.json` | `get`, `save` (KV) |
| VideoUiBridge | `video_ui.json` | `get`, `save` (KV) |
| WebBrowserSettingsBridge | `web_browser_settings.json` | `get`, `save` (KV) |
| WebSessionBridge | `web_session.json` | `get`, `save` (KV) |

### Batch 1 — Trivial CRUD Array Stores (Session 2)
6 stubs → working implementations. These use array-based JSON stores (not JsonCrudMixin).

| Namespace | Storage | Key Logic |
|-----------|---------|-----------|
| WebBookmarksBridge | `web_bookmarks.json` | Array (max 5000), dedup by URL, toggle, sanitize, auto-ID |
| WebHistoryBridge | `web_history.json` | Array (max 10000), scope filter, upsert with dedup window, pagination, migration |
| WebPermissionsBridge | `web_permissions.json` | Rules array, origin normalization, decision validation. `resolvePrompt` stays stub |
| WebSearchBridge | 3 JSON files | Cross-source suggest (search history + bookmarks + browsing history), max 8 results |
| AudiobooksBridge | 2 JSON files | Progress KV + pairing KV, merge-on-save. **Scanner methods remain stubbed** |
| Build14Bridge | `build14_return_state.json` | Single blob save/load for player return-to-library state |

### Batch 2 — Filesystem, Media & Data Domains (Session 2)
6 stubs → working implementations. Introduced `wrapBinary()` JS helper for base64→ArrayBuffer transport.

| Namespace | Key Logic |
|-----------|-----------|
| FilesBridge | Binary file read → base64, video folder listing by extension |
| ThumbsBridge | Book cover + page thumbs: JPEG write from data-URL, `file://` URL return |
| VideoPosterBridge | JPEG/PNG per show ID, Qt clipboard paste (`QApplication.clipboard().image()`), delete cleans `video_index.json` |
| BooksOpdsBridge | Array store (max 100 feeds) + HTTP fetch proxy (`urllib.request`) for OPDS catalogs |
| WebAdblockBridge | Dual JSON config, EasyList parser (`\|\|domain^` rules), hierarchical domain matching, remote list fetch, internal `should_block_request()` |
| ArchivesBridge | CBZ via `zipfile` (stdlib), CBR via `rarfile` (PyPI), session pools (max 3 each) with LRU eviction, base64 binary return |

### Batch 3 — Pure Python Domains (Session 3)
3 stubs → working implementations.

| Namespace | Key Logic |
|-----------|-----------|
| ExportBridge | Save comic page via `QFileDialog` + copy to clipboard via `QImage`. Reads entry bytes directly from ArchivesBridge internals |
| WebUserscriptsBridge | Per-site script manager: CRUD rules array, wildcard URL matching, `fnmatch`-style patterns, internal `get_matching_scripts()` + `touch_injected()` for future injection |
| TorrentSearchBridge | Jackett/Prowlarr torznab API client: provider config from settings JSON, XML parsing for torznab items, JSON API for Prowlarr, category code→type mapping, multi-indexer search with fallback |

### Batch 4 — Scanner Workers (Session 4)
4 scanner domains → working implementations. Shared scanner infrastructure: `threading.Thread`, `os.walk`, `QFileDialog`, scan dedup, progress signals.

| Namespace | Key Logic |
|-----------|-----------|
| LibraryBridge | Comics library: root/series folder management, auto-series discovery from root subdirs, threaded `os.walk` scan, comic file classification (.cbz/.cbr/.pdf/.zip/.rar/.cb7/.7z), series ID via base64url, orphan progress pruning. Shared config `library_state.json` |
| BooksBridge | Books library: root/series folder + individual file management, threaded scan, book classification (.epub/.pdf/.txt/.mobi/.fb2), `bookFromPath()` for on-demand metadata, cross-bridge progress pruning (booksProgress/Bookmarks/Annotations/DisplayNames/TtsProgress) |
| VideoBridge | Video library: show grouping (subdirs = shows), episode discovery with SHA1 IDs, pseudo-roots for added files/show folders, hidden show management, auto-poster via mpv subprocess frame grab, streamable folder support (.tanko_torrent_stream.json), subtitle file dialog, `getEpisodesForShow/Root/ByIds` queries. Shared config `library_state.json` |
| AudiobooksBridge | Scanner completion: root folder management, BFS walk for audio folders (.mp3/.m4a/.m4b/.ogg/.opus/.flac/.wav/.aac/.wma), chapter detection, cover image discovery, shared roots with books domain. Progress/pairing CRUD was already working |

### Batch 5 — Browser Engine Domains (Session 5)
4 stubs → working implementations. These wrap QWebEngine APIs and provide data-only CRUD for download/source management.

| Namespace | Key Logic |
|-----------|-----------|
| WebFindBridge | In-page find via `QWebEnginePage.findText()`. Supports forward/backward search, case sensitivity, clear. Emits `findResult` signal with match count + active index. Page reference set by `app.py` |
| WebBrowserActionsBridge | Context menu action dispatch (back/forward/reload/copy/cut/paste/undo/redo/selectAll/copyLink/openLinkExternal/devtools), `printToPdf` via `QWebEnginePage.printToPdf()`, page screenshot, OS shell open/reveal for downloads |
| WebDataBridge | Browsing data usage stats (file sizes of history/downloads/torrents/session JSONs), selective clearing by kind (history/downloads/torrents/cache/cookies/siteData). Cross-domain: delegates to WebHistoryBridge, WebSourcesBridge, WebTorrentBridge |
| WebSourcesBridge | Sources CRUD (4 built-in defaults + user-added), download history CRUD (max 1000, terminal state protection), destination management (library root folder listing, mode-based folder browsing, path validation), picker dialogs via `QFileDialog`, download routing with filename sanitization + mode detection by extension. Live download lifecycle (pause/resume/cancel) structurally wired to `_active_downloads` dict for future QWebEngineProfile integration |

### JS Shim Features
- `wrap(fn, ctx)` — standard string-based request/response
- `wrapBinary(fn, ctx)` — decodes base64 `.data` field to `ArrayBuffer` (used by `files.read`, `archives.cbzReadEntry`, `archives.cbrReadEntry`)
- Signal subscription via `QWebChannel` signal connections

### Batch 6 — External Libraries (Session 6)
2 stubs → working implementations.

| Namespace | Key Logic |
|-----------|-----------|
| BooksTtsEdgeBridge | Edge TTS via `edge-tts` pip package. Voice listing (`edge_tts.list_voices()`), text→audio synthesis (`edge_tts.Communicate.stream()`), SHA-256-keyed disk cache (`tts_audio_cache/`) with 500 MB eviction cap, base64 or file-URL return, word boundary offsets, asyncio→thread bridge for Qt, probe with voices+synthesis test |
| TorProxyBridge | Tor SOCKS5 proxy lifecycle: binary resolution (resources/tor/ or PATH), `subprocess.Popen` with stdout bootstrap monitoring (regex parse `Bootstrapped N%`), port scanning 9150-9159, `QNetworkProxy.setApplicationProxy()` for SOCKS5 routing, background thread for crash detection, temp dir management, `forceKill()` for app quit |

### Batch 7 — WebTorrent Client (Session 7)
1 stub → working implementation.

| Namespace | Key Logic |
|-----------|-----------|
| WebTorrentBridge | Full torrent client via `libtorrent` Python bindings. `startMagnet()`/`startTorrentUrl()`/`startConfigured()` for adding torrents, `pause`/`resume`/`cancel`/`remove` lifecycle, `pauseAll`/`resumeAll` batch ops, `selectFiles()` with file priority, `setDestination()` save path, `streamFile()` sequential priority for playback, `resolveMetadata()`/`cancelResolve()` for magnet→info, `addToVideoLibrary()` routing, `getActive()`/`getHistory()`/`clearHistory()`/`removeHistory()` persistence, `getPeers()`/`getDhtNodes()` live stats, `selectSaveFolder()` via QFileDialog, `openFolder()` platform reveal. Background 800ms poll thread for progress/state updates. Graceful fallback when libtorrent unavailable |

### Batch 8 — Player Integration (Session 8)
2 stubs → working implementations. This is the flagship feature of Butterfly.

| Namespace | Key Logic |
|-----------|-----------|
| PlayerBridge | Native in-process video player via `python-mpv`. Lazy mpv instance creation with `wid` embed into QWidget. `start()` loads file + switches QStackedWidget to mpv page, `play()`/`pause()`/`seek()`/`stop()` direct mpv property control, `launchQt()` aliased to internal `start()` for renderer compat, 500ms QTimer poll for position/duration/playing state, automatic progress persistence to VideoProgressBridge on pause/stop/end, `playerStateChanged`/`playerExited`/`playerEnded` signals, `shutdown()` for app quit. app.py wiring via `setMpvWidget(widget, show_player_fn, show_web_fn)` |
| MpvBridge | mpv availability probe. `probe()` and `isAvailable()` check whether `python-mpv` module can be imported (libmpv installed). Result cached after first check. Returns version info when available |

### Permanent Stub (1)
| Stub | Notes |
|------|-------|
| HolyGrailBridge | Archived experiment. Permanent stub. |

## All Bridge Stubs Complete

All 46 namespace classes are implemented. Remaining work:

### Batch 9 — Renderer Boot Adaptation (Session 9)
Dual-boot loader for Electron + Butterfly coexistence.

| File | Change |
|------|--------|
| `src/index.html` | Replaced 11 synchronous `<script>` tags with a conditional chain-loader. In Electron, scripts load immediately (electronAPI from preload). In Butterfly, waits for `electronAPI:ready` event dispatched by QWebChannel shim, then chain-loads scripts in order. Non-API scripts (Shoelace, icons, control_adapters) remain synchronous. |
| `projectbutterfly/bridge.py` | `setup_bridge()` now inlines `qrc:///qtwebchannel/qwebchannel.js` source directly into the QWebEngineScript (via `_read_qrc_text()`), eliminating the async `<script>` load. Bridge shim dispatches `document.dispatchEvent(new Event('electronAPI:ready'))` after populating `window.electronAPI`. |
| `src/services/api_gateway.js` | **No changes needed** — already checks `window.electronAPI` at top and creates `Tanko.api` from it. Works identically in both environments. |

### Batch 10 — Video Playback Adaptation (Session 10)
Adapt video.js routing for Butterfly's inline mpv player.

| File | Change |
|------|--------|
| `src/domains/video/video.js` | Restored mpv probe call (was hardcoded to `{ available: false }`). Now calls `Tanko.api.mpv.probe()` so Butterfly reports mpv as available. Playback flow unchanged — `openVideo()` → `openVideoQtFallback()` → `api.player.launchQt()` remains the universal path. |
| `projectbutterfly/bridge.py` | `PlayerBridge.launchQt()` now returns `keepLibraryVisible: true` — prevents `openVideoQtFallback()` from hiding the window (player is inline, not external process). Added `onStateChanged`/`onEnded` event subscriptions to JS shim player namespace. |

### Phase 3 — Remaining Renderer Adaptations
- `src/state/mode_router.js` — No changes needed (pure DOM, no Electron deps)

### Phase 4 — App Shell Integration (DONE)
- `app.py` — QStackedWidget with mpv widget (index 1) + QWebEngineView (index 0)
- Wired `setMpvWidget()`, `setPage()`, `setProfile()` on bridge instances
- Quit cleanup: `player.shutdown()`, `torProxy.forceKill()`, `storage.flush_all_writes()`

### Phase 5 — TankoBrowser Qt Rearchitecture

#### Session A — WebTabManagerBridge (DONE)
Added `BrowserTabPage` subclass (lazy QWebEnginePage with `createWindow`/`acceptNavigationRequest` overrides for popup tabs and magnet link interception) and `WebTabManagerBridge` class (~350 lines) to bridge.py.

| Feature | Details |
|---------|---------|
| Tab lifecycle | `createTab`, `closeTab`, `switchTab`, `getTabs` |
| Navigation | `navigateTo`, `goBack`, `goForward`, `reload`, `stop`, `getNavState` |
| Viewport overlay | `setViewportBounds` — positions QWebEngineView at JS-reported coordinates |
| Home tab | `setTabHome` — hides/shows overlay for home mode |
| Zoom | `getZoomFactor`, `setZoomFactor` |
| Signals | `tabCreated`, `tabClosed`, `tabUpdated`, `magnetRequested` |
| Context menu | `_on_context_menu` → emits via `webBrowserActions.contextMenu` |
| Page delegation | `switchTab` updates `webFind.setPage()` and `webBrowserActions.setPage()` to active tab's page |
| JS shim | `webTabManager` namespace with 14 methods + 4 events |
| Env flag | `window.__tankoButterfly = true` for renderer detection |

#### Session B — app.py Wiring (DONE)
- Created `_browser_profile = QWebEngineProfile("webmode")` for tab isolation
- Wired `webTabManager.setup(profile, container, main_view)`
- Wired `profile.downloadRequested` → `webSources.handleDownloadRequested()`
- `handleDownloadRequested` (~120 lines): accepts QWebEngineDownloadRequest, creates history entry, connects progress/completion signals, stores handle for lifecycle ops

#### Session C — web.js Adaptation (DONE)
758 insertions, 168 deletions — all gated behind `isButterfly`:

| Function | Butterfly Path |
|----------|---------------|
| `openSourcesTab()` | `api.webTabManager.createTab()`, stores `_bridgeTabId` |
| `closeSourcesTab()` | `api.webTabManager.closeTab()` |
| `switchSourcesTab()` | `api.webTabManager.switchTab()` + `setTabHome()` |
| `navigateSourcesBrowser()` | `api.webTabManager.navigateTo()` |
| `applySourcesBrowserViewportLayout()` | `api.webTabManager.setViewportBounds()` with DPR-scaled `getBoundingClientRect()` |
| `refreshSourcesBrowserNav()` | Uses `_canGoBack`/`_canGoForward` from bridge signals |
| Nav button handlers | Back/Forward/Reload/Stop delegate to bridge |
| `runSourcesContextAction()` | back/forward/reload use bridge; `sendCtx` skips wcId |
| `initSourcesBrowser()` | Registers `onTabUpdated`/`onTabCreated`/`onTabClosed`/`onMagnetRequested` |

#### Session D — Context Menus, Downloads, Polish (DONE)

| Feature | Implementation |
|---------|---------------|
| Context menu | Fixed wiring: moved from `page.contextMenuRequested` (invalid) to `view.customContextMenuRequested` with `Qt.CustomContextMenu` policy. `_on_context_menu` gathers `page.contextMenuData()` → emits `webBrowserActions.contextMenu` |
| Download lifecycle | `pauseDownload`/`resumeDownload`/`cancelDownload` already implemented via stored `QWebEngineDownloadRequest` handles |
| Permission prompts | `featurePermissionRequested` signal connected in `_connect_page_signals`. Maps Qt Feature enums to permission strings. Checks stored rules first (auto-grant/deny). Falls back to `permissionPrompt` signal → JS prompt. `resolvePrompt()` grants/denies and optionally persists decision |
| Userscript injection | `_inject_userscripts()` in WebTabManagerBridge, called on `loadFinished`. Queries `WebUserscriptsBridge.get_matching_scripts()`, runs via `page.runJavaScript()`, updates injection stats |

### Phase 6 (Optional) — Native Qt UI
- Incremental replacement of HTML/CSS UI with native Qt widgets

## Dependencies (pip)
```
PySide6>=6.7
python-mpv
edge-tts
rarfile
libtorrent
```
