# Tankoban Max — Code Map

Navigation document for AI assistants. Start here each session.

---

## File Index (files > 200 lines)

### Renderer — `src/domains/`

| File | Lines | Purpose |
|------|-------|---------|
| `video/video.js` | 9,735 | Video library UI + player launch (IIFE, 21 sections) |
| `books/library.js` | 4,116 | Books library renderer (IIFE, 19 sections) |
| `shell/core.js` | 2,729 | Shell UI, comic library state, reader settings (global scope, 13 sections) |
| `web/web.js` | 2,218 | Integrated browser (IIFE, lazy-loaded) |
| `books/listening_player.js` | 1,807 | TTS listening player overlay |
| `library/library.js` | 1,536 | Comic library rendering |
| `reader/state_machine.js` | 1,508 | Comic reader state machine |
| `reader/mega_settings.js` | 1,424 | Comic reader mega settings panel |
| `reader/render_two_page.js` | 1,414 | Two-page comic rendering |
| `books/reader/engine_foliate.js` | 1,386 | Foliate EPUB/MOBI/FB2 engine |
| `books/reader/tts_engine_edge_direct.js` | 1,396 | Edge TTS direct synthesis |
| `reader/volume_nav_overlay.js` | 1,260 | Volume navigator + global search overlay |
| `reader/input_pointer.js` | 1,115 | Comic reader mouse/touch input |
| `books/reader/tts_engine_edge.js` | 944 | Edge TTS via main process bridge |
| `books/reader/tts_core.js` | 2,167 | TTS playback orchestration |
| `books/reader/reader_core.js` | 889 | Books reader core (open, render, lifecycle) |
| `books/reader/reader_nav.js` | 660 | Reader navigation (page turns, chapters) |
| `books/reader/reader_appearance.js` | 640 | Reader themes, fonts, layout |
| `books/reader/reader_paragraph.js` | 605 | Paragraph-mode rendering |
| `books/reader/reader_annotations.js` | 566 | Highlights and annotations |
| `books/reader/reader_dict.js` | 544 | Dictionary lookup popup |
| `books/reader/engine_epub.js` | 539 | EPUB engine (epub.js) |
| `reader/input_keyboard.js` | 541 | Comic reader keyboard input |
| `books/reader/reader_search.js` | 526 | Full-text search in reader |
| `books/reader/reader_state.js` | 522 | Reader state management |
| `books/reader/reader_ruler.js` | 492 | Reading ruler overlay |
| `reader/open.js` | 452 | Comic open/load pipeline |
| `books/reader/reader_keyboard.js` | 379 | Books reader keyboard shortcuts |
| `books/reader/engine_pdf.js` | 323 | PDF engine (pdf.js) |
| `books/reader/reader_toc.js` | 306 | Table of contents panel |
| `reader/render_portrait.js` | 274 | Single-page comic rendering |
| `books/reader/engine_txt.js` | 287 | Plain text engine |
| `reader/hud_core.js` | 264 | Comic reader HUD core |
| `books/listening_shell.js` | 244 | Listening player shell builder |
| `books/reader/reader_bookmarks.js` | 224 | Bookmark management |
| `reader/bitmaps.js` | 210 | Bitmap/image utilities |
| `shell/shell_bindings.js` | 467 | Shell event bindings |

### State & Services — `src/`

| File | Lines | Purpose |
|------|-------|---------|
| `services/api_gateway.js` | 442 | Maps `electronAPI` to `Tanko.api.*` namespaces |
| `state/deferred_modules.js` | 268 | Lazy-loading orchestration for all domains |
| `state/reader.js` | 247 | Reader state persistence |
| `state/mode_router.js` | 207 | Mode switching (comics/books/video) |

### CSS — `src/styles/`

| File | Lines | Owns |
|------|-------|------|
| `styles.css` | 4,264 | Global layout, comic reader, video player (24 sections) |
| `books-reader.css` | 2,764 | Books reader, listening player, TTS |
| `overhaul.css` | 1,441 | Noir theme override layer |
| `web-browser.css` | 859 | Web browser UI |
| `video-library-match.css` | 590 | Video-specific library styling |
| `ui-bridge.css` | 157 | Shoelace integration |
| `ui-tokens.css` | 19 | Design tokens |

### Main Process — `main/`

| File | Lines | Purpose |
|------|-------|---------|
| `ipc/index.js` | 1,238 | IPC registry hub, ctx creation, window lifecycle |
| `domains/video/index.js` | 1,595 | Video library scan, episodes, show management |
| `domains/player_core/index.js` | 1,221 | Player Core (Qt launcher, state machine) |
| `domains/webSources/index.js` | 945 | Web sources, downloads, history |
| `domains/library/index.js` | 677 | Comic library scan, folder management |
| `domains/books/index.js` | 660 | Books library scan, file management |
| `domains/booksTtsEdge/index.js` | 556 | Edge TTS main-process bridge |
| `domains/archives/index.js` | 439 | CBZ/CBR archive reading |
| `domains/window/index.js` | 379 | Window creation, fullscreen, always-on-top |
| `domains/thumbs/index.js` | 314 | Thumbnail generation and caching |
| `domains/webTabs/index.js` | 283 | WebContentsView tab management |
| `domains/booksProgress/index.js` | 179 | Books progress persistence |
| `domains/booksOpds/index.js` | 156 | OPDS feed management |
| `lib/storage.js` | 151 | Atomic JSON writes (temp + rename) |

