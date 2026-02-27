# Tankoban Max - Agent Architecture Guide

Deep architectural knowledge for AI agents. For the structural map, see `CLAUDE.md`.

## 1. Script Loading

No build system. Scripts load via `<script>` tags in `index.html`, with deferred loading for non-default modes:
- `src/state/bootstrap.js` creates `window.Tanko` namespace.
- `src/state/deferred_modules.js` provides `ensureVideoModulesLoaded()`, `ensureBooksModulesLoaded()`, `ensureWebModulesLoaded()`.
- `src/state/mode_router.js` handles mode switching (comics/books/video).
- `src/domains/shell/core.js` loads the shell UI + comic library state.
- Domain modules load on demand when the user switches modes.

Key implication: code in a deferred module won't run until `ensure*ModulesLoaded()` is called. If your feature depends on a deferred domain, ensure the loader has been triggered first.

## 2. The `el` Objects — Four Separate Scopes

Each domain has its OWN `el` object caching DOM refs. They are NOT the same object:
- **Shell** `el` — `src/domains/shell/core.js` (global scope) — `el.libraryView`, `el.libTitle`, etc.
- **Books** `el` — `src/domains/books/library.js` (inside IIFE) — `el.homeView`, `el.showView`, etc.
- **Video** `el` — `src/domains/video/video.js` (inside IIFE) — `el.videoHomeView`, `el.videoShowsGrid`, etc.
- **Web** `el` — `src/domains/web/web.js` (inside IIFE) — `el.browserView`, `el.tabBar`, `el.sourcesBrowserWebview`, etc.

When you see `el.someProperty`, check which file/IIFE you're in to know which `el` it is.

## 3. IPC Tracing Cheatsheet

To trace an IPC call end-to-end:
1. **Renderer** — find the `Tanko.api.namespace.method()` call.
2. **Preload** — find the matching method in `preload/namespaces/*.js` → gives you the `CHANNEL.*` constant.
3. **Contract** — find the constant in `shared/ipc.js` → gives you the string and JSDoc description.
4. **Handler** — grep for the constant in `main/ipc/register/*.js` → gives you the handler.
5. **Domain** — the handler usually delegates to a function in `main/domains/*/index.js`.

## 4. CSS Architecture

Stylesheets load in this order (later = higher priority at equal specificity):
1. `shoelace/light.css` — component library base
2. `styles.css` — original app styles
3. `ui-tokens.css` → `ui-bridge.css` — design token system
4. `overhaul.css` — Noir theme layer, overrides styles.css via load order
5. `video-library-match.css` — video-specific styles
6. `books-reader.css` — books reader styles
7. `web-browser.css` — web browser styles
8. `video-player.css` — video player styles

When adding CSS: check whether `overhaul.css` already styles the same selector — it loads later and will win at equal specificity. Use existing `--vx-*` CSS variables for colors, radii, shadows — don't hardcode values that the theme layer manages.

## 5. TankoBrowser / Aspect Browser Architecture

The browser section uses an embedded `<webview>` architecture ("TankoBrowser") instead of managing multiple webviews directly.

### How it works
1. `src/index.html` contains `<div class="panel sourcesBrowserPanel">` with a toolbar and `<webview id="sourcesBrowserWebview">`.
2. `src/domains/web/web.js` initializes the webview via `initSourcesBrowser()`, binding navigation, toolbar, and event handlers.
3. The webview loads `src/domains/browser_host/aspect_embed/index.html` — a self-contained browser app ("Aspect Browser").
4. `aspect_embed/renderer.js` (~2,100 lines) handles all tab management, navigation, omnibox, bookmarks, history, downloads, find-in-page, zoom, context menus, Tor, and torrent tab UI.

### Bridge pattern
Communication between the host shell and the embedded Aspect Browser uses a bridge object:

- **Host side** (web.js): Sets `window.__ASPECT_TANKO_BRIDGE__` on the parent window with methods for all backend operations (history CRUD, bookmark CRUD, downloads, Tor control, torrent control, clipboard, permissions, userscripts, adblock, etc.).
- **Iframe side** (`host_bridge_bootstrap.js`): Detects embed mode and builds a proxy `window.aspect` object that forwards all calls to `window.parent.__ASPECT_TANKO_BRIDGE__`.
- **Embed detection**: `renderer.js` checks `window.__ASPECT_EMBED__` or `?embed=1` query param to set `ASPECT_EMBED_MODE`.
- **Public API**: `renderer.js` exports `window.AspectBrowser` with `createTankoBrowserHostAdapter()` and `registerTankoBrowserHostAdapter()`.

