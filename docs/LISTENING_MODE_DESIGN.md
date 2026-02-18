# Listening Mode — Design & Intended Behaviour

> **EMERGENCY NOTICE**
> Listening mode and the TTS player are core differentiating features of Tankoban Max.
> They MUST work end-to-end before any release. If the TTS player does not open, speak,
> or resume progress, the Books mode is effectively broken for its primary intended use.
> Any regression in this area must be treated as a blocker. Do not close a fix round
> until the full flow below has been manually verified: open a book from the library in
> Listen mode, hear the first sentence, pause, skip forward, close, reopen and confirm
> the progress bar shows the correct position.

---

## 1. What Listening Mode Is

Listening mode is a sub-mode of the Books tab. The user toggles between **Read** and
**Listen** using the two buttons at the top of the Books library view. In Listen mode:

- The library view looks identical to Read mode (1:1 replica — same folder/series
  navigation, same continue shelf). Only the continue shelf title and tile content change.
- Tapping a book opens the **TTS Listening Player** (an overlay that sits on top of the
  hidden reader) rather than navigating into the visual reader.
- The continue shelf shows TTS progress tiles (not reading % badges).

---

## 2. Component Map

```
index.html
  └─ #booksReadingContent          (shared library view — Read AND Listen modes)
       ├─ #booksContinueTitle       (text swaps: "Continue Reading..." / "Continue Listening...")
       ├─ #booksContinuePanel       (tiles from reading progress OR TTS progress)
       ├─ #booksHomeView            (series/folder grid — unchanged in both modes)
       └─ #booksShowView            (folder detail — unchanged in both modes)

  └─ #booksListenPlayerOverlay     (TTS player — shown only while a book is open in Listen mode)
       ├─ lpBackBtn                 (close player, return to library)
       ├─ lpBookTitle               (book title)
       ├─ lpCardText                (active sentence with word-highlight <mark>)
       ├─ lpBlockIdx / lpBlockCount (progress counter)
       ├─ lpPlayPauseBtn            (play / pause toggle)
       ├─ lpPrevBtn / lpNextBtn     (prev/next sentence block)
       ├─ .lp-speed-btn[data-rate]  (speed presets: 0.75 / 1 / 1.25 / 1.5 / 2)
       ├─ lpVoiceSelect             (voice picker, populated from TTS engine)
       ├─ lpTocBtn                  (toggle chapter list panel)
       └─ #lpTocPanel               (chapter list)
```

---

## 3. Module Roles

| File | Role |
|---|---|
| `listening_shell.js` | Mode toggle (Read ↔ Listen). Updates tab buttons, swaps continue shelf title, calls `booksApp.setListenMode()`. Renders TTS progress tiles into `#booksContinuePanel`. |
| `listening_player.js` | Overlay controller. Opens book via `booksApp.openBookInReader()`, wires TTS callbacks, handles transport controls, persists progress. |
| `library.js` | Books library. `_listenMode` flag: when `true`, `openBook()` routes to `booksListeningShell.openListenBook()` instead of opening the reader directly. `openBookInReader()` bypasses this flag — used by `listening_player.js` to avoid infinite recursion. `renderContinue()` delegates to `shell.renderListenContinue()` when in listen mode. |
| `reader/tts_core.js` | TTS state machine (`window.booksTTS`). States: idle / playing / paused. |
| `reader/tts_engine_edge.js` | Edge neural TTS (msedge-tts IPC). Primary engine. |
| `reader/tts_engine_webspeech.js` | Web Speech API fallback. |

---

## 4. Full Open-Book Flow

