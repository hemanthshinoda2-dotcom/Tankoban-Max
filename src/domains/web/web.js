// Tankoban Max â€” Web browser mode renderer (BUILD_WEB + BUILD_WEB_HOME + BUILD_WCV)
// BUILD_WCV: Replaced <webview> tags with main-process WebContentsView via IPC.
(function webBrowserDomain() {
  'use strict';

  if (window.__tankoWebBrowserBound) return;

  var api = window.Tanko && window.Tanko.api ? window.Tanko.api : null;
  if (!api || !api.webSources) {
    console.warn('[BUILD_WEBVIEW] Tanko.api.webSources not available');
    return;
  }

  window.__tankoWebBrowserBound = true;

  function qs(id) {
    try { return document.getElementById(id); } catch (e) { return null; }
  }

  var el = {
    webLibraryView: qs('webLibraryView'),
    // BUILD_WEB_HOME: Home view elements
    homeView: qs('webHomeView'),
    sourcesGrid: qs('webSourcesGrid'),
    sourcesEmpty: qs('webSourcesEmpty'),
    continuePanel: qs('webContinuePanel'),
    continueEmpty: qs('webContinueEmpty'),
    homeDownloadsPanel: qs('webHomeDownloadsPanel'),
    homeDlList: qs('webHomeDownloadsList'),
    homeDlEmpty: qs('webHomeDownloadsEmpty'),
    homeDlClearBtn: qs('webHomeDownloadsClear'),
    // BUILD_WEB_HOME: Browser view elements
    browserView: qs('webBrowserView'),
    browserBackBtn: qs('webBrowserBackBtn'),
    browserTitle: qs('webBrowserTitle'),
    tabBar: qs('webTabBar'),
    navBack: qs('webNavBack'),
    navForward: qs('webNavForward'),
    navReload: qs('webNavReload'),
    navHome: qs('webNavHome'),
    urlDisplay: qs('webUrlDisplay'),
    omniIcon: qs('webOmniIcon'),
    browserHomePanel: qs('webBrowserHomePanel'),
    browserHomeGrid: qs('webBrowserHomeGrid'),
    browserHomeEmpty: qs('webBrowserHomeEmpty'),
    browserHomeAddSourceBtn: qs('webBrowserHomeAddSourceBtn'),
    viewContainer: qs('webViewContainer'),
    loadBar: qs('webLoadBar'),
    dlPill: qs('webDlPill'),
    dlBtn: qs('webDlBtn'),
    dlBadge: qs('webDlBadge'),
    dlPanel: qs('webDlPanel'),
    dlList: qs('webDlList'),
    dlEmpty: qs('webDlEmpty'),
    dlClearBtn: qs('webDlClearBtn'),
    // FIX-WEB-DL: Chrome-like bottom bar
    dlBar: qs('webDlBar'),
    dlBarText: qs('webDlBarText'),
    dlBarProgress: qs('webDlBarProgress'),
    dlBarProgressFill: qs('webDlBarProgressFill'),
    dlBarClose: qs('webDlBarClose'),
    // Sidebar
    sourcesList: qs('webSourcesList'),
    addSourceBtn: qs('webAddSourceBtn'),
    downloadStatus: qs('webDownloadStatus'),
    sidebarDlRow: qs('webDownloadProgressRow'),
    sidebarDlFill: qs('webDownloadProgressFill'),
    sidebarDlPct: qs('webDownloadProgressPct'),
    destBooks: qs('webDestBooks'),
    destComics: qs('webDestComics'),
    // Add source dialog
    addSourceOverlay: qs('webAddSourceOverlay'),
    addSourceClose: qs('webAddSourceClose'),
    addTitle: qs('webAddTitle'),
    sourceName: qs('webSourceName'),
    sourceUrl: qs('webSourceUrl'),
    sourceSaveBtn: qs('webSourceSaveBtn'),
    // BUILD_WEB_PARITY
    tipsOverlay: qs('webLibTipsOverlay'),
    tipsClose: qs('webLibTipsClose'),
    tipsBtn: qs('webTipsBtn'),
    toast: qs('webToast'),
    contextMenu: qs('contextMenu'),
    // Global right Browser Hub
    hubDirectActiveList: qs('webHubDirectActiveList'),
    hubDirectActiveEmpty: qs('webHubDirectActiveEmpty'),
    hubTorrentActiveList: qs('webHubTorrentActiveList'),
    hubTorrentActiveEmpty: qs('webHubTorrentActiveEmpty'),
    hubDownloadHistoryList: qs('webHubDownloadHistoryList'),
    hubDownloadHistoryEmpty: qs('webHubDownloadHistoryEmpty'),
    hubDownloadHistoryClearBtn: qs('webHubDownloadHistoryClearBtn'),
    hubBrowseHistoryList: qs('webHubBrowseHistoryList'),
    hubBrowseHistoryEmpty: qs('webHubBrowseHistoryEmpty'),
    hubBrowseSearch: qs('webHubBrowseSearch'),
    hubBrowseHistoryClearBtn: qs('webHubBrowseHistoryClearBtn')
  };

  var MAX_TABS = 8;
  var MAX_BROWSING_HISTORY_UI = 500;
  var MAX_UNIFIED_HISTORY_UI = 2000;
  var SEARCH_ENGINE_URLS = {
    yandex: 'https://yandex.com/search/?text='
  };

  var state = {
    sources: [],
    tabs: [],          // BUILD_WCV: { id, sourceId, sourceName, title, url, homeUrl, mainTabId, loading, canGoBack, canGoForward }
    activeTabId: null,
    nextTabId: 1,
    downloading: 0,
    downloadingHasProgress: false,
    lastDownloadName: '',
    lastDownloadProgress: null,
    downloads: [],      // { id, filename, destination?, library?, state, startedAt, finishedAt?, error? }
    dlPanelOpen: false,
    dlBarDismissed: false,
    dlBarTimer: null,
    browserOpen: false, // BUILD_WEB_HOME
    // BUILD_WEB_PARITY
    editSourceId: null,
    toastTimer: null,
    ctxOpen: false,
    // MERIDIAN_DRAG
    dragTabId: null,
    // MERIDIAN_SPLIT
    split: false,
    splitTabId: null,
    splitRatio: 0.5,
    showBrowserHome: false,
    browserSettings: {
      defaultSearchEngine: 'yandex'
    },
    browsingHistory: [],
    browsingHistoryQuery: '',
    browseSearchTimer: null,
    torrentActive: [],
    torrentHistory: []
  };

  function isMagnetUrl(url) {
    return /^magnet:/i.test(String(url || '').trim());
  }

  function isTorrentFileUrl(url) {
    var raw = String(url || '').trim();
    if (!/^https?:/i.test(raw)) return false;
    try {
      var u = new URL(raw);
      var p = String(u.pathname || '').toLowerCase();
      return p.indexOf('.torrent') !== -1;
    } catch (e) {
      return /\.torrent(\?|#|$)/i.test(raw);
    }
  }

  function maybeStartTorrentFromUrl(url, referer) {
    var target = String(url || '').trim();
    if (!target || !api || !api.webTorrent || !api.webSources || !api.webSources.pickDestinationFolder) return false;

    if (isMagnetUrl(target)) {
      try {
        api.webSources.pickDestinationFolder({
          kind: 'torrent',
          suggestedFilename: 'magnet',
          modeHint: 'videos',
        }).then(function (picked) {
          if (!picked || !picked.ok) {
            if (picked && !picked.cancelled) showToast(String(picked.error || 'Destination not selected'));
            return null;
          }
          return api.webTorrent.startMagnet({
            magnetUri: target,
            referer: String(referer || ''),
            destinationRoot: String(picked.folderPath || ''),
          });
        }).then(function (res) {
          if (!res) return;
          if (res && res.ok) showToast('Torrent started');
          else showToast((res && res.error) ? String(res.error) : 'Failed to start torrent');
          refreshTorrentState();
        }).catch(function () {
          showToast('Failed to start torrent');
        });
      } catch (e) {
        showToast('Failed to start torrent');
      }
      return true;
    }

    if (isTorrentFileUrl(target)) {
      try {
        var nameHint = 'torrent';
        try {
          var _u = new URL(target);
          var _p = String(_u.pathname || '').trim();
          if (_p) {
            var _parts = _p.split('/');
            nameHint = decodeURIComponent(_parts[_parts.length - 1] || 'torrent');
          }
        } catch (e0) {}

        api.webSources.pickDestinationFolder({
          kind: 'torrent',
          suggestedFilename: nameHint,
          modeHint: 'videos',
        }).then(function (picked) {
          if (!picked || !picked.ok) {
            if (picked && !picked.cancelled) showToast(String(picked.error || 'Destination not selected'));
            return null;
          }
          return api.webTorrent.startTorrentUrl({
            url: target,
            referer: String(referer || ''),
            destinationRoot: String(picked.folderPath || ''),
          });
        }).then(function (res) {
          if (!res) return;
          if (res && res.ok) showToast('Torrent started');
          else showToast((res && res.error) ? String(res.error) : 'Failed to start torrent');
          refreshTorrentState();
        }).catch(function () {
          showToast('Failed to start torrent');
        });
      } catch (e2) {
        showToast('Failed to start torrent');
      }
      return true;
    }

    return false;
  }

  function createRendererWebTabsShim() {
    var nextTabId = 1;
    var tabs = new Map(); // tabId -> { tabId, webview }
    var splitState = { enabled: false, leftId: null, rightId: null };
    var listeners = {
      title: [],
      url: [],
      loading: [],
      nav: []
    };

    function emit(type, payload) {
      var arr = listeners[type];
      if (!arr || !arr.length) return;
      for (var i = 0; i < arr.length; i++) {
        try { arr[i](payload || {}); } catch (e) {}
      }
    }

    function on(type, cb) {
      if (typeof cb !== 'function' || !listeners[type]) return;
      listeners[type].push(cb);
    }

    function safeCanGoBack(wv) {
      try { return !!(wv && wv.canGoBack && wv.canGoBack()); } catch (e) { return false; }
    }

    function safeCanGoForward(wv) {
      try { return !!(wv && wv.canGoForward && wv.canGoForward()); } catch (e) { return false; }
    }

    function safeUrl(wv) {
      try { return String((wv && wv.getURL && wv.getURL()) || ''); } catch (e) { return ''; }
    }

    function emitNav(tabId, wv) {
      emit('nav', {
        tabId: tabId,
        canGoBack: safeCanGoBack(wv),
        canGoForward: safeCanGoForward(wv)
      });
    }

    function hideRecord(rec) {
      if (!rec || !rec.webview) return;
      rec.webview.classList.add('hidden');
      rec.webview.style.left = '0px';
      rec.webview.style.width = '100%';
      rec.webview.style.zIndex = '1';
    }

    function showRecord(rec, leftPx, widthPx, z) {
      if (!rec || !rec.webview) return;
      rec.webview.classList.remove('hidden');
      rec.webview.style.left = Math.max(0, Math.round(leftPx || 0)) + 'px';
      rec.webview.style.width = Math.max(0, Math.round(widthPx || 0)) + 'px';
      rec.webview.style.zIndex = String(z || 1);
    }

    function hideAllInternal() {
      tabs.forEach(function (rec) { hideRecord(rec); });
    }

    function showSingle(tabId) {
      splitState.enabled = false;
      splitState.leftId = null;
      splitState.rightId = null;

      hideAllInternal();
      var rec = tabs.get(Number(tabId));
      if (!rec || !el.viewContainer) return;
      var rect = el.viewContainer.getBoundingClientRect();
      showRecord(rec, 0, rect.width, 2);
    }

    function showSplit(leftId, rightId, leftBounds, rightBounds) {
      var leftRec = tabs.get(Number(leftId));
      var rightRec = tabs.get(Number(rightId));
      if (!leftRec || !rightRec || !el.viewContainer) {
        showSingle(leftId);
        return;
      }
      splitState.enabled = true;
      splitState.leftId = Number(leftId);
      splitState.rightId = Number(rightId);
      hideAllInternal();

      var rect = el.viewContainer.getBoundingClientRect();
      var totalW = Math.max(0, Math.round(rect.width));
      var leftW = (leftBounds && leftBounds.width != null) ? Number(leftBounds.width) : Math.round(totalW * 0.5);
      var rightW = (rightBounds && rightBounds.width != null) ? Number(rightBounds.width) : (totalW - leftW);

      leftW = Math.max(80, Math.min(totalW - 80, Math.round(leftW)));
      rightW = Math.max(80, totalW - leftW);

      showRecord(leftRec, 0, leftW, 2);
      showRecord(rightRec, leftW, rightW, 2);
    }

    function bindWebview(tabId, wv) {
      wv.addEventListener('did-start-loading', function () {
        emit('loading', { tabId: tabId, loading: true });
      });

      wv.addEventListener('did-stop-loading', function () {
        emit('loading', { tabId: tabId, loading: false });
        emit('url', { tabId: tabId, url: safeUrl(wv) });
        emitNav(tabId, wv);
      });

      wv.addEventListener('page-title-updated', function (ev) {
        var title = ev && ev.title ? String(ev.title) : '';
        emit('title', { tabId: tabId, title: title });
      });

      wv.addEventListener('dom-ready', function () {
        emit('url', { tabId: tabId, url: safeUrl(wv) });
        emitNav(tabId, wv);
      });

      wv.addEventListener('did-navigate', function (ev) {
        emit('url', { tabId: tabId, url: String((ev && ev.url) || '') });
        emitNav(tabId, wv);
      });

      wv.addEventListener('did-navigate-in-page', function (ev) {
        emit('url', { tabId: tabId, url: String((ev && ev.url) || '') });
        emitNav(tabId, wv);
      });

      wv.addEventListener('will-navigate', function (ev) {
        var target = String((ev && ev.url) || '').trim();
        if (!target) return;
        if (maybeStartTorrentFromUrl(target, safeUrl(wv))) {
          try { ev.preventDefault(); } catch (e) {}
          return;
        }
      });

      wv.addEventListener('new-window', function (ev) {
        var target = String((ev && ev.url) || '').trim();
        if (!target) return;
        try { ev.preventDefault(); } catch (e) {}
        if (maybeStartTorrentFromUrl(target, safeUrl(wv))) return;
        var parent = getTabByMainId(tabId);
        openPopupUrlInNewTab(target, parent);
      });
    }

    return {
      create: function (payload) {
        var url = String((payload && payload.url) || '').trim() || 'about:blank';
        var tabId = nextTabId++;
        var wv = document.createElement('webview');
        wv.className = 'webTabWebview hidden';
        wv.setAttribute('partition', 'persist:webmode');
        wv.setAttribute('allowpopups', '');
        wv.src = url;
        bindWebview(tabId, wv);

        if (el.viewContainer) el.viewContainer.appendChild(wv);
        tabs.set(tabId, { tabId: tabId, webview: wv });
        return Promise.resolve({ ok: true, tabId: tabId });
      },

      close: function (payload) {
        var tabId = Number(payload && payload.tabId);
        var rec = tabs.get(tabId);
        if (!rec) return Promise.resolve({ ok: true });
        try {
          if (rec.webview && rec.webview.parentElement) rec.webview.parentElement.removeChild(rec.webview);
        } catch (e) {}
        tabs.delete(tabId);
        if (splitState.enabled && (splitState.leftId === tabId || splitState.rightId === tabId)) {
          splitState.enabled = false;
          splitState.leftId = null;
          splitState.rightId = null;
          hideAllInternal();
        }
        return Promise.resolve({ ok: true });
      },

      activate: function (payload) {
        var tabId = Number(payload && payload.tabId);
        if (!tabs.has(tabId)) return Promise.resolve({ ok: false, error: 'Not found' });
        showSingle(tabId);
        return Promise.resolve({ ok: true });
      },

      navigate: function (payload) {
        var tabId = Number(payload && payload.tabId);
        var action = String((payload && payload.action) || '').trim();
        var rec = tabs.get(tabId);
        if (!rec || !rec.webview) return Promise.resolve({ ok: false, error: 'Not found' });
        var wv = rec.webview;
        try {
          if (action === 'back') {
            if (safeCanGoBack(wv)) wv.goBack();
          } else if (action === 'forward') {
            if (safeCanGoForward(wv)) wv.goForward();
          } else if (action === 'reload') {
            wv.reload();
          } else if (action === 'loadUrl') {
            var url = String((payload && payload.url) || '').trim();
            if (url) {
              if (!maybeStartTorrentFromUrl(url, safeUrl(wv))) {
                wv.loadURL(url);
              }
            }
          }
        } catch (e) {
          return Promise.resolve({ ok: false, error: String(e && e.message || e || 'Navigation failed') });
        }
        setTimeout(function () { emitNav(tabId, wv); }, 0);
        return Promise.resolve({ ok: true });
      },

      setBounds: function (payload) {
        var tabId = Number(payload && payload.tabId);
        if (!tabs.has(tabId)) return Promise.resolve({ ok: false, error: 'Not found' });
        showSingle(tabId);
        return Promise.resolve({ ok: true });
      },

      splitBounds: function (payload) {
        var left = payload && payload.left ? payload.left : null;
        var right = payload && payload.right ? payload.right : null;
        var leftId = Number(left && left.tabId);
        var rightId = Number(right && right.tabId);
        if (!tabs.has(leftId) || !tabs.has(rightId)) return Promise.resolve({ ok: false, error: 'Not found' });
        showSplit(leftId, rightId, left && left.bounds, right && right.bounds);
        return Promise.resolve({ ok: true });
      },

      hideAll: function () {
        hideAllInternal();
        splitState.enabled = false;
        splitState.leftId = null;
        splitState.rightId = null;
        return Promise.resolve({ ok: true });
      },

      query: function () {
        var ids = [];
        tabs.forEach(function (rec, id) {
          ids.push({ tabId: id, url: safeUrl(rec.webview) });
        });
        return Promise.resolve({ ok: true, tabs: ids });
      },

      onTitleUpdated: function (cb) { on('title', cb); },
      onUrlUpdated: function (cb) { on('url', cb); },
      onLoading: function (cb) { on('loading', cb); },
      onNavState: function (cb) { on('nav', cb); },
    };
  }

  var webTabs = createRendererWebTabsShim();

  // ---- Utilities ----

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function shortPath(p) {
    var s = String(p || '');
    if (s.length > 40) return '...' + s.slice(-37);
    return s;
  }

  function getSourceColor(sourceId) {
    for (var i = 0; i < state.sources.length; i++) {
      if (state.sources[i].id === sourceId) return state.sources[i].color || '#555';
    }
    return '#555';
  }

  function getSourceById(sourceId) {
    for (var i = 0; i < state.sources.length; i++) {
      if (state.sources[i].id === sourceId) return state.sources[i];
    }
    return null;
  }

  // FIX-WEB-MODE: derive a friendly site name from a URL
  function siteNameFromUrl(url) {
    try {
      var h = new URL(url).hostname.replace(/^www\./, '');
      // Capitalize first letter of each part before TLD
      var parts = h.split('.');
      if (parts.length > 1) parts.pop(); // drop TLD
      var name = parts.join(' ');
      return name.charAt(0).toUpperCase() + name.slice(1);
    } catch (e) {
      return '';
    }
  }

  function getFaviconUrl(url) {
    try {
      var domain = new URL(url).hostname;
      return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=128';
    } catch (e) {
      return '';
    }
  }

  function getActiveSearchEngine() {
    var key = String(state.browserSettings && state.browserSettings.defaultSearchEngine || 'yandex').trim().toLowerCase();
    if (!SEARCH_ENGINE_URLS[key]) key = 'yandex';
    return key;
  }

  function getSearchQueryUrl(query) {
    var key = getActiveSearchEngine();
    var base = SEARCH_ENGINE_URLS[key] || SEARCH_ENGINE_URLS.yandex;
    return base + encodeURIComponent(String(query || ''));
  }

  function syncOmniPlaceholder() {
    if (!el.urlDisplay) return;
    var key = getActiveSearchEngine();
    var label = key === 'yandex' ? 'Yandex' : key;
    try { el.urlDisplay.setAttribute('placeholder', 'Search ' + label + ' or type a URL'); } catch (e) {}
  }

  function isAllowedOmniScheme(raw) {
    var lower = String(raw || '').trim().toLowerCase();
    return lower.indexOf('http:') === 0 || lower.indexOf('https:') === 0 || lower === 'about:blank';
  }

  // Chrome-like omnibox: accept URL or search query
  function resolveOmniInputToUrl(input) {
    var raw = String(input || '').trim();
    if (!raw) return '';

    // SECURITY: never pass through arbitrary schemes from omnibox text.
    // Inputs like javascript:/data:/file:/custom protocol can execute code or
    // access local resources, so we downgrade any non-allowlisted scheme to a search.
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
      if (isAllowedOmniScheme(raw)) return raw;
      return getSearchQueryUrl(raw);
    }

    // Looks like a domain (no spaces, has a dot)
    if (raw.indexOf(' ') === -1 && raw.indexOf('.') !== -1) {
      return 'https://' + raw;
    }

    // Otherwise treat as search
    return getSearchQueryUrl(raw);
  }

  function setOmniIconForUrl(url) {
    if (!el.omniIcon) return;
    var u = String(url || '').trim();
    var icon = '';

    var lockSvg = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5.5 7V5.2c0-1.4 1.1-2.6 2.5-2.6s2.5 1.2 2.5 2.6V7h.9c.9 0 1.6.7 1.6 1.6v4.1c0 .9-.7 1.6-1.6 1.6H4c-.9 0-1.6-.7-1.6-1.6V8.6C2.4 7.7 3.1 7 4 7h1.5zm1.2 0h2.6V5.2c0-.8-.6-1.4-1.3-1.4s-1.3.6-1.3 1.4V7z"/></svg>';
    var globeSvg = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm4.8 6H10.9a10.8 10.8 0 0 0-.8-3.1A5.3 5.3 0 0 1 12.8 7.5zM8 2.7c.8 1 1.5 2.8 1.7 4.8H6.3C6.5 5.5 7.2 3.7 8 2.7zM3.2 7.5A5.3 5.3 0 0 1 5.9 4.4a10.8 10.8 0 0 0-.8 3.1H3.2zm0 1.1h1.9c.1 1.1.4 2.2.8 3.1A5.3 5.3 0 0 1 3.2 8.6zM8 13.3c-.8-1-1.5-2.8-1.7-4.8h3.4c-.2 2-1 3.8-1.7 4.8zm2.1-1.6c.4-.9.7-2 .8-3.1h1.9a5.3 5.3 0 0 1-2.7 3.1z"/></svg>';
    var searchSvg = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.9 1.8a5.1 5.1 0 1 0 3.1 9.2l2.8 2.8a.7.7 0 0 0 1-1l-2.8-2.8a5.1 5.1 0 0 0-4.1-8.2zm0 1.4a3.7 3.7 0 1 1 0 7.4 3.7 3.7 0 0 1 0-7.4z"/></svg>';

    if (!u) icon = searchSvg;
    else if (u.indexOf('https://') === 0) icon = lockSvg;
    else icon = globeSvg;

    el.omniIcon.innerHTML = icon;
  }

  function getActiveTab() {
    if (!state.activeTabId) return null;
    for (var i = 0; i < state.tabs.length; i++) {
      if (state.tabs[i].id === state.activeTabId) return state.tabs[i];
    }
    return null;
  }

  // BUILD_WCV: find tab by main-process tabId
  function getTabByMainId(mainTabId) {
    for (var i = 0; i < state.tabs.length; i++) {
      if (state.tabs[i].mainTabId === mainTabId) return state.tabs[i];
    }
    return null;
  }

  function isWebModeActive() {
    try {
      return !!(document.body && document.body.classList && document.body.classList.contains('inWebMode'));
    } catch (e) {
      return false;
    }
  }

  function isTypingTarget(t) {
    if (!t) return false;
    var tag = (t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    try {
      if (t.isContentEditable) return true;
    } catch (e) {}
    return false;
  }

  function copyText(text) {
    var s = String(text || '');
    if (!s) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(s);
        return;
      }
    } catch (e) {}

    // Fallback
    try {
      var ta = document.createElement('textarea');
      ta.value = s;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e2) {}
  }

  // ---- BUILD_WEB_PARITY: Toast ----

  function showToast(msg) {
    if (!el.toast) return;
    el.toast.textContent = String(msg || '');
    el.toast.classList.remove('hidden');
    if (state.toastTimer) {
      try { clearTimeout(state.toastTimer); } catch (e) {}
      state.toastTimer = null;
    }
    state.toastTimer = setTimeout(function () {
      if (!el.toast) return;
      el.toast.classList.add('hidden');
    }, 2400);
  }

  // ---- BUILD_WEB_PARITY: Tips overlay ----

  function isTipsOpen() {
    return !!(el.tipsOverlay && !el.tipsOverlay.classList.contains('hidden'));
  }

  function showTips() {
    if (!el.tipsOverlay) return;
    el.tipsOverlay.classList.remove('hidden');
    el.tipsOverlay.setAttribute('aria-hidden', 'false');
  }

  function hideTips() {
    if (!el.tipsOverlay) return;
    el.tipsOverlay.classList.add('hidden');
    el.tipsOverlay.setAttribute('aria-hidden', 'true');
  }

  function toggleTips() {
    if (isTipsOpen()) hideTips();
    else showTips();
  }

  // ---- BUILD_WEB_PARITY: Custom context menu ----

  function hideContextMenu() {
    if (!el.contextMenu) return;
    el.contextMenu.classList.add('hidden');
    el.contextMenu.setAttribute('aria-hidden', 'true');
    el.contextMenu.innerHTML = '';
    state.ctxOpen = false;
  }

  function showContextMenu(items, x, y) {
    if (!el.contextMenu) return;
    if (!items || !items.length) return;

    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it && it.separator) {
        html += '<div class="contextMenuSep" role="separator"></div>';
        continue;
      }
      if (!it) continue;
      var disabled = it.disabled ? ' disabled' : '';
      html += '<button class="contextMenuItem" type="button" role="menuitem" data-ctx-idx="' + i + '"' + disabled + '>'
        + escapeHtml(it.label || '')
        + '</button>';
    }

    el.contextMenu.innerHTML = html;
    el.contextMenu.style.left = Math.max(8, x || 0) + 'px';
    el.contextMenu.style.top = Math.max(8, y || 0) + 'px';

    el.contextMenu.classList.remove('hidden');
    el.contextMenu.setAttribute('aria-hidden', 'false');

    // Clamp to viewport
    try {
      var r = el.contextMenu.getBoundingClientRect();
      var nx = x || 0;
      var ny = y || 0;
      if (r.right > window.innerWidth - 8) nx = Math.max(8, window.innerWidth - r.width - 8);
      if (r.bottom > window.innerHeight - 8) ny = Math.max(8, window.innerHeight - r.height - 8);
      el.contextMenu.style.left = nx + 'px';
      el.contextMenu.style.top = ny + 'px';
    } catch (e2) {}

    // Bind click handlers
    var btns = el.contextMenu.querySelectorAll('button.contextMenuItem');
    for (var j = 0; j < btns.length; j++) {
      (function () {
        var b = btns[j];
        var idx = parseInt(b.getAttribute('data-ctx-idx'), 10);
        b.onclick = function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          if (items[idx] && !items[idx].disabled && typeof items[idx].onClick === 'function') {
            try { items[idx].onClick(); } catch (e3) {}
          }
          hideContextMenu();
        };
      })();
    }

    state.ctxOpen = true;
  }

  function withContextMenuCloseHandlers() {
    // Close when clicking outside
    document.addEventListener('mousedown', function (e) {
      if (!state.ctxOpen) return;
      if (!el.contextMenu) return;
      if (el.contextMenu.contains(e.target)) return;
      hideContextMenu();
    }, true);

    window.addEventListener('blur', function () {
      if (!state.ctxOpen) return;
      hideContextMenu();
    });

    window.addEventListener('resize', function () {
      if (!state.ctxOpen) return;
      hideContextMenu();
    });
  }

  // ---- BUILD_WCV: Bounds reporting ----

  // FIX-WEB-MODE: View.setBounds uses CSS/logical pixels, not physical
  function getContainerBounds() {
    if (!el.viewContainer) return { x: 0, y: 0, width: 0, height: 0 };
    var rect = el.viewContainer.getBoundingClientRect();
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function reportBoundsForActiveTab() {
    var tab = getActiveTab();
    if (!tab || !tab.mainTabId || !state.browserOpen) return;
    if (state.split) {
      reportSplitBounds();
      return;
    }
    var bounds = getContainerBounds();
    webTabs.setBounds({ tabId: tab.mainTabId, bounds: bounds }).catch(function () {});
  }

  function reportSplitBounds() {
    if (!state.split || !el.viewContainer) return;
    var mainTab = getActiveTab();
    if (!mainTab || !mainTab.mainTabId) return;

    var splitTab = null;
    if (state.splitTabId) {
      for (var i = 0; i < state.tabs.length; i++) {
        if (state.tabs[i].id === state.splitTabId && state.tabs[i].id !== mainTab.id) {
          splitTab = state.tabs[i];
          break;
        }
      }
    }
    if (!splitTab || !splitTab.mainTabId) return;

    var rect = el.viewContainer.getBoundingClientRect();
    var totalW = rect.width;
    var dividerW = 4; // matches CSS .webSplitDivider width
    var leftW = Math.round((totalW - dividerW) * state.splitRatio);
    var rightW = Math.round((totalW - dividerW) * (1 - state.splitRatio));

    // FIX-WEB-MODE: setBounds uses CSS/logical pixels
    webTabs.splitBounds({
      left: {
        tabId: mainTab.mainTabId,
        bounds: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(leftW),
          height: Math.round(rect.height)
        }
      },
      right: {
        tabId: splitTab.mainTabId,
        bounds: {
          x: Math.round(rect.left + leftW + dividerW),
          y: Math.round(rect.top),
          width: Math.round(rightW),
          height: Math.round(rect.height)
        }
      }
    }).catch(function () {});
  }

  // ---- Sources management ----

  // BUILD_WEB_HOME: sidebar source list rendering
  function renderSources() {
    if (!el.sourcesList) return;
    var html = '';
    for (var i = 0; i < state.sources.length; i++) {
      var s = state.sources[i];
      var isActive = false;
      for (var j = 0; j < state.tabs.length; j++) {
        if (state.tabs[j].sourceId === s.id && state.tabs[j].id === state.activeTabId) {
          isActive = true;
          break;
        }
      }
      html += '<div class="webSourceItem' + (isActive ? ' active' : '') + '" data-source-id="' + s.id + '" role="listitem">'
        + '<span class="webSourceDot" style="background:' + (s.color || '#888') + '"></span>'
        + '<span class="webSourceName">' + escapeHtml(s.name) + '</span>'
        + '</div>';
    }
    el.sourcesList.innerHTML = html;
  }

  function loadSources() {
    api.webSources.get().then(function (res) {
      if (res && res.ok && Array.isArray(res.sources)) {
        state.sources = res.sources;
        renderSources();
        renderSourcesGrid(); // BUILD_WEB_HOME
        renderBrowserHome(); // Browser overlay home tiles
        renderContinue();    // BUILD_WEB_HOME
      }
    }).catch(function () {});
  }

  function loadBrowserSettings() {
    if (!api.webBrowserSettings || typeof api.webBrowserSettings.get !== 'function') {
      syncOmniPlaceholder();
      return;
    }
    api.webBrowserSettings.get().then(function (res) {
      if (!res || !res.ok || !res.settings) return;
      var settings = res.settings || {};
      state.browserSettings = {
        defaultSearchEngine: String(settings.defaultSearchEngine || 'yandex').trim().toLowerCase() || 'yandex'
      };
      syncOmniPlaceholder();
    }).catch(function () {
      syncOmniPlaceholder();
    });
  }

  function loadDestinations() {
    api.webSources.getDestinations().then(function (res) {
      if (res && res.ok) {
        if (el.destBooks) el.destBooks.textContent = res.books ? shortPath(res.books) : 'Not configured';
        if (el.destComics) el.destComics.textContent = res.comics ? shortPath(res.comics) : 'Not configured';
      }
    }).catch(function () {});
  }

  // ---- BUILD_WEB_HOME: Home view rendering ----

  function makeSourceCard(source) {
    var card = document.createElement('div');
    card.className = 'seriesCard webSourceCard';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    try { card.style.setProperty('--web-src-color', source.color || '#7a7a7a'); } catch (e) {}

    var coverWrap = document.createElement('div');
    coverWrap.className = 'seriesCoverWrap';

    var thumbWrap = document.createElement('div');
    thumbWrap.className = 'thumbWrap webSourceThumb';
    thumbWrap.style.background = source.color || '#555';

    var img = document.createElement('img');
    img.className = 'thumb webSourceFavicon';
    img.alt = '';
    img.src = getFaviconUrl(source.url);
    img.onerror = function () {
      img.style.display = 'none';
      var initial = document.createElement('div');
      initial.className = 'webSourceInitial';
      initial.textContent = (source.name || '?').charAt(0).toUpperCase();
      thumbWrap.appendChild(initial);
    };
    thumbWrap.appendChild(img);
    coverWrap.appendChild(thumbWrap);

    var name = document.createElement('div');
    name.className = 'seriesName';
    name.textContent = source.name || 'Source';

    card.appendChild(coverWrap);
    card.appendChild(name);

    card.onclick = function () { openBrowser(source); };

    // BUILD_WEB_PARITY: custom context menu
    card.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      showContextMenu([
        { label: 'Open', onClick: function () { openBrowser(source); } },
        { label: 'Open in new tab', onClick: function () { createTab(source, source.url); openBrowserForTab(state.activeTabId); } },
        { separator: true },
        { label: 'Edit source', onClick: function () { openAddSourceDialog(source); } },
        { label: 'Copy URL', onClick: function () { copyText(source.url || ''); showToast('Copied URL'); } },
        { separator: true },
        { label: 'Remove source', onClick: function () { removeSource(source.id); } }
      ], e.clientX, e.clientY);
    });

    card.onkeydown = function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openBrowser(source);
      }
    };

    return card;
  }

  function renderSourcesGrid() {
    if (!el.sourcesGrid || !el.sourcesEmpty) return;
    el.sourcesGrid.innerHTML = '';
    el.sourcesEmpty.classList.toggle('hidden', !!state.sources.length);
    if (!state.sources.length) return;

    for (var i = 0; i < state.sources.length; i++) {
      el.sourcesGrid.appendChild(makeSourceCard(state.sources[i]));
    }
  }

  function renderBrowserHome() {
    if (!el.browserHomeGrid || !el.browserHomeEmpty || !el.browserHomePanel) return;
    el.browserHomeGrid.innerHTML = '';
    el.browserHomeEmpty.classList.toggle('hidden', !!state.sources.length);
    for (var i = 0; i < state.sources.length; i++) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'webBrowserHomeCard';
      card.setAttribute('data-source-id', state.sources[i].id);

      var iconWrap = document.createElement('div');
      iconWrap.className = 'webBrowserHomeCardIcon';
      var img = document.createElement('img');
      img.alt = '';
      img.src = getFaviconUrl(state.sources[i].url);
      img.onerror = function () {
        this.style.display = 'none';
      };
      iconWrap.appendChild(img);

      var name = document.createElement('div');
      name.className = 'webBrowserHomeCardTitle';
      name.textContent = state.sources[i].name || 'Source';

      var url = document.createElement('div');
      url.className = 'webBrowserHomeCardUrl';
      url.textContent = state.sources[i].url || '';

      card.appendChild(iconWrap);
      card.appendChild(name);
      card.appendChild(url);
      el.browserHomeGrid.appendChild(card);
    }

    var show = !!state.showBrowserHome;
    el.browserHomePanel.classList.toggle('hidden', !show);
    if (el.viewContainer) el.viewContainer.classList.toggle('hidden', show);
  }

  function makeContinueTile(tab) {
    var tile = document.createElement('div');
    tile.className = 'contTile';

    var cover = document.createElement('div');
    cover.className = 'contCover webContCover';
    cover.style.background = getSourceColor(tab.sourceId);

    var img = document.createElement('img');
    img.className = 'webContFavicon';
    img.alt = '';
    img.src = getFaviconUrl(tab.homeUrl || tab.url);
    img.onerror = function () {
      img.style.display = 'none';
      var initial = document.createElement('div');
      initial.className = 'webContInitial';
      initial.textContent = (tab.sourceName || '?').charAt(0).toUpperCase();
      cover.appendChild(initial);
    };
    cover.appendChild(img);

    var removeBtn = document.createElement('button');
    removeBtn.className = 'contRemove';
    removeBtn.title = 'Close tab';
    removeBtn.textContent = 'X';
    removeBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      closeTab(tab.id);
      renderContinue();
    };
    cover.appendChild(removeBtn);

    tile.appendChild(cover);

    var titleWrap = document.createElement('div');
    titleWrap.className = 'contTitleWrap';
    var title = document.createElement('div');
    title.className = 'contTileTitle u-clamp2';
    title.textContent = tab.title || tab.sourceName || 'Tab';
    title.title = tab.title || tab.sourceName || '';
    titleWrap.appendChild(title);
    tile.appendChild(titleWrap);

    tile.onclick = function () { openBrowserForTab(tab.id); };

    // BUILD_WEB_PARITY: context menu on continue tile
    tile.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      showContextMenu([
        { label: 'Open', onClick: function () { openBrowserForTab(tab.id); } },
        { label: 'Close tab', onClick: function () { closeTab(tab.id); renderContinue(); } },
        { label: 'Copy page URL', onClick: function () { copyText(tab.url || tab.homeUrl || ''); showToast('Copied URL'); } },
        { separator: true },
        { label: 'Close all tabs', onClick: function () { closeAllTabs(); renderContinue(); } }
      ], e.clientX, e.clientY);
    });

    return tile;
  }

  function renderContinue() {
    if (!el.continuePanel || !el.continueEmpty) return;
    el.continuePanel.innerHTML = '';

    var hasTabs = state.tabs.length > 0;
    el.continuePanel.classList.toggle('hidden', !hasTabs);
    el.continueEmpty.classList.toggle('hidden', hasTabs);
    if (!hasTabs) return;

    for (var i = 0; i < state.tabs.length; i++) {
      el.continuePanel.appendChild(makeContinueTile(state.tabs[i]));
    }
  }

  // ---- BUILD_WEB_HOME: Browser view open/close ----

  var _libraryViewMap = { comics: 'libraryView', books: 'booksLibraryView', videos: 'videoLibraryView' };

  function _hideCurrentLibraryView() {
    var router = window.Tanko && window.Tanko.modeRouter;
    var mode = router ? router.getMode() : 'comics';
    var v = document.getElementById(_libraryViewMap[mode] || 'libraryView');
    if (v) v.classList.add('hidden');
  }

  function _showCurrentLibraryView() {
    var router = window.Tanko && window.Tanko.modeRouter;
    var mode = router ? router.getMode() : 'comics';
    var v = document.getElementById(_libraryViewMap[mode] || 'libraryView');
    if (v) v.classList.remove('hidden');
  }

  function openBrowser(source) {
    if (!source) {
      openHome();
      return;
    }

    // Check if a tab for this source already exists
    var existing = null;
    for (var j = 0; j < state.tabs.length; j++) {
      if (state.tabs[j].sourceId === source.id) { existing = state.tabs[j]; break; }
    }
    if (existing) {
      activateTab(existing.id);
    } else {
      createTab(source, source.url);
    }

    state.showBrowserHome = false;
    state.browserOpen = true;
    _hideCurrentLibraryView();
    if (el.browserView) el.browserView.classList.remove('hidden');
    if (el.browserTitle) el.browserTitle.textContent = source.name || '';
    renderSources();
    renderBrowserHome();
    syncLoadBar();
    // BUILD_WCV: report bounds after browser opens (needs a frame for layout)
    setTimeout(reportBoundsForActiveTab, 50);
  }

  function openHome() {
    state.showBrowserHome = true;
    state.browserOpen = true;
    _hideCurrentLibraryView();
    if (el.browserView) el.browserView.classList.remove('hidden');
    if (el.browserTitle) el.browserTitle.textContent = 'Browser Home';
    webTabs.hideAll().catch(function () {});
    renderBrowserHome();
    updateUrlDisplay();
    updateNavButtons();
    syncLoadBar();
  }

  function openBrowserForTab(tabId) {
    var tab = null;
    for (var i = 0; i < state.tabs.length; i++) {
      if (state.tabs[i].id === tabId) { tab = state.tabs[i]; break; }
    }
    if (!tab) return;

    activateTab(tabId);
    state.showBrowserHome = false;
    state.browserOpen = true;
    _hideCurrentLibraryView();
    if (el.browserView) el.browserView.classList.remove('hidden');
    if (el.browserTitle) el.browserTitle.textContent = tab.sourceName || '';
    renderSources();
    renderBrowserHome();
    syncLoadBar();
    // BUILD_WCV: report bounds after browser opens
    setTimeout(reportBoundsForActiveTab, 50);
  }

  function closeBrowser() {
    // MERIDIAN_SPLIT: unsplit when closing browser
    if (state.split) {
      state.split = false;
      state.splitTabId = null;
      var splitBtnEl = document.getElementById('webSplitBtn');
      if (splitBtnEl) splitBtnEl.classList.remove('active');
    }

    state.browserOpen = false;
    state.showBrowserHome = false;
    // BUILD_WCV: hide native views BEFORE showing library (prevents stale overlay)
    webTabs.hideAll().catch(function () {});
    if (el.browserView) el.browserView.classList.add('hidden');
    _showCurrentLibraryView();
    if (el.browserTitle) el.browserTitle.textContent = '';
    if (el.urlDisplay) {
      if (typeof el.urlDisplay.value !== 'undefined') el.urlDisplay.value = '';
      else el.urlDisplay.textContent = '';
    }
    setOmniIconForUrl('');
    renderSources();
    renderSourcesGrid();
    renderBrowserHome();
    renderContinue();
    hideTips();
    hideContextMenu();
    closeDownloadsPanel();
    syncLoadBar();
  }

  // ---- Tabs management ----

  function renderTabs() {
    if (!el.tabBar) return;
    var html = '';
    for (var i = 0; i < state.tabs.length; i++) {
      var t = state.tabs[i];
      var active = (t.id === state.activeTabId);
      var loadingClass = t.loading ? ' loading' : '';
      var favSrc = getFaviconUrl(t.url || t.homeUrl || '');
      var favHtml = favSrc ? ('<img class="webTabFaviconImg" src="' + escapeHtml(favSrc) + '" referrerpolicy="no-referrer" />') : '<span class="webTabFaviconFallback" aria-hidden="true"></span>';
      html += '<div class="webTab' + (active ? ' active' : '') + loadingClass + '" data-tab-id="' + t.id + '" role="tab" aria-selected="' + (active ? 'true' : 'false') + '" draggable="true">' +
        favHtml +
        '<span class="webTabLabel">' + escapeHtml(t.title || t.sourceName || 'Tab') + '</span>' +
        '<button class="webTabClose" data-close-tab="' + t.id + '" title="Close">Ã—</button>' +
        '</div>';
    }

    if (state.tabs.length < MAX_TABS) {
      html += '<div class="webTabAdd" id="webTabAdd" role="button" title="New tab">+</div>';
    }

    el.tabBar.innerHTML = html;

    // Bind tab clicks
    var tabs = el.tabBar.querySelectorAll('.webTab');
    for (var j = 0; j < tabs.length; j++) {
      tabs[j].onclick = function (e) {
        var tabId = parseInt(this.getAttribute('data-tab-id'), 10);
        if (e.target && e.target.classList && e.target.classList.contains('webTabClose')) return;
        activateTab(tabId);
      };
    }

    // Bind close buttons
    var closes = el.tabBar.querySelectorAll('.webTabClose');
    for (var k = 0; k < closes.length; k++) {
      closes[k].onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        var tabId = parseInt(this.getAttribute('data-close-tab'), 10);
        closeTab(tabId);
        renderContinue();
      };
    }

    // Bind add button
    var addBtn = qs('webTabAdd');
    if (addBtn) {
      addBtn.onclick = function () {
        openTabPicker();
      };
    }

    // MERIDIAN_DRAG: Tab drag reorder
    var tabEls = el.tabBar.querySelectorAll('.webTab[draggable]');
    for (var di = 0; di < tabEls.length; di++) {
      // Tab context menu + middle click close
      tabEls[di].addEventListener('auxclick', function (e) {
        if (!e || e.button !== 1) return;
        e.preventDefault();
        var id = Number(this.getAttribute('data-tab-id'));
        if (!isFinite(id)) return;
        closeTab(id);
      });

      tabEls[di].addEventListener('contextmenu', function (e) {
        try { e.preventDefault(); } catch (err) {}
        var id = Number(this.getAttribute('data-tab-id'));
        if (!isFinite(id)) return;
        var t = null, idx = -1;
        for (var i = 0; i < state.tabs.length; i++) {
          if (state.tabs[i] && state.tabs[i].id === id) { t = state.tabs[i]; idx = i; break; }
        }
        if (!t) return;
        var items = [];
        items.push({ label: 'New tab', onClick: function () { createTab(''); } });
        items.push({ label: 'Duplicate tab', onClick: function () { createTab(t.url || ''); } });
        items.push({ label: 'Reload', onClick: function () { if (state.activeTabId !== id) activateTab(id); if (t.mainTabId) webTabs.navigate({ tabId: t.mainTabId, action: 'reload' }).catch(function () {}); } });
        items.push({ separator: true });
        items.push({ label: 'Copy address', onClick: function () { copyText(t.url || ''); showToast('Copied'); } });
        items.push({ separator: true });
        items.push({ label: 'Close tab', onClick: function () { closeTab(id); } });
        items.push({ label: 'Close other tabs', onClick: function () {
          var ids = [];
          for (var i = 0; i < state.tabs.length; i++) if (state.tabs[i] && state.tabs[i].id !== id) ids.push(state.tabs[i].id);
          for (var j = 0; j < ids.length; j++) closeTab(ids[j]);
        }});
        items.push({ label: 'Close tabs to the right', onClick: function () {
          if (idx < 0) return;
          var ids = [];
          for (var i = idx + 1; i < state.tabs.length; i++) if (state.tabs[i]) ids.push(state.tabs[i].id);
          for (var j = 0; j < ids.length; j++) closeTab(ids[j]);
        }});
        showContextMenu(items, e.clientX, e.clientY);
      });

      tabEls[di].addEventListener('dragstart', function (e) {
        var id = this.getAttribute('data-tab-id');
        state.dragTabId = parseInt(id, 10);
        this.classList.add('dragging');
        try { e.dataTransfer.effectAllowed = 'move'; } catch (ex) {}
      });
      tabEls[di].addEventListener('dragend', function () {
        this.classList.remove('dragging');
        state.dragTabId = null;
        var all = el.tabBar.querySelectorAll('.webTab');
        for (var r = 0; r < all.length; r++) all[r].classList.remove('dragOver');
      });
      tabEls[di].addEventListener('dragover', function (e) {
        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'move'; } catch (ex) {}
        var all = el.tabBar.querySelectorAll('.webTab');
        for (var r = 0; r < all.length; r++) all[r].classList.remove('dragOver');
        this.classList.add('dragOver');
      });
      tabEls[di].addEventListener('dragleave', function () {
        this.classList.remove('dragOver');
      });
      tabEls[di].addEventListener('drop', function (e) {
        e.preventDefault();
        this.classList.remove('dragOver');
        var targetId = parseInt(this.getAttribute('data-tab-id'), 10);
        if (isNaN(targetId) || state.dragTabId == null || state.dragTabId === targetId) return;
        var fromIdx = -1;
        var toIdx = -1;
        for (var ti = 0; ti < state.tabs.length; ti++) {
          if (state.tabs[ti].id === state.dragTabId) fromIdx = ti;
          if (state.tabs[ti].id === targetId) toIdx = ti;
        }
        if (fromIdx === -1 || toIdx === -1) return;
        var moved = state.tabs.splice(fromIdx, 1)[0];
        state.tabs.splice(toIdx, 0, moved);
        state.dragTabId = null;
        renderTabs();
      });
    }

    syncLoadBar();
  }

  function syncLoadBar() {
    if (!el.loadBar) return;
    var t = getActiveTab();
    var show = !!(state.browserOpen && t && t.loading);
    el.loadBar.classList.toggle('hidden', !show);
  }

  function syncDownloadIndicator() {
    if (el.dlPill) {
      var show = state.downloading > 0;
      el.dlPill.classList.toggle('hidden', !show);
      if (show) {
        var label = state.downloadingHasProgress ? 'Downloadingâ€¦' : 'Pausedâ€¦';
        if (state.downloading > 1) el.dlPill.textContent = label + ' (' + state.downloading + ')';
        else el.dlPill.textContent = label;
      }
    }

    if (el.downloadStatus) {
      if (state.downloading > 0) {
        el.downloadStatus.textContent = state.lastDownloadName ? ((state.downloadingHasProgress ? 'Downloading: ' : 'Paused: ') + state.lastDownloadName) : ((state.downloadingHasProgress ? 'Downloadingâ€¦ (' : 'Pausedâ€¦ (') + state.downloading + ')');
      } else {
        // keep whatever latest completion message set; fall back if blank
        if (!el.downloadStatus.textContent) el.downloadStatus.textContent = 'No active downloads';
      }
    }

    if (el.dlBadge) {
      el.dlBadge.classList.toggle('hidden', !(state.downloading > 0));
    }

    // Sidebar progress bar (web home sidebar)
    if (el.sidebarDlRow && el.sidebarDlFill && el.sidebarDlPct) {
      if (state.downloading <= 0) {
        el.sidebarDlRow.classList.add('hidden');
        el.sidebarDlFill.style.width = '0%';
        el.sidebarDlPct.textContent = '0%';
      } else {
        // Pick a representative active download
        var p = null;
        var bestAt = -1;
        for (var i = 0; i < state.downloads.length; i++) {
          var d = state.downloads[i];
          if (!d || (d.state !== 'progressing' && d.state !== 'paused')) continue;
          var at = Number(d.startedAt || 0);
          if (at >= bestAt) {
            bestAt = at;
            p = d.progress;
          }
        }
        if (typeof p !== 'number' || !isFinite(p)) p = state.lastDownloadProgress;
        if (typeof p !== 'number' || !isFinite(p)) p = 0;
        if (p < 0) p = 0;
        if (p > 1) p = 1;
        var pct = Math.round(p * 100);
        el.sidebarDlRow.classList.remove('hidden');
        el.sidebarDlFill.style.width = pct + '%';
        el.sidebarDlPct.textContent = pct + '%';
      }
    }
  }

  // ---- Downloads panel ----

  function formatBytes(n) {
    n = Number(n || 0);
    if (!isFinite(n) || n <= 0) return '0 B';
    var u = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = 0;
    while (n >= 1024 && i < u.length - 1) { n = n / 1024; i++; }
    var dp = i <= 1 ? 0 : (i === 2 ? 1 : 2);
    return n.toFixed(dp) + ' ' + u[i];
  }

  function formatSpeed(bps) {
    bps = Number(bps || 0);
    if (!isFinite(bps) || bps <= 0) return '';
    return formatBytes(bps) + '/s';
  }

  function formatEta(received, total, bps) {
    received = Number(received || 0);
    total = Number(total || 0);
    bps = Number(bps || 0);
    if (!isFinite(received) || !isFinite(total) || !isFinite(bps) || total <= 0 || bps <= 0) return '';
    var s = Math.max(0, Math.round((total - received) / bps));
    if (s <= 0) return '';
    var m = Math.floor(s / 60);
    var r = s % 60;
    if (m >= 60) {
      var h = Math.floor(m / 60);
      var mm = m % 60;
      return h + 'h ' + mm + 'm';
    }
    if (m > 0) return m + 'm ' + r + 's';
    return r + 's';
  }

  function hostFromUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    try {
      if (u.indexOf('http') !== 0) u = 'https://' + u.replace(/^\/+/, '');
      var x = new URL(u);
      return x.hostname || '';
    } catch (e) {
      return '';
    }
  }

  function faviconFor(u) {
    var h = hostFromUrl(u);
    if (!h) return '';
    return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(h) + '&sz=128';
  }

  function normalizeDownload(d) {
    if (!d) return null;
    var out = {
      id: String(d.id || ''),
      filename: String(d.filename || ''),
      destination: d.destination != null ? String(d.destination) : '',
      library: d.library != null ? String(d.library) : '',
      state: String(d.state || ''),
      startedAt: d.startedAt != null ? Number(d.startedAt) : null,
      finishedAt: d.finishedAt != null ? Number(d.finishedAt) : null,
      error: d.error != null ? String(d.error) : '',
      pageUrl: d.pageUrl != null ? String(d.pageUrl) : '',
      downloadUrl: d.downloadUrl != null ? String(d.downloadUrl) : '',
      receivedBytes: d.receivedBytes != null ? Number(d.receivedBytes) : 0,
      totalBytes: d.totalBytes != null ? Number(d.totalBytes) : 0,
      progress: d.progress != null ? Number(d.progress) : null,
      bytesPerSec: d.bytesPerSec != null ? Number(d.bytesPerSec) : 0,
    };
    if (out.state === 'downloading' || out.state === 'in_progress' || out.state === 'progressing') out.state = 'progressing';
    if (out.state === 'paused') out.state = 'paused';
    if (out.state === 'cancelled') out.state = 'cancelled';
    if (typeof out.progress === 'number') out.progress = Math.max(0, Math.min(1, out.progress));
    if (out.progress == null && out.totalBytes > 0 && out.receivedBytes >= 0) out.progress = Math.max(0, Math.min(1, out.receivedBytes / out.totalBytes));
    if (!out.id) out.id = 'dl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    return out;
  }

  function recomputeDownloadingCount() {
    var active = 0;
    var hasProgress = false;
    for (var i = 0; i < state.downloads.length; i++) {
      var d = state.downloads[i];
      if (!d) continue;
      if (d.state === 'progressing') { active++; hasProgress = true; }
      else if (d.state === 'paused') { active++; }
    }
    state.downloading = active;
    state.downloadingHasProgress = hasProgress;
  }

  var dlRenderTimer = null;
  function scheduleDlRender() {
    if (dlRenderTimer) return;
    dlRenderTimer = setTimeout(function () {
      dlRenderTimer = null;
      renderDownloadsPanel();
      renderHomeDownloads();
      renderHubDirectActive();
      renderHubDownloadHistory();
    }, 120);
  }

  function upsertDownload(info) {
    if (!info) return;
    var id = info.id != null ? String(info.id) : '';
    var dest = info.destination || info.path || '';
    dest = dest ? String(dest) : '';
    var fn = info.filename != null ? String(info.filename) : '';

    var found = null;
    for (var i = 0; i < state.downloads.length; i++) {
      var d = state.downloads[i];
      if (!d) continue;
      if (id && d.id === id) { found = d; break; }
      if (!id && dest && d.destination === dest) { found = d; break; }
      if (!id && fn && d.filename === fn && d.state === 'progressing') { found = d; break; }
    }

    if (!found) {
      found = normalizeDownload(info);
      state.downloads.unshift(found);
    } else {
      var n = normalizeDownload(Object.assign({}, found, info));
      Object.assign(found, n);
    }

    if (state.downloads.length > 1000) state.downloads.length = 1000;
    recomputeDownloadingCount();
    scheduleDlRender();
  }

  function loadDownloadHistory() {
    if (!api || !api.webSources || !api.webSources.getDownloadHistory) return;
    api.webSources.getDownloadHistory().then(function (res) {
      if (!res || !res.ok || !Array.isArray(res.downloads)) return;
      state.downloads = [];
      for (var i = 0; i < res.downloads.length; i++) {
        var d = normalizeDownload(res.downloads[i]);
        if (d) state.downloads.push(d);
      }
      recomputeDownloadingCount();
      renderDownloadsPanel();
      renderHomeDownloads();
      renderHubDirectActive();
      renderHubDownloadHistory();
    }).catch(function () {});
  }

  function renderDownloadList(targetEl, emptyEl, list, opts) {
    if (!targetEl || !emptyEl) return;
    opts = opts || {};
    list = list || [];

    if (!list.length) {
      targetEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    var html = '';
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (!d) continue;

      var isActive = d.state === 'progressing';
      var isOk = d.state === 'completed';
      var isBad = d.state === 'failed' || d.state === 'interrupted';

      var stateTxt = isActive ? 'Downloading' : (isOk ? 'Saved' : 'Failed');

      var sub = '';
      var libTag = d.library ? ('\u2192 ' + d.library) : '';
      if (isActive) {
        var left = (d.totalBytes > 0 && d.receivedBytes >= 0) ? (formatBytes(d.receivedBytes) + ' / ' + formatBytes(d.totalBytes)) : '';
        var sp = formatSpeed(d.bytesPerSec);
        var eta = formatEta(d.receivedBytes, d.totalBytes, d.bytesPerSec);
        sub = libTag;
        if (left) sub = (sub ? (sub + ' \u2022 ') : '') + left;
        if (sp) sub = (sub ? (sub + ' \u2022 ') : '') + sp;
        if (eta) sub = (sub ? (sub + ' \u2022 ') : '') + eta;
      } else if (isOk) {
        sub = libTag;
        if (d.destination) sub = (sub ? (sub + ' \u2022 ') : '') + shortPath(d.destination);
      } else {
        sub = d.error ? d.error : 'Download failed';
      }

      var p = null;
      if (isActive) {
        if (typeof d.progress === 'number') p = Math.max(0, Math.min(1, d.progress));
        else if (d.totalBytes > 0) p = Math.max(0, Math.min(1, d.receivedBytes / d.totalBytes));
      }
      var pctTxt = (p != null) ? Math.round(p * 100) + '%' : '';
      var iconUrl = faviconFor(d.pageUrl || d.downloadUrl);

      html += '' +
        '<div class="webDlItem' + (opts.compact ? ' webDlItem--compact' : '') + '" data-dl-id="' + escapeHtml(d.id) + '">' +
          '<div class="webDlIcon">' +
            (iconUrl ? ('<img class="webDlFavicon" src="' + escapeHtml(iconUrl) + '" alt=""/>') : '<div class="webDlFaviconFallback"></div>') +
          '</div>' +
          '<div class="webDlMeta">' +
            '<div class="webDlName">' + escapeHtml(d.filename) + '</div>' +
            '<div class="webDlSub">' + escapeHtml(sub) + '</div>' +
            (isActive ? ('<div class="webDlProgressWrap">' +
              '<div class="webDlProgressBar"><div class="webDlProgressFill" style="width:' + escapeHtml(pctTxt || '0%') + '"></div></div>' +
              '<div class="webDlProgressText">' + escapeHtml(pctTxt) + '</div>' +
            '</div>') : '') +
          '</div>' +
          '<div class="webDlRight">' +
            '<div class="webDlState' + (isBad ? ' webDlState--bad' : '') + '">' + escapeHtml(stateTxt) + '</div>' +
            (opts.allowRemove ? ('<button class="iconBtn webDlRemove" title="Remove" aria-label="Remove" data-dl-remove="1">&times;</button>') : '') +
          '</div>' +
        '</div>';
    }

    targetEl.innerHTML = html;

    var items = targetEl.querySelectorAll('.webDlItem');
    for (var j = 0; j < items.length; j++) {
      items[j].onclick = function (e) {
        var t = e && e.target;
        if (t && t.getAttribute && t.getAttribute('data-dl-remove') === '1') return;
        var id = this.getAttribute('data-dl-id');
        var d = null;
        for (var k = 0; k < state.downloads.length; k++) {
          if (state.downloads[k] && state.downloads[k].id === id) { d = state.downloads[k]; break; }
        }
        if (!d) return;
        if (d.state === 'completed' && d.destination && api && api.shell && api.shell.revealPath) {
          try { api.shell.revealPath(d.destination); } catch (err) {}
        } else if (d.state === 'progressing') {
          showToast('Download in progress');
        } else if (d.destination && api && api.shell && api.shell.revealPath) {
          try { api.shell.revealPath(d.destination); } catch (err2) {}
        }
      };

      var rm = items[j].querySelector('.webDlRemove');
      if (rm) {
        rm.onclick = function (e) {
          try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
          var p = this.parentElement;
          while (p && !p.classList.contains('webDlItem')) p = p.parentElement;
          if (!p) return;
          var id = p.getAttribute('data-dl-id');
          var d = null;
          for (var k = 0; k < state.downloads.length; k++) {
            if (state.downloads[k] && state.downloads[k].id === id) { d = state.downloads[k]; break; }
          }
          if (!d || d.state === 'progressing') {
            showToast('Can\'t remove an active download');
            return;
          }
          if (api && api.webSources && api.webSources.removeDownloadHistory) {
            api.webSources.removeDownloadHistory({ id: id }).then(function () {
              state.downloads = state.downloads.filter(function (x) { return x && x.id !== id; });
              recomputeDownloadingCount();
              scheduleDlRender();
            }).catch(function () {});
          }
        };
      }
    }
  }

  function renderDownloadsPanel() {
    if (!el.dlList || !el.dlEmpty) return;
    renderDownloadList(el.dlList, el.dlEmpty, state.downloads, { allowRemove: true });
  }

  function renderHomeDownloads() {
    if (!el.homeDlList || !el.homeDlEmpty) return;
    var act = [];
    var rest = [];
    for (var i = 0; i < state.downloads.length; i++) {
      var d = state.downloads[i];
      if (!d) continue;
      if (d.state === 'progressing') act.push(d);
      else rest.push(d);
    }
    var list = act.concat(rest).slice(0, 8);
    renderDownloadList(el.homeDlList, el.homeDlEmpty, list, { compact: true, allowRemove: true });
  }

  function isDirectActiveState(stateStr) {
    var s = String(stateStr || '').toLowerCase();
    return s === 'progressing' || s === 'downloading' || s === 'paused' || s === 'in_progress';
  }

  function isTorrentActiveState(stateStr) {
    var s = String(stateStr || '').toLowerCase();
    return s === 'downloading' || s === 'paused' || s === 'checking';
  }

  function formatWhen(ts) {
    var n = Number(ts || 0);
    if (!n) return '';
    try { return new Date(n).toLocaleString(); } catch (e) { return ''; }
  }

  function pctText(p) {
    var n = Number(p);
    if (!isFinite(n)) return '';
    if (n < 0) n = 0;
    if (n > 1) n = 1;
    return Math.round(n * 100) + '%';
  }

  function renderHubDirectActive() {
    if (!el.hubDirectActiveList || !el.hubDirectActiveEmpty) return;
    var active = [];
    for (var i = 0; i < state.downloads.length; i++) {
      var d = state.downloads[i];
      if (!d) continue;
      if (!isDirectActiveState(d.state)) continue;
      active.push(d);
    }
    active.sort(function (a, b) { return Number(b.startedAt || 0) - Number(a.startedAt || 0); });

    if (!active.length) {
      el.hubDirectActiveList.innerHTML = '';
      el.hubDirectActiveEmpty.classList.remove('hidden');
      return;
    }
    el.hubDirectActiveEmpty.classList.add('hidden');

    var html = '';
    for (var j = 0; j < active.length; j++) {
      var x = active[j];
      var pTxt = pctText(x.progress);
      var sub = (x.library ? ('\u2192 ' + x.library) : 'Direct download') + (pTxt ? (' \u2022 ' + pTxt) : '');
      var pauseResume = String(x.state) === 'paused'
        ? '<button class="btn btn-ghost btn-sm" data-direct-action="resume" data-direct-id="' + escapeHtml(x.id) + '">Resume</button>'
        : '<button class="btn btn-ghost btn-sm" data-direct-action="pause" data-direct-id="' + escapeHtml(x.id) + '">Pause</button>';

      html += '' +
        '<div class="webHubItem" data-direct-open-id="' + escapeHtml(x.id) + '">' +
          '<div class="webHubItemTop">' +
            '<div class="webHubItemTitle">' + escapeHtml(x.filename || 'Download') + '</div>' +
            '<span class="webHubBadge">Direct</span>' +
          '</div>' +
          '<div class="webHubItemSub">' + escapeHtml(sub) + '</div>' +
          (pTxt ? ('<div class="webHubProgress"><div class="webHubProgressFill" style="width:' + escapeHtml(pTxt) + '"></div></div>') : '') +
          '<div class="webHubSectionActions">' +
            pauseResume +
            '<button class="btn btn-ghost btn-sm" data-direct-action="cancel" data-direct-id="' + escapeHtml(x.id) + '">Cancel</button>' +
          '</div>' +
        '</div>';
    }
    el.hubDirectActiveList.innerHTML = html;
  }

  function normalizeTorrentEntry(t) {
    if (!t) return null;
    return {
      id: String(t.id || ''),
      infoHash: String(t.infoHash || ''),
      name: String(t.name || ''),
      state: String(t.state || ''),
      progress: Number(t.progress || 0),
      downloadRate: Number(t.downloadRate || 0),
      uploaded: Number(t.uploaded || 0),
      downloaded: Number(t.downloaded || 0),
      startedAt: Number(t.startedAt || 0),
      finishedAt: t.finishedAt != null ? Number(t.finishedAt) : null,
      error: String(t.error || ''),
      routedFiles: Number(t.routedFiles || 0),
      ignoredFiles: Number(t.ignoredFiles || 0),
      failedFiles: Number(t.failedFiles || 0),
    };
  }

  function renderHubTorrentActive() {
    if (!el.hubTorrentActiveList || !el.hubTorrentActiveEmpty) return;
    var active = [];
    for (var i = 0; i < state.torrentActive.length; i++) {
      var t = state.torrentActive[i];
      if (!t || !isTorrentActiveState(t.state)) continue;
      active.push(t);
    }
    active.sort(function (a, b) { return Number(b.startedAt || 0) - Number(a.startedAt || 0); });

    if (!active.length) {
      el.hubTorrentActiveList.innerHTML = '';
      el.hubTorrentActiveEmpty.classList.remove('hidden');
      return;
    }
    el.hubTorrentActiveEmpty.classList.add('hidden');

    var html = '';
    for (var j = 0; j < active.length; j++) {
      var x = active[j];
      var pTxt = pctText(x.progress);
      var speed = x.downloadRate > 0 ? (' \u2022 ' + formatSpeed(x.downloadRate)) : '';
      var sub = (x.state || 'downloading') + (pTxt ? (' \u2022 ' + pTxt) : '') + speed;
      var pauseResume = String(x.state) === 'paused'
        ? '<button class="btn btn-ghost btn-sm" data-torrent-action="resume" data-torrent-id="' + escapeHtml(x.id) + '">Resume</button>'
        : '<button class="btn btn-ghost btn-sm" data-torrent-action="pause" data-torrent-id="' + escapeHtml(x.id) + '">Pause</button>';

      html += '' +
        '<div class="webHubItem">' +
          '<div class="webHubItemTop">' +
            '<div class="webHubItemTitle">' + escapeHtml(x.name || x.infoHash || 'Torrent') + '</div>' +
            '<span class="webHubBadge">Torrent</span>' +
          '</div>' +
          '<div class="webHubItemSub">' + escapeHtml(sub) + '</div>' +
          (pTxt ? ('<div class="webHubProgress"><div class="webHubProgressFill" style="width:' + escapeHtml(pTxt) + '"></div></div>') : '') +
          '<div class="webHubSectionActions">' +
            pauseResume +
            '<button class="btn btn-ghost btn-sm" data-torrent-action="cancel" data-torrent-id="' + escapeHtml(x.id) + '">Cancel</button>' +
          '</div>' +
        '</div>';
    }
    el.hubTorrentActiveList.innerHTML = html;
  }

  function buildUnifiedHistory() {
    var merged = [];
    for (var i = 0; i < state.downloads.length; i++) {
      var d = state.downloads[i];
      if (!d || !d.id) continue;
      if (isDirectActiveState(d.state)) continue;
      merged.push({
        id: 'direct:' + d.id,
        transport: 'direct',
        rawId: d.id,
        filename: d.filename || 'Download',
        state: d.state || '',
        progress: d.progress,
        startedAt: Number(d.startedAt || 0),
        finishedAt: Number(d.finishedAt || 0) || null,
        library: d.library || '',
        error: d.error || '',
        destination: d.destination || ''
      });
    }

    for (var j = 0; j < state.torrentHistory.length; j++) {
      var t = state.torrentHistory[j];
      if (!t || !t.id) continue;
      if (isTorrentActiveState(t.state)) continue;
      merged.push({
        id: 'torrent:' + t.id,
        transport: 'torrent',
        rawId: t.id,
        filename: t.name || t.infoHash || 'Torrent',
        state: t.state || '',
        progress: t.progress,
        startedAt: Number(t.startedAt || 0),
        finishedAt: Number(t.finishedAt || 0) || null,
        library: '',
        error: t.error || '',
        destination: ''
      });
    }

    merged.sort(function (a, b) { return Number(b.startedAt || 0) - Number(a.startedAt || 0); });
    if (merged.length > MAX_UNIFIED_HISTORY_UI) merged.length = MAX_UNIFIED_HISTORY_UI;
    return merged;
  }

  function renderHubDownloadHistory() {
    if (!el.hubDownloadHistoryList || !el.hubDownloadHistoryEmpty) return;
    var list = buildUnifiedHistory();
    if (!list.length) {
      el.hubDownloadHistoryList.innerHTML = '';
      el.hubDownloadHistoryEmpty.classList.remove('hidden');
      return;
    }
    el.hubDownloadHistoryEmpty.classList.add('hidden');

    var html = '';
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      var when = formatWhen(x.finishedAt || x.startedAt);
      var sub = (x.state || 'done') + (x.library ? (' \u2022 ' + x.library) : '') + (when ? (' \u2022 ' + when) : '');
      var badge = x.transport === 'torrent' ? 'Torrent' : 'Direct';
      var removeBtn = '<button class="btn btn-ghost btn-sm" data-unified-remove-id="' + escapeHtml(x.id) + '">Remove</button>';
      html += '' +
        '<div class="webHubItem" data-unified-open-id="' + escapeHtml(x.id) + '">' +
          '<div class="webHubItemTop">' +
            '<div class="webHubItemTitle">' + escapeHtml(x.filename) + '</div>' +
            '<span class="webHubBadge">' + escapeHtml(badge) + '</span>' +
          '</div>' +
          '<div class="webHubItemSub">' + escapeHtml(sub) + (x.error ? (' \u2022 ' + escapeHtml(x.error)) : '') + '</div>' +
          '<div class="webHubSectionActions">' + removeBtn + '</div>' +
        '</div>';
    }
    el.hubDownloadHistoryList.innerHTML = html;
  }

  function renderHubBrowsingHistory() {
    if (!el.hubBrowseHistoryList || !el.hubBrowseHistoryEmpty) return;
    var list = state.browsingHistory || [];
    if (!list.length) {
      el.hubBrowseHistoryList.innerHTML = '';
      el.hubBrowseHistoryEmpty.classList.remove('hidden');
      return;
    }
    el.hubBrowseHistoryEmpty.classList.add('hidden');

    var html = '';
    for (var i = 0; i < list.length; i++) {
      var x = list[i] || {};
      var title = x.title || x.url || 'History';
      var sub = (x.url || '') + (x.visitedAt ? (' \u2022 ' + formatWhen(x.visitedAt)) : '');
      html += '' +
        '<div class="webHubItem" data-history-open-id="' + escapeHtml(String(x.url || '')) + '">' +
          '<div class="webHubItemTop">' +
            '<div class="webHubItemTitle">' + escapeHtml(title) + '</div>' +
          '</div>' +
          '<div class="webHubItemSub">' + escapeHtml(sub) + '</div>' +
          '<div class="webHubSectionActions">' +
            '<button class="btn btn-ghost btn-sm" data-history-remove-id="' + escapeHtml(String(x.id || '')) + '">Remove</button>' +
          '</div>' +
        '</div>';
    }
    el.hubBrowseHistoryList.innerHTML = html;
  }

  function renderHubAll() {
    renderHubDirectActive();
    renderHubTorrentActive();
    renderHubDownloadHistory();
    renderHubBrowsingHistory();
  }

  function loadBrowsingHistory() {
    if (!api.webHistory || typeof api.webHistory.list !== 'function') return;
    api.webHistory.list({
      query: String(state.browsingHistoryQuery || ''),
      limit: MAX_BROWSING_HISTORY_UI
    }).then(function (res) {
      if (!res || !res.ok || !Array.isArray(res.entries)) return;
      state.browsingHistory = res.entries;
      renderHubBrowsingHistory();
    }).catch(function () {});
  }

  function refreshTorrentState() {
    if (!api.webTorrent) return;
    var p1 = (typeof api.webTorrent.getActive === 'function') ? api.webTorrent.getActive() : Promise.resolve({ ok: false, torrents: [] });
    var p2 = (typeof api.webTorrent.getHistory === 'function') ? api.webTorrent.getHistory() : Promise.resolve({ ok: false, torrents: [] });

    Promise.all([p1, p2]).then(function (results) {
      var activeRes = results[0] || {};
      var histRes = results[1] || {};
      state.torrentActive = [];
      state.torrentHistory = [];

      if (activeRes.ok && Array.isArray(activeRes.torrents)) {
        for (var i = 0; i < activeRes.torrents.length; i++) {
          var a = normalizeTorrentEntry(activeRes.torrents[i]);
          if (a) state.torrentActive.push(a);
        }
      }
      if (histRes.ok && Array.isArray(histRes.torrents)) {
        for (var j = 0; j < histRes.torrents.length; j++) {
          var h = normalizeTorrentEntry(histRes.torrents[j]);
          if (h) state.torrentHistory.push(h);
        }
      }
      renderHubTorrentActive();
      renderHubDownloadHistory();
    }).catch(function () {});
  }

  function maybeRecordBrowsingHistory(tab, url) {
    if (!tab || !url || !api.webHistory || typeof api.webHistory.add !== 'function') return;
    var u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u)) return;
    var now = Date.now();
    if (tab._lastHistoryUrl === u && (now - Number(tab._lastHistoryAt || 0) < 3000)) return;
    tab._lastHistoryUrl = u;
    tab._lastHistoryAt = now;
    api.webHistory.add({
      url: u,
      title: String(tab.title || tab.sourceName || ''),
      visitedAt: now,
      sourceTabId: String(tab.id)
    }).catch(function () {});
  }

  function openDownloadsPanel() {
    if (!el.dlPanel) return;
    state.dlPanelOpen = true;
    el.dlPanel.classList.remove('hidden');
    try { el.dlPanel.setAttribute('aria-hidden', 'false'); } catch (e) {}
    renderDownloadsPanel();
  }

  function closeDownloadsPanel() {
    if (!el.dlPanel) return;
    state.dlPanelOpen = false;
    el.dlPanel.classList.add('hidden');
    try { el.dlPanel.setAttribute('aria-hidden', 'true'); } catch (e) {}
    // No native resize needed; downloads panel floats above the content like Chrome.
  }

  function toggleDownloadsPanel() {
    if (state.dlPanelOpen) closeDownloadsPanel();
    else openDownloadsPanel();
  }

  // FIX-WEB-DL: Chrome-like download bottom bar

  var DL_BAR_AUTO_HIDE_MS = 5000;

  function showDlBar(text, progress) {
    if (!el.dlBar || state.dlBarDismissed) return;
    if (el.dlBarText) el.dlBarText.textContent = text || '';
    if (typeof progress === 'number' && progress >= 0) {
      if (el.dlBarProgress) el.dlBarProgress.classList.remove('hidden');
      if (el.dlBarProgressFill) el.dlBarProgressFill.style.width = Math.round(Math.max(0, Math.min(1, progress)) * 100) + '%';
    } else {
      if (el.dlBarProgress) el.dlBarProgress.classList.add('hidden');
    }
    el.dlBar.classList.remove('hidden');
    if (state.dlBarTimer) { try { clearTimeout(state.dlBarTimer); } catch (e) {} state.dlBarTimer = null; }
  }

  function hideDlBar() {
    if (!el.dlBar) return;
    el.dlBar.classList.add('hidden');
    if (state.dlBarTimer) { try { clearTimeout(state.dlBarTimer); } catch (e) {} state.dlBarTimer = null; }
  }

  function autohideDlBar() {
    if (state.dlBarTimer) { try { clearTimeout(state.dlBarTimer); } catch (e) {} }
    state.dlBarTimer = setTimeout(function () {
      state.dlBarTimer = null;
      hideDlBar();
    }, DL_BAR_AUTO_HIDE_MS);
  }

  // ---- Popup â†’ new tab ----

  function openPopupUrlInNewTab(url, parentTab) {
    url = String(url || '').trim();
    if (!url) return;

    var src = null;
    if (parentTab && parentTab.sourceId != null) {
      src = getSourceById(parentTab.sourceId);
      if (!src) {
        src = {
          id: parentTab.sourceId || 0,
          name: parentTab.sourceName || 'Tab',
          url: parentTab.homeUrl || parentTab.url || url,
          color: '#555'
        };
      }
    }

    if (!src) {
      var at = getActiveTab();
      if (at) {
        src = getSourceById(at.sourceId) || {
          id: at.sourceId || 0,
          name: at.sourceName || 'Tab',
          url: at.homeUrl || at.url || url,
          color: '#555'
        };
      }
    }

    if (!src) {
      src = { id: 0, name: 'New Tab', url: url, color: '#555' };
    }

    createTab(src, url, { toastText: 'Opened in new tab' });
  }

  // BUILD_WCV: createTab now uses IPC instead of DOM webview
  function createTab(source, urlOverride, opts) {
    opts = opts || {};
    if (state.tabs.length >= MAX_TABS) {
      showToast('Tab limit reached');
      return;
    }

    var tabId = state.nextTabId++;
    var homeUrl = source.url;
    var startUrl = urlOverride || source.url;

    var tab = {
      id: tabId,
      sourceId: source.id,
      sourceName: source.name,
      title: source.name,
      url: startUrl,
      homeUrl: homeUrl,
      mainTabId: null,  // BUILD_WCV: set after IPC create resolves
      loading: false,
      canGoBack: false,
      canGoForward: false
    };

    state.tabs.push(tab);
    state.activeTabId = tabId;
    state.showBrowserHome = false;
    renderTabs();
    renderBrowserHome();
    renderContinue();

    if (!opts.silentToast) {
      showToast(opts.toastText || ('Opened: ' + (source.name || 'Source')));
    }

    // BUILD_WCV: create WebContentsView in main process
    webTabs.create({ url: startUrl }).then(function (res) {
      if (res && res.ok && res.tabId) {
        tab.mainTabId = res.tabId;
        // Activate this tab's view (show it, hide others)
        webTabs.activate({ tabId: res.tabId }).catch(function () {});
        // Report bounds after a frame so layout is settled
        setTimeout(reportBoundsForActiveTab, 50);
      }
    }).catch(function (e) {
      console.warn('[BUILD_WCV] Failed to create tab view', e);
    });
  }

  // BUILD_WCV: activateTab uses IPC instead of CSS visibility
  function activateTab(tabId) {
    state.activeTabId = tabId;
    state.showBrowserHome = false;
    var tab = getActiveTab();
    if (tab && tab.mainTabId) {
      webTabs.activate({ tabId: tab.mainTabId }).catch(function () {});
      // Defer bounds report to let layout settle
      setTimeout(reportBoundsForActiveTab, 30);
    }
    renderTabs();
    renderBrowserHome();
    updateNavButtons();
    updateUrlDisplay();
    syncLoadBar();
    renderSources();
  }

  function switchTab(delta) {
    if (!state.tabs.length) return;
    var cur = -1;
    for (var i = 0; i < state.tabs.length; i++) {
      if (state.tabs[i].id === state.activeTabId) { cur = i; break; }
    }
    if (cur === -1) cur = 0;
    var next = (cur + delta) % state.tabs.length;
    if (next < 0) next = state.tabs.length - 1;
    activateTab(state.tabs[next].id);
  }

  // BUILD_WCV: closeTab uses IPC to destroy view
  function closeTab(tabId) {
    var idx = -1;
    for (var i = 0; i < state.tabs.length; i++) {
      if (state.tabs[i].id === tabId) { idx = i; break; }
    }
    if (idx === -1) return;

    var tab = state.tabs[idx];

    // MERIDIAN_SPLIT: unsplit if closing a tab involved in split
    if (state.split && (tabId === state.activeTabId || tabId === state.splitTabId)) {
      state.split = false;
      state.splitTabId = null;
      var splitBtnEl = document.getElementById('webSplitBtn');
      if (splitBtnEl) splitBtnEl.classList.remove('active');
    }

    // BUILD_WCV: destroy view in main process
    if (tab.mainTabId) {
      webTabs.close({ tabId: tab.mainTabId }).catch(function () {});
    }

    state.tabs.splice(idx, 1);

    // Adjust active tab
    if (state.activeTabId === tabId) {
      if (state.tabs.length) {
        var newIdx = Math.min(idx, state.tabs.length - 1);
        activateTab(state.tabs[newIdx].id);
      } else {
        state.activeTabId = null;
        renderTabs();
        updateUrlDisplay();
        updateNavButtons();
        syncLoadBar();
      }
    }

    if (!state.tabs.length && state.browserOpen) {
      state.activeTabId = null;
      state.showBrowserHome = true;
      webTabs.hideAll().catch(function () {});
      renderBrowserHome();
      updateUrlDisplay();
      updateNavButtons();
      syncLoadBar();
    }

    renderSources();
  }

  function closeAllTabs() {
    for (var i = state.tabs.length - 1; i >= 0; i--) {
      closeTab(state.tabs[i].id);
    }
    state.tabs = [];
    state.activeTabId = null;
    state.showBrowserHome = !!state.browserOpen;
    webTabs.hideAll().catch(function () {});
    renderTabs();
    renderBrowserHome();
    renderSources();
    renderSourcesGrid();
    renderContinue();
    syncLoadBar();
  }

  // BUILD_WCV: nav state from cached tab properties (updated via IPC events)
  function updateNavButtons() {
    var tab = getActiveTab();
    if (!tab || state.showBrowserHome) {
      if (el.navBack) el.navBack.disabled = true;
      if (el.navForward) el.navForward.disabled = true;
      return;
    }
    if (el.navBack) el.navBack.disabled = !tab.canGoBack;
    if (el.navForward) el.navForward.disabled = !tab.canGoForward;
  }

  function updateUrlDisplay() {
    if (!el.urlDisplay) return;
    // Don't overwrite while the user is typing in the omnibox
    try {
      if (document.activeElement === el.urlDisplay) return;
    } catch (e) {}
    var tab = getActiveTab();
    var u = (tab && !state.showBrowserHome && tab.url) ? tab.url : '';
    if (typeof el.urlDisplay.value !== 'undefined') el.urlDisplay.value = u;
    else el.urlDisplay.textContent = u;
    setOmniIconForUrl(u);
  }

  // MERIDIAN_SPLIT: Split view (BUILD_WCV: uses bounds-based split instead of DOM)

  function applySplitLayout() {
    if (state.showBrowserHome) {
      webTabs.hideAll().catch(function () {});
      renderBrowserHome();
      return;
    }

    if (!state.split) {
      // Unsplit: just activate the current tab normally
      var tab = getActiveTab();
      if (tab && tab.mainTabId) {
        webTabs.activate({ tabId: tab.mainTabId }).catch(function () {});
        setTimeout(reportBoundsForActiveTab, 30);
      }
      return;
    }

    // Find two tabs to show: active + splitTab
    var mainTab = getActiveTab();
    if (!mainTab) { state.split = false; return; }

    var splitTab = null;
    if (state.splitTabId) {
      for (var s = 0; s < state.tabs.length; s++) {
        if (state.tabs[s].id === state.splitTabId && state.tabs[s].id !== mainTab.id) {
          splitTab = state.tabs[s];
          break;
        }
      }
    }
    if (!splitTab) {
      for (var t = 0; t < state.tabs.length; t++) {
        if (state.tabs[t].id !== mainTab.id) { splitTab = state.tabs[t]; break; }
      }
    }
    if (!splitTab) { state.split = false; showToast('Need at least 2 tabs to split'); return; }
    state.splitTabId = splitTab.id;

    // BUILD_WCV: report split bounds to main process
    setTimeout(reportSplitBounds, 30);
  }

  function toggleSplit() {
    if (state.tabs.length < 2) {
      showToast('Need at least 2 tabs to split');
      return;
    }
    state.split = !state.split;
    if (!state.split) state.splitTabId = null;
    applySplitLayout();
    var btn = document.getElementById('webSplitBtn');
    if (btn) btn.classList.toggle('active', state.split);
  }

  function openTabPicker() {
    state.showBrowserHome = true;
    if (!state.browserOpen) {
      openHome();
      return;
    }
    webTabs.hideAll().catch(function () {});
    renderBrowserHome();
    updateUrlDisplay();
    updateNavButtons();
    syncLoadBar();
    showToast('Pick a source');
  }

  // ---- Add source dialog ----

  function openAddSourceDialog(source) {
    if (!el.addSourceOverlay) return;
    state.editSourceId = source && source.id ? source.id : null;

    if (el.addTitle) el.addTitle.textContent = state.editSourceId ? 'Edit Download Source' : 'Add Download Source';
    if (el.sourceSaveBtn) el.sourceSaveBtn.textContent = state.editSourceId ? 'Save Changes' : 'Save Source';

    if (el.sourceName) el.sourceName.value = source && source.name ? source.name : '';
    if (el.sourceUrl) el.sourceUrl.value = source && source.url ? source.url : '';

    el.addSourceOverlay.classList.remove('hidden');
    try { el.addSourceOverlay.setAttribute('aria-hidden', 'false'); } catch (e) {}
    hideContextMenu();
  }

  function closeAddSourceDialog() {
    if (!el.addSourceOverlay) return;
    el.addSourceOverlay.classList.add('hidden');
    try { el.addSourceOverlay.setAttribute('aria-hidden', 'true'); } catch (e) {}

    state.editSourceId = null;
    if (el.sourceName) el.sourceName.value = '';
    if (el.sourceUrl) el.sourceUrl.value = '';
    if (el.addTitle) el.addTitle.textContent = 'Add Download Source';
    if (el.sourceSaveBtn) el.sourceSaveBtn.textContent = 'Save Source';
  }

  function saveSourceFromDialog() {
    if (!el.sourceName || !el.sourceUrl) return;
    var name = String(el.sourceName.value || '').trim();
    var url = String(el.sourceUrl.value || '').trim();
    if (!name || !url) {
      showToast('Name and URL required');
      return;
    }

    // Ensure scheme
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    var wasEdit = !!state.editSourceId;

    var p;
    if (state.editSourceId) {
      p = api.webSources.update({ id: state.editSourceId, name: name, url: url });
    } else {
      p = api.webSources.add({ name: name, url: url });
    }

    p.then(function (res) {
      if (res && res.ok) {
        closeAddSourceDialog();
        loadSources();
        showToast(wasEdit ? 'Source updated' : 'Source added');
      } else {
        showToast('Save failed');
      }
    }).catch(function () {
      showToast('Save failed');
    });
  }

  // FIX-WEB-MODE: paste a URL from clipboard as a new source
  function pasteUrlAsSource(clipText) {
    var url = String(clipText || '').trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    var name = siteNameFromUrl(url) || 'New Source';
    api.webSources.add({ name: name, url: url }).then(function (res) {
      if (res && res.ok) {
        loadSources();
        showToast('Source added: ' + name);
      } else {
        showToast('Failed to add source');
      }
    }).catch(function () {
      showToast('Failed to add source');
    });
  }

  function removeSource(sourceId) {
    api.webSources.remove(sourceId).then(function (res) {
      if (res && res.ok) {
        showToast('Source removed');
        loadSources();
      } else {
        showToast('Remove failed');
      }
    }).catch(function () {
      showToast('Remove failed');
    });
  }

  // ---- Keyboard shortcuts ----

  function handleKeyDown(e) {
    if (!state.browserOpen) return;

    // Escape should always close overlays first
    if (e.key === 'Escape') {
      if (state.dlPanelOpen) {
        e.preventDefault();
        closeDownloadsPanel();
        return;
      }
      if (state.ctxOpen) {
        e.preventDefault();
        hideContextMenu();
        return;
      }
      if (isTipsOpen()) {
        e.preventDefault();
        hideTips();
        return;
      }
      if (el.addSourceOverlay && !el.addSourceOverlay.classList.contains('hidden')) {
        e.preventDefault();
        closeAddSourceDialog();
        return;
      }
      if (state.browserOpen) {
        e.preventDefault();
        closeBrowser();
        return;
      }
      return;
    }

    // Do not steal keys while typing (except Escape above)
    if (isTypingTarget(e.target)) return;

    var key = String(e.key || '');
    var lower = key.toLowerCase();
    var ctrl = !!(e.ctrlKey || e.metaKey);

    // Chrome-like address bar focus
    if ((ctrl && !e.shiftKey && lower === 'l') || (e.altKey && lower === 'd')) {
      e.preventDefault();
      try {
        if (el.urlDisplay && el.urlDisplay.focus) {
          el.urlDisplay.focus();
          if (el.urlDisplay.select) el.urlDisplay.select();
        }
      } catch (err) {}
      return;
    }
    if (ctrl && !e.shiftKey && (lower === 'j')) {
      e.preventDefault();
      toggleDownloadsPanel();
      return;
    }

    // Chrome-like tab switching
    if (ctrl && key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) switchTab(-1);
      else switchTab(1);
      return;
    }

    // Alt+Left/Right: back/forward
    if (e.altKey && !ctrl && !e.shiftKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      e.preventDefault();
      var t0 = getActiveTab();
      if (t0 && t0.mainTabId) {
        webTabs.navigate({ tabId: t0.mainTabId, action: (key === 'ArrowLeft') ? 'back' : 'forward' }).catch(function () {});
      }
      return;
    }

    if (lower === 'k' && !ctrl && !e.altKey) {
      e.preventDefault();
      toggleTips();
      return;
    }

    if (key === 'F11' || lower === 'f') {
      // BUILD_WEB_PARITY: toggle fullscreen
      e.preventDefault();
      if (api.window && api.window.toggleFullscreen) api.window.toggleFullscreen();
      return;
    }

    if (key === 'Backspace') {
      if (isTipsOpen()) {
        e.preventDefault();
        hideTips();
        return;
      }
      if (!state.browserOpen) return;

      e.preventDefault();
      var tab = getActiveTab();
      if (tab && tab.canGoBack && tab.mainTabId) {
        webTabs.navigate({ tabId: tab.mainTabId, action: 'back' }).catch(function () {});
      } else {
        showToast('No back history');
      }
      return;
    }

    if (ctrl && lower === 'r') {
      e.preventDefault();
      if (state.browserOpen) {
        var t = getActiveTab();
        if (t && t.mainTabId) {
          webTabs.navigate({ tabId: t.mainTabId, action: 'reload' }).catch(function () {});
          showToast('Reloadingâ€¦');
        }
      } else {
        loadSources();
        loadDestinations();
        showToast('Refreshing sourcesâ€¦');
      }
      return;
    }

    if (ctrl && lower === 'w') {
      e.preventDefault();
      if (state.browserOpen) {
        var t2 = getActiveTab();
        if (t2) {
          closeTab(t2.id);
          renderContinue();
        }
      }
      return;
    }

    if (ctrl && lower === 't') {
      e.preventDefault();
      var t3 = getActiveTab();
      if (t3) {
        var src = getSourceById(t3.sourceId);
        if (src) {
          createTab(src, src.url);
          if (!state.browserOpen) openBrowserForTab(state.activeTabId);
        } else {
          showToast('No source');
        }
      } else {
        // no tabs yet: prompt pick
        openTabPicker();
      }
      return;
    }
  }

  // ---- Bind UI events ----

  function bindUI() {
    if (el.addSourceBtn) {
      el.addSourceBtn.onclick = function () {
        openAddSourceDialog(null);
      };
    }

    if (el.addSourceClose) {
      el.addSourceClose.onclick = function () {
        closeAddSourceDialog();
      };
    }

    if (el.sourceSaveBtn) {
      el.sourceSaveBtn.onclick = function () {
        saveSourceFromDialog();
      };
    }

    if (el.sourcesList) {
      el.sourcesList.onclick = function (e) {
        var target = e.target;
        while (target && target !== el.sourcesList && !target.getAttribute('data-source-id')) {
          target = target.parentNode;
        }
        if (!target || target === el.sourcesList) return;
        var sourceId = target.getAttribute('data-source-id');
        for (var i = 0; i < state.sources.length; i++) {
          if (state.sources[i].id === sourceId) {
            openBrowser(state.sources[i]);
            return;
          }
        }
      };

      // BUILD_WEB_PARITY: context menu for sources in sidebar
      el.sourcesList.addEventListener('contextmenu', function (e) {
        var target = e.target;
        while (target && target !== el.sourcesList && !target.getAttribute('data-source-id')) {
          target = target.parentNode;
        }
        if (!target || target === el.sourcesList) return;

        e.preventDefault();
        var sourceId = target.getAttribute('data-source-id');
        var src = getSourceById(sourceId);
        if (!src) return;

        showContextMenu([
          { label: 'Open', onClick: function () { openBrowser(src); } },
          { label: 'Open in new tab', onClick: function () { createTab(src, src.url); openBrowserForTab(state.activeTabId); } },
          { separator: true },
          { label: 'Edit source', onClick: function () { openAddSourceDialog(src); } },
          { label: 'Copy URL', onClick: function () { copyText(src.url || ''); showToast('Copied URL'); } },
          { separator: true },
          { label: 'Remove source', onClick: function () { removeSource(src.id); } }
        ], e.clientX, e.clientY);
      });
    }

    if (el.browserHomeGrid) {
      el.browserHomeGrid.addEventListener('click', function (e) {
        var target = e.target;
        while (target && target !== el.browserHomeGrid && !target.getAttribute('data-source-id')) {
          target = target.parentNode;
        }
        if (!target || target === el.browserHomeGrid) return;
        var sourceId = target.getAttribute('data-source-id');
        var src = getSourceById(sourceId);
        if (!src) return;
        openBrowser(src);
      });
    }

    if (el.browserHomeAddSourceBtn) {
      el.browserHomeAddSourceBtn.onclick = function () {
        openAddSourceDialog(null);
      };
    }

    if (el.browserBackBtn) {
      el.browserBackBtn.onclick = function () {
        closeBrowser();
      };
    }

    // BUILD_WCV: navigation via IPC
    if (el.navBack) {
      el.navBack.onclick = function () {
        var tab = getActiveTab();
        if (tab && tab.mainTabId) {
          webTabs.navigate({ tabId: tab.mainTabId, action: 'back' }).catch(function () {});
        }
      };
    }

    if (el.navForward) {
      el.navForward.onclick = function () {
        var tab = getActiveTab();
        if (tab && tab.mainTabId) {
          webTabs.navigate({ tabId: tab.mainTabId, action: 'forward' }).catch(function () {});
        }
      };
    }

    if (el.navReload) {
      el.navReload.onclick = function () {
        var tab = getActiveTab();
        if (tab && tab.mainTabId) {
          webTabs.navigate({ tabId: tab.mainTabId, action: 'reload' }).catch(function () {});
          showToast('Reloadingâ€¦');
        }
      };
    }

    if (el.navHome) {
      el.navHome.onclick = function () {
        var tab = getActiveTab();
        if (tab && tab.mainTabId) {
          webTabs.navigate({ tabId: tab.mainTabId, action: 'loadUrl', url: tab.homeUrl || tab.url || '' }).catch(function () {});
        }
      };
    }

    // Chrome-ish omnibox behavior
    if (el.urlDisplay) {
      syncOmniPlaceholder();

      el.urlDisplay.addEventListener('focus', function () {
        try { this.select(); } catch (e) {}
      });

      el.urlDisplay.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var resolved = resolveOmniInputToUrl(el.urlDisplay.value);
          if (!resolved) return;
          if (typeof el.urlDisplay.value !== 'undefined') el.urlDisplay.value = resolved;
          else el.urlDisplay.textContent = resolved;
          setOmniIconForUrl(resolved);
          var tab = getActiveTab();
          if (!tab || !tab.mainTabId) {
            var src = {
              id: 'omni_' + Date.now(),
              name: siteNameFromUrl(resolved) || 'New Tab',
              url: resolved,
              color: '#555'
            };
            createTab(src, resolved, { silentToast: true });
          } else {
            webTabs.navigate({ tabId: tab.mainTabId, action: 'loadUrl', url: resolved }).catch(function () {});
          }
          try { el.urlDisplay.blur(); } catch (err) {}
          showToast('Loadingâ€¦');
          e.preventDefault();
          return;
        }

        if (e.key === 'Escape') {
          // Revert to current tab URL
          updateUrlDisplay();
          try { el.urlDisplay.blur(); } catch (err2) {}
          e.preventDefault();
          return;
        }
      });

      el.urlDisplay.addEventListener('blur', function () {
        updateUrlDisplay();
      });
    }

    // MERIDIAN_SPLIT: split view toggle button
    var splitBtn = document.getElementById('webSplitBtn');
    if (splitBtn) {
      splitBtn.onclick = function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        toggleSplit();
      };
    }

    // FIX-WIN-CTRL2: window controls moved to shell_bindings.js for single-source wiring

    if (el.dlBtn) {
      el.dlBtn.onclick = function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        toggleDownloadsPanel();
      };
    }

    if (el.dlClearBtn) {
      el.dlClearBtn.onclick = function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        if (api.webSources && api.webSources.clearDownloadHistory) {
          api.webSources.clearDownloadHistory().then(function () {
            showToast('Downloads cleared');
            loadDownloadHistory();
            closeDownloadsPanel();
          }).catch(function () {
            showToast('Failed to clear downloads');
          });
          return;
        }
        state.downloads = [];
        renderDownloadsPanel();
        renderHubDirectActive();
        renderHubDownloadHistory();
        closeDownloadsPanel();
        showToast('Downloads cleared');
      };
    }

    // FIX-WEB-DL: dismiss bottom bar
    if (el.dlBarClose) {
      el.dlBarClose.onclick = function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        state.dlBarDismissed = true;
        hideDlBar();
      };
    }

    // BUILD_WEB_PARITY: tips close button
    if (el.tipsClose) {
      el.tipsClose.onclick = function () {
        hideTips();
      };
    }

    if (el.tipsBtn) {
      el.tipsBtn.onclick = function () {
        toggleTips();
      };
    }

    // FIX-WEB-MODE: right-click on library home â†’ paste link as source
    if (el.homeView) {
      el.homeView.addEventListener('contextmenu', function (e) {
        // Don't hijack right-click on source cards (they have their own menu)
        var t = e.target;
        while (t && t !== el.homeView) {
          if (t.classList && t.classList.contains('webSourceCard')) return;
          if (t.classList && t.classList.contains('contTile')) return;
          t = t.parentNode;
        }
        e.preventDefault();
        var items = [
          { label: 'Add source\u2026', onClick: function () { openAddSourceDialog(null); } },
        ];
        // Read clipboard â€” async, so build menu after
        var clipPromise = null;
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            clipPromise = navigator.clipboard.readText();
          }
        } catch (ex) {}
        if (clipPromise) {
          clipPromise.then(function (text) {
            var clip = String(text || '').trim();
            var looksLikeUrl = /^https?:\/\//i.test(clip) || /^[a-z0-9][-a-z0-9]*(\.[a-z]{2,})+/i.test(clip);
            if (looksLikeUrl) {
              var preview = clip.length > 50 ? clip.slice(0, 47) + '\u2026' : clip;
              items.unshift({ label: 'Paste link: ' + preview, onClick: function () { pasteUrlAsSource(clip); } });
            }
            showContextMenu(items, e.clientX, e.clientY);
          }).catch(function () {
            showContextMenu(items, e.clientX, e.clientY);
          });
        } else {
          showContextMenu(items, e.clientX, e.clientY);
        }
      });
    }

    // Global key handler (scoped)
    document.addEventListener('keydown', handleKeyDown, true);

    // Context menu global close handlers
    withContextMenuCloseHandlers();

    // Downloads panel outside-click close
    document.addEventListener('mousedown', function (evt) {
      if (!state.dlPanelOpen) return;
      var t = evt && evt.target ? evt.target : null;
      if (!t) return;
      if (el.dlPanel && el.dlPanel.contains(t)) return;
      if (el.dlBtn && el.dlBtn.contains(t)) return;
      closeDownloadsPanel();
    }, true);

    if (el.hubDirectActiveList) {
      el.hubDirectActiveList.addEventListener('click', function (evt) {
        var t = evt && evt.target ? evt.target : null;
        if (!t) return;
        var actionEl = t.closest ? t.closest('[data-direct-action]') : null;
        if (actionEl) {
          var action = String(actionEl.getAttribute('data-direct-action') || '');
          var id = String(actionEl.getAttribute('data-direct-id') || '');
          if (!id || !api.webSources) return;
          if (action === 'pause' && api.webSources.pauseDownload) {
            api.webSources.pauseDownload({ id: id }).catch(function () {});
          } else if (action === 'resume' && api.webSources.resumeDownload) {
            api.webSources.resumeDownload({ id: id }).catch(function () {});
          } else if (action === 'cancel' && api.webSources.cancelDownload) {
            api.webSources.cancelDownload({ id: id }).catch(function () {});
          }
          return;
        }
      });
    }

    if (el.hubTorrentActiveList) {
      el.hubTorrentActiveList.addEventListener('click', function (evt) {
        var t = evt && evt.target ? evt.target : null;
        if (!t) return;
        var actionEl = t.closest ? t.closest('[data-torrent-action]') : null;
        if (!actionEl || !api.webTorrent) return;
        var action = String(actionEl.getAttribute('data-torrent-action') || '');
        var id = String(actionEl.getAttribute('data-torrent-id') || '');
        if (!id) return;
        if (action === 'pause' && api.webTorrent.pause) {
          api.webTorrent.pause({ id: id }).then(function () { refreshTorrentState(); }).catch(function () {});
        } else if (action === 'resume' && api.webTorrent.resume) {
          api.webTorrent.resume({ id: id }).then(function () { refreshTorrentState(); }).catch(function () {});
        } else if (action === 'cancel' && api.webTorrent.cancel) {
          api.webTorrent.cancel({ id: id }).then(function () { refreshTorrentState(); }).catch(function () {});
        }
      });
    }

    if (el.hubDownloadHistoryList) {
      el.hubDownloadHistoryList.addEventListener('click', function (evt) {
        var t = evt && evt.target ? evt.target : null;
        if (!t) return;
        var rm = t.closest ? t.closest('[data-unified-remove-id]') : null;
        if (rm) {
          var rid = String(rm.getAttribute('data-unified-remove-id') || '');
          if (!rid) return;
          var split = rid.split(':');
          if (split.length < 2) return;
          var transport = split[0];
          var rawId = split.slice(1).join(':');
          if (transport === 'direct' && api.webSources && api.webSources.removeDownloadHistory) {
            api.webSources.removeDownloadHistory({ id: rawId }).then(function () { loadDownloadHistory(); }).catch(function () {});
          } else if (transport === 'torrent' && api.webTorrent && api.webTorrent.removeHistory) {
            api.webTorrent.removeHistory({ id: rawId }).then(function () { refreshTorrentState(); }).catch(function () {});
          }
          return;
        }

        var open = t.closest ? t.closest('[data-unified-open-id]') : null;
        if (!open) return;
        var oid = String(open.getAttribute('data-unified-open-id') || '');
        if (!oid || oid.indexOf('direct:') !== 0) return;
        var directId = oid.slice('direct:'.length);
        for (var i = 0; i < state.downloads.length; i++) {
          var d = state.downloads[i];
          if (!d || String(d.id) !== directId) continue;
          if (d.destination && api.shell && api.shell.revealPath) {
            try { api.shell.revealPath(d.destination); } catch (e) {}
          }
          break;
        }
      });
    }

    if (el.hubDownloadHistoryClearBtn) {
      el.hubDownloadHistoryClearBtn.onclick = function () {
        var p1 = (api.webSources && api.webSources.clearDownloadHistory) ? api.webSources.clearDownloadHistory() : Promise.resolve();
        var p2 = (api.webTorrent && api.webTorrent.clearHistory) ? api.webTorrent.clearHistory() : Promise.resolve();
        Promise.all([p1, p2]).then(function () {
          showToast('Download history cleared');
          loadDownloadHistory();
          refreshTorrentState();
        }).catch(function () {
          showToast('Failed to clear history');
        });
      };
    }

    if (el.hubBrowseSearch) {
      el.hubBrowseSearch.addEventListener('input', function () {
        state.browsingHistoryQuery = String(el.hubBrowseSearch.value || '').trim();
        if (state.browseSearchTimer) {
          try { clearTimeout(state.browseSearchTimer); } catch (e) {}
          state.browseSearchTimer = null;
        }
        state.browseSearchTimer = setTimeout(function () {
          state.browseSearchTimer = null;
          loadBrowsingHistory();
        }, 180);
      });
    }

    if (el.hubBrowseHistoryClearBtn) {
      el.hubBrowseHistoryClearBtn.onclick = function () {
        if (!api.webHistory || !api.webHistory.clear) return;
        api.webHistory.clear({}).then(function () {
          loadBrowsingHistory();
          showToast('Browsing history cleared');
        }).catch(function () {
          showToast('Failed to clear browsing history');
        });
      };
    }

    if (el.hubBrowseHistoryList) {
      el.hubBrowseHistoryList.addEventListener('click', function (evt) {
        var t = evt && evt.target ? evt.target : null;
        if (!t) return;
        var rm = t.closest ? t.closest('[data-history-remove-id]') : null;
        if (rm) {
          var rid = String(rm.getAttribute('data-history-remove-id') || '');
          if (!rid || !api.webHistory || !api.webHistory.remove) return;
          api.webHistory.remove({ id: rid }).then(function () { loadBrowsingHistory(); }).catch(function () {});
          return;
        }

        var open = t.closest ? t.closest('[data-history-open-id]') : null;
        if (!open) return;
        var url = String(open.getAttribute('data-history-open-id') || '').trim();
        if (!url) return;

        var src = {
          id: 'history',
          name: siteNameFromUrl(url) || 'History',
          url: url,
          color: '#667085'
        };
        openBrowser(src);
      });
    }

    // Download events
    if (api.webSources.getDownloadHistory) {
      loadDownloadHistory();
    }

    if (el.homeDlClearBtn && api.webSources.clearDownloadHistory) {
      el.homeDlClearBtn.onclick = function () {
        api.webSources.clearDownloadHistory().then(function () {
          showToast('Downloads cleared');
          loadDownloadHistory();
        }).catch(function () {});
      };
    }

    if (api.webSources.onDownloadsUpdated) {
      api.webSources.onDownloadsUpdated(function (data) {
        if (!data || !Array.isArray(data.downloads)) return;
        state.downloads = [];
        for (var i = 0; i < data.downloads.length; i++) {
          var d = normalizeDownload(data.downloads[i]);
          if (d) state.downloads.push(d);
        }
        // Snapshot a representative progress value for the sidebar indicator
        state.lastDownloadProgress = null;
        for (var j = 0; j < state.downloads.length; j++) {
          var dd = state.downloads[j];
          if (dd && dd.state === 'progressing' && typeof dd.progress === 'number' && isFinite(dd.progress)) {
            state.lastDownloadProgress = dd.progress;
            break;
          }
        }
        if (state.lastDownloadProgress == null) {
          for (var j2 = 0; j2 < state.downloads.length; j2++) {
            var dd2 = state.downloads[j2];
            if (dd2 && dd2.state === 'paused' && typeof dd2.progress === 'number' && isFinite(dd2.progress)) { state.lastDownloadProgress = dd2.progress; break; }
          }
        }
        recomputeDownloadingCount();
        syncDownloadIndicator();
        renderDownloadsPanel();
        renderHomeDownloads();
        renderHubDirectActive();
        renderHubDownloadHistory();
      });
    }

    if (api.webSources.onDownloadStarted) {
      api.webSources.onDownloadStarted(function (info) {
        state.lastDownloadName = info && info.filename ? String(info.filename) : '';
        state.dlBarDismissed = false;
        state.lastDownloadProgress = 0;
        upsertDownload(info);
        showToast('Downloading: ' + (info && info.filename ? info.filename : ''));
        showDlBar('Downloading: ' + (info && info.filename ? info.filename : ''), null);
      });
    }

    if (api.webSources.onDownloadProgress) {
      api.webSources.onDownloadProgress(function (info) {
        var fn = (info && info.filename) ? String(info.filename) : '';
        var st = (info && info.state) ? String(info.state) : '';
        var p = (info && typeof info.progress === 'number') ? info.progress : null;
        if (p != null && isFinite(p)) state.lastDownloadProgress = p;
        upsertDownload(info);
        var pctStr = (p != null) ? (' ' + Math.round(p * 100) + '%') : '';
        if (st === 'paused') showDlBar('Paused: ' + fn + pctStr, p);
        else showDlBar('Downloading: ' + fn + pctStr, p);
        syncDownloadIndicator();
      });
    }

    if (api.webSources.onDownloadCompleted) {
      api.webSources.onDownloadCompleted(function (info) {
        upsertDownload(info);
        var cancelled = (info && (String(info.error || '') === 'Cancelled' || String(info.state || '') === 'cancelled'));
        if (cancelled) {
          showToast('Download cancelled');
          showDlBar('Cancelled: ' + ((info && info.filename) ? info.filename : ''), null);
          if (el.downloadStatus) el.downloadStatus.textContent = 'Cancelled: ' + ((info && info.filename) ? info.filename : '');
          autohideDlBar();
          syncDownloadIndicator();
          return;
        }

        if (info && info.ok) {
          var msg = 'Download saved';
          if (info && info.library) msg += ' to ' + info.library;
          showToast(msg);
          showDlBar('Saved: ' + (info.filename || '') + (info.library ? (' \u2192 ' + info.library) : ''), 1);
          if (el.downloadStatus) {
            el.downloadStatus.textContent = 'Saved: ' + (info.filename || '') + (info.library ? (' \u2192 ' + info.library) : '');
          }
        } else {
          showToast('Download failed');
          showDlBar('Failed: ' + ((info && info.filename) ? info.filename : ''), null);
          if (el.downloadStatus) {
            el.downloadStatus.textContent = 'Download failed: ' + ((info && info.filename) ? info.filename : '');
          }
        }
        autohideDlBar();
        syncDownloadIndicator();

        if (state.downloading === 0) {
          setTimeout(function () {
            if (!el.downloadStatus) return;
            if (state.downloading === 0) el.downloadStatus.textContent = 'No active downloads';
          }, 2500);
        }
      });
    }

    // BUILD_WCV: Popup â†’ new tab (main-process handler now sends tabId instead of wcId)
    if (api.webSources.onPopupOpen) {
      api.webSources.onPopupOpen(function (info) {
        var url = info && info.url ? String(info.url) : '';
        if (!url) return;
        var mainTabId = info && info.tabId ? info.tabId : null;
        var parent = null;
        if (mainTabId != null) {
          parent = getTabByMainId(mainTabId);
        }
        if (!parent) parent = getActiveTab();
        openPopupUrlInNewTab(url, parent);
      });
    }

    api.webSources.onUpdated(function () {
      loadSources();
      loadDestinations();
    });

    // BUILD_WCV: Listen to main-process tab events
    webTabs.onTitleUpdated(function (data) {
      var tab = getTabByMainId(data && data.tabId);
      if (!tab) return;
      tab.title = data.title || tab.sourceName || 'Tab';
      renderTabs();
      renderBrowserHome();
      renderContinue();
    });

    webTabs.onUrlUpdated(function (data) {
      var tab = getTabByMainId(data && data.tabId);
      if (!tab) return;
      tab.url = data.url || '';
      maybeRecordBrowsingHistory(tab, tab.url);
      if (tab.id === state.activeTabId) {
        updateUrlDisplay();
      }
      renderBrowserHome();
      renderContinue();
    });

    webTabs.onLoading(function (data) {
      var tab = getTabByMainId(data && data.tabId);
      if (!tab) return;
      tab.loading = !!data.loading;
      renderTabs();
      renderBrowserHome();
      syncLoadBar();
    });

    webTabs.onNavState(function (data) {
      var tab = getTabByMainId(data && data.tabId);
      if (!tab) return;
      tab.canGoBack = !!data.canGoBack;
      tab.canGoForward = !!data.canGoForward;
      if (tab.id === state.activeTabId) {
        updateNavButtons();
      }
    });

    if (api.webHistory && api.webHistory.onUpdated) {
      api.webHistory.onUpdated(function () {
        loadBrowsingHistory();
      });
    }

    if (api.webTorrent && api.webTorrent.onUpdated) {
      api.webTorrent.onUpdated(function (payload) {
        if (payload && Array.isArray(payload.torrents)) {
          state.torrentActive = [];
          for (var ti = 0; ti < payload.torrents.length; ti++) {
            var ta = normalizeTorrentEntry(payload.torrents[ti]);
            if (ta) state.torrentActive.push(ta);
          }
        }
        if (payload && Array.isArray(payload.history)) {
          state.torrentHistory = [];
          for (var hi = 0; hi < payload.history.length; hi++) {
            var th = normalizeTorrentEntry(payload.history[hi]);
            if (th) state.torrentHistory.push(th);
          }
        }
        renderHubTorrentActive();
        renderHubDownloadHistory();
      });
    }

    if (api.webTorrent && api.webTorrent.onStarted) {
      api.webTorrent.onStarted(function () {
        refreshTorrentState();
      });
    }

    if (api.webTorrent && api.webTorrent.onProgress) {
      api.webTorrent.onProgress(function () {
        renderHubTorrentActive();
      });
    }

    if (api.webTorrent && api.webTorrent.onCompleted) {
      api.webTorrent.onCompleted(function () {
        refreshTorrentState();
      });
    }

    // BUILD_WCV: ResizeObserver for bounds reporting
    if (el.viewContainer && typeof ResizeObserver !== 'undefined') {
      var _resizeObs = new ResizeObserver(function () {
        if (!state.browserOpen) return;
        if (state.split) {
          reportSplitBounds();
        } else {
          reportBoundsForActiveTab();
        }
      });
      _resizeObs.observe(el.viewContainer);
    }

    // Init
    loadBrowserSettings();
    loadSources();
    loadDestinations();
    loadBrowsingHistory();
    refreshTorrentState();
    syncDownloadIndicator();
    renderDownloadsPanel();
    renderHomeDownloads();
    renderBrowserHome();
    renderHubAll();
  }

  // ---- Init ----

  try {
    bindUI();
  } catch (e) {
    console.warn('[BUILD_WCV] bindUI failed', e);
  }

  // Expose openBrowser globally so Comics/Books sidebars can call it
  try {
    window.Tanko = window.Tanko || {};
    window.Tanko.web = {
      openBrowser: openBrowser,
      openHome: openHome,
      openAddSourceDialog: function () { openAddSourceDialog(null); }
    };
  } catch (e) {}

})();
