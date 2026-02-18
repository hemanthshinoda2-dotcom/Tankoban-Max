# Tankoban Max Books Reader 16-Feature Plan (Foliate + Readest-Informed, Aquile-Minimal UI)

## Summary
This plan is decision-complete for implementing the 16 requested Books reader features in `projects/Tankoban Max` using the current Foliate-based renderer, with Readest used as behavior reference only (not React code copy).

Delivery is split into 4 waves to reduce regression risk and keep each handoff small enough for Claude Code.

## Scope
In scope:
1. Reader feature set 1-16 from the agreed matrix.
2. Minimalist Aquile-like UI behavior.
3. No regressions to Comics/Videos modes.
4. Keep architecture non-React, consistent with existing Tankoban renderer stack.

Out of scope:
1. Full Readest annotation suite.
2. Non-book mode redesign.
3. Full offline dictionary corpus in this pass.

## Locked Product Decisions
1. Delivery strategy: 4 waves.
2. Dictionary source: Wiktionary API first.
3. TTS rollout: stage Edge-quality after stable core.
4. Reader aesthetic: minimal, clean, icon-first top bar, no clutter.
5. Engine base: current vendored Foliate in `src/vendor/foliate`.

## Readest Reference Map (Behavioral Reference Only)
1. Paginated/scrolled navigation: `apps/readest-app/src/app/reader/hooks/usePagination.ts`
2. Font/layout controls: `apps/readest-app/src/app/reader/components/footerbar/FontLayoutPanel.tsx`
3. View mode toggles (flow/spread/zoom): `apps/readest-app/src/app/reader/components/ViewMenu.tsx`
4. Search navigation model: `apps/readest-app/src/app/reader/hooks/useSearchNav.ts`
5. TOC interactions: `apps/readest-app/src/app/reader/components/sidebar/TOCView.tsx`
6. Progress autosave: `apps/readest-app/src/app/reader/hooks/useProgressAutoSave.ts`
7. Keyboard shortcuts/navigation: `apps/readest-app/src/app/reader/hooks/useBookShortcuts.ts`
8. Bookmark toggling model: `apps/readest-app/src/app/reader/components/BookmarkToggler.tsx`
9. TTS orchestration: `apps/readest-app/src/app/reader/hooks/useTTSControl.ts`
10. TTS engine stack and highlighting: `apps/readest-app/src/services/tts/TTSController.ts`
11. Edge voice quality path: `apps/readest-app/src/services/tts/EdgeTTSClient.ts`
12. Dictionary popup behavior: `apps/readest-app/src/app/reader/components/annotator/WiktionaryPopup.tsx`
13. Selection handling for popup trigger: `apps/readest-app/src/app/reader/hooks/useTextSelector.ts`

## Wave Plan

## Wave 1 (First Set for Claude)
Target features:
1. Paginated view.
2. Dark/light theme (minimum two modes).
3. TOC sidebar.
4. Reading progress save/restore.
5. Page turn via keyboard.
6. Search in book with highlight navigation.

Prerequisite in same wave:
1. Reader open stability gate for EPUB/PDF.

### Wave 1 Files
1. `projects/Tankoban Max/src/index.html`
2. `projects/Tankoban Max/src/styles/styles.css`
3. `projects/Tankoban Max/src/domains/books/reader/controller.js`
4. `projects/Tankoban Max/src/domains/books/reader/engine_foliate.js`
5. `projects/Tankoban Max/src/domains/books/library.js`
6. `projects/Tankoban Max/src/state/deferred_modules.js`
7. `projects/Tankoban Max/tools/smoke_check.js` (only if new files are added)

