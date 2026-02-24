# Tankoban Max Master De-factoring and Re-organization Plan

## 1) Objective
This plan decomposes the current Electron app into independently runnable feature apps while preserving one root `npm` command to run the full product.

Target outcome:
1. Every major section (library, comic reader, book reader, audiobook, video, browser, torrent) can boot as an individual app for focused testing.
2. Shared logic moves into explicit shared packages with strict contracts.
3. The full app still runs from root with `npm start`.
4. Documentation is consolidated so `CLAUDE.md` and `chatgpt.md` become the identical canonical map of the repo (plus only essential docs like architecture if truly required).

## 2) Current Baseline (from repo scan)
Current key layout:
1. Main process bootstrap: `main.js`, `main/index.js`, `main/domains/*`.
2. Renderer domains: `src/domains/{library,reader,books,video,web,shell}`.
3. Preload API: `preload/index.js`, `preload/namespaces/*`.
4. Workers and scanners: root scan workers + `workers/shared/*`.
5. Existing docs include multiple strategy and browser plan files at root and under `docs/`.

## 3) Architectural End State
Adopt a monorepo-style structure with apps + packages.

```text
/
  apps/
    shell-app/                 # Full integrated app (current behavior)
    library-app/               # Standalone library manager
    comic-reader-app/          # Standalone comic reader
    book-reader-app/           # Standalone epub/pdf/txt reader + annotations + tts UI
    audiobook-app/             # Standalone audiobook library + player + pairing
    video-player-app/          # Standalone video library + playback
    browser-app/               # Standalone web browser mode
    torrent-app/               # Standalone torrent/download manager UI
  packages/
    core-main/                 # electron main bootstrap primitives, window lifecycle
    core-preload/              # preload bridge builder + typed contract exposure
    core-ipc-contracts/        # CHANNEL/EVENT names + payload schemas
    core-storage/              # shared persistence primitives
    core-logging/              # diagnostics/log contract
    core-testing/              # smoke helpers + feature harness
    feature-library/           # library domain logic used by shell + library-app
    feature-comic-reader/
    feature-book-reader/
    feature-audiobook/
    feature-video/
    feature-browser/
    feature-torrent/
    shared-ui/                 # shared components/styles
    shared-media/              # shared media utilities, player adapters
    shared-workers/            # scanner workers + worker helpers
  docs/
    architecture.md            # optional if still required
  CLAUDE.md
  chatgpt.md
  package.json
```

## 4) Non-negotiable Rules During Migration
1. Root `npm start` must keep launching the integrated shell app at all times.
2. No feature app can import another feature app internals directly.
3. Cross-feature communication must go through `core-ipc-contracts` or explicit service contracts.
4. Each extraction phase must have smoke verification before moving to the next phase.
5. Keep backward-compatible facades in place until all callers are migrated.

## 5) Section-by-Section De-factoring Map

### 5.1 Library
Current sources:
1. `src/domains/library/library.js`
2. `main/domains/library/index.js`
3. `preload/namespaces/library.js`
4. Root/worker scan logic (`library_scan_worker.js`, related shared worker code)

Target ownership:
1. `packages/feature-library`
2. `apps/library-app`
3. `apps/shell-app` consumes feature package

Sub-function split:
1. `feature-library/catalog` for item CRUD/indexing
2. `feature-library/scanning` for filesystem scan orchestration
3. `feature-library/metadata` for metadata normalization
4. `feature-library/ui-adapter` for renderer binding

Standalone boot test:
1. Launch `library-app` with dedicated entrypoint.
2. Validate scan + list + open action with mock or real paths.

### 5.2 Comic Reader
Current sources:
1. `src/domains/reader/*`
2. `main/domains/comic/index.js`
3. Archive helpers in `main/domains/archives/index.js`

Target ownership:
1. `packages/feature-comic-reader`
2. `apps/comic-reader-app`

Sub-function split:
1. render engine (`render_core`, portrait, two-page)
2. input layer (`input_keyboard`, `input_pointer`)
3. state and settings (`state_machine`, settings)
4. archive decode adapter (zip/rar interface)
5. HUD overlays

