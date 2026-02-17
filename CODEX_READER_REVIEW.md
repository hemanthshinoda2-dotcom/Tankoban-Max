# Codex Task: Review, Fix & Refine the Books Reader (BUILD_OVERHAUL)

## Context

We just completed a major overhaul of the EPUB/PDF/TXT book reader in this Electron app. The old reader used a video-player HUD pattern (auto-hiding bars, invisible click zones, right-click mega overlay) that was unusable for reading. We replaced it with the standard book reader pattern: persistent toolbar + dockable sidebar + clean reading area + slim footer.

The monolithic 3,437-line `controller.js` was split into 13 focused modules communicating via a lightweight event bus. All changes are tagged `BUILD_OVERHAUL`.

**This is a desktop Electron app, not a web app.** The renderer uses vanilla JS IIFEs (no framework, no bundler, no ES modules). All new CSS classes use the `br-` prefix to avoid conflicts with the comic reader and video player.

---

## Complete Feature Inventory

The reader must support ALL of the following features. Every one of these existed (or was partially implemented) before the overhaul and must work correctly after it. Review each feature end-to-end.

### Format Support
- **EPUB** — Opens via Foliate engine (`engine_foliate.js`). Supports reflowable text, paginated and scrolled flow modes, chapter navigation, annotations, TTS, dictionary.
- **PDF** — Opens via Foliate engine. Supports fit-page, fit-width, zoom in/out. No TTS or annotations for PDF.
- **Plain text (.txt)** — Opens via plain text engine (`engine_txt.js`). Basic reading with pagination.

### Reading & Navigation
- **Paginated mode** (default) — Content displayed in pages, turn via arrow keys, space bar, click on nav arrows, or scrub bar.
- **Scrolled mode** — Content flows continuously. Toggle via settings or `flowBtn` in footer.
- **Page navigation** — Left/Right arrow keys, Space/Shift+Space for next/prev page. Visible hover arrows on left/right edges of reading area.
- **Scrub bar** — Draggable progress bar in footer. Shows fill, thumb, hover bubble with percentage. Chapter markers overlaid as vertical ticks.
- **Go-to dialog** — Ctrl+G opens a dialog to jump to a page number or percentage. Submit with Enter or Go button. Cancel with Escape.
- **History navigation** — Alt+Left/Right to go back/forward through reading positions. History buttons in toolbar with disabled state when no history.
- **Chapter navigation** — TOC in sidebar. Click any chapter to jump there. Clicking a chapter marker on the scrub bar also navigates.
- **Progress persistence** — Reading position auto-saved periodically and on close. Restored on next open.

### Sidebar (5 tabs)
- **Contents (TOC)** — Hierarchical chapter list with depth indentation. Filter/search input at top. Active chapter highlighted. Arrow key navigation within the list.
- **Search** — In-book full-text search. Input field + Go button. Previous/Next result navigation. Result count display. Highlights in the reading area.
- **Bookmarks** — Toggle bookmark at current position (B key or star button). List of all bookmarks with snippet labels showing chapter/percentage. Click to navigate to bookmark. Delete button per bookmark.
- **Notes (Annotations)** — List of all annotations. Each shows highlighted text, note, and color indicator. Click to navigate to annotation location.
- **Settings** — All appearance and behavior controls in one panel:
  - Theme chips (Light / Sepia / Dark)
  - Font family select (Serif / Sans-serif / Monospace)
  - Font size slider (8–30)
  - Line height/spacing slider (1.0–2.4)
  - Margin slider (0–80)
  - Column/spread toggle (single vs 2-column)
  - PDF controls group (Fit Page / Fit Width / Zoom -/+) — only enabled when a PDF is open
  - TTS voice select
  - TTS speed slider (0.5x–3.0x)
  - Sleep timer chips (Off / 10m / 20m / 30m / 60m)
  - Flow mode toggle (scrolled vs paginated)
  - Zen mode toggle
  - Keyboard shortcuts display