### Wave 1 Implementation Spec
1. Stabilize EPUB/PDF open path in `engine_foliate.js`.
2. Use a robust file load sequence: `Tanko.api.files.read(path)` typed-array normalization first, `fetch(file://...)` fallback second, explicit error classification third.
3. Keep `window.booksReaderController` public contract unchanged.
4. Add flow mode support for EPUB/TXT in `engine_foliate.js`: `setFlowMode('paginated'|'scrolled')` via Foliate renderer `flow` attribute.
5. Keep PDF fixed-layout only and disable unsupported controls.
6. Upgrade search from first-hit-only to session navigation: `search(query)` returns `count` plus ordered hit list.
7. Add controller-managed search state: `query`, `hits[]`, `activeHitIndex`.
8. Add UI controls: `booksReaderSearchPrevBtn`, `booksReaderSearchNextBtn`, `booksReaderSearchCount`.
9. Add TOC active highlighting and auto-scroll to active item after relocate.
10. Improve progress persistence: save on relocate debounce and on close, restore locator on reopen.
11. Keyboard behavior:
12. Left/Right/PageUp/PageDown navigate pages.
13. Escape closes reader.
14. Do not capture navigation shortcuts when typing in search input.
15. Minimal UI pass: keep one clean top bar row, remove visual noise, retain existing app visual language tokens.

### Wave 1 UX Contract (Aquile-Minimal)
1. Reader top bar is single-row, compact, no wrapping at 1366x768.
2. Buttons are icon-first with tooltips; long text labels are removed.
3. TOC is a collapsible left pane.
4. Search appears as compact inline control with prev/next results.
5. Status line stays subtle and only shows meaningful transient messages.

### Wave 1 Acceptance Checks
1. EPUB opens from library click and open-file dialog.
2. PDF opens from library click and open-file dialog.
3. No blank reader host on successful open.
4. Flow toggle works for EPUB and persists across reopen.
5. Search shows total hits and prev/next works.
6. TOC click navigates correctly and active chapter updates.
7. Progress restores close to previous location after app restart.
8. Back from reader returns to Books series/home layer, not Comics.
9. `npm run smoke` passes.

## Wave 1 Completion Report

### Status: COMPLETE (2026-02-16)

### Completion Checklist
- [x] Stability gate for EPUB/PDF open (error classification, typed-array-first + fetch fallback)
- [x] Paginated view with flow mode toggle (paginated/scrolled via Foliate renderer)
- [x] Dark/light theme (light/sepia/dark select, persisted via booksSettings)
- [x] TOC sidebar with active chapter highlighting and auto-scroll
- [x] Reading progress save/restore (auto-save on relocate debounce + interval + close)
- [x] Page turn via keyboard (Left/Right/PageUp/PageDown/Space, guarded from search input)
- [x] Search in book with highlight navigation (prev/next/count, wrapping navigation)
- [x] Minimal UI pass (icon-first buttons, tooltips, compact search group, visual separators)
- [x] No placeholder TODOs in Wave 1 deliverables

### File:Line Evidence

| Feature | File | Lines | Notes |
|---------|------|-------|-------|
| Stability gate | engine_foliate.js | 183-218 | `makeFileForBook()` — typed-array normalization, fetch fallback, error classification (`file_empty`, `file_not_accessible`) |
| Flow mode engine | engine_foliate.js | 285-293, 428-435 | `setFlowMode()` + flow applied on open via `renderer.setAttribute('flow', ...)` |
| Flow mode toggle | controller.js | 87-93, 506-518 | `updateFlowBtnLabel()`, `toggleFlowMode()` — persists via booksSettings |
| Search hits collection | engine_foliate.js | 381-416 | `search()` returns `{ ok, count, hits[] }` with all CFIs |
| Search goTo | engine_foliate.js | 418-426 | `searchGoTo(index)` navigates to specific hit |
| Relocate callback | engine_foliate.js | 271-277, 437-440 | `onRelocateEvent(cb)` + invocation in relocate listener |
| Search navigation UI | controller.js | 290-310, 454-498 | `resetSearchState()`, `updateSearchUI()`, `searchPrev()`, `searchNext()` |
| TOC active highlighting | controller.js | 153-171 | `updateTocActive(detail)` — matches `tocItem.href`, auto-scrolls active item |
| TOC href data attr | controller.js | 208-209 | `btn.dataset.tocHref` stored on each TOC button |
| Relocate handler | controller.js | 173-182 | `handleRelocate()` — updates TOC active + debounced save (800ms) |
| Progress flowMode | controller.js | 242-245 | `locator.flowMode` included in saved progress payload |
| Keyboard guard | controller.js | 593-620 | Skips page navigation when `INPUT/TEXTAREA/SELECT` is focused |
| Flow toggle bind | controller.js | 562-563 | `flowBtn` click → `toggleFlowMode()` |
| Search prev/next/clear bind | controller.js | 557-560 | Search navigation button event listeners |
| Icon-first topbar | index.html | 336-370 | Unicode icons, tooltips, `disabled` attrs, search group with count |
| TOC active CSS | styles.css | 3712-3717 | `.booksReaderTocItem.active` — blue highlight + bold weight |
| Search group CSS | styles.css | 3819-3833 | `.booksReaderSearchGroup` flex layout |
| Search count CSS | styles.css | 3835-3843 | `.booksReaderSearchCount` mono counter label |
| Separator CSS | styles.css | 3845-3852 | `.booksReaderSep` thin vertical divider |

