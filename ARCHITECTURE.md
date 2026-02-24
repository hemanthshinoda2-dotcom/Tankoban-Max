# Tankoban Max — Architecture Reference

Detailed reference for navigating and modifying the codebase. See `CLAUDE.md` for rules and workflow.

## Standalone Section Boots

The repository now supports section-focused entrypoints under `apps/`:
1. `apps/library-app/main.js`
2. `apps/comic-reader-app/main.js`
3. `apps/book-reader-app/main.js`
4. `apps/audiobook-app/main.js`
5. `apps/video-player-app/main.js`
6. `apps/browser-app/main.js`
7. `apps/torrent-app/main.js`

These are thin launchers that set `TANKOBAN_APP_SECTION` and delegate to the
same integrated runtime. Runtime section activation happens in:
1. `main/index.js` (injects `?appSection=...` in renderer load query)
2. `src/state/app_section_boot.js` (applies section startup behavior)

## The `el` Objects — Four Separate Scopes

Each domain has its OWN `el` object caching DOM refs. They are NOT the same object:
- **Shell** `el` — `src/domains/shell/core.js` (global scope) — `el.libraryView`, `el.libTitle`, etc.
- **Books** `el` — `src/domains/books/library.js` (inside IIFE) — `el.homeView`, `el.showView`, etc.
- **Video** `el` — `src/domains/video/video.js` (inside IIFE) — `el.videoHomeView`, `el.videoShowsGrid`, etc.
- **Web** `el` — `src/domains/web/web.js` (inside IIFE) — `el.browserView`, `el.tabBar`, etc.

When you see `el.someProperty`, check which file/IIFE you're in to know which `el` it is.

## Script Loading

No build system. Scripts load via `<script>` tags in `index.html`, with deferred loading for non-default modes:
- `src/state/bootstrap.js` → creates `window.Tanko` namespace
- `src/state/deferred_modules.js` → `ensureVideoModulesLoaded()`, `ensureBooksModulesLoaded()`, `ensureWebModulesLoaded()`
- `src/state/mode_router.js` → mode switching (comics/books/video)
- `src/domains/shell/core.js` → shell UI + comic library state
- Domain modules load on demand when user switches modes

## IPC Tracing Cheatsheet

To trace an IPC call end-to-end:
1. **Renderer** — find the `Tanko.api.namespace.method()` call
2. **Preload** — find the matching method in `preload/index.js` → gives you the `CHANNEL.*` constant
3. **Contract** — find the constant in `shared/ipc.js` → gives you the string and JSDoc description
4. **Handler** — grep for the constant in `main/ipc/register/*.js` → gives you the handler
5. **Domain** — the handler usually delegates to a function in `main/domains/*/index.js`

## CSS Architecture

Stylesheets load in this order (later = higher priority at equal specificity):
1. `shoelace/light.css` — component library base
2. `styles.css` — original app styles (4,264 lines)
3. `ui-tokens.css` → `ui-bridge.css` — design token system
4. `overhaul.css` — Noir theme layer, overrides styles.css via load order (1,441 lines)
5. `video-library-match.css` — video-specific styles
6. `books-reader.css` — books reader styles (2,580 lines)
7. `web-browser.css` — web browser styles

When adding CSS: check whether `overhaul.css` already styles the same selector — it loads later and will win at equal specificity. When debugging CSS issues, check all stylesheets in load order, not just the "obvious" one.

## Vendor Code

`src/vendor/foliate/` and `src/vendor/readiumcss/` are third-party libraries. Don't modify them unless absolutely necessary and document why.

## Adding New Features — Checklists

### New IPC channel
1. Add `CHANNEL.YOUR_THING` constant to `shared/ipc.js`
2. Add `Tanko.api.namespace.method()` wrapper in `preload/index.js`
3. Add `ipcMain.handle()` in the appropriate `main/ipc/register/*.js` file
4. Add domain logic in `main/domains/*/index.js`
5. Call from renderer via `Tanko.api.namespace.method()`

### New renderer domain feature
1. Check if the domain module is deferred — if so, your code won't run until `ensure*ModulesLoaded()` is called
2. Add DOM elements to `index.html` if needed
3. Cache new DOM refs in the domain's `el` object
4. Wire event listeners in the domain's IIFE

### New CSS
1. Decide which stylesheet it belongs to (domain-specific vs global)
2. Check `overhaul.css` for conflicting selectors
3. Use existing `--vx-*` CSS variables for colors, radii, shadows — don't hardcode values that the theme layer manages

## Debugging Strategies
- **Renderer issues**: DevTools console (`Ctrl+Shift+I` in the app)
- **Main process issues**: `fs.appendFileSync(path.join(__dirname, 'debug.log'), msg)` — VS Code terminal may swallow stdout
- **IPC issues**: Add logging on BOTH sides (preload send + main receive) to isolate where messages are lost
- **CSS issues**: Check all stylesheets in load order; `overhaul.css` often overrides `styles.css` silently
- **"It works in DevTools but not in app"**: Probably a load-order issue — your code runs before the deferred module loads