### Annotations
- **Create** — Select text in the reading area, right-click → annotation popup appears with color picker (6 colors: yellow, pink, orange, green, blue, purple), style picker (highlight, underline, strikethrough, outline), optional note textarea, Save/Delete buttons.
- **Edit** — Right-click on an existing annotation highlight → popup opens pre-filled for editing.
- **Delete** — Delete button in popup, or from the annotations list in sidebar.
- **Persist** — Annotations saved via `Tanko.api.booksAnnotations` API. Reloaded and applied to the view on book open.
- **Render** — Highlights rendered in the Foliate engine view via `engine.addAnnotation()`.
- **Navigate** — Clicking an annotation in the sidebar list navigates to its location in the book.

### Dictionary
- **Trigger** — Double-click a word in the reading area, or press D key.
- **Popup** — Floating popup near the selected word showing: word, phonetic, part-of-speech, definitions (up to 3 per meaning), "Look up on Google" link.
- **Cache** — Last 50 lookups cached in memory to avoid redundant API calls.
- **Positioning** — Popup positioned near the selection rect, translated from iframe coordinates to host coordinates for Foliate iframes.
- **Dismiss** — Close button, or click outside the popup.

### Text-to-Speech (TTS)
- **TTS bar** — Floating bar inside the reading host with: rewind, play/pause, forward, stop, slower, speed display, faster, preset selector, engine label, voice selector, preview button, diagnostics button, snippet display.
- **TTS mini controls** — Compact controls in the footer bar (shown when TTS is active): prev, play/pause, next, snippet, sleep timer, stop.
- **Voice selection** — Populated from available system voices. Separate selectors in TTS bar and sidebar settings. Filterable by language.
- **Speed control** — Adjustable via slider (sidebar settings), +/- buttons (TTS bar), or keyboard shortcut.
- **Presets** — Natural, Clear, Fast Study, Slow & Steady. Each sets voice+speed combination.
- **Sleep timer** — Configurable (Off/10/20/30/60 minutes). Countdown display. Auto-stops TTS when timer expires.
- **Diagnostics** — Togglable diagnostics panel showing TTS engine state, voice info, error logs.
- **Return to TTS** — If user navigates away from the TTS position, a "Return to narration" button appears to jump back.
- **Highlighting** — Active paragraph, sentence, and word highlighting in the reading area during TTS playback.
- **Engine support** — WebSpeech API and Edge TTS engine. Falls back gracefully if neither available.

### Appearance & Theming
- **Themes** — Light, Sepia, Dark. Applied via `data-reader-theme` attribute. Affects the reading area background/text colors.
- **Font** — Serif, Sans-serif, Monospace. Applied to the reading engine.
- **Font size** — 8–30px. Slider in settings, applies immediately.
- **Line height** — 1.0–2.4. Slider in settings, applies immediately.
- **Margin** — 0–80px. Slider in settings, applies immediately.
- **Column mode** — Single column or auto-spread (2-column on wide screens). Toggle in settings.
- **Zen mode** — Hides toolbar, sidebar, and footer. Reading area fills the screen. Toggle with Z key or zen toggle in settings.
- **Fullscreen** — Native OS fullscreen toggle with F key or toolbar button.

### Keyboard Shortcuts
All handled by `reader_keyboard.js`. Current bindings (customizable via saved shortcuts):
- `T` — Toggle TTS play/pause
- `O` — Toggle sidebar
- `B` — Toggle bookmark at current position
- `D` — Dictionary lookup on selected word
- `Z` — Toggle zen mode
- `F` — Toggle fullscreen
- `H` — Toggle sidebar (alias)
- `M` — Cycle theme (Light → Sepia → Dark → Light)
- `V` — Next TTS voice
- `Shift+V` — Previous TTS voice
- `?` — Show keyboard shortcuts help
- `Ctrl+G` — Open go-to-page dialog
- `Ctrl+F` or `/` — Focus search input
- `Arrow Left/Right` — Previous/next page
- `Arrow Up/Down` — Scroll (in scrolled mode) or previous/next page
- `Space` — Next page
- `Shift+Space` — Previous page
- `Page Up/Down` — Previous/next page
- `Home/End` — Go to start/end of book
- `Alt+Left/Right` — History back/forward
- `Escape` — Priority chain: close goto dialog → close annotation popup → close dict popup → close TTS diagnostics → close sidebar → exit zen mode → close reader