Standalone boot test:
1. Launch `comic-reader-app`.
2. Open CBZ/CBR fixture.
3. Verify page navigation, zoom, settings persistence.

### 5.3 Book Reader (EPUB/PDF/TXT)
Current sources:
1. `src/domains/books/reader/*`
2. `main/domains/books*`, annotations/bookmarks/progress/settings/opds/ui namespaces
3. `preload/namespaces/books.js`, `books_metadata.js`

Target ownership:
1. `packages/feature-book-reader`
2. `apps/book-reader-app`

Sub-function split:
1. engine adapters (`engine_epub`, `engine_pdf`, `engine_txt`, optional foliate adapter)
2. reading core (`reader_core`, nav, toc, sidebar, overlays)
3. user data (`annotations`, `bookmarks`, `progress`, `appearance`)
4. TTS stack (`tts_core`, engine adapters, progress)
5. OPDS and import/export integrations

Standalone boot test:
1. Launch `book-reader-app`.
2. Open EPUB/PDF/TXT fixtures.
3. Verify annotations, bookmarks, progress resume, TTS start/stop.

### 5.4 Audiobook
Current sources:
1. `src/domains/books/listening_*`, `reader_audiobook*`, overlay files
2. `main/domains/audiobooks`, `audiobookProgress`, `audiobookPairing`
3. `preload/namespaces/audiobooks.js`

Target ownership:
1. `packages/feature-audiobook`
2. `apps/audiobook-app`

Sub-function split:
1. audiobook library index
2. playback session orchestration
3. pairing/sync with text reader
4. progress checkpointing
5. background metadata scan

Standalone boot test:
1. Launch `audiobook-app`.
2. Import folder and play file.
3. Validate progress save/restore and pairing hooks.

### 5.5 Video Player
Current sources:
1. `src/domains/video/*`
2. `main/domains/video*`, `player_core`
3. player resources in `player_qt` and `resources/mpv/windows`
4. `preload/namespaces/video.js`, `media.js`, `player.js`

Target ownership:
1. `packages/feature-video`
2. `apps/video-player-app`
3. `packages/shared-media` for reusable playback abstractions

Sub-function split:
1. video library and search
2. playback control adapter (Qt/mpv bridge)
3. subtitle/audio/track control
4. progress and per-video settings
5. display names and UI preferences

Standalone boot test:
1. Launch `video-player-app`.
2. Open mp4/mkv fixtures.
3. Verify controls, seek, subtitle toggle, progress persistence.

### 5.6 Browser
Current sources:
1. `src/domains/web/*`
2. `main/domains/web*` including session, permissions, adblock, bookmarks, history, userscripts
3. web popup preload: `src/webview_popup_preload.js`
4. `preload/namespaces/web.js`

Target ownership:
1. `packages/feature-browser`
2. `apps/browser-app`

Sub-function split:
1. tab model and tab state
2. omnibox/navigation
3. downloads and popup handling
4. privacy/security/permission policies
5. adblock and userscript layers
6. session/bookmark/history stores

Standalone boot test:
1. Launch `browser-app` in dedicated partition.
2. Verify tabs, navigation, bookmark/history CRUD, download pipeline.

### 5.7 Torrent
Current sources:
1. `main/domains/webTorrent/index.js`
2. `main/domains/torProxy/index.js`
3. renderer browser torrent integration (`src/domains/web/web_module_torrent_tab.js`)
4. fetch/setup scripts: `tools/fetch_tor.js`

Target ownership:
1. `packages/feature-torrent`
2. `apps/torrent-app`
3. browser app consumes torrent package through contract, not internal imports

Sub-function split:
1. torrent session lifecycle
2. transfer queue and status
3. peer/network settings
4. tor proxy integration
5. downloads bridge

Standalone boot test:
1. Launch `torrent-app`.
2. Add magnet fixture.
3. Validate metadata fetch, progress updates, stop/resume.

## 6) Migration Phases (Granular Step-by-Step)

