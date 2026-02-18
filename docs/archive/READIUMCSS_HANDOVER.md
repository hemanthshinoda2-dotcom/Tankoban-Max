# ReadiumCSS Integration — Continuation Handover

## What was completed (Steps 1-7)

ReadiumCSS has been fully integrated into the Tankoban Max book reader. All 7 planned steps are done:

| Step | File | What changed |
|---|---|---|
| 1 | `src/vendor/readiumcss/` | Vendored ReadiumCSS-before/default/after.css + fonts/ |
| 2 | `src/domains/books/reader/reader_state.js` | Expanded DEFAULT_SETTINGS (8 themes, percentage fontSize, factor margins, textAlign, letterSpacing, wordSpacing, paraSpacing, paraIndent, bodyHyphens), migration logic for old pixel values, new element refs |
| 3 | `src/domains/books/reader/engine_foliate.js` | ReadiumCSS loader (`loadReadiumCSS()`), replaced `buildEpubStyles()`, new `applyReadiumCSSFlags()` that sets `--USER__*` properties on iframe documentElement, `applyExtendedThemeColors()` for custom themes |
| 4 | `src/styles/books-reader.css` | 5 new shell theme definitions (paper, contrast1-4) with full variable sets |
| 5 | `src/index.html` | 8 theme chips with color swatches, 8 font families, percentage font size slider (75-250), factor margin slider (0.5-2.0), 6 new typography controls (text align, letter/word/para spacing, para indent, hyphens), scrub toggle button removed |
| 6 | `src/domains/books/reader/reader_appearance.js` | Wired all new controls, 8-theme cycle, updated sync functions, new `syncTextAlignChips()` helper |
| 7 | `src/domains/books/reader/reader_nav.js` | Removed scrub toggle (`setScrubVisible`, `persistScrubVisible`, `restoreScrubVisible`, `toggleScrubVisible`), scrub bar always visible |

---

## Task 1: Replace reader icons with Thorium/Readium SVG icons

### Current state
All reader buttons use **Unicode HTML entities** — no SVGs, no images. Examples:
- Back: `&#9664;` (U+25C0)
- Sidebar toggle: `&#9776;` (hamburger)
- TTS launch: `&#128264;` (speaker emoji)
- Search: `&#128269;` (magnifying glass emoji)
- Bookmarks: `&#9734;` (star)
- Annotations: `&#9998;` (pencil)
- Font/Theme/TTS: plain text ("Font", "Theme", "TTS")
- Fullscreen: `&#9974;`
- Close: `&#10005;` (X)
- Nav arrows: `&#10216;` / `&#10217;` (angle brackets)
- Play/Pause: `&#9654;` (triangle)
- Stop: `&#9632;` (square)
- Rewind/Forward: `&#9664;&#9664;` / `&#9654;&#9654;` (doubled triangles)
- Back/Fwd 10s: `&#8630;` / `&#8631;` (semicircle arrows)
- Flow mode: `&#9633;` (white square)
- Sleep: `&#9203;` (hourglass)
- Gear: `&#9881;`

### Available SVG icons
138 active SVGs in `projects/thorium-reader-develop/src/renderer/assets/icons/`. Key matches:

| Reader button | Thorium SVG icon |
|---|---|
| Back to library | `baseline-arrow_left_ios-24px.svg` or `arrowFirst-icon.svg` |
| Sidebar/TOC toggle | `toc-icon.svg` or `menu.svg` |
| TTS launch | `headphone-icon.svg` or `audio-play-icon.svg` |
| Search | `search-icon.svg` or `baseline-search-24px-grey.svg` |
| Bookmarks | `bookmarkSingle-icon.svg` |
| Annotations | `annotation-icon.svg` or `pen-icon.svg` |
| Font settings | `TextOutline-icon.svg` or `textarea-icon.svg` |
| Theme/Appearance | `paintbrush-icon.svg` or `palette-icon.svg` |
| TTS settings | `gear-icon.svg` or `cog-icon.svg` |
| Fullscreen | `fullscreen-icon.svg` or `fullscreen-corners-icon.svg` |
| Fullscreen exit | `fullscreenExit-icon.svg` |
| Close | `close-icon.svg` or `baseline-close-24px.svg` |
| Play | `audio-play-icon.svg` |
| Pause | `audio-pause-icon.svg` |
| Stop | `audio-stop-icon.svg` or `stop-icon.svg` |
| Previous | `audio-previous-icon.svg` |
| Next | `audio-next-icon.svg` |
| Forward/Backward | `forward-icon.svg` / `backward-icon.svg` |
| Nav left arrow | `baseline-arrow_left_ios-24px.svg` |
| Nav right arrow | `baseline-arrow_forward_ios-24px.svg` |
| Scroll mode | `scroll-icon.svg` |
| Page mode | `layout-icon.svg` or `page-icon.svg` |
| Info | `info-icon.svg` |
| Highlight | `highlight-icon.svg` |
| Underline | `underline-icon.svg` |
| Strikethrough | `TextStrikethrough-icon.svg` |