### Commands Run + Results

| Command | Result |
|---------|--------|
| `node tools/smoke_check.js` | **Passed** — All checks green: baseline files, IPC enforcement, renderer gateway, doc maps, trace markers, load order |

### Deviations from Plan

| Deviation | Reason |
|-----------|--------|
| Flow mode uses `renderer.setAttribute('flow', ...)` instead of `view.setAttribute` | Foliate paginator observes `flow` on the renderer (paginator.js:426,630), not on the view element |
| Search clears via controller `resetSearchState()` instead of `view.clearSearch()` | Simpler; avoids depending on an undocumented Foliate method while achieving same UX |
| TOC items use `data-toc-href` for matching instead of index-based matching | Href-based matching is more robust when Foliate reports `tocItem.href` in relocate events |
| Relocate debounce is 800ms instead of Foliate's own relocate frequency | Prevents over-saving while remaining responsive; auto-save interval (3s) provides a safety net |
| Settings include `flowMode` not originally in DEFAULT_SETTINGS | Required to persist flow mode across sessions as specified in Wave 1 spec item 4 |

## Wave 2
Target features:
1. Font size slider (8-30).
2. Font family picker (serif/sans-serif/monospace).
3. Line height slider.
4. Margin slider.
5. 2-column toggle (single vs spread style).

### Wave 2 Files
1. `projects/Tankoban Max/src/index.html`
2. `projects/Tankoban Max/src/styles/styles.css`
3. `projects/Tankoban Max/src/domains/books/reader/controller.js`
4. `projects/Tankoban Max/src/domains/books/reader/engine_foliate.js`
5. `projects/Tankoban Max/main/domains/booksSettings/index.js` (shape extension only)

### Wave 2 Implementation Spec
1. Add compact `Aa` settings panel in reader.
2. Implement sliders/toggles with per-format enablement: EPUB/TXT enabled; PDF disables typography controls.
3. Map font family to Foliate style CSS variables in renderer styles.
4. Map line height and margin directly through style application.
5. Implement 2-column toggle using Foliate renderer column attributes.
6. Persist settings immediately via `booksSettings.save`.

### Wave 2 Acceptance Checks
1. Font size 8-30 is respected and persisted.
2. Font family changes are visible and persisted.
3. Line height and margins visibly update and persist.
4. 2-column mode changes reading behavior in paginated EPUB.
5. PDF keeps controls disabled instead of no-op behavior.

### Wave 2 Completion Report

**Status: COMPLETE**

#### Checklist
- [x] Font size slider (8-30) — range input, live preview, persisted via booksSettings.save
- [x] Font family picker (serif/sans-serif/monospace) — select, applied via buildEpubStyles + TXT engine
- [x] Line height slider (1.0-2.4, step 0.1) — range input, live preview, persisted
- [x] Margin slider (0-80, step 4) — range input, live preview, persisted
- [x] 2-column toggle (single/spread) — checkbox, renderer.setAttribute('max-column-count', ...)
- [x] Compact Aa settings panel with toggle button
- [x] Per-format enablement: EPUB/TXT active, PDF disables Aa panel
- [x] All settings persisted immediately
- [x] Smoke checks pass