### Phase 0: Inventory and Freeze
1. Create migration branch.
2. Generate full domain dependency map using existing `npm run map`.
3. Record baseline smoke results with `npm run smoke`.
4. Tag baseline commit for rollback.

Exit criteria:
1. Baseline behavior documented.
2. Known hot paths and coupling risks listed.

### Phase 1: Workspace Skeleton
1. Create `apps/` and `packages/` directories.
2. Move current integrated app code into `apps/shell-app` via staged moves.
3. Keep top-level compatibility shims so root `npm start` still works.
4. Add root scripts for each app boot target.

Required scripts after phase:
1. `npm start` -> integrated shell app.
2. `npm run start:library`
3. `npm run start:comic`
4. `npm run start:book`
5. `npm run start:audiobook`
6. `npm run start:video`
7. `npm run start:browser`
8. `npm run start:torrent`

Exit criteria:
1. No functionality change.
2. All boot commands resolve.

### Phase 2: Contracts First (IPC and Storage)
1. Extract `shared/ipc` into `packages/core-ipc-contracts`.
2. Define payload schemas per channel/event.
3. Extract common storage read/write helpers into `packages/core-storage`.
4. Convert preload namespaces to consume centralized contract constants.

Exit criteria:
1. IPC names are single-sourced.
2. No inline string channel names outside contract package.

### Phase 3: Core Runtime Packages
1. Extract electron main boot primitives to `packages/core-main`.
2. Extract preload builder and namespace registration to `packages/core-preload`.
3. Extract shared logging/diagnostics to `packages/core-logging`.
4. Extract worker helpers to `packages/shared-workers`.

Exit criteria:
1. Integrated app still boots unchanged.
2. Feature code depends on core packages, not root globals.

### Phase 4: Library Extraction (Pilot)
1. Move library domain logic into `packages/feature-library`.
2. Add `apps/library-app` thin wrapper with its own renderer/main entrypoints.
3. Keep shell consuming `feature-library` package.
4. Run library standalone smoke tests.

Exit criteria:
1. Library works in shell and standalone modes.
2. No direct imports from shell internals.

### Phase 5: Reader Family Extraction
1. Split comic reader to `feature-comic-reader`.
2. Split book reader to `feature-book-reader`.
3. Split audiobook stack to `feature-audiobook`.
4. Extract shared reader UI elements into `packages/shared-ui`.

Exit criteria:
1. `start:comic`, `start:book`, `start:audiobook` each boot independently.
2. Reader-specific tests pass in isolation.

### Phase 6: Video Extraction
1. Move video domain to `feature-video`.
2. Move cross-feature player adapters to `shared-media`.
3. Keep binary/resource resolution centralized (mpv/player_qt paths).
4. Create `apps/video-player-app`.

Exit criteria:
1. Video standalone app plays local fixtures.
2. Shell video mode still works with same UX.

### Phase 7: Browser and Torrent Extraction
1. Move browser domain to `feature-browser`.
2. Move torrent and tor proxy to `feature-torrent`.
3. Replace direct browser->torrent internals with contract-based integration.
4. Create `apps/browser-app` and `apps/torrent-app`.

Exit criteria:
1. Browser standalone works with tabs/history/bookmarks.
2. Torrent standalone works with magnet flow.
3. Shell browser mode uses same packages.

### Phase 8: Hard Boundary Enforcement
1. Add import boundary lint rules.
2. Disallow feature-to-feature deep relative imports.
3. Add CI checks for forbidden dependency graph edges.
4. Add per-feature smoke command in CI.

Exit criteria:
1. Boundary violations fail CI.
2. Every feature has minimal standalone smoke.

### Phase 9: Documentation Consolidation and Cleanup
1. Build final folder ownership map from actual code after extraction.
2. Create canonical map doc content.
3. Make `CLAUDE.md` and `chatgpt.md` identical.
4. Remove non-essential planning docs and stale docs.
5. Keep only essential docs:
   - `CLAUDE.md`
   - `chatgpt.md`
   - optional `ARCHITECTURE.md` if still needed for human onboarding
   - legal/compliance docs if required for distribution (for example `THIRD_PARTY_NOTICES.md`)