82 additional archived icons in `.unused-icons/` subdirectory.

### Implementation approach
1. Copy needed SVGs into `src/vendor/icons/` (or `src/assets/icons/`)
2. Inline the SVGs into `index.html` buttons as `<svg>` elements (consistent sizing, themeable via `currentColor`)
3. Add CSS for icon sizing: `.br-btn svg { width: 18px; height: 18px; fill: currentColor; }` (inherits text color from theme)
4. Replace each Unicode entity with the corresponding inline SVG

### Buttons inventory (37 total)

**Toolbar (11):** booksReaderBackBtn, booksReaderTocNavBtn, booksReaderTtsLaunch, booksReaderSearchBtn, booksReaderBookmarksBtn, booksReaderAnnotBtn, booksReaderFontBtn, booksReaderThemeBtn, booksReaderTtsSettingsBtn, booksReaderFsBtn, booksReaderCloseBtn

**Nav arrows (2):** booksReaderPrevBtn, booksReaderNextBtn

**TTS bar (11):** booksReaderTtsBack10, booksReaderTtsRewind, booksReaderTtsPlayPause, booksReaderTtsForward, booksReaderTtsFwd10, booksReaderTtsStop, booksReaderTtsFromSel, booksReaderTtsSlower, booksReaderTtsFaster, booksReaderTtsPreview, booksReaderTtsDiagBtn

**Footer (1):** booksReaderFlowBtn

**TTS mini bar (9):** booksTtsMiniBack10, booksTtsMiniPrev, booksTtsMiniPlay, booksTtsMiniNext, booksTtsMiniFwd10, booksTtsMiniSlower, booksTtsMiniFaster, booksTtsMiniSleep, booksTtsMiniStop

**Other (3):** booksReaderReturnTts, booksChapterTransContinue, booksReaderTtsDiagClose + booksReaderDictClose

---

## Task 2: HUD hides during reading actions (scroll/page-turn)

### Current HUD system

There are **two parallel HUD auto-hide systems** that both run simultaneously:

#### System A: `reader_core.js` (BUILD_OVERHAUL) — THE ACTIVE ONE
- **CSS class:** `br-hud-hidden` toggled on `#booksReaderView` (`.br-reader`)
- **CSS rules exist:** Yes, in `books-reader.css` lines 633-648 (opacity:0, pointer-events:none on toolbar/footer/status)
- **Timer:** 3000ms hardcoded
- **Activity detection:** `mousemove`, `pointerdown`, `wheel`, `keydown`, `touchstart` on `#booksReaderView`
- **Key functions:**
  - `scheduleHudAutoHide()` (line 57) — starts 3s timer
  - `setHudVisible(visible)` (line 51) — toggles `br-hud-hidden` class
  - `onAnyUserActivity()` (line 71) — shows HUD + restarts timer
  - `shouldKeepHudVisible()` (line 39) — guards against hiding while overlays/dialogs open
- **Engine callback:** `onUserActivity: function() { onAnyUserActivity(); }` (line 204) — engines call this on user interaction inside iframe