### IPC Contract

| File | Lines | Purpose |
|------|-------|---------|
| `shared/ipc.js` | 874 | Channel + Event constants (single source of truth) |
| `preload/index.js` | 1,139 | Preload API bridge (32 namespaces + legacy aliases) |
| `main/ipc/register/*.js` | 564 (30 files) | Domain-specific handler registration |

### Tools

| File | Lines | Purpose |
|------|-------|---------|
| `tools/smoke_check.js` | 427 | Build-time validation + IPC sync |
| `tools/ipc_sync_check.js` | 301 | IPC channel/event cross-reference validator |
| `tools/books_phase8_verify.js` | 231 | Books reader module verification |

---

## IPC Namespace Map

Each `Tanko.api.*` namespace maps to: preload line range, shared/ipc.js domain, and main handler.

| Namespace | Preload Lines | IPC Domain | Main Handler |
|-----------|--------------|------------|--------------|
| `api.window` | 26–54 | Window | register/window.js |
| `api.shell` | 59–63 | Shell | register/shell.js |
| `api.library` | 68–113 | Library | register/library.js |
| `api.books` | 118–143 | Books | register/books.js |
| `api.booksTtsEdge` | 148–156 | Books Edge TTS | register/books_tts_edge.js |
| `api.video` | 161–216 | Video | register/video.js |
| `api.thumbs` | 221–238 | Thumbnails + Pages | register/page_thumbnails.js |
| `api.archives` | 243–259 | CBR + CBZ | register/archives.js |
| `api.export` | 264–269 | Export | register/export.js |
| `api.files` | 274–277 | File Access | register/files.js |
| `api.clipboard` | 282–285 | Clipboard | (inline in ipc/index.js) |
| `api.progress` | 290–301 | Comic Progress | register/progress.js |
| `api.booksProgress` | 306–312 | Books Progress | register/books_progress.js |
| `api.booksTtsProgress` | 317–322 | Books TTS Progress | register/books_tts_progress.js |
| `api.videoProgress` | 327–342 | Video Progress | register/video_progress.js |
| `api.videoSettings` | 347–354 | Video Settings | register/video_settings.js |
| `api.booksBookmarks` | 359–364 | Books Bookmarks | register/books_bookmarks.js |
| `api.booksAnnotations` | 369–374 | Books Annotations | register/books_annotations.js |
| `api.booksDisplayNames` | 379–383 | Books Display Names | register/books_display_names.js |
| `api.videoDisplayNames` | 388–392 | Video Display Names | register/video_display_names.js |
| `api.booksSettings` | 397–401 | Books Settings | register/books_settings.js |
| `api.videoUi` | 406–413 | Video UI State | register/video_ui_state.js |
| `api.booksOpds` | 419–431 | Books OPDS | register/books_opds.js |
| `api.webSources` | 432–471 | Web Sources + Downloads | register/web_sources.js |
| `api.webTabs` | 476–501 | Web Tabs | register/web_tabs.js |
| `api.booksUi` | 506–510 | Books UI State | register/books_ui_state.js |
| `api.videoPoster` | 515–526 | Video Posters | register/video_posters.js |
| `api.seriesSettings` | 531–538 | Series Settings | register/series_settings.js |
| `api.player` | 545–602 | Player Core | register/player_core.js |
| `api.build14` | 607–632 | BUILD14 State | register/player_core.js |
| `api.mpv` | 637–739 | mpv | (no handler — dead code) |
| `api.libmpv` | 744–937 | libmpv | (no handler — dead code) |

---

## CSS Ownership Map

### styles.css — Section markers (search `══════ SECTION:`)
Global Setup & Fullscreen, CSS Variables & Tokens, Base Layout & Library Shell, Scrollbar Styling, Series View & Topbar, Sidebar Nav & Folder Tree, Global Search, Shared UI Primitives, Continue Reading Shelf, Series Grid & Cards, Volumes & Episode Table, Library Overlays, Comic Reader (Player Bar, Footer, Scrub, Timeline), Toast & Context Menu, End of Volume & Mega Settings, Loading & Debug Overlays, Mode Menu & Loupe, Video Mode (Library, Player Shell, HUD, Timeline, Context Menu, Tracks), Video & Books Continue Panels, Volume OSD

