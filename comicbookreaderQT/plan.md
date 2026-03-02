# Qt Comic Book Reader — Complete Recreation Plan

## Context

The Tankoban Max comic book reader is a ~300KB, 13-file JavaScript/Canvas2D renderer running inside Electron. It supports 5+ control modes, complex two-page pairing with parity math, a bitmap LRU cache, 50+ keybindings, 8 overlay systems, and smooth scroll physics. The goal is to recreate it as a standalone PySide6 widget that can later be embedded into the Butterfly Qt app via QStackedWidget (same pattern as the existing MpvContainer video player in `projectbutterfly/player_ui.py`).

**Why now:** The entire app is transitioning from Electron to Qt. The comic reader is the most complex renderer, so building it proves the approach for all future migrations.

**Key wins:** No IPC roundtrip for page loads (in-process zipfile/rarfile), real multithreading for decode, GPU-backed QPixmap rendering, native mouse capture, automatic HiDPI handling.

**Location:** `comicbookreaderQT/` folder in the repo root. Standalone-testable with its own launcher.

---

## File Structure

```
comicbookreaderQT/
├── plan.md                    # This plan
├── progress.md                # Phase-by-phase progress tracker
├── requirements.txt           # PySide6, rarfile, Pillow
├── launcher.py                # Standalone test launcher (QApplication + file picker)
├── comic_reader_widget.py     # Main widget (ComicReaderWidget) — the "MpvContainer equivalent"
├── canvas_widget.py           # Custom QPainter render surface
├── bitmap_cache.py            # LRU page cache + decode threading
├── archive_session.py         # CBZ/CBR session management (in-process, no IPC)
├── page_layout.py             # Two-page pairing, parity math, spread detection
├── scroll_physics.py          # Smooth scroll accumulators, wheel filtering, auto-scroll
├── state.py                   # ReaderState dataclass (central state object)
├── input_handler.py           # Keyboard + mouse + wheel routing
├── hud/
│   ├── __init__.py
│   ├── top_bar.py             # Title bar + back button
│   ├── bottom_hud.py          # Scrub bar + page counter + transport controls
│   ├── manual_scroller.py     # Right-edge scroll thumb
│   ├── mega_settings.py       # Settings panel (corner + floater modes)
│   ├── volume_navigator.py    # Series volume switcher with search
│   ├── speed_slider.py        # Log-scale speed overlay
│   ├── loupe_widget.py        # Magnifying glass overlay
│   ├── toast.py               # Stacking toast notifications
│   ├── end_overlay.py         # End-of-volume overlay
│   └── context_menu.py        # Right-click menu
├── constants.py               # All timing, sizing, color constants
└── settings_store.py          # Per-series JSON persistence (reuse storage.py patterns)
```

---

## Phases

### Phase 1 — Skeleton + Archive + Single Page Display
**Goal:** Open a CBZ/CBR, decode a page, paint it to screen.

**Files:** `launcher.py`, `comic_reader_widget.py`, `canvas_widget.py`, `archive_session.py`, `state.py`, `constants.py`, `requirements.txt`

**Work:**
- `archive_session.py`: CBZ via `zipfile.ZipFile`, CBR via `rarfile.RarFile`. Max 3 sessions, LRU eviction. Lazy per-entry extraction. Natural-sort entries, filter to image extensions (.png/.jpg/.jpeg/.webp). Return raw bytes per entry index.
- `state.py`: `ReaderState` dataclass — `book`, `pages[]`, `page_index`, `y`, `y_max`, `playing`, `settings`, `tokens` (open/volume counters for stale detection).
- `canvas_widget.py`: `CanvasWidget(QWidget)` with `paintEvent()`. Stores current `QPixmap`. Draws centered on black background. Handles `resizeEvent()` to recompute layout. DevicePixelRatio-aware.
- `comic_reader_widget.py`: `ComicReaderWidget(QWidget)` — contains `CanvasWidget` as child. `open_book(path)` opens archive, indexes pages, decodes first page, displays it. Minimal keyboard: Left/Right arrow = prev/next page.
- `launcher.py`: `QApplication` + `QFileDialog` to pick a .cbz/.cbr → opens `ComicReaderWidget`.
- **Reuse:** `projectbutterfly/storage.py` patterns for atomic JSON writes. `projectbutterfly/player_ui.py` patterns for widget hierarchy + `setGeometry()` + `raise_()`.

