# Qt Browser Chrome Core Parity Spec

## Objective
Deliver Chrome-like core browsing behavior in the Qt browser path (`projectbutterfly/browser/*`, `projectbutterfly/app.py`) with Windows-first acceptance.

## Out of Scope
- Account sync/cloud profile sync
- Google service integration
- Extension/web-store parity
- Enterprise policy stack
- Torrent/books/comics parity implementation (kept as explicit placeholders)

## Release Gate
- No open P0/P1 defects in this track
- 95%+ checklist pass overall
- 100% pass for criticals: tabs, navigation, omnibox

## Critical Behaviors

### Tabs
- New tab insertion respects opener placement semantics
- Pinned/unpinned boundary enforced for drag-drop and reorder
- Close behavior prefers opener fallback, then adjacent tab
- Reopen closed tab restores URL + pin + mute + zoom
- Close other/right actions deterministic

### Navigation
- Back/forward/reload/stop transitions deterministic
- Back/forward long-press and right-click opens history index menu
- Menu item selection navigates via exact history index

### Omnibox
- URL fixup + search routing aligns with safe scheme allowlist
- Unsafe schemes are blocked from direct navigation and routed to search
- Inline ghost completion available and keyboard-accepting
- Per-tab draft text preserved on tab switch
- Suggestions blend bookmarks/history/search-history

### Permissions
- Stored allow/deny decisions resolve before prompting
- Prompt supports `remember` and persists rules when enabled
- Ask path prompts only when no stored decision applies

### Error/Crash Surfaces
- Failed load always shows deterministic error page with Retry
- Render process termination always shows recover surface
- Recover action brings tab back to healthy state

### Settings
- Settings page loads persisted values on open
- Save path updates runtime behavior immediately
- Search engine choice round-trips across restart

### Data & Internal Pages
- History page uses deterministic on-load injection
- Downloads manager page backed by persisted download history
- Bookmarks manager supports edit/remove with persistence
- `Ctrl+H` and `Ctrl+J` map to internal managers

### Session Persistence
- Session schema is versioned and backward-compatible
- Startup restores saved tabs before opening fallback tab
- Session saves are debounced on relevant state changes

## Session Schema (v2)
- `version`
- `tabs[]`: `id`, `url`, `title`, `pinned`, `muted`, `zoom`, `internal`
- `activeTabId`
- `closedTabs[]`: `url`, `title`, `pinned`, `muted`, `zoom`, `internal`
- `uiState`: `bookmarksBarVisible`, `windowState`

## Primary Acceptance Platform
- Windows 10/11
