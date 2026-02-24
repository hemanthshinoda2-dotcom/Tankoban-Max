# Tankoban Max - Canonical Agent Map

## 1. Purpose
This is the canonical repo map for AI agents.
Both `CLAUDE.md` and `chatgpt.md` must remain identical.

Goals:
1. Keep root `npm start` running the integrated app.
2. Allow section-focused standalone boots for isolated testing.
3. Keep ownership boundaries explicit for safer edits.

## 2. Boot Commands
Primary commands:
1. `npm start` - integrated shell app (default product boot).
2. `npm run start:shell` - explicit shell-app entrypoint.
3. `npm run start:library` - library-focused standalone boot.
4. `npm run start:comic` - comic-reader-focused standalone boot.
5. `npm run start:book` - book-reader-focused standalone boot.
6. `npm run start:audiobook` - audiobook-focused standalone boot.
7. `npm run start:video` - video-focused standalone boot.
8. `npm run start:browser` - browser-focused standalone boot.
9. `npm run start:torrent` - torrent-focused standalone boot.

Validation and diagnostics:
1. `npm run smoke`
2. `npm run doctor`
3. `npm run ipc:check`
4. `npm run map`

## 3. Root Folder Map
Top-level ownership:
1. `main.js` - primary Electron entrypoint used by `npm start`; delegates to `main/index.js`.
2. `main/` - main-process runtime and IPC registration.
3. `preload.js` + `preload/` - contextBridge API surface.
4. `src/` - renderer HTML/CSS/JS domains.
5. `shared/` - cross-process contracts (`shared/ipc.js`).
6. `workers/` + root `*_scan_worker.js` files - background scans.
7. `apps/` - standalone app entrypoints by section.
8. `packages/` - logical boundaries and ownership maps.
9. `resources/` + `player_qt/` - native/media runtime assets.
10. `tools/` + `qa/` - smoke checks, audits, diagnostics, visual QA.
11. `docs/` - optional supporting architecture docs only.

## 4. Apps Directory
Each app is a thin launcher around the same runtime.

1. `apps/shell-app/main.js`
- Boots section `shell`.
- Integrated default app behavior.

2. `apps/library-app/main.js`
- Boots section `library`.
- Focused on comics library workflows.

3. `apps/comic-reader-app/main.js`
- Boots section `comic`.
- Focused on comic reader workflows.

4. `apps/book-reader-app/main.js`
- Boots section `book`.
- Focused on books library/reader workflows.

5. `apps/audiobook-app/main.js`
- Boots section `audiobook`.
- Focused on audiobook workflows in books domain.

6. `apps/video-player-app/main.js`
- Boots section `video`.
- Focused on video library/player workflows.

7. `apps/browser-app/main.js`
- Boots section `browser`.
- Focused on web browser workflows.

8. `apps/torrent-app/main.js`
- Boots section `torrent`.
- Focused on torrent/browser hub workflows.

## 5. Packages Directory

### Core
1. `packages/core-main`
- `launch_section_app.js`: canonical section launcher and section normalization.
- `index.js`: re-export.

2. `packages/core-preload`
- Maps preload bridge ownership to `preload/index.js` and `preload/namespaces/*`.

3. `packages/core-ipc-contracts`
- Re-exports `shared/ipc.js`.
- Single source of truth for channel/event names.

4. `packages/core-storage`
- Maps persistence ownership to `main/lib/storage.js` and data files.

5. `packages/core-logging`
- Maps logging/health ownership across main + renderer health monitor.

6. `packages/core-testing`
- Maps test and smoke ownership (`tools/*`, `qa/*`).

### Shared
1. `packages/shared-ui`
- Shared renderer layers: `src/ui`, `src/services`, `src/state`, `src/styles`.

2. `packages/shared-media`
- Shared media stack across `src/domains/video`, `main/domains/player_core`, `resources/mpv`, `player_qt`.

3. `packages/shared-workers`
- Worker/scanner ownership map.

### Feature
1. `packages/feature-library`
- Comics library renderer/main/preload/worker map.

2. `packages/feature-comic-reader`
- Comic reader renderer + comic/archive main domains.

3. `packages/feature-book-reader`
- Books renderer + books main domains + preload books namespaces.

4. `packages/feature-audiobook`
- Audiobook renderer modules + audiobook main domains + preload audiobooks namespace.

5. `packages/feature-video`
- Video renderer + video/player main domains + preload video/media/player namespaces.

6. `packages/feature-browser`
- Browser renderer + web main domains + preload web namespace.

7. `packages/feature-torrent`
- Torrent renderer module + `webTorrent` / `torProxy` main domains.

## 6. Runtime Layer Map

1. Renderer (`src/`)
- `src/index.html` loads baseline shell and deferred loaders.
- `src/state/deferred_modules.js` lazy-loads heavy domains.
- `src/state/mode_router.js` handles comics/books/videos mode switching.
- `src/state/app_section_boot.js` applies standalone `appSection` startup routing.

