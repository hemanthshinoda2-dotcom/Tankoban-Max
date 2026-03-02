# Qt Web Mode Parity Matrix (Electron Sources -> Butterfly Web)

This matrix is the implementation checklist for full parity between:
- Electron `master` Sources mode
- Butterfly `web` mode (Qt BrowserWidget)

Canonical runtime mode is `web`; legacy `sources` inputs remain compatibility aliases.

## Legend
- `same`: behavior is expected to match Electron.
- `adapted`: same user outcome with Qt-specific implementation differences.
- `deferred`: not complete yet.

## Parity Matrix

| Area | Electron Sources Baseline | Butterfly Target | Mapping | Status | Notes |
|---|---|---|---|---|---|
| Mode routing | `sources` mode | `web` canonical + `sources` alias | adapted | in_progress | Router alias normalization implemented. |
| Topbar mode open | Sources button opens Sources workspace | Web button opens native browser workspace | adapted | in_progress | `setMode('web')` path active. |
| Workspace activation | In-renderer panel + webview | Native Qt BrowserWidget | adapted | in_progress | Butterfly entry is native-browser-first; legacy panel hidden in runtime. |
| Tab lifecycle | create/switch/close/reopen | same operations via bridge | adapted | in_progress | Renderer mirrors bridge tabs; no implicit tab creation on mode entry. |
| Omnibox | URL/search + suggestions | URL/search + bridge-capability gated suggest | adapted | deferred | Suggest parity still needs completion. |
| History panel | filter/group/open/remove/clear | same outcomes | adapted | in_progress | Native `HistoryPanel` wired. |
| Bookmarks panel | toggle/list/remove/sync | same outcomes | adapted | in_progress | Bookmark state sync active. |
| Downloads panel | progress/actions/clear | same outcomes | adapted | in_progress | Native `DownloadsPanel` wired. |
| Context menu | page/link/media/edit actions | same outcomes | adapted | in_progress | Qt context menu bridge present. |
| Popup handling | target=_blank -> new tab | same | same | in_progress | bridge popup path already present. |
| Hotkeys | browser-focused shortcuts | same | same | in_progress | Core shortcuts present; parity edge cases pending. |
| Provider UI opening | open provider UI in browser workspace | same | same | in_progress | verify all entry points after mode cleanup. |
| Permissions/Adblock/Userscripts/Tor | integrated | integrated | same | in_progress | bridge domains exist; needs E2E parity pass. |

## Acceptance Checklist

- [ ] `setMode('web')` and `setMode('sources')` produce identical runtime workspace.
- [ ] No runtime dependency on renderer legacy browser panel in Butterfly path.
- [ ] Web entry (`setMode('web')`) always opens BrowserWidget and yields one active native tab.
- [ ] Bridge capability handshake available and consumed safely.
- [ ] Tab/navigation/history/bookmark/download flows pass manual parity checks.
- [ ] Provider UI, popup handling, and context menu advanced actions pass parity checks.
- [ ] No regressions in comics/books/videos mode switching.

## Test Scenarios (Manual)

1. Fresh boot -> Web mode -> open new tab -> navigate -> back/forward/reload/stop.
2. Bookmark current page -> verify bookmark state update -> open/remove from panel.
3. Open history panel -> filter -> open item -> remove item -> clear history.
4. Trigger download -> monitor progress -> open/reveal/cancel/resume.
5. Open provider UI from settings and source flows -> ensure Web workspace remains active.
6. Leave Web mode and return -> tab state and workspace remain coherent.
