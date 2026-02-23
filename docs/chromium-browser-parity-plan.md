# Tankoban Chromium Browser Parity — Implementation Plan

## Document Status
- **Version:** 1.0
- **Date:** 2026-02-23
- **Scope:** Chrome-like browser UX improvements — tabs, navigation, omnibox
- **Reference:** `reference/chromium-ref-mini/` (TabStripModel, NavigationController, LocationBarView, OmniboxViewViews, ToolbarView, NetErrorTabHelper)
- **Related plans:**
  - `docs/web-torrent-quasi-parity-plan.md` — browser + torrent parity roadmap
  - `docs/qbittorrent-quasi-parity-implementation-plan.md` — torrent manager deep plan

---

## Executive Summary

This plan implements 8 Chrome-like features in Tankoban's embedded browser, grouped into three areas: **tab behavior** (opener tracking, pinned tabs), **navigation polish** (reload/stop toggle, back/forward history dropdown, custom error pages), and **omnibox upgrades** (inline autocomplete ghost text, per-tab omnibox state, URL drag-drop).

All changes are **renderer-side only** — no new IPC channels, no main-process changes, no new files beyond what's already in the web module. This makes the plan orthogonal to the torrent parity plans, which primarily add main-process services and new renderer submodules.

---

## Relationship to Existing Parity Plans

### Overlap Map

| Feature area | This plan | Quasi-parity plan | qB parity plan | Conflict? |
|---|---|---|---|---|
| Tab model (pin, opener, close) | A1, A2 | Phase 2 §1 "Tab model polish" | — | **None.** Quasi-parity calls for this work; we're implementing it. |
| Omnibox behavior | C1, C2, C3 | Phase 2 §2 "Omnibox parity uplift" | — | **None.** Quasi-parity asks for suggestions/keyboard parity; we go further with ghost text and per-tab state. |
| Navigation controls | B1, B2 | — | — | **None.** Neither torrent plan touches nav buttons. |
| Error pages | B3 | — | — | **None.** Neither torrent plan touches load failure handling. |
| `web.js` modifications | Tab render, nav handlers, omnibox, error inject | Phase 2 §4 "Browser home" + Phase 5 UI | Torrent workspace routing | **Low risk.** Different sections of the file. Our changes touch lines 675–720 (error), 1241–1337 (runtime/navEntries), 2170–2348 (tab render/syncLoadBar), 4044–4240 (createTab/closeTab), 4750–4875 (nav/omnibox handlers). Torrent workspace routing will add a new code block for internal `tankoban://torrents` view, which is architecturally separate. |
| `index.html` modifications | Ghost text `<span>` in omnibox (line 1827) | — | Torrent workspace mount point (new section in web content area) | **None.** Different DOM locations. |
| `web-browser.css` | Pinned tab styles, ghost text overlay | Phase 5 "UI parity" | Torrent workspace CSS (separate file) | **None.** Different selectors. |
| Session persistence | Pinned flag in `tab.pinned` (already exists in tab schema) | Phase 2 mentions "pin/order metadata" | v2 torrent state store (separate file) | **None.** `tab.pinned` is already in the session payload schema. Both plans agree it should be persisted. |
| IPC channels | None added | `WEB_PERMISSION_PROMPT*`, `WEB_DOWNLOAD_LIST_QUERY` | 11 new `WEB_TORRENT_*` channels | **None.** We add zero IPC channels. |
| Context menus | "Pin/Unpin tab" on tab bar | Phase 1 §1 "Context menu hardening" | Torrent transfer list context menu | **Low risk.** We add menu items to the _tab bar_ context menu (line 2262). Phase 1 hardens _webview content_ context menus. Different event paths. |
| `navEntries` format | Change from `[string]` to `[{url, title}]` | — | — | **None.** Runtime-only state, never persisted, never crosses IPC. |
| Event correctness | Long-press on back/forward (new interaction) | Phase 1 §3 "Navigation action determinism" | — | **Low risk.** Long-press is a new input path, not modifying existing click/contextmenu dispatch. Phase 1's hardening of click separation is compatible. |

