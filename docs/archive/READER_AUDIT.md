# EPUB/PDF/TXT Reader — Comprehensive Feature Audit

> **Purpose**: This document catalogs every feature, behavior, and UI element in the Tankoban Max reader. Use it to systematically verify each feature works correctly.
>
> **How to use**: For each feature listed below, test it and report one of:
> - **WORKING** — Feature works as described
> - **BUGGY** — Feature partially works but has issues (describe the issue)
> - **BROKEN** — Feature does not work at all (describe what happens)
> - **UNTESTABLE** — Cannot test (explain why)
>
> Open an EPUB, a PDF, and a TXT file to test format-specific features.

---

## Architecture Overview

The reader is built as a set of IIFE modules that communicate via a pub/sub event bus (`window.booksReaderBus`). Each module exports to a `window.booksReader*` global. The orchestrator (`reader_core.js`) calls `bind()` on all modules at startup, and `onOpen()`/`onClose()` on each when a book opens/closes.

### Module Load Order (via `deferred_modules.js`)
Scripts are loaded in parallel groups:
1. **Group 1** (parallel): `engine_foliate.js`, `engine_epub.js`, `engine_pdf.js`, `engine_txt.js`, `tts_engine_edge.js`, `tts_engine_webspeech.js`, `reader_bus.js`
2. **Group 2** (parallel): `reader_state.js`, `tts_core.js`
3. **Group 3** (parallel): `reader_overlays.js`, `reader_appearance.js`, `reader_dict.js`, `reader_search.js`, `reader_bookmarks.js`, `reader_annotations.js`, `reader_toc.js`, `reader_nav.js`, `reader_sidebar.js`, `reader_tts_ui.js`, `reader_keyboard.js`
4. **Group 4** (sequential): `reader_core.js`
5. **Group 5** (sequential): `library.js`

### Files & Their Exports

| File | Export | Role |
|------|--------|------|
| `reader_bus.js` | `window.booksReaderBus` | Pub/sub event bus (on/off/emit/clear) |
| `reader_state.js` | `window.booksReaderState` | Shared state, DOM refs (`ensureEls()`), settings persistence, helpers |
| `reader_core.js` | `window.booksReaderController` | Orchestrator: open/close lifecycle, module wiring |
| `reader_nav.js` | `window.booksReaderNav` | Page navigation, scrub bar, chapter progress, goto dialog, chapter transition |
| `reader_overlays.js` | `window.booksReaderOverlays` | Floating overlay panels (search, bookmarks, annotations, settings) |
| `reader_sidebar.js` | `window.booksReaderSidebar` | TOC sidebar toggle/persistence |
| `reader_toc.js` | `window.booksReaderToc` | Table of contents rendering, navigation, active highlight, per-chapter progress |
| `reader_appearance.js` | `window.booksReaderAppearance` | Theme, font, flow mode, PDF zoom, settings panel sync |
| `reader_dict.js` | `window.booksReaderDict` | Dictionary popup (double-click or D key lookup) |
| `reader_search.js` | `window.booksReaderSearch` | In-book text search with prev/next navigation |
| `reader_bookmarks.js` | `window.booksReaderBookmarks` | Bookmark toggle, list, persistence |
| `reader_annotations.js` | `window.booksReaderAnnotations` | Text annotation with colors, styles, notes |
| `reader_tts_ui.js` | `window.booksReaderTtsUI` | TTS UI controls, voice picker, sleep timer, diagnostics |
| `reader_keyboard.js` | `window.booksReaderKeyboard` | All keyboard shortcuts, shortcut editor |
| `tts_core.js` | `window.booksTTS` | TTS state machine, text extraction, segment management |
| `tts_engine_edge.js` | `window.booksTTSEngines.edge` | Edge Neural TTS engine (IPC to main process) |
| `tts_engine_webspeech.js` | `window.booksTTSEngines.webspeech` | Web Speech API fallback engine |
| `engine_foliate.js` | `window.booksReaderEngines.epub` / `.pdf` | Primary Foliate-based engine for EPUB and PDF |
| `engine_epub.js` | `window.booksReaderEngines.epub_legacy` | Legacy epub.js fallback engine |
| `engine_pdf.js` | `window.booksReaderEngines.pdf_legacy` | Legacy pdfjs-dist fallback engine |
| `engine_txt.js` | `window.booksReaderEngines.txt` | Plain text file engine |

---

## 1. BOOK OPENING & CLOSING

### 1.1 Open Book
- **File**: `reader_core.js:118-285`
- **Bus event**: `books-reader-opened` (window CustomEvent)
- **Behavior**:
  1. Validates book input (must have `id`, `path`, `format` in `[epub, pdf, txt]`)
  2. Loads user settings from IPC (`Tanko.api.booksSettings.get()`)
  3. Closes any previously open book (calls `close({ save: false, silent: true })`)
  4. Shows reader view, sets title from book metadata or filename
  5. Loads saved progress from IPC (`Tanko.api.booksProgress.get(bookId)`)
  6. Restores user keyboard shortcuts from IPC (`Tanko.api.booksUi.get()`)
  7. Tries engine candidates in order (primary then legacy fallback)
  8. On success: calls `onOpen()` on all 11 sub-modules
  9. On failure: shows error banner with retry option
- **Test**: Open an EPUB. Verify it loads, title appears in header, and content renders.
- **Test**: Open a PDF. Verify it loads with page rendering.
- **Test**: Open a TXT file. Verify it loads as formatted paragraphs.
- **Test**: Try to open a corrupted/missing file. Verify error banner appears with "Retry" and "Close" buttons.

### 1.2 Close Book
- **File**: `reader_core.js:64-114`
- **Bus event**: `reader:close`, `books-reader-closed` (window CustomEvent)
- **Behavior**:
  1. Calls `onClose()` on all 11 sub-modules
  2. Saves progress (unless `save: false`)
  3. Destroys engine instance
  4. Resets state (book, searchHits, tocItems, bookmarks, annotations)
  5. Clears host innerHTML and hides reader view
  6. Removes `zenMode` class
  7. Nulls cached DOM refs (`state.els = null`)
- **Test**: Open a book, read to middle, close. Re-open the same book. Verify it resumes at saved position.
- **Test**: Close button in toolbar should close the reader.
- **Test**: Back button should close the reader.

### 1.3 Error Banner
- **File**: `reader_state.js:366-378`
- **Elements**: `booksReaderErrorBanner`, `booksReaderErrorTitle`, `booksReaderErrorDetail`, `booksReaderErrorRetry`, `booksReaderErrorClose`
- **Behavior**: Shows error title + detail. Retry re-opens last book. Close hides banner and closes reader.
- **Test**: Force an error (e.g., delete the book file). Verify banner shows, retry works if file restored, close works.

---

## 2. PAGE NAVIGATION

### 2.1 Next/Previous Page
- **File**: `reader_nav.js:10-24`
- **Bus events**: `nav:next`, `nav:prev`
- **Behavior**: Calls `engine.next()` / `engine.prev()`, then saves progress and syncs UI.
- **Test (EPUB)**: Click right arrow, press Right arrow key, press Space, press PageDown. All should advance one page.
- **Test (EPUB)**: Click left arrow, press Left arrow key, press Shift+Space, press PageUp. All should go back one page.
- **Test (PDF)**: Arrow keys should advance/go back pages.
- **Test (TXT)**: Arrow keys should scroll the text view.

### 2.2 Scrolled Mode Navigation
- **File**: `reader_keyboard.js:264-275`
- **Behavior**: In scrolled flow mode for EPUB, ArrowDown/ArrowUp emit `nav:seek` with small delta (0.02) instead of page turns.
- **Test**: Switch to scrolled mode. Press Up/Down arrows. Should scroll smoothly rather than jump pages.