### books-reader.css — Section markers (search `BUILD_OVERHAUL:`, `LISTEN_P`)
Listening Player (tabs, shell, themes, reading card, TTS bar), Reader Shell & Themes, Toolbar, Main Area & Sidebar, Settings & Swatches, Reading Area & Ruler, Footer & Scrub, HUD Visibility, Responsive & Fullscreen, Shortcuts & Utilities, Status/Toast/Bookmarks/Dictionary, TTS Bar & Diagnostics, Annotations, Floating Overlays, Theme-Aware Overlays, Chapter-Aware Reading

### Other CSS files
- `overhaul.css` — Noir theme overrides (loads after styles.css, wins at equal specificity)
- `web-browser.css` — Browser tab bar, address bar, navigation
- `video-library-match.css` — Video-specific library styling
- `ui-tokens.css` / `ui-bridge.css` — Design token system

---

## Global State Registry

```
window.Tanko                — App namespace (created by bootstrap.js)
window.Tanko.api            — IPC gateway (set by api_gateway.js from electronAPI)
window.Tanko.deferred       — Deferred loaders (ensureVideoModulesLoaded, etc.)
window.Tanko.bootTiming     — Performance timing data
window.Tanko.web            — Web browser module (lazy)
window.Tanko.state.app      — appState (comics library + settings)
window.Tanko.state.library  — appState.library
window.Tanko.state.settings — appState.settings

window.openBook(book)       — Opens a comic in the reader (replaced by deferred loader)
window.setMode(mode)        — Switches between comics/books/video
window.refreshLibrary()     — Triggers comic library refresh
window.el                   — Shell DOM refs (from core.js)

Guard flags:
  window.__tankoVideoModulesLoaded   — Video modules loaded
  window.__tankoReaderModulesLoaded  — Reader modules loaded
  window.__tankoBooksModulesLoaded   — Books modules loaded
  window.__tankoWebModulesLoaded     — Web modules loaded
  window.__tankoBooksLibraryBound    — Books library IIFE ran

el objects (4 separate scopes):
  Shell el   — src/domains/shell/core.js (global scope, exported to window.el)
  Books el   — src/domains/books/library.js (IIFE scope, not exported)
  Video el   — src/domains/video/video.js (IIFE scope, not exported)
  Web el     — src/domains/web/web.js (IIFE scope, not exported)
```

---

## Dependency Graph — Load Order

### Always loaded (via index.html `<script>` tags)
```
shoelace_boot.js → icons.js → control_adapters.js
→ api_gateway.js → health/monitor.js
→ bootstrap.js → mode_router.js → deferred_modules.js
→ shell/core.js → library/library.js → state/reader.js
→ shell/shell_bindings.js → ui/command_palette.js
```

### On-demand — Video (`ensureVideoModulesLoaded()`)
```
video_utils.js → build14_state.js → video.js  (sequential)
```

### On-demand — Reader (`ensureReaderModulesLoaded()`)
```
open.js → bitmaps.js → render_portrait.js → render_two_page.js
→ render_core.js → state_machine.js → hud_core.js → mega_settings.js
→ volume_nav_overlay.js → input_pointer.js → input_keyboard.js → boot.js
(12 files, strict sequential)
```

### On-demand — Books (`ensureBooksModulesLoaded()`)
```
Group 1 (parallel): engine_epub, engine_pdf, engine_foliate, engine_txt,
                     tts_engine_edge, tts_engine_edge_direct, reader_bus
Group 2 (parallel): reader_state, tts_core
Group 3 (parallel): reader_appearance, reader_dict, reader_search,
                     reader_bookmarks, reader_annotations, reader_toc,
                     reader_nav, reader_paragraph, reader_sidebar,
                     reader_ruler, reader_overlays, reader_keyboard
Then sequential: reader_core → library.js → listening_player.js
```

### On-demand — Web (`ensureWebModulesLoaded()`)
```
web.js  (single file)
```

---

## How to Find X

| Looking for... | Where to search |
|---------------|----------------|
| Button click handler | Element ID in `index.html` → grep that ID in renderer JS |
| IPC channel for a feature | `preload/index.js` — find the api namespace method |
| CSS for a component | Class name across `src/styles/*.css` |
| Domain handler logic | `main/domains/<domain>/index.js` |
| Data persistence | `main/domains/*/index.js` → look for `storage.*` calls |
| Mode switching | `src/state/mode_router.js` + `deferred_modules.js` |
| Adding a new IPC channel | Update all 3: `shared/ipc.js`, `preload/index.js`, `main/ipc/register/*.js` |
| Section in a mega-file | `grep "══════ SECTION:" <file>` |
| Bug tracing | Renderer DevTools → `Tanko.api.*` call → preload bridge → main handler |

---

## Validation Tools

- `npm run smoke` — Full smoke check (baseline + IPC sync + trace markers + load order)
- `npm run ipc:check` — IPC channel/event cross-reference validator
- `npm run doctor` — Environment diagnostics
- `npm run map` — Repo map generator
