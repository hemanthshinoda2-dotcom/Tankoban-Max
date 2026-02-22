# FEAT-AUDIOBOOK: Audiobooks in Books Mode

## Context

Books mode currently supports EPUB/PDF/TXT reading with TTS narration. The user wants **real audiobook files** as a first-class feature: a separate audiobook shelf in the library, folder-based audiobook scanning, an in-reader audio player for "read along while listening", and manual chapter pairing between book chapters and audiobook chapter files. Book progress and audiobook progress stay independent — no automatic sync.

The existing architecture is a strong foundation: the books library already has shelf/progress/show patterns, the reader has a modular architecture with a bus-based event system, and the TTS bar demonstrates the "audio controls inside the reader" pattern. The listening shell shows how to swap continue-shelf data sources.

---

## Decisions Made

1. **Audio engine**: Plain HTML5 Audio (`new Audio()`) — no libraries. Same approach the project uses for TTS.
2. **MediaSession API**: Yes — enables keyboard media keys and Windows media overlay (~20 lines)
3. **TTS/audiobook conflict**: Mutual exclusion — loading one stops the other, no prompt
4. **Standalone player**: Full-screen overlay (same pattern as listening player `lp-shell`)
5. **In-reader bar**: Single-row transport bar (matches TTS bar style and behavior)
6. **Continue shelf**: Separate "Continue Listening..." row below audiobooks panel
7. **Duration extraction**: Yes — use `music-metadata` (pure JS) during scanning for time-based UI

---

## Data Model

### Audiobook Record (from scan)
```js
{
  id,            // base64url of "folderPath::totalSize::latestMtimeMs"
  title,         // folder name (or metadata-derived)
  path,          // absolute folder path
  chapters: [    // ordered audio files
    { file, title, path, size, duration }
  ],
  totalDuration, // sum of chapter durations (seconds), 0 if unknown
  coverPath,     // path to cover image found in folder (cover.jpg, folder.jpg, etc.) or null
  rootPath,      // root audiobook folder
  rootId,        // "abroot:base64url(rootPath)"
}
```

### Audiobook Progress
```js
{
  chapterIndex,  // current chapter (0-based)
  position,      // seconds into current chapter
  totalChapters,
  finished,
  updatedAt,
  audiobookMeta: { path, title }
}
```

### Chapter Pairing (book <-> audiobook)
```js
{
  bookId,
  audiobookId,
  mappings: [
    { bookChapterHref, bookChapterLabel, abChapterIndex, abChapterTitle }
  ],
  updatedAt,
}
```

---

## Phase 1: Backend Foundation (~2 sessions)

### Session 1A: IPC + Main Process Audiobook Domain

**Goal**: Audiobook scanning, config persistence, state snapshots — the full backend pipeline.

#### IPC Channels (add to `shared/ipc.js`)
```
// Audiobook Library
AUDIOBOOK_GET_STATE          // -> { audiobookRootFolders, audiobooks, scanning, ... }
AUDIOBOOK_SCAN               // trigger rescan
AUDIOBOOK_ADD_ROOT_FOLDER    // add audiobook root
AUDIOBOOK_REMOVE_ROOT_FOLDER // remove audiobook root

// Audiobook Progress
AUDIOBOOK_PROGRESS_GET_ALL   // -> { byId: { [abId]: progress } }
AUDIOBOOK_PROGRESS_GET       // (abId) -> progress
AUDIOBOOK_PROGRESS_SAVE      // (abId, progress) -> void
AUDIOBOOK_PROGRESS_CLEAR     // (abId) -> void

// Chapter Pairing
AUDIOBOOK_PAIRING_GET        // (bookId) -> pairing | null
AUDIOBOOK_PAIRING_SAVE       // (bookId, pairing) -> void
AUDIOBOOK_PAIRING_DELETE     // (bookId) -> void
AUDIOBOOK_PAIRING_GET_ALL    // -> { byBookId: { ... } }

// Events
AUDIOBOOK_UPDATED            // push: state snapshot changed
```

#### New Files