### Error Handling
- **Error banner** — If a book fails to open, a banner appears with error title, detail message, Retry button, and Close button.
- **Engine fallback** — If the primary engine fails, tries legacy engine candidates before showing error.
- **Graceful degradation** — All modules wrapped in try/catch. Individual module failures don't crash the reader.

### Progress & State
- **Auto-save** — Progress saved periodically during reading (debounced) and on every page turn.
- **Restore on open** — When reopening a book, position is restored from saved progress.
- **Sidebar state persisted** — Sidebar open/closed state saved via `Tanko.api.booksUi` and restored on next open.
- **Settings persisted** — All appearance settings saved and restored across sessions.
- **Shortcut customization** — Custom shortcut bindings saved and restored.

---

## What You Need To Do

### Part 1: Review & Fix

Thoroughly audit the implementation for correctness. Read every file listed in the "Files to Review" section below. Verify that every feature in the inventory above actually works as described. Look for:

1. **Event bus wiring gaps** — Every `bus.emit('event:name')` must have a matching `bus.on('event:name')` listener somewhere. Every `bus.on(...)` that expects arguments must receive the right arguments from the emit site. Cross-check all bus events across all 13 modules.

2. **DOM element mismatches** — Every `qs('someId')` in `reader_state.js:ensureEls()` must have a matching `id="someId"` in `src/index.html` inside `#booksReaderView`. Any element ID used via direct `document.getElementById()` in any module must also exist in the HTML.

3. **Module load-order issues** — Modules load sequentially via `loadScriptChain` in `deferred_modules.js`. Each module runs its IIFE immediately on load. If module A's IIFE references `window.booksReaderX` (set by module X), then module X must load *before* module A. Verify the chain order is correct:
   ```
   reader_bus → reader_state → reader_appearance → reader_dict → reader_search →
   reader_bookmarks → reader_annotations → reader_toc → reader_nav →
   reader_sidebar → reader_tts_ui → reader_keyboard → reader_core
   ```
   Note: `reader_core.js` runs `bind()` at IIFE time (line 357), which calls `modules[i].bind()` for all sub-modules. This means all sub-modules must already exist on `window.*` when `reader_core.js` loads.

4. **Lifecycle hook correctness** — `reader_core.js` calls each module's `onOpen()` and `onClose()` during the open/close lifecycle. Verify that:
   - All modules that need setup on open have `onOpen()` exported
   - All modules that need cleanup on close have `onClose()` exported
   - No module does work in `onOpen()` that depends on another module's `onOpen()` having run first (they run in array order)

5. **Backwards-compatible API** — `library.js` calls `window.booksReaderController.open(book)`, `.close()`, and `.isOpen()`. Verify `reader_core.js` exports these correctly and they work as library.js expects.

6. **CSS completeness** — Verify that `books-reader.css` styles every class used in the HTML. Check for orphan classes (in HTML but not in CSS) or dead rules (in CSS but no matching HTML).

7. **Removed features that left dangling references** — We removed: click zones (`#booksClickZones`), HUD bars (`.booksHudTop`, `.booksHudBottom`), mega overlay (`#booksMegaOverlay`), theme/font overlay (`#booksThemeFontOverlay`), TOC fullscreen overlay (`#booksTocOverlay`). Verify no JS module still references these removed elements.

8. **Feature completeness** — Walk through every feature in the inventory above. For each one, trace the full code path from user action → JS handler → bus event → module function → engine/API call → DOM update. Flag anything that's missing, broken, or only partially wired.