### Dependency Direction

```
quasi-parity Phase 1 (stability)  ← should land BEFORE or IN PARALLEL with this plan
quasi-parity Phase 2 (browser UX) ← THIS PLAN implements a subset of Phase 2 goals
qB parity plan                    ← completely independent; different code paths
```

### Safe Landing Order

1. **This plan can land independently** — it doesn't require torrent parity changes.
2. If quasi-parity Phase 1 (context menu hardening, popup dedupe) lands first, our context menu additions automatically benefit from the hardening.
3. The qB torrent workspace is a separate renderer submodule (`src/domains/web/torrent-workspace/`) — no merge conflicts with our changes.

---

## Current Baseline

### What already works (Chrome-like)
- Tab bar with drag reorder, close, middle-click close, context menu (duplicate, reload, copy, close others, close right)
- Omnibox with suggestions from history, bookmarks, open tabs, search engines
- Back/forward/reload/home navigation buttons
- Security icon in omnibox (lock/globe)
- Find-in-page (Ctrl+F) with match counts
- Session restore (debounced 260ms saves)
- Download shelf and panel
- Split view (two tabs side by side)
- Torrent tabs (separate from browser tabs, dedicated panel)

### What's missing vs Chrome (this plan fills these gaps)
1. **Opener tracking** — New tabs always append to end, not next to parent
2. **Pinned tabs** — `tab.pinned` flag exists but UI doesn't differentiate
3. **Reload/Stop toggle** — Reload button doesn't become Stop during loading
4. **Back/Forward history dropdown** — No long-press or right-click to see history list
5. **Custom error pages** — Load failures show blank/ugly default error
6. **Inline autocomplete** — No ghost text completion while typing
7. **Per-tab omnibox state** — Typed text lost on tab switch
8. **URL drag-drop** — Can't drag URL from omnibox to tabs

---

## Feature Specifications

### A1. Opener Tracking

**Chromium reference:** `TabStripModel::InsertWebContentsAt` positions new tabs relative to their opener using `opener` and `ADD_INHERIT_OPENER` flags. Closing a tab falls back to the opener (`GetOpenerOfTabContentsAt`).

