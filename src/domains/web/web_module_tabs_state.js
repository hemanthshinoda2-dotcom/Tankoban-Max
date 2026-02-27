(function registerTabsStateModule() {
  'use strict';
  window.__tankoWebModules = window.__tankoWebModules || {};
  window.__tankoWebModules.tabsState = function initTabsStateModule(bridge) {
    var state = bridge.state;
    var el = bridge.el;
    var api = bridge.api;

    // Cross-module deps (wired by orchestrator after all modules init)
    function dep(name) { return (bridge.deps || {})[name]; }
    var closeFind = function () { var fn = dep('closeFind'); return fn && fn.apply(null, arguments); };
    var bindFindEvents = function () { var fn = dep('bindFindEvents'); return fn && fn.apply(null, arguments); };
    var updateBookmarkIcon = function () { var fn = dep('updateBookmarkIcon'); return fn && fn.apply(null, arguments); };
    var showToast = function () { var fn = dep('showToast'); return fn && fn.apply(null, arguments); };

    var MAX_TABS = 50;
    var MAX_CLOSED_TABS = 25;
    var loadingBarTimer = null;

    // ── Per-tab listener tracking (prevents memory leaks on tab close) ──

    function addTabListener(tab, element, event, handler, opts) {
      if (!tab._listeners) tab._listeners = [];
      element.addEventListener(event, handler, opts || false);
      tab._listeners.push({ el: element, ev: event, fn: handler, opts: opts || false });
    }

    function cleanupTabListeners(tab) {
      if (!tab._listeners) return;
      for (var i = 0; i < tab._listeners.length; i++) {
        var entry = tab._listeners[i];
        try { entry.el.removeEventListener(entry.ev, entry.fn, entry.opts); } catch (e) {}
      }
      tab._listeners = null;
    }

    // ── Utilities ──

    function escapeHtml(str) {
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function siteNameFromUrl(url) {
      try {
        var host = new URL(String(url || '')).hostname;
        return host.replace(/^www\./, '');
      } catch (e) { return ''; }
    }

    function isWebviewDead(wv) {
      if (!wv) return true;
      if (!wv.isConnected) return true;
      try { var id = wv.getWebContentsId(); return !id; } catch (e) { return true; }
    }

    // ── Tab state queries ──

    function getActiveTab() {
      if (state.activeTabId == null) return null;
      for (var i = 0; i < state.tabs.length; i++) {
        if (state.tabs[i].id === state.activeTabId) return state.tabs[i];
      }
      return null;
    }

    function getActiveWebview() {
      var tab = getActiveTab();
      return (tab && tab.webview) ? tab.webview : null;
    }

    // ── Tab creation ──

    function createTab(source, url, opts) {
      if (!opts) opts = {};
      var switchTo = opts.switchTo !== false;

      var norm = normalizeSourceInput(source, url);
      var tabUrl = String(url || norm.url || '').trim();
      var id = (opts.forcedId && opts.forcedId > 0) ? opts.forcedId : state.nextTabId++;
      if (id >= state.nextTabId) state.nextTabId = id + 1;

      if (state.tabs.length >= MAX_TABS) {
        showToast('Tab limit reached (' + MAX_TABS + ')');
        return null;
      }

      // Create <webview> element (skip for blank/home tabs and deferred tabs)
      var wv = null;
      if (tabUrl && tabUrl !== 'about:blank' && !opts.deferWebview) {
        wv = document.createElement('webview');
        wv.setAttribute('src', tabUrl);
        wv.setAttribute('partition', 'persist:webmode');
        wv.setAttribute('allowpopups', '');
        wv.setAttribute('webpreferences', 'contextIsolation=yes');
        if (el.webviewContainer) el.webviewContainer.appendChild(wv);
      }

      // Create tab bar element
      var tabEl = document.createElement('div');
      tabEl.className = 'tab';
      tabEl.dataset.tabId = id;
      tabEl.innerHTML =
        '<div class="tab-spinner"></div>' +
        '<img class="tab-favicon" style="display:none">' +
        '<span class="tab-title">' + escapeHtml(opts.titleOverride || norm.name || 'New Tab') + '</span>' +
        '<button class="tab-close" title="Close tab (Ctrl+W)">' +
          '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' +
        '</button>';
      if (el.tabsContainer && el.btnNewTab) {
        el.tabsContainer.insertBefore(tabEl, el.btnNewTab);
      } else if (el.tabsContainer) {
        el.tabsContainer.appendChild(tabEl);
      }

      // Tab data object
      var tab = {
        id: id,
        webview: wv,
        element: tabEl,
        title: opts.titleOverride || norm.name || 'New Tab',
        favicon: '',
        url: tabUrl,
        homeUrl: norm.url || tabUrl,
        sourceId: norm.id || '',
        sourceName: norm.name || '',
        sourceColor: norm.color || '#555',
        pinned: false,
        loading: false,
        type: 'browser'
      };
      state.tabs.push(tab);

      // Set initial favicon for deferred tabs (session restore)
      if (opts.deferWebview && tabUrl) {
        var initFav = dep('getFaviconUrl');
        if (initFav) {
          tab.favicon = initFav(tabUrl);
          var favImg = tabEl.querySelector('.tab-favicon');
          if (favImg && tab.favicon) { favImg.src = tab.favicon; favImg.style.display = ''; }
        }
      }

      // Tab element events (tracked for cleanup on tab close)
      addTabListener(tab, tabEl, 'click', function (e) {
        if (!e.target.closest('.tab-close')) switchTab(id);
      });
      addTabListener(tab, tabEl, 'mousedown', function (e) {
        if (e.button === 1) { e.preventDefault(); closeTab(id); }
      });
      addTabListener(tab, tabEl.querySelector('.tab-close'), 'click', function (e) {
        e.stopPropagation();
        closeTab(id);
      });

      // Show tab context menu on right click.  A separate context menu for tabs
      // brings our implementation closer to Chromium, which exposes actions like
      // Duplicate, Pin/Unpin, Mute/Unmute and tab closing shortcuts via the
      // tab strip context menu【335440645664631†L50-L63】【452477764220631†L82-L89】.  Use the
      // generic context menu module to render the menu and wire up actions via
      // ctxParams.onAction.  Each menu item calls into helper functions defined
      // below.
      addTabListener(tab, tabEl, 'contextmenu', function (e) {
        e.preventDefault();
        if (!dep('showContextMenu')) return;
        var tab = null;
        for (var i = 0; i < state.tabs.length; i++) {
          if (state.tabs[i].id === id) { tab = state.tabs[i]; break; }
        }
        if (!tab) return;
        // Build context menu items.  Order loosely follows Chrome’s tab context
        // menu: new tab, duplicate, pin/unpin, mute/unmute, close, close
        // others, close tabs to right, reopen closed tab, bookmark all tabs
        var items = [];
        // New tab
        items.push({ label: 'New tab', shortcut: 'Ctrl+T', action: 'newTab' });
        // Duplicate
        items.push({ label: 'Duplicate', shortcut: '', action: 'duplicate' });
        // Pin / Unpin
        if (tab.pinned) items.push({ label: 'Unpin tab', action: 'togglePin' });
        else items.push({ label: 'Pin tab', action: 'togglePin' });
        // Mute / Unmute
        // Only show if webview exists and supports audio controls.  Note: The
        // electron <webview> tag exposes setAudioMuted() and isAudioMuted() APIs.
        var canMute = tab.webview && typeof tab.webview.isAudioMuted === 'function' && typeof tab.webview.setAudioMuted === 'function';
        if (canMute) {
          try {
            var muted = tab.webview.isAudioMuted();
            items.push({ label: muted ? 'Unmute site' : 'Mute site', action: 'toggleMute' });
          } catch (e) {}
        }
        // Separator
        items.push({ separator: true });
        // Close
        items.push({ label: 'Close tab', shortcut: 'Ctrl+W', action: 'close' });
        // Close other tabs
        if (state.tabs.length > 1) items.push({ label: 'Close other tabs', action: 'closeOthers' });
        // Close tabs to the right
        if (state.tabs.length > 1) items.push({ label: 'Close tabs to the right', action: 'closeRight' });
        // Separator
        items.push({ separator: true });
        // Reopen closed tab (Ctrl+Shift+Z currently bound in web.js).  Many
        // Chromium-based browsers surface this action in the tab context menu and
        // via Ctrl+Shift+T【752243596706853†L80-L96】.
        items.push({ label: 'Reopen closed tab', action: 'reopenClosed' });
        // Bookmark all tabs
        items.push({ label: 'Bookmark all tabs', action: 'bookmarkAll' });

        // Render the context menu using the generic module.  Provide onAction
        // callback to dispatch our tab-specific actions.
        dep('showContextMenu')({
          items: items,
          x: e.clientX,
          y: e.clientY,
          onAction: function (act) {
            switch (act) {
              case 'newTab':
                createTab(null, '', { switchTo: true });
                break;
              case 'duplicate':
                // Duplicate the tab by creating a new tab with the same URL.
                var dupUrl = String(tab.url || '');
                createTab(null, dupUrl, { switchTo: true });
                break;
              case 'togglePin':
                togglePin(tab);
                break;
              case 'toggleMute':
                toggleMute(tab);
                break;
              case 'close':
                closeTab(tab.id);
                break;
              case 'closeOthers':
                closeOtherTabs(tab.id);
                break;
              case 'closeRight':
                closeTabsToRight(tab.id);
                break;
              case 'reopenClosed':
                if (reopenClosedTab) reopenClosedTab();
                break;
              case 'bookmarkAll':
                bookmarkAllTabs();
                break;
            }
          }
        });
      });

      // Bind webview events
      if (wv) {
        bindWebviewEvents(tab);
        bindFindEvents(tab);
      }

      // Switch to new tab
      if (switchTo) {
        switchTab(id);
        if (!tabUrl || tabUrl === 'about:blank') {
          setTimeout(function () { if (el.urlBar) el.urlBar.focus(); }, 50);
        }
      }

      if (!opts.skipSessionSave) scheduleSessionSave();
      if (!opts.silentToast && opts.toastText) showToast(opts.toastText);

      return tab;
    }

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

      // Clean up tracked event listeners before removing DOM elements
      cleanupTabListeners(tab);

      // Remove DOM elements
      if (tab.element) tab.element.remove();
      if (tab.webview) tab.webview.remove();
      if (tab.type === 'torrent') {
        // When closing the torrent tab, hide its container and destroy any
        // background timers/intervals associated with the torrent UI. The
        // torrentTab module exposes a destroy() method which clears its
        // DHT polling interval and resets internal state. Without calling
        // destroy(), closing the torrent tab leaves the interval running
        // in the background, which leads to resource leaks and duplicate
        // polling when a new torrent tab is opened later.
        if (el.torrentContainer) {
          el.torrentContainer.style.display = 'none';
        }
        var destroyTT = (typeof dep === 'function') ? dep('destroyTorrentTab') : null;
        if (typeof destroyTT === 'function') {
          try { destroyTT(); } catch (e) { /* ignore */ }
        }
      }
      state.tabs.splice(idx, 1);

      // Switch to neighbour or create new blank tab
      if (wasActive) {
        if (state.tabs.length > 0) {
          var newIdx = Math.min(idx, state.tabs.length - 1);
          switchTab(state.tabs[newIdx].id);
        } else {
          state.activeTabId = null;
          createTab(null, '', { switchTo: true });
        }
      }

      scheduleSessionSave();
    }

    function switchTab(id) {
      var tab = null;
      for (var i = 0; i < state.tabs.length; i++) {
        if (state.tabs[i].id === id) { tab = state.tabs[i]; break; }
      }
      if (!tab) return;

      // Revive dead or deferred webviews
      if (tab.url && tab.url !== 'about:blank' && tab.type !== 'torrent') {
        if (!tab.webview) {
          ensureWebview(tab, tab.url);
        } else if (isWebviewDead(tab.webview)) {
          cleanupTabListeners(tab);
          tab.webview.remove();
          tab.webview = null;
          ensureWebview(tab, tab.url);
        }
      }

      state.activeTabId = id;

      // Update tab bar + webview visibility
      for (var j = 0; j < state.tabs.length; j++) {
        var t = state.tabs[j];
        var isActive = t.id === id;
        if (t.element) t.element.classList.toggle('active', isActive);
        if (t.webview) t.webview.classList.toggle('active', isActive);
      }

      // Show/hide torrent container
      if (el.torrentContainer) {
        el.torrentContainer.style.display = (tab.type === 'torrent') ? '' : 'none';
      }

      // Close find bar on tab switch
      closeFind();

      // Sync toolbar to active tab
      if (tab.type === 'torrent') {
        if (el.urlBar) el.urlBar.value = 'tanko://torrents';
        setLoadingUI(false);
        if (el.btnBack) el.btnBack.disabled = true;
        if (el.btnForward) el.btnForward.disabled = true;
      } else if (tab.webview) {
        try {
          if (el.urlBar) el.urlBar.value = tab.webview.getURL() || tab.url || '';
        } catch (e) {
          if (el.urlBar) el.urlBar.value = tab.url || '';
        }
        syncLoadingState(tab);
        updateNavButtons();
      } else {
        // Home page (no webview)
        if (el.urlBar) el.urlBar.value = '';
        setLoadingUI(false);
        updateNavButtons();
      }

      updateBookmarkIcon();
      bridge.emit('tab:switched', { tabId: id, tab: tab });
    }

    function cycleTab(direction) {
      if (state.tabs.length < 2) return;
      var idx = -1;
      for (var i = 0; i < state.tabs.length; i++) {
        if (state.tabs[i].id === state.activeTabId) { idx = i; break; }
      }
      if (idx === -1) return;
      var next = (idx + direction + state.tabs.length) % state.tabs.length;
      switchTab(state.tabs[next].id);
    }

    // ── Webview event binding (per-tab) ──

    function bindWebviewEvents(tab) {
      var wv = tab.webview;
      if (!wv) return;

      function eventUrl(e) {
        if (!e) return '';
        if (typeof e.url === 'string' && e.url) return e.url;
        if (typeof e.targetUrl === 'string' && e.targetUrl) return e.targetUrl;
        if (e.detail && typeof e.detail.url === 'string' && e.detail.url) return e.detail.url;
        return '';
      }

      function handleMagnetUrl(raw) {
        var u = String(raw || '').trim();
        if (!u || u.toLowerCase().indexOf('magnet:') !== 0) return false;
        bridge.emit('openMagnet', u);
        return true;
      }

      addTabListener(tab, wv, 'did-navigate', function (e) {
        if (handleMagnetUrl(eventUrl(e))) return;
        tab.url = e.url;
        if (tab.id === state.activeTabId) {
          if (el.urlBar) el.urlBar.value = e.url;
          updateNavButtons();
          updateBookmarkIcon();
        }
        scheduleSessionSave();
      });

      addTabListener(tab, wv, 'did-navigate-in-page', function (e) {
        if (handleMagnetUrl(eventUrl(e))) return;
        if (e.isMainFrame) {
          tab.url = e.url;
          if (tab.id === state.activeTabId) {
            if (el.urlBar) el.urlBar.value = e.url;
            updateNavButtons();
            updateBookmarkIcon();
          }
        }
      });

      addTabListener(tab, wv, 'page-title-updated', function (e) {
        tab.title = e.title;
        var titleSpan = tab.element ? tab.element.querySelector('.tab-title') : null;
        if (titleSpan) titleSpan.textContent = e.title;
      });

      addTabListener(tab, wv, 'page-favicon-updated', function (e) {
        if (e.favicons && e.favicons.length > 0) {
          tab.favicon = e.favicons[0];
          if (tab.element) {
            var img = tab.element.querySelector('.tab-favicon');
            if (img) { img.src = e.favicons[0]; img.style.display = ''; }
            var spinner = tab.element.querySelector('.tab-spinner');
            if (spinner) spinner.style.display = 'none';
          }
        }
      });

      addTabListener(tab, wv, 'did-start-loading', function () {
        tab.loading = true;
        if (tab.id === state.activeTabId) {
          setLoadingUI(true);
          showLoadingBar();
        }
        if (tab.element) {
          var spinner = tab.element.querySelector('.tab-spinner');
          var img = tab.element.querySelector('.tab-favicon');
          if (spinner) spinner.style.display = '';
          tab.favicon = '';
          if (img) { img.style.display = 'none'; img.src = ''; }
        }
      });

      addTabListener(tab, wv, 'did-stop-loading', function () {
        tab.loading = false;
        if (tab.id === state.activeTabId) {
          setLoadingUI(false);
          hideLoadingBar();
          updateNavButtons();
        }
        if (tab.element) {
          var spinner = tab.element.querySelector('.tab-spinner');
          if (spinner) spinner.style.display = 'none';
        }
        // Favicon fallback: if page-favicon-updated never fired, use Google favicon service
        if (!tab.favicon) {
          try {
            var gfav = dep('getFaviconUrl');
            var faviconUrl = gfav ? gfav(wv.getURL()) : '';
            if (faviconUrl) {
              tab.favicon = faviconUrl;
              if (tab.element) {
                var favImg = tab.element.querySelector('.tab-favicon');
                if (favImg) { favImg.src = faviconUrl; favImg.style.display = ''; }
              }
            }
          } catch (e) {}
        }
        // Record to browsing history
        try {
          var url = wv.getURL();
          tab.url = url;
          if (url && url !== 'about:blank' && !/^(data|chrome|devtools):/i.test(url)) {
            api.webHistory.add({
              url: url,
              title: tab.title || url,
              favicon: tab.favicon || '',
              timestamp: Date.now()
            });
            bridge.emit('history:updated');
          }
        } catch (e) { /* webview not ready */ }
        scheduleSessionSave();
      });

      addTabListener(tab, wv, 'did-fail-load', function (e) {
        if (e.errorCode === -3) return; // aborted — normal for redirects
        var classified = classifyLoadFailure(e.errorCode, e.errorDescription, e.validatedURL);
        if (classified.toast) showToast(classified.toast);
        bridge.emit('tab:loadFailed', { tabId: tab.id, error: classified });
      });

      addTabListener(tab, wv, 'will-navigate', function (e) {
        if (handleMagnetUrl(eventUrl(e))) {
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
        }
      });

      // Handle new window requests (target=_blank, window.open, etc.)
      addTabListener(tab, wv, 'new-window', function (e) {
        e.preventDefault();
        var nextUrl = String(eventUrl(e)).trim();
        if (handleMagnetUrl(nextUrl)) return;
        // In integrated mode, main-process setWindowOpenHandler is the source of truth
        // for popup->tab routing to avoid duplicate tab creation paths.
      });

      addTabListener(tab, wv, 'context-menu', function (e) {
        var payload = (e && e.params && typeof e.params === 'object')
          ? e.params
          : (e && typeof e === 'object' ? e : {});
        bridge.emit('contextMenu', payload);
      });
    }

    // ── Loading state UI ──

    function setLoadingUI(loading) {
      if (el.iconReload) el.iconReload.style.display = loading ? 'none' : '';
      if (el.iconStop) el.iconStop.style.display = loading ? '' : 'none';
      if (el.btnReload) el.btnReload.title = loading ? 'Stop loading (Esc)' : 'Reload (Ctrl+R)';
    }

    function showLoadingBar() {
      clearTimeout(loadingBarTimer);
      if (el.loadingBar) el.loadingBar.className = 'loading';
    }

    function hideLoadingBar() {
      if (el.loadingBar) el.loadingBar.className = 'done';
      clearTimeout(loadingBarTimer);
      loadingBarTimer = setTimeout(function () {
        if (el.loadingBar) el.loadingBar.className = '';
        if (el.loadingBarFill) el.loadingBarFill.style.width = '';
      }, 300);
    }

    function syncLoadingState(tab) {
      if (!tab || !tab.webview) { setLoadingUI(false); return; }
      var loading = false;
      try { loading = tab.webview.isLoading(); } catch (e) {}
      setLoadingUI(loading);
      if (loading) showLoadingBar();
      else if (el.loadingBar) el.loadingBar.className = '';
    }

    // ── Navigation ──

    function updateNavButtons() {
      var wv = getActiveWebview();
      try {
        if (el.btnBack) el.btnBack.disabled = !(wv && wv.canGoBack());
        if (el.btnForward) el.btnForward.disabled = !(wv && wv.canGoForward());
      } catch (e) {
        if (el.btnBack) el.btnBack.disabled = true;
        if (el.btnForward) el.btnForward.disabled = true;
      }
    }

    // ── Zoom ──

    function zoomIn() {
      state.zoomLevel = Math.min((state.zoomLevel || 0) + 1, 5);
      applyZoom();
    }

    function zoomOut() {
      state.zoomLevel = Math.max((state.zoomLevel || 0) - 1, -5);
      applyZoom();
    }

    function zoomReset() {
      state.zoomLevel = 0;
      applyZoom();
    }

    function applyZoom() {
      var wv = getActiveWebview();
      if (wv) wv.setZoomLevel(state.zoomLevel || 0);
      showZoomIndicator();
    }

    function showZoomIndicator() {
      if (!el.zoomIndicator) return;
      var pct = Math.round(Math.pow(1.2, state.zoomLevel || 0) * 100);
      el.zoomIndicator.textContent = pct + '%';
      el.zoomIndicator.style.display = '';
      el.zoomIndicator.style.opacity = '1';
      clearTimeout(state.zoomTimer);
      state.zoomTimer = setTimeout(function () {
        if (!el.zoomIndicator) return;
        el.zoomIndicator.style.opacity = '0';
        setTimeout(function () {
          if (el.zoomIndicator) el.zoomIndicator.style.display = 'none';
        }, 200);
      }, 1500);
    }

    // ── DevTools ──

    function toggleDevTools() {
      var wv = getActiveWebview();
      if (!wv) return;
      try {
        var wcId = wv.getWebContentsId();
        api.webBrowserActions.ctxAction({ webContentsId: wcId, action: 'devtools' });
      } catch (e) {}
    }

    // ── Torrent tab (singleton) ──

    function openTorrentTab(source) {
      for (var i = 0; i < state.tabs.length; i++) {
        if (state.tabs[i].type === 'torrent') {
          switchTab(state.tabs[i].id);
          if (source && typeof window.torrentTabAddSource === 'function') {
            window.torrentTabAddSource(source);
          }
          return state.tabs[i];
        }
      }

      var id = state.nextTabId++;

      var tabEl = document.createElement('div');
      tabEl.className = 'tab';
      tabEl.dataset.tabId = id;
      tabEl.innerHTML =
        '<svg class="tab-favicon" width="16" height="16" viewBox="0 0 16 16" style="flex-shrink:0">' +
          '<path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 5v4M6.5 7.5L8 9l1.5-1.5" ' +
          'stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>' +
        '<span class="tab-title">Tankoban Torrent</span>' +
        '<button class="tab-close" title="Close tab (Ctrl+W)">' +
          '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' +
        '</button>';
      if (el.tabsContainer && el.btnNewTab) {
        el.tabsContainer.insertBefore(tabEl, el.btnNewTab);
      } else if (el.tabsContainer) {
        el.tabsContainer.appendChild(tabEl);
      }

      var tab = {
        id: id,
        webview: null,
        element: tabEl,
        title: 'Tankoban Torrent',
        favicon: '',
        url: '',
        homeUrl: '',
        sourceId: '',
        sourceName: 'Torrent',
        sourceColor: '#555',
        pinned: false,
        loading: false,
        type: 'torrent'
      };
      state.tabs.push(tab);

      addTabListener(tab, tabEl, 'click', function (e) {
        if (!e.target.closest('.tab-close')) switchTab(id);
      });
      addTabListener(tab, tabEl, 'mousedown', function (e) {
        if (e.button === 1) { e.preventDefault(); closeTab(id); }
      });
      addTabListener(tab, tabEl.querySelector('.tab-close'), 'click', function (e) {
        e.stopPropagation();
        closeTab(id);
      });

      switchTab(id);

      if (typeof window.initTorrentTab === 'function') window.initTorrentTab();
      if (source && typeof window.torrentTabAddSource === 'function') {
        window.torrentTabAddSource(source);
      }

      return tab;
    }

    // ── Lazy webview creation (for home-page tabs that navigate) ──

    function ensureWebview(tab, url) {
      if (!tab || tab.webview) return tab ? tab.webview : null;
      if (tab.type === 'torrent') return null;

      var u = String(url || tab.url || tab.homeUrl || '').trim();
      if (!u || u === 'about:blank') return null;

      var wv = document.createElement('webview');
      wv.setAttribute('src', u);
      wv.setAttribute('partition', 'persist:webmode');
      wv.setAttribute('allowpopups', '');
      wv.setAttribute('webpreferences', 'contextIsolation=yes');
      if (el.webviewContainer) el.webviewContainer.appendChild(wv);

      tab.webview = wv;
      tab.url = u;
      if (tab.id === state.activeTabId) wv.classList.add('active');

      bindWebviewEvents(tab);
      bindFindEvents(tab);

      return wv;
    }

    // ── Source normalization ──

    function normalizeSourceInput(source, urlOverride) {
      if (source && typeof source === 'object') {
        var objUrl = String(source.url || urlOverride || '').trim();
        return {
          id: source.id != null ? source.id : ('src_' + Date.now()),
          name: String(source.name || siteNameFromUrl(objUrl) || 'New Tab'),
          url: objUrl || String(urlOverride || '').trim(),
          color: String(source.color || '#555')
        };
      }
      var asUrl = String(source || urlOverride || '').trim();
      return {
        id: 'src_' + Date.now(),
        name: siteNameFromUrl(asUrl) || 'New Tab',
        url: asUrl,
        color: '#555'
      };
    }

    // ── Security classification ──

    function inferSecurityStateFromUrl(url) {
      var raw = String(url || '').trim();
      if (!raw) return 'unknown';
      if (raw.indexOf('https://') === 0) return 'secure';
      if (raw.indexOf('http://') === 0) return 'insecure';
      if (/^(file|about|chrome|data):/i.test(raw)) return 'internal';
      return 'unknown';
    }

    function classifyLoadFailure(errorCode, errorDescription, failedUrl) {
      var code = Number(errorCode || 0);
      var desc = String(errorDescription || '').trim();
      var lower = desc.toLowerCase();
      var host = '';
      try { host = new URL(String(failedUrl || '')).hostname; } catch (e) {}

      var out = { kind: 'load_failed', isBlocked: false, title: '', toast: '' };

      if (code === -20 || code === -21 || lower.indexOf('blocked') !== -1) {
        out.kind = 'blocked'; out.isBlocked = true;
      } else if (code === -105 || code === -137 || code === -300 ||
                 lower.indexOf('name not resolved') !== -1 || lower.indexOf('dns') !== -1) {
        out.kind = 'dns';
      } else if (code <= -200 && code >= -299) {
        out.kind = 'tls';
      } else if (code === -118 || code === -7 || lower.indexOf('timed out') !== -1) {
        out.kind = 'timeout';
      } else if (code === -106 || lower.indexOf('internet disconnected') !== -1) {
        out.kind = 'offline';
      }

      var titles = {
        blocked: 'Blocked', dns: 'DNS error', tls: 'TLS error',
        timeout: 'Timed out', offline: 'Offline'
      };
      out.title = titles[out.kind] || 'Load failed';
      if (host) out.title += ' \u2014 ' + host;

      if (out.kind === 'blocked') out.toast = 'Blocked: ' + (host || 'site');
      else if (desc) out.toast = 'Load failed: ' + desc;
      else out.toast = out.title;

      return out;
    }

    // ── Session persistence ──

    function snapshotTabForSession(tab) {
      if (!tab) return null;
      if (tab.type === 'torrent') return null;
      var url = String(tab.url || '').trim();
      if (!url || url === 'about:blank') return null;
      return {
        id: String(tab.id || ''),
        sourceId: tab.sourceId != null ? String(tab.sourceId) : '',
        sourceName: String(tab.sourceName || '').trim(),
        title: String(tab.title || '').trim(),
        url: url,
        homeUrl: String(tab.homeUrl || url).trim() || url,
        pinned: !!tab.pinned
      };
    }

    function buildSessionPayload() {
      var snappedTabs = [];
      for (var i = 0; i < state.tabs.length; i++) {
        var snap = snapshotTabForSession(state.tabs[i]);
        if (snap) snappedTabs.push(snap);
        if (snappedTabs.length >= MAX_TABS) break;
      }
      var closedSnaps = [];
      for (var j = 0; j < state.closedTabs.length; j++) {
        var closed = snapshotTabForSession(state.closedTabs[j]);
        if (closed) closedSnaps.push(closed);
        if (closedSnaps.length >= MAX_CLOSED_TABS) break;
      }
      return {
        tabs: snappedTabs,
        activeTabId: state.activeTabId != null ? String(state.activeTabId) : '',
        closedTabs: closedSnaps,
        restoreLastSession: state.restoreLastSession !== false,
        updatedAt: Date.now()
      };
    }

    function scheduleSessionSave(immediate) {
      if (state.sessionRestoreInProgress) return;
      if (!api.webSession || typeof api.webSession.save !== 'function') return;
      var runSave = function () {
        state.sessionSaveTimer = null;
        api.webSession.save({ state: buildSessionPayload() }).catch(function () {});
      };
      if (immediate) {
        if (state.sessionSaveTimer) {
          try { clearTimeout(state.sessionSaveTimer); } catch (e) {}
          state.sessionSaveTimer = null;
        }
        runSave();
        return;
      }
      if (state.sessionSaveTimer) return;
      state.sessionSaveTimer = setTimeout(runSave, 260);
    }

    function pushClosedTab(tab) {
      var snap = snapshotTabForSession(tab);
      if (!snap) return;
      state.closedTabs.unshift(snap);
      if (state.closedTabs.length > MAX_CLOSED_TABS) state.closedTabs.length = MAX_CLOSED_TABS;
    }

    function reopenClosedTab() {
      if (!state.closedTabs.length) {
        showToast('No recently closed tab');
        return;
      }
      var snap = state.closedTabs.shift();
      if (!snap) return;
      var src = {
        id: snap.sourceId || ('restored_' + Date.now()),
        name: snap.sourceName || siteNameFromUrl(snap.url) || 'Tab',
        url: snap.homeUrl || snap.url,
        color: '#555'
      };
      var restored = createTab(src, snap.url, {
        silentToast: true,
        skipHistory: true,
        titleOverride: snap.title || '',
        forcedId: Number(snap.id || 0) || null
      });
      if (restored) {
        restored.pinned = !!snap.pinned;
        showToast('Reopened tab');
        scheduleSessionSave();
      }
    }

    // ── Additional tab actions (context menu) ──

    /**
     * Toggle pin state for a tab.  When pinned, move the tab to the front of
     * the tab array and tab strip; when unpinned, move to the end.  Pinned
     * tabs are smaller and omit the close button, similar to Chrome【452477764220631†L82-L89】.
     */
    function togglePin(tab) {
      if (!tab || !tab.element) return;
      tab.pinned = !tab.pinned;
      // Update CSS class
      tab.element.classList.toggle('pinned', tab.pinned);
      // Reorder in state.tabs
      var idx = state.tabs.indexOf(tab);
      if (idx >= 0) {
        state.tabs.splice(idx, 1);
        if (tab.pinned) {
          state.tabs.unshift(tab);
        } else {
          state.tabs.push(tab);
        }
      }
      // Reorder DOM
      if (el.tabsContainer && tab.element) {
        if (tab.pinned) {
          // Insert at the beginning of the tab container, before any existing tabs
          el.tabsContainer.insertBefore(tab.element, el.tabsContainer.firstChild);
        } else {
          // Insert before the new-tab button (if present) or at the end
          var refNode = el.btnNewTab || null;
          el.tabsContainer.insertBefore(tab.element, refNode);
        }
      }
      scheduleSessionSave();
    }

    /**
     * Toggle audio mute for a tab.  Uses electron <webview> APIs if available.
     */
    function toggleMute(tab) {
      if (!tab || !tab.webview) return;
      try {
        var muted = false;
        if (typeof tab.webview.isAudioMuted === 'function') muted = tab.webview.isAudioMuted();
        if (typeof tab.webview.setAudioMuted === 'function') {
          tab.webview.setAudioMuted(!muted);
        }
      } catch (e) {}
    }

    /**
     * Close all tabs except the provided id.
     */
    function closeOtherTabs(keepId) {
      // Copy tab IDs to avoid mutation while iterating
      var ids = state.tabs.map(function (t) { return t.id; });
      for (var i = 0; i < ids.length; i++) {
        var tid = ids[i];
        if (tid !== keepId) closeTab(tid);
      }
    }

    /**
     * Close all tabs to the right of the specified tab id.
     */
    function closeTabsToRight(tabId) {
      var idx = -1;
      for (var i = 0; i < state.tabs.length; i++) {
        if (state.tabs[i].id === tabId) { idx = i; break; }
      }
      if (idx === -1) return;
      // Collect IDs of tabs to the right
      var ids = [];
      for (var j = idx + 1; j < state.tabs.length; j++) {
        ids.push(state.tabs[j].id);
      }
      for (var k = 0; k < ids.length; k++) {
        closeTab(ids[k]);
      }
    }

    /**
     * Add bookmarks for all open tabs.  This mirrors Chrome’s “Bookmark all tabs”
     * action【335440645664631†L50-L63】.  Tabs without http/https URLs are skipped.  Uses
     * webBookmarks.add() if available on the API.
     */
    function bookmarkAllTabs() {
      if (!api.webBookmarks || typeof api.webBookmarks.add !== 'function') return;
      for (var i = 0; i < state.tabs.length; i++) {
        var t = state.tabs[i];
        var url = String(t.url || '').trim();
        if (!/^https?:\/\//i.test(url)) continue;
        // Build title and favicon
        var title = t.title || t.sourceName || siteNameFromUrl(url) || url;
        var fav = t.favicon || '';
        // Call add; ignore duplicates, letting the API decide
        try {
          api.webBookmarks.add({
            url: url,
            title: title,
            favicon: fav,
            timestamp: Date.now()
          });
        } catch (e) {}
      }
      showToast('Bookmarked all tabs');
    }

    function loadSessionAndRestore() {
      if (!api.webSession || typeof api.webSession.get !== 'function') return;
      state.sessionRestoreInProgress = true;
      api.webSession.get().then(function (res) {
        var data = (res && res.ok && res.state) ? res.state : null;
        if (!data || typeof data !== 'object') return;

        var settingsAllowRestore = !(state.browserSettings &&
          state.browserSettings.restoreLastSession === false);
        state.restoreLastSession = settingsAllowRestore && (data.restoreLastSession !== false);

        state.closedTabs = [];
        if (Array.isArray(data.closedTabs)) {
          for (var c = 0; c < data.closedTabs.length; c++) {
            var cs = snapshotTabForSession(data.closedTabs[c]);
            if (!cs) continue;
            state.closedTabs.push(cs);
            if (state.closedTabs.length >= MAX_CLOSED_TABS) break;
          }
        }

        if (!state.restoreLastSession) return;
        if (!Array.isArray(data.tabs) || !data.tabs.length) return;

        var targetActive = String(data.activeTabId || '').trim();
        var maxId = 0;
        for (var i = 0; i < data.tabs.length && i < MAX_TABS; i++) {
          var s = snapshotTabForSession(data.tabs[i]);
          if (!s) continue;
          var sidNum = Number(s.id || 0);
          if (isFinite(sidNum) && sidNum > maxId) maxId = sidNum;
          var src = {
            id: s.sourceId || ('restored_' + i),
            name: s.sourceName || siteNameFromUrl(s.homeUrl || s.url) || 'Tab',
            url: s.homeUrl || s.url,
            color: '#555'
          };
          var tab = createTab(src, s.url, {
            silentToast: true,
            skipHistory: true,
            skipSessionSave: true,
            deferWebview: true,
            titleOverride: s.title || '',
            forcedId: sidNum > 0 ? sidNum : null,
            switchTo: false
          });
          if (tab) tab.pinned = !!s.pinned;
        }
        if (maxId >= state.nextTabId) state.nextTabId = maxId + 1;

        if (targetActive) {
          for (var j = 0; j < state.tabs.length; j++) {
            if (String(state.tabs[j].id) === targetActive) {
              switchTab(state.tabs[j].id);
              break;
            }
          }
        }
      }).catch(function () {
        // ignore restore failures
      }).finally(function () {
        state.sessionRestoreInProgress = false;
        scheduleSessionSave();
      });
    }

    return {
      getActiveTab: getActiveTab,
      getActiveWebview: getActiveWebview,
      createTab: createTab,
      closeTab: closeTab,
      switchTab: switchTab,
      cycleTab: cycleTab,
      openTorrentTab: openTorrentTab,
      ensureWebview: ensureWebview,
      bindWebviewEvents: bindWebviewEvents,
      addTabListener: addTabListener,
      escapeHtml: escapeHtml,
      siteNameFromUrl: siteNameFromUrl,
      setLoadingUI: setLoadingUI,
      showLoadingBar: showLoadingBar,
      hideLoadingBar: hideLoadingBar,
      syncLoadingState: syncLoadingState,
      updateNavButtons: updateNavButtons,
      zoomIn: zoomIn,
      zoomOut: zoomOut,
      zoomReset: zoomReset,
      toggleDevTools: toggleDevTools,
      scheduleSessionSave: scheduleSessionSave,
      loadSessionAndRestore: loadSessionAndRestore,
      pushClosedTab: pushClosedTab,
      reopenClosedTab: reopenClosedTab,
      snapshotTabForSession: snapshotTabForSession,
      normalizeSourceInput: normalizeSourceInput,
      inferSecurityStateFromUrl: inferSecurityStateFromUrl,
      classifyLoadFailure: classifyLoadFailure
    };
  };
})();