**Test:** Launch standalone, open a CBZ, see first page. Arrow keys navigate pages.

---

### Phase 2 — Bitmap Cache + Threaded Decode
**Goal:** LRU cache with memory budget, background decoding, prefetch.

**Files:** `bitmap_cache.py`

**Work:**
- `BitmapCache`: `dict[int, CacheEntry]` where `CacheEntry = { pixmap, spread, last_used, promise_future }`.
- Memory budget: 512MB default, 256MB memory-saver. Per-page estimate: `w × h × 4`.
- Keep-set cap: 12 pages. Lock current ±1 pages from eviction.
- `QThreadPool` with max 2-4 workers for decode. Each worker: read archive entry → `QImage.loadFromData(bytes)` → `QPixmap.fromImage()` → emit signal to cache on GUI thread.
- Spread detection during decode: `width/height > threshold` → mark as spread.
- Stale volume tokens: if volume changed during decode, discard result.
- Fast binary dimension parsing (PNG/JPEG/WebP/GIF headers) for layout pre-computation without full decode.
- Prefetch: when page changes, queue decode for ±2 neighboring pages.

**Test:** Open large CBZ (200+ pages). Navigate rapidly. Pages appear without stutter. Memory stays under budget.

---

### Phase 3 — Portrait Strip Rendering (Manual Scroll + Auto Scroll)
**Goal:** Webtoon-style infinite vertical strip with smooth scrolling.

**Files:** `canvas_widget.py` (extend), `scroll_physics.py`, `state.py` (extend)

**Work:**
- **Portrait strip layout:** Multi-page rendering per frame (draw current + next pages until viewport filled, up to 6). Portrait pages centered with configurable width (50-100%). Spreads fill full width. No-upscale rule.
- **Manual scroll:** Keyboard arrows = 12% viewport step. Wheel input with accumulator + consume-fraction-per-frame smoothing. Boundary crossing only if next page is cached. Prefetch at 35% viewport from boundary. Max 3 page jumps per scroll event.
- **Auto scroll:** `QTimer` at 16ms driving `update()`. Speed in px/sec (5-5000, log scale). Shift=2.5×, Ctrl=0.2× modifiers. Page boundary crossing: when `y >= scaledH`, advance to next page, carry over remainder.
- **Scroll preservation on resize:** Snapshot relative position before resize, restore after.
- `scroll_physics.py`: `WheelAccumulator` class (low-pass filter α=0.72, noise threshold 6px, reset after 140ms pause). `ManualWheelPump` class (consume fraction per frame via QTimer). `AutoScrollDriver` class (speed + modifier tracking).

**Test:** Open manga volume. Scroll smoothly with wheel. Toggle auto-scroll with Space. Resize window — scroll position preserved.

---

### Phase 4 — Two-Page Layout Engine
**Goal:** All two-page pairing math, spread handling, parity coupling.

**Files:** `page_layout.py`

**Work:**
- `is_stitched_spread(index)`: Check manual overrides → cached dims → decode metadata. Precedence: manual override > cache > async detect.
- `two_page_extra_slots_before(idx)`: Count spreads from 1 to idx-1 (skip cover).
- `two_page_effective_index(idx)`: `idx + extra_slots_before(idx)`.
- `snap_two_page_index(i)`: Map to nearest pair-start. Cover always alone. Spreads standalone. Normal: check `(effective + nudge) % 2`.
- `get_two_page_pair(i)`: Returns `TwoPagePair(is_spread, cover_alone, right_index, left_index_or_none, unpaired_single)`.
- `build_two_page_scroll_rows(page_count, spread_set, nudge, viewport_width, row_gap)`: Yields row objects `{ type, indices, row_height, y_start, y_end }`. Async-friendly (yield every 24 rows).
- Manual spread override sets: `known_spread_indices`, `known_normal_indices`.

**Test:** Unit tests with known spread patterns. Verify parity math matches JS implementation exactly.

---