```
User taps book tile in Listen mode
  │
  ├─ library.js openBook()
  │    └─ _listenMode === true → booksListeningShell.openListenBook(book)
  │
  ├─ listening_shell.js openListenBook(book)
  │    └─ booksListenPlayer.open(book)
  │
  ├─ listening_player.js open(book)
  │    ├─ sets _book, _open = true, _ttsStarted = false
  │    ├─ updates #lpBookTitle
  │    └─ booksApp.openBookInReader(book)   ← NOTE: NOT openBook() — avoids loop
  │
  ├─ library.js openBookInReader(book)
  │    ├─ resolves book, gets reader controller
  │    ├─ updates state.ui selection (show/folder)
  │    └─ ctl.open(book) → reader loads EPUB/PDF invisibly
  │
  ├─ reader fires 'books-reader-opened' event
  │
  └─ listening_player.js (listener on books-reader-opened)
       ├─ showOverlay(true)        ← overlay appears
       └─ startTts()
            ├─ wireTts()           ← attach TTS callbacks
            ├─ populateVoiceSelect()
            ├─ renderTocPanel()
            └─ tts.play()          ← first sentence starts speaking
```

---

## 5. Close-Player Flow

```
User taps Back (or presses Esc)
  │
  ├─ listening_player.js closePlayer()
  │    ├─ saveProgress(immediate=true)   ← flush progress to disk
  │    ├─ tts.stop()
  │    ├─ showOverlay(false)
  │    └─ booksApp.back()
  │         └─ closes reader, resets state.readerOpen
  │
  └─ booksApp.back() resolves
       └─ booksListeningShell.setMode(MODE_LISTEN)
            └─ applyMode() → re-stamps _listenMode, re-renders continue shelf
```

---

## 6. Continue Shelf — Listen Mode

When `_listenMode` is `true`, `library.js` `renderContinue()` delegates to
`listening_shell.js` `renderListenContinue()`:

1. Calls `Tanko.api.getAllBooksTtsProgress()` (IPC → main process → `books_tts_progress.json`)
2. Sorts entries by `updatedAt` descending, takes top 10
3. For each entry, creates a `.contTile` (same DOM structure as reading library tiles)
4. Tile includes: cover thumbnail, TTS progress bar (`listen-continue-bar`), title, remove button
5. Clicking a tile calls `openListenBook(book)` — enters the full open-book flow above

---

## 7. TTS Progress Persistence

- Saved on every block change (debounced 2 s) via `Tanko.api.saveBooksTtsProgress(bookId, entry)`
- Flushed immediately on player close
- Entry shape: `{ blockIdx, blockCount, title, format, updatedAt }`
- Stored in `books_tts_progress.json` (userData), keyed by book ID

---

## 8. Known Architecture Debt

### Full-screen overlay vs. bottom HUD bar

The TTS player (`#booksListenPlayerOverlay`) was originally intended to be a **bottom
HUD bar** reusing the `#booksReaderTtsBar` design that existed before LISTEN_P0 stripped
TTS from the reader. The current full-screen card overlay was built as an expedient but
diverges from the original design intent.

The bottom HUD bar design would have:
- Reader visible and scrolling normally behind the bar
- Controls: back 10s · prev sentence · play/pause · next sentence · fwd 10s · speed ·
  snippet text · settings button (→ voice/rate popover) · stop
- Active word highlight visible in the reader iframe (not in a card overlay)

Rebuilding as a bottom HUD bar is a future task. Until then the overlay architecture
must be kept working and not regressed.

---

## 9. Verification Checklist

Before any commit touching listening mode, manually verify:

- [ ] Toggle to Listen mode — library looks identical to Read mode (folder nav, series grid)
- [ ] Continue shelf title changes to "Continue Listening..."
- [ ] Tapping a book opens the TTS overlay (not the visual reader)
- [ ] First sentence is spoken within ~2 seconds of opening
- [ ] Play/pause button works
- [ ] Prev/next block buttons advance/rewind sentences
- [ ] Speed preset buttons change rate
- [ ] Chapter list opens and navigating to a chapter restarts TTS from that chapter
- [ ] Close button returns to the listening library (not read mode)
- [ ] Progress bar on continue tile reflects position after reopening
- [ ] Removing a tile from the continue shelf works (remove button)
- [ ] Toggle back to Read mode — normal read behaviour is unaffected