### 2.3 Home / End Keys
- **File**: `reader_keyboard.js:276-285`
- **Bus events**: `nav:seek(0)`, `nav:seek(1)`
- **Test**: Press Home. Should go to beginning of book. Press End. Should go to end.

### 2.4 Chapter Navigation (Ctrl+Arrow)
- **File**: `reader_keyboard.js:172-181`, `reader_nav.js:409-434`
- **Bus events**: `nav:next-chapter`, `nav:prev-chapter`
- **Behavior**: Ctrl+Right advances to next spine section. Ctrl+Left goes to previous section. Bypasses the boundary pause mechanism.
- **Test (EPUB)**: Press Ctrl+Right. Should jump to next chapter. Press Ctrl+Left. Should jump to previous chapter.
- **Test**: If chapter transition card is open, these should dismiss it first.

### 2.5 History Back/Forward
- **File**: `reader_nav.js:340-347`, `reader_keyboard.js:237-246`
- **Bus events**: None (direct engine calls)
- **Behavior**: Alt+Left goes back in navigation history. Alt+Right goes forward. History buttons in toolbar enabled/disabled based on availability.
- **Elements**: `booksReaderHistBack`, `booksReaderHistFwd`
- **Test**: Navigate to a TOC item (jumping ahead). Press Alt+Left. Should return to previous position. Press Alt+Right. Should go forward again.
- **Test**: History buttons should be disabled when no history exists.

---

## 3. SCRUB BAR (Progress Bar)

### 3.1 Chapter-Local Progress (EPUB/TXT)
- **File**: `reader_nav.js:47-143`
- **Elements**: `booksReaderScrub`, `booksReaderScrubFill`, `booksReaderScrubThumb`, `booksReaderScrubBubble`
- **Behavior**:
  - For EPUB/TXT: The main scrub bar shows **chapter-local progress** (0-100% within current chapter), NOT whole-book progress.
  - Computes chapter-local fraction using `engine.getSectionFractions()` to find section boundaries.
  - Section index is 0-based from Foliate's `SectionProgress.getProgress()`.
  - The page text label shows: `"Chapter Name  ·  42%"` format.
  - Scrub bubble shows chapter name + percentage.
- **Test (EPUB)**: Open a multi-chapter EPUB. Navigate within a chapter. Scrub bar should fill 0→100% within the chapter, then reset when entering next chapter.
- **Test**: The text below the scrub bar should show the current chapter name and chapter-local percentage.

### 3.2 Whole-Book Progress Bar
- **File**: `reader_nav.js:149-195`
- **Elements**: `booksReaderChapterFill`, `booksReaderChapterText`
- **Behavior**:
  - The thin bar ABOVE the scrub bar shows **whole-book progress** (0-100% of entire book).
  - Label format: `"Chapter Name  ·  3 / 12  ·  42% book"`
  - Tracks per-chapter read state in `state.chapterReadState[spineIndex]` for TOC playlist.
  - Emits `chapter:progress` bus event.
- **Test (EPUB)**: Verify the thin bar above the main scrub bar shows book-level progress.
- **Test**: The label should show chapter number, total chapters, and whole-book percentage.

### 3.3 PDF Progress
- **File**: `reader_nav.js:69-85`
- **Behavior**: PDF uses whole-document progress in the scrub bar. Shows page numbers like "3/15".
- **Test (PDF)**: Scrub bar should show whole-document progress. Page text should show "page/total".

### 3.4 Scrub Bar Dragging
- **File**: `reader_nav.js:502-590`
- **Behavior**: Pointer/mouse drag on scrub bar. Uses pointer capture for smooth dragging. Click also seeks.
- **Test**: Click on the scrub bar. Should seek to that position.
- **Test**: Click and drag the scrub bar. Should smoothly update position while dragging, then seek on release.
- **Test**: For EPUB/TXT, dragging converts chapter-local fraction to whole-book fraction before seeking.

### 3.5 Scrub Bar Keyboard
- **File**: `reader_nav.js:578-589`
- **Behavior**: When scrub bar is focused: Arrow keys step by 2%, Home goes to 0, End goes to 100%.
- **Test**: Tab to focus the scrub bar. Use arrow keys to step through progress.

### 3.6 Chapter Markers (PDF only)
- **File**: `reader_nav.js:313-336`
- **Behavior**: For PDF, thin vertical marks on scrub bar at chapter boundaries. Not rendered for EPUB/TXT (scrub is chapter-local).
- **Test (PDF)**: Open a PDF with bookmarks/outline. Verify thin marks appear on scrub bar at chapter positions.

---

## 4. CHAPTER TRANSITION UI

### 4.1 Boundary Pause
- **File**: `engine_foliate.js:446-451, 760-770`, `vendor/foliate/paginator.js` (modified `#turnPage`)
- **Behavior**: When reaching end/start of a spine section, instead of auto-advancing, a `section-boundary` event fires. This pauses at the chapter boundary.
- **Only for EPUB** (not PDF).
- **Test (EPUB)**: Navigate to the last page of a chapter. Press Next. Instead of silently entering next chapter, a transition card should appear.

### 4.2 Transition Card
- **File**: `reader_nav.js:211-268`
- **Elements**: `booksChapterTransition`, `booksChapterTransCurrent`, `booksChapterTransNext`, `booksChapterTransContinue`, `booksChapterTransCountdown`
- **Behavior**:
  1. Shows overlay with "End of chapter" label
  2. Displays current chapter name and next chapter name (looked up via `tocItems` and `spineIndex`)
  3. "Continue" button advances immediately
  4. 3-second auto-advance countdown
  5. In scrolled mode, card anchors to bottom of viewport
  6. If transition is already showing and user presses Next again, auto-advances (treats as "continue")
- **Test**: At chapter boundary, verify card shows with correct chapter names.
- **Test**: Wait 3 seconds. Should auto-advance to next chapter.
- **Test**: Click "Continue". Should advance immediately.
- **Test**: Press Next while card is showing. Should advance immediately (no double-card).

### 4.3 Escape Dismisses Transition
- **File**: `reader_keyboard.js:219-223`
- **Behavior**: Pressing Escape when transition card is visible dismisses it WITHOUT advancing.
- **Test**: At boundary, card appears. Press Escape. Card should hide, reader stays at current chapter end.

---

## 5. TABLE OF CONTENTS (TOC) — SIDEBAR

### 5.1 TOC Rendering
- **File**: `reader_toc.js:19-89`
- **Elements**: `booksTocList`, `booksTocSearch`
- **Behavior**:
  - Gets TOC from engine (`engine.getToc()`)
  - For Foliate engine: flattens TOC with `depth` for indentation and `spineIndex` for progress tracking
  - Each TOC item is a `<button class="br-list-item volNavItem">` with:
    - **Status dot** (`.br-toc-status`): grey=unread, accent=partial (>2%), green=read (>95%)
    - **Label span** (`.br-toc-label`): chapter title
    - **Progress mini bar** (`.br-toc-progress` + `.br-toc-progress-fill`)
    - Indentation via `paddingLeft` based on `depth`
  - `data-spine-index` attribute for live progress updates
- **Test (EPUB)**: Open sidebar. Verify TOC items appear with status dots and mini progress bars.
- **Test**: Nested chapters should be indented.

### 5.2 TOC Navigation
- **File**: `reader_toc.js:92-98`
- **Behavior**: Clicking a TOC item navigates to that chapter via `engine.goTo({ href })`.
- **Test**: Click a TOC item. Should navigate to that chapter. Scrub bar should update.

### 5.3 Active Chapter Highlight
- **File**: `reader_toc.js:101-141`
- **Bus event**: `reader:relocated`
- **Behavior**:
  - Active TOC item gets `.active` class
  - "Now" badge (`.br-toc-now`) is added to active item
  - Active item auto-scrolls into view with `scrollIntoView({ block: 'nearest', behavior: 'smooth' })`
  - Subtitle bar updates with current chapter name