| File | Purpose |
|------|---------|
| `main/domains/audiobooks/index.js` | Config (audiobook_config.json), scan lifecycle, state snapshots, `emitAudiobooksUpdated()` |
| `workers/audiobook_scan_worker.js` | Entry point (loads impl) |
| `workers/audiobook_scan_worker_impl.js` | Walk audiobook root folders, find folders containing audio files, build audiobook records. Uses `music-metadata` (pure JS) for duration extraction per chapter file |
| `main/domains/audiobookProgress/index.js` | CRUD for `audiobook_progress.json`, same pattern as `booksProgress` |
| `main/domains/audiobookPairing/index.js` | CRUD for `audiobook_pairings.json`, keyed by bookId |
| `main/ipc/register/audiobooks.js` | Wire all audiobook IPC handlers |
| `main/ipc/register/audiobook_progress.js` | Wire progress handlers |
| `main/ipc/register/audiobook_pairing.js` | Wire pairing handlers |
| `preload/namespaces/audiobooks.js` | `Tanko.api.audiobooks.*` namespace |

#### Modified Files
- `shared/ipc.js` — add ~15 channel constants
- `main/ipc/index.js` — require and call the 3 new register modules
- `preload/index.js` — import and attach audiobooks namespace

#### Scan Worker Logic
The audiobook scan worker walks root folders looking for **directories that contain audio files**. A folder qualifies as an audiobook if it contains at least one file matching the audio extension set (`.mp3`, `.m4a`, `.m4b`, `.ogg`, `.opus`, `.flac`, `.wav`, `.aac`, `.wma`).

Chapter ordering: alphabetical sort by filename (natural sort). This is the standard convention for audiobook chapter files (e.g., `01 - Chapter One.mp3`, `02 - Chapter Two.mp3`).

Cover detection: look for `cover.jpg`, `cover.png`, `folder.jpg`, `front.jpg`, or the first `.jpg`/`.png` in the folder.

Duration extraction: Use the `music-metadata` npm package (pure JS, no native binaries) to read durations during scanning. This enables time-based seek bars, "X hours remaining" estimates, and meaningful progress percentages. The scan worker extracts duration for each chapter file and sums them for `totalDuration`.

#### Persistence Files
| File | Contents |
|------|----------|
| `audiobook_config.json` | `{ audiobookRootFolders: [] }` |
| `audiobook_index.json` | `{ audiobooks: [...] }` — scan output |
| `audiobook_progress.json` | `{ [abId]: { chapterIndex, position, ... } }` |
| `audiobook_pairings.json` | `{ [bookId]: { audiobookId, mappings, ... } }` |

---

## Phase 2: Library UI (~2 sessions)

### Session 2A: Audiobook Shelf in Books Home View

**Goal**: Audiobook tiles appear in the books library alongside book shows.

#### Approach
The audiobook shelf is a **new section** in `booksHomeView`, placed **between** the continue panel and the series panel. It's visually similar to the series grid but shows audiobook folders instead of book series.

#### DOM Addition (in `src/index.html`, inside `#booksHomeView`)
```html
<!-- Audiobooks shelf -->
<div id="booksAudiobooksPanel" class="panel seriesPanel hidden">
  <div class="panelTitleRow">
    <div class="panelTitle">Audiobooks</div>
    <div id="booksAudiobooksLabel" class="muted tiny">No folders added</div>
  </div>
  <div id="booksAudiobooksGrid" class="seriesGrid"></div>
  <div id="booksAudiobooksEmpty" class="muted tiny hidden">
    No audiobooks found. Add an audiobook root folder from the sidebar.
  </div>
</div>
```

#### Sidebar Addition
Add an "Audiobook Folders" section to the library sidebar tree (below the existing book root folders). This follows the same pattern as the existing root folder management: add/remove buttons, folder list.

#### Renderer Changes (`src/domains/books/library.js`)
- Add `state.audiobookSnap` to hold audiobook state from `api.audiobooks.getState()`
- Add `state.audiobookProgressAll` for audiobook progress
- New `refreshAudiobookState()` — fetches state and progress, calls `renderAudiobooks()`
- New `renderAudiobooks()` — builds tiles in `#booksAudiobooksGrid`, shows cover image + title + progress bar
- Listen for `AUDIOBOOK_UPDATED` event to re-render
- Wire sidebar buttons for add/remove audiobook root folders
- Audiobook tile click: opens audiobook player overlay (Phase 3)

