# Browser Redesign: Chrome-style → Library-style with Single Webview

## Table of Contents

1. [Context & Problem Statement](#1-context--problem-statement)
2. [Design Overview](#2-design-overview)
3. [Architecture: Before vs After](#3-architecture-before-vs-after)
4. [HTML Structure Changes](#4-html-structure-changes)
5. [CSS Changes](#5-css-changes)
6. [JavaScript Module Changes](#6-javascript-module-changes)
7. [Mode Router & Section Boot](#7-mode-router--section-boot)
8. [Session Save/Restore](#8-session-saverestore)
9. [Torrent Tab Integration](#9-torrent-tab-integration)
10. [Implementation Order](#10-implementation-order)
11. [What Gets Deleted vs Adapted vs Kept](#11-what-gets-deleted-vs-adapted-vs-kept)
12. [Verification Checklist](#12-verification-checklist)

---

## 1. Context & Problem Statement

The browser section suffers from **three persistent problems** that all trace back to the same root cause — managing multiple `<webview>` elements simultaneously:

1. **Dead/unresponsive tabs** — Electron webviews created inside hidden containers (the browser overlay starts with `class="hidden"`) fail to initialize their web process. Session restore creates webviews while the container is invisible, producing zombie tabs. Even during normal use, background webviews can lose their web contents.

2. **Missing favicons** — Tab favicons rely on `page-favicon-updated` webview events and `/favicon.ico` fallbacks, both unreliable. The Google favicon service helps but events from dead webviews never fire.

3. **Unreliable session restore** — Deferred webview creation helps but doesn't solve the fundamental issue: Electron webviews are fragile when multiplied and hidden.

**Root cause**: The current design tries to emulate Chrome with multiple simultaneous webview processes. The comics/videos/books library views work reliably because they use **native DOM** — card grids, lists, and a single viewer (reader/player) when you open something.

**Solution**: Redesign the browser to follow the library pattern with a **sidebar + content area** layout and a **single webview** model. "Tabs" become metadata entries in the sidebar — clicking one destroys the current webview and creates a fresh one.

---

## 2. Design Overview

### Layout Mockup

```
┌──────────────────────────────────────────────────────────────┐
│  [← Home] [◄] [►] [↻]  [ Search or enter URL       ▾] [☆] [⋮] │  ← Toolbar (webview view only)
├──────────────┬───────────────────────────────────────────────┤
│ TABS         │                                               │
│ ● Google     │                                               │
│   Reddit     │   Content area switches between:              │
│   GitHub     │                                               │
│ + New tab    │   A) HOME VIEW                                │
│ ──────────── │      - Search bar (centered)                  │
│ SOURCES      │      - Quick Access grid (sources as cards)   │
│   Manga Site │      - Bookmarks grid (bookmarks as cards)    │
│   Comics Hub │      - Downloads list                         │
│   Add source │                                               │
│ ──────────── │   B) WEBVIEW VIEW                             │
│ BOOKMARKS    │      - Toolbar + loading bar                  │
│   Fav 1      │      - Single <webview> element               │
│   Fav 2      │      - Find bar (floating)                    │
│   Fav 3      │                                               │
│ ──────────── │   C) TORRENT VIEW                             │
│ DOWNLOADS    │      - qBittorrent-style torrent manager      │
│   file.zip   │                                               │
│ ──────────── │                                               │
│ TORRENTS     │                                               │
│   [Client]   │                                               │
│ ──────────── │                                               │
│ APP          │                                               │
│   Tips       │                                               │
│   Settings   │                                               │
└──────────────┴───────────────────────────────────────────────┘
```

### Key Rules

1. **Only ONE `<webview>` exists at a time** — created when switching to a tab, destroyed when leaving
2. **Tab objects are pure metadata**: `{id, url, title, favicon, sourceId, type}`
3. **Sidebar renders** tabs, sources, bookmarks, downloads, torrents as navigation items
4. **Content area toggles** between: home view (DOM grids) / webview view / torrent view
5. **All main process backends and IPC contracts stay unchanged**
6. **The bridge + module factory pattern stays** — only module internals change

### Tradeoffs

| Gain | Cost |
|------|------|
| No dead/zombie tabs (ever) | Tab switching requires page reload (no instant swap) |
| Reliable session restore | Lose scroll position on tab switch (mitigated with JS save/restore) |
| Simpler code (no multi-webview juggling) | Single webview means no background loading |
| Consistent with library UX | Looks less like Chrome (intentional) |
| Favicons from stored metadata, always reliable | — |

---

## 3. Architecture: Before vs After

### Before (Current)

```
webBrowserView (fixed overlay, display:none initially)
├── Tab bar (38px) — horizontal tabs, each with its own <webview>
├── Toolbar (44px) — URL bar, nav buttons
├── Bookmark bar (28px)
├── Loading bar (2px)
├── Content area
│   ├── Home panel (new-tab page with search + quick access)
│   ├── Torrent container
│   └── Webview container (MULTIPLE <webview> elements, toggled via .active class)
├── Floating panels (history, bookmarks, downloads, menu — position:fixed overlays)
└── Context menu + overlay
```

**Problems**: Multiple webviews go dead. Fixed overlay hides app chrome. Floating panels overlap. Session restore creates hidden webviews that fail.

### After (Redesigned)

```
webLibraryView (section.view, same as library)
├── libraryShell (CSS Grid: sidebar + content)
│   ├── libSidebar
│   │   ├── Tabs section (metadata list, active highlight)
│   │   ├── Sources section (existing)
│   │   ├── Bookmarks section (new)
│   │   ├── Downloads section (existing, enhanced)
│   │   ├── Torrents section (new)
│   │   └── App section (tips, settings)
│   └── libContent
│       ├── Home view (search + source cards + bookmark cards + downloads)
│       └── Webview view (hidden by default)
│           ├── Toolbar (44px)
│           ├── Loading bar (2px)
│           └── Content area
│               ├── Find bar (floating)
│               ├── Torrent container
│               └── Webview container (at most ONE <webview>)
├── Menu panel (positioned absolute, inside section)
└── Context menu + overlay
```

**Key difference**: The browser is now a standard section view (like comics library), not a fixed overlay. Only one webview exists at a time.

---

## 4. HTML Structure Changes

### File: `src/index.html`

### 4A. Extend the existing `webLibraryView` sidebar (line 1497-1536)

The existing sidebar has Sources, Downloads, and Info sections. We add Tabs (at top), Bookmarks, and Torrents sections.

**New sidebar structure** (replaces lines 1499-1536):

```html
<aside class="libSidebar" aria-label="Web browser navigation">
  <button class="sidebarPinBtn" title="Pin sidebar" aria-label="Pin sidebar">
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.707l-.71-.71-3.18 3.18a3.02 3.02 0 0 1-.435.343L8.5 11.19V14.5a.5.5 0 0 1-.854.354L5.305 12.51l-3.158 3.159a.5.5 0 0 1-.708-.708L4.598 11.8l-2.347-2.346A.5.5 0 0 1 2.605 8.6h3.31l1.853-1.6a3.02 3.02 0 0 1 .343-.435L11.29 3.38l-.71-.71a.5.5 0 0 1 .146-.849z"/>
    </svg>
  </button>

  <!-- SECTION: TABS (open browser tabs — metadata list) -->
  <div class="navSection" id="wb-sidebar-tabs-section">
    <div class="navHeader">
      Tabs <span id="wb-tabs-count" class="wb-sidebar-count"></span>
    </div>
    <div class="navItems" id="wb-sidebar-tabs-list">
      <!-- Dynamically rendered tab items:
        <div class="wb-tab-item [active]" data-tab-id="N">
          <img class="wb-tab-favicon" src="..." width="16" height="16">
          <span class="wb-tab-title">Page Title</span>
          <button class="wb-tab-close" title="Close tab">×</button>
        </div>
      -->
    </div>
    <button id="wb-sidebar-new-tab" class="navBtn" title="New tab (Ctrl+T)">
      <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      New tab
    </button>
  </div>

  <div class="navSep"></div>

  <!-- SECTION: SOURCES (existing — web sources / quick access) -->
  <div class="navSection">
    <div class="navHeader">Sources</div>
    <div class="navItems">
      <div id="webSourcesList" class="folderTree" role="list" aria-label="Bookmarked sources"></div>
      <sl-button id="webAddSourceBtn" class="navBtn" title="Add download source">Add source...</sl-button>
    </div>
  </div>

  <div class="navSep"></div>

  <!-- SECTION: BOOKMARKS (new — bookmark list with favicon + title) -->
  <div class="navSection" id="wb-sidebar-bookmarks-section">
    <div class="navHeader">Bookmarks</div>
    <div class="navItems" id="wb-sidebar-bookmarks-list">
      <!-- Dynamically rendered bookmark items:
        <div class="wb-bm-item" data-bookmark-id="..." data-url="...">
          <img class="wb-bm-favicon" src="..." width="14" height="14">
          <span class="wb-bm-title">Bookmark Name</span>
        </div>
      -->
    </div>
  </div>

  <div class="navSep"></div>

  <!-- SECTION: DOWNLOADS (existing — enhanced with active download progress) -->
  <div class="navSection">
    <div class="navHeader">
      Downloads <span id="wb-downloads-badge" class="wb-sidebar-badge hidden"></span>
    </div>
    <div class="navItems">
      <div id="webDownloadStatus" class="muted tiny">No active downloads</div>
      <div id="webDownloadProgressRow" class="webSidebarDlRow hidden" aria-hidden="true">
        <div id="webDownloadProgress" class="webSidebarDlProgress">
          <div id="webDownloadProgressFill" class="webSidebarDlProgressFill"></div>
        </div>
        <div id="webDownloadProgressPct" class="webSidebarDlPct">0%</div>
      </div>
    </div>
  </div>

  <div class="navSep"></div>

  <!-- SECTION: TORRENTS (new — link to torrent view + active count) -->
  <div class="navSection" id="wb-sidebar-torrent-section">
    <div class="navHeader">Torrents</div>
    <div class="navItems">
      <button id="wb-sidebar-torrent-btn" class="navBtn" title="Open torrent client">
        <svg width="14" height="14" viewBox="0 0 16 16"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 5v4M6.5 7.5L8 9l1.5-1.5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Torrent Client
        <span id="wb-torrent-badge" class="wb-sidebar-badge hidden"></span>
      </button>
    </div>
  </div>

  <div class="navSep"></div>

  <!-- SECTION: APP (existing — tips, settings, info) -->
  <div class="navSection">
    <div class="navHeader">App</div>
    <div class="navItems">
      <sl-button id="webTipsBtn" class="navBtn" title="Keyboard shortcuts (K)">Tips</sl-button>
      <sl-button id="wb-settings-btn" class="navBtn" title="Browser settings">Settings</sl-button>
      <div id="webDestInfo" class="muted tiny">
        Books &rarr; <span id="webDestBooks" class="webDestPath">Not configured</span><br/>
        Comics &rarr; <span id="webDestComics" class="webDestPath">Not configured</span>
      </div>
    </div>
  </div>
</aside>
```

### 4B. Extend `libContent` (line 1538-1569)

Add a bookmarks grid to the home view and a new webview view as sibling.

**Updated `libContent`** (replaces lines 1538-1569):

```html
<div class="libContent">
  <!-- HOME VIEW: visible when no tab is active or user clicks "Home" -->
  <div id="webHomeView" class="homeView">
    <!-- Search bar (same UX as current home panel) -->
    <div class="wb-home-shell">
      <div id="wb-home-search-title" class="web-home-title">Yandex Search</div>
      <form id="wb-home-search-form" class="web-home-search" autocomplete="off">
        <input id="wb-home-search-input" type="text" placeholder="Search with Yandex or type a URL" spellcheck="false" autocomplete="off" autocapitalize="off" />
        <button type="submit" class="nav-btn web-home-search-btn" aria-label="Search">
          <svg viewBox="0 0 16 16" width="15" height="15"><path d="M6.9 1.8a5.1 5.1 0 1 0 3.1 9.2l2.8 2.8a.7.7 0 0 0 1-1l-2.8-2.8a5.1 5.1 0 0 0-4.1-8.2zm0 1.4a3.7 3.7 0 1 1 0 7.4 3.7 3.7 0 0 1 0-7.4z" fill="currentColor"/></svg>
        </button>
      </form>
    </div>

    <!-- Continue Browsing shelf (open tabs as tile cards) -->
    <div class="panel continuePanel">
      <div class="continueHead">
        <div class="continueTitle">Continue Browsing...</div>
      </div>
      <div id="webContinuePanel" class="continueRow continueYacRow hidden"></div>
      <div id="webContinueEmpty" class="muted tiny continueEmpty">No open tabs.</div>
    </div>

    <!-- Quick Access grid (sources as cards) -->
    <div class="panel seriesPanel">
      <div class="panelTitleRow">
        <div class="panelTitle">Quick Access</div>
        <button id="wb-home-add-source" class="btn btn-ghost btn-sm" type="button">Add source...</button>
      </div>
      <div id="webSourcesGrid" class="seriesGrid"></div>
      <div id="webSourcesEmpty" class="muted tiny hidden">No sources yet. Add a source from the sidebar.</div>
    </div>

    <!-- Bookmarks grid (bookmarks as cards — NEW) -->
    <div class="panel seriesPanel">
      <div class="panelTitleRow">
        <div class="panelTitle">Bookmarks</div>
      </div>
      <div id="wb-home-bookmarks-grid" class="seriesGrid"></div>
      <div id="wb-home-bookmarks-empty" class="muted tiny hidden">No bookmarks yet.</div>
    </div>

    <!-- Downloads summary (existing) -->
    <div id="webHomeDownloadsPanel" class="panel webHomeDownloadsPanel">
      <div class="panelTitleRow">
        <div class="panelTitle">Downloads</div>
        <div class="panelActions">
          <button id="webHomeDownloadsClear" class="btn btn-ghost btn-sm">Clear</button>
        </div>
      </div>
      <div id="webHomeDownloadsList" class="webHomeDownloadsList"></div>
      <div id="webHomeDownloadsEmpty" class="muted tiny hidden">No downloads yet.</div>
    </div>
  </div>

  <!-- WEBVIEW VIEW: visible when a browser tab is active (NEW) -->
  <div id="wb-webview-view" class="hidden" style="display:flex;flex-direction:column;flex:1;min-height:0">

    <!-- Toolbar (simplified — no tab bar, no bookmark bar) -->
    <div id="wb-toolbar">
      <button id="wb-btn-home" class="nav-btn" title="Home">
        <svg width="16" height="16" viewBox="0 0 16 16"><path d="M2.5 8L8 2.5 13.5 8M4 7v6.5h3V10h2v3.5h3V7" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button id="wb-btn-back" class="nav-btn" title="Go back (Alt+Left)" disabled>
        <svg width="16" height="16" viewBox="0 0 16 16"><path d="M10.5 3L5.5 8l5 5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button id="wb-btn-forward" class="nav-btn" title="Go forward (Alt+Right)" disabled>
        <svg width="16" height="16" viewBox="0 0 16 16"><path d="M5.5 3L10.5 8l-5 5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button id="wb-btn-reload" class="nav-btn" title="Reload (Ctrl+R)">
        <svg id="wb-icon-reload" width="16" height="16" viewBox="0 0 16 16"><path d="M13.5 8a5.5 5.5 0 11-1.3-3.5M13.5 2v3h-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <svg id="wb-icon-stop" width="16" height="16" viewBox="0 0 16 16" style="display:none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
      </button>

      <!-- URL Bar (same structure as current, renamed IDs) -->
      <div id="wb-url-bar-wrapper">
        <span id="wb-omni-icon" class="web-omni-icon" aria-hidden="true"></span>
        <div class="web-omni-input-wrap">
          <input id="wb-url-bar" type="text" placeholder="Search or enter URL" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Address">
          <span id="wb-omni-ghost" class="web-omni-ghost" aria-hidden="true"></span>
        </div>
        <select id="wb-search-engine-select" class="web-search-engine-select" aria-label="Default search engine">
          <option value="yandex">Yandex</option>
          <option value="google">Google</option>
          <option value="duckduckgo">DuckDuckGo</option>
          <option value="bing">Bing</option>
          <option value="brave">Brave</option>
        </select>
        <div id="wb-omni-dropdown" style="display:none"></div>
      </div>

      <button id="wb-btn-bookmark" class="nav-btn" title="Bookmark this page (Ctrl+D)">
        <svg id="wb-icon-bookmark-outline" width="16" height="16" viewBox="0 0 16 16"><path d="M4 2.5h8v11L8 10.5 4 13.5z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/></svg>
        <svg id="wb-icon-bookmark-filled" width="16" height="16" viewBox="0 0 16 16" style="display:none"><path d="M4 2.5h8v11L8 10.5 4 13.5z" stroke="#8ab4f8" stroke-width="1.4" fill="#8ab4f8" stroke-linejoin="round"/></svg>
      </button>

      <button id="wb-btn-tor" class="nav-btn" title="Toggle Tor (Ctrl+Shift+T)">
        <svg id="wb-icon-tor" width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4" fill="none"/>
          <circle cx="8" cy="8" r="3.5" stroke="currentColor" stroke-width="1.2" fill="none"/>
          <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
        </svg>
        <span id="wb-tor-badge" class="tor-badge" style="display:none"></span>
      </button>

      <button id="wb-btn-menu" class="nav-btn" title="Menu">
        <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="3" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="13" r="1.2" fill="currentColor"/></svg>
      </button>
    </div>

    <!-- Loading bar -->
    <div id="wb-loading-bar"><div id="wb-loading-bar-fill"></div></div>

    <!-- Content area (webview + find bar + torrent) -->
    <div id="wb-content-area" style="flex:1;position:relative;min-height:0">
      <!-- Find bar (floating top-right over content) -->
      <div id="wb-find-bar" style="display:none">
        <input id="wb-find-input" type="text" placeholder="Find in page" spellcheck="false" autocomplete="off">
        <span id="wb-find-matches"></span>
        <button id="wb-find-prev" class="find-btn" title="Previous match (Shift+Enter)">
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 9l4-4 4 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button id="wb-find-next" class="find-btn" title="Next match (Enter)">
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button id="wb-find-close" class="find-btn" title="Close (Esc)">
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        </button>
      </div>

      <div id="wb-zoom-indicator" style="display:none">100%</div>

      <!-- Torrent manager (KEEP EXISTING HTML UNCHANGED — moved from webBrowserView) -->
      <div id="torrent-container" style="display:none">
        <!-- ... entire existing torrent-container HTML stays identical ... -->
      </div>

      <!-- Webview container: holds at most ONE <webview> at a time -->
      <div id="wb-webview-container"></div>
    </div>
  </div>
</div>
```

### 4C. Move overlays from `webBrowserView` into `webLibraryView`

Add these inside `webLibraryView` (after the `</div>` closing `.libraryShell`):

```html
  <!-- Three-dot menu panel (keep existing items, positioned relative to wb-btn-menu) -->
  <div id="wb-menu-panel" style="display:none">
    <!-- same menu items as current web-menu-panel -->
  </div>
  <div id="wb-menu-overlay" style="display:none"></div>
  <div id="wb-context-menu" style="display:none"></div>
```

### 4D. Delete `webBrowserView` entirely

Remove the entire `<div id="webBrowserView" class="webBrowserView hidden">` block (lines 1626-1933). All its functionality has been absorbed into the redesigned `webLibraryView`.

---

## 5. CSS Changes

### File: `src/styles/web-browser.css`

### 5A. New CSS to Add

```css
/* ── Design tokens (rescoped from .webBrowserView to #webLibraryView) ── */
#webLibraryView {
  --wb-bg: #202124;
  --wb-text: var(--ui-text, #e8eaed);
  --wb-muted: var(--ui-muted, #9aa0a6);
  --wb-surface: #292a2d;
  --wb-surface-raised: #35363a;
  --wb-border: #3c4043;
  --wb-border-subtle: rgba(255, 255, 255, 0.06);
  --wb-accent: var(--ui-accent, #8ab4f8);
  --wb-accent-dim: rgba(138, 180, 248, 0.25);
  --wb-hover: rgba(255, 255, 255, 0.08);
  --wb-active: rgba(255, 255, 255, 0.12);
  --wb-shadow: rgba(0, 0, 0, 0.4);
  --wb-success: #81c995;
  --wb-error: #f28b82;
  --wb-purple: #bb86fc;
  --wb-disabled: #5f6368;
}

/* ── Sidebar tab items ── */
#wb-sidebar-tabs-list .wb-tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  color: var(--wb-muted);
  transition: background .12s;
  position: relative;
  min-height: 28px;
}
#wb-sidebar-tabs-list .wb-tab-item:hover {
  background: var(--wb-hover);
}
#wb-sidebar-tabs-list .wb-tab-item.active {
  background: var(--wb-active);
  color: var(--wb-text);
}
.wb-tab-favicon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 2px;
  object-fit: contain;
}
.wb-tab-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wb-tab-close {
  opacity: 0;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--wb-muted);
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity .12s;
}
.wb-tab-item:hover .wb-tab-close {
  opacity: 1;
}
.wb-tab-close:hover {
  background: var(--wb-hover);
  color: var(--wb-error);
}

/* ── Sidebar bookmark items ── */
#wb-sidebar-bookmarks-list .wb-bm-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--wb-muted);
  transition: background .12s;
}
#wb-sidebar-bookmarks-list .wb-bm-item:hover {
  background: var(--wb-hover);
  color: var(--wb-text);
}
.wb-bm-favicon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border-radius: 2px;
}
.wb-bm-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Sidebar badges ── */
.wb-sidebar-badge {
  font-size: 10px;
  background: var(--wb-accent);
  color: #000;
  border-radius: 8px;
  padding: 1px 6px;
  margin-left: 4px;
  font-weight: 600;
}
.wb-sidebar-count {
  font-size: 10px;
  color: var(--wb-muted);
  margin-left: 4px;
}

/* ── Toolbar (inside libContent, only visible in webview view) ── */
#wb-toolbar {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 8px;
  background: var(--wb-surface-raised);
  border-bottom: 1px solid var(--wb-border-subtle);
  flex-shrink: 0;
  gap: 4px;
}

/* ── Webview view fills libContent ── */
#wb-webview-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
#wb-webview-view.hidden {
  display: none !important;
}

/* ── Single webview fills container ── */
#wb-webview-container {
  flex: 1;
  position: relative;
}
#wb-webview-container webview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* ── Loading bar ── */
#wb-loading-bar {
  height: 2px;
  background: transparent;
  overflow: hidden;
  flex-shrink: 0;
}
#wb-loading-bar-fill {
  height: 100%;
  width: 0;
  background: var(--wb-accent);
  transition: width 0.3s ease-out;
}
#wb-loading-bar.loading #wb-loading-bar-fill {
  animation: loading-indeterminate 1.5s ease-in-out infinite;
}

/* ── Home view search (adapted from web-home-*) ── */
.wb-home-shell {
  max-width: 720px;
  margin: 24px auto;
  padding: 0 20px;
}

/* ── Home bookmarks grid uses .seriesGrid pattern ── */
#wb-home-bookmarks-grid .seriesCard {
  cursor: pointer;
}
```

### 5B. CSS to Delete (after migration)

- `.webBrowserView` fixed overlay positioning (`position: fixed; inset: 0; z-index: 3000`)
- `body:has(.webBrowserView:not(.hidden)) .bgFx { display: none }` — no more hiding background
- `body:has(.webBrowserView:not(.hidden)) .topbar { display: none !important }` — app chrome stays visible
- `#web-tab-bar` and all tab strip styles (`.tab`, `.tab-favicon`, `.tab-title`, `.tab-close`, `.tab-spinner`)
- `#web-bookmark-bar` and bookmark bar styles (`.bookmark-bar-item`, overflow)
- Floating panel styles (`#web-downloads-panel`, `#web-history-panel`, `#web-bookmarks-panel` as position:fixed overlays)
- `.web-win-controls`, `#web-win-min`, `#web-win-max`, `#web-win-close`
- `.web-lib-btn` (Library back button)

### 5C. CSS to Keep (rename selectors)

- All `--wb-*` design tokens (rescoped)
- `#web-toolbar` → `#wb-toolbar`
- URL bar styles (adapt selectors)
- Find bar styles (rename to `#wb-find-bar`)
- Loading bar animation (`@keyframes loading-indeterminate`)
- Context menu styles
- Torrent container styles (all `#torrent-container`, `#tt-*`)
- `.nav-btn`, `.find-btn` base button styles
- Tor button states (`.tor-active`, `.tor-connecting`)
- Zoom indicator
- Toast notification

---

## 6. JavaScript Module Changes

### 6.1 `web_module_tabs_state.js` — MAJOR REWRITE (Single Webview Model)

This is the most structurally significant change.

#### Core Concept Change

Tab objects become pure metadata. No `.webview` property. No `.element` property (tab bar elements are gone — tabs live in the sidebar, rendered by the orchestrator).

```javascript
// NEW tab object shape:
var tab = {
  id: id,
  url: tabUrl,
  title: opts.titleOverride || siteNameFromUrl(tabUrl) || 'New Tab',
  favicon: '',          // stored from events or getFaviconUrl()
  sourceId: norm.id,
  sourceName: norm.name,
  sourceColor: norm.color,
  homeUrl: tabUrl,
  type: 'browser',      // or 'torrent'
  loading: false,
  // NO .webview property
  // NO .element property
};
```

#### Single Shared Webview

```javascript
var _activeWebview = null; // THE one webview, or null

function getActiveWebview() {
  return _activeWebview;
}

function destroyActiveWebview() {
  if (_activeWebview) {
    try { _activeWebview.remove(); } catch (e) {}
    _activeWebview = null;
  }
}

function createWebviewElement(url) {
  var wv = document.createElement('webview');
  wv.setAttribute('src', url);
  wv.setAttribute('partition', 'persist:webmode');
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('webpreferences', 'contextIsolation=yes');
  return wv;
}
```

#### `createTab(source, url, opts)` — Simplified

```javascript
function createTab(source, url, opts) {
  if (!opts) opts = {};
  var switchTo = opts.switchTo !== false;
  var norm = normalizeSourceInput(source, url);
  var tabUrl = String(url || norm.url || '').trim();
  var id = (opts.forcedId && opts.forcedId > 0) ? opts.forcedId : state.nextTabId++;
  if (id >= state.nextTabId) state.nextTabId = id + 1;

  // Handle magnet links (route to torrent)
  if (/^magnet:/i.test(tabUrl)) {
    bridge.emit('magnet:received', { url: tabUrl, source: norm });
    return null;
  }

  // Limit total tabs
  if (state.tabs.length >= MAX_TABS) {
    showToast('Tab limit reached (' + MAX_TABS + ')');
    return null;
  }

  // Create metadata-only tab object
  var tab = {
    id: id,
    url: tabUrl,
    title: opts.titleOverride || norm.name || siteNameFromUrl(tabUrl) || 'New Tab',
    favicon: '',
    sourceId: norm.id,
    sourceName: norm.name,
    sourceColor: norm.color,
    homeUrl: tabUrl,
    type: 'browser',
    loading: false,
  };

  // Set initial favicon from Google service
  var getFav = dep('getFaviconUrl');
  if (getFav && tabUrl) {
    tab.favicon = getFav(tabUrl);
  }

  state.tabs.push(tab);
  bridge.emit('tabs:changed');

  if (switchTo) switchTab(id);
  if (!opts.skipSessionSave) scheduleSessionSave();

  return tab;
}
```

#### `switchTab(id)` — Core Change

```javascript
function switchTab(id) {
  var tab = null;
  for (var i = 0; i < state.tabs.length; i++) {
    if (state.tabs[i].id === id) { tab = state.tabs[i]; break; }
  }
  if (!tab) return;

  // 1. Save current tab state from webview
  if (_activeWebview && state.activeTabId != null) {
    var prevTab = findTab(state.activeTabId);
    if (prevTab && prevTab.type !== 'torrent') {
      try {
        prevTab.url = _activeWebview.getURL();
        prevTab.title = _activeWebview.getTitle() || prevTab.title;
      } catch (e) {}
    }
  }

  // 2. Destroy current webview
  destroyActiveWebview();

  // 3. Set new active tab
  state.activeTabId = id;

  // 4. Handle torrent tab (special — no webview)
  if (tab.type === 'torrent') {
    bridge.emit('view:torrent');
    closeFind();
    bridge.emit('tab:switched', { tabId: id, tab: tab });
    bridge.emit('tabs:changed');
    scheduleSessionSave();
    return;
  }

  // 5. Create new webview for target tab
  if (tab.url && tab.url !== 'about:blank') {
    _activeWebview = createWebviewElement(tab.url);
    if (el.webviewContainer) el.webviewContainer.appendChild(_activeWebview);
    bindWebviewEvents(tab, _activeWebview);
    bindFindEvents(tab);
    bridge.emit('view:webview');
  } else {
    bridge.emit('view:home');
  }

  closeFind();
  bridge.emit('tab:switched', { tabId: id, tab: tab });
  bridge.emit('tabs:changed');
  scheduleSessionSave();
}
```

#### `closeTab(id)` — Simplified

```javascript
function closeTab(id) {
  var idx = -1;
  for (var i = 0; i < state.tabs.length; i++) {
    if (state.tabs[i].id === id) { idx = i; break; }
  }
  if (idx === -1) return;

  var tab = state.tabs[idx];
  var wasActive = (state.activeTabId === id);

  // Save to closed-tab history
  pushClosedTab(tab);

  // If active: destroy webview first
  if (wasActive) {
    destroyActiveWebview();
  }

  state.tabs.splice(idx, 1);

  // Switch to neighbour or show home
  if (wasActive) {
    if (state.tabs.length > 0) {
      var newIdx = Math.min(idx, state.tabs.length - 1);
      switchTab(state.tabs[newIdx].id);
    } else {
      state.activeTabId = null;
      bridge.emit('view:home');
    }
  }

  bridge.emit('tabs:changed');
  scheduleSessionSave();
}
```

#### `bindWebviewEvents(tab, wv)` — Parameterized

Takes both `tab` and `wv` as arguments (instead of `tab.webview`). Same events:

- `did-navigate` / `did-navigate-in-page` → update `tab.url`, emit `tab:navigated`
- `page-title-updated` → update `tab.title`, emit `tabs:changed`
- `page-favicon-updated` → update `tab.favicon`, emit `tabs:changed`
- `did-start-loading` → set `tab.loading = true`, show loading bar
- `did-stop-loading` → set `tab.loading = false`, hide loading bar, record history, Google favicon fallback
- `did-fail-load` → error toast
- `context-menu` → emit `contextMenu` event
- `new-window` → intercept, create new tab

#### Functions to Delete

- `ensureWebview()` — no longer needed (webview created in `switchTab`)
- `isWebviewDead()` — no stale webviews exist
- All tab-bar DOM element creation code (the `tabEl` construction)
- Tab drag-and-drop code (if any)
- The `deferWebview` option handling

#### Session Save/Restore

Stays almost identical. `snapshotTabForSession()` reads metadata fields which are now directly on the tab object. `loadSessionAndRestore()` creates metadata tabs and calls `switchTab()` for the active one.

---

### 6.2 `web.js` — Orchestrator Changes

#### `el` Cache Updates

**Add** (new IDs):
```javascript
// Sidebar
sidebarTabsList:     qs('wb-sidebar-tabs-list'),
sidebarNewTab:       qs('wb-sidebar-new-tab'),
sidebarBookmarksList: qs('wb-sidebar-bookmarks-list'),
sidebarTorrentBtn:   qs('wb-sidebar-torrent-btn'),
tabsCount:           qs('wb-tabs-count'),
downloadsBadge:      qs('wb-downloads-badge'),
torrentBadge:        qs('wb-torrent-badge'),

// Webview view
wbWebviewView:       qs('wb-webview-view'),
wbToolbar:           qs('wb-toolbar'),
wbContentArea:       qs('wb-content-area'),
webviewContainer:    qs('wb-webview-container'),

// Toolbar (renamed)
btnHome:             qs('wb-btn-home'),
btnBack:             qs('wb-btn-back'),
btnForward:          qs('wb-btn-forward'),
btnReload:           qs('wb-btn-reload'),
iconReload:          qs('wb-icon-reload'),
iconStop:            qs('wb-icon-stop'),
urlBar:              qs('wb-url-bar'),
omniIcon:            qs('wb-omni-icon'),
omniGhost:           qs('wb-omni-ghost'),
omniDropdown:        qs('wb-omni-dropdown'),
searchEngineSelect:  qs('wb-search-engine-select'),
btnBookmark:         qs('wb-btn-bookmark'),
iconBookmarkOutline: qs('wb-icon-bookmark-outline'),
iconBookmarkFilled:  qs('wb-icon-bookmark-filled'),
btnTor:              qs('wb-btn-tor'),
torBadge:            qs('wb-tor-badge'),
btnMenu:             qs('wb-btn-menu'),
loadingBar:          qs('wb-loading-bar'),
loadingBarFill:      qs('wb-loading-bar-fill'),

// Find bar (renamed)
findBar:             qs('wb-find-bar'),
findInput:           qs('wb-find-input'),
findMatches:         qs('wb-find-matches'),
findPrev:            qs('wb-find-prev'),
findNext:            qs('wb-find-next'),
findClose:           qs('wb-find-close'),
zoomIndicator:       qs('wb-zoom-indicator'),

// Home view (renamed)
homeSearchTitle:     qs('wb-home-search-title'),
homeSearchForm:      qs('wb-home-search-form'),
homeSearchInput:     qs('wb-home-search-input'),
homeBookmarksGrid:   qs('wb-home-bookmarks-grid'),
homeBookmarksEmpty:  qs('wb-home-bookmarks-empty'),

// Menu panel (renamed)
menuPanel:           qs('wb-menu-panel'),
menuOverlay:         qs('wb-menu-overlay'),
contextMenu:         qs('wb-context-menu'),
```

**Remove** (old IDs no longer in HTML):
```
tabBar, tabsContainer, btnNewTab, libraryBack, winMin, winMax, winClose,
bookmarkBar, bookmarkBarItems, bookmarkBarOverflow,
downloadsPanel, downloadsClose, historyPanel, historyClose, historySearch,
historyList, historyEmpty, historyClearAll, bookmarksPanel, bookmarksClose,
bookmarksSearch, bookmarksList, bookmarksEmpty
```

#### New View Switching

```javascript
// state.viewMode replaces state.browserOpen + state.homeVisible
state.viewMode = 'home'; // 'home' | 'webview' | 'torrent'

function showHomeView() {
  state.viewMode = 'home';
  if (el.webHomeView) el.webHomeView.classList.remove('hidden');
  if (el.wbWebviewView) el.wbWebviewView.classList.add('hidden');
  renderHomeView();
}

function showWebviewView() {
  state.viewMode = 'webview';
  if (el.webHomeView) el.webHomeView.classList.add('hidden');
  if (el.wbWebviewView) el.wbWebviewView.classList.remove('hidden');
  // Show webview container, hide torrent
  if (el.torrentContainer) el.torrentContainer.style.display = 'none';
  if (el.webviewContainer) el.webviewContainer.style.display = '';
  syncToolbarToActiveTab();
}

function showTorrentView() {
  state.viewMode = 'torrent';
  if (el.webHomeView) el.webHomeView.classList.add('hidden');
  if (el.wbWebviewView) el.wbWebviewView.classList.remove('hidden');
  // Show torrent, hide webview
  if (el.torrentContainer) el.torrentContainer.style.display = '';
  if (el.webviewContainer) el.webviewContainer.style.display = 'none';
}
```

#### New Sidebar Renderers

```javascript
function renderSidebarTabs() {
  if (!el.sidebarTabsList) return;
  el.sidebarTabsList.innerHTML = '';
  for (var i = 0; i < state.tabs.length; i++) {
    var tab = state.tabs[i];
    var item = document.createElement('div');
    item.className = 'wb-tab-item' + (tab.id === state.activeTabId ? ' active' : '');
    item.dataset.tabId = String(tab.id);

    var fav = document.createElement('img');
    fav.className = 'wb-tab-favicon';
    fav.width = 16; fav.height = 16;
    fav.src = tab.favicon || '';
    fav.onerror = function() { this.style.display = 'none'; };

    var title = document.createElement('span');
    title.className = 'wb-tab-title';
    title.textContent = tab.title || tab.url || 'New Tab';

    var close = document.createElement('button');
    close.className = 'wb-tab-close';
    close.title = 'Close tab';
    close.innerHTML = '&times;';

    item.appendChild(fav);
    item.appendChild(title);
    item.appendChild(close);
    el.sidebarTabsList.appendChild(item);
  }
  // Update count
  if (el.tabsCount) {
    el.tabsCount.textContent = state.tabs.length > 0 ? '(' + state.tabs.length + ')' : '';
  }
}

function renderSidebarBookmarks() {
  if (!el.sidebarBookmarksList) return;
  api.webBookmarks.list().then(function(res) {
    if (!res || !res.ok || !Array.isArray(res.bookmarks)) return;
    el.sidebarBookmarksList.innerHTML = '';
    var bookmarks = res.bookmarks.slice(0, 50); // limit sidebar to 50
    for (var i = 0; i < bookmarks.length; i++) {
      var bm = bookmarks[i];
      var item = document.createElement('div');
      item.className = 'wb-bm-item';
      item.dataset.bookmarkId = bm.id;
      item.dataset.url = bm.url;

      var fav = document.createElement('img');
      fav.className = 'wb-bm-favicon';
      fav.width = 14; fav.height = 14;
      fav.src = bm.favicon || getFaviconUrl(bm.url);
      fav.onerror = function() { this.style.display = 'none'; };

      var title = document.createElement('span');
      title.className = 'wb-bm-title';
      title.textContent = bm.title || bm.url;

      item.appendChild(fav);
      item.appendChild(title);
      el.sidebarBookmarksList.appendChild(item);
    }
  });
}

function renderHomeBookmarks() {
  if (!el.homeBookmarksGrid) return;
  api.webBookmarks.list().then(function(res) {
    if (!res || !res.ok || !Array.isArray(res.bookmarks)) return;
    el.homeBookmarksGrid.innerHTML = '';
    var bookmarks = res.bookmarks;
    if (el.homeBookmarksEmpty) {
      el.homeBookmarksEmpty.classList.toggle('hidden', bookmarks.length > 0);
    }
    for (var i = 0; i < bookmarks.length; i++) {
      var bm = bookmarks[i];
      var card = document.createElement('div');
      card.className = 'seriesCard';
      card.dataset.url = bm.url;
      card.dataset.bookmarkId = bm.id;

      var coverWrap = document.createElement('div');
      coverWrap.className = 'seriesCoverWrap';
      var thumbWrap = document.createElement('div');
      thumbWrap.className = 'thumbWrap';
      thumbWrap.style.display = 'flex';
      thumbWrap.style.alignItems = 'center';
      thumbWrap.style.justifyContent = 'center';
      var img = document.createElement('img');
      img.className = 'thumb';
      img.src = bm.favicon || getFaviconUrl(bm.url);
      img.style.width = '32px';
      img.style.height = '32px';
      img.style.objectFit = 'contain';
      thumbWrap.appendChild(img);
      coverWrap.appendChild(thumbWrap);

      var name = document.createElement('div');
      name.className = 'seriesName';
      name.textContent = bm.title || bm.url;

      card.appendChild(coverWrap);
      card.appendChild(name);
      el.homeBookmarksGrid.appendChild(card);
    }
  });
}
```

#### Event Wiring

```javascript
// Wire bridge events from tabs module
bridge.on('tabs:changed', renderSidebarTabs);
bridge.on('view:home', showHomeView);
bridge.on('view:webview', showWebviewView);
bridge.on('view:torrent', showTorrentView);

// Wire bookmark updates
if (api.webBookmarks && api.webBookmarks.onUpdated) {
  api.webBookmarks.onUpdated(function() {
    renderSidebarBookmarks();
    renderHomeBookmarks();
  });
}

// Sidebar click delegation
if (el.sidebarTabsList) {
  el.sidebarTabsList.addEventListener('click', function(e) {
    var close = e.target.closest('.wb-tab-close');
    var item = e.target.closest('.wb-tab-item');
    if (!item) return;
    var tabId = Number(item.dataset.tabId);
    if (close) {
      tabsState.closeTab(tabId);
    } else {
      tabsState.switchTab(tabId);
    }
  });
}

if (el.sidebarBookmarksList) {
  el.sidebarBookmarksList.addEventListener('click', function(e) {
    var item = e.target.closest('.wb-bm-item');
    if (!item) return;
    var url = item.dataset.url;
    if (url) tabsState.createTab(null, url);
  });
}

if (el.sidebarNewTab) {
  el.sidebarNewTab.addEventListener('click', function() { openNewTab(); });
}

if (el.sidebarTorrentBtn) {
  el.sidebarTorrentBtn.addEventListener('click', function() {
    if (tabsState.openTorrentTab) tabsState.openTorrentTab();
  });
}

// Home button returns to home view
if (el.btnHome) {
  el.btnHome.addEventListener('click', showHomeView);
}
```

#### Functions to Delete

- `openBrowser()` — replaced by `showHomeView()` / `showWebviewView()` (automatic from tab switching)
- `closeBrowser()` — no concept of "closing" the browser; mode switching handles it
- `openBrowserForTab()` — replaced by `tabsState.switchTab(id)`
- `_hideCurrentLibraryView()` / `_showCurrentLibraryView()` — mode router handles view visibility
- `renderBookmarkBar()` (from init sequence) — replaced by `renderSidebarBookmarks()`

#### Public API

```javascript
window.Tanko.web = {
  openDefault: function() {
    if (state.tabs.length && state.activeTabId != null) {
      tabsState.switchTab(state.activeTabId);
    } else {
      showHomeView();
    }
  },
  openHome: showHomeView,
  openTorrentWorkspace: function() {
    if (tabsState.openTorrentTab) tabsState.openTorrentTab();
  },
  isBrowserOpen: function() { return state.viewMode != null; },
  openAddSourceDialog: function() { openAddSourceDialog(null); },
};
```

---

### 6.3 `web_module_nav_omnibox.js` — Moderate Changes

- Rename all `el` references from `web-*` to `wb-*` IDs
- `navigateUrl()`: instead of `ensureBrowserSurface()`, emit `view:webview` via bridge
- All other logic (URL resolution, omnibox dropdown, ghost text, search engines) stays identical

---

### 6.4 `web_module_panels.js` — Heavy Strip-Down

**Delete:**
- `showHistoryPanel()`, `showBookmarksPanel()`, `showDownloadsPanel()` as floating overlays
- `loadHistoryPanel()` and history DOM rendering
- `loadBookmarksPanel()` and bookmarks DOM rendering
- `renderBookmarkBar()`, `checkBookmarkBarOverflow()`, `showBookmarkBarOverflowMenu()`, `dismissBookmarkBarOverflowMenu()`
- `showBookmarkBarCtxMenu()`
- `hideAllPanels()` — simplify to only close menu panel

**Keep:**
- `toggleBookmark()` — add/remove current page from bookmarks
- `updateBookmarkIcon()` — check if current URL is bookmarked, update star
- `setBookmarkIcon(filled)` — toggle star SVG (outline vs filled)
- `toggleTor()` — start/stop Tor proxy
- `updateTorUI()` — update Tor button state + badge
- `showMenuPanel()` — simplified, positioned relative to `wb-btn-menu`
- `initPanelEvents()` — simplified to wire menu + Tor + bookmark star only

---

### 6.5 `web_module_downloads.js` — Minor Changes

- Rename element IDs from `web-*` to `wb-*`
- Emit `downloads:changed` on download start/progress/complete so sidebar can update
- Remove floating panel rendering; downloads are shown in sidebar + home view

---

### 6.6 `web_module_find.js` — Minimal Changes

- Rename element IDs from `web-*` to `wb-*`
- `getActiveWebview()` → returns the single `_activeWebview` (correct)
- All logic stays identical

---

### 6.7 `web_module_hub.js` — Minor Changes

- Update dep references for renamed functions
- `updateBookmarkButton()` / `toggleBookmarkForActiveTab()` stay
- All data management (clear data, permissions, adblock, userscripts) stays

---

### 6.8 `web_module_torrent_tab.js` — No Changes

Container HTML stays identical. `initTorrentTab()` still references `el.torrentContainer`.

---

### 6.9 `web_module_standalone.js` — Minor Changes

- `openDefaultBrowserEntry()` → delegates to new `showHomeView()` / `switchTab()`
- `openTorrentWorkspace()` → opens torrent tab via same mechanism

---

### 6.10 `web_contract.js` — No Changes

---

## 7. Mode Router & Section Boot

### `src/state/mode_router.js`

Line 53-54 currently hides `webBrowserView` on mode switch:
```javascript
var webBrowserView = qs('webBrowserView');
if (webBrowserView) webBrowserView.classList.add('hidden');
```

**Change**: Remove this (the `webBrowserView` div no longer exists). The browser is now `webLibraryView` which is managed like other section views.

### `src/state/app_section_boot.js`

`openBrowserWorkspace()` calls `window.Tanko.web.openDefault()` — **no changes needed**. The new `openDefault()` shows the home view or switches to the active tab.

---

## 8. Session Save/Restore

### Save (no changes)

`buildSessionPayload()` iterates `state.tabs` and calls `snapshotTabForSession()`. Since tab objects now store `url`, `title`, `favicon`, `sourceId`, `sourceName` as metadata fields (same as before, just no longer needing to read from webview), the snapshot function works unchanged.

### Restore (simplified)

`loadSessionAndRestore()` creates tabs via `createTab(..., { switchTo: false })`. Then calls `switchTab()` for the previously active tab, which creates the one webview. No `deferWebview` option needed — all tabs are metadata-only by default.

### Key Improvement

The old model created deferred webviews that would be activated on `switchTab`. The new model always creates fresh. This eliminates `isWebviewDead()` and all dead-webview problems entirely.

---

## 9. Torrent Tab Integration

The torrent tab is a special non-webview tab. In the new model:

1. The torrent "tab" is a metadata object with `type: 'torrent'`
2. When `switchTab()` is called with a torrent tab ID, it destroys any webview and emits `view:torrent`
3. `showTorrentView()` shows `#torrent-container`, hides `#wb-webview-container`
4. In the sidebar, torrent tab appears in TABS section (with a torrent icon)
5. The separate TORRENTS sidebar section has a button that creates/switches to the torrent tab
6. All torrent container HTML and JS stays unchanged

---

## 10. Implementation Order

### Step 1: HTML Foundation
1. Extend `webLibraryView` sidebar with Tabs, Bookmarks, Torrents sections
2. Add `wb-webview-view` to `libContent` (with toolbar, loading bar, content area)
3. Move torrent container, find bar, context menu into new structure
4. Add bookmarks grid to home view
5. Keep old `webBrowserView` temporarily (dead HTML during transition)

### Step 2: CSS
1. Add sidebar item styles, toolbar styles, webview container styles
2. Keep all old CSS rules (they'll stop matching after HTML removal)

### Step 3: Core Module Rewrite
1. Rewrite `web_module_tabs_state.js` for single-webview model
2. Update `web.js` orchestrator (el cache, view switching, sidebar rendering, event wiring)

### Step 4: Module Updates
1. Strip `web_module_panels.js`
2. Update `web_module_nav_omnibox.js` (ID renames + view integration)
3. Update `web_module_downloads.js` (ID renames)
4. Update `web_module_find.js` (ID renames)
5. Update `web_module_hub.js` (dep references)
6. Update `web_module_standalone.js` (adapter changes)

### Step 5: Integration
1. Update `mode_router.js` (remove webBrowserView reference)
2. Delete old `webBrowserView` HTML block
3. Delete dead CSS rules

### Step 6: Verify
1. Run smoke tests
2. Manual testing (see checklist below)

---

## 11. What Gets Deleted vs Adapted vs Kept

### Pure Deletions
- Entire `#webBrowserView` HTML block (lines 1626-1933 of index.html)
- Tab bar CSS (`#web-tab-bar`, `.tab`, `.tab-favicon`, `.tab-title`, `.tab-close`)
- Bookmark bar CSS (`#web-bookmark-bar`, `.bookmark-bar-item`)
- Floating panel CSS (`#web-downloads-panel`, `#web-history-panel`, `#web-bookmarks-panel`)
- `body:has(.webBrowserView:not(.hidden))` CSS rules
- Window controls in browser (`.web-win-controls`)
- `ensureWebview()`, `isWebviewDead()`, `deferWebview` logic
- Tab bar DOM element creation code
- Floating panel rendering code (history, bookmarks, downloads panels)
- `renderBookmarkBar()`, `checkBookmarkBarOverflow()`

### Needs Adaptation
- `web_module_tabs_state.js` — single webview model (heavy rewrite)
- `web.js` — sidebar rendering, view switching (heavy rewrite)
- `web_module_panels.js` — strip floating panels, keep star/tor (heavy)
- `web_module_nav_omnibox.js` — ID renames + view integration (moderate)
- `web_module_downloads.js` — ID renames + sidebar events (minor)
- `web_module_find.js` — ID renames (minor)
- `web_module_hub.js` — dep updates (minor)
- `web_module_standalone.js` — adapter changes (minor)
- `mode_router.js` — remove webBrowserView ref (trivial)
- `web-browser.css` — rescope tokens, add sidebar styles (moderate)

### Stays Unchanged
- All main process backends (`main/domains/web*`)
- `preload/namespaces/web.js`
- `shared/ipc.js` contracts
- `web_contract.js`
- `web_module_torrent_tab.js` (container HTML + JS)
- `web_module_context_menu.js` (mostly)
- Torrent container HTML and CSS
- Bridge + module factory pattern
- Session save/restore data format

---

## 12. Verification Checklist

### Smoke Tests
- [ ] `npm run smoke` passes (no new failures)
- [ ] `npm run start:browser` launches

### Home View
- [ ] Search bar renders centered with correct search engine label
- [ ] Quick Access grid shows source cards with favicons
- [ ] Bookmarks grid shows bookmark cards with favicons
- [ ] Downloads section shows download history
- [ ] Empty states display when no data

### Sidebar
- [ ] Tabs section shows open tabs with favicon + title
- [ ] Active tab highlighted
- [ ] Close button appears on hover, closes tab
- [ ] "New tab" button creates a tab
- [ ] Sources section shows web sources
- [ ] Bookmarks section shows bookmarks (max 50)
- [ ] Clicking bookmark opens in new tab
- [ ] Downloads section shows active downloads
- [ ] Torrents button opens torrent tab

### Single Webview
- [ ] Click source card → webview loads, toolbar appears
- [ ] Click different sidebar tab → old webview destroyed, new created with target URL
- [ ] No dead/unresponsive webviews under any circumstance
- [ ] URL bar updates on navigation
- [ ] Back/forward buttons work
- [ ] Reload button works (toggles stop during load)
- [ ] Loading bar animates during load

### Tab Management
- [ ] Ctrl+T creates new tab
- [ ] Ctrl+W closes active tab, switches to neighbor
- [ ] Closing last tab returns to home view
- [ ] Tab count updates in sidebar header
- [ ] Ctrl+L focuses URL bar

### Session Restore
- [ ] Close app with 3 tabs open → reopen → tabs appear in sidebar
- [ ] Click a restored tab → webview loads its URL
- [ ] Active tab from previous session is highlighted

### Torrent Tab
- [ ] Torrent button in sidebar opens torrent manager
- [ ] Torrent tab appears in tabs list
- [ ] Torrent UI renders fully (table, toolbar, properties)
- [ ] Switching away from torrent → back to torrent works

### Bookmarks & Favicons
- [ ] Bookmark star toggles correctly (Ctrl+D)
- [ ] Bookmarks persist across sessions
- [ ] Bookmarks appear in sidebar + home grid
- [ ] Favicons use Google favicon service, display correctly
- [ ] `onUpdated` listener refreshes sidebar + home when bookmarks change

### Find in Page
- [ ] Ctrl+F opens find bar
- [ ] Search finds text, highlights matches
- [ ] Prev/Next navigation works
- [ ] Esc closes find bar

### Other
- [ ] Context menu works on webview (right-click)
- [ ] Mode switching (comics → browser → comics) works cleanly
- [ ] App chrome (topbar) stays visible (not hidden)
- [ ] Tor toggle works
- [ ] Menu (three-dot) button shows panel