#### System B: `controller.js` (FIX-R07) — HAS NO MATCHING CSS
- **CSS class:** `booksHudHidden` toggled on `document.body`
- **CSS rules exist:** NO — this class has zero matching selectors in any stylesheet
- **Extra features:** hover freeze on toolbar/footer/TTS bar, drag freeze, typing freeze, `h` key toggle
- **Key functions:** `noteHudActivity()`, `scheduleHudHide()`, `setHudHidden()`, `hudFreezeActive()`, `toggleHud()`

### What needs to change

**Goal:** HUD should hide when the user is actively reading — scrolling in scroll mode, turning pages in paged mode. Currently, `mousemove` triggers `onAnyUserActivity()` which shows the HUD and restarts the 3s timer. Scrolling also fires `wheel` events which do the same.

**The fix in `reader_core.js`:**

1. **Remove `wheel` from the activity listener list** — scrolling should NOT show the HUD
2. **Add `scroll` event on the foliate host/iframe** that HIDES the HUD immediately (or suppresses showing it)
3. **On page turn (nav:next/nav:prev/engine navigation)** — hide the HUD or don't reset the timer
4. **Keep `mousemove` for mouse cursor movement** but add a debounce or movement threshold so micro-movements during scroll don't trigger it
5. **Keep `pointerdown` and `keydown`** as activity triggers (clicking toolbar buttons or pressing keyboard shortcuts should show HUD)

**Suggested approach:**

In `reader_core.js`:

```js
// Replace the simple activity listener with smarter logic:

// 1. Track reading actions separately
var isReadingAction = false;

// 2. On scroll/wheel inside content area — mark as reading, hide HUD
function onReadingScroll() {
  isReadingAction = true;
  setHudVisible(false);
  // Clear any pending show timer
  if (hudHideTimer) clearTimeout(hudHideTimer);
}

// 3. On page turn (bus events nav:next, nav:prev, relocate) — hide HUD
function onPageTurn() {
  isReadingAction = true;
  setHudVisible(false);
}

// 4. On deliberate interaction (click on toolbar, keydown for shortcuts) — show HUD
function onDeliberateActivity() {
  isReadingAction = false;
  setHudVisible(true);
  scheduleHudAutoHide();
}

// 5. mousemove — only show HUD if movement is significant (>5px) and not during reading
var lastMouseX = 0, lastMouseY = 0;
function onMouseMove(e) {
  var dx = Math.abs(e.clientX - lastMouseX);
  var dy = Math.abs(e.clientY - lastMouseY);
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  if (dx + dy < 5) return; // ignore micro-movements
  if (isReadingAction) {
    isReadingAction = false; // movement after reading = deliberate
    return; // but don't show HUD yet, wait for next move
  }
  onDeliberateActivity();
}
```

**Also wire into the engine:**
- The `onRelocate` handler in `reader_core.js` (or `reader_nav.js` `handleRelocate`) fires on every page turn — use this to trigger `onPageTurn()`
- The foliate iframe scroll events need to be captured (use `bindIframeEvents` pattern in `engine_foliate.js`)

**Bus events to listen to:**
- `reader:relocated` — emitted on every page/section change
- `reader:user-activity` — currently emitted by `onAnyUserActivity()`, consumed by `reader_nav.js` for progress sync

**CSS transitions:** Currently the hide/show is instant (no animation). Consider adding a smooth fade:
```css
.br-reader .br-toolbar,
.br-reader .br-footer {
  transition: opacity 0.25s ease;
}
```

### Files to modify
- `src/domains/books/reader/reader_core.js` — main HUD logic changes
- `src/domains/books/reader/engine_foliate.js` — forward scroll events from iframe
- `src/styles/books-reader.css` — optional: add fade transition

---

## Project context

- **Codebase:** `projects/Tankoban Max/` inside `d:\Projects\Tankoban-Pro-Electron\`
- **Architecture:** Vanilla JS with IIFE modules, no framework, no bundler
- **Style:** Minimal diffs, `BUILD_*` / `FIX_*` tags in comments, extensive try/catch
- **Icon source:** `projects/thorium-reader-develop/src/renderer/assets/icons/` (138 SVGs)
- **Plan file:** `.claude/plans/snappy-discovering-whale.md` (ReadiumCSS plan — completed)
- **CLAUDE.md** at repo root has full project guide and code style rules