Exit criteria:
1. Both AI docs are byte-identical or generated from one source.
2. No conflicting project maps exist in other markdown files.

### Phase 10: Final Verify and Release Readiness
1. Run integrated smoke (`npm start` + smoke suite).
2. Run all standalone smoke commands.
3. Verify package and distribution scripts still work.
4. Confirm docs cleanup did not remove legally mandatory files.

Exit criteria:
1. Root app launch confirmed.
2. Feature app launches confirmed.
3. Docs are clean and canonical.

## 7) Canonical Folder Map Template for CLAUDE.md and chatgpt.md
Use this exact section pattern for both files after migration:

1. Repository Overview
2. Boot Commands
3. Apps Directory Map
4. Packages Directory Map
5. Feature-to-Folder Ownership
6. Script-to-Responsibility Map
7. IPC Contracts Map
8. Worker Map
9. Test and Smoke Map
10. Forbidden Import Rules
11. Change Procedure for AI Agents

Every folder entry must include:
1. Absolute purpose statement (what it owns).
2. Main entry files.
3. Sub-function folders and what each does.
4. Which app(s) consume it.
5. What it must not import.

## 8) Script and Command Strategy (Keep `npm start` Working)
Required root-level command behavior:
1. `npm start` always boots integrated shell app.
2. `npm run start:<section>` boots section-specific app.
3. `npm run smoke:<section>` runs section smoke checks.
4. `npm run smoke:all` runs integrated + all standalone smoke checks.

Recommended execution model:
1. Root workspace `package.json` orchestrates scripts.
2. Each app has its own local `package.json` and entrypoint.
3. Shared packages use local workspace references.

## 9) Detailed Folder Recreation Checklist
Execute in order:
1. Create `apps/shell-app`.
2. Create `apps/library-app`.
3. Create `apps/comic-reader-app`.
4. Create `apps/book-reader-app`.
5. Create `apps/audiobook-app`.
6. Create `apps/video-player-app`.
7. Create `apps/browser-app`.
8. Create `apps/torrent-app`.
9. Create `packages/core-main`.
10. Create `packages/core-preload`.
11. Create `packages/core-ipc-contracts`.
12. Create `packages/core-storage`.
13. Create `packages/core-logging`.
14. Create `packages/core-testing`.
15. Create `packages/shared-ui`.
16. Create `packages/shared-media`.
17. Create `packages/shared-workers`.
18. Create `packages/feature-library`.
19. Create `packages/feature-comic-reader`.
20. Create `packages/feature-book-reader`.
21. Create `packages/feature-audiobook`.
22. Create `packages/feature-video`.
23. Create `packages/feature-browser`.
24. Create `packages/feature-torrent`.

## 10) Risk Register and Controls
Major risks:
1. Hidden coupling between renderer and main domains.
2. Preload API breakage from contract relocation.
3. Resource path failures for mpv/player binaries.
4. Regression in browser security behavior.
5. Doc cleanup accidentally removing required compliance docs.

Controls:
1. Move in small slices with compatibility adapters.
2. Keep contract tests for IPC payloads.
3. Add startup assertions for binary/resource resolution.
4. Keep dedicated browser/torrent regression suite.
5. Create explicit allowlist for docs to keep/remove.

## 11) Definition of Done
The migration is done when all are true:
1. `npm start` launches full integrated app.
2. Each feature section launches with `npm run start:<section>`.
3. Feature tests run independently and in aggregate.
4. No forbidden cross-feature imports remain.
5. `CLAUDE.md` and `chatgpt.md` are identical and fully map folder ownership and script responsibilities.
6. Non-essential legacy docs are removed, essential docs retained.

## 12) Suggested Implementation Order (Pragmatic)
Do this exact order:
1. Library
2. Comic reader
3. Book reader
4. Audiobook
5. Video
6. Browser
7. Torrent
8. Docs consolidation

Reason:
1. Library is lowest risk and validates extraction pattern.
2. Reader domains are already conceptually grouped.
3. Video and browser/torrent have more native/security complexity and should be later.

