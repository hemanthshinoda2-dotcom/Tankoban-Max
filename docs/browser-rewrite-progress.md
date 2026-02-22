# Browser Rewrite & WebTorrent Integration — Progress Report

**Date**: 2026-02-23
**Branch**: master
**Last commit**: `c1391f1` — FEAT-BROWSER-S1: Chrome-layout rewrite + theme-adaptive CSS + download fix

---

## What We Did (Session 1 — COMPLETE)

### 1. Chrome-Style Browser Layout Rewrite

Restructured the entire browser UI from a messy 9-element vertical stack to Chrome's clean 2-row layout.

**Before**: Tab bar was at position 6 (below URL bar), no visual hierarchy, Unicode characters for buttons.

**After**:
- **Row 1 — Tab strip**: `< Library` button | Chrome-style tabs (rounded top corners, accent underline on active, close button on hover) | `+ New Tab` | window controls
- **Row 2 — Nav bar**: Back | Forward | Reload | Home | [ pill-shaped Omnibox ] | Bookmark | Find | Downloads | Kebab menu (three dots)
- **Below**: Thin 2px accent-color load bar → Content area → Download shelf

**Files changed**:
- `src/index.html` (lines 1776-1879) — Complete HTML restructure
- `src/styles/web-browser.css` — Full CSS rewrite (~1,163 lines)
- `src/domains/web/web.js` — Kebab menu handler, tab close button encoding fix
- `src/styles/overhaul.css` — Hub panel styles
- `src/domains/shell/shell_bindings.js` — Hub toggle binding

### 2. Theme-Adaptive CSS

Converted ALL hardcoded `rgba(255,255,255,X)` to `rgba(var(--chrome-rgb),X)` throughout `web-browser.css`. The browser now works correctly across all 6 themes: Default Dark, Light, Nord, Solarized, Gruvbox, Catppuccin.

### 3. Kebab Menu (Three-Dot Menu)

Added Chrome-style three-dot menu at far right of nav bar with items:
- New tab
- History (opens hub panel, scrolls to history section)
- Downloads
- Bookmarks
- Split view (moved from nav bar — no longer a prominent button)
- Find in page
- Keyboard shortcuts
- Hub panel

### 4. Download Fix — No More Double Path Picker

**Bug**: Clicking a download link opened BOTH the native Windows Save As dialog AND Tankoban's in-app destination picker, because `item.setSavePath()` wasn't called synchronously in Electron's `will-download` handler.

**Fix**: Set a temporary save path synchronously (to `web_download_tmp/`) to suppress the native dialog. When the in-app picker resolves, the file is moved from temp to the user's chosen destination via `fs.renameSync()` (with `fs.copyFileSync()` fallback for cross-drive moves).

**File**: `main/domains/webSources/index.js` (lines 617-845)

### 5. Removed "Downloading..." Pill

The `webDlPill` element (showed "Downloading..." text next to the download button) was removed. Chrome doesn't show this — the badge dot on the download button is sufficient.

### 6. Tab Close Button Encoding Fix

The `×` character in tab close buttons was rendering as `Ã` (UTF-8/Latin-1 encoding mismatch). Fixed by using the HTML entity `&times;` instead.

### 7. .torrent File Handler Fix

Applied the same synchronous `setSavePath()` fix to the `.torrent` file download handler (lines 534-619) so downloading a .torrent file from a website won't show the native Save As dialog.

---

## What's Left To Do

### Session 2 — Browser Content Polish (Original Plan)

Polish everything below the nav bar to look professional:

- **Home page tiles**: Chrome new-tab-page aesthetic — larger grid, favicon in rounded square, site name below, hover lift
- **Source cards**: Consistent with home tiles, larger favicons
- **Continue browsing row**: Tab preview cards with horizontal scroll
- **Download panel**: Anchored to download button, glass/blur background
- **Download bar**: Chrome shelf style, compact
- **Transitions**: Subtle hover lifts, 120ms transitions

**Files**: `src/styles/web-browser.css`, `src/domains/web/web.js` (render functions), `src/styles/theme-light.css`

### Session 3 — WebTorrent Desktop Integration (NEW — 3 sub-sessions)

Full torrent client UI inside the browser, inspired by WebTorrent Desktop (MIT license).

#### Sub-Session 3A: Backend — File List + Per-File Selection + Fix Crash

The existing `main/domains/webTorrent/` backend downloads ALL files in a torrent to a single folder with no per-file selection. The renderer never sees the file list.

**TODO**:
1. **Expose `torrent.files` to renderer** — Send file array (path, name, length, progress) in `WEB_TORRENT_STARTED` and `WEB_TORRENT_PROGRESS` events
2. **Handle magnet metadata delay** — Magnet links need to download metadata before file list is available. Add `WEB_TORRENT_METADATA` event that fires when metadata resolves
3. **Per-file selection IPC** — Add `WEB_TORRENT_SELECT_FILES` channel. Calls `torrent.files[i].deselect()` for unchecked files
4. **Fix segfault** — App crashed after 3 `web_torrent_history.json` writes. Likely native UTP module issue with Electron 40's Node v24. Try `{ utp: false }` in WebTorrent client options
5. **Streaming pipe** — Add `WEB_TORRENT_STREAM_FILE` channel. Pipes torrent file data to a destination path in the video library. Emits `WEB_TORRENT_STREAM_READY` when enough data is buffered for playback

**Files**: `main/domains/webTorrent/index.js`, `shared/ipc.js`, `preload/namespaces/web.js`, `main/ipc/register/web_torrent.js`

#### Sub-Session 3B: Torrent Tab UI — File Tree + Progress + Controls