**Data model change:**
- Add `openerTabId` property to tab objects in `createTab()` (line 4065)
- Ephemeral — not persisted in session state (opener relationships don't survive restart, same as Chrome)

**Tab insertion — `insertTabAtOpenerPosition(tab)`:**
```
If tab.openerTabId is set and opener tab still exists:
  1. Find opener's index in state.tabs
  2. Scan right from opener to find the last consecutive tab with the same openerTabId
  3. Insert new tab after that last sibling
  → This means: opener → child1 → child2 → NEW_CHILD
If no opener or opener gone:
  Append to end (current behavior)
```

**Close-to-opener fallback:**
In `closeTab()` (line 4214), when choosing the next active tab after closing the current one:
```
1. If closed tab has openerTabId and opener still exists → activate opener
2. Else → activate adjacent tab (current behavior: Math.min(idx, length-1))
```

**Creation paths that pass openerTabId:**
| Caller | openerTabId value |
|---|---|
| `openPopupUrlInNewTab(url, parentTab)` | `parentTab.id` |
| Context menu → "Duplicate tab" | duplicated tab's `id` |
| Context menu → "Open link in new tab" | active tab's `id` |
| Ctrl+T / "+" button | `state.activeTabId` (current active tab) |
| Session restore | `null` (no opener) |
| Source tile click | `null` |
| Torrent tab creation | `null` |

### A2. Pinned Tab UI

**Chromium reference:** `TabStripModel` separates `pinned_tab_count_` from regular tabs. Pinned tabs are always at the left, can't be dragged past the boundary, and display as compact favicon-only chips.

**Rendering in `renderTabs()` (line 2196):**
- Add CSS class `.pinned` when `t.pinned === true`
- For pinned tabs: suppress `.webTabLabel` and `.webTabClose` from the HTML
- Pinned tabs always render before unpinned tabs (already guaranteed if we maintain sort invariant)

**CSS additions in `web-browser.css`:**
```css
.webTab.pinned {
  flex: 0 0 36px;
  min-width: 36px;
  max-width: 36px;
  justify-content: center;
  padding: 0;
}
.webTab.pinned .webTabLabel,
.webTab.pinned .webTabClose { display: none; }
/* Visual separator between pinned zone and unpinned zone */
.webTab.pinned + .webTab:not(.pinned) { margin-left: 6px; }
```

**Pin/Unpin functions:**
```
pinTab(tabId):
  1. Set tab.pinned = true
  2. Move tab to end of pinned zone (after last pinned tab)
  3. renderTabs() + scheduleSessionSave()

unpinTab(tabId):
  1. Set tab.pinned = false
  2. Move tab to first unpinned position
  3. renderTabs() + scheduleSessionSave()
```

**Context menu additions (line 2262):**
- After "New tab" item, add: `{ label: t.pinned ? 'Unpin tab' : 'Pin tab', onClick: ... }`

**Drag boundary enforcement (line 2320):**
- In `drop` handler: if source tab is pinned and target is unpinned (or vice versa), `return` without reordering

**Protection rules:**
- Middle-click close (line 2244): `if (tab.pinned) return` — don't close pinned tabs
- "Close other tabs" (line 2284): skip tabs where `tab.pinned === true`
- "Close tabs to the right" (line 2289): skip pinned tabs

**Session persistence:**
- `tab.pinned` is already in the tab schema (line 4076) and included in session save payload
- On session restore, pinned tabs are recreated with `pinned: true` and will render correctly

### B1. Reload/Stop Toggle

**Chromium reference:** `ToolbarView` manages a `ReloadButton` that switches between `reload` and `stop` modes based on `is_loading`.

**SVG constants (add near top of IIFE):**
```javascript
var SVG_RELOAD = '<svg viewBox="0 0 16 16" ...reload path.../svg>';
var SVG_STOP = '<svg viewBox="0 0 16 16" ...X path.../svg>';
```
(Using the existing reload SVG from index.html line 1820, and a new X icon for stop.)

**`syncReloadStopButton()` function:**
```
1. Get active tab
2. If browserOpen && tab && tab.loading → show stop icon, title="Stop loading"
3. Else → show reload icon, title="Reload"
4. Swap el.navReload.innerHTML + title + aria-label
```

**Integration:** Call `syncReloadStopButton()` inside `syncLoadBar()` (line 2343) so it auto-fires everywhere `syncLoadBar()` is called (renderTabs, activateTab, onLoading, etc.).

**Click handler change (line 4779):**
```
if tab.loading → webTabs.navigate({ action: 'stop' })
else → webTabs.navigate({ action: 'reload' })
```

**Shim addition:** Add `'stop'` action in the shim's `navigate` function → calls `wv.stop()`.

**Escape key:** In `handleKeyDown`, after all overlay close checks, if browser is open and active tab is loading → stop it.

### B2. Back/Forward History Dropdown

**Chromium reference:** `NavigationControllerImpl` maintains a vector of `NavigationEntry` objects with `GetEntryAtIndex()`, `GetCurrentEntryIndex()`, `GetEntryCount()`, `GoToIndex()`. The toolbar shows a dropdown when back/forward is long-pressed.

**Fix `navEntries` data model:**

Current (broken): `navEntries: ['https://a.com', 'https://b.com']` — every `did-navigate` pushes, even back/forward, corrupting history.

New: `navEntries: [{ url: 'https://a.com', title: 'A' }, { url: 'https://b.com', title: 'B' }]`

**`createTabRuntime` change (line 1241):**
```javascript
navEntries: u ? [{ url: u, title: '' }] : [],
```

**Migration in `ensureTabRuntime` (line 1257):**
```javascript
// Migrate legacy string entries to { url, title } objects
if (runtime.navEntries.length && typeof runtime.navEntries[0] === 'string') {
  runtime.navEntries = runtime.navEntries.map(function(e) {
    return typeof e === 'string' ? { url: e, title: '' } : e;
  });
}
```

**Direction tracking in the shim:**
- Before calling `wv.goBack()`: set `rec._navDirection = 'back'`
- Before calling `wv.goForward()`: set `rec._navDirection = 'forward'`
- Before calling `wv.goToIndex(idx)`: set `rec._navDirection = 'index'`, `rec._navTargetIndex = idx`
- In `did-navigate` handler: read direction, include in emitted `url` event, then clear the flag

**`pushRuntimeCommittedUrl` change (line 1317):**
- Add `direction` parameter
- If `direction === 'back'` → decrement `currentIndex`, update entry URL (for redirects)
- If `direction === 'forward'` → increment `currentIndex`, update entry URL
- If `direction === 'index'` → set `currentIndex` to target index
- If no direction (normal navigation) → truncate forward entries, push new `{ url, title }` (current behavior, adapted for objects)

**Title sync in `onTitleUpdated` (line 5576):**
```javascript
if (runtime.navEntries[runtime.currentIndex]) {
  runtime.navEntries[runtime.currentIndex].title = data.title || '';
}
```

**Dropdown UI — `showNavHistoryDropdown(direction, event)`:**
```
1. Get active tab's runtime.navEntries and currentIndex
2. If direction === 'back': collect entries[0..currentIndex-1] in reverse (most recent first)
3. If direction === 'forward': collect entries[currentIndex+1..end]
4. Cap at 15 entries
5. Build context menu items, each labeled with entry.title || entry.url
6. Each item calls webTabs.navigate({ action: 'goToIndex', index: entryIndex })
7. Position dropdown below the button using showContextMenu(items, rect.left, rect.bottom + 4)
```

**Long-press detection + right-click:**
```
addLongPressHandler(button, callback):
  - mousedown (left only) → start 500ms timer
  - Timer fires → set _longPressTriggered = true, call callback
  - mouseup / mouseleave → cancel timer
  - contextmenu → preventDefault, cancel timer, call callback

Apply to el.navBack and el.navForward.
```

**Click suppression:**
When `_longPressTriggered` is true, the next `onclick` on the same button is suppressed (returns early, resets flag).

**`goToIndex` action in shim:**
```javascript
} else if (action === 'goToIndex') {
  rec._navDirection = 'index';
  rec._navTargetIndex = Number(payload && payload.index);
  try { wv.goToIndex(rec._navTargetIndex); } catch (e) {}
}
```

### B3. Custom Error Pages

**Chromium reference:** `NetErrorTabHelper` intercepts load failures and replaces the page content with a styled error page showing the error type, suggestions, and a reload button.

**`buildErrorPageHtml(failure, failedUrl)` function:**

Returns a self-contained HTML document with inline CSS. Error kinds and their display:

| Kind | Title | Emoji | Message |
|---|---|---|---|
| `dns` | This site can't be reached | magnifying glass | Server DNS address could not be found |
| `tls` | Connection isn't secure | lock | Problem with site's security certificate |
| `timeout` | Connection timed out | stopwatch | Server took too long to respond |
| `offline` | No internet connection | satellite | Device not connected to the internet |
| `blocked` | Blocked | no entry | Page blocked by content filters |
| (other) | This page isn't working | warning | Something went wrong loading this page |

Each page shows:
- Large emoji
- Title heading
- Hostname (extracted from failed URL)
- Description message
- Suggestion text
- "Try again" button (`onclick="location.reload()"`)
- Error code footer (e.g. `ERR_CODE: -105 (ERR_NAME_NOT_RESOLVED)`)

**Theme:** Dark background (`#1a1a2e`) with light text — matches the app's default dark theme. The error page uses inline styles since CSS variables from the app aren't available inside webview content.

**Injection in `handleLoadFail` (line 685):**
After existing event emits and toast, add:
```javascript
try {
  var errorHtml = buildErrorPageHtml(failure, failedUrl);
  var script = 'document.open();document.write(' + JSON.stringify(errorHtml) + ');document.close();';
  wv.executeJavaScript(script).catch(function(){});
} catch (e) {}
```

**Fallback:** If `executeJavaScript` fails (CSP, crashed renderer, etc.), the toast notification still shows and the tab title still updates to the error kind. No regression from current behavior.

### C1. Inline Autocomplete Ghost Text

**Chromium reference:** `OmniboxViewViews` uses `SetGrayTextAutocompletion()` to display gray completion text inline after the user's typed text. This creates the illusion of the URL bar pre-filling the rest of the URL.

**Approach:** Overlay `<span>` positioned over the input — avoids modifying `input.value` so all existing suggestion logic works unchanged.

**HTML change in `index.html` (line 1827):**
Replace the bare `<input>` with a wrapper:
```html
<div class="webOmniInputWrap">
  <input id="webUrlDisplay" class="webUrlDisplay" type="text" ... />
  <span id="webOmniGhost" class="webOmniGhost" aria-hidden="true"></span>
</div>
```

**CSS additions in `web-browser.css`:**
```css
.webOmniInputWrap {
  flex: 1;
  position: relative;
  min-width: 0;
}
.webOmniGhost {
  position: absolute;
  left: 0; top: 0;
  height: 100%;
  display: flex;
  align-items: center;
  pointer-events: none;
  font: inherit;
  padding: inherit;
  color: transparent; /* spacer portion invisible */
  white-space: nowrap;
  overflow: hidden;
}
.webOmniGhost .ghost-completion {
  color: rgba(255,255,255,.3);
}
```

**Logic — `updateOmniGhostText()`:**
```
1. Get current input value (what user typed)
2. If empty or suggestion list empty → clear ghost, return
3. Find first suggestion URL that starts with the input (case-insensitive)
   - Strip https://, http://, www. prefixes from both for matching
4. If match found:
   - Compute completion = matchedUrl.slice(userInput.length)
   - Render ghost: <span style="visibility:hidden">{userInput}</span><span class="ghost-completion">{completion}</span>
5. If no match → clear ghost
```

**Acceptance (Tab / Right Arrow):**
```
On keydown in urlDisplay:
  If key === 'Tab' or (key === 'ArrowRight' && cursor at end):
    If ghost has completion text:
      input.value = input.value + completion
      Clear ghost
      preventDefault (for Tab — don't move focus)
```

**IME safety:**
- `compositionstart` → clear ghost
- `compositionend` → refresh ghost after short delay (10ms)

**Clear ghost on:** blur, Enter, Escape, `closeOmniSuggestions()`

### C2. Per-Tab Omnibox State

**Chromium reference:** `LocationBarView` saves and restores the omnibox editing state per tab via `OmniboxView::SaveStateToTab()` and `Update()`.

**Data model:** Add `omniState: null` to `createTabRuntime()` return object.

**`saveOmniState()`:**
```javascript
function saveOmniState() {
  if (!el.urlDisplay) return;
  var focused = (document.activeElement === el.urlDisplay);
  if (!focused) return; // only save if user is actively typing
  var tab = getActiveTab();
  if (!tab) return;
  var runtime = ensureTabRuntime(tab);
  runtime.omniState = {
    text: el.urlDisplay.value,
    selStart: el.urlDisplay.selectionStart,
    selEnd: el.urlDisplay.selectionEnd,
    focused: true
  };
}
```

**`restoreOmniState(tabId)`:**
```javascript
function restoreOmniState(tabId) {
  var tab = getTabById(tabId);
  if (!tab) return;
  var runtime = ensureTabRuntime(tab);
  var saved = runtime.omniState;
  runtime.omniState = null; // consume it
  if (!saved || !saved.focused) return;
  state._omniRestoreInProgress = true;
  el.urlDisplay.value = saved.text;
  el.urlDisplay.setSelectionRange(saved.selStart, saved.selEnd);
  el.urlDisplay.focus();
  setTimeout(function() { state._omniRestoreInProgress = false; }, 50);
}
```

**Integration in `activateTab()` (line 4143):**
```
1. saveOmniState()           // save state of CURRENT tab before switching
2. state.activeTabId = tabId // switch
3. ... existing work ...
4. updateUrlDisplay()        // set URL for new tab
5. restoreOmniState(tabId)   // override with saved typing state if any
```

**Guard flags:**
- `state._omniRestoreInProgress` — prevents `urlDisplay` blur handler's `setTimeout` from reverting the restored text
- In blur handler: `if (state._omniRestoreInProgress) return;`
- In focus handler (`this.select()`): `if (state._omniRestoreInProgress) return;`

### C3. URL Drag-Drop

**Chromium reference:** `LocationBarView` supports drag-start from the location icon (favicon/lock). The `TabStripModel` accepts URL drops to navigate or create tabs.

**From omnibox (drag the lock/globe icon):**
```javascript
el.omniIcon.setAttribute('draggable', 'true');
el.omniIcon.addEventListener('dragstart', function(e) {
  var tab = getActiveTab();
  var url = tab ? (tab.url || '') : '';
  if (!url) { e.preventDefault(); return; }
  e.dataTransfer.setData('text/plain', url);
  e.dataTransfer.setData('text/uri-list', url);
  e.dataTransfer.effectAllowed = 'copyLink';
});
```

**To existing tabs (extend drop handler at line 2320):**
```
In the tab drop handler, after checking state.dragTabId:
  If state.dragTabId is null (not a tab reorder):
    Check e.dataTransfer for 'text/uri-list' or 'text/plain'
    If valid URL found → navigate that tab to the URL
```

**To tab bar empty area:**
```
Add dragover + drop handlers on el.tabBar itself:
  If drop target is the tab bar (not a specific tab):
    Extract URL from dataTransfer
    Create new tab with that URL
```

---

## Files Modified

| File | Lines touched | What changes |
|---|---|---|
| `src/domains/web/web.js` | ~1241 (createTabRuntime), ~1257 (ensureTabRuntime), ~1317 (pushRuntimeCommittedUrl), ~2175 (renderTabs), ~2343 (syncLoadBar), ~4065 (createTab), ~4080 (tab insertion), ~4143 (activateTab), ~4184 (closeTab), ~4761 (navBack onclick), ~4770 (navForward onclick), ~4779 (navReload onclick), ~4814 (urlDisplay handlers), ~5576 (onTitleUpdated), ~5587 (onUrlUpdated), ~685 (handleLoadFail), shim navigate function | Tab opener, pinned tabs, reload/stop, history dropdown, error pages, ghost text, omnibox state, drag-drop |
| `src/styles/web-browser.css` | New rules at end | `.webTab.pinned`, `.webOmniInputWrap`, `.webOmniGhost` |
| `src/index.html` | ~1827 (omnibox area) | Wrap input in `.webOmniInputWrap`, add `#webOmniGhost` span |

**Files NOT modified** (confirming no overlap with torrent plans):
- `shared/ipc.js` — no new channels
- `preload/namespaces/web.js` — no new API surface
- `main/domains/webTorrent/*` — untouched
- `main/ipc/register/*` — untouched
- `src/domains/web/torrent-workspace/*` — doesn't exist yet, won't conflict

---

## Implementation Order

| Step | Feature | Estimated complexity | Depends on |
|---|---|---|---|
| 1 | B1: Reload/Stop toggle | Small | None |
| 2 | A1: Opener tracking | Medium | None |
| 3 | A2: Pinned tab UI | Medium | None |
| 4 | B2: History dropdown | Large | None (but benefits from A1 for nicer close-to-opener) |
| 5 | B3: Custom error pages | Small | None |
| 6 | C1: Ghost text autocomplete | Medium | HTML change in index.html |
| 7 | C2: Per-tab omnibox state | Medium | None |
| 8 | C3: URL drag-drop | Small | None |

Each step is independently committable after live testing.

---

## Verification Matrix

| # | Feature | Test scenario | Expected result |
|---|---|---|---|
| 1 | Reload/Stop | Load slow page | Button shows X during load, click stops it, Escape stops it, reverts to reload icon after |
| 2 | Opener tracking | Click link that opens new tab | New tab appears next to parent, not at end. Close child → activates parent. |
| 3 | Pinned tabs | Right-click tab → Pin | Tab shrinks to favicon-only. Can't middle-click close. Can't drag past pinned boundary. "Close others" preserves pinned. Survives restart. |
| 4 | History dropdown | Long-press back button | Dropdown shows recently visited pages with titles. Click entry → navigates to that position. Forward dropdown also works. |
| 5 | Error pages | Navigate to `https://thisdomaindoesnotexist12345.com` | Styled error page with "Try again" button, not blank white page |
| 6 | Ghost text | Type "git" in omnibox | Gray "hub.com" appears. Tab accepts it. Typing another letter refreshes. Escape clears. |
| 7 | Per-tab state | Start typing in omnibox → switch tab → switch back | Typed text is restored with cursor position. Suggestions re-appear. |
| 8 | Drag-drop | Drag lock icon from omnibox → drop on tab | That tab navigates to URL. Drop on empty tab bar area → new tab. |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `wv.goToIndex(idx)` may fail for some page types | History dropdown click does nothing | Wrap in try/catch, fall back to sequential goBack/goForward calls |
| `navEntries` array drifts from webview's internal history | Dropdown shows stale/incorrect entries | Best-effort mirror — same limitation as Chrome (titles sometimes stale). Direction tracking minimizes drift. |
| Error page injection blocked by CSP | Blank page shown instead of styled error | Toast notification still fires. Tab title still updates. No regression. |
| Ghost text overlay misaligned with input text | Visual glitch — ghost text offset from typed text | Use identical font/padding/box-sizing. Test across zoom levels. |
| Per-tab omnibox restore races with blur/focus handlers | Restored text immediately overwritten | Guard flag `_omniRestoreInProgress` with 50ms timeout prevents clobbering |
| Long-press conflicts with existing button behavior | Regular click sometimes fails to fire | Guard flag `_longPressTriggered` checked and cleared in onclick handler |
| Pinned tab drag boundary breaks existing reorder | Tabs get stuck or jump unexpectedly | Simple check: `if (fromTab.pinned !== toTab.pinned) return` — clean reject |

---

## Non-Goals (Explicitly Out of Scope)

1. **Tab groups** — App already has source-based color grouping. Full Chrome tab groups (collapsible, named, colored) would add complexity without proportional value for a 3–10 tab media browser.
2. **Multiple reload types** — Chrome has normal reload, hard reload, bypass cache. Single reload is sufficient for this app.
3. **Security chip** — Chrome shows "Not secure" text for HTTP sites. The lock/globe icon is sufficient for now.
4. **Omnibox pedal actions** — Chrome shows special actions like "Clear browsing data" in suggestions. Out of scope.
5. **Tab detach/reattach** — Chrome allows dragging tabs out to create new windows. Single-window app, not applicable.
6. **Extensions API** — Chrome extension model is irrelevant here.