9. **Edge cases** — What happens when:
    - A book fails to open (error banner should appear with retry)
    - The user opens a PDF (PDF-specific controls in sidebar settings should enable; TTS and annotation features should be disabled/hidden)
    - The user opens a plain .txt file (text engine, limited features)
    - The sidebar is collapsed and the user presses a keyboard shortcut for a sidebar tab
    - The user is in zen mode and needs to access settings
    - TTS is playing and the user navigates away then clicks "Return to narration"
    - The user switches themes while TTS is active
    - The window is resized while reading (responsive layout)
    - The user closes the reader mid-TTS playback
    - A search finds zero results

### Part 2: Refine Using Reader Design Principles

After fixing all bugs, refine the reader's look, feel, and UX. Use these references for inspiration and best practices:

- **Readest** — Source code available locally at `projects/Readest/` (sibling directory to `Tankoban Max/`). Study its reader UI, sidebar design, transitions, settings panel, and overall polish. Read its source to understand how it handles theming, layout, and user interactions.
- **Thorium Reader** — Source code available locally at `projects/thorium-reader-develop/` (sibling directory). Study its accessibility approach, keyboard navigation, sidebar organization, theming, and OPDS/annotation handling. Read its source to understand how a mature reader structures its UI.
- **General EPUB reader UX conventions** — Search the web for established design patterns, user expectations, and accessibility standards for desktop EPUB readers. Study what users expect from modern reading software.

Read the Readest and Thorium source code directly to understand their design decisions. Use what you learn to identify where our reader falls short of modern standards and apply refinements. Focus on making every feature in the inventory above feel polished, discoverable, and pleasant to use. The reader should feel as natural as the best desktop reading apps — controls should be discoverable but never intrusive, the reading area should feel spacious, and every interaction should provide clear feedback.

Apply improvements **only to the files listed in "Core implementation" below** (do NOT touch engine files, tts_core.js, or any files outside `projects/Tankoban Max/src/`).

---

## Files to Review

All paths relative to project root (`projects/Tankoban Max/`).

### Core implementation (READ + FIX + REFINE these):
```
src/domains/books/reader/reader_bus.js          (28 lines)   — Event bus
src/domains/books/reader/reader_state.js        (433 lines)  — Shared state, ensureEls, settings
src/domains/books/reader/reader_core.js         (373 lines)  — Open/close orchestrator
src/domains/books/reader/reader_nav.js          (439 lines)  — Navigation, scrub bar, goto
src/domains/books/reader/reader_sidebar.js      (134 lines)  — Sidebar toggle, tabs
src/domains/books/reader/reader_toc.js          (166 lines)  — Table of contents
src/domains/books/reader/reader_search.js       (143 lines)  — In-book search
src/domains/books/reader/reader_bookmarks.js    (215 lines)  — Bookmark CRUD
src/domains/books/reader/reader_annotations.js  (404 lines)  — Annotation CRUD
src/domains/books/reader/reader_dict.js         (247 lines)  — Dictionary lookup
src/domains/books/reader/reader_tts_ui.js       (651 lines)  — TTS UI controls
src/domains/books/reader/reader_appearance.js   (272 lines)  — Theme, font, settings
src/domains/books/reader/reader_keyboard.js     (184 lines)  — Keyboard handler
src/styles/books-reader.css                     (575 lines)  — All reader CSS
src/index.html                                  (lines 396-699) — Reader HTML section
```

### Context files (READ but do NOT modify):
```
src/domains/books/reader/engine_foliate.js     — Foliate engine (epub/pdf rendering)
src/domains/books/reader/engine_txt.js         — Plain text engine
src/domains/books/reader/tts_core.js           — TTS engine orchestrator
src/domains/books/reader/tts_engine_webspeech.js
src/domains/books/reader/tts_engine_edge.js
src/domains/books/library.js                   — Library UI (calls booksReaderController)
src/state/deferred_modules.js                  — Module load chain
src/styles/styles.css                          — Shared app styles (only remove dead rules)
tools/smoke_check.js                           — Smoke test (update if you change IDs)
```

### Reference file (READ for comparison, do NOT load at runtime):
```
src/domains/books/reader/controller.js         — OLD monolithic controller (3,437 lines, kept for reference)
```