#### Audiobook Tiles
Each audiobook tile shows:
- Cover image (from `coverPath`, or a default audio icon)
- Title (folder name)
- Chapter count badge
- Progress bar (from audiobook progress)
- Click action: opens audiobook player overlay (Phase 3)

---

## Phase 3: Audiobook Player (~2-3 sessions)

### Audio Engine

**Plain HTML5 Audio** — no libraries. The project already uses `new Audio()` throughout (TTS engines, EPUB media overlays). For local audiobook files, `HTMLAudioElement` natively handles:
- All needed formats: mp3, m4a, m4b, ogg, opus, flac, wav, aac
- Playback speed via `.playbackRate` (0.5x-3.0x)
- Seeking via `.currentTime`
- Volume via `.volume`
- Duration via `.duration` (loaded from file headers)
- Event-based progress via `timeupdate`, `ended`, `loadedmetadata`, `error`

Chapter-to-chapter transitions: when `ended` fires, load the next chapter file via `audio.src = 'file://' + nextPath` and call `audio.play()`.

### TTS / Audiobook Mutual Exclusion

Only one audio source plays at a time:
- Loading an audiobook **stops TTS** (`window.booksTTS.stop()` + `destroy()`)
- Starting TTS **stops the audiobook** (bus event `audiobook:close`)
- Enforced in `reader_core.js`'s listen button handler and the audiobook module's `loadAudiobook()`

### MediaSession API Integration

Add `navigator.mediaSession` support (~20 lines) so the OS shows audiobook info:
```js
navigator.mediaSession.metadata = new MediaMetadata({
  title: chapterTitle,
  artist: audiobookTitle,
  artwork: [{ src: coverPath, sizes: '512x512', type: 'image/jpeg' }]
});
navigator.mediaSession.setActionHandler('play', play);
navigator.mediaSession.setActionHandler('pause', pause);
navigator.mediaSession.setActionHandler('previoustrack', prevChapter);
navigator.mediaSession.setActionHandler('nexttrack', nextChapter);
navigator.mediaSession.setActionHandler('seekbackward', () => seek(-15));
navigator.mediaSession.setActionHandler('seekforward', () => seek(15));
```
This enables keyboard media keys (play/pause/next/prev) and Windows media overlay.

### Session 3A: Core Playback Engine

#### Audiobook Player Module (`src/domains/books/reader/reader_audiobook.js`)

A new reader module registered in `reader_core.js`'s module array, following the `{ bind, onOpen, onClose }` lifecycle. Also exported as `window.booksAudiobookPlayer` for use by the standalone overlay.

**Playback engine**: Single `HTMLAudioElement` created in JS. Manages a playlist of chapter files as sequential `audio.src` assignments.

**State**:
```js
{
  audiobook: null,       // current audiobook record
  chapterIndex: 0,       // current chapter
  playing: false,
  audio: null,           // HTMLAudioElement, created on first use
  playbackRate: 1.0,
  volume: 1.0,
  seekPending: false,    // true while seeking (debounce timeupdate)
}
```

**Key methods**:
- `loadAudiobook(audiobook, resumeOpts)` — set audiobook, optionally resume from `{ chapterIndex, position }`
- `playChapter(index)` — `audio.src = 'file://' + chapter.path`, waits for `loadedmetadata`, then `play()`
- `play()` / `pause()` / `togglePlayPause()`
- `seek(seconds)` — seek within current chapter; clamps to 0..duration
- `seekRelative(delta)` — e.g., `seekRelative(-15)` for rewind 15s
- `nextChapter()` / `prevChapter()` — bounds-checked, saves progress before switching
- `setRate(rate)` — `audio.playbackRate = rate`, persisted
- `setVolume(vol)` — `audio.volume = vol`, persisted
- `getProgress()` — `{ chapterIndex, position, duration, totalChapters, chapterTitle }`
- `close()` — pause, save progress, reset state, hide bar, clear MediaSession

