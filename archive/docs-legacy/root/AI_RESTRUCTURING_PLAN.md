# AI-Friendly Restructuring Plan

## Context

The codebase is ~70K lines across 100+ files with no bundler, no tests, and no linting. The main pain points for AI work across sessions are:

1. **Mega-files** eat context window — `video.js` (9,649 lines), `styles.css` (4,264), `books/library.js` (4,037), `books-reader.css` (2,732), `shell/core.js` (2,675)
2. **221 IPC channels** must stay in sync across 3 files — typo = silent failure, no automated check
3. **No code map** — AI loses all navigational knowledge between sessions
4. **CSS files have no section markers** — finding styles requires reading thousands of lines
5. **Tightly coupled IIFE closures** — makes file splitting non-trivial (can't just move functions out)

The restructuring is ordered by **impact and safety**. Every session leaves the app working. No behavior changes.

---

## Phases at a Glance

| Phase | Sessions | What | Risk | Summary |
|-------|----------|------|------|---------|
| **1** | 1–4 | Zero-risk foundations | None | IPC validator, section markers in CSS + JS, CODEMAP.md |
| **2** | 5–7 | CSS splits | Low | Extract video/comic-reader CSS + remove dead books stubs from `styles.css` (4,264 → ~1,450 lines) |
| **3** | 8–11 | Safe JS extractions | Low | OPDS, web sources, video search, ZIP reader out of mega-files |
| **4** | 12–13 | Medium-risk JS splits | Medium | Main/ipc split, preload namespace split (video.js splits dropped — see Phase 4) |
| **5** | 14–16 | Tooling & polish | Low | IPC scaffold tool, dead code detectors, smoke integration |

---

## Phase 1: Zero-Risk Foundations (Sessions 1–4)

These add validation tools, markers, and documentation. No code changes. No risk.

### Session 1 — IPC Sync Validator

The single highest-impact change. The existing `smoke_check.js` already enforces that IPC strings only appear in `shared/ipc.js` and that handlers only live in `main/ipc/`. But it does NOT check that every defined channel actually has a matching handler and preload method. This is the gap that caused the Session 6 download progress bug.

**Create:** `tools/ipc_sync_check.js` — a Node script that:
- Parses `shared/ipc.js` to extract all CHANNEL and EVENT names
- Scans `preload/index.js` for every `CHANNEL.*` / `EVENT.*` reference
- Scans `main/ipc/index.js` + `main/ipc/register/*.js` for every `CHANNEL.*` reference in `ipcMain.handle()`
- Reports: dead channels (defined but unused), missing handlers (preload exposes but main doesn't handle), missing preload methods (main handles but preload doesn't expose)

**Modify:** `package.json` — add `"ipc:check"` script
**Modify:** `tools/smoke_check.js` — call the validator from the existing smoke pipeline

**Test:** Run `npm run smoke`. Intentionally break a channel name to verify it catches errors.

---

### Session 2 — Section Markers in CSS Files

Add `/* ══════ SECTION: Name ══════ */` comment lines at natural boundaries in both large CSS files. This lets AI grep for sections instead of reading thousands of lines.

**Modify:** `src/styles/styles.css` (~20 markers at boundaries like: Window Chrome, Topbar & Mode Switch, Sidebar & Tree, Series Grid & Tiles, Inside-Series View, Comic Reader HUD, Mega Settings, Context Menus & Overlays, Video Mode, etc.)

**Modify:** `src/styles/books-reader.css` (~15 markers at boundaries like: Sub-Mode Tabs, Listening Player, TTS Bar, Toolbar, Sidebar & Search, Settings Pane, TOC/Bookmarks/Annotations, Dictionary, Reading Area, Overlays & Navigation, Footer & TTS Mini Bar)

**Test:** Launch app, visual spot-check that nothing changed.

---

### Session 3 — Section Markers in Mega JS Files

Same approach for the three largest JS files. Add section markers + a function index comment block at the top of each file.

**Modify:** `src/domains/video/video.js` — ~25 section markers (DOM refs, Progress helpers, Format utils, Player panels, Library data model, Continue shelf, Show rendering, Player adapter, Player UI bindings, Video search, etc.)

**Modify:** `src/domains/books/library.js` — ~12 section markers (Init & helpers, Book progress, File I/O & thumbs, Show management, Context menus, Continue reading, Library grid, View routing, Global search, Web sources, OPDS catalog, Event binding)

**Modify:** `src/domains/shell/core.js` — ~10 section markers (DOM refs, App state, Toast & loading, Context menus, ZIP reader, Library rendering, Open/drop handlers, Thumbnail generation, External file handling)

**Test:** Launch app, confirm no behavioral change.

---

### Session 4 — CODEMAP.md

Create a persistent navigation document that AI can consult at the start of every session.

**Create:** `CODEMAP.md` in repo root, containing:
- **File index** — every file over 300 lines with path, line count, what it owns, key functions
- **IPC namespace map** — for each `Tanko.api.*` namespace: the preload line range, shared/ipc.js section, and main handler file
- **CSS ownership map** — which CSS file owns which visual domain, with section marker names
- **Global state registry** — every `window.*` export, `el` object scope, event bus
- **Dependency graph** — which files depend on which, load order from deferred_modules.js
- **"How to find X" cheatsheet** — common search patterns (e.g., "sidebar styles" → `styles.css` SECTION: Sidebar & Tree)

**Test:** None needed — documentation only. But verify it's accurate by spot-checking a few entries.

---

## Phase 2: CSS Splits (Sessions 5–7)

CSS splits are the safest file splits because CSS has no closures, no variable scoping, and the only concern is cascade order. Each split creates a new `.css` file and adds a `<link>` tag in `index.html` at the correct position.

**Important correction:** The original Session 7 planned to extract "Comic Library CSS" (lines 272–1530). Research revealed this is **shared library infrastructure** — topbar, sidebar, folder tree, continue shelf, volume table, scrollbars, search, and overlays are all used by Comics, Books, AND Video. Extracting them would break two modes. Session 7 is revised to remove dead books stubs instead.

### Session 5 — Extract Video Player CSS from styles.css

**Extract (~940 lines):**
- Lines ~1103–1131: Video folder "continue watching" preview widget (`.videoFolderContinue*`)
- Lines ~1192–1305: Video episode table column grids + cell styling (`#videoEpTableHead`, `#videoEpisodesGrid`, `#videoEpisodesWrap .cell.*`, `.videoEpProgress*`)
- Lines ~2774–3628: Main video player chrome — library rows, player shell, HUD (minimal + legacy), scrub, context menu, tracks panel, continue panels, playlist, volume/speed panels, OSD (`.videoList`, `.videoRow*`, `.videoPlayerShell`, `.videoHud*`, `.videoCtxMenu`, `.videoVolumeOSD`, etc.)

**Keep in `styles.css`:** Lines 9–110 (global `body.inVideoPlayer`/`body.videoFullscreen` layout switches — foundational). Lines 1187–1190 (`#videoEpisodesWrap.previewHidden` — shared pattern, tiny). Lines ~2050–2062 (`.scrubChapterMark` — shared with Books reader).

**Create:** `src/styles/video-player.css`
**Modify:** `src/index.html` — add `<link>` tag after `video-library-match.css`, before `books-reader.css`
**Modify:** `src/styles/styles.css` — remove extracted lines, leave `/* Extracted to video-player.css */` comment

**Test:** Launch app → Video mode → verify: library grid, player HUD, scrub, volume/speed panels, context menu, fullscreen, continue shelf, playlist panel.

---

### Session 6 — Extract Comic Reader CSS from styles.css

**Extract (~1,230 lines):**
- Lines ~1531–2110: Player bar, stage, click zones, manual scroller, corner prefs, footer, quick settings, speed slider, scrub bar (`.playerBar`, `.stageWrap`, `.clickZones`, `.playerFooter`, `.scrubWrap`, `.scrub*`, etc.)
- Lines ~2127–2170: Context menu (`.contextMenu`, `.contextMenuItem*`)
- Lines ~2172–2389: End-of-volume overlay + mega settings (`.endOverlay`, `.megaSettingsOverlay`, `@keyframes megaIn`)
- Lines ~2391–2523: HUD visibility, player-mode body rules, icon overrides (`body.hudHidden`, `body.inPlayer`)
- Lines ~2525–2620: Loading overlay, spinner, warmup bar, debug overlay (`.loadingOverlay`, `.spinner`, `@keyframes spin`)
- Lines ~2622–2772: Mode menu, auto-flip, goto/FX cards, loupe (`.modeMenu`, `.loupeHud`, `.fxCard`)

**Keep in `styles.css`:** Lines 2109–2125 (`.hint` + `.toast` — shared with Books and Web modes).

**Create:** `src/styles/comic-reader.css`
**Modify:** `src/index.html` — add `<link>` tag after `overhaul.css`, before `video-library-match.css`
**Modify:** `src/styles/styles.css` — remove extracted lines, leave `/* Extracted to comic-reader.css */` comment

**Test:** Launch app → open a comic → verify HUD bar, scrub, quick settings, mega settings, speed slider, end-of-volume overlay, loading spinner, loupe, context menu, fullscreen, click zones.

---

### Session 7 — Remove Obsolete Books Stubs from styles.css

Lines ~3630–4264 (~634 lines) contain old books reader styles that are **duplicated in `books-reader.css`** with updated values. Since `books-reader.css` loads after `styles.css` in the cascade, the `styles.css` versions are dead code.

**Verified duplicates (styles.css value → books-reader.css override):**
- `.booksReaderDictPopup`: `width:320px, z-index:50` → `width:380px, z-index:70`
- `.booksReaderTtsBar`: both files define it, `books-reader.css` wins
- `.booksAnnotPopup`: both files, `books-reader.css` wins
- `.booksGotoOverlay`: both files, `books-reader.css` wins
- `.booksReaderTtsSentence/Word`: both files, `books-reader.css` wins

**Remove from `styles.css`:** All books reader rules in lines ~3630–4264 (dictionary, TTS bar, TTS diagnostics, goto dialog, annotations, error banner, status row, reader themes, TTS highlighting, sleep timer, folder continue widget, history buttons, chapter markers).

**Before deleting each rule:** grep-verify it exists in `books-reader.css`. If a rule is ONLY in `styles.css`, move it to `books-reader.css` instead of deleting.

After all three sessions, `styles.css` shrinks from 4,264 → ~1,450 lines (shared library infrastructure: globals, CSS variables, base layout, scrollbars, topbar, sidebar, folder tree, search, continue shelf, series grid, volume table, library overlays, toast).

**Test:** Launch app → Books mode → open a book → verify: dictionary popup, TTS bar, TTS diagnostics, goto dialog, annotations, error handling, theme switching, sleep timer.

---

## Phase 3: JS Splits — Safe Extractions (Sessions 8–11)

These extract self-contained sections from mega-files. The key challenge: renderer files use IIFEs, so extracted code loses closure access to local variables like `state`, `el`, `api`.

**The bridge pattern:** Before extracting, the parent IIFE exposes a shared namespace:
```js
window.__tankoBooksLibShared = { state, el, api, toast, ... };
```
The extracted file grabs it:
```js
const B = window.__tankoBooksLibShared;
// then uses B.state, B.el, B.api, B.toast
```

### Session 8 — Extract OPDS from books/library.js (safest JS split)

The OPDS catalog code (lines ~3146–4031, ~885 lines) is completely self-contained — it has its own state (`_booksOpdsState`), its own UI builder, its own DOM queries, and only needs `api` (already global as `Tanko.api`) and `toast()` from the parent.

**Create:** `src/domains/books/books_opds.js`
**Modify:** `src/domains/books/library.js` — remove extracted code, add bridge
**Modify:** `src/state/deferred_modules.js` — add to books chain after `library.js`

**Test:** Launch app → Books mode → OPDS feeds → add feed, browse catalog, download.

---

### Session 9 — Extract Web Sources & Downloads from books/library.js

Lines ~2847–3130 (~280 lines) — sidebar sources list, downloads rendering, download upsert logic.

**Create:** `src/domains/books/books_web_sources.js`
**Modify:** `src/domains/books/library.js`, `src/state/deferred_modules.js`

**Test:** Launch app → Books mode → sidebar Sources section, Downloads section.

---

### Session 10 — Extract Video Search from video.js

Lines ~9333–9590 (~260 lines) — search index, tokenizer, global search results. Completely read-only of state.

**Create:** `src/domains/video/video_search.js`
**Modify:** `src/domains/video/video.js`, `src/state/deferred_modules.js`

**Test:** Launch app → Video mode → Ctrl+K → search for a show name.

---

### Session 11 — Extract ZIP Reader from shell/core.js

Lines ~713–825 (~110 lines) — `findEOCD`, `inflateRaw`, `readZipEntries`, `readZipEntry`. Pure computation, zero DOM dependencies.

**Create:** `src/domains/shell/zip_reader.js`
**Modify:** `src/domains/shell/core.js` — reference `window.__tankoZipReader` instead
**Modify:** `src/index.html` — add `<script>` tag before `core.js`

**Test:** Launch app → open a CBZ comic → verify it loads and pages render.

---

## Phase 4: JS Splits — Medium-Risk Extractions (Sessions 12–13)

These extract larger, more interconnected sections. Each requires more bridge variables and more thorough testing.

### ~~Session 12 — Extract Video Panels from video.js~~ DROPPED

**Status:** Investigated and dropped. `closeAllToolPanels()` crosses extraction boundaries (calls `closePlaylistPanel()` 4,700 lines away). Context menu reads deep player state. 30+ external callers. Bridge would need 20+ variables — exceeding the complexity threshold the plan warned about.

### ~~Session 13 — Extract Video Continue Shelf from video.js~~ DROPPED

**Status:** Investigated and dropped. `renderContinue()` is scattered across 3 non-contiguous blocks and called from 10+ locations. Bridge would need 22+ variables. The Phase 1 section markers (22 markers in video.js) provide adequate navigation.

**video.js stays at ~9,481 lines.** The plan's "What's NOT Being Split" table already predicted this outcome: *"Further splits would need 20+ bridge variables. Not worth it."*

---

### Session 12 (renumbered) — Split main/ipc/index.js — Move Domain Logic to Domain Modules

The main process file is 1,238 lines, but most of it is inline domain logic (library cache, video cache, scan orchestration, window creation) rather than IPC registration. Since main process uses CommonJS `require()`, this is cleaner than IIFE splits.

**Move:** Library cache logic → `main/domains/library/index.js`
**Move:** Video cache logic → `main/domains/video/index.js`
**Move:** Window creation → `main/domains/window/index.js`
**Move:** Shared utilities → `main/lib/storage.js` (avoid duplication with existing storage functions)

After this, `main/ipc/index.js` shrinks from 1,238 → ~150 lines (just imports, ctx, and handler registration loop).

**Test:** `npm run smoke` + launch app → test library scan, video scan, open-with, window creation.

---

### Session 13 (renumbered) — Split preload/index.js into Namespace Files

The preload is 1,139 lines of one flat object. Since it uses CommonJS, split into:

**Create:** `preload/namespaces/window.js`, `preload/namespaces/library.js`, `preload/namespaces/books.js`, `preload/namespaces/video.js`, `preload/namespaces/web.js`, `preload/namespaces/player.js` (each exports a function that takes `{ipcRenderer, CHANNEL, EVENT}` and returns the namespace object)

**Modify:** `preload/index.js` — becomes ~50 lines: imports, assembly, `contextBridge.exposeInMainWorld`
**Modify:** `tools/ipc_sync_check.js` — scan `preload/namespaces/*.js` instead of just `preload/index.js`

**Test:** `npm run smoke` + launch app → verify every mode works (comics, books, video, browser).

---

## Phase 5: Tooling & Polish (Sessions 14–16)

### Session 14 — IPC Scaffold Tool

**Create:** `tools/ipc_scaffold.js` — a CLI tool that takes a channel name + namespace and auto-generates the stub in all three files (shared/ipc.js, preload namespace, main domain handler). Eliminates the most common source of IPC bugs.

### Session 15 — Dead CSS / Dead Export Detectors

**Create:** `tools/css_usage_check.js` — finds CSS classes defined but never referenced in HTML/JS
**Create:** `tools/dead_export_check.js` — finds `window.*` assignments never read elsewhere

### Session 16 — Wire All Validators into Smoke Check + Final CODEMAP Update

**Modify:** `tools/smoke_check.js` — call IPC sync, CSS usage, dead export validators
**Modify:** `CODEMAP.md` — final update with accurate post-restructuring file sizes and paths

---

## What's NOT Being Split (and Why)

| File | Lines | Why not |
|------|-------|---------|
| `styles.css` shared library core (after Phase 2) | ~1,450 | Lines 1–1530 are **shared infrastructure** (topbar, sidebar, folder tree, continue shelf, volume table, search, scrollbars, overlays) used by Comics, Books, AND Video. Extracting by domain would duplicate shared CSS or break other modes. |
| `shell/core.js` (after ZIP extraction) | ~2,565 | Everything shares `el`, `appState`, and closure vars. A bridge object would be as complex as the file itself. Section markers are sufficient. |
| `books-reader.css` | 2,732 | Already domain-scoped. Under the "urgent" threshold. Section markers from Session 2 are enough. |
| `video.js` (after search extraction) | ~9,481 | **Confirmed unsplittable.** Sessions 12–13 were investigated and dropped: `closeAllToolPanels()` crosses boundaries (30+ callers), `renderContinue()` scattered across 3 non-contiguous blocks (10+ callsites), both need 20+ bridge variables. Section markers (22 markers) provide adequate navigation. |
| `books/library.js` (after 2 extractions) | ~2,870 | The remaining code (grid rendering, view routing, continue reading) shares too much state. |

---

## Projected Impact

| File | Before | After | Reduction |
|------|--------|-------|-----------|
| `styles.css` | 4,264 | ~1,450 | **-66%** |
| `video/video.js` | 9,649 | ~9,481 | -2% (search extraction only; panels/continue splits dropped) |
| `books/library.js` | 4,037 | ~2,870 | **-29%** |
| `main/ipc/index.js` | 1,238 | ~150 | **-88%** |
| `preload/index.js` | 1,139 | ~50 | **-96%** |
| `shell/core.js` | 2,675 | ~2,565 | -4% |

Plus: IPC validation catches channel mismatches automatically, section markers make every file greppable, CODEMAP.md gives AI instant orientation each session.

---

## Critical Files

- `src/state/deferred_modules.js` — must be modified for every new renderer JS file (controls load order)
- `src/index.html` — must be modified for every new CSS file (controls cascade order)
- `shared/ipc.js` — source of truth for IPC sync validator
- `tools/smoke_check.js` — integration point for all new validators
- `package.json` — new npm scripts for validators

## Verification

Each session: `npm run smoke` passes, then launch app (`unset ELECTRON_RUN_AS_NODE && npm start`), then manual testing of the affected domain.