### Phase 5 — Two-Page Flip Rendering
**Goal:** Side-by-side page display with all flip-mode features.

**Files:** `canvas_widget.py` (extend)

**Work:**
- **Layout:** Gutter split: `left_w = (cw - gutter) / 2`, `right_w = cw - gutter - left_w`.
- **Render cases:** Spread (full width), cover alone (left slot), unpaired single (right slot), pair (both pages, uniform scale from `min(scale_r, scale_l)`).
- **Gutter shadow:** Linear gradient in gutter region. Shadow strength 0-1 from settings. QPainter gradient with 5-stop opacity ramp.
- **Fit modes:** Fit height (default) vs fit width. Spreads always fit width.
- **Navigation:** `next_two_page()` / `prev_two_page()` with snap. Cover→1, spread→+1, normal→+2. Coupling nudge toggle.
- **Partner prefetch:** When landing on a pair, immediately queue decode for partner page.
- **Click zones for flip:** Left half = prev, right half = next (invertible with `I` key for manga reading direction).

**Test:** Open double-page manga. Pages pair correctly. Spreads display full-width. Coupling nudge fixes drift.

---

### Phase 6 — Two-Page Scroll + MangaPlus Zoom
**Goal:** Stacked-row scrolling and zoom-pan mode.

**Files:** `canvas_widget.py` (extend), `scroll_physics.py` (extend)

**Work:**
- **Two-Page Scroll:** Build stacked rows from page_layout. Binary search for viewport clipping. Scroll with wheel (α=0.72 filter, max step = 22% viewport height). Prefetch: 1.6× viewport ahead, 0.6× behind, max 9 pages.
- **Entry-sync hold:** When switching from flip→scroll mid-read, hold single-row view until layout builder reaches current pair. Then snap `y` to row position + local offset.
- **Pending scroll:** If user drags scroller before layout ready, remember target progress, apply when layout completes.
- **MangaPlus Zoom:** 100-260% zoom factor applied to two-page flip scale. Pan state: `pan_x`, `pan_y` clamped to overflow bounds. Reset logic: fit-width starts top, zoom starts centered, reading-direction-aware X reset.
- **Drag-to-pan:** Mouse drag in middle zone. 4px movement threshold before pan activates. Inhibit click until released.
- **Keyboard pan:** Arrows = 160px step (DPR-adjusted). Space = flip page (only at bottom-right corner).

**Test:** Open long manga. Two-page scroll smooth with prefetch. Switch from flip to scroll mid-read — position preserved. MangaPlus zoom + drag pan works.

---

### Phase 7 — Auto Flip Timer
**Goal:** Timer-based automatic page advance in two-page flip mode.

**Files:** `state.py` (extend), integrate into `comic_reader_widget.py`