2. Preload (`preload/`)
- `preload/index.js` composes namespace APIs.
- `preload/namespaces/*.js` groups domain-safe IPC wrappers.

3. Main (`main/`)
- `main/index.js` owns app lifecycle and window boot.
- `main/ipc/index.js` owns ipcMain registration and domain handler wiring.
- `main/domains/*` owns feature-specific backend logic.

4. Worker layer (`workers/` + root workers)
- Scanning and metadata tasks for library/books/video/audiobooks.

## 7. Section Ownership Map (File-Level)

### Library
1. Renderer: `src/domains/library/library.js`, `src/domains/shell/core.js`
2. Main: `main/domains/library/index.js`
3. Preload: `preload/namespaces/library.js`
4. Worker: `library_scan_worker.js`, `workers/shared/*`

### Comic Reader
1. Renderer: `src/domains/reader/*`
2. Main: `main/domains/comic/index.js`, `main/domains/archives/index.js`
3. Preload: `preload/namespaces/media.js`, `preload/namespaces/player.js`

### Book Reader
1. Renderer: `src/domains/books/library.js`, `src/domains/books/reader/*`, `src/domains/books/books_opds.js`
2. Main: `main/domains/books*`, `booksProgress`, `booksBookmarks`, `booksAnnotations`, `booksSettings`, `booksTtsEdge`, `booksTtsProgress`, `booksOpds`, `booksUi`
3. Preload: `preload/namespaces/books.js`, `preload/namespaces/books_metadata.js`

### Audiobook
1. Renderer: `src/domains/books/listening_player.js`, `src/domains/books/audiobook_player_overlay.js`, `src/domains/books/reader/reader_audiobook*.js`
2. Main: `main/domains/audiobooks/index.js`, `audiobookProgress/index.js`, `audiobookPairing/index.js`
3. Preload: `preload/namespaces/audiobooks.js`

### Video
1. Renderer: `src/domains/video/*`
2. Main: `main/domains/video/index.js`, `videoProgress/index.js`, `videoSettings/index.js`, `videoDisplayNames/index.js`, `videoUi/index.js`, `player_core/index.js`
3. Preload: `preload/namespaces/video.js`, `player.js`, `media.js`
4. Native/media resources: `resources/mpv/windows/*`, `player_qt/*`

### Browser
1. Renderer: `src/domains/web/*`
2. Main: `main/domains/webSources`, `webHistory`, `webBookmarks`, `webBrowserSettings`, `webSession`, `webPermissions`, `webData`, `webAdblock`, `webUserscripts`
3. Preload: `preload/namespaces/web.js`

### Torrent
1. Renderer: `src/domains/web/web_module_torrent_tab.js`, `src/domains/web/web.js`
2. Main: `main/domains/webTorrent/index.js`, `main/domains/torProxy/index.js`
3. Preload: `preload/namespaces/web.js`
4. Tools: `tools/fetch_tor.js`

## 8. Script-to-Responsibility Map

1. `main.js`
- Root integrated app entrypoint.
- Delegates to `main/index.js` with `APP_ROOT`.

2. `main/index.js`
- Window creation, app lifecycle, section query injection.
- Reads `TANKOBAN_APP_SECTION` or `--app-section=` for standalone boot.

3. `src/state/app_section_boot.js`
- Reads `?appSection=` and applies startup behavior:
  - `library`/`comic` -> comics mode.
  - `book`/`audiobook` -> books mode.
  - `video` -> videos mode.
  - `browser` -> opens browser workspace.
  - `torrent` -> opens torrent-focused browser workspace.

4. `packages/core-main/launch_section_app.js`
- Shared launcher for all `apps/*/main.js` entrypoints.

## 9. Forbidden Import Rules
Enforce these rules during future refactors:
1. Do not import one feature package from another feature package internals.
2. Cross-feature interactions must use `shared/ipc.js` contracts or explicit public package APIs.
3. Renderer domain code must not call Electron primitives directly; use preload APIs.
4. Main domains must not depend on renderer code.

## 10. AI Change Procedure
When modifying code:
1. Locate the section package in `packages/feature-*`.
2. Update renderer/main/preload layers consistently.
3. If IPC changes, update all three:
- `shared/ipc.js`
- `preload/namespaces/*`
- `main/ipc/register/*` and/or `main/domains/*`
4. Run at minimum:
- `npm run smoke`
- targeted boot command(s) for touched section(s)
5. Keep this file and `chatgpt.md` identical after structural changes.

## 11. Docs Policy
Keep active docs minimal:
1. `CLAUDE.md` (canonical map)
2. `chatgpt.md` (must be identical to `CLAUDE.md`)
3. `ARCHITECTURE.md` only if needed for supporting detail
4. Legal/compliance docs (for example `THIRD_PARTY_NOTICES.md`) must remain when required