---

## Architecture Rules

1. **No frameworks, no bundler, no ES modules.** All code uses vanilla JS IIFEs: `(function() { 'use strict'; ... })();`
2. **CSS class prefix:** All new classes must start with `br-` to avoid conflicts.
3. **Element IDs:** Preserve all existing IDs. New elements should use descriptive IDs following the existing patterns (`booksReader*`, `booksUtil*`, `books*`).
4. **Event bus:** Use `window.booksReaderBus` (on/off/emit) for inter-module communication. Do NOT add direct cross-module function calls.
5. **State:** Use `window.booksReaderState.state` for shared mutable state. Each module accesses it via `RS.state`.
6. **ensureEls() caching:** DOM references are cached in `ensureEls()`. If you add new elements, add them to ensureEls. The cache is cleared on close (set to null) and rebuilt on next call.
7. **Module exports:** Each module exports via `window.booksReader<Name> = { bind, onOpen, onClose, ... }`.
8. **Do NOT modify:** `app/` directory, `src/vendor/`, engine files, tts_core.js, preload, main process, IPC.
9. **Code style:** Match existing style (var not const/let in IIFEs, try/catch wrapping, graceful degradation). Every change gets a `BUILD_OVERHAUL` tag comment.
10. **Minimal diffs:** Don't add docstrings/comments/type annotations to code you didn't change. Don't refactor surrounding code.

---

## Verification Checklist

After all changes, verify:

- [ ] `node tools/smoke_check.js` passes
- [ ] All element IDs in ensureEls() exist in the HTML
- [ ] All bus events have matching emitters and listeners
- [ ] **EPUB:** open → title in toolbar → TOC populates → pages turn → progress saves → close → reopen → position restored
- [ ] **PDF:** open → PDF controls enabled in Settings → fit page/width works → zoom works → page navigation works
- [ ] **TXT:** open → text renders → pagination works → close
- [ ] **Sidebar:** all 5 tabs switch correctly with content rendering for each
- [ ] **TOC:** chapters listed with hierarchy → filter works → click navigates → current chapter highlighted → arrow key navigation
- [ ] **Search:** query → results appear → prev/next navigation → highlights in reading area → clear search
- [ ] **Bookmarks:** B key toggles → star updates → appears in list with snippet → click navigates → delete removes → persists across sessions
- [ ] **Annotations:** select text → right-click → popup with color/style → save → highlight visible → edit existing → delete → list in sidebar → click navigates → persists across sessions
- [ ] **Dictionary:** double-click word → popup near selection → definition shown → phonetic shown → Google link works → close popup → cache prevents redundant lookups
- [ ] **TTS:** T key starts → bar appears → highlight follows text → speed +/- works → voice switch works → preset applies → mini controls in footer → sleep timer countdown → stop cleans up → return-to-TTS button works after navigating away
- [ ] **Appearance:** theme chips switch entire UI (toolbar + sidebar + footer + reading area) → font change applies → font size slider applies live → line height applies live → margin applies live → column toggle works → flow mode toggle works
- [ ] **Keyboard:** all shortcuts from the inventory work → Escape chain (goto → annot → dict → diag → sidebar → zen → close) → customized shortcuts persist
- [ ] **Zen mode:** Z key hides toolbar/sidebar/footer → reading fills screen → Z again restores → settings accessible via Escape first
- [ ] **Fullscreen:** F key toggles → combined with zen mode works
- [ ] **Go-to:** Ctrl+G opens → enter page/percentage → navigates → cancel/escape closes
- [ ] **Error handling:** open corrupt file → error banner → retry works → close works
- [ ] **Progress:** auto-saves during reading → restored on reopen → scrub bar reflects position
- [ ] **Responsive:** window resize doesn't break layout → sidebar goes fullwidth on narrow screens → nav arrows adjust
- [ ] **History:** navigate chapters → Alt+Left goes back → Alt+Right goes forward → buttons disabled when no history
