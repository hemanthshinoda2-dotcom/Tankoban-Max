# Tankoban Max — Rules for Claude

## Golden Rule
Do what I say and only what I say. Nothing more, nothing less.

## Workflow — Non-Negotiable

### 1. Commit and push after EVERY change
Every single edit, no matter how small, gets its own commit and push immediately. No batching. No "I'll commit later." Edit → commit → push. Every time.

### 2. Launch the app and let the user verify with live logging
After every fix (before committing), add `console.log` diagnostic lines to the changed code paths, then launch the app (`unset ELECTRON_RUN_AS_NODE && npm start`). Watch the console output while the user clicks through and tests. Only commit and push after confirming the logs show correct behavior. If something looks wrong in the logs, fix it before committing.

### 3. Review your own edits for regressions
Before committing, re-read the diff. Ask yourself: "Did I break something else?" If you changed CSS, check that you didn't make something invisible. If you changed JS, check that you didn't remove a needed event listener. Think like a code reviewer, not just a code writer.

### 4. Think holistically before committing to a plan
Before writing a single line of code, understand how the change fits into the entire app. Read the surrounding code. Understand what depends on what. Don't fix one thing and break three others. A fix that causes new bugs is worse than no fix at all.

### 5. Ask questions until you are absolutely sure
If there is ANY ambiguity in what I'm asking, ask me. Ask me again. Keep asking until you are 100% certain you understand the problem and the desired outcome. Do not guess. Do not assume. Assumptions lead to wasted commits and broken features.

## Architecture

```
Renderer (src/) → Preload (preload/) → Main (main/) → Workers (workers/)
```

### Renderer — `src/`
- `domains/shell/` — App shell, mode switching, global `el` object (`core.js`)
- `domains/library/` — Comic library (scanning, grid, series)
- `domains/reader/` — Comic reader (rendering, HUD, input, state machine)
- `domains/books/` — Books mode (EPUB/PDF/TXT library, reader, TTS listening player)
- `domains/video/` — Video mode (library, playback state)
- `domains/web/` — Integrated browser (`web.js`, lazy-loaded via `ensureWebModulesLoaded()`)
- `styles/` — All CSS (styles.css, books-reader.css, overhaul.css, web-browser.css, etc.)
- `ui/`, `services/`, `state/`, `vendor/` — Shared UI components, services, state, vendored libs

### IPC (touch one, update all three)
- `shared/ipc.js` — Channel constants (single source of truth)
- `preload/index.js` — `Tanko.api.*` namespace via contextBridge
- `main/ipc/index.js` — Only file for `ipcMain.handle`/`on`

### Main Process — `main/`
- `main/domains/` — Domain handlers for all modes:
  - Comics: `comic/`, `archives/`, `library/`, `thumbs/`, `folder_thumbs.js`
  - Books: `books/`, `booksAnnotations/`, `booksBookmarks/`, `booksProgress/`, `booksSettings/`, `booksTtsEdge/`, `booksTtsProgress/`, `booksUi/`
  - Video: `video/`, `videoProgress/`, `videoSettings/`, `videoUi/`, `videoDisplayNames/`
  - Shared: `shell/`, `window/`, `files/`, `clipboard/`, `export/`, `player_core/`, `progress/`, `seriesSettings/`, `webSources/`, `webTabs/`
- `main/lib/storage.js` — Atomic JSON writes (temp + rename), debounced
- Domain handlers receive ctx: `{ APP_ROOT, win, storage, CHANNEL, EVENT }`

### Gotchas
- `clearHost()` does `innerHTML = ''` — overlays must be siblings of `br-host`, not children
- EPUB content lives in iframes. Events don't bubble. Use `view.addEventListener('load', ...)` to bind into iframe docs
- `ensureEls()` caches DOM refs; invalidated on reader close. Detached nodes → `getComputedStyle` returns `""`
- WebContentsViews render natively ON TOP of DOM — must zero bounds to show DOM overlays

## Diff Rules (MANDATORY)
Every changed line must be required by the task. When in doubt, change less.
- NEVER: change `var`→`let`/`const`, `function`→arrow, concat→template, `==`→`===`
- NEVER: add comments/docstrings/types to unchanged code
- NEVER: rename vars, add null checks, restructure conditionals
- NEVER: refactor nearby code, extract helpers, remove "unused" code unless asked
- Don't create new files unless absolutely necessary

## Environment
- Electron `^40.6.0` (Node.js v24.x internally)
- System Node.js: v22.x
- VS Code sets `ELECTRON_RUN_AS_NODE=1` — must `unset ELECTRON_RUN_AS_NODE` before `npm start`

## Git
Commit and push after every fix. Tag commits (e.g. `FIX-TTS03:`).

## Commands
`npm start` — dev | `npm run dist` — build | `npm run smoke` — checks

## Task Discipline
- One task per session unless I explicitly say otherwise
- Don't bundle unrelated fixes into one session