**Audio element event handlers**:
- `timeupdate` — fires `audiobook:progress` bus event (~4Hz), updates seek slider + time display
- `ended` — auto-advance to next chapter; if last chapter, mark `finished` and fire `audiobook:state idle`
- `loadedmetadata` — update duration display, seek to resume position if applicable
- `error` — log error, emit `audiobook:state error`, show brief toast

**Bus events emitted**:
- `audiobook:state` — `playing | paused | idle | loading | error`
- `audiobook:progress` — `{ chapterIndex, position, duration, chapterTitle }`
- `audiobook:chapter-changed` — `{ index, title, total }`

**Progress auto-save** (debounced 2s via `setTimeout`):
- Triggered on: `timeupdate` (every 30s), chapter change, pause, close, `beforeunload`
- Calls `Tanko.api.audiobooks.saveProgress(audiobookId, progressData)`

### Session 3B: In-Reader Transport Bar

#### Bar Layout (single-row, matches TTS bar)

```
+-----------------------------------------------------------------------------------+
| Ch.3  |<<  <<15  [>||]  15>>  >>|  02:15 / 45:30  [-] 1.0x [+]  Vol[====]  [X]  |
+-----------------------------------------------------------------------------------+
```

Controls left-to-right:
1. **Chapter label** — truncated title of current chapter, clickable (opens chapter list popup or switches to sidebar Audio tab)
2. **Prev chapter** `|<<` — go to previous chapter file
3. **Rewind 15s** `<<15` — `seekRelative(-15)`
4. **Play/Pause** `[>||]` — large central button, toggles icon
5. **Forward 15s** `15>>` — `seekRelative(15)`
6. **Next chapter** `>>|` — go to next chapter file
7. **Time** `02:15 / 45:30` — current position / chapter duration
8. **Speed** `[-] 1.0x [+]` — decrement/increment by 0.1x, display badge
9. **Volume** icon + `<input type="range">` slider
10. **Close** `[X]` — unload audiobook, stop playback

#### DOM (in `src/index.html`, sibling of `#lpTtsBar` inside `.br-reading-area`)

```html
<div id="abPlayerBar" class="ab-player-bar hidden" role="toolbar" aria-label="Audiobook controls">
  <span id="abChapterLabel" class="ab-chapter-label" title="">Ch. 1</span>
  <button id="abPrevCh" class="iconBtn ab-btn" title="Previous chapter" aria-label="Previous chapter">|&lt;&lt;</button>
  <button id="abRew15" class="iconBtn ab-btn" title="Rewind 15s" aria-label="Rewind 15 seconds">&lt;&lt;15</button>
  <button id="abPlayPause" class="iconBtn ab-btn ab-play" title="Play/Pause" aria-label="Play or pause">&#9654;</button>
  <button id="abFwd15" class="iconBtn ab-btn" title="Forward 15s" aria-label="Forward 15 seconds">15&gt;&gt;</button>
  <button id="abNextCh" class="iconBtn ab-btn" title="Next chapter" aria-label="Next chapter">&gt;&gt;|</button>
  <span id="abTime" class="ab-time">0:00 / 0:00</span>
  <button id="abSlower" class="iconBtn ab-btn" title="Slower" aria-label="Slower">&#8722;</button>
  <span id="abSpeed" class="ab-speed">1.0&times;</span>
  <button id="abFaster" class="iconBtn ab-btn" title="Faster" aria-label="Faster">+</button>
  <input type="range" id="abVolume" class="ab-volume" min="0" max="1" step="0.05" value="1" title="Volume" aria-label="Volume">
  <button id="abClose" class="iconBtn ab-btn" title="Close audiobook" aria-label="Close audiobook">&times;</button>
</div>
```

#### CSS