#### File:line evidence
| Feature | File | Lines |
|---------|------|-------|
| Aa panel HTML markup | src/index.html | 370-397 |
| Aa panel CSS | src/styles/styles.css | 3859-3924 |
| DEFAULT_SETTINGS (fontFamily, columnMode) | src/domains/books/reader/controller.js | 7-14 |
| Aa panel element refs | src/domains/books/reader/controller.js | 56-65 |
| syncAaPanelUI() | src/domains/books/reader/controller.js | 131-143 |
| Aa panel bindings (sliders, select, toggle) | src/domains/books/reader/controller.js | 580-630 |
| Per-format Aa disable | src/domains/books/reader/controller.js | 108-109 |
| buildEpubStyles fontFamily | src/domains/books/reader/engine_foliate.js | 140-173 |
| setColumnMode() | src/domains/books/reader/engine_foliate.js | 445-452 |
| TXT engine fontFamily | src/domains/books/reader/engine_txt.js | 71-77 |
| TXT engine fontSize range 8-30 | src/domains/books/reader/engine_txt.js | 71 |

#### Commands run
```
node tools/smoke_check.js   → Smoke check passed.
```

#### Deviations
- Replaced A-/A+ buttons with single Aa toggle that opens a compact panel (plan said "compact Aa settings panel" — buttons removed rather than kept alongside).
- Font family mapped to concrete font stacks rather than CSS variables (Foliate setStyles uses inline CSS objects, not CSS custom properties).
- `booksSettings/index.js` not modified — already accepts arbitrary settings via merge pattern, no shape extension needed.
- Column mode uses `renderer.setAttribute('max-column-count', '1'|'2')` based on Foliate paginator observed attributes.

## Wave 3
Target features:
1. Bookmarks.
2. Dictionary lookup popup.

### Wave 3 Files
1. `projects/Tankoban Max/shared/ipc.js`
2. `projects/Tankoban Max/main/domains/booksBookmarks/index.js` (new)
3. `projects/Tankoban Max/main/ipc/register/books_bookmarks.js` (new)
4. `projects/Tankoban Max/main/ipc/index.js`
5. `projects/Tankoban Max/preload/index.js`
6. `projects/Tankoban Max/src/services/api_gateway.js`
7. `projects/Tankoban Max/src/domains/books/reader/controller.js`
8. `projects/Tankoban Max/src/index.html`
9. `projects/Tankoban Max/src/styles/styles.css`

### Wave 3 Implementation Spec
1. Add bookmark domain and JSON store `books_bookmarks.json`.
2. Add bookmark toggle button in reader top bar.
3. Bookmark payload: `id`, `bookId`, `locator`, `snippet`, `createdAt`, `updatedAt`.
4. Add bookmarks list section in TOC panel.
5. Add dictionary popup from text selection in EPUB/TXT.
6. Dictionary source: Wiktionary REST API with in-memory LRU cache.
7. Popup supports linked word navigation and graceful error state.

### Wave 3 Acceptance Checks
1. Bookmark toggle creates/removes bookmark at current location.
2. Bookmarks reopen to exact location.
3. Dictionary opens on selected word and shows definition.
4. Dictionary handles offline/error cleanly.
5. No regressions in search, TOC, and progress.

### Wave 3 Completion Report

**Status: COMPLETE**

#### Checklist
- [x] Bookmark domain (`books_bookmarks.json`) — get/save/delete/clear with atomic writes
- [x] Bookmark IPC channels — BOOKS_BOOKMARKS_GET, SAVE, DELETE, CLEAR in shared/ipc.js
- [x] Bookmark register module — main/ipc/register/books_bookmarks.js
- [x] Bookmark wiring — ipc/index.js, preload/index.js, api_gateway.js
- [x] Bookmark toggle button (star) in reader topbar
- [x] Bookmarks list in TOC panel sidebar with go-to and delete
- [x] Bookmark toggle logic — creates/removes bookmark at current location using locator key comparison
- [x] Keyboard shortcut B to toggle bookmark
- [x] Dictionary popup — Wiktionary REST API with LRU cache (50 entries)
- [x] Dictionary triggered by double-click on text or D key shortcut
- [x] Dictionary shows part of speech + definitions (up to 3 per entry)
- [x] Dictionary handles offline/error with "No definition found" message
- [x] Engine getSelectedText() for both Foliate and TXT engines
- [x] Bookmarks and dictionary state cleaned up on reader close
- [x] Smoke checks pass