- **Test (EPUB)**: Navigate to different chapters. The TOC should highlight the current chapter with a "Now" badge.
- **Test**: If TOC list is long, the active item should auto-scroll into view.

### 5.4 TOC Search/Filter
- **File**: `reader_toc.js:163-183`
- **Behavior**: Typing in the TOC search input filters the list by label text. Escape closes sidebar. ArrowDown focuses first TOC item.
- **Test**: Type in the TOC search box. Only matching chapters should be visible.

### 5.5 TOC Keyboard Navigation
- **File**: `reader_toc.js:186-209`
- **Behavior**: ArrowDown/ArrowUp navigates between TOC items. Enter activates. Escape closes sidebar.
- **Test**: Use arrow keys to navigate TOC items, Enter to select.

### 5.6 Live Per-Chapter Progress
- **File**: `reader_toc.js:145-160`
- **Bus event**: `chapter:progress`
- **Behavior**: As you read, each TOC item's mini progress bar and status dot update in real-time.
- **Test**: Read through a chapter. Check that the TOC item's progress bar fills up, and the status dot changes from grey to accent to green.

### 5.7 Sidebar Toggle
- **File**: `reader_sidebar.js:10-24`
- **Bus events**: `sidebar:toggle`, `sidebar:close`
- **Elements**: `booksSidebar`, `booksReaderTocNavBtn`
- **Behavior**: Toggle sidebar visibility. State persisted via `Tanko.api.booksUi.save()`. Restored on next book open.
- **Test**: Click the TOC button in toolbar. Sidebar should toggle. Close reader, reopen. Sidebar state should be remembered.

---

## 6. OVERLAY PANELS

### 6.1 Overlay System
- **File**: `reader_overlays.js`
- **Overlays**: `search`, `bookmarks`, `annotations`, `settings`
- **Behavior**:
  - Only one overlay open at a time (opening one closes others)
  - Positioned below their toolbar button (except settings: centered modal)
  - Backdrop click closes all overlays
  - Close buttons inside overlays close all
  - Auto-focuses first input when opened
- **Test**: Open search overlay. Then click bookmarks button. Search should close, bookmarks should open.
- **Test**: Click the backdrop. All overlays should close.

### 6.2 Search Overlay
- **File**: `reader_search.js`
- **Elements**: `booksUtilSearchInput`, `booksUtilSearchBtn`, `booksUtilSearchCount`, `booksUtilSearchPrev`, `booksUtilSearchNext`
- **Bus events**: `search:run`, `search:prev`, `search:next`, `search:clear`
- **Behavior**:
  1. Type query, press Enter or click Search
  2. Engine searches all content (EPUB: async iterator over CFIs, PDF: page-by-page text, TXT: DOM text walker)
  3. Shows match count: "3/15"
  4. Prev/Next buttons cycle through matches
  5. Navigates to match location in content
  6. Escape closes overlay
- **Test (EPUB)**: Search for a word. Verify match count, prev/next navigation, and highlighting.
- **Test (PDF)**: Search for text. Should navigate to the page containing it.
- **Test (TXT)**: Search for text. Should highlight matches with `<mark>` elements and scroll to active match.

### 6.3 Bookmarks Overlay
- **File**: `reader_bookmarks.js`
- **Elements**: `booksUtilBookmarkToggle`, `booksUtilBookmarkList`
- **Bus events**: `bookmark:toggle`, `bookmark:goto`, `bookmarks:render`
- **Behavior**:
  1. Toggle bookmark at current position (B key or star button)
  2. Bookmark snippet shows chapter name + percentage (EPUB) or page number (PDF)
  3. Bookmark list shows all bookmarks sorted by most recent
  4. Click bookmark navigates to its location
  5. Delete button (×) removes bookmark
  6. Star icon toggles between filled (★) and unfilled (☆) based on whether current position is bookmarked
  7. Bookmarks persisted via `Tanko.api.booksBookmarks`
- **Test**: Press B. Toast should say "Bookmark added". Star should fill. Press B again. Toast should say "Bookmark removed".
- **Test**: Open bookmarks overlay. Click a bookmark. Should navigate to that position.
- **Test**: Delete a bookmark via × button.

### 6.4 Annotations Overlay
- **File**: `reader_annotations.js`
- **Elements**: `booksAnnotPopup`, `booksAnnotClose`, `booksAnnotColorPicker`, `booksAnnotStylePicker`, `booksAnnotNote`, `booksAnnotSave`, `booksAnnotDelete`, `booksUtilAnnotationList`
- **Bus events**: `annot:show-popup`, `annot:hide-popup`, `annot:save`, `annot:delete`
- **Behavior**:
  1. **EPUB only** (not available for PDF or TXT)
  2. Right-click on selected text opens annotation popup (if selection > 2 chars and has a valid CFI)
  3. Popup shows color picker (6 colors: yellow, pink, orange, green, blue, purple)
  4. Style picker (highlight, underline, strikethrough, outline)
  5. Optional note textarea
  6. Save persists via `Tanko.api.booksAnnotations`
  7. Annotations rendered as overlays in EPUB via Foliate's `Overlayer` class
  8. Annotation list in overlay shows text preview + color dot + optional note
  9. Click annotation in list navigates to it via `engine.showAnnotation()`
  10. Delete button removes annotation
  11. Editing: clicking an existing annotation opens popup with pre-filled data
  12. On section change (`create-overlay` event), annotations are re-applied
- **Test (EPUB)**: Select text, right-click. Annotation popup should appear. Choose color, style, add note. Save.
- **Test**: Open annotations overlay. Saved annotation should appear with color dot and text preview.
- **Test**: Click annotation in list. Should navigate to it in the book.
- **Test**: Delete annotation. Should be removed from both overlay and book view.
- **Test (PDF/TXT)**: Annotation overlay should show "Annotations are unavailable for this format".

### 6.5 Settings Overlay
- **File**: `reader_appearance.js`, `reader_keyboard.js` (shortcut editor)
- **Behavior**: Contains theme selection, typography controls, flow/zen toggles, TTS settings, sleep timer, and keyboard shortcuts.
- **Opened by**: K or ? key, or clicking the settings toolbar button.
- **Test**: Press K. Settings overlay should open with all sections visible.

---

## 7. APPEARANCE / SETTINGS

### 7.1 Theme Selection
- **File**: `reader_appearance.js:95-109`
- **Themes**: `light`, `sepia`, `dark`
- **Bus event**: `appearance:cycle-theme`
- **Behavior**: Theme chips in settings overlay. Cycling: light → sepia → dark → light. Applied via `data-reader-theme` attribute on reader view and host.
- **EPUB**: Injects CSS with theme-appropriate colors into iframe.
- **Test**: Click each theme chip. Book content colors should change.
- **Test**: Press M (default shortcut). Should cycle through themes with toast notification.

### 7.2 Font Size
- **File**: `reader_appearance.js:179-185`
- **Range**: 8–30px
- **Element**: `booksReaderFontSizeSlider`, `booksReaderFontSizeValue`
- **Test (EPUB)**: Drag font size slider. Text size should change live. Value label should update.

### 7.3 Font Family
- **File**: `reader_appearance.js:172-176`
- **Options**: `serif` (Georgia), `sans-serif` (system-ui), `monospace` (Cascadia Code)
- **Element**: `booksReaderFontFamily`
- **Test (EPUB)**: Change font family dropdown. Text should re-render in new font.

### 7.4 Line Height
- **File**: `reader_appearance.js:188-194`
- **Range**: 1.0–2.4
- **Element**: `booksReaderLineHeightSlider`, `booksReaderLineHeightValue`
- **Test (EPUB)**: Drag line height slider. Spacing between lines should change.

