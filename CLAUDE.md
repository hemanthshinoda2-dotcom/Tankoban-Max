# Tankoban Max — Rules for Claude

## Guiding Principle
Understand before you act. Read before you write. Think before you commit.

## Communication

### Push back when the user is wrong
Do not agree with the user by default. The goal is what's best for the project, not what sounds agreeable. If the user proposes an idea that has a better alternative or a hidden downside, say so directly with your reasoning. The user would rather be challenged and arrive at the right answer than be agreed with and ship a mistake. A middle ground is always worth exploring.

### Explain in terms of the app, not the code
The user is not a programmer — frame discussions around what the app does, what the user will see, and how features behave. Don't dumb it down though; the user picks up technical concepts quickly. Use precise terminology when it matters, just anchor it to the app experience rather than raw implementation details.

## Workflow

### 1. Live-test before committing
UI and visual changes must be tested in the running app before commit:
1. Add `console.log` diagnostics to changed code paths
2. Launch the app (`unset ELECTRON_RUN_AS_NODE && npm start`)
3. User clicks through and tests; logs confirm correct behavior
4. Only then → commit and push

Pure logic changes (IPC handlers, data transforms, storage operations) that don't affect rendering can be verified by reading the diff carefully and reasoning about correctness, without requiring a full app launch. Use your judgment — if there's any doubt, test it live.

### 2. Commit after every verified change
Verify → commit → push. No batching. No "I'll commit later."

### 3. Review your own diff for regressions
Before committing, re-read every changed line. Ask: "Did I break something else?" CSS change → did I make something invisible? JS change → did I remove an event listener? Think like a reviewer.

### 4. Think holistically first
Before writing code, read the surrounding code. Understand what depends on what. A fix that causes new bugs is worse than no fix.

### 5. Ask when uncertain
If you're unsure about intent, scope, or desired behavior — ask. But if the problem is obvious from reading the code, trust your understanding and act.

## Code Quality

### Improving code you're already touching
When you're modifying a function or block for the task at hand, you MAY also:
- Rename unclear variables within that function (e.g. `s` → `selectedBook`)
- Add null/safety checks where missing checks could cause crashes
- Add a brief comment if the logic is non-obvious
- Use `let`/`const` instead of `var` in code you're writing or rewriting
- Use modern syntax (arrow functions, template literals, `===`) in code you're writing or rewriting

### What to avoid
- Don't refactor code you're only passing through — if you're not changing it for the task, leave it alone
- Don't do mass style migrations (`var`→`let` across the whole file, etc.)
- Don't extract helpers or abstractions for one-time operations
- Don't remove code that looks "unused" unless you've traced all callsites and confirmed it

### File creation
Create new files when it improves clarity — splitting a function group into its own file, adding a type declaration, separating concerns. Don't create files for trivial amounts of code. If a file is over 3,000 lines and you're adding significant new code to it, consider whether a split makes sense.

## Architecture

For detailed architecture reference, see `ARCHITECTURE.md`.

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
- `window.__tanko*Bound` flags prevent double-initialization — check these before adding new init code
- Electron main process `console.log` may not appear in VS Code terminal — use `fs.appendFileSync` to a known path for debugging
- `ELECTRON_RUN_AS_NODE=1` (set by VS Code) breaks `npm start` — must `unset` it first
- Network-level ad blockers (e.g. Ghostery) hook `session.webRequest` and silently break `will-download` events — don't use them on download sessions

## Environment
- Electron `^40.6.0` (Node.js v24.x internally)
- System Node.js: v22.x
- VS Code sets `ELECTRON_RUN_AS_NODE=1` — must `unset ELECTRON_RUN_AS_NODE` before `npm start`

## Git
Commit and push after every verified fix. Tag commits descriptively (e.g. `FIX-TTS03:`, `FEAT-SIDEBAR:`).

## Commands
`npm start` — dev | `npm run dist` — build | `npm run smoke` — checks

## Task Discipline
- Focus on one task at a time, but if you discover a closely related bug in code you're already modifying, flag it and fix it together rather than ignoring it
- Don't bundle genuinely unrelated fixes into one session