#### File:line evidence
| Feature | File | Lines |
|---------|------|-------|
| Bookmark IPC channels | shared/ipc.js | BOOKS_BOOKMARKS_GET/SAVE/DELETE/CLEAR |
| Bookmark domain | main/domains/booksBookmarks/index.js | 1-55 (new) |
| Bookmark register | main/ipc/register/books_bookmarks.js | 1-8 (new) |
| IPC registry wiring | main/ipc/index.js | booksBookmarks import, register, domain |
| Preload booksBookmarks | preload/index.js | booksBookmarks namespace |
| Gateway booksBookmarks | src/services/api_gateway.js | booksBookmarks namespace |
| Bookmark btn HTML | src/index.html | booksReaderBookmarkBtn |
| Bookmarks list HTML | src/index.html | booksReaderBookmarksList |
| Dictionary popup HTML | src/index.html | booksReaderDictPopup |
| Bookmark CSS | src/styles/styles.css | 3924-3995 |
| Dictionary CSS | src/styles/styles.css | 3997-4060 |
| State: bookmarks, dictCache | src/domains/books/reader/controller.js | state object |
| Element refs (WAVE3) | src/domains/books/reader/controller.js | ensureEls |
| Bookmark functions | src/domains/books/reader/controller.js | loadBookmarks, renderBookmarksList, toggleBookmark, goToBookmark, deleteBookmark |
| Dictionary functions | src/domains/books/reader/controller.js | lookupWord, renderDictResult, showDictPopup, hideDictPopup, triggerDictLookup |
| Bindings (bookmark, dict) | src/domains/books/reader/controller.js | bind() |
| Keyboard D/B shortcuts | src/domains/books/reader/controller.js | keydown handler |
| Foliate getSelectedText | src/domains/books/reader/engine_foliate.js | getSelectedText() |
| TXT getSelectedText | src/domains/books/reader/engine_txt.js | getSelectedText() |

#### Commands run
```
node tools/smoke_check.js   → Smoke check passed.
```

#### Deviations
- Dictionary uses double-click + D key shortcut instead of selection-only popup (Foliate renders EPUB content in iframes which may not propagate text selection to outer window; double-click and keyboard shortcut are more reliable triggers).
- Bookmark star button does not dynamically fill/empty on page turn (would require async locator comparison on every relocate event). Instead, toggle is click-based: click adds if no bookmark at current location, removes if one exists. Users see their bookmarks in the sidebar list.
- Added B keyboard shortcut for bookmark toggle (not in spec, but consistent with D key for dictionary).
- Foliate getSelectedText() attempts multiple strategies to access iframe content document selection, with outer window fallback.

## Wave 4
Target features:
1. TTS with word highlight.
2. TTS speed control (0.5x-2.0x).
3. TTS play/pause/stop.

### Wave 4 Files
1. `projects/Tankoban Max/src/domains/books/reader/tts_core.js` (new)
2. `projects/Tankoban Max/src/domains/books/reader/tts_engine_webspeech.js` (new)
3. `projects/Tankoban Max/src/domains/books/reader/tts_engine_edge.js` (new, optional fallback path)
4. `projects/Tankoban Max/src/domains/books/reader/controller.js`
5. `projects/Tankoban Max/src/index.html`
6. `projects/Tankoban Max/src/styles/styles.css`
7. `projects/Tankoban Max/main/domains/booksSettings/index.js` (tts settings fields)

### Wave 4 Implementation Spec
1. Implement TTS core state machine: `idle`, `playing`, `paused`, `stopping`.
2. Use Web Speech engine first as default.
3. Add optional Edge-quality engine adapter behind settings toggle.
4. Use Foliate TTS hooks for highlight synchronization where available.
5. Add floating TTS bar: play/pause/stop, speed down/up, current snippet.
6. Persist TTS speed and preferred voice.

