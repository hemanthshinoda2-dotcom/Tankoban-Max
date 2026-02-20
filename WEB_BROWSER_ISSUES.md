# Web Browser & Downloads Issues Tracker

Deep inspection of the web browser (tabs, navigation, sources) and download system.
Grouped into fix batches by area and dependency.

---

## Batch 1 — Download Progress (Known Broken)

The live download progress pipeline has a confirmed IPC gap. Downloads appear and complete, but the renderer never receives progress updates mid-download.

- [ ] **#1 CRITICAL — WEB_DOWNLOAD_PROGRESS events never reach renderer**
  `main/domains/webSources/index.js:414` / `preload/index.js:440-442` — Main process sends `WEB_DOWNLOAD_PROGRESS` events correctly (confirmed with logging in session 6). Renderer's `ipcRenderer.on` callback for this channel never fires. `WEB_DOWNLOAD_STARTED` and `WEB_DOWNLOADS_UPDATED` arrive fine — only progress events are lost. Progress bar stays at 0% during download, then jumps to "Saved" on completion.

- [ ] **#2 HIGH — Download panel clear button doesn't persist to disk**
  `web.js:1933-1939` — The `dlClearBtn` in the browser overlay does `state.downloads = []` and re-renders, but never calls `api.webSources.clearDownloadHistory()`. Closing and reopening the app brings back all the "cleared" downloads. The home view clear button (`homeDlClearBtn`, line 2024) does call the backend correctly.

---

## Batch 2 — Tab Lifecycle & Crash Recovery

WebContentsView tabs can end up in broken states with no recovery path.

- [ ] **#3 HIGH — Failed tab creation leaves ghost tab in renderer**
  `web.js:1305-1350` — `createTab()` adds the tab to `state.tabs` immediately, then asynchronously calls `api.webTabs.create()`. If the IPC call rejects (e.g. out of memory, GPU crash), the tab exists in the renderer with `mainTabId: null`. All navigation, bounds, and close operations silently fail. User sees a tab they can click but that does nothing.

- [ ] **#4 HIGH — No crash/unresponsive detection for WebContentsView**
  `main/domains/webTabs/index.js` — No listeners for `render-process-gone`, `unresponsive`, `responsive`, or `did-fail-load` on the WebContents. If a tab's renderer process crashes (OOM on heavy sites), the view goes blank with no error shown. User must manually close and re-open the tab.

- [ ] **#5 MEDIUM — closeAll() exported but never callable via IPC**
  `main/domains/webTabs/index.js:273-281` — `closeAll()` is exported from the module and available in the renderer's `closeAllTabs()` function, but there is no IPC channel registered for it in `web_tabs.js`. The renderer's `closeAllTabs()` works by looping `closeTab()` which sends individual IPC `close` calls — functional but N round-trips instead of 1.

- [ ] **#6 MEDIUM — Tab views not cleaned up on app quit**
  `main/domains/webTabs/index.js` — The `tabs` Map is module-level with no cleanup on `before-quit` or `window-all-closed`. WebContentsView instances may not be properly destroyed before the window closes, potentially leaking resources or causing Electron warnings on exit.

---

## Batch 3 — Navigation & URL Handling

- [ ] **#7 MEDIUM — loadURL failure silently swallowed on tab creation**
  `main/domains/webTabs/index.js:118-120` — `wc.loadURL(url)` is wrapped in a bare `try { } catch (e) {}`. If the URL is malformed or the load fails, no error is returned to the renderer. The tab is created and visible but shows a blank page with no feedback.

- [ ] **#8 MEDIUM — Omnibox accepts javascript: URLs**
  `web.js:162-176` — `resolveOmniInputToUrl()` checks if input starts with `[a-zA-Z][a-zA-Z0-9+.-]*:` and passes it through as-is. This means `javascript:alert(1)` would be sent directly to `wc.loadURL()`. While Electron may block this, there's no explicit sanitization.

- [ ] **#9 LOW — No error page for navigation failures**
  `main/domains/webTabs/index.js` — There is no `did-fail-load` listener. When a site is unreachable (DNS failure, timeout, SSL error), the WebContentsView shows Chromium's built-in error page. No event is forwarded to the renderer, so the loading spinner may never stop (only `did-stop-loading` fires, which does clear it, but there is no user-facing message about what went wrong).

- [ ] **#10 LOW — Back button on browser toolbar always closes browser if can't go back**
  `web.js:1716-1723` — Pressing Backspace when `canGoBack` is false calls `closeBrowser()`. This can be surprising if the user just wants to go back but hasn't navigated yet — one accidental Backspace exits the entire browser view.

---

## Batch 4 — Download Routing & Resilience

- [ ] **#11 MEDIUM — Non-library file downloads silently use default Electron behavior**
  `main/domains/webSources/index.js:266-270` — Files that aren't books or comics (e.g., `.zip`, `.mp3`, `.jpg`) fall through with `return;`, letting Electron handle them with its default save dialog. This is inconsistent — user might expect all downloads from the browser to be tracked.

