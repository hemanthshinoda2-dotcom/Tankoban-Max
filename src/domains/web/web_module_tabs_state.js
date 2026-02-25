(function registerTabsStateModule() {
  'use strict';

  window.__tankoWebModules = window.__tankoWebModules || {};

  window.__tankoWebModules.tabsState = function initTabsStateModule(bridge) {
    var state = bridge.state;
    var el = bridge.el;
    var api = bridge.api;

    function dep(name) { return (bridge.deps || {})[name]; }
    function showToast() {
      var fn = dep('showToast');
      return fn && fn.apply(null, arguments);
    }

    var MAX_TABS = 50;
    var MAX_CLOSED_TABS = 25;

    var activeRuntime = {
      tabId: null,
      webview: null,
      loadingBarTimer: null,
      zoomLevel: 0,
      zoomTimer: null
    };

    function emitTabsChanged() {
      bridge.emit('tabs:changed', {
        tabs: state.tabs.slice(),
        activeTabId: state.activeTabId
      });
    }

    function getActiveTab() {
      if (state.activeTabId == null) return null;
      for (var i = 0; i < state.tabs.length; i++) {
        if (state.tabs[i] && state.tabs[i].id === state.activeTabId) return state.tabs[i];
      }
      return null;
    }

    function getTabById(id) {
      for (var i = 0; i < state.tabs.length; i++) {
        if (state.tabs[i] && state.tabs[i].id === id) return state.tabs[i];
      }
      return null;
    }

    function getActiveWebview() {
      return activeRuntime.webview;
    }

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

    function siteNameFromUrl(url) {
      try {
        var host = new URL(String(url || '')).hostname;
        return host.replace(/^www\./, '');
      } catch (e) {
        return '';
      }
    }

    function setLoadingUI(loading) {
      if (el.iconReload) el.iconReload.style.display = loading ? 'none' : '';
      if (el.iconStop) el.iconStop.style.display = loading ? '' : 'none';
      if (el.btnReload) el.btnReload.title = loading ? 'Stop loading (Esc)' : 'Reload (Ctrl+R)';
    }

    function showLoadingBar() {
      clearTimeout(activeRuntime.loadingBarTimer);
      if (el.loadingBar) el.loadingBar.className = 'loading';
    }

    function hideLoadingBar() {
      if (el.loadingBar) el.loadingBar.className = 'done';
      clearTimeout(activeRuntime.loadingBarTimer);
      activeRuntime.loadingBarTimer = setTimeout(function () {
        if (el.loadingBar) el.loadingBar.className = '';
        if (el.loadingBarFill) el.loadingBarFill.style.width = '';
      }, 280);
    }

    function syncLoadingState(tab) {
      if (!tab || !activeRuntime.webview || tab.id !== activeRuntime.tabId) {
        setLoadingUI(false);
        return;
      }
      var loading = false;
      try { loading = activeRuntime.webview.isLoading(); } catch (e) {}
      setLoadingUI(loading);
      if (loading) showLoadingBar();
      else if (el.loadingBar) el.loadingBar.className = '';
    }

    function updateNavButtons() {
      var wv = activeRuntime.webview;
      try {
        if (el.btnBack) el.btnBack.disabled = !(wv && wv.canGoBack());
        if (el.btnForward) el.btnForward.disabled = !(wv && wv.canGoForward());
      } catch (e) {
        if (el.btnBack) el.btnBack.disabled = true;
        if (el.btnForward) el.btnForward.disabled = true;
      }
    }

    function clearWebviewContainer() {
      if (!el.webviewContainer) return;
      while (el.webviewContainer.firstChild) {
        el.webviewContainer.removeChild(el.webviewContainer.firstChild);
      }
    }

    function destroyActiveWebview() {
      if (!activeRuntime.webview) return;
      try {
        if (typeof activeRuntime.webview.stopFindInPage === 'function') {
          activeRuntime.webview.stopFindInPage('clearSelection');
        }
      } catch (e) {}
      clearWebviewContainer();
      activeRuntime.webview = null;
      activeRuntime.tabId = null;
    }

    function eventUrl(e) {
      if (!e) return '';
      if (typeof e.url === 'string' && e.url) return e.url;
      if (typeof e.targetUrl === 'string' && e.targetUrl) return e.targetUrl;
      if (e.detail && typeof e.detail.url === 'string' && e.detail.url) return e.detail.url;
      return '';
    }

    function isNavigableUrl(url) {
      var u = String(url || '').trim();
      return !!u && u !== 'about:blank';
    }

    function createWebviewForTab(tab, navUrl) {
      if (!tab || tab.type === 'torrent') return null;
      var url = String(navUrl || tab.url || '').trim();
      if (!isNavigableUrl(url)) return null;

      destroyActiveWebview();
      if (!el.webviewContainer) return null;

      var wv = document.createElement('webview');
      wv.setAttribute('src', url);
      wv.setAttribute('partition', 'persist:webmode');
      wv.setAttribute('allowpopups', '');
      wv.setAttribute('webpreferences', 'contextIsolation=yes');
      wv.classList.add('active');
      el.webviewContainer.appendChild(wv);

      activeRuntime.webview = wv;
      activeRuntime.tabId = tab.id;
      tab.url = url;

      bindWebviewEvents(tab, wv);
      return wv;
    }

    function bindWebviewEvents(tab, wv) {
      function handleMagnet(raw) {
        var u = String(raw || '').trim();
        if (!u || u.toLowerCase().indexOf('magnet:') !== 0) return false;
        bridge.emit('openMagnet', u);
        return true;
      }

      wv.addEventListener('did-start-loading', function () {
        if (!tab || state.activeTabId !== tab.id) return;
        tab.loading = true;
        setLoadingUI(true);
        showLoadingBar();
      });

      wv.addEventListener('did-stop-loading', function () {
        if (!tab || state.activeTabId !== tab.id) return;
        tab.loading = false;
        setLoadingUI(false);
        hideLoadingBar();
        updateNavButtons();
        try {
          var u = wv.getURL();
          if (u) tab.url = u;
        } catch (e) {}
        if (el.urlBar && document.activeElement !== el.urlBar) {
          el.urlBar.value = tab.url || '';
        }
        try {
          var histUrl = tab.url || '';
          if (histUrl && histUrl !== 'about:blank' && !/^(data|chrome|devtools):/i.test(histUrl)) {
            api.webHistory.add({
              url: histUrl,
              title: tab.title || histUrl,
              favicon: tab.favicon || '',
              timestamp: Date.now()
            });
            bridge.emit('history:updated');
          }
        } catch (e2) {}
        scheduleSessionSave();
      });

      wv.addEventListener('did-navigate', function (e) {
        var nextUrl = eventUrl(e);
        if (handleMagnet(nextUrl)) return;
        tab.url = nextUrl || tab.url;
        if (tab.id === state.activeTabId) {
          if (el.urlBar && document.activeElement !== el.urlBar) el.urlBar.value = tab.url || '';
          updateNavButtons();
          bridge.emit('tab:urlChanged', { tabId: tab.id, url: tab.url });
        }
        emitTabsChanged();
        scheduleSessionSave();
      });

      wv.addEventListener('did-navigate-in-page', function (e) {
        if (!e || !e.isMainFrame) return;
        var nextUrl = eventUrl(e);
        if (handleMagnet(nextUrl)) return;
        tab.url = nextUrl || tab.url;
        if (tab.id === state.activeTabId) {
          if (el.urlBar && document.activeElement !== el.urlBar) el.urlBar.value = tab.url || '';
          updateNavButtons();
          bridge.emit('tab:urlChanged', { tabId: tab.id, url: tab.url });
        }
        emitTabsChanged();
      });

      wv.addEventListener('page-title-updated', function (e) {
        tab.title = String((e && e.title) || tab.title || 'New Tab');
        emitTabsChanged();
      });

      wv.addEventListener('page-favicon-updated', function (e) {
        if (e && e.favicons && e.favicons.length) {
          tab.favicon = e.favicons[0];
          emitTabsChanged();
        }
      });

      wv.addEventListener('did-fail-load', function (e) {
        if (e && e.errorCode === -3) return;
        var classified = classifyLoadFailure(e && e.errorCode, e && e.errorDescription, e && e.validatedURL);
        if (classified.toast) showToast(classified.toast);
        bridge.emit('tab:loadFailed', { tabId: tab.id, error: classified });
      });

      wv.addEventListener('will-navigate', function (e) {
        if (handleMagnet(eventUrl(e)) && e && typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
      });

      wv.addEventListener('new-window', function () {
        // Popup handling remains centralized in main process.
      });

      wv.addEventListener('context-menu', function (e) {
        var payload = (e && e.params && typeof e.params === 'object')
          ? e.params
          : (e && typeof e === 'object' ? e : {});
        bridge.emit('contextMenu', payload);
      });

      wv.addEventListener('found-in-page', function (e) {
        if (!tab || tab.id !== state.activeTabId) return;
        bridge.emit('find:result', e && e.result ? e.result : null);
      });
    }

    function createTab(source, url, opts) {
      var options = (opts && typeof opts === 'object') ? opts : {};
      if (state.tabs.length >= MAX_TABS) {
        showToast('Tab limit reached (' + MAX_TABS + ')');
        return null;
      }

      var norm = normalizeSourceInput(source, url);
      var tabUrl = String(url || norm.url || '').trim();
      var tab = {
        id: (options.forcedId && options.forcedId > 0) ? options.forcedId : state.nextTabId++,
        title: options.titleOverride || norm.name || 'New Tab',
        favicon: options.favicon || '',
        url: tabUrl,
        homeUrl: norm.url || tabUrl,
        sourceId: norm.id || '',
        sourceName: norm.name || '',
        sourceColor: norm.color || '#555',
        pinned: !!options.pinned,
        loading: false,
        type: options.type || 'browser'
      };

      if (tab.id >= state.nextTabId) state.nextTabId = tab.id + 1;
      state.tabs.push(tab);

      if (options.switchTo !== false) {
        switchTab(tab.id);
      } else {
        emitTabsChanged();
      }

      if (!options.skipSessionSave) scheduleSessionSave();
      return tab;
    }

    function closeTab(id) {
      var idx = -1;
      for (var i = 0; i < state.tabs.length; i++) {
        if (state.tabs[i] && state.tabs[i].id === id) {
          idx = i;
          break;
        }
      }
      if (idx === -1) return;

      var tab = state.tabs[idx];
      var wasActive = (state.activeTabId === id);
      pushClosedTab(tab);

      if (wasActive && activeRuntime.tabId === id) {
        destroyActiveWebview();
      }

      state.tabs.splice(idx, 1);

      if (wasActive) {
        if (state.tabs.length) {
          var nextIdx = Math.min(idx, state.tabs.length - 1);
          switchTab(state.tabs[nextIdx].id);
        } else {
          state.activeTabId = null;
          emitTabsChanged();
        }
      } else {
        emitTabsChanged();
      }

      scheduleSessionSave();
    }

    function switchTab(id) {
      var tab = getTabById(id);
      if (!tab) return;

      state.activeTabId = id;
      bridge.emit('tab:switched', { tabId: id, tab: tab });

      var closeFind = dep('closeFind');
      if (closeFind) closeFind();

      if (tab.type === 'torrent') {
        destroyActiveWebview();
        if (el.urlBar) el.urlBar.value = 'tanko://torrents';
        setLoadingUI(false);
        updateNavButtons();
      } else if (isNavigableUrl(tab.url)) {
        createWebviewForTab(tab, tab.url);
        if (el.urlBar && document.activeElement !== el.urlBar) el.urlBar.value = tab.url;
        syncLoadingState(tab);
        updateNavButtons();
      } else {
        destroyActiveWebview();
        if (el.urlBar && document.activeElement !== el.urlBar) el.urlBar.value = '';
        setLoadingUI(false);
        updateNavButtons();
      }

      emitTabsChanged();
      scheduleSessionSave();
    }

    function activateTab(id) {
      switchTab(id);
    }

    function cycleTab(direction) {
      if (state.tabs.length < 2) return;
      var idx = -1;
      for (var i = 0; i < state.tabs.length; i++) {
        if (state.tabs[i] && state.tabs[i].id === state.activeTabId) {
          idx = i;
          break;
        }
      }
      if (idx === -1) return;
      var next = (idx + direction + state.tabs.length) % state.tabs.length;
      switchTab(state.tabs[next].id);
    }

    function openTorrentTab(source) {
      for (var i = 0; i < state.tabs.length; i++) {
        if (state.tabs[i] && state.tabs[i].type === 'torrent') {
          switchTab(state.tabs[i].id);
          if (source && typeof window.torrentTabAddSource === 'function') {
            window.torrentTabAddSource(source);
          }
          return state.tabs[i];
        }
      }

      var tab = createTab({ id: 'torrent', name: 'Tankoban Torrent', url: '' }, '', {
        type: 'torrent',
        titleOverride: 'Tankoban Torrent',
        switchTo: true,
        skipSessionSave: false
      });

      if (typeof window.initTorrentTab === 'function') window.initTorrentTab();
      if (source && typeof window.torrentTabAddSource === 'function') {
        window.torrentTabAddSource(source);
      }
      return tab;
    }

    function ensureWebview(tab, url) {
      if (!tab || tab.type === 'torrent') return null;
      if (tab.id !== state.activeTabId) return null;
      if (!activeRuntime.webview && isNavigableUrl(url || tab.url)) {
        return createWebviewForTab(tab, url || tab.url);
      }
      return activeRuntime.webview;
    }

    function pushClosedTab(tab) {
      var snap = snapshotTabForSession(tab);
      if (!snap) return;
      state.closedTabs.unshift(snap);
      if (state.closedTabs.length > MAX_CLOSED_TABS) state.closedTabs.length = MAX_CLOSED_TABS;
    }

    function snapshotTabForSession(tab) {
      if (!tab || tab.type === 'torrent') return null;
      var url = String(tab.url || '').trim();
      if (!url || url === 'about:blank') return null;
      return {
        id: String(tab.id || ''),
        sourceId: tab.sourceId != null ? String(tab.sourceId) : '',
        sourceName: String(tab.sourceName || '').trim(),
        title: String(tab.title || '').trim(),
        url: url,
        homeUrl: String(tab.homeUrl || url).trim() || url,
        pinned: !!tab.pinned,
        favicon: String(tab.favicon || '')
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
      state.sessionSaveTimer = setTimeout(runSave, 250);
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
        titleOverride: snap.title || '',
        forcedId: Number(snap.id || 0) || null,
        switchTo: true,
        favicon: snap.favicon || ''
      });
      if (restored) {
        restored.pinned = !!snap.pinned;
        showToast('Reopened tab');
      }
      scheduleSessionSave();
    }

    function loadSessionAndRestore() {
      if (!api.webSession || typeof api.webSession.get !== 'function') return;
      state.sessionRestoreInProgress = true;

      api.webSession.get().then(function (res) {
        var data = (res && res.ok && res.state) ? res.state : null;
        if (!data || typeof data !== 'object') return;

        var settingsAllowRestore = !(state.browserSettings && state.browserSettings.restoreLastSession === false);
        state.restoreLastSession = settingsAllowRestore && (data.restoreLastSession !== false);

        state.closedTabs = [];
        if (Array.isArray(data.closedTabs)) {
          for (var c = 0; c < data.closedTabs.length; c++) {
            var closed = data.closedTabs[c];
            if (!closed || !closed.url) continue;
            state.closedTabs.push({
              id: String(closed.id || ''),
              sourceId: String(closed.sourceId || ''),
              sourceName: String(closed.sourceName || ''),
              title: String(closed.title || ''),
              url: String(closed.url || ''),
              homeUrl: String(closed.homeUrl || closed.url || ''),
              pinned: !!closed.pinned,
              favicon: String(closed.favicon || '')
            });
            if (state.closedTabs.length >= MAX_CLOSED_TABS) break;
          }
        }

        if (!state.restoreLastSession) return;
        if (!Array.isArray(data.tabs) || !data.tabs.length) return;

        var targetActive = String(data.activeTabId || '').trim();
        var maxId = 0;

        for (var i = 0; i < data.tabs.length && i < MAX_TABS; i++) {
          var item = data.tabs[i];
          if (!item || !item.url) continue;
          var sidNum = Number(item.id || 0);
          if (isFinite(sidNum) && sidNum > maxId) maxId = sidNum;

          createTab({
            id: item.sourceId || ('restored_' + i),
            name: item.sourceName || siteNameFromUrl(item.homeUrl || item.url) || 'Tab',
            url: item.homeUrl || item.url,
            color: '#555'
          }, item.url, {
            titleOverride: item.title || '',
            forcedId: sidNum > 0 ? sidNum : null,
            switchTo: false,
            skipSessionSave: true,
            pinned: !!item.pinned,
            favicon: item.favicon || ''
          });
        }

        if (maxId >= state.nextTabId) state.nextTabId = maxId + 1;

        if (targetActive) {
          for (var j = 0; j < state.tabs.length; j++) {
            if (String(state.tabs[j].id) === targetActive) {
              switchTab(state.tabs[j].id);
              break;
            }
          }
        } else if (state.tabs.length) {
          switchTab(state.tabs[0].id);
        }
      }).catch(function () {
        // ignore restore failures
      }).finally(function () {
        state.sessionRestoreInProgress = false;
        emitTabsChanged();
        scheduleSessionSave();
      });
    }

    function zoomIn() {
      activeRuntime.zoomLevel = Math.min((activeRuntime.zoomLevel || 0) + 1, 5);
      applyZoom();
    }

    function zoomOut() {
      activeRuntime.zoomLevel = Math.max((activeRuntime.zoomLevel || 0) - 1, -5);
      applyZoom();
    }

    function zoomReset() {
      activeRuntime.zoomLevel = 0;
      applyZoom();
    }

    function applyZoom() {
      var wv = activeRuntime.webview;
      if (wv && typeof wv.setZoomLevel === 'function') {
        wv.setZoomLevel(activeRuntime.zoomLevel || 0);
      }
      showZoomIndicator();
    }

    function showZoomIndicator() {
      if (!el.zoomIndicator) return;
      var pct = Math.round(Math.pow(1.2, activeRuntime.zoomLevel || 0) * 100);
      el.zoomIndicator.textContent = pct + '%';
      el.zoomIndicator.style.display = '';
      el.zoomIndicator.style.opacity = '1';
      clearTimeout(activeRuntime.zoomTimer);
      activeRuntime.zoomTimer = setTimeout(function () {
        if (!el.zoomIndicator) return;
        el.zoomIndicator.style.opacity = '0';
        setTimeout(function () {
          if (el.zoomIndicator) el.zoomIndicator.style.display = 'none';
        }, 200);
      }, 1400);
    }

    function toggleDevTools() {
      var wv = activeRuntime.webview;
      if (!wv || !api.webBrowserActions || typeof api.webBrowserActions.ctxAction !== 'function') return;
      try {
        var wcId = wv.getWebContentsId();
        api.webBrowserActions.ctxAction({ webContentsId: wcId, action: 'devtools' });
      } catch (e) {}
    }

    function classifyLoadFailure(errorCode, errorDescription, failedUrl) {
      var code = Number(errorCode || 0);
      var desc = String(errorDescription || '').trim();
      var lower = desc.toLowerCase();
      var host = '';
      try { host = new URL(String(failedUrl || '')).hostname; } catch (e) {}

      var out = { kind: 'load_failed', isBlocked: false, title: '', toast: '' };

      if (code === -20 || code === -21 || lower.indexOf('blocked') !== -1) {
        out.kind = 'blocked';
        out.isBlocked = true;
      } else if (code === -105 || code === -137 || code === -300 || lower.indexOf('dns') !== -1) {
        out.kind = 'dns';
      } else if (code <= -200 && code >= -299) {
        out.kind = 'tls';
      } else if (code === -118 || code === -7 || lower.indexOf('timed out') !== -1) {
        out.kind = 'timeout';
      } else if (code === -106 || lower.indexOf('internet disconnected') !== -1) {
        out.kind = 'offline';
      }

      var titles = {
        blocked: 'Blocked',
        dns: 'DNS error',
        tls: 'TLS error',
        timeout: 'Timed out',
        offline: 'Offline'
      };

      out.title = titles[out.kind] || 'Load failed';
      if (host) out.title += ' - ' + host;
      if (out.kind === 'blocked') out.toast = 'Blocked: ' + (host || 'site');
      else if (desc) out.toast = 'Load failed: ' + desc;
      else out.toast = out.title;

      return out;
    }

    function inferSecurityStateFromUrl(url) {
      var raw = String(url || '').trim();
      if (!raw) return 'unknown';
      if (raw.indexOf('https://') === 0) return 'secure';
      if (raw.indexOf('http://') === 0) return 'insecure';
      if (/^(file|about|chrome|data):/i.test(raw)) return 'internal';
      return 'unknown';
    }

    return {
      getActiveTab: getActiveTab,
      getActiveWebview: getActiveWebview,
      createTab: createTab,
      closeTab: closeTab,
      switchTab: switchTab,
      activateTab: activateTab,
      cycleTab: cycleTab,
      openTorrentTab: openTorrentTab,
      ensureWebview: ensureWebview,
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
      classifyLoadFailure: classifyLoadFailure,
      emitTabsChanged: emitTabsChanged,
      destroyActiveWebview: destroyActiveWebview
    };
  };
})();