### 7.5 Margin
- **File**: `reader_appearance.js:197-203`
- **Range**: 0–80px
- **Element**: `booksReaderMarginSlider`, `booksReaderMarginValue`
- **Test (EPUB)**: Drag margin slider. Content margins should change.

### 7.6 Column Mode (Spread vs Single)
- **File**: `reader_appearance.js:206-212`
- **Element**: `booksReaderColumnToggle` (checkbox)
- **Behavior**: Checked = auto/spread (2 columns on wide screens), Unchecked = single column.
- **Test (EPUB)**: Toggle column mode. On a wide window, should switch between 1 and 2 column layout.

### 7.7 Flow Mode (Paginated vs Scrolled)
- **File**: `reader_appearance.js:128-140`
- **Element**: `brSettingsFlowToggle` (checkbox), `booksReaderFlowBtn` (footer button)
- **Bus event**: None (direct engine call)
- **Behavior**: Switches between paginated (discrete pages) and scrolled (continuous scroll) flow.
- **Test (EPUB)**: Toggle flow mode. Content should switch between paginated and scrolled rendering.
- **Test**: The footer flow button icon should update (↕ for scrolled, ◻ for paginated).

### 7.8 Zen Mode
- **File**: `reader_core.js:38-43`
- **Element**: `brSettingsZenToggle` (checkbox), `booksReaderZenBtn`
- **Behavior**: Adds `zenMode` class to reader view, hiding toolbar/footer/sidebar for distraction-free reading.
- **Test**: Press Z (default shortcut). Toolbar and footer should hide. Press Z again to restore.
- **Test**: Zen toggle checkbox in settings should stay in sync.

### 7.9 Fullscreen
- **File**: `reader_core.js:47-49`
- **Element**: `booksReaderFsBtn`
- **Bus event**: `reader:fullscreen`
- **Behavior**: Calls `Tanko.api.window.toggleFullscreen()`.
- **Test**: Press F (default shortcut) or click fullscreen button. Window should toggle fullscreen.

### 7.10 PDF Controls
- **File**: `reader_appearance.js:113-124`
- **Elements**: `booksReaderFitPageBtn`, `booksReaderFitWidthBtn`, `booksReaderZoomDown`, `booksReaderZoomUp`
- **Behavior**: Fit Page, Fit Width, Zoom In (+0.1), Zoom Out (-0.1). Only enabled for PDF.
- **Test (PDF)**: Click Fit Width. PDF should scale to fill width. Click Fit Page. Should fit entire page. Zoom in/out should work.
- **Test (EPUB)**: These buttons should be disabled.

### 7.11 Settings Persistence
- **File**: `reader_state.js:381-395`
- **Behavior**: All settings (theme, fontSize, fontFamily, lineHeight, margin, flowMode, columnMode, ttsRate, ttsVoice, ttsPreset) are saved via `Tanko.api.booksSettings.save()` and restored on next open.
- **Test**: Change font size to 24. Close reader. Reopen. Font size should still be 24.

---

## 8. DICTIONARY LOOKUP

### 8.1 Double-Click Lookup
- **File**: `reader_dict.js:172-208`
- **Behavior**: Double-clicking text in the EPUB iframe extracts the selected word (first word of selection, max 40 chars), positions popup near selection, looks up via `Tanko.api.dictionary.lookup(word)`.
- **Test (EPUB)**: Double-click a word. Dictionary popup should appear near the word with definition, phonetic, and part of speech.

### 8.2 D Key Lookup
- **File**: `reader_keyboard.js:288-292`
- **Bus event**: `dict:lookup`
- **Behavior**: Pressing D (default shortcut) triggers dictionary lookup on selected text.
- **Test**: Select a word, press D. Dictionary popup should appear.

### 8.3 Dictionary Popup
- **File**: `reader_dict.js:30-78`
- **Elements**: `booksReaderDictPopup`, `booksReaderDictWord`, `booksReaderDictBody`, `booksReaderDictClose`
- **Behavior**:
  - Shows word, phonetic, meanings (up to 3 definitions per part of speech)
  - "Look up on Google" link opens external browser
  - Close button hides popup
  - Clicking outside popup hides it
  - Results cached (LRU cache, max 50 entries)
  - Popup positioned anchored to selection rect, translated from iframe coordinates
- **Test**: Look up a word. Verify phonetic, definitions appear.
- **Test**: Click "Look up on Google". Should open browser with Google define search.
- **Test**: Click close button or click outside. Popup should hide.
- **Test**: Look up same word again. Should show instantly (cached).

### 8.4 Context Menu → Annotation/Dictionary
- **File**: `reader_core.js:206-243`
- **Behavior**: Right-click in EPUB iframe:
  - If text selected (>2 chars) and CFI available → opens annotation popup
  - Otherwise, if text selected → opens dictionary lookup
- **Test (EPUB)**: Select a long phrase, right-click. Annotation popup should appear.
- **Test (EPUB)**: Select a single word, right-click. Dictionary popup should appear.

---

## 9. TEXT-TO-SPEECH (TTS)

### 9.1 TTS Initialization
- **File**: `reader_tts_ui.js:14-79`, `tts_core.js:596-675`
- **Behavior**:
  1. Creates engine instances for `edge` and `webspeech` (in priority order)
  2. Probes each engine for availability (Edge requires successful synthesis probe)
  3. Selects first usable engine
  4. If Edge unavailable, falls back to WebSpeech with fallback notification
  5. Loads voices, applies saved voice/rate/preset
  6. Only available for EPUB and TXT formats (not PDF)
- **Test (EPUB)**: Open a book. The TTS launch button (🔊) in toolbar should be enabled.
- **Test (PDF)**: TTS button should be disabled with tooltip "TTS not available for PDF".

### 9.2 TTS Play/Pause/Resume/Stop
- **File**: `tts_core.js:677-747`
- **Bus events**: `tts:toggle`, `tts:stop`
- **Behavior**:
  - **Play**: Extracts text blocks from iframe DOM, splits into segments (max 200 chars), speaks first segment. If no text found, retries up to 3 times with increasing delays (300ms, 600ms, 900ms).
  - **Pause**: Pauses engine (AudioContext.suspend for Edge, speechSynthesis.pause for WebSpeech)
  - **Resume**: Resumes from paused state
  - **Stop**: Cancels speech, clears all highlights, resets state
- **Test**: Press T (default shortcut). TTS should start reading. Press T again to pause. Press T to resume.
- **Test**: After navigating to a new chapter, press T. TTS should start reading (may retry if content not yet loaded).

### 9.3 TTS Bar (Full Controls)
- **File**: `reader_tts_ui.js:83-192`
- **Elements**: `booksReaderTtsBar`, `booksReaderTtsPlayPause`, `booksReaderTtsStop`, `booksReaderTtsSlower`, `booksReaderTtsFaster`, `booksReaderTtsSpeed`, `booksReaderTtsSnippet`, `booksReaderTtsEngine`, `booksReaderTtsVoice`, `booksReaderTtsPreview`, `booksReaderTtsPresetSel`
- **Behavior**: Full TTS control panel inside the reader host area. Appears when TTS is active (playing or paused).
  - Play/Pause button
  - Stop button
  - Speed controls: Slower (-0.1), Speed display, Faster (+0.1). Range: 0.5x–3.0x
  - Snippet display with word highlighting
  - Engine name (Edge Neural or System Voice, with fallback indicator)
  - Voice picker dropdown (grouped by English / All Languages, Edge voices marked with ★)
  - Preview button (speaks test sentence with selected voice)
  - Preset selector (Natural, Clear, Fast Study, Slow & Steady)
- **Test**: Start TTS. Full bar should appear. Verify all controls work.