Styled identically to `.booksReaderTtsBar`:
- Fixed to bottom of `.br-reading-area`
- `background: rgba(16,18,22,0.92)`, `backdrop-filter: blur(8px)`
- `z-index` above reader content but below overlays/popups
- Flex row, `align-items: center`, `gap: 6px`, `padding: 6px 12px`
- Auto-hide: opacity transition, shown on hover near bottom edge (same JS pattern as TTS bar)
- When both bars could be visible (shouldn't happen due to mutual exclusion, but defensively): audiobook bar sits above TTS bar

#### Auto-hide Behavior
Same pattern as the TTS bar in `listening_player.js`:
- Playing: auto-hides after 3s inactivity
- Paused: always visible
- Mouse in bottom 80px of reading area: show
- Mouse leaves: start 3s hide timer
- CSS: `opacity: 0; pointer-events: none` when hidden, `opacity: 1` when shown, `transition: opacity 300ms`

#### Keyboard Shortcuts (when audiobook is loaded)
| Key | Action |
|-----|--------|
| Space | Play/Pause (only when no TTS active and no text input focused) |
| J / L | Rewind 15s / Forward 15s |
| , / . | Prev chapter / Next chapter |
| +/- | Speed +/-0.1x |
| M | Mute/unmute |

Note: These overlap with TTS shortcuts. Since TTS and audiobook are mutually exclusive, only the active system's shortcuts fire. The audiobook module checks `state.audiobook !== null` before handling keys.

### Session 3C: Standalone Player Overlay (from library)

#### Full-Screen Overlay Layout

```
+------------------------------------------+
|  [<- Back]           Audiobook Title      |
|                                           |
|          +------------------+             |
|          |                  |             |
|          |   Cover Image    |             |
|          |    (300x300)     |             |
|          |                  |             |
|          +------------------+             |
|                                           |
|     Chapter 3: The Journey                |
|     (3 of 12 chapters)                    |
|                                           |
|  02:15 =========|================= 45:30  |
|                                           |
|   [|<<]  [<<15]  [ >|| ]  [15>>]  [>>|]  |
|                                           |
|   [-] 1.0x [+]           Vol [========]   |
|                                           |
|  [v Chapters]                             |
|  +--------------------------------------+ |
|  |  1. Introduction           05:20     | |
|  |  2. First Steps            12:45     | |
|  |> 3. The Journey            45:30  <--| |
|  |  4. Turning Point          38:15     | |
|  |  5. Resolution             22:10     | |
|  +--------------------------------------+ |
+------------------------------------------+
```

#### DOM (in `src/index.html`, inside books library area — sibling of `#booksHomeView`)

```html
<div id="audiobookPlayerOverlay" class="ab-overlay hidden">
  <div class="ab-overlay-header">
    <button id="abOverlayBack" class="ab-back-btn" title="Back to library">&#8592; Back</button>
    <div id="abOverlayTitle" class="ab-overlay-title"></div>
  </div>
  <div class="ab-overlay-body">
    <div class="ab-cover-wrap">
      <img id="abOverlayCover" class="ab-cover-img" alt="Audiobook cover" />
    </div>
    <div id="abOverlayChTitle" class="ab-overlay-chapter-title"></div>
    <div id="abOverlayChCount" class="ab-overlay-chapter-count muted tiny"></div>
    <div class="ab-overlay-seek-row">
      <span id="abOverlayTimeLeft" class="ab-overlay-time">0:00</span>
      <input type="range" id="abOverlaySeek" class="ab-overlay-seek" min="0" max="100" value="0" step="0.1">
      <span id="abOverlayTimeRight" class="ab-overlay-time">0:00</span>
    </div>
    <div class="ab-overlay-transport">
      <button id="abOverlayPrevCh" class="iconBtn ab-overlay-btn" title="Previous chapter">|&lt;&lt;</button>
      <button id="abOverlayRew15" class="iconBtn ab-overlay-btn" title="Rewind 15s">&lt;&lt;15</button>
      <button id="abOverlayPlayPause" class="iconBtn ab-overlay-btn ab-overlay-play" title="Play/Pause">&#9654;</button>
      <button id="abOverlayFwd15" class="iconBtn ab-overlay-btn" title="Forward 15s">15&gt;&gt;</button>
      <button id="abOverlayNextCh" class="iconBtn ab-overlay-btn" title="Next chapter">&gt;&gt;|</button>
    </div>
    <div class="ab-overlay-settings">
      <button id="abOverlaySlower" class="iconBtn ab-overlay-btn">&#8722;</button>
      <span id="abOverlaySpeed" class="ab-overlay-speed">1.0&times;</span>
      <button id="abOverlayFaster" class="iconBtn ab-overlay-btn">+</button>
      <div class="ab-overlay-vol-wrap">
        <svg class="ab-vol-icon" viewBox="0 0 16 16" width="14" height="14"><path d="M8 1.5L4.5 5H1.5v6h3L8 14.5V1.5z" fill="currentColor"/></svg>
        <input type="range" id="abOverlayVolume" class="ab-overlay-volume" min="0" max="1" step="0.05" value="1">
      </div>
    </div>
  </div>
  <div class="ab-overlay-chapters">
    <button id="abOverlayChToggle" class="ab-chapter-toggle">Chapters &#9660;</button>
    <div id="abOverlayChList" class="ab-chapter-list hidden"></div>
  </div>
</div>
```

#### Module (`src/domains/books/audiobook_player_overlay.js`)

An IIFE that:
- Exports `window.booksAudiobookOverlay`
- Uses the **same playback engine** as the reader module (`window.booksAudiobookPlayer`) — the engine is shared, the UI is different
- Wires all overlay DOM events to the player methods
- Listens for `audiobook:progress` and `audiobook:chapter-changed` bus events to update the UI
- `open(audiobook)`: shows overlay, loads audiobook into engine, renders chapter list, starts playback
- `close()`: hides overlay (does NOT stop playback — user can navigate back to library while audio continues)
- Chapter list: renders `<button>` per chapter with title + duration, highlights current, click calls `playChapter(index)`

#### CSS (new file `src/styles/audiobook-player.css`)
- Full-screen overlay: `position: fixed; inset: 0; z-index: 200`
- Background matches app theme (`var(--br-reader-bg)` or darker)
- Cover image: centered, max 300px, rounded corners, subtle shadow
- Transport buttons: 40px icons, central play/pause is 56px
- Seek slider: full-width, custom thumb matching app style
- Chapter list: scrollable, max-height 40vh, alternating row backgrounds
- Active chapter: accent color left border + bold text

---

## Phase 4: Chapter Pairing (~2 sessions)

### Session 4A: Pairing UI in Reader Sidebar

**Goal**: User can manually pair book chapters to audiobook chapter files, and the pairing is saved.

#### New Sidebar Tab: "Audio"

Add a 4th tab to the reader sidebar: `data-sidebar-tab="audio"`, with pane `data-pane="audio"`.

**Tab icon**: headphones or audio wave icon.

**Pane contents**:
1. **Audiobook selector**: dropdown or button to pick an audiobook from the scanned library. Shows "No audiobook linked" initially, or the paired audiobook title if one is already saved.
2. **Chapter mapping list**: two-column layout showing book chapters (from TOC) on the left and audiobook chapters (from the audiobook record) on the right. Each book chapter row has a dropdown to select which audiobook chapter it maps to.
3. **Auto-pair button**: automatically pairs by index (chapter 1 -> file 1, chapter 2 -> file 2, etc.). This is the common case and should be one-click.
4. **Save button**: saves the pairing via `api.audiobooks.savePairing(bookId, pairing)`
5. **Unlink button**: removes the pairing

#### New Module (`src/domains/books/reader/reader_audiobook_pairing.js`)

A reader module that:
- On `onOpen()`: checks if the current book has a saved pairing (`api.audiobooks.getPairing(bookId)`). If yes, loads the paired audiobook into the audiobook player (Phase 3) automatically.
- Renders the pairing UI in the sidebar pane
- Handles save/delete of pairings
- When user navigates to a book chapter that has a mapping, emits a bus event so the audiobook player can jump to the mapped chapter (optional auto-jump, user-configurable)

#### Chapter Navigation Sync (manual)
When the audiobook player is loaded and a pairing exists:
- The user navigates book chapters via TOC -> the audiobook player can optionally show "Jump to paired audio chapter?" prompt
- The user navigates audiobook chapters via the transport bar -> no effect on book position (they're independent)
- This keeps it simple and manual, as requested

---

## Phase 5: Progress & Continue (~1 session)

### Session 5A: Progress Persistence + Continue Shelf

**Goal**: Audiobook progress is saved and restored, and the continue shelf shows audiobooks.

#### Audiobook Progress Saves
- Save on: chapter change, every 30 seconds during playback, on pause, on close
- Restore on: opening an audiobook (resume from saved chapter + position)
- Data: `{ chapterIndex, position, totalChapters, finished, updatedAt, audiobookMeta }`

#### Continue Shelf Integration
A **separate "Continue Listening..." row** below the audiobooks panel, dedicated to audiobook progress. Visually mirrors the reading continue shelf but only shows audiobook entries. This keeps books and audiobooks clearly separated in the UI.

#### Progress on Tiles
Audiobook tiles in the shelf show a progress bar (percent based on `chapterIndex / totalChapters`, or time-based if durations are known).

---

## File Summary

### New Files (all phases)

| File | Phase |
|------|-------|
| `main/domains/audiobooks/index.js` | 1 |
| `main/domains/audiobookProgress/index.js` | 1 |
| `main/domains/audiobookPairing/index.js` | 1 |
| `main/ipc/register/audiobooks.js` | 1 |
| `main/ipc/register/audiobook_progress.js` | 1 |
| `main/ipc/register/audiobook_pairing.js` | 1 |
| `preload/namespaces/audiobooks.js` | 1 |
| `workers/audiobook_scan_worker.js` | 1 |
| `workers/audiobook_scan_worker_impl.js` | 1 |
| `src/domains/books/reader/reader_audiobook.js` | 3 |
| `src/domains/books/audiobook_player_overlay.js` | 3 |
| `src/domains/books/reader/reader_audiobook_pairing.js` | 4 |
| `src/styles/audiobook-player.css` | 2, 3 |

### Modified Files

| File | Phase | Changes |
|------|-------|---------|
| `shared/ipc.js` | 1 | ~15 new channel constants |
| `main/ipc/index.js` | 1 | Require + call 3 register modules |
| `preload/index.js` | 1 | Import + attach audiobooks namespace |
| `src/index.html` | 2, 3, 4 | Audiobooks shelf panel, audiobook player bar + overlay, sidebar audio tab |
| `src/domains/books/library.js` | 2, 5 | Audiobook state, shelf rendering, continue shelf integration |
| `src/domains/books/reader/reader_core.js` | 3 | Register audiobook module, audiobook state bridge, TTS mutual exclusion |
| `src/domains/books/reader/reader_sidebar.js` | 4 | Add audio tab to exclusion list |
| `src/styles/books-reader.css` | 4 | Audio sidebar pane styles |

---

## Verification Plan

### Phase 1 (Backend)
- Smoke check: `npm run smoke` passes
- Manual: add an audiobook root folder via IPC, trigger scan, verify `audiobook_index.json` is written correctly
- Manual: save/get/clear audiobook progress and pairings via IPC

### Phase 2 (Library UI)
- Live test: launch app, add an audiobook root folder, verify tiles appear in the audiobooks shelf
- Live test: verify tiles show cover images, titles, chapter counts
- Live test: remove audiobook root, verify shelf updates

### Phase 3 (Player)
- Live test: click an audiobook tile, verify standalone overlay opens and audio plays
- Live test: transport controls work (play/pause, next/prev chapter, seek, speed, volume)
- Live test: keyboard media keys control playback (Windows media overlay shows audiobook info)
- Live test: open a book in reader, load paired audiobook, verify in-reader bar appears and controls work
- Live test: start TTS while audiobook playing -> audiobook stops; start audiobook while TTS playing -> TTS stops

### Phase 4 (Pairing)
- Live test: open reader sidebar Audio tab, select an audiobook, auto-pair chapters
- Live test: save pairing, close and reopen book, verify pairing loads automatically
- Live test: verify audiobook auto-loads when opening a paired book

### Phase 5 (Progress)
- Live test: play audiobook partially, close, reopen — verify it resumes from saved position
- Live test: verify continue shelf shows audiobook entries with correct progress
- Live test: verify clearing progress works