- [ ] **#12 MEDIUM — Race condition in download history writes**
  `main/domains/webSources/index.js:390-412` — The throttled persist on `item.on('updated')` reads the in-memory cache, mutates it, and writes to disk. If two downloads are active simultaneously, both write to the same file. The `ensureDownloadsCache()` call returns the same shared object, so mutations from one download can interleave with another's persist cycle. No locking or atomic write.

- [ ] **#13 LOW — Download destination only uses first root folder**
  `main/domains/webSources/index.js:136-148` — `routeDownloadSync()` always picks `bookRootFolders[0]` or `rootFolders[0]`. If the user has multiple library roots, downloads always go to the first one with no option to choose.

- [ ] **#14 LOW — Pause/resume/cancel API exposed in preload but never used in renderer**
  `preload/index.js:428-430` / `web.js` — The preload exposes `pauseDownload()`, `resumeDownload()`, and `cancelDownload()`, but the renderer UI (`web.js`) never calls them. Active downloads cannot be paused, resumed, or cancelled from the UI — only from main process code.

---

## Batch 5 — UI State & Rendering

- [ ] **#15 MEDIUM — renderTabs() rebuilds full innerHTML on every event**
  `web.js:728-865` — Every title update, URL change, or loading state change triggers `renderTabs()` which rebuilds the entire tab bar HTML including re-binding all event listeners (click, contextmenu, drag/drop). At 8 tabs with active loading, this fires repeatedly. Should diff or update individual tab elements.

- [ ] **#16 MEDIUM — Split view divider not draggable in BUILD_WCV mode**
  `web.js:1464-1512` / CSS `.webSplitDivider` — The CSS defines `cursor: col-resize` for the divider, but there are no mouse event handlers in `web.js` to actually implement drag-to-resize. `state.splitRatio` is hardcoded to `0.5` and never changes. The split is always 50/50.

- [ ] **#17 LOW — dlBarDismissed persists until next download starts**
  `web.js:1946-1948` — When user clicks the X on the bottom download bar, `state.dlBarDismissed = true` suppresses all future `showDlBar()` calls. It's only reset when a new download starts (`line 2065`). If a download is already in progress and the user dismisses the bar, progress updates are permanently hidden for that download.

- [ ] **#18 LOW — CSS has duplicate selectors that override each other**
  `web-browser.css` — `.webDlItem` is defined at line 503 and again at line 643. `.webDlMeta` at 523 and 688. `.webDlName` at 528 and 692. `.webDlSub` at 535 and 699. `.webDlState` at 544 and 739. The second declarations silently override the first, which may cause unintended style differences between the overlay panel and home view.

---

## Batch 6 — Keyboard & Accessibility

- [ ] **#19 MEDIUM — Keyboard shortcuts active even when browser not focused**
  `web.js:1620-1771` — `handleKeyDown` checks `if (!state.browserOpen) return;` but is registered on `document` with `useCapture: true`. When the browser view is open but a native WebContentsView has focus (user is typing in a website), keystrokes like `f` (fullscreen), `k` (tips), Backspace (close browser) still fire because the capture listener runs before the WebContentsView gets the event. Only `isTypingTarget()` guards against this, but it checks DOM targets — it can't see into the WebContentsView's content.

- [ ] **#20 LOW — No Ctrl+Shift+T to reopen closed tab**
  Standard browser feature missing. Closed tabs are gone permanently with no undo.

- [ ] **#21 LOW — Tab bar not keyboard-navigable**
  `web.js:728-865` — Tab elements are `div` with click handlers but no `tabindex` or `role="tab"`. Cannot focus or switch tabs via keyboard alone (only Ctrl+Tab works).

- [ ] **#22 LOW — Context menu not keyboard-navigable**
  `web.js:301-355` — Context menu buttons are focusable but there's no arrow key navigation between items. No `role="menu"` on the container. Escape closes it (via the global handler) but arrow keys do nothing.

---

## Batch 7 — Security & Isolation

- [ ] **#23 MEDIUM — No permission handler for WebContentsView**
  `main/domains/webTabs/index.js` — No `setPermissionRequestHandler` or `setPermissionCheckHandler` on the `persist:webmode` session. Websites in the built-in browser can request geolocation, camera, microphone, notifications, etc. Electron's defaults may grant some of these silently depending on version.

- [ ] **#24 MEDIUM — No navigation filtering on WebContentsView**
  `main/domains/webTabs/index.js` — No `will-navigate` or `will-redirect` listener. A malicious page could navigate to `file://` or other internal protocols. While Electron has some built-in protections, explicit filtering is safer.

- [ ] **#25 LOW — Session data (cookies, localStorage) persists indefinitely**
  `main/domains/webTabs/index.js:6` — Uses `persist:webmode` session with no mechanism to clear cookies, cache, or storage. No "clear browsing data" feature. Session grows unbounded over time.

---

## Not bugs — design trade-offs

- Favicons use Google's favicon service (`google.com/s2/favicons`) — requires internet for source card icons. Intentional for simplicity.
- Tab limit hardcoded to 8 — prevents resource exhaustion. Reasonable for an embedded browser.
- Split view only supports 2 panes — matches Chrome's approach. Not a limitation.
- Download bar auto-hides after 5 seconds — matches Chrome behavior.
- Non-library downloads use Electron's default save dialog — acceptable for .zip/.jpg etc.
