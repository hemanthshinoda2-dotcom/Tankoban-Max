# Tankoban Max — Claude Guide

Electron desktop app: Comics, Video, and Books modes. This guide covers Books mode (EPUB/PDF/TXT reader + TTS).

## Communicating with Hemanth
Hemanth is the project owner, not a programmer. When explaining changes or asking questions:
- Talk in terms of **what the user sees in the app** — buttons, screens, behaviors — not internal code details
- Avoid jargon dumps; if a technical term is needed, explain it briefly in plain language
- Hemanth is capable of learning — don't oversimplify, just explain clearly
- When presenting options, frame them as "what will happen in the app" rather than "which code pattern to use"

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
- `engine_epub.js` — EPUB rendering (epub.js)
- `engine_foliate.js` — EPUB rendering (foliate-js)
- `engine_pdf.js` — PDF rendering
- `engine_txt.js` — Plain text rendering

### TTS
```
listening_player.js (TTS player UI, replaces old reader_tts_ui.js)
listening_shell.js  (reading/listening mode toggle)
tts_core.js → tts_engine_edge.js → [IPC] → booksTtsEdge/index.js (msedge-tts)
              vendor/foliate/tts.js (text extraction + SSML)
```

### Main Process Domains (`main/domains/`)
Books: books/, booksTtsEdge/, booksTtsProgress/, booksAnnotations/, booksBookmarks/, booksProgress/, booksSettings/, booksUi/
Other: archives/, clipboard/, comic/, export/, files/, library/, player_core/, progress/, seriesSettings/, shell/, thumbs/, video/, videoProgress/, videoSettings/, videoUi/, webSources/, webTabs/, window/

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

## Testing (MANDATORY)
After making changes, you MUST test by launching the app for Hemanth to verify:
1. Run `unset ELECTRON_RUN_AS_NODE && npm start 2>&1` as a **background task** (captures all output to a log file)
2. Tell Hemanth what to check in the app and wait for their feedback
3. After Hemanth closes the app, read the log file to check for errors or warnings
Never skip this step. Never assume changes work without Hemanth visually confirming.

## Commands
`npm start` — dev | `npm run dist` — build | `npm run smoke` — checks