**Work:**
- `QTimer` for flip interval (5-600 seconds, configurable).
- Countdown display (`QLabel` overlay, updates every 200ms).
- Pause/resume separate from play/pause. `auto_flip_paused` flag.
- On tick: call `next_two_page()`. If page didn't advance (end), stop timer.
- Guard: if nav_busy, reschedule (don't stack).
- Reset timer on manual navigation.
- Transport glyph sync: show pause only if timer running and not paused.

**Test:** Enable auto-flip mode. Pages advance on interval. Countdown visible. Pause/resume works. Manual nav resets timer.

---

### Phase 8 — HUD System (Top Bar + Bottom HUD + Scroller)
**Goal:** Full heads-up display with auto-hide behavior.

**Files:** `hud/top_bar.py`, `hud/bottom_hud.py`, `hud/manual_scroller.py`, `hud/toast.py`

**Work:**
- **Top bar:** Title + series name + back button. Gradient overlay (linear gradient, 72% black → transparent). Positioned absolute top.
- **Bottom HUD:** Scrub bar (custom QSlider subclass with hover bubble, 3→6px expand on hover, thumb appears on hover), page counter, play/pause button, mode button, settings button. Gradient overlay (82% black → transparent). Positioned absolute bottom.
- **Manual scroller:** Right-edge thumb (7×54px, rounded). Drag tracking with cached geometry. Mode-specific mapping: portrait = page-based progress, two-page scroll = stream pixel position.
- **Auto-hide:** 3s `QTimer` in auto modes. Never hide in manual/flip/autoFlip. 6 freeze conditions (end overlay, scroller drag, scrub drag, overlays open, hover on scrub, hover on HUD). Edge wake: 60px from top/bottom.
- **Toast:** Stacking notifications. Auto-dismiss. "Next · Page X/Y", "Prev · Page X/Y", "Start", "End", etc.
- **Transitions:** `QPropertyAnimation` on opacity (180ms) + y-translate (6px). Use `QGraphicsOpacityEffect`.

**Test:** HUD appears/disappears correctly. Scrub bar navigates. Scroller thumb tracks position. Toasts show and dismiss.

---

### Phase 9 — Full Input System
**Goal:** Complete keyboard, mouse, and wheel routing with overlay priority.

**Files:** `input_handler.py`

**Work:**
- **Overlay priority stack:** context_menu > goto/imgfx/loupe_zoom > keys > volume_nav > speed_slider > mega_settings. Each level blocks input to lower levels.
- **Keyboard routing:** 50+ bindings. Mode-aware (different behavior per control mode). Typing target detection (skip nav keys when QLineEdit focused). Modifier tracking (Shift, Ctrl) even through early returns.
- **Click zones:** Three equal columns via position math. Left/right = page turn with 90ms flash (QTimer + stylesheet toggle). Middle = HUD toggle (single click, 220ms debounce) / fullscreen (double click). MangaPlus drag in middle zone.
- **Wheel routing:** Mode dispatch → manual scroll pump / two-page scroll pump / scrub navigation / MangaPlus pan. All using `WheelAccumulator` from scroll_physics.
- **Speed adjust:** Comma/Period = nudge speed ×1.05/×0.95. Shift = larger steps.

**Test:** All keybindings work per mode. Overlays block input correctly. Click zones flash and navigate. Wheel scrolls smoothly in all modes.

---

### Phase 10 — Overlays (Mega Settings + Volume Nav + Speed + Keys + Context Menu)
**Goal:** All overlay panels with keyboard navigation.

**Files:** `hud/mega_settings.py`, `hud/volume_navigator.py`, `hud/speed_slider.py`, `hud/context_menu.py`, `hud/loupe_widget.py`, `hud/end_overlay.py`

**Work:**
- **Mega Settings:** QWidget panel with sub-panel stack. Corner (bottom-right) or floater (right-click anchor, clamped to viewport). Sections: control mode, portrait width (chips), scroll speed, image scaling, bookmarks, two-page controls, display. Keyboard nav: arrows wrap, enter/space activate, escape/backspace back. QSS dark theme styling.
- **Volume Navigator:** QListWidget or custom list with `QLineEdit` search filter. Fuzzy matching. Time-ago display ("3 days ago"). Keyboard: up/down navigate, enter select, escape close. Pause on open, resume on close.
- **Speed Slider:** Log-scale (5-5000 px/sec). Custom QSlider subclass. Pointer capture during drag. Pause on open, resume on close.
- **Context Menu:** `QMenu` with native OS styling. Items: goto page, export/copy page, reveal in explorer, scaling submenu, bookmark, loupe toggle, gutter shadow presets.
- **Loupe:** 220×220px QWidget. Draws zoomed region (0.5-3.5×) from current page bitmap. Follows cursor position. `pointer-events: none` equivalent via `setAttribute(WA_TransparentForMouseEvents)`.
- **End Overlay:** Semi-transparent overlay with "End of Volume" message + next volume button.
- **Goto Page:** Small QWidget with QLineEdit + confirm button.
- **Image Filters:** Brightness/contrast/saturation/invert/grayscale applied via QPainter composition modes or QImage manipulation before caching.

**Test:** Each overlay opens/closes correctly. Keyboard navigation works within overlays. Settings changes apply immediately. Context menu items work.

---

### Phase 11 — Progress & Settings Persistence
**Goal:** Per-series settings, progress checkpoints, continue reading.

**Files:** `settings_store.py`

**Work:**
- **Storage:** Reuse `projectbutterfly/storage.py` patterns — atomic writes (.tmp → rename), .bak backup, debounced writes (150ms via `threading.Timer`).
- **Progress payload:** `page_index`, `y`, `settings`, `page_count`, `book_meta`, `max_page_seen`, `known_spread_indices`, `known_normal_indices`, `updated_at`, `finished`, `finished_at`.
- **Auto-save:** Every ~5s during active reading (1500ms delay if playing, 450ms if paused). Per-book timer.
- **Series settings:** Persistent per-series: speed, mode, zoom, bookmarks, portrait width, scaling quality, loupe state, gutter shadow, coupling nudge, auto-flip interval.
- **Continue Reading:** Touch `updated_at` on every open. Track `max_page_seen` for auto-finish detection.
- **Book/Series ID generation:** Base64url(path + size + mtime) for book ID, base64url(folder path) for series ID (match existing Electron logic).

**Test:** Close and reopen same volume — resumes at exact position with same settings. Switch volumes — each retains independent settings.

---

### Phase 12 — Polish, Testing & Integration Prep
**Goal:** Visual polish, edge cases, performance profiling, integration hooks.

**Work:**
- **Visual polish:** Match all CSS constants — colors (`#0d1117`, `rgba(255,255,255,0.12)`, etc.), border-radius (14-18px), blur effects (where QSS supports), gradient overlays, scrub bar expand animation, click zone flash.
- **Performance profiling:** Ensure paint cycle < 16ms for smooth 60fps. Profile large volumes (500+ pages). Verify memory stays under budget during rapid navigation.
- **Edge cases:** Empty archives, corrupt images (graceful fallback), single-page volumes, all-spread volumes, rapid volume switching (stale token correctness), resize during auto-scroll, mode switch mid-scroll.
- **Integration hooks:** `ComicReaderWidget` exposes: `open_book(path, book_meta)`, `close_book()`, `get_progress()`, signals for `book_opened`, `book_closed`, `progress_changed`. Ready for QStackedWidget embedding.
- **Standalone launcher polish:** File picker with recent files. Drag-and-drop support.

**Test:** Full end-to-end reading session across all modes. Profile confirms 60fps. Edge cases handled gracefully.

---

## Reuse Map

| Existing Code | Reuse For |
|---|---|
| `projectbutterfly/player_ui.py` MpvContainer pattern | Widget hierarchy, setGeometry()+raise_(), auto-hide timers, event filter |
| `projectbutterfly/player_ui.py` TopStrip/BottomHUD | Top bar + bottom HUD widget patterns |
| `projectbutterfly/player_ui.py` SeekSlider | Scrub bar subclass pattern |
| `projectbutterfly/player_ui.py` ToastHUD | Toast notification pattern |
| `projectbutterfly/player_ui.py` TracksDrawer | Side-panel overlay pattern (for mega settings) |
| `projectbutterfly/player_ui.py` CenterFlash | Click zone flash feedback pattern |
| `projectbutterfly/player_ui.py` VolumeHUD | Opacity animation pattern |
| `projectbutterfly/storage.py` | Atomic JSON writes, debounced persistence |
| `projectbutterfly/bridge.py` ArchivesBridge | Archive session management (adapt for direct in-process use) |
| `src/domains/reader/render_two_page.js` | Two-page pairing math (port logic 1:1) |
| `src/domains/reader/bitmaps.js` | LRU cache structure + eviction algorithm |
| `src/domains/reader/state_machine.js` | Control mode state machine + auto-flip timer |
| `src/domains/reader/input_pointer.js` | Wheel accumulator + smooth scroll constants |

## Verification

After each phase:
1. Run `launcher.py` and test the specific phase features
2. Verify no regressions in previously completed phases
3. Profile paint performance with `QElapsedTimer` in paintEvent
4. Test with both CBZ and CBR archives
5. Test with various page counts (1, 10, 100, 500+)
6. Test resize behavior at each phase

Final integration test:
1. Add `ComicReaderWidget` as index 2 in `projectbutterfly/app.py` QStackedWidget
2. Wire bridge call from web UI library → `open_book()` → stack flip to reader
3. Verify all features work embedded (not just standalone)
4. Verify progress persistence works with existing data format
