# Tankoban Max Books Reader + Library Contract (FIX-R07 / FIX-R08 / FIX-R09)

## Scope
- Work root: `projects/Tankoban Max`
- No edits under `app/`
- Reader target: comic-reader HUD interaction language adapted to books semantics
- TTS target: deterministic Edge-first neural path with explicit fallback diagnostics
- Library target: video-style hierarchical folder browsing with comic-parity cards/tables

## Comic Reader Control Inventory
Source files:
- `src/domains/reader/reader_view.html`
- `src/domains/reader/hud_core.js`
- `src/domains/reader/input_keyboard.js`
- `src/styles/styles.css`

Core surfaces:
- Top HUD: metadata, back, tools launcher
- Bottom HUD: prev/play/next, page text, scrubber, quick actions, fullscreen/min/close
- Auto-hide HUD model: `HUD_INACTIVITY_MS = 3000`, `body.hudHidden`, `body.hudFreeze`
- Overlay priority gates: settings/keys/volume nav/speed/goto/filter/loupe/context
- Keyboard: navigation, fullscreen, back, HUD toggle, overlay hotkeys, progress actions

## Books Reader Control Inventory (Current)
Source files:
- `src/index.html` (`#booksReaderView`)
- `src/domains/books/reader/controller.js`
- `src/domains/books/reader/engine_foliate.js`
- `src/styles/styles.css` (`.booksReader*`)

Current surfaces:
- Static top bar (never auto-hides)
- Grid body with TOC + resize handle + host
- Floating Aa, TTS, dictionary, diagnostics, status/error surfaces
- Keyboard: Esc, arrows/page keys, F, T, B, D (no comic-style HUD inactivity model)

## Comic -> Books Mapping Matrix
| Comic element | Books equivalent | Contract |
|---|---|---|
| `playerBar` | `booksReaderHudTop` | Auto-hide with inactivity/freeze gates |
| `playerFooter` | `booksReaderHudBottom` | Auto-hide with inactivity/freeze gates |
| Back | `booksReaderBackBtn` | Close reader first |
| Prev/Next | `booksReaderPrevBtn`, `booksReaderNextBtn` | Same key + button semantics |
| Scrub slider | `booksReaderProgress` | PDF page-based, EPUB/TXT fraction-based |
| Page text | `booksReaderPageText` | `page/total` or `%` fallback |
| Fullscreen btn | `booksReaderFsBtn` | Uses window fullscreen API |
| Subtitle-like overlay | `booksReaderTtsSnippet` | Anchored in reader HUD layer |
| Activity wake | Books HUD controller | Mouse/touch/key restores HUD |

## Non-Applicable Comic Controls
| Comic-only | Books replacement |
|---|---|
| Auto-scroll/manual-scroll | Flow mode toggle (`paginated/scrolled`) |
| Image FX/loupe | Typography + theme + margin + columns |
| End-of-volume overlay | End-of-book status/next-step message |
| Two-page spread fit controls | PDF fit/zoom + text columns for EPUB/TXT |

## Keyboard Matrix
Required in books reader:
- `Esc`: close dict popup -> exit zen -> close reader
- `ArrowRight` / `PageDown` / `Space`: next
- `ArrowLeft` / `PageUp`: previous
- `F`: fullscreen toggle
- `Z`: zen mode
- `H`: HUD force toggle
- `Ctrl+F` and `/`: focus search
- `T`: TTS toggle
- `B`: bookmark toggle
- `D`: dictionary lookup

## Books Library Navigation Data Inventory (Current)
Source files:
- `workers/books_scan_worker_impl.js`
- `main/domains/books/index.js`
- `src/domains/books/library.js`

Current outputs:
- `series[]`, `books[]`
- Root folders, explicit series folders, explicit single files
- Flat grouping by `seriesId` or parent path; no deep folder hierarchy payload

## FIX-R09 Data Contract Additions
`BookRecord` additions:
- `rootId`
- `folderRelPath`
- `folderKey`

New top-level index array:
- `folders[]` where each item:
  - `rootId`
  - `rootPath`
  - `relPath`
  - `parentRelPath`
  - `name`
  - `folderKey`
  - `childFolderCount`
  - `seriesCount`
  - `bookCount`
  - `newestMtimeMs`

## Implementation Tags
- Reader HUD + UX work: `FIX-R07`
- TTS reliability + main-process transport: `FIX-R08`
- Books hierarchy + navigation: `FIX-R09`