### 9.4 TTS Mini Bar (Footer)
- **File**: `reader_tts_ui.js:172-191`
- **Elements**: `booksTtsMiniBar`, `booksTtsMiniPlay`, `booksTtsMiniPrev`, `booksTtsMiniNext`, `booksTtsMiniSnippet`, `booksTtsMiniSleep`, `booksTtsMiniStop`, `booksTtsMiniSlower`, `booksTtsMiniFaster`, `booksTtsMiniSpeed`, `booksTtsMiniVoice`
- **Behavior**: Compact TTS controls in the footer area. Shows when TTS is active.
  - Play/pause, prev/next segment, stop
  - Speed controls (−/display/+)
  - Voice picker dropdown
  - Sleep timer button
  - Text snippet display
- **Test**: Start TTS. Mini bar should appear in footer. Verify play/pause, speed, and voice controls work.

### 9.5 TTS Text Extraction
- **File**: `tts_core.js:142-197`
- **Behavior**:
  - EPUB: Gets iframe document(s) from Foliate renderer via `getContents()`, walks DOM for block-level elements (p, div, h1-h6, li, blockquote, etc.)
  - TXT: Gets `.booksReaderTextDoc` element
  - Extracts text from each block element, builds segments by splitting on sentences (max 200 chars per segment)
  - Splits on `.!?` first, then on `,;:—–-` for long segments
- **Test**: Start TTS on a book with various formatting (headings, paragraphs, lists). All text should be read.

### 9.6 TTS Highlighting
- **File**: `tts_core.js:254-374`
- **Behavior**:
  - **Block highlight**: Active block gets `.booksReaderTtsActive` class (light blue background), scrolled into view
  - **Sentence highlight**: Current sentence wrapped in `<span class="booksReaderTtsSentence">` (slightly stronger blue)
  - **Word highlight**: Current word wrapped in `<span class="booksReaderTtsWord">` (prominent blue highlight)
  - Highlights injected into EPUB iframe DOM via `surroundContents()`
  - Cleaned up (unwrapped) when moving to next segment or stopping
- **Test**: Start TTS. The current paragraph should have a subtle background. The current sentence should be highlighted. The current word should be prominently highlighted and scroll into view.

### 9.7 TTS Segment Navigation
- **File**: `tts_core.js:813-842`
- **Behavior**: Step forward/back by one segment. If paused, updates highlights without speaking.
- **Controls**: Rewind/Forward buttons, ◀/▶ in mini bar
- **Test**: While TTS is playing, click forward button. Should skip to next segment.
- **Test**: While paused, click forward. Should update highlight without resuming.

### 9.8 TTS Time-Based Jump (±10s)
- **File**: `tts_core.js:901-944`
- **Bus event**: `tts:jump`
- **Keyboard**: `[` for -10s, `]` for +10s
- **Behavior**: Approximates time-based skip using chars-per-second heuristic (~15 cps at 1.0x rate). Jumps multiple segments.
- **Test**: While TTS is playing, press `[`. Should skip back approximately 10 seconds worth of text. Press `]` to skip forward.

### 9.9 TTS Read from Selection
- **File**: `tts_core.js:864-898`, `reader_tts_ui.js:634-659`
- **Bus event**: `tts:play-from-selection`
- **Keyboard**: `R` key
- **Behavior**: Gets selected text from engine, finds the matching segment, starts TTS from there.
- **Test**: Select text in the middle of a page. Press R. TTS should start reading from that point.

### 9.10 TTS Voice Cycling
- **File**: `reader_tts_ui.js:372-394`
- **Bus event**: `tts:cycle-voice`
- **Keyboard**: V (next English voice), Shift+V (previous English voice)
- **Behavior**: Cycles through English voices only. Shows toast with voice name and engine type.
- **Test**: Press V. Toast should show new voice name. TTS voice should change.

### 9.11 TTS Speed Controls
- **File**: `reader_tts_ui.js:332-349`
- **Behavior**: Adjusts rate by ±0.1. Range: 0.5x–3.0x. Persists to settings.
- **Test**: Click faster button. Speed display should update (e.g., 1.0× → 1.1×). TTS should read faster.

### 9.12 TTS Presets
- **File**: `tts_core.js:16-21`
- **Presets**: Natural (1.0/1.0), Clear (0.9/1.05), Fast Study (1.4/1.0), Slow & Steady (0.7/0.95)
- **Test**: Select "Fast Study" preset. Rate and pitch should change. TTS should be noticeably faster.

### 9.13 TTS Engine Fallback
- **File**: `tts_core.js:487-560`
- **Behavior**:
  - If Edge TTS probe fails at init → selects WebSpeech, marks as `init_fallback`
  - If Edge fails at runtime → promotes to WebSpeech, marks as `runtime_fallback`
  - Fallback only happens once per session
  - Engine label shows "System Voice (Fallback)" when in fallback mode
- **Test**: If Edge is unavailable (no internet), TTS should fall back to system voices. Engine label should show "(Fallback)".

### 9.14 TTS Diagnostics Panel
- **File**: `reader_tts_ui.js:495-542`
- **Elements**: `booksReaderTtsDiagBtn`, `booksReaderTtsDiag`, `booksReaderTtsDiagBody`, `booksReaderTtsDiagClose`
- **Behavior**: Shows engine status, selection reason, usable map, rate, pitch, preset, voice, segment/block counts, fallback info, last diagnostic code, last error.
- **Test**: Click diagnostics button. Panel should show with engine info. Close button should hide it.

### 9.15 Sleep Timer
- **File**: `reader_tts_ui.js:546-604`
- **Bus events**: `tts:sleep`, `tts:cycle-sleep`
- **Presets**: Off, 10min, 20min, 30min, 60min
- **Behavior**:
  - Sleep timer button in mini bar cycles through presets
  - Countdown displayed on button (e.g., "12:45")
  - When timer expires, TTS stops with toast notification
  - TTS natural completion also clears sleep timer
  - Settings overlay has sleep timer chips
- **Test**: Click sleep timer button in mini bar. Should show "10 min" toast. Timer should count down. After 10 minutes, TTS should stop.
- **Test**: Cycle through presets by clicking repeatedly.

### 9.16 Return to TTS Location
- **File**: `reader_tts_ui.js:608-629`
- **Elements**: `booksReaderReturnTts`
- **Behavior**: When TTS is active and user navigates away (e.g., clicking TOC), a "Return to TTS" button appears. Clicking it navigates back to where TTS was reading.
- **Test**: Start TTS. Navigate to a different chapter via TOC. "Return to TTS" button should appear. Click it. Should return to TTS position.

### 9.17 TTS Auto-Advance
- **File**: `tts_core.js:412-425`, `reader_tts_ui.js:28-34`
- **Behavior**: When all segments in current chapter are done, TTS calls `onNeedAdvance()` which calls `engine.next()` to go to next page/section, waits 400ms for content to load, then extracts new blocks and continues reading.
- **Test**: Let TTS read to the end of a chapter. It should automatically advance to the next chapter and continue reading.

### 9.18 Edge TTS Crash Guard
- **File**: `main/domains/booksTtsEdge/index.js` (monkey-patch on `_pushMetadata`/`_pushAudioData`)
- **Behavior**: Guards against `TypeError: Cannot read properties of undefined (reading 'metadata')` when WebSocket messages arrive for a cleaned-up stream.
- **Test**: Use Edge TTS for extended periods. Should not crash the main process.

---

## 10. KEYBOARD SHORTCUTS

### 10.1 Fixed Shortcuts
- **File**: `reader_keyboard.js:23-34`

