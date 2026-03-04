# Qt Sources Torrent Parity Contract

## Scope
- Sources mode torrent workflow only.
- Qt runtime (`projectbutterfly` + `src/domains/web/web.js`).
- No browser-host architecture changes in this document.

## P0 Requirements
1. Save-flow metadata resolve must be non-blocking in renderer.
2. Streamable folder save must work from:
   - search onboarding flow
   - manage-files flow
3. Torrent search must return deterministic final results (no indefinite `Searching...`).
4. Jackett auth/config failures must fail-open to fallback providers.
5. Provider configuration must not depend on modal overlay lock behavior.
6. Torrent row removal must work for active and history-only rows.

## Behavioral Parity Rules
- Metadata resolve uses staged states: `resolving`, `metadata_ready`, `timeout`, `error`.
- Streamable flow sequence:
  - resolve metadata
  - `startConfigured(streamableOnly=true)`
  - wait `metadata_ready`
  - `addToVideoLibrary(streamable=true)`
- Search provider chain:
  - selected provider first
  - then fallback providers
  - include `providersTried` and `fallbackUsed` metadata in response
- Provider failures must be surfaced as status text without freezing the page.

## Non-Goals
- Re-introducing embedded web browsing in Sources for this slice.
- Replacing qBittorrent backend.
- Full visual parity work outside torrent/search/provider surfaces.
