# Tankoban Max — Project Guide for Claude

## What is this?

Tankoban Max extends Tankoban Pro with a **Books mode** (EPUB/PDF/TXT reader with TTS).
This tree lives at `projects/Tankoban Max` in the Tankoban Pro Electron monorepo.
The Pro base provides Comics and Video modes; Max adds Books while keeping those stable.

## Architecture

Same four-layer architecture as Pro (see parent `../../CLAUDE.md`):

```
Renderer (src/)  →  Preload (preload/)  →  Main Process (main/)  →  Workers (workers/)
```

Books mode adds:

- **Books domains (main):** `main/domains/books/`, `main/domains/booksTtsEdge/`, `main/domains/booksAnnotations/`, `main/domains/booksBookmarks/`, `main/domains/booksProgress/`, `main/domains/booksSettings/`, `main/domains/booksUi/`
- **Reader modules (renderer):** `src/domains/books/reader/` — 21 modules covering rendering engines, TTS, annotations, navigation, search, appearance
- **Foliate vendor (renderer):** `src/vendor/foliate/` — vendored from foliate-js (MIT license, see `THIRD_PARTY_NOTICES.md`)

## TTS Pipeline

```
reader_tts_ui.js  →  tts_core.js  →  tts_engine_edge.js  →  [IPC]  →  booksTtsEdge/index.js
                          |                                                    |
                          |                                               msedge-tts (npm)
                          +→  tts_engine_webspeech.js  (fallback)
                          |
                     foliate/tts.js  (text extraction + SSML + word marks)
```

- `tts_core.js` (`window.booksTTS`): State machine orchestrator. States: idle / playing / paused.
- `tts_engine_edge.js`: Edge neural TTS engine using HTMLAudioElement for playback.
- `tts_engine_webspeech.js`: Web Speech API fallback engine.
- `main/domains/booksTtsEdge/index.js`: Main process bridge using `msedge-tts` npm package.
- `src/vendor/foliate/tts.js`: Text extraction from EPUB DOM. Produces SSML with `<mark>` elements.
- `reader_tts_ui.js`: UI controls (play/pause bar, voice picker, speed presets, highlight styles).

## Key file paths

### Reader core
- `src/domains/books/reader/reader_core.js` — Reader lifecycle, book loading
- `src/domains/books/reader/reader_state.js` — Shared reader state
- `src/domains/books/reader/engine_foliate.js` — Foliate view engine (EPUB rendering)
- `src/domains/books/reader/engine_pdf.js` — PDF rendering engine
- `src/domains/books/reader/engine_txt.js` — Plain text rendering engine

### IPC
- `shared/ipc.js` — Channel constants (single source of truth)
- `preload/index.js` — `Tanko.api.*` namespace exposed via contextBridge
- `main/ipc/index.js` — The only file where `ipcMain.handle`/`on` may be called

### Books data files (in userData)
- `books_library.json` — Books library index
- `books_progress.json` — Per-book reading progress
- `books_annotations.json` — Annotations/highlights
- `books_bookmarks.json` — Bookmarks
- `books_settings.json` — Per-book reader settings

## Commands

From this directory (`projects/Tankoban Max/`):
- `npm start` — Run in dev mode
- `npm run dist` — Build installer + portable
- `npm run smoke` — Smoke checks

## Scope rules

- Max changes are **additive**: Comics and Video behavior must stay stable
- Books persistence uses isolated `books_*` stores
- See `MAX_SCOPE.md` for the full scope contract

## Code style

- Minimal diffs; match existing style
- Renderer IIFE modules use `var` (not `let`/`const`) for consistency with existing code
- Every new feature/fix gets a tag (e.g. `FIX-TTS02`, `BUILD_OVERHAUL`) in comments for traceability
- Extensive try/catch — failures should degrade gracefully, never crash
- TTS engines expose a standard interface: `speak`, `pause`, `resume`, `cancel`, `isSpeaking`, `isPaused`, `onEnd`, `onBoundary`, `onError`
- Domain ctx object: `{ APP_ROOT, win, storage, CHANNEL, EVENT }` passed to all main-process domain handlers

## Don't

- Don't add docstrings/comments/type annotations to code you didn't change
- Don't refactor surrounding code when fixing a bug
- Don't create new files unless absolutely necessary
- Don't modify `shared/ipc.js` without updating both main and preload
- Don't use interactive git flags (`-i`)
- Don't skip pre-commit hooks (`--no-verify`)

## Git workflow

- Commit all changes before ending a session — don't leave uncommitted work
- Use descriptive commit messages with the fix/feature tag (e.g. `FIX-TTS03: ...`)
- Group related changes into a single commit per fix/feature round
- Push to remote after committing so work is backed up. If push fails, remind the user.
- Vendor file patches (e.g. `paginator.js`) must be documented in `THIRD_PARTY_NOTICES.md`

## Existing docs

- `CLAUDE.md` — This file (project guide for Claude)
- `MAX_SCOPE.md` — Scope contract (Max is additive to Pro)
- `THIRD_PARTY_NOTICES.md` — Third-party licenses
- `docs/08_TESTING_AND_SMOKE.md` — Testing guide
- `docs/books_reader_comic_parity_contract.md` — Feature parity contract
- `docs/archive/` — Historical docs, completed plans, audits (reference only)