| Shortcut | Action | How to test |
|----------|--------|-------------|
| `Ctrl+G` | Open/close goto dialog | Press Ctrl+G. Input dialog should appear. |
| `Ctrl+F` or `/` | Toggle search overlay | Press Ctrl+F. Search overlay should open. |
| `Arrows, Space, Shift+Space, PgUp/PgDn` | Page navigation | See section 2.1 |
| `Ctrl+Right / Ctrl+Left` | Next/prev chapter | See section 2.4 |
| `Home / End` | Book bounds (beginning/end) | See section 2.3 |
| `Alt+Left / Alt+Right` | History back/forward | See section 2.5 |
| `[ / ]` | TTS back/forward 10s | See section 9.8 |
| `R` | Read from selection | See section 9.9 |
| `K or ?` | Show shortcuts/settings | Opens settings overlay |
| `Escape` | Escape chain (see 10.3) | See section 10.3 |

### 10.2 Customizable Shortcuts
- **File**: `reader_keyboard.js:10-21`, `reader_state.js:21-33`

| Default Key | Action ID | Action |
|-------------|-----------|--------|
| `T` | `ttsToggle` | Toggle TTS |
| `O` | `tocToggle` | Toggle sidebar |
| `B` | `bookmarkToggle` | Toggle bookmark |
| `D` | `dictLookup` | Dictionary lookup |
| `Z` | `zenToggle` | Toggle zen mode |
| `F` | `fullscreen` | Toggle fullscreen |
| `H` | `sidebarToggle` | Toggle sidebar |
| `M` | `themeToggle` | Cycle theme |
| `V` | `voiceNext` | Next TTS voice |
| `Shift+V` | `voicePrev` | Previous TTS voice |

- **Test each**: Press each default key. Verify the corresponding action fires.

### 10.3 Escape Chain
- **File**: `reader_keyboard.js:202-233`
- **Priority order** (first matching wins):
  1. Goto dialog open → close goto
  2. Annotation popup open → hide annotation popup
  3. Dictionary popup visible → hide dictionary
  4. TTS diagnostics panel visible → hide diagnostics
  5. Any overlay open → close all overlays
  6. Chapter transition card showing → dismiss (without advancing)
  7. Sidebar open → close sidebar
  8. Zen mode active → exit zen mode
  9. Nothing else → close reader
- **Test each level**: Open each UI element, press Escape. It should dismiss in the priority order above.

### 10.4 Shortcut Editor
- **File**: `reader_keyboard.js:65-134`
- **Behavior**:
  - Located inside settings overlay
  - Shows all customizable shortcuts with current key assignment
  - Click a key button to enter capture mode ("Press key...")
  - Press any printable key (no modifiers) to assign
  - Escape cancels capture
  - Backspace/Delete resets to default
  - Persisted via `Tanko.api.booksUi.save()`
  - Displays `Shift+KEY` for uppercase keys
- **Test**: Open settings. Click a shortcut button. Press a new key. Verify shortcut changes.
- **Test**: Reset a shortcut by pressing Backspace.

### 10.5 Input Guard
- **File**: `reader_keyboard.js:36-41, 184-191`
- **Behavior**: When focus is in an `<input>`, `<textarea>`, `<select>`, or contentEditable element, navigation shortcuts are suppressed. Only Escape (to blur) works.
- **Test**: Focus on the search input. Press arrow keys. Should type in input, not navigate pages.

---

## 11. GOTO DIALOG

- **File**: `reader_nav.js:351-404`
- **Elements**: `booksGotoOverlay`, `booksGotoInput`, `booksGotoSubmit`, `booksGotoCancel`, `booksGotoHint`
- **Bus events**: `nav:goto-open`, `nav:goto-close`
- **Behavior**:
  - Opens with Ctrl+G
  - PDF: hint says "Pages 1 - N", accepts page numbers
  - EPUB/TXT: hint says "Enter percentage (0–100)", accepts percentage
  - Values ending with `%` treated as percentage
  - Enter submits, Escape cancels
  - Clicking outside the dialog closes it
- **Test (EPUB)**: Press Ctrl+G. Type "50". Press Enter. Should go to 50% of current chapter.
- **Test (PDF)**: Press Ctrl+G. Type "5". Press Enter. Should go to page 5.

---

## 12. AUTO-SAVE

- **File**: `reader_nav.js:452-465`
- **Behavior**:
  - Auto-saves progress every 3 seconds (`setInterval`)
  - Also saves on every relocate event (debounced 800ms)
  - Also saves on explicit page navigation
  - Progress includes locator (CFI, fraction, page), flow mode
- **Test**: Open a book, navigate to a specific position. Wait 5 seconds. Kill the app (force close). Reopen. Book should resume at saved position.

---

## 13. STATUS & TOAST MESSAGES

### 13.1 Status Bar
- **File**: `reader_state.js:331-348`
- **Element**: `booksReaderStatus`
- **Behavior**: Shows messages like "Opening EPUB...", "Searching...", "12 matches". Persistent or auto-hides after 4 seconds.
- **Test**: Open a book. "Opening EPUB..." should appear briefly.

### 13.2 Toast Messages
- **File**: `reader_state.js:350-363`
- **Behavior**: Creates/reuses a floating toast element (`booksReaderToast`). Shows for 2 seconds (or custom duration). Used for: bookmark added/removed, shortcut saved/reset, voice change, sleep timer, etc.
- **Test**: Press B to bookmark. Toast "Bookmark added" should appear for ~2 seconds.

---

## 14. ENGINE-SPECIFIC FEATURES

### 14.1 Foliate Engine (Primary EPUB+PDF)
- **File**: `engine_foliate.js`
- **Registration**: `window.booksReaderEngines.epub` and `.pdf`
- **Features**:
  - File loading: IPC read → ArrayBuffer → File object. Fallback to fetch with file:// URL.
  - EPUB styles: Injects CSS string with font size, line height, margin, colors, font family, TTS highlight classes
  - Flow mode: `paginated` or `scrolled` via renderer attribute
  - Column mode: `single` or `auto` (spread) via `max-column-count` attribute
  - Search: Async iterator over search results, collects CFIs for navigation
  - Selected text: Accesses iframe document selections
  - Section fractions: `view.getSectionFractions()` for chapter boundaries
  - History: Wraps Foliate's built-in History class (back/forward)
  - Annotations: `addAnnotation`, `deleteAnnotation`, `showAnnotation`, `setAnnotationMeta`, `removeAnnotationMeta`, `getSelectionCFI`
  - Draw annotation event: Applies color + style using Overlayer (highlight/underline/strikethrough/outline)
  - Section boundary: Pause at chapter end, advance to section
  - Iframe events: dblclick → dictionary, contextmenu → annotation/dictionary, user activity tracking
  - Locator: CFI-based with fraction, page label, page index, zoom, fitMode

### 14.2 Legacy EPUB Engine (epub.js)
- **File**: `engine_epub.js`
- **Registration**: `window.booksReaderEngines.epub_legacy`
- **Features**: Basic EPUB rendering via epub.js. Supports: open, next/prev, getToc, goTo, search (basic section-by-section), themes. No annotations, no search highlighting, no column mode.
- **Test**: If primary engine fails, legacy should activate. Status bar shows "Compatibility engine active".

### 14.3 Legacy PDF Engine (pdfjs-dist)
- **File**: `engine_pdf.js`
- **Registration**: `window.booksReaderEngines.pdf_legacy`
- **Features**: Canvas-based PDF rendering. Supports: open, next/prev, goTo (page or outline destination), search (page-by-page text), zoom, fit page/width.
- **Test**: If Foliate PDF engine fails, legacy should activate.

### 14.4 TXT Engine
- **File**: `engine_txt.js`
- **Registration**: `window.booksReaderEngines.txt`
- **Features**: Loads file as UTF-8, splits on double newlines into `<p>` elements. Supports: scrolling navigation, search with `<mark>` highlights and active mark scrolling, font/theme/margin settings, scroll position persistence, selected text.
- **Test**: Open a .txt file. Should render as formatted paragraphs. Search should highlight matches.

