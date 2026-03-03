# Sources Mode First-Class Contract

## Objective
Make Sources a native app mode in the same shell lifecycle as Comics, Books, and Videos.

## Non-Negotiables
- `webLibraryView` is a standard `<section class="view">` in `src/index.html`.
- Mode switching for Sources is handled by `src/state/mode_router.js`.
- Primary user flows must stay in-app; no detached external browser window.
- External browser launch is debug-only fallback, never the default UX path.

## Architecture Contract
- Sources mode is entered via:
  - top mode button (`modeSourcesBtn`)
  - shell utility web entry points
  - deep links (`?appSection=web|browser|sources|torrent`)
- All entry points route to `setMode('sources')` and `Tanko.sources.openSources()`.
- `ShellBridge.openWebMode()` defaults to in-app activation.
- Host policy keys in `web_browser_settings.json`:
  - `browserHost.mode`: `in_app|external` (default `in_app`)
  - `browserHost.externalFallbackEnabled`: boolean (default `false`)

## Embedded Browser Host Contract
- Qt browser rendering is hosted by `webTabManager` and clipped to the Sources viewport bounds.
- Browser navigation/tab lifecycle is controlled through `Tanko.api.webTabManager.*`.
- Sources UI panels and browser viewport coexist in one mode/workspace.

## UX Contract (Same-Space Behavior)
- Sources uses the same shell chrome and mode bar as the other libraries.
- Switching between Comics/Books/Videos/Sources never leaves the app shell.
- Browsing, DDL downloads, and torrent workflows are available in one Sources workspace.
- Manager failures should stay inline in Sources surfaces, not spawn detached windows.

## Compatibility Rules
- Legacy external launch code may remain for hidden debug fallback only.
- Backward compatibility for existing settings/session data must be preserved.
- Existing browser/torrent bridges remain source-of-truth APIs for Sources actions.

## Release Gate
- No P0/P1 regressions in Sources mode activation and routing.
- No user-facing detached browser launch in default settings.
- Sources mode open/switch flows pass checklist in `qa/manual/sources_first_class_mode_checklist.md`.
