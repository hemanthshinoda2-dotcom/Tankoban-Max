# Web Browser Plan - "Media Acquisition Hub"

## Vision
Replace the current scattered Sources panels and WebContentsView browser with a single **in-app browser** accessed via a "Web" button. Not a general-purpose browser - a purpose-built **media acquisition hub** with Opera GX-style tiles and integrated downloading (direct + torrent).

## Core Components

### 1. Opera GX Tile Home Page
- Home/new-tab page shows speed dial tiles for all sources
- Tiles cover **all modes**: comics, books, AND video (extending web sources to video)
- Click a tile -> browse that site in-app
- Settings to add/remove/reorder tiles

### 2. Browser (Search + URL Bar)
- Uses `<webview>` tag (NOT WebContentsView)
  - `<webview>` is a DOM element - no native overlay conflicts
  - Can z-index DOM elements on top of it (download bar, tiles, etc.)
  - WebContentsView renders on a native layer above DOM - that's the one we've been fighting
- Visible omnibox (search + URL bar)
  - If input looks like a URL, navigate to it
  - Otherwise, search via Yandex (default)
- Settings: choose default search engine (default Yandex), optional auto-hide/minimal mode

### 3. Browsing History
- Full history tracking - every page visited is logged with URL, title, and timestamp
- History panel/page accessible from the browser UI
- Search through history
- Clear history (all / by date range / individual entries)
- History persisted via main process storage (same pattern as other app data)

### 4. Integrated Downloader (Direct Downloads)
- Intercept downloads from `<webview>`
- Download progress panel (regular DOM, overlaid on browser)
- **In-app destination picker per download** (no automatic extension routing)
  - Picker UI is part of Tankoban and matches app styling
  - Picker is restricted to Books/Comics/Videos roots and their subfolders only
  - User can switch modes, choose a root, navigate subfolders, and save to the selected folder
- Strong emphasis on download UX - this is a first-class feature

### 5. WebTorrent Client
- `webtorrent` npm package - full TCP/UDP BitTorrent support in Node.js
- Runs in main process or worker thread (doesn't block UI)
- Intercept magnet links and `.torrent` files from `<webview>` automatically
- Handles: magnet URIs, .torrent files, DHT, peer exchange
- Download progress shown alongside direct downloads in the same panel
- **In-app destination picker when starting each torrent**
  - Same restricted picker (Books/Comics/Videos roots + subfolders only)
  - Save all torrent files under the selected folder
  - Trigger library rescan for affected mode(s)

### 6. Video Web Sources (NEW)
- Extend the web source concept (currently books only) to video mode
- Video tiles on the home page alongside comic/book sources

## What Gets Removed
- Books web sources panel (books_web_sources.js) -> replaced by browser tiles
- Any other scattered source UI -> consolidated into browser tiles
- Current WebContentsView browser -> replaced by `<webview>` browser

## Architecture

```
Renderer (browser UI)
|-- Tile grid (regular DOM)
|-- Search/URL bar (regular DOM)
|-- <webview> tag (actual browsing - DOM element, not native overlay)
|-- Download progress panel (regular DOM)
`-- IPC to main process
     |-- Direct download handling
     |-- WebTorrent client (main process or worker)
     `-- Library file placement
```

## Key Technical Decisions
- **`<webview>` over WebContentsView**: `<webview>` is a DOM element - tiles, download bar, progress panel all coexist as regular DOM. No zero-bounds hacks. Electron discourages `<webview>` but it's functional in Electron 40 and the DOM integration advantage is critical.
- **WebTorrent in main/worker**: Keep torrent logic out of the renderer. Communicate progress via IPC.
- **Constrained in-app picker**: Custom Tankoban destination modal limited to the three library modes and their subfolders.
- **Search engine**: Omnibox defaults to Yandex; allow changing it in settings.

## Future: Torrent Streaming via Tankoban Player ("Stremio Mode")
- **Tankoban Max** handles discovery, library management, and torrent downloads
- **Tankoban Player** (PyQt) adds torrent streaming - play video while it downloads
- **Tankoban Max video mode** becomes the unified view: local files + streamed torrents in one library
  - Same progress tracking, same watch history, same UI regardless of source
  - Torrent streams tracked alongside local files in video progress/data
- Essentially building a self-hosted Stremio across the two apps:
  - Max = content discovery + library + torrent management
  - Player = playback + live streaming

## Estimated Scope
Browser + downloader + WebTorrent: ~5-8 sessions.
Torrent streaming via Player: future phase, separate scope.

## Status
Planning phase. No implementation started.