---

## 15. EDGE TTS ENGINE (Main Process)

### 15.1 Edge TTS Main Process Handler
- **File**: `main/domains/booksTtsEdge/index.js`
- **IPC Channels**: `booksTtsEdge:probe`, `booksTtsEdge:synth`, `booksTtsEdge:getVoices`
- **Behavior**:
  - Uses `msedge-tts` npm package
  - `probe()`: Creates TTS instance, synthesizes test text, checks for valid audio
  - `synth()`: Synthesizes text with voice/rate/pitch, returns base64 audio + boundary data
  - `getVoices()`: Returns available voices (cached for performance)
  - Monkey-patches `_pushMetadata` and `_pushAudioData` to guard against stream race conditions
- **Test**: Edge TTS should work without crashing. If Edge is unavailable (no internet), should gracefully fail and allow WebSpeech fallback.

### 15.2 Edge TTS Renderer Bridge
- **File**: `tts_engine_edge.js`
- **Behavior**:
  - Creates AudioContext for playback
  - Calls `Tanko.api.booksTtsEdge.synth()` to get base64 audio
  - Decodes audio data, plays via BufferSource
  - Fires word boundaries based on timing data from synthesis response
  - Supports pause (AudioContext.suspend) and resume (AudioContext.resume)
  - Health probing with diagnostic codes
- **Test**: Start TTS with Edge engine. Audio should play with word-level boundary events.

---

## 16. MODULE LOADING

### 16.1 Deferred Module Loading
- **File**: `state/deferred_modules.js`
- **Behavior**:
  - `loadScriptChain()`: Loads scripts sequentially (async=false)
  - `loadScriptGroup()`: Loads scripts in parallel via `Promise.all()`
  - `ensureBooksModulesLoaded()`: Called on demand (first book mode access), loads all 18+ reader scripts in 5 parallel groups
  - Tracks loaded scripts in `Set` and promises in `Map` to prevent duplicate loads
- **Test**: First time entering books mode should load all modules. Subsequent entries should be instant (cached).

---

## 17. BUS EVENTS REFERENCE

Below is every bus event used in the reader, the emitter, and the listener(s):

| Event | Emitter | Listener(s) | Purpose |
|-------|---------|-------------|---------|
| `nav:prev` | keyboard | reader_nav | Go to previous page |
| `nav:next` | keyboard | reader_nav | Go to next page |
| `nav:seek` | keyboard | reader_nav | Seek to fraction (0-1) |
| `nav:goto-open` | keyboard | reader_nav | Open goto dialog |
| `nav:goto-close` | keyboard | reader_nav | Close goto dialog |
| `nav:progress-sync` | search, bookmarks, toc | reader_nav | Force progress UI sync |
| `nav:next-chapter` | keyboard | reader_nav | Go to next chapter |
| `nav:prev-chapter` | keyboard | reader_nav | Go to previous chapter |
| `reader:close` | keyboard, core | reader_core | Close reader |
| `reader:fullscreen` | keyboard | reader_core | Toggle fullscreen |
| `reader:relocated` | reader_nav | reader_toc | Book position changed |
| `overlay:toggle` | keyboard, toolbar | reader_overlays | Toggle overlay by name |
| `overlay:open` | — | reader_overlays | Open overlay by name |
| `overlay:close` | search | reader_overlays | Close all overlays |
| `overlay:opened` | reader_overlays | bookmarks, annotations | Overlay was opened |
| `sidebar:toggle` | keyboard | reader_sidebar | Toggle sidebar |
| `sidebar:close` | keyboard, toc | reader_sidebar | Close sidebar |
| `toc:render` | — | reader_toc | Re-render TOC |
| `toc:updated` | reader_toc | reader_nav | TOC items changed |
| `toc:navigate` | — | reader_toc | Navigate to TOC item |
| `chapter:progress` | reader_nav | reader_toc | Per-chapter progress update |
| `appearance:apply` | — | reader_appearance | Re-apply settings |
| `appearance:cycle-theme` | keyboard | reader_appearance | Cycle to next theme |
| `appearance:sync` | reader_core | reader_appearance | Sync all UI controls |
| `search:run` | — | reader_search | Run search query |
| `search:prev` | — | reader_search | Go to previous match |
| `search:next` | — | reader_search | Go to next match |
| `search:clear` | — | reader_search | Clear search |
| `bookmark:toggle` | keyboard | reader_bookmarks | Toggle bookmark |
| `bookmark:goto` | — | reader_bookmarks | Navigate to bookmark |
| `bookmarks:render` | — | reader_bookmarks | Re-render bookmark list |
| `annot:show-popup` | reader_core | reader_annotations | Show annotation popup |
| `annot:hide-popup` | keyboard | reader_annotations | Hide annotation popup |
| `annot:save` | — | reader_annotations | Save annotation |
| `annot:delete` | — | reader_annotations | Delete annotation |
| `annotations:render` | — | reader_annotations | Re-render annotation list |
| `dict:lookup` | keyboard, reader_core | reader_dict | Trigger dictionary lookup |
| `dict:hide` | keyboard | reader_dict | Hide dictionary popup |
| `tts:toggle` | keyboard | reader_tts_ui | Toggle TTS |
| `tts:stop` | — | reader_tts_ui | Stop TTS |
| `tts:speed` | — | reader_tts_ui | Adjust speed |
| `tts:step` | — | reader_tts_ui | Step segment |
| `tts:jump` | keyboard | reader_tts_ui | Time-based jump |
| `tts:play-from-selection` | keyboard | reader_tts_ui | Read from selection |
| `tts:cycle-voice` | keyboard | reader_tts_ui | Cycle TTS voice |
| `tts:sleep` | settings | reader_tts_ui | Set sleep timer |
| `tts:cycle-sleep` | — | reader_tts_ui | Cycle sleep presets |
| `tts:show-return` | reader_nav | reader_tts_ui | Show/hide return button |
| `tts:voice-changed` | reader_appearance | reader_tts_ui | Re-populate voice lists |

---

## 18. ELEMENT IDS REFERENCE

Every DOM element the reader accesses (defined in `reader_state.js:99-253`):

### Core
- `booksReaderView` — Main reader container
- `booksReaderHost` — Content rendering host
- `booksReaderTitle` — Book title in header
- `booksReaderSubtitle` — Chapter name in header
- `booksReaderStatus` — Status message bar

### Toolbar Buttons
- `booksReaderBackBtn` — Back/close
- `booksReaderHistBack` / `booksReaderHistFwd` — History navigation
- `booksReaderTtsLaunch` — TTS launch button
- `booksReaderSearchBtn` — Search overlay toggle
- `booksReaderBookmarksBtn` — Bookmarks overlay toggle
- `booksReaderAnnotBtn` — Annotations overlay toggle
- `booksReaderTocNavBtn` — Sidebar/TOC toggle
- `booksReaderThemeFontBtn` — Settings overlay toggle
- `booksReaderFsBtn` — Fullscreen
- `booksReaderCloseBtn` — Close reader

### Overlays
- `brOverlayBackdrop` — Shared backdrop
- `brOverlaySearch` — Search panel
- `brOverlayBookmarks` — Bookmarks panel
- `brOverlayAnnotations` — Annotations panel
- `brOverlaySettings` — Settings panel

### Sidebar
- `booksSidebar` — Sidebar container
- `booksTocSearch` — TOC filter input
- `booksTocList` — TOC item list