### Key files
- `src/domains/browser_host/aspect_embed/index.html` — browser UI shell
- `src/domains/browser_host/aspect_embed/renderer.js` — full browser renderer
- `src/domains/browser_host/aspect_embed/host_bridge_bootstrap.js` — iframe-to-host bridge proxy
- `src/domains/browser_host/aspect_embed/torrent-tab.js` — torrent manager tab
- `src/domains/browser_host/aspect_embed/styles.css` + `torrent-tab.css` — browser styles

## 6. Cross-Domain Bridge Patterns

Several domains expose shared state via window globals for cross-module communication:

- **Books**: `window.__tankoBooksLibShared = { api, el, toast, showCtx }` — used by `books_opds.js` and `books_web_sources.js`.
- **Video**: `window.__tankoVideoShared = { state, effectiveShowName, getShowById, basename, openVideoShow, getEpisodeById, openVideo }` — used by `video_search.js`.
- **Video search**: `window.__tankoVideoSearch = { rebuildVideoSearchIndex, videoRenderGlobalSearchResults, videoGlobalSearchItems, videoHideGlobalSearchResults, videoSetGlobalSearchSelection, videoActivateGlobalSearchSelection }`.
- **TankoBrowser**: `window.__ASPECT_TANKO_BRIDGE__` — host-to-iframe bridge (see Section 5).

## 7. Vendor Code

`src/vendor/foliate/` and `src/vendor/readiumcss/` are third-party libraries. Don't modify them unless absolutely necessary and document why.

## 8. Video Player

The video player is Qt-only. `openVideo()` always routes to `openVideoQtFallback()` which launches external `TankobanPlayer.exe` via `player_qt/`. The Holy Grail experiment (mpv → ANGLE → D3D11 → Electron sharedTexture) is archived to `archive/holy-grail-experiment/` — its code still exists in `main/domains/holyGrail/` and `preload/namespaces/holy_grail.js` but is not the active playback path.

## 9. Adding New Features — Checklists

### New IPC channel
1. Add `CHANNEL.YOUR_THING` constant to `shared/ipc.js`.
2. Add wrapper in `preload/namespaces/<namespace>.js`.
3. Add `ipcMain.handle()` in the appropriate `main/ipc/register/*.js` file.
4. Add domain logic in `main/domains/*/index.js`.
5. Call from renderer via `Tanko.api.namespace.method()`.
6. Or use scaffold: `node tools/ipc_scaffold.js --channel NAME --namespace NS`.

### New renderer domain feature
1. Check if the domain module is deferred — if so, your code won't run until `ensure*ModulesLoaded()` is called.
2. Add DOM elements to `index.html` if needed.
3. Cache new DOM refs in the domain's `el` object.
4. Wire event listeners in the domain's IIFE.

### New CSS
1. Decide which stylesheet it belongs to (domain-specific vs global).
2. Check `overhaul.css` for conflicting selectors.
3. Use existing `--vx-*` CSS variables for colors, radii, shadows — don't hardcode values that the theme layer manages.

## 10. Debugging Strategies

- **Renderer issues**: DevTools console (`Ctrl+Shift+I` in the app).
- **Main process issues**: `fs.appendFileSync(path.join(__dirname, 'debug.log'), msg)` — VS Code terminal may swallow stdout. `console.log` in main process is unreliable when launched from VS Code due to `ELECTRON_RUN_AS_NODE`.
- **IPC issues**: Add logging on BOTH sides (preload send + main receive) to isolate where messages are lost.
- **CSS issues**: Check all stylesheets in load order; `overhaul.css` often overrides `styles.css` silently.
- **"It works in DevTools but not in app"**: Probably a load-order issue — your code runs before the deferred module loads.
- **VS Code terminal**: VS Code sets `ELECTRON_RUN_AS_NODE=1` which breaks `npm start`. Fix: `unset ELECTRON_RUN_AS_NODE` before running, or launch from a non-VS Code terminal.

## 11. Code Style

- Use `var` not `let`/`const` in renderer JS — match the existing codebase style.
- No build system, no transpilation — write browser-compatible ES2020.
- IIFEs are the module pattern; don't introduce ES modules in renderer code.