### Wave 4 Acceptance Checks
1. TTS starts from current location and highlights progressing text.
2. Play/pause/stop reliable under repeated presses.
3. Speed range 0.5-2.0 works and persists.
4. Navigation while TTS active updates reading location correctly.
5. TTS failure falls back cleanly without freezing reader.

### Wave 4 Completion Report

**Status: COMPLETE**

#### Checklist
- [x] TTS state machine (idle/playing/paused) with clean transitions
- [x] Web Speech API adapter (`tts_engine_webspeech.js`) — speak/pause/resume/cancel, boundary events, voice/rate control
- [x] TTS core (`tts_core.js`) — text extraction from EPUB iframe + TXT DOM, block-level playback, auto-advance on page end
- [x] TTS topbar button (play triangle) with active state highlight
- [x] Floating TTS bar — play/pause, stop, speed ∓0.1 (0.5x-2.0x), current snippet with word highlight
- [x] Word-level tracking via Web Speech `onboundary` events, displayed in TTS bar snippet
- [x] Block-level highlight in reader (`.booksReaderTtsActive` class on current paragraph)
- [x] Auto-scroll current block into view during playback
- [x] Auto-advance to next page/section when all blocks are spoken
- [x] Speed persisted via `ttsRate` in `books_reader_settings.json`
- [x] Keyboard shortcut T to toggle TTS play/pause
- [x] TTS destroyed on reader close
- [x] TTS button disabled for PDF (text-flow formats only)
- [x] Graceful failure — `isAvailable()` check, error handler calls `stop()`
- [x] Smoke checks pass

#### File:line evidence
| Feature | File | Lines |
|---------|------|-------|
| Web Speech adapter | src/domains/books/reader/tts_engine_webspeech.js | 1-85 (new) |
| TTS core state machine | src/domains/books/reader/tts_core.js | 1-239 (new) |
| TTS bar HTML | src/index.html | booksReaderTtsBar, booksReaderTtsPlayPause/Stop/Slower/Faster |
| TTS topbar button | src/index.html | booksReaderTtsBtn |
| TTS script loading | src/state/deferred_modules.js | tts_engine_webspeech.js, tts_core.js added to loadScriptChain |
| TTS bar CSS | src/styles/styles.css | booksReaderTtsBar, ttsWord, booksReaderTtsActive |
| DEFAULT_SETTINGS ttsRate/ttsVoice | src/domains/books/reader/controller.js | DEFAULT_SETTINGS |
| TTS element refs | src/domains/books/reader/controller.js | ensureEls (ttsBtn, ttsBar, ttsPlayPause, etc.) |
| TTS functions (initTTS, syncTtsUI, ttsToggle, etc.) | src/domains/books/reader/controller.js | WAVE4 section |
| TTS bindings | src/domains/books/reader/controller.js | bind() — ttsBtn, ttsPlayPause, ttsStop, ttsSlower, ttsFaster |
| T key shortcut | src/domains/books/reader/controller.js | keydown handler |
| TTS init on open | src/domains/books/reader/controller.js | open() — initTTS() |
| TTS destroy on close | src/domains/books/reader/controller.js | close() — destroyTTS() |
| TTS button disable for PDF | src/domains/books/reader/controller.js | syncControlAvailability |

#### Commands run
```
node tools/smoke_check.js   → Smoke check passed.
```

#### Deviations
- Skipped `tts_engine_edge.js` (plan listed it as "optional fallback path"). Edge TTS requires server-side API access which is out of scope for this wave. Web Speech API is the sole engine.
- Did not use Foliate's built-in `initTTS()` / `tts.js` module directly. Instead, tts_core.js extracts text from the Foliate renderer's content document (`renderer.getContents()[0].doc`) and the TXT engine's DOM directly. This avoids SSML parsing complexity while still providing word-level tracking via Web Speech boundary events.
- Word highlighting is displayed in the TTS bar snippet (not injected into book DOM), avoiding cross-iframe DOM manipulation complexity for EPUB. Block-level highlight is applied directly to the paragraph element.
- `booksSettings/index.js` not modified — already accepts arbitrary settings via merge pattern; `ttsRate` and `ttsVoice` are persisted through existing save mechanism.
- Added T keyboard shortcut for TTS toggle (consistent with B for bookmarks, D for dictionary).