### Navigation
- `booksReaderPrevBtn` / `booksReaderNextBtn` — Page nav arrows
- `booksReaderScrub` — Scrub bar container
- `booksReaderScrubFill` — Scrub bar fill
- `booksReaderScrubThumb` — Scrub bar thumb
- `booksReaderScrubBubble` — Hover bubble
- `booksReaderChapterFill` — Book progress bar fill
- `booksReaderChapterText` — Book progress label
- `booksReaderPageText` — Page/chapter info text
- `booksReaderFlowBtn` — Flow mode toggle

### Chapter Transition
- `booksChapterTransition` — Transition overlay
- `booksChapterTransCurrent` — Current chapter name
- `booksChapterTransNext` — Next chapter name
- `booksChapterTransContinue` — Continue button
- `booksChapterTransCountdown` — Countdown display

### Dictionary
- `booksReaderDictPopup` — Popup container
- `booksReaderDictWord` — Word display
- `booksReaderDictBody` — Definition content
- `booksReaderDictClose` — Close button

### Goto
- `booksGotoOverlay` — Dialog overlay
- `booksGotoInput` — Page/percentage input
- `booksGotoSubmit` / `booksGotoCancel` — Buttons
- `booksGotoHint` — Hint text

### Annotation Popup
- `booksAnnotPopup` — Popup container
- `booksAnnotClose` — Close button
- `booksAnnotColorPicker` — Color swatches
- `booksAnnotStylePicker` — Style buttons
- `booksAnnotNote` — Note textarea
- `booksAnnotSave` / `booksAnnotDelete` — Action buttons

### Error Banner
- `booksReaderErrorBanner` — Container
- `booksReaderErrorTitle` / `booksReaderErrorDetail` — Text
- `booksReaderErrorRetry` / `booksReaderErrorClose` — Buttons

---

## AUDIT CHECKLIST TEMPLATE

Copy this and fill in your findings:

```
### 1. BOOK OPENING & CLOSING
- [ ] 1.1 Open EPUB:
- [ ] 1.1 Open PDF:
- [ ] 1.1 Open TXT:
- [ ] 1.1 Error handling:
- [ ] 1.2 Close saves progress:
- [ ] 1.2 Resume position on reopen:
- [ ] 1.3 Error banner retry:

### 2. PAGE NAVIGATION
- [ ] 2.1 Next page (click, keys, space):
- [ ] 2.1 Prev page (click, keys, shift+space):
- [ ] 2.2 Scrolled mode arrows:
- [ ] 2.3 Home/End keys:
- [ ] 2.4 Ctrl+Arrow chapter nav:
- [ ] 2.5 Alt+Arrow history:

### 3. SCRUB BAR
- [ ] 3.1 Chapter-local progress (EPUB):
- [ ] 3.2 Book progress bar above:
- [ ] 3.3 PDF page progress:
- [ ] 3.4 Click to seek:
- [ ] 3.4 Drag to seek:
- [ ] 3.5 Keyboard on focused scrub:

### 4. CHAPTER TRANSITION
- [ ] 4.1 Boundary pause at chapter end:
- [ ] 4.2 Transition card shows:
- [ ] 4.2 Auto-advance countdown:
- [ ] 4.2 Continue button:
- [ ] 4.2 Double-press Next advances:
- [ ] 4.3 Escape dismisses without advance:

### 5. TABLE OF CONTENTS
- [ ] 5.1 TOC renders with items:
- [ ] 5.1 Status dots (grey/accent/green):
- [ ] 5.1 Progress mini bars:
- [ ] 5.2 Click navigates to chapter:
- [ ] 5.3 Active chapter highlighted:
- [ ] 5.3 "Now" badge on active:
- [ ] 5.3 Auto-scroll to active:
- [ ] 5.4 TOC search filter:
- [ ] 5.5 Keyboard navigation:
- [ ] 5.6 Live progress updates:
- [ ] 5.7 Sidebar toggle persists:

### 6. OVERLAY PANELS
- [ ] 6.1 One-at-a-time behavior:
- [ ] 6.1 Backdrop dismiss:
- [ ] 6.2 Search find & navigate:
- [ ] 6.2 Search prev/next:
- [ ] 6.3 Bookmark toggle (add/remove):
- [ ] 6.3 Bookmark navigate:
- [ ] 6.4 Annotation create (EPUB):
- [ ] 6.4 Annotation colors/styles:
- [ ] 6.4 Annotation list & navigate:
- [ ] 6.4 Annotation delete:
- [ ] 6.4 Annotation unavailable (PDF/TXT):
- [ ] 6.5 Settings overlay opens:

### 7. APPEARANCE
- [ ] 7.1 Theme light/sepia/dark:
- [ ] 7.1 Theme cycle (M key):
- [ ] 7.2 Font size slider:
- [ ] 7.3 Font family change:
- [ ] 7.4 Line height slider:
- [ ] 7.5 Margin slider:
- [ ] 7.6 Column mode toggle:
- [ ] 7.7 Flow mode toggle:
- [ ] 7.8 Zen mode (Z key):
- [ ] 7.9 Fullscreen (F key):
- [ ] 7.10 PDF zoom controls:
- [ ] 7.11 Settings persist across sessions:

### 8. DICTIONARY
- [ ] 8.1 Double-click lookup:
- [ ] 8.2 D key lookup:
- [ ] 8.3 Popup shows definition:
- [ ] 8.3 Google link works:
- [ ] 8.3 Close/click-outside dismisses:
- [ ] 8.4 Right-click → annotation or dictionary:

### 9. TEXT-TO-SPEECH
- [ ] 9.1 TTS initializes on EPUB open:
- [ ] 9.1 TTS disabled for PDF:
- [ ] 9.2 Play/Pause/Resume (T key):
- [ ] 9.2 Stop:
- [ ] 9.2 Retry on empty content:
- [ ] 9.3 Full TTS bar appears:
- [ ] 9.4 Mini bar appears in footer:
- [ ] 9.4 Mini bar speed controls:
- [ ] 9.4 Mini bar voice picker:
- [ ] 9.5 Text extraction works:
- [ ] 9.6 Block highlighting:
- [ ] 9.6 Sentence highlighting:
- [ ] 9.6 Word highlighting:
- [ ] 9.7 Segment navigation (prev/next):
- [ ] 9.8 Time jump [ and ]:
- [ ] 9.9 Read from selection (R):
- [ ] 9.10 Voice cycling (V/Shift+V):
- [ ] 9.11 Speed controls:
- [ ] 9.12 Presets:
- [ ] 9.13 Engine fallback:
- [ ] 9.14 Diagnostics panel:
- [ ] 9.15 Sleep timer:
- [ ] 9.16 Return to TTS location:
- [ ] 9.17 Auto-advance to next chapter:
- [ ] 9.18 Edge TTS no crash:

### 10. KEYBOARD SHORTCUTS
- [ ] 10.1 Ctrl+G goto:
- [ ] 10.1 Ctrl+F search:
- [ ] 10.1 / search:
- [ ] 10.2 All default shortcuts work:
- [ ] 10.3 Escape chain (all levels):
- [ ] 10.4 Shortcut editor capture:
- [ ] 10.4 Shortcut reset (Backspace):
- [ ] 10.5 Input guard (no nav in inputs):

### 11. GOTO DIALOG
- [ ] 11 EPUB percentage goto:
- [ ] 11 PDF page goto:
- [ ] 11 Ctrl+G toggle:
- [ ] 11 Enter submits, Escape cancels:

### 12. AUTO-SAVE
- [ ] 12 Periodic auto-save:
- [ ] 12 Resume position after restart:

### 13. STATUS & TOAST
- [ ] 13.1 Status messages appear:
- [ ] 13.2 Toast messages appear:

### 14. ENGINE FALLBACKS
- [ ] 14.2 Legacy EPUB engine activates if primary fails:
- [ ] 14.3 Legacy PDF engine activates if primary fails:
- [ ] 14.4 TXT engine works:
```
