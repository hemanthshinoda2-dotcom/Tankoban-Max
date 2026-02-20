# Tankoban Max — Claude Guide

Electron desktop app: Comics, Video, and Books modes. This guide covers Books mode (EPUB/PDF/TXT reader + TTS).

## Architecture

```
Renderer (src/) → Preload (preload/) → Main (main/) → Workers (workers/)
```

## Key Files

### IPC (touch one, update all three)
- `shared/ipc.js` — Channel constants (single source of truth)
- `preload/index.js` — `Tanko.api.*` namespace via contextBridge
- `main/ipc/index.js` — Only file for `ipcMain.handle`/`on`

### Reader (`src/domains/books/reader/`)
- `reader_core.js` — Lifecycle, book loading
- `reader_state.js` — Shared state, `ensureEls()` DOM cache
- `engine_foliate.js` — EPUB rendering (foliate-js)
- `engine_pdf.js` — PDF rendering
- `engine_txt.js` — Plain text rendering

### TTS
```
reader_tts_ui.js → tts_core.js → tts_engine_edge.js → [IPC] → booksTtsEdge/index.js (msedge-tts)
                                → tts_engine_webspeech.js (fallback)
                   foliate/tts.js (text extraction + SSML)
```

### Main Process Domains (`main/domains/`)
books/, booksTtsEdge/, booksAnnotations/, booksBookmarks/, booksProgress/, booksSettings/, booksUi/

### Storage
- `main/lib/storage.js` — Atomic JSON writes (temp + rename), debounced
- Domain handlers receive ctx: `{ APP_ROOT, win, storage, CHANNEL, EVENT }`

## Data Files (userData)
`books_library.json`, `books_progress.json`, `books_annotations.json`, `books_bookmarks.json`, `books_settings.json`

## Gotchas
- `clearHost()` does `innerHTML = ''` — overlays (dict popup, TTS bar, annotation popup) must be siblings of `br-host`, not children
- EPUB content lives in iframes. Events don't bubble. Use `view.addEventListener('load', ...)` to bind into iframe docs
- `ensureEls()` caches DOM refs; invalidated on reader close. Detached nodes → `getComputedStyle` returns `""`

## Diff Rules (MANDATORY)
Every changed line must be required by the task. When in doubt, change less.
- NEVER: change `var`→`let`/`const`, `function`→arrow, concat→template, `==`→`===`
- NEVER: add comments/docstrings/types to unchanged code
- NEVER: rename vars, add null checks, restructure conditionals
- NEVER: refactor nearby code, extract helpers, remove "unused" code unless asked
- Don't create new files unless absolutely necessary

## Git
Commit and push after every fix. Tag commits (e.g. `FIX-TTS03:`).
Vendor patches → document in `THIRD_PARTY_NOTICES.md`.

## Commands
`npm start` — dev | `npm run dist` — build | `npm run smoke` — checks