## Public API / Interface / Type Additions

### New Settings Fields (`books_reader_settings.json`)
1. `flowMode: 'paginated' | 'scrolled'`
2. `theme: 'light' | 'dark'`
3. `fontSize: number`
4. `fontFamily: 'serif' | 'sans-serif' | 'monospace'`
5. `lineHeight: number`
6. `margin: number`
7. `columnMode: 'single' | 'spread'`
8. `ttsRate: number`
9. `ttsVoiceId: string`
10. `ttsEngine: 'webspeech' | 'edge'`

### Extended Locator Shape (`books_progress.json`)
1. `cfi`
2. `fraction`
3. `pageIndex`
4. `pageLabel`
5. `scrollTop`
6. `flowMode`
7. `columnMode`
8. `updatedAt`

### New IPC (Wave 3)
1. `BOOKS_BOOKMARKS_GET_ALL`
2. `BOOKS_BOOKMARKS_GET`
3. `BOOKS_BOOKMARKS_ADD`
4. `BOOKS_BOOKMARKS_REMOVE`
5. `BOOKS_BOOKMARKS_CLEAR_BOOK`
6. `BOOKS_BOOKMARKS_CLEAR_ALL`

## Test Cases and Scenarios

### Mode + Navigation
1. Comics -> Books -> Videos -> Books transition has no stale overlays.
2. Back button inside Books reader returns one layer at a time.

### Reader Core
1. EPUB: open, TOC jump, search prev/next, close, reopen restore.
2. PDF: open, next/prev, fit page/width, close, reopen restore.
3. TXT: open, flow/typography controls where supported, restore.

### Layout Controls
1. Font size 8-30 validates bounds and persistence.
2. Font family/line height/margins persist and apply immediately.
3. 2-column mode changes reading behavior without breaking TOC/search.

### TTS
1. Start/pause/resume/stop.
2. Word/sentence highlight tracks audible segment.
3. Rate persists across reopen.

### Dictionary + Bookmarks
1. Word selection popup appears only with non-empty selection.
2. Bookmark toggle is idempotent at same location.
3. Bookmark navigation is stable after rescans.

### Regression
1. Comics reader unchanged.
2. Video player unchanged.
3. `npm run smoke` passes after each wave.

## Assumptions and Defaults
1. Implementation target is only `projects/Tankoban Max`.
2. `app/` remains untouched.
3. PDF stays fixed-layout in this roadmap.
4. Edge-TTS is staged after core stability, not blocking Wave 1.
5. Dictionary uses network (Wiktionary) in first release.
6. UI follows existing Tankoban visual tokens and spacing language, avoiding an oddball style.

## Claude Code Initiation Prompt
Use this prompt to start Wave 1:

```text
Work only in: D:\Projects\Tankoban-Pro-Electron\projects\Tankoban Max

Read and follow: docs/plans/AI_BOOKS_READER_16_FEATURES_PLAN.md

Implement only Wave 1 from that file:
- Stability gate for EPUB/PDF open
- Features: paginated view, dark/light theme, TOC sidebar, reading progress save/restore, keyboard page turn, search with highlight navigation

Validation and reporting requirements:
1) Run smoke checks.
2) Update docs/plans/AI_BOOKS_READER_16_FEATURES_PLAN.md with:
   - Wave 1 completion checklist
   - file:line evidence
   - commands run + summarized results
   - deviations with reason

Constraints:
- Do NOT modify D:\Projects\Tankoban-Pro-Electron\app
- Keep Comics/Videos behavior unchanged
- Keep Books UI minimalist and visually consistent with Tankoban
- No placeholder TODOs for Wave 1 deliverables
```

