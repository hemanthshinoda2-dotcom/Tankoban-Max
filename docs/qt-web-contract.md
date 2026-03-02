# Qt Web Bridge Contract (Butterfly)

## Contract Version
- `webTabManager.CONTRACT_VERSION`: `webtabmanager-v1`

## Capability Handshake
Renderer may call:

- `api.webTabManager.getCapabilities()` ->

```json
{
  "ok": true,
  "contractVersion": "webtabmanager-v1",
  "features": {
    "nativeChrome": true,
    "tabSearch": true,
    "omniSuggest": false,
    "bookmarksPanel": true,
    "historyPanel": true,
    "downloadsPanel": true,
    "contextMenuAdvanced": true
  }
}
```

## Standardized Response Envelope
All `webTabManager` methods return JSON with at least:

- `ok: boolean`
- `error?: string`

Tab-mutating methods include `tabId` when available.
Navigation/mode methods may include `url`, `title`, `loading`, `canGoBack`, `canGoForward`.

## Mode Semantics
- Canonical runtime mode: `web`
- Backward-compatible alias: `sources`
- Renderer should treat both as the same workspace during compatibility window.

## Butterfly Runtime Rule
- Butterfly Web mode is native-browser-first.
- The renderer legacy browser panel (`#sourcesBrowserPanel`) is not part of Butterfly runtime UX.
- Entering Web mode must call `webTabManager.openBrowser()` and ensure at least one native tab exists.

## Tab Creation Rule
- `webTabManager.openBrowser()` must only show/switch to BrowserWidget.
- `webTabManager.openBrowser()` must not implicitly create tabs.
- Tab creation is explicit through `webTabManager.createTab(...)`.