A new browser tab type (`type: 'torrent'`) that renders custom DOM instead of a webview. Uses the same pattern as the home panel (toggle siblings with `hidden` class).

**Tab layout**:
```
┌─────────────────────────────────────────────────────┐
│ Torrent Name                              [Pause] [X]│
│ 1.2 GB total • 45 peers • 2.3 MB/s ↓               │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░ 52%                   │
├─────────────────────────────────────────────────────┤
│ ☑ 📁 Movie Name/                          1.1 GB    │
│   ☑ 🎬 Movie.Name.2024.mkv      [▶ Play] 1.0 GB    │
│   ☑ 📄 Movie.Name.srt                     45 KB     │
│   ☐ 📄 Sample.mkv                        120 MB     │
├─────────────────────────────────────────────────────┤
│ Save to: [D:\Videos\Movies      ▾]  [Start Download]│
└─────────────────────────────────────────────────────┘
```

**TODO**:
1. **Extend tab system** — Add `tab.type` ('web'|'torrent'), `tab.torrentId`, `tab.customEl` fields
2. **Modify `showSingle()`** — If torrent tab, hide webviews, show custom DOM
3. **Modify `closeTab()`** — Clean up torrent tab DOM
4. **Create `createTorrentTab()`** — Builds DOM, appends to content area, activates tab
5. **Rewrite magnet interception** — `maybeStartTorrentFromUrl()` now opens a torrent tab instead of immediately showing the folder picker
6. **File tree component** — Recursive folder/file DOM with checkboxes, icons (video/text/image), sizes, per-file progress bars
7. **CSS** — Theme-adaptive styles using `rgba(var(--chrome-rgb),...)`

**Files**: `src/domains/web/web.js`, `src/styles/web-browser.css`, `src/index.html` (minimal)

#### Sub-Session 3C: Streaming Playback + Library Integration

**TODO**:
1. **"Play" button on video files** in torrent tab:
   - Determines destination: `{videoLibraryRoot}/{torrentName}/{filename}`
   - Calls `api.webTorrent.streamFile()` to start piping data to destination
   - When `WEB_TORRENT_STREAM_READY` fires (enough data buffered), launches mpv
   - mpv plays the partially-downloaded file (it handles this natively)
   - File continues downloading in background
2. **Library integration** — After torrent completes, trigger appropriate library rescan (books/comics/videos)
3. **Hub panel simplification** — Keep magnet paste input, show compact active torrent list with "Open Tab" button, remove full controls (they're in the torrent tab now)

**Files**: `main/domains/webTorrent/index.js`, `src/domains/web/web.js`, video player integration

### Session 4 — Code Split (Optional)

Split `web.js` (~4,500 lines) into logical modules using the bridge pattern (`window.__tankoWebShared`). Seven files: `web.js` (entry), `web_tabs.js`, `web_nav.js`, `web_downloads.js`, `web_hub.js`, `web_home.js`, `web_sources.js`.

---

## Current File State

### Modified (committed in `c1391f1`):
| File | Lines | What changed |
|------|-------|-------------|
| `src/index.html` | 1776-1879 | Browser HTML restructured (tab strip + nav bar + content area) |
| `src/styles/web-browser.css` | ~1,163 | Full CSS rewrite, theme-adaptive |
| `src/domains/web/web.js` | ~4,500 | Kebab menu, download indicator removal, tab close encoding fix |
| `src/styles/overhaul.css` | +143 lines | Hub panel styles |
| `src/domains/shell/shell_bindings.js` | +2 lines | Hub toggle binding |
| `main/domains/webSources/index.js` | lines 534-845 | Download fix (sync setSavePath + temp-to-dest move), .torrent handler fix |

### Uncommitted (working tree):
| File | What changed |
|------|-------------|
| `main/domains/webSources/index.js` | .torrent handler fix (sync setSavePath) — needs commit |
| `player_hg/*` | Pre-existing Holy Grail player changes (unrelated) |

---

## Architecture Notes

### Browser Tab Types (After Session 3B)
```
tab.type = 'web'      → Standard webview tab (current behavior)
tab.type = 'torrent'  → Custom DOM tab (torrent client UI)
```

### Torrent Flow (After Session 3)
```
Magnet link clicked
  → createTorrentTab()
  → api.webTorrent.startMagnet()
  → WEB_TORRENT_METADATA event → render file tree
  → User selects files + picks destination
  → api.webTorrent.selectFiles()
  → Download progresses (800ms progress events)
  → User clicks "Play" on video
  → api.webTorrent.streamFile() → pipes to library path
  → WEB_TORRENT_STREAM_READY → launch mpv
  → Torrent completes → library rescan → file in library
```

### IPC Channels (New for Session 3)
```
WEB_TORRENT_SELECT_FILES    — { id, selectedIndices: [0, 2, 5] }
WEB_TORRENT_STREAM_FILE     — { id, fileIndex, destinationPath }
WEB_TORRENT_METADATA        — event: file list available
WEB_TORRENT_STREAM_READY    — event: enough data buffered for playback
```

### Known Issues
- **Segfault**: WebTorrent native UTP module may be incompatible with Electron 40's Node v24. Needs investigation; try `{ utp: false }` option.
- **Download progress IPC**: `WEB_DOWNLOAD_PROGRESS` events don't reach renderer (pre-existing bug, noted in MEMORY.md). Not blocking since the download panel still shows completion.

---

## End Goal

A browser that doubles as a full media acquisition tool:
- Browse sources → download books/comics directly (working now)
- Click magnet/torrent links → torrent tab opens with file tree, selective download, progress tracking
- Play video torrents mid-download with full library integration
- All theme-adaptive, all fitting the Chrome-style layout
