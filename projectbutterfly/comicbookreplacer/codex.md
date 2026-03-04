# Comic Book Replacer — Development Contract

## Purpose
Native PySide6 comic reader to replace the Canvas2D web-based reader inside the Butterfly app.
This module lives at `projectbutterfly/comicbookreplacer/` and is **fully isolated** — no imports from or to the rest of the Butterfly codebase until integration is explicitly approved.

## Golden Rule
The user oversees every slice. No slice is started without the user seeing the previous slice working with a real comic book open. The launcher must always open a comic immediately — no blank screens, no file dialogs wasting time.

## Boot Command
```bash
python projectbutterfly/comicbookreplacer/launcher.py [path_to_cbz_or_cbr]
```
If no path is given, open a native `QFileDialog` and block until the user picks a file.
The window must be fullscreen-ready, dark background (#000), and the comic must be visible within 1 second of launch.

## Slice Workflow
1. **Agent proposes a slice** — a numbered scope of work with exact deliverables.
2. **User approves or adjusts** the slice scope.
3. **Agent implements** the slice.
4. **Agent commits** immediately after implementation (atomic commit per slice).
5. **User tests** with a real comic — confirms pass or reports bugs.
6. **Bugs are fixed** in follow-up commits before the next slice begins.
7. Repeat until full parity with the Electron reader.

## Architecture Constraints
- PySide6 only. No QWebEngine, no HTML, no JS.
- `QWidget`-based rendering via `paintEvent` + `QPainter`.
- Archive I/O: Python `zipfile` (CBZ) and `rarfile` (CBR). No subprocess calls.
- Image decode: `QImage.loadFromData(raw_bytes)` → `QPixmap`. No base64. No Blob. No JS.
- Background decode on `QThreadPool` with signals back to main thread.
- All state in a single `ReaderState` dataclass — no scattered globals.
- Settings persisted to a JSON file. Per-series and per-volume, matching the Electron format.
- Progress persisted to a JSON file. Same payload shape as Electron for future compatibility.

## File Layout (grows per slice)
```
comicbookreplacer/
  CLAUDE.md              — this file (development contract + parity tracker)
  codex.md               — identical to CLAUDE.md
  launcher.py            — standalone entry point
  reader_widget.py       — top-level QWidget (composes everything)
  archive_handler.py     — CBZ/CBR open, entry list, lazy page read
  bitmap_cache.py        — threaded decode, LRU eviction, prefetch
  canvas_widget.py       — QWidget paintEvent renderer (portrait + two-page)
  render_portrait.py     — infinite strip + single-page draw logic
  render_two_page.py     — flip + mangaplus + scroll draw logic
  input_handler.py       — keyboard + mouse/wheel routing
  hud.py                 — top bar, bottom bar, scrub bar, auto-hide
  mega_settings.py       — nested settings menu
  overlays.py            — goto, volume nav, end-of-volume, keys, speed
  image_filters.py       — brightness/contrast/saturation/sepia/hue/invert/grayscale
  loupe.py               — magnifier widget
  scroll_physics.py      — wheel accumulator + momentum
  state.py               — ReaderState dataclass + defaults
  progress.py            — load/save/clear per-book progress
  page_layout.py         — two-page pairing algorithm, spread detection
```

## Parity Target — Complete Feature List

Every feature below must work identically to the Electron reader before this module can replace it.
Features are grouped by category. Each has a status: `[ ]` pending, `[~]` in progress, `[x]` done.

### A. Rendering Modes
- [ ] A1. Manual (Long Strip) — infinite vertical scroll, wheel/arrow keys
- [ ] A2. Auto Scroll — continuous scroll at configurable px/s, play/pause
- [ ] A3. Auto Flip — timed two-page flip with countdown display
- [ ] A4. Two-Page Flip — side-by-side pairs, left/right click navigation
- [ ] A5. Two-Page MangaPlus — fit-width default, zoom 100-260%, pan when zoomed
- [ ] A6. Two-Page Scroll — stacked paired rows, continuous vertical scroll

### B. Image Pipeline
- [ ] B1. CBZ (zip) archive open/read/close
- [ ] B2. CBR (rar) archive open/read/close
- [ ] B3. QImage decode on thread pool (PNG, JPEG, WebP)
- [ ] B4. LRU bitmap cache — 512MB normal, 256MB memory-saver, 12-entry keep cap
- [ ] B5. Decode concurrency limit (2 simultaneous)
- [ ] B6. Prefetch neighbors (current ± 2)
- [ ] B7. Stale decode protection (volume/open tokens)
- [ ] B8. Spread detection at decode time (aspect ratio >= 1.25)
- [ ] B9. Manual spread overrides (force-spread, force-normal per page)
- [ ] B10. Natural-sort archive entries by filename

### C. Portrait Renderer
- [ ] C1. Infinite strip — up to 6 pages in one paint pass
- [ ] C2. Single-page sub-mode (top-hold / scroll / bottom-hold for auto)
- [ ] C3. No-upscale rule (never wider than natural pixel width)
- [ ] C4. Portrait width cap (50-100% of canvas, steps: 50/60/70/74/78/90/100)
- [ ] C5. Spread pages drawn full-width ignoring portrait cap
- [ ] C6. DPR-aware canvas sizing
- [ ] C7. lastFrameRects tracking (for loupe sampling)

### D. Two-Page Renderer
- [ ] D1. Physical parity pairing with stitched-spread slot consumption
- [ ] D2. Cover (page 0) always solo unless stitched spread
- [ ] D3. Configurable gutter (default 0px)
- [ ] D4. Independent image-fit per mode (height/width)
- [ ] D5. MangaPlus zoom (100-260%) with 2D pan
- [ ] D6. Gutter shadow (0/0.22/0.35/0.55 presets)
- [ ] D7. Multi-step downscale for smooth quality mode
- [ ] D8. Coupling nudge (P key, ±1 parity shift)
- [ ] D9. Two-Page Scroll row layout (paired rows, spread handling, row gaps)

### E. Image Filters
- [ ] E1. Brightness (50-150%, default 100)
- [ ] E2. Contrast (50-150%, default 100)
- [ ] E3. Saturation (0-200%, default 100)
- [ ] E4. Sepia (0-100%, default 0)
- [ ] E5. Hue rotation (0-360°, default 0)
- [ ] E6. Invert (toggle, default off)
- [ ] E7. Grayscale (toggle, default off)
- [ ] E8. Image scale quality modes: off/smooth/sharp/pixel
- [ ] E9. Filter overlay UI with sliders and presets
- [ ] E10. LRU filter cache to avoid re-processing unchanged images

### F. Navigation
- [ ] F1. Next/prev page (single step)
- [ ] F2. Next/prev two-page pair (spread-aware)
- [ ] F3. Go-to-page overlay (number input + slider)
- [ ] F4. Home/End keys (first/last page)
- [ ] F5. Instant replay (Z key — scroll back 30% viewport)
- [ ] F6. Volume navigator overlay (O key — sibling volumes, search, time-ago labels)
- [ ] F7. Prev/next volume buttons (series-aware)
- [ ] F8. End-of-volume overlay (Next Volume / Replay / Library)
- [ ] F9. Loading overlay (120ms delay to prevent flicker)

### G. Input — Keyboard
- [ ] G1. Arrow keys / PageUp/PageDown — mode-aware navigation
- [ ] G2. Space/Enter — play/pause (auto) or flip (two-page)
- [ ] G3. M — cycle control modes
- [ ] G4. I — invert reading direction (two-page flip)
- [ ] G5. P — coupling nudge toggle
- [ ] G6. H — HUD visibility toggle
- [ ] G7. F / F11 — fullscreen toggle
- [ ] G8. L — loupe toggle
- [ ] G9. K — keyboard shortcuts overlay
- [ ] G10. O — volume navigator
- [ ] G11. Z — instant replay
- [ ] G12. S — save checkpoint now
- [ ] G13. R — clear resume
- [ ] G14. B — toggle bookmark
- [ ] G15. Comma/Period — adjust auto-scroll speed
- [ ] G16. Shift modifier (2.5× speed), Ctrl modifier (0.2× speed)
- [ ] G17. Escape — close overlay / exit fullscreen
- [ ] G18. Backspace — back to library (or close window in standalone)

### H. Input — Pointer
- [ ] H1. Click zones (left/mid/right) with mode-aware actions
- [ ] H2. Mid single-click vs double-click disambiguation (220ms timer)
- [ ] H3. Double-click mid = fullscreen toggle
- [ ] H4. Right-click = context menu (mega settings floater)
- [ ] H5. MangaPlus drag pan (pointer capture, 4px dead zone)
- [ ] H6. Click flash feedback (green OK / red blocked, 90ms)
- [ ] H7. Mouse wheel — mode-aware (scroll, page scrub, pan)
- [ ] H8. Wheel smoothing (EMA accumulator, 38% consume/frame, noise filter)
- [ ] H9. Edge-hover HUD wake (60px from top/bottom, 600ms cooldown)

### I. HUD
- [ ] I1. Top bar — back button, volume title, bookmark indicator
- [ ] I2. Bottom bar — scrub bar, play/pause, mode label, prev/next volume, quick buttons
- [ ] I3. Scrub bar — draggable, bubble label, pointer capture, rAF-gated
- [ ] I4. Manual scroller — right-edge vertical thumb for scroll position
- [ ] I5. Auto-hide (3s inactivity in auto modes)
- [ ] I6. Click-pin (manual/two-page modes)
- [ ] I7. Freeze during drag/overlay
- [ ] I8. Portrait width chips (50-100%)
- [ ] I9. Auto Flip countdown display
- [ ] I10. Speed display (% relative to baseline)

### J. Mega Settings
- [ ] J1. Corner mode (S key) and floater mode (right-click)
- [ ] J2. Speed submenu (Speed 1-10)
- [ ] J3. Mode submenu (all 6 modes)
- [ ] J4. Auto Flip interval submenu (5-120s)
- [ ] J5. Image Fit submenu (height/width)
- [ ] J6. Portrait width submenu
- [ ] J7. Gutter shadow submenu (Off/Subtle/Medium/Strong)
- [ ] J8. Two-Page Scroll row gap input
- [ ] J9. Tools section (Go to page, Image filters, Loupe, Bookmarks, Memory Saver)
- [ ] J10. Spread overrides (mark spread/normal/reset)
- [ ] J11. Keyboard navigation (arrows, enter, back, escape)

### K. Loupe
- [ ] K1. Circular magnifier following cursor
- [ ] K2. Zoom 0.5-3.5× (default 2.0)
- [ ] K3. Size 140-640px (default 220)
- [ ] K4. Samples from lastFrameRects (source bitmap mapping)
- [ ] K5. Edge-flip logic (cursor near screen edges)
- [ ] K6. Hides during overlays
- [ ] K7. Loupe Zoom overlay (sliders for zoom + size)

### L. Bookmarks
- [ ] L1. Toggle bookmark on current page (B key, context menu)
- [ ] L2. Bookmark indicators on scrub bar
- [ ] L3. Bookmark list in Mega Settings
- [ ] L4. Jump-to-bookmark from menu (up to 6 shown)
- [ ] L5. Persisted in progress payload as sorted array

### M. Persistence
- [ ] M1. Per-book progress (page, scroll offset, settings, spreads, bookmarks, finished flag)
- [ ] M2. Per-series settings (shared across volumes in same series)
- [ ] M3. Save schedule: 1500ms playing, 450ms paused
- [ ] M4. Immediate save on S key with toast
- [ ] M5. Clear resume on R key
- [ ] M6. Resume on open (restore page + scroll + settings)
- [ ] M7. Finished flag (auto-set when maxPageSeen >= pageCount - 1)
- [ ] M8. updatedAt bumped on every open

### N. Scroll Physics
- [ ] N1. Wheel accumulator with EMA (alpha 0.62)
- [ ] N2. Noise threshold (2.5px)
- [ ] N3. Auto-reset after 140ms idle
- [ ] N4. Manual wheel pump (60fps, 52% consume per tick for momentum)
- [ ] N5. Two-Page Scroll smooth consumption (38% per tick)

### O. Misc
- [ ] O1. Toast notifications (mode changes, speed, bookmarks, save, errors)
- [ ] O2. Crossfade transition on page/volume change
- [ ] O3. Dark background (#000) always
- [ ] O4. Page label format "Page N / Total" (1-indexed)
- [ ] O5. Natural sort for archive entries
- [ ] O6. Window title shows volume name

## Slice Log
<!-- Each slice records: number, scope, status, commit hash -->

| Slice | Scope | Status | Commit |
|-------|-------|--------|--------|
| 1 | Archive (CBZ) + threaded decode + LRU cache + portrait strip scroll + launcher | In Progress | — |

## Notes
- Slices are proposed by the agent, approved by the user, and sized to be testable in one session.
- A slice is never larger than what can be visually verified with a real comic open.
- Bug fixes from testing are committed separately, not folded into the next slice.
- No premature abstraction. Write the simplest code that works for the current slice.
- `var` style is NOT required here — this is Python, use normal Python conventions.
