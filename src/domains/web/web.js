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
    searchEngineSelect: qs('webSearchEngineSelect'),
    bookmarkBtn: qs('webBookmarkBtn'),
    findBtn: qs('webFindBtn'),
    urlDisplay: qs('webUrlDisplay'),
    omniIcon: qs('webOmniIcon'),
    omniGhost: qs('webOmniGhost'), // CHROMIUM_PARITY: ghost text overlay
    omniSuggest: qs('webOmniSuggest'),
    findBar: qs('webFindBar'),
    findInput: qs('webFindInput'),
    findCount: qs('webFindCount'),
    findPrevBtn: qs('webFindPrevBtn'),
    findNextBtn: qs('webFindNextBtn'),
    findCloseBtn: qs('webFindCloseBtn'),
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
    // Chrome-style kebab menu
    menuBtn: qs('webMenuBtn'),
    torBtn: qs('webTorBtn'), // FEAT-TOR
    hubSourcesList: qs('webHubSourcesList'),
    hubSourcesEmpty: qs('webHubSourcesEmpty'),
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
    hubMagnetInput: qs('webHubMagnetInput'),
    hubMagnetPasteBtn: qs('webHubMagnetPasteBtn'),
    hubMagnetStartBtn: qs('webHubMagnetStartBtn'),
    hubTorrentFilter: qs('webHubTorrentFilter'),
    hubTorrentPauseAllBtn: qs('webHubTorrentPauseAllBtn'),
    hubTorrentResumeAllBtn: qs('webHubTorrentResumeAllBtn'),
    hubTorrentCancelAllBtn: qs('webHubTorrentCancelAllBtn'),
    hubDownloadHistoryList: qs('webHubDownloadHistoryList'),
    hubDownloadHistoryEmpty: qs('webHubDownloadHistoryEmpty'),
    hubDownloadHistoryClearBtn: qs('webHubDownloadHistoryClearBtn'),
    hubBrowseHistoryList: qs('webHubBrowseHistoryList'),
    hubBrowseHistoryEmpty: qs('webHubBrowseHistoryEmpty'),
    hubBrowseSearch: qs('webHubBrowseSearch'),
    hubBrowseHistoryClearBtn: qs('webHubBrowseHistoryClearBtn'),
    hubBookmarksList: qs('webHubBookmarksList'),
    hubBookmarksEmpty: qs('webHubBookmarksEmpty'),
    hubBookmarkCurrentBtn: qs('webHubBookmarkCurrentBtn'),
    hubDataRange: qs('webHubDataRange'),
    hubDataHistory: qs('webHubDataHistory'),
    hubDataDownloads: qs('webHubDataDownloads'),
    hubDataTorrents: qs('webHubDataTorrents'),
    hubDataCookies: qs('webHubDataCookies'),
    hubDataCache: qs('webHubDataCache'),
    hubDataUsageBtn: qs('webHubDataUsageBtn'),
    hubDataClearBtn: qs('webHubDataClearBtn'),
    hubDataUsageText: qs('webHubDataUsageText'),
    hubPermOrigin: qs('webHubPermOrigin'),
    hubPermType: qs('webHubPermType'),
    hubPermDecision: qs('webHubPermDecision'),
    hubPermSaveBtn: qs('webHubPermSaveBtn'),
    hubPermissionsList: qs('webHubPermissionsList'),
    hubPermissionsEmpty: qs('webHubPermissionsEmpty'),
    hubAdblockEnabled: qs('webHubAdblockEnabled'),
    hubAdblockUpdateBtn: qs('webHubAdblockUpdateBtn'),
    hubAdblockStatsBtn: qs('webHubAdblockStatsBtn'),
    hubAdblockInfo: qs('webHubAdblockInfo'),
    // Torrent tab panel
    torrentPanel: qs('webTorrentPanel'),
    torrentPanelInner: qs('webTorrentPanelInner')
  };

  var MAX_TABS = 8;
  var MAX_CLOSED_TABS = 30;
  var MAX_BROWSING_HISTORY_UI = 500;
  var MAX_UNIFIED_HISTORY_UI = 2000;
  var SEARCH_ENGINES = {
    yandex: { label: 'Yandex', url: 'https://yandex.com/search/?text=' },
    google: { label: 'Google', url: 'https://www.google.com/search?q=' },
    duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
    bing: { label: 'Bing', url: 'https://www.bing.com/search?q=' },
    brave: { label: 'Brave', url: 'https://search.brave.com/search?q=' }
  };
  var SEARCH_ENGINE_URLS = {
    yandex: SEARCH_ENGINES.yandex.url,
    google: SEARCH_ENGINES.google.url,
    duckduckgo: SEARCH_ENGINES.duckduckgo.url,
    bing: SEARCH_ENGINES.bing.url,
    brave: SEARCH_ENGINES.brave.url
  };

  // CHROMIUM_PARITY: Reload/Stop toggle SVGs
  var SVG_RELOAD = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8a5.5 5.5 0 1 1 1.3 3.5"/><path d="M2 5v3.5H5.5" stroke-width="1.4"/></svg>';
  var SVG_STOP = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>';

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
      defaultSearchEngine: 'yandex',
      parityV1Enabled: true,
      adblockEnabled: true,
      restoreLastSession: true
    },
    // FEAT-TOR
    torActive: false,
    torConnecting: false,
    browsingHistory: [],
    browsingHistoryQuery: '',
    browseSearchTimer: null,
    torrentActive: [],
    torrentHistory: [],
    torrentTabEntries: {},  // tabId -> latest torrent entry snapshot
    closedTabs: [],
    restoreLastSession: true,
    sessionRestoreInProgress: false,
    sessionSaveTimer: null,
    bookmarks: [],
    permissions: [],
    adblock: {
      enabled: true,
      blockedCount: 0,
      domainCount: 0,
      listUpdatedAt: 0
    },
    findBarOpen: false,
    findQuery: '',
    findResult: {
      activeMatchOrdinal: 0,
      matches: 0
    },
    omniSuggestOpen: false,
    omniSuggestItems: [],
    omniSuggestActiveIndex: -1,
    hubTorrentFilter: 'active',
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

  // ── Torrent tab creation ──

  function createTorrentTab(torrentId, magnetOrUrl) {
    if (state.tabs.length >= MAX_TABS) {
      showToast('Tab limit reached');
      return null;
    }
    var tabId = state.nextTabId++;
    var tab = {
      id: tabId,
      type: 'torrent',
      torrentId: String(torrentId || ''),
      sourceId: null,
      sourceName: 'Torrent',
      title: 'Resolving...',
      url: String(magnetOrUrl || ''),
      homeUrl: '',
      mainTabId: null,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      pinned: false
    };
    state.tabs.push(tab);
    state.activeTabId = tabId;
    state.showBrowserHome = false;
    state.torrentTabEntries[tabId] = null; // will be filled by onMetadata / refreshTorrentState
    renderTabs();
    renderBrowserHome();
    renderContinue();
    updateNavButtons();
    updateUrlDisplay();
    scheduleSessionSave();
    // Immediately hide WebContentsViews and show torrent panel
    webTabs.hideAll().catch(function () {});
    if (el.torrentPanel) el.torrentPanel.classList.remove('hidden');
    if (el.browserHomePanel) el.browserHomePanel.classList.add('hidden');
    if (el.viewContainer) el.viewContainer.classList.add('hidden');
    renderTorrentTab(tab);
    return tab;
  }

  function findTorrentTabByTorrentId(torrentId) {
    var tid = String(torrentId || '');
    if (!tid) return null;
    for (var i = 0; i < state.tabs.length; i++) {
      if (state.tabs[i] && state.tabs[i].type === 'torrent' && state.tabs[i].torrentId === tid) return state.tabs[i];
    }
    return null;
  }

  function maybeStartTorrentFromUrl(url, referer) {
    var target = String(url || '').trim();
    if (!target || !api || !api.webTorrent) return false;
    if (shouldSkipDuplicateTorrentStart(target, referer)) return true;

    if (isMagnetUrl(target)) {
      try {
        api.webTorrent.startMagnet({
          magnetUri: target,
          referer: String(referer || ''),
        }).then(function (res) {
          if (!res) return;
          if (res && res.ok) {
            createTorrentTab(res.id, target);
            refreshTorrentState();
          } else {
            showToast((res && res.error) ? String(res.error) : 'Failed to start torrent');
          }
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
        api.webTorrent.startTorrentUrl({
          url: target,
          referer: String(referer || ''),
        }).then(function (res) {
          if (!res) return;
          if (res && res.ok) {
            createTorrentTab(res.id, target);
            refreshTorrentState();
          } else {
            showToast((res && res.error) ? String(res.error) : 'Failed to start torrent');
          }
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

  var WEBVIEW_POPUP_BRIDGE_CHANNEL = 'tanko:web-popup';

  // CHROME_PARITY: remove Electron/Tankoban UA tokens so websites see the same
  // UA family as Chrome and keep full-featured experiences enabled.
  function getChromeParityUserAgent() {
    var ua = '';
    try { ua = String((navigator && navigator.userAgent) || ''); } catch (e) { ua = ''; }
    if (!ua) return '';
    return ua
      .replace(/\sElectron\/[^\s]+/gi, '')
      .replace(/\sTankoban[^\s]*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  var POPUP_DEDUP_WINDOW_MS = 1200;
  var popupDedupMap = Object.create(null); // key -> ts
  var TORRENT_START_DEDUP_WINDOW_MS = 1600;
  var torrentStartDedupMap = Object.create(null); // key -> ts
  var CLICK_GUARD_WINDOW_MS = 420;
  var CLICK_GUARD_RADIUS_PX = 12;
  var lastContextGesture = {
    at: 0,
    x: 0,
    y: 0,
    targetKey: '',
  };

  function getWebviewPopupPreloadUrl() {
    try {
      var u = new URL('./webview_popup_preload.js', window.location.href);
      return (u && u.protocol === 'file:') ? u.toString() : '';
    } catch (e) {
      return '';
    }
  }

  function normalizePopupUrl(raw) {
    var target = String(raw || '').trim();
    if (!target || target === 'about:blank') return '';
    try {
      var u = new URL(target);
      var protocol = String(u.protocol || '').toLowerCase();
      if (protocol !== 'http:' && protocol !== 'https:' && protocol !== 'magnet:') return '';
      return u.toString();
    } catch (e) {
      return '';
    }
  }

  function canonicalPopupDedupKey(url, parentTab) {
    var normalized = normalizePopupUrl(url);
    if (!normalized) return '';
    var parentId = parentTab && parentTab.id != null ? String(parentTab.id) : 'none';
    try {
      var u = new URL(normalized);
      if (String(u.protocol || '').toLowerCase() === 'http:' || String(u.protocol || '').toLowerCase() === 'https:') {
        // Drop hash for popup dedupe because several sites emit duplicate popup URLs with only fragment changes.
        u.hash = '';
      }
      normalized = u.toString();
    } catch (e) {}
    return parentId + '|' + normalized;
  }

  function canonicalTorrentStartKey(target, referer) {
    var url = String(target || '').trim();
    if (!url) return '';
    var ref = String(referer || '').trim();
    if (/^magnet:/i.test(url)) return 'magnet|' + url;
    if (/^https?:/i.test(url)) {
      try {
        var u = new URL(url);
        u.hash = '';
        return 'torrent|' + u.toString() + '|' + ref;
      } catch (e) {
        return 'torrent|' + url + '|' + ref;
      }
    }
    return '';
  }

  function shouldSkipDuplicateTorrentStart(target, referer) {
    var now = Date.now();
    var key = canonicalTorrentStartKey(target, referer);
    if (!key) return false;
    var prevAt = Number(torrentStartDedupMap[key] || 0) || 0;
    if (prevAt && (now - prevAt) < TORRENT_START_DEDUP_WINDOW_MS) return true;
    torrentStartDedupMap[key] = now;
    var cutoff = now - (TORRENT_START_DEDUP_WINDOW_MS * 3);
    var keys = Object.keys(torrentStartDedupMap);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (Number(torrentStartDedupMap[k] || 0) < cutoff) delete torrentStartDedupMap[k];
    }
    return false;
  }

  function shouldSkipDuplicatePopup(key) {
    var now = Date.now();
    if (!key) return false;
    var prevAt = Number(popupDedupMap[key] || 0) || 0;
    if (prevAt && (now - prevAt) < POPUP_DEDUP_WINDOW_MS) return true;
    popupDedupMap[key] = now;
    // Keep map bounded.
    var cutoff = now - (POPUP_DEDUP_WINDOW_MS * 3);
    var keys = Object.keys(popupDedupMap);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (Number(popupDedupMap[k] || 0) < cutoff) delete popupDedupMap[k];
    }
    return false;
  }

  function navigateUrlInTab(tab, url) {
    var targetTab = tab || getActiveTab();
    if (!targetTab) {
      createTab({
        id: 'src_' + Date.now(),
        name: 'New Tab',
        url: String(url || '').trim() || 'about:blank',
        color: '#555'
      }, url || 'about:blank', { silentToast: true });
      return true;
    }
    if (targetTab.mainTabId) {
      webTabs.navigate({ tabId: targetTab.mainTabId, action: 'loadUrl', url: url }).catch(function () {});
      return true;
    }
    if (targetTab.id != null) {
      openUrlFromOmni(url, { tabId: targetTab.id, fromAddressBar: true });
      return true;
    }
    return false;
  }

  function routePopupUrl(target, parentTab, referer) {
    var url = normalizePopupUrl(target);
    console.log('[DIAG:route] routePopupUrl target=' + target + ' normalized=' + url + ' parentTab=' + (parentTab && parentTab.id));
    if (!url) return false;
    var dedupKey = canonicalPopupDedupKey(url, parentTab || null);
    if (shouldSkipDuplicatePopup(dedupKey)) { console.log('[DIAG:route] DEDUP skip'); return true; }
    if (maybeStartTorrentFromUrl(url, referer || '')) { console.log('[DIAG:route] torrent intercept'); return true; }
    var navResult = navigateUrlInTab(parentTab || getActiveTab(), url);
    console.log('[DIAG:route] navigateUrlInTab returned ' + navResult);
    return navResult;
  }

  function getParentTabForMainTabId(mainTabId) {
    var idNum = Number(mainTabId);
    if (!isFinite(idNum)) return getActiveTab();
    var parent = getTabByMainId(idNum);
    if (parent) return parent;
    return getActiveTab();
  }

  function routePopupFromMainTab(mainTabId, targetUrl, referer) {
    return routePopupUrl(targetUrl, getParentTabForMainTabId(mainTabId), referer || '');
  }

  function rememberContextGesture(evt, targetKey) {
    lastContextGesture.at = Date.now();
    lastContextGesture.targetKey = String(targetKey || '');
    var x = 0;
    var y = 0;
    try {
      x = Number((evt && evt.clientX) || 0) || 0;
      y = Number((evt && evt.clientY) || 0) || 0;
    } catch (e) {}
    lastContextGesture.x = x;
    lastContextGesture.y = y;
  }

  function shouldSuppressPrimaryActivation(evt, targetKey) {
    var now = Date.now();
    if ((now - Number(lastContextGesture.at || 0)) > CLICK_GUARD_WINDOW_MS) return false;
    var key = String(targetKey || '');
    var stored = String(lastContextGesture.targetKey || '');
    if (stored && key && stored !== key) return false;
    var x = 0;
    var y = 0;
    try {
      x = Number((evt && evt.clientX) || 0) || 0;
      y = Number((evt && evt.clientY) || 0) || 0;
    } catch (e) {}
    if (evt && typeof evt.clientX === 'number' && typeof evt.clientY === 'number') {
      if (Math.abs(x - lastContextGesture.x) > CLICK_GUARD_RADIUS_PX) return false;
      if (Math.abs(y - lastContextGesture.y) > CLICK_GUARD_RADIUS_PX) return false;
    }
    return true;
  }

  function startTorrentFromHubInput(raw) {
    var target = String(raw || '').trim();
    if (!target) {
      showToast('Paste a magnet or .torrent URL');
      return;
    }
    if (!isMagnetUrl(target) && !isTorrentFileUrl(target)) {
      showToast('Invalid torrent link');
      return;
    }
    if (maybeStartTorrentFromUrl(target, '')) {
      if (el.hubMagnetInput) el.hubMagnetInput.value = '';
    }
  }

  function createRendererWebTabsShim() {
    var nextTabId = 1;
    var tabs = new Map(); // tabId -> { tabId, webview }
    var splitState = { enabled: false, leftId: null, rightId: null };
    var popupBridgePreload = getWebviewPopupPreloadUrl();
    var listeners = {
      title: [],
      url: [],
      loading: [],
      nav: [],
      find: [],
      loadFail: []
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
    function safeTitle(wv) {
      try { return String((wv && wv.getTitle && wv.getTitle()) || ''); } catch (e) { return ''; }
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

    // ── Webview page context menu builder ──
    function buildWebviewContextMenu(tabId, wv, params) {
      var items = [];
      var parentTab = getTabByMainId(tabId);
      var linkUrl = String(params.linkURL || '').trim();
      var srcUrl = String(params.srcURL || '').trim();
      var selText = String(params.selectionText || '').trim();
      var isEditable = !!params.isEditable;
      var mediaType = String(params.mediaType || '').toLowerCase();

      // Navigation
      var canBack = false;
      var canFwd = false;
      try { canBack = wv.canGoBack(); } catch (e) {}
      try { canFwd = wv.canGoForward(); } catch (e) {}
      items.push({ label: 'Back', disabled: !canBack, onClick: function () { try { wv.goBack(); } catch (e) {} } });
      items.push({ label: 'Forward', disabled: !canFwd, onClick: function () { try { wv.goForward(); } catch (e) {} } });
      items.push({ label: 'Reload', onClick: function () { try { wv.reload(); } catch (e) {} } });
      items.push({ separator: true });

      // Link actions
      if (linkUrl) {
        items.push({ label: 'Open link', onClick: function () { navigateUrlInTab(parentTab || getActiveTab(), linkUrl); } });
        items.push({ label: 'Open link in new tab', onClick: function () { openUrlFromOmni(linkUrl, { newTab: true }); } });
        items.push({ label: 'Copy link address', onClick: function () { copyText(linkUrl); showToast('Copied'); } });
        items.push({ separator: true });
      }

      // Image actions
      if (mediaType === 'image' && srcUrl) {
        items.push({ label: 'Save image as\u2026', onClick: function () {
          if (api && api.webSources && api.webSources.downloadFromUrl) {
            api.webSources.downloadFromUrl({ url: srcUrl, referer: safeUrl(wv) });
          }
        } });
        items.push({ label: 'Copy image address', onClick: function () { copyText(srcUrl); showToast('Copied'); } });
        items.push({ separator: true });
      }

      // Text selection / editing
      if (selText) {
        items.push({ label: 'Copy', onClick: function () { try { wv.copy(); } catch (e) { copyText(selText); } } });
      }
      if (isEditable) {
        items.push({ label: 'Paste', onClick: function () { try { wv.paste(); } catch (e) {} } });
        items.push({ label: 'Cut', onClick: function () { try { wv.cut(); } catch (e) {} } });
        items.push({ label: 'Select all', onClick: function () { try { wv.selectAll(); } catch (e) {} } });
      }
      if (selText || isEditable) {
        items.push({ separator: true });
      }

      // Inspect element (always last)
      items.push({ label: 'Inspect element', onClick: function () {
        try { wv.inspectElement(params.x || 0, params.y || 0); } catch (e) {}
      } });

      return items;
    }

    // CHROMIUM_PARITY: Styled error page for load failures (like Chrome's ERR_ pages)
    function buildErrorPageHtml(failure, failedUrl, errorCode, errorDesc) {
      var kind = String((failure && failure.kind) || 'load_failed');
      var title, emoji, message, suggestion;
      if (kind === 'dns') {
        title = 'This site can\u2019t be reached';
        emoji = '\uD83D\uDD0D';
        message = 'The server DNS address could not be found.';
        suggestion = 'Check that the URL is spelled correctly, or try again later.';
      } else if (kind === 'tls') {
        title = 'Connection isn\u2019t secure';
        emoji = '\uD83D\uDD12';
        message = 'There was a problem with the site\u2019s security certificate.';
        suggestion = 'The site may be temporarily down, or the certificate may have expired.';
      } else if (kind === 'timeout') {
        title = 'Connection timed out';
        emoji = '\u23F1\uFE0F';
        message = 'The server took too long to respond.';
        suggestion = 'Check your internet connection and try again.';
      } else if (kind === 'offline') {
        title = 'No internet connection';
        emoji = '\uD83D\uDCE1';
        message = 'Your device is not connected to the internet.';
        suggestion = 'Check your Wi-Fi or network cable and try again.';
      } else if (kind === 'blocked') {
        title = 'Blocked';
        emoji = '\uD83D\uDEAB';
        message = 'This page was blocked by content filters.';
        suggestion = 'The ad blocker or a security rule prevented this page from loading.';
      } else {
        title = 'This page isn\u2019t working';
        emoji = '\u26A0\uFE0F';
        message = 'Something went wrong while loading this page.';
        suggestion = 'Try reloading or check the URL.';
      }
      var host = '';
      try { host = new URL(String(failedUrl || '')).hostname; } catch (e) {}
      var codeStr = errorCode ? String(errorCode) : '';
      if (errorDesc) codeStr += ' (' + errorDesc + ')';

      return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
        + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
        + 'background:#1a1a2e;color:#e0e0e0;display:flex;align-items:center;justify-content:center;'
        + 'min-height:100vh;margin:0;padding:20px;box-sizing:border-box}'
        + '.ep{text-align:center;max-width:480px}'
        + '.em{font-size:64px;margin-bottom:16px}'
        + '.et{font-size:22px;font-weight:600;margin:0 0 8px;color:#fff}'
        + '.eh{font-size:13px;color:#888;margin-bottom:20px;word-break:break-all}'
        + '.ed{font-size:14px;line-height:1.6;color:#aaa;margin-bottom:8px}'
        + '.es{font-size:13px;color:#777;margin-bottom:24px}'
        + '.ec{font-size:11px;color:#555;margin-top:16px}'
        + '.eb{display:inline-block;padding:10px 28px;border-radius:8px;'
        + 'border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);'
        + 'color:#fff;font-size:14px;cursor:pointer;transition:background .15s}'
        + '.eb:hover{background:rgba(255,255,255,.12)}'
        + '</style></head><body><div class="ep">'
        + '<div class="em">' + emoji + '</div>'
        + '<h1 class="et">' + escapeHtml(title) + '</h1>'
        + (host ? '<div class="eh">' + escapeHtml(host) + '</div>' : '')
        + '<p class="ed">' + escapeHtml(message) + '</p>'
        + '<p class="es">' + escapeHtml(suggestion) + '</p>'
        + '<button class="eb" onclick="location.reload()">Try again</button>'
        + (codeStr ? '<div class="ec">ERR_CODE: ' + escapeHtml(codeStr) + '</div>' : '')
        + '</div></body></html>';
    }

    function bindWebview(tabId, wv) {
      function emitBestTitle() {
        var t = safeTitle(wv);
        if (!t) {
          var u = safeUrl(wv);
          t = siteNameFromUrl(u) || '';
        }
        if (t) emit('title', { tabId: tabId, title: t });
      }

      function handleLoadFail(ev) {
        if (ev && ev.isMainFrame === false) return;
        var code = Number(ev && ev.errorCode || 0);
        var desc = String(ev && ev.errorDescription || '').trim();
        if (code === -3 && /aborted/i.test(desc || '')) return;

        var failedUrl = String(ev && ev.validatedURL || '') || safeUrl(wv);
        var failure = classifyLoadFailure(code, desc, failedUrl);
        emit('loading', { tabId: tabId, loading: false });
        if (failedUrl) emit('url', { tabId: tabId, url: failedUrl });
        emitNav(tabId, wv);
        emit('loadFail', {
          tabId: tabId,
          url: failedUrl,
          errorCode: code,
          errorDescription: desc,
          failure: failure
        });

        var label = String(failure && failure.title || '').trim();
        if (!label) label = 'Load failed';
        emit('title', { tabId: tabId, title: label });
        showToast((failure && failure.toast) ? failure.toast : (desc ? ('Load failed: ' + desc) : 'Load failed'));

        // CHROMIUM_PARITY: Inject styled error page into the webview
        try {
          var errorHtml = buildErrorPageHtml(failure, failedUrl, code, desc);
          var injectScript = 'document.open();document.write(' + JSON.stringify(errorHtml) + ');document.close();';
          wv.executeJavaScript(injectScript).catch(function () {});
        } catch (e2) {}
      }

      wv.addEventListener('did-start-loading', function () {
        emit('loading', { tabId: tabId, loading: true });
      });

      wv.addEventListener('did-stop-loading', function () {
        emit('loading', { tabId: tabId, loading: false });
        // CHROMIUM_PARITY: pass direction for history tracking
        var dir = rec._navDirection || '';
        var tidx = rec._navTargetIndex;
        rec._navDirection = '';
        rec._navTargetIndex = null;
        emit('url', { tabId: tabId, url: safeUrl(wv), direction: dir, targetIndex: tidx });
        emitNav(tabId, wv);
        emitBestTitle();
      });

      wv.addEventListener('page-title-updated', function (ev) {
        var title = ev && ev.title ? String(ev.title) : '';
        emit('title', { tabId: tabId, title: title });
      });

      wv.addEventListener('dom-ready', function () {
        emit('url', { tabId: tabId, url: safeUrl(wv) });
        emitNav(tabId, wv);
        emitBestTitle();
      });

      wv.addEventListener('did-navigate', function (ev) {
        // CHROMIUM_PARITY: consume direction flag for the primary navigation event
        var dir = rec._navDirection || '';
        var tidx = rec._navTargetIndex;
        rec._navDirection = '';
        rec._navTargetIndex = null;
        emit('url', { tabId: tabId, url: String((ev && ev.url) || ''), direction: dir, targetIndex: tidx });
        emitNav(tabId, wv);
      });

      wv.addEventListener('did-navigate-in-page', function (ev) {
        emit('url', { tabId: tabId, url: String((ev && ev.url) || '') });
        emitNav(tabId, wv);
      });

      wv.addEventListener('did-fail-load', handleLoadFail);
      wv.addEventListener('did-fail-provisional-load', handleLoadFail);

      // DIAG: Forward guest-page console logs (incl. preload) to host console
      wv.addEventListener('console-message', function (ev) {
        var msg = ev && ev.message ? String(ev.message) : '';
        if (msg.indexOf('[DIAG') === 0 || msg.indexOf('[POPUP') === 0) {
          console.log('[guest:' + tabId + '] ' + msg);
        }
      });

      wv.addEventListener('will-navigate', function (ev) {
        var target = String((ev && ev.url) || '').trim();
        console.log('[DIAG:webview] will-navigate:', target);
        showToast('[DIAG] will-navigate: ' + (target || '(empty)').substring(0, 60));
        if (!target) return;
        if (maybeStartTorrentFromUrl(target, safeUrl(wv))) {
          try { ev.preventDefault(); } catch (e) {}
          return;
        }
      });

      wv.addEventListener('new-window', function (ev) {
        var target = String((ev && ev.url) || '').trim();
        console.log('[DIAG:webview] new-window:', target);
        showToast('[DIAG] new-window: ' + (target || '(empty)').substring(0, 60));
        if (!target) return;
        try { ev.preventDefault(); } catch (e) {}
        routePopupFromMainTab(tabId, target, safeUrl(wv));
      });

      wv.addEventListener('ipc-message', function (ev) {
        if (!ev || ev.channel !== WEBVIEW_POPUP_BRIDGE_CHANNEL) return;
        var payload = (ev.args && ev.args.length) ? ev.args[0] : null;
        var target = payload && payload.url ? String(payload.url) : '';
        console.log('[DIAG:webview] ipc-message popup-bridge:', target, 'reason:', payload && payload.reason);
        showToast('[DIAG] ipc-msg: ' + (target || '(empty)').substring(0, 60));
        if (!target) return;
        routePopupFromMainTab(tabId, target, safeUrl(wv));
      });

      wv.addEventListener('found-in-page', function (ev) {
        var result = ev && ev.result ? ev.result : {};
        emit('find', {
          tabId: tabId,
          result: {
            requestId: Number(result.requestId || 0) || 0,
            activeMatchOrdinal: Number(result.activeMatchOrdinal || 0) || 0,
            matches: Number(result.matches || 0) || 0,
            finalUpdate: !!result.finalUpdate
          }
        });
      });

      // Page context menu (right-click on webpage content)
      wv.addEventListener('context-menu', function (ev) {
        // Prevent native Chromium context menu from appearing
        try { ev.preventDefault(); } catch (e) {}
        var params = ev && ev.params ? ev.params : {};
        var rect = wv.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        // Try both: raw params and DPR-corrected, log which one the user sees
        var rawVx = (params.x || 0) + rect.left;
        var rawVy = (params.y || 0) + rect.top;
        var dprVx = ((params.x || 0) / dpr) + rect.left;
        var dprVy = ((params.y || 0) / dpr) + rect.top;
        rememberContextGesture({
          clientX: rawVx,
          clientY: rawVy,
        }, 'webview:' + String(tabId));
        var items = buildWebviewContextMenu(tabId, wv, params);
        if (!items.length) return;
        // DIAG: add coords as visible item so user can screenshot it
        items.unshift({
          label: 'px=' + (params.x|0) + ',' + (params.y|0) + ' rect=' + (rect.left|0) + ',' + (rect.top|0) + ' dpr=' + dpr,
          disabled: true
        });
        // Use raw (no DPR correction) — if dpr>1, try dpr-corrected
        var useVx = dpr > 1 ? dprVx : rawVx;
        var useVy = dpr > 1 ? dprVy : rawVy;
        showContextMenu(items, useVx, useVy);
      });
    }

    return {
      create: function (payload) {
        var url = String((payload && payload.url) || '').trim() || 'about:blank';
        var tabId = nextTabId++;
        var wv = document.createElement('webview');
        var parityUA = getChromeParityUserAgent();
        wv.className = 'webTabWebview hidden';
        wv.setAttribute('partition', 'persist:webmode');
        wv.setAttribute('allowpopups', '');
        if (parityUA) wv.setAttribute('useragent', parityUA);
        if (popupBridgePreload) wv.setAttribute('preload', popupBridgePreload);
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
            rec._navDirection = 'back'; // CHROMIUM_PARITY: track direction
            if (safeCanGoBack(wv)) wv.goBack();
          } else if (action === 'forward') {
            rec._navDirection = 'forward'; // CHROMIUM_PARITY: track direction
            if (safeCanGoForward(wv)) wv.goForward();
          } else if (action === 'reload') {
            wv.reload();
          } else if (action === 'stop') {
            try { wv.stop(); } catch (e2) {}
          } else if (action === 'goToIndex') {
            // CHROMIUM_PARITY: navigate to specific history index
            var targetIdx = Number(payload && payload.index);
            rec._navDirection = 'index';
            rec._navTargetIndex = targetIdx;
            try { wv.goToIndex(targetIdx); } catch (e3) {}
          } else if (action === 'loadUrl') {
            rec._navDirection = ''; // clear on new navigation
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

      findInPage: function (payload) {
        var tabId = Number(payload && payload.tabId);
        var action = String((payload && payload.action) || '').trim().toLowerCase();
        var query = String((payload && payload.query) || '');
        var rec = tabs.get(tabId);
        if (!rec || !rec.webview) return Promise.resolve({ ok: false, error: 'Not found' });
        var wv = rec.webview;
        try {
          if (action === 'stop') {
            if (wv.stopFindInPage) wv.stopFindInPage('clearSelection');
            return Promise.resolve({ ok: true });
          }
          if (action === 'find') {
            if (!query.trim()) return Promise.resolve({ ok: false, error: 'Missing query' });
            rec.lastFindQuery = query;
            var req = wv.findInPage ? wv.findInPage(query, { forward: true, findNext: false }) : 0;
            return Promise.resolve({ ok: true, requestId: Number(req || 0) || 0 });
          }
          if (action === 'next' || action === 'prev') {
            var text = query.trim() ? query : String(rec.lastFindQuery || '');
            if (!text) return Promise.resolve({ ok: false, error: 'Missing query' });
            rec.lastFindQuery = text;
            var req2 = wv.findInPage ? wv.findInPage(text, { forward: action !== 'prev', findNext: true }) : 0;
            return Promise.resolve({ ok: true, requestId: Number(req2 || 0) || 0 });
          }
          return Promise.resolve({ ok: false, error: 'Unsupported action' });
        } catch (err) {
          return Promise.resolve({ ok: false, error: String(err && err.message || err || 'Find failed') });
        }
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

      findByWebContentsId: function (webContentsId) {
        var target = Number(webContentsId);
        if (!isFinite(target) || target <= 0) return null;
        var found = null;
        tabs.forEach(function (rec, id) {
          if (found != null) return;
          try {
            var wcid = rec && rec.webview && rec.webview.getWebContentsId ? Number(rec.webview.getWebContentsId()) : 0;
            if (wcid === target) found = id;
          } catch (e) {}
        });
        return found;
      },

      onTitleUpdated: function (cb) { on('title', cb); },
      onUrlUpdated: function (cb) { on('url', cb); },
      onLoading: function (cb) { on('loading', cb); },
      onNavState: function (cb) { on('nav', cb); },
      onFindResult: function (cb) { on('find', cb); },
      onLoadFailed: function (cb) { on('loadFail', cb); },
    };
  }

  var webTabs = createRendererWebTabsShim();

  function createWebModuleBridge() {
    var listeners = Object.create(null);
    return { state: state, el: el, api: api, webTabs: webTabs, deps: {},
      on: function (evt, fn) { if (!evt || typeof fn !== 'function') return function () {}; (listeners[evt] = listeners[evt] || []).push(fn); return function () { var arr = listeners[evt] || []; var idx = arr.indexOf(fn); if (idx >= 0) arr.splice(idx, 1); }; },
      emit: function (evt, payload) { var arr = listeners[evt] || []; for (var i = 0; i < arr.length; i++) { try { arr[i](payload); } catch (e) {} } }
    };
  }

  var moduleBridge = createWebModuleBridge();
  function useWebModule(name) {
    var init = (window.__tankoWebModules || {})[name];
    if (typeof init !== 'function') return {};
    try { return init(moduleBridge) || {}; } catch (e) { return {}; }
  }

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

  moduleBridge.deps.escapeHtml = escapeHtml;
  moduleBridge.deps.shortPath = shortPath;
  moduleBridge.deps.getSourceColor = getSourceColor;
  moduleBridge.deps.getSourceById = getSourceById;
  moduleBridge.deps.siteNameFromUrl = siteNameFromUrl;
  moduleBridge.deps.getFaviconUrl = getFaviconUrl;
  moduleBridge.deps.showToast = showToast;

  var navOmniboxModule = useWebModule('navOmnibox');
  var getActiveSearchEngine = navOmniboxModule.getActiveSearchEngine;
  var getSearchQueryUrl = navOmniboxModule.getSearchQueryUrl;
  var syncSearchEngineSelect = navOmniboxModule.syncSearchEngineSelect;
  var syncOmniPlaceholder = navOmniboxModule.syncOmniPlaceholder;
  var isAllowedOmniScheme = navOmniboxModule.isAllowedOmniScheme;
  var resolveOmniInputToUrl = navOmniboxModule.resolveOmniInputToUrl;
  var tryResolveCtrlEnterUrl = navOmniboxModule.tryResolveCtrlEnterUrl;
  var closeOmniSuggestions = navOmniboxModule.closeOmniSuggestions;
  var clearOmniGhost = navOmniboxModule.clearOmniGhost;
  var stripUrlPrefix = navOmniboxModule.stripUrlPrefix;
  var updateOmniGhostText = navOmniboxModule.updateOmniGhostText;
  var acceptOmniGhost = navOmniboxModule.acceptOmniGhost;
  var saveOmniState = navOmniboxModule.saveOmniState;
  var restoreOmniState = navOmniboxModule.restoreOmniState;
  var applyOmniSuggestion = navOmniboxModule.applyOmniSuggestion;
  var buildOmniSuggestions = navOmniboxModule.buildOmniSuggestions;
  var renderOmniSuggestions = navOmniboxModule.renderOmniSuggestions;
  var refreshOmniSuggestionsFromInput = navOmniboxModule.refreshOmniSuggestionsFromInput;
  var openUrlFromOmni = navOmniboxModule.openUrlFromOmni;
  var setOmniIconForUrl = navOmniboxModule.setOmniIconForUrl;

  moduleBridge.deps.getSearchQueryUrl = getSearchQueryUrl;
  moduleBridge.deps.closeOmniSuggestions = closeOmniSuggestions;
  moduleBridge.deps.setOmniIconForUrl = setOmniIconForUrl;

  var tabsStateModule = useWebModule('tabsState');
  var getActiveTab = tabsStateModule.getActiveTab;
  var getTabByMainId = tabsStateModule.getTabByMainId;
  var createTabRuntime = tabsStateModule.createTabRuntime;
  var ensureTabRuntime = tabsStateModule.ensureTabRuntime;
  var inferSecurityStateFromUrl = tabsStateModule.inferSecurityStateFromUrl;
  var classifyLoadFailure = tabsStateModule.classifyLoadFailure;
  var pushRuntimeCommittedUrl = tabsStateModule.pushRuntimeCommittedUrl;
  var normalizeSourceInput = tabsStateModule.normalizeSourceInput;
  var snapshotTabForSession = tabsStateModule.snapshotTabForSession;
  var buildSessionPayload = tabsStateModule.buildSessionPayload;
  var scheduleSessionSave = tabsStateModule.scheduleSessionSave;
  var pushClosedTab = tabsStateModule.pushClosedTab;
  var reopenClosedTab = tabsStateModule.reopenClosedTab;
  var loadSessionAndRestore = tabsStateModule.loadSessionAndRestore;

  function isWebModeActive() {
    try {
      return !!(document.body && document.body.classList && document.body.classList.contains('inWebMode'));
    } catch (e) {
      return false;
    }
  }

  function openHubPanelSection(collapseKey) {
    var section = '';
    var key = String(collapseKey || '').toLowerCase();
    if (key === 'browsinghistory' || key === 'history') section = 'history';
    else if (key === 'bookmarks') section = 'bookmarks';
    else if (key === 'privacy') section = 'privacy';
    else if (key === 'permissions') section = 'permissions';
    else if (key === 'adblock') section = 'adblock';
    else if (key === 'browser' || key === 'sources') section = 'sources';
    try {
      if (window.Tanko && window.Tanko.settings && typeof window.Tanko.settings.open === 'function') {
        window.Tanko.settings.open({ tab: 'browser', section: section });
      }
    } catch (e) {
      // no-op
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
    var sidebarHtml = '';
    var settingsHtml = '';
    for (var i = 0; i < state.sources.length; i++) {
      var s = state.sources[i];
      var isActive = false;
      for (var j = 0; j < state.tabs.length; j++) {
        if (state.tabs[j].sourceId === s.id && state.tabs[j].id === state.activeTabId) {
          isActive = true;
          break;
        }
      }
      sidebarHtml += '<div class="webSourceItem' + (isActive ? ' active' : '') + '" data-source-id="' + s.id + '" role="listitem">'
        + '<span class="webSourceDot" style="background:' + (s.color || '#888') + '"></span>'
        + '<span class="webSourceName">' + escapeHtml(s.name) + '</span>'
        + '</div>';
      settingsHtml += '<div class="webHubItem" data-settings-source-id="' + escapeHtml(String(s.id || '')) + '">'
        + '<div class="webHubItemTop">'
          + '<div class="webHubItemTitle">' + escapeHtml(s.name || 'Source') + '</div>'
          + '<span class="webHubBadge">Source</span>'
        + '</div>'
        + '<div class="webHubItemSub">' + escapeHtml(s.url || '') + '</div>'
        + '<div class="webHubItemActions">'
          + '<button class="btn btn-ghost btn-sm" type="button" data-settings-source-edit-id="' + escapeHtml(String(s.id || '')) + '">Edit</button>'
          + '<button class="btn btn-ghost btn-sm" type="button" data-settings-source-remove-id="' + escapeHtml(String(s.id || '')) + '">Remove</button>'
        + '</div>'
      + '</div>';
    }
    if (el.sourcesList) el.sourcesList.innerHTML = sidebarHtml;
    if (el.hubSourcesList) el.hubSourcesList.innerHTML = settingsHtml;
    if (el.hubSourcesEmpty) el.hubSourcesEmpty.classList.toggle('hidden', !!state.sources.length);
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
      return Promise.resolve();
    }
    return api.webBrowserSettings.get().then(function (res) {
      if (!res || !res.ok || !res.settings) return;
      var settings = res.settings || {};
      state.browserSettings = {
        defaultSearchEngine: String(settings.defaultSearchEngine || 'yandex').trim().toLowerCase() || 'yandex',
        parityV1Enabled: settings.parityV1Enabled !== false,
        adblockEnabled: settings.adblockEnabled !== false,
        restoreLastSession: settings.restoreLastSession !== false
      };
      state.restoreLastSession = state.browserSettings.restoreLastSession !== false;
      syncSearchEngineSelect();
      syncOmniPlaceholder();
      if (api.webAdblock && typeof api.webAdblock.setEnabled === 'function') {
        api.webAdblock.setEnabled({ enabled: state.browserSettings.adblockEnabled !== false }).catch(function () {});
      }
    }).catch(function () {
      syncSearchEngineSelect();
      syncOmniPlaceholder();
    });
  }

  function saveBrowserSettings(patch) {
    if (!api.webBrowserSettings || typeof api.webBrowserSettings.save !== 'function') return;
    var payload = (patch && typeof patch === 'object') ? patch : {};
    api.webBrowserSettings.save(payload).then(function (res) {
      if (!res || !res.ok || !res.settings) return;
      state.browserSettings = {
        defaultSearchEngine: String(res.settings.defaultSearchEngine || 'yandex').trim().toLowerCase() || 'yandex',
        parityV1Enabled: res.settings.parityV1Enabled !== false,
        adblockEnabled: res.settings.adblockEnabled !== false,
        restoreLastSession: res.settings.restoreLastSession !== false
      };
      state.restoreLastSession = state.browserSettings.restoreLastSession !== false;
      syncSearchEngineSelect();
      syncOmniPlaceholder();
      scheduleSessionSave();
    }).catch(function () {});
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

    card.addEventListener('auxclick', function (e) {
      if (!e || e.button !== 1) return;
      try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
      openSourceInNewTab(source);
    });

    card.onclick = function (e) {
      if (shouldSuppressPrimaryActivation(e, 'source:' + String(source.id || ''))) return;
      if (e && (e.ctrlKey || e.metaKey)) {
        openSourceInNewTab(source);
        return;
      }
      openBrowser(source);
    };

    // BUILD_WEB_PARITY: custom context menu
    card.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      rememberContextGesture(e, 'source:' + String(source.id || ''));
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

    // Three-way content toggle: home panel / torrent panel / webview container
    var activeTab = getActiveTab();
    var showHome = !!state.showBrowserHome;
    var showTorrent = !showHome && activeTab && activeTab.type === 'torrent';
    var showWebview = !showHome && !showTorrent;

    el.browserHomePanel.classList.toggle('hidden', !showHome);
    if (el.torrentPanel) el.torrentPanel.classList.toggle('hidden', !showTorrent);
    if (el.viewContainer) el.viewContainer.classList.toggle('hidden', !showWebview);

    // WebContentsViews render ON TOP of DOM — must hide them when showing DOM panels
    if (showHome || showTorrent) {
      webTabs.hideAll().catch(function () {});
    }
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

    tile.onclick = function (e) {
      if (shouldSuppressPrimaryActivation(e, 'continue:' + String(tab.id))) return;
      openBrowserForTab(tab.id);
    };

    // BUILD_WEB_PARITY: context menu on continue tile
    tile.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      rememberContextGesture(e, 'continue:' + String(tab.id));
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
    updateBookmarkButton();
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
    updateBookmarkButton();
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
    updateBookmarkButton();
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
    closeFindBar();
    closeOmniSuggestions();
    syncLoadBar();
  }

  // ---- Tabs management ----

  function renderTabs() {
    if (!el.tabBar) return;
    var html = '';
    for (var i = 0; i < state.tabs.length; i++) {
      var t = state.tabs[i];
      var active = (t.id === state.activeTabId);
      var isTorrent = t.type === 'torrent';
      var loadingClass = t.loading ? ' loading' : '';
      var favSrc = isTorrent ? '' : getFaviconUrl(t.url || t.homeUrl || '');
      var favHtml;
      if (isTorrent) {
        var torrentEntry = state.torrentTabEntries[t.id];
        var torrentState = torrentEntry ? String(torrentEntry.state || '') : 'resolving_metadata';
        if (torrentState === 'resolving_metadata') {
          favHtml = '<span class="webTabFaviconFallback" style="font-size:11px" aria-hidden="true">&#8635;</span>';
        } else {
          favHtml = '<span class="webTabFaviconFallback" style="font-size:11px" aria-hidden="true">&#9901;</span>';
        }
      } else {
        favHtml = favSrc ? ('<img class="webTabFaviconImg" src="' + escapeHtml(favSrc) + '" referrerpolicy="no-referrer" />') : '<span class="webTabFaviconFallback" aria-hidden="true"></span>';
      }
      var pinnedClass = t.pinned ? ' pinned' : '';
      html += '<div class="webTab' + (active ? ' active' : '') + loadingClass + pinnedClass + '" data-tab-id="' + t.id + '" role="tab" aria-selected="' + (active ? 'true' : 'false') + '" draggable="true">' +
        favHtml +
        (t.pinned ? '' : '<span class="webTabLabel">' + escapeHtml(t.title || t.sourceName || 'Tab') + '</span>') +
        (t.pinned ? '' : '<button class="webTabClose" data-close-tab="' + t.id + '" title="Close">&times;</button>') +
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
        if (shouldSuppressPrimaryActivation(e, 'tab:' + String(tabId))) return;
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
        // CHROMIUM_PARITY: Don't middle-click close pinned tabs
        var clickedTab = null;
        for (var ci = 0; ci < state.tabs.length; ci++) { if (state.tabs[ci].id === id) { clickedTab = state.tabs[ci]; break; } }
        if (clickedTab && clickedTab.pinned) return;
        closeTab(id);
      });

      tabEls[di].addEventListener('contextmenu', function (e) {
        try { e.preventDefault(); } catch (err) {}
        var id = Number(this.getAttribute('data-tab-id'));
        if (!isFinite(id)) return;
        rememberContextGesture(e, 'tab:' + String(id));
        var t = null, idx = -1;
        for (var i = 0; i < state.tabs.length; i++) {
          if (state.tabs[i] && state.tabs[i].id === id) { t = state.tabs[i]; idx = i; break; }
        }
        if (!t) return;
        var items = [];
        items.push({ label: 'New tab', onClick: function () {
          openTabPicker();
        } });
        // CHROMIUM_PARITY: Pin/Unpin tab
        if (t.type !== 'torrent') {
          items.push({ label: t.pinned ? 'Unpin tab' : 'Pin tab', onClick: function () {
            if (t.pinned) unpinTab(id); else pinTab(id);
          } });
        }
        if (t.type !== 'torrent') {
          items.push({ label: 'Duplicate tab', onClick: function () {
            createTab({
              id: t.sourceId || ('dup_' + Date.now()),
              name: t.sourceName || siteNameFromUrl(t.url || t.homeUrl || '') || 'Tab',
              url: t.homeUrl || t.url || 'about:blank',
              color: getSourceColor(t.sourceId)
            }, t.url || t.homeUrl || 'about:blank', {
              titleOverride: t.title || '',
              silentToast: true,
              openerTabId: id
            });
          } });
          items.push({ label: 'Reload', onClick: function () { if (state.activeTabId !== id) activateTab(id); if (t.mainTabId) webTabs.navigate({ tabId: t.mainTabId, action: 'reload' }).catch(function () {}); } });
          items.push({ separator: true });
          items.push({ label: 'Copy address', onClick: function () { copyText(t.url || ''); showToast('Copied'); } });
        }
        items.push({ separator: true });
        items.push({ label: 'Close tab', onClick: function () { closeTab(id); } });
        items.push({ label: 'Close other tabs', onClick: function () {
          var ids = [];
          for (var i = 0; i < state.tabs.length; i++) if (state.tabs[i] && state.tabs[i].id !== id && !state.tabs[i].pinned) ids.push(state.tabs[i].id);
          for (var j = 0; j < ids.length; j++) closeTab(ids[j]);
        }});
        items.push({ label: 'Close tabs to the right', onClick: function () {
          if (idx < 0) return;
          var ids = [];
          for (var i = idx + 1; i < state.tabs.length; i++) if (state.tabs[i] && !state.tabs[i].pinned) ids.push(state.tabs[i].id);
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
        if (isNaN(targetId)) return;

        // CHROMIUM_PARITY: Accept URL drops onto tabs (C3)
        if (state.dragTabId == null) {
          var droppedUrl = '';
          try { droppedUrl = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || ''; } catch (err) {}
          droppedUrl = String(droppedUrl || '').trim();
          if (droppedUrl && /^https?:\/\//i.test(droppedUrl)) {
            var dropTarget = null;
            for (var dti = 0; dti < state.tabs.length; dti++) {
              if (state.tabs[dti].id === targetId) { dropTarget = state.tabs[dti]; break; }
            }
            if (dropTarget && dropTarget.mainTabId && dropTarget.type !== 'torrent') {
              activateTab(targetId);
              webTabs.navigate({ tabId: dropTarget.mainTabId, action: 'loadUrl', url: droppedUrl }).catch(function () {});
            }
          }
          return;
        }

        if (state.dragTabId === targetId) return;
        var fromIdx = -1;
        var toIdx = -1;
        for (var ti = 0; ti < state.tabs.length; ti++) {
          if (state.tabs[ti].id === state.dragTabId) fromIdx = ti;
          if (state.tabs[ti].id === targetId) toIdx = ti;
        }
        if (fromIdx === -1 || toIdx === -1) return;
        // CHROMIUM_PARITY: Block drags between pinned and unpinned zones
        if (state.tabs[fromIdx].pinned !== state.tabs[toIdx].pinned) return;
        var moved = state.tabs.splice(fromIdx, 1)[0];
        state.tabs.splice(toIdx, 0, moved);
        state.dragTabId = null;
        renderTabs();
        scheduleSessionSave();
      });
    }

    syncLoadBar();
  }

  function syncLoadBar() {
    if (!el.loadBar) return;
    // FEAT-TOR: Don't hide load bar when Tor indicator is showing
    if (state.torActive && el.loadBar.classList.contains('tor-indicator')) return;
    var t = getActiveTab();
    var show = !!(state.browserOpen && t && t.loading);
    el.loadBar.classList.toggle('hidden', !show);
    syncReloadStopButton();
  }

  // CHROMIUM_PARITY: Toggle reload button to stop (X) while loading
  function syncReloadStopButton() {
    if (!el.navReload) return;
    var tab = getActiveTab();
    var loading = !!(state.browserOpen && tab && tab.loading);
    el.navReload.innerHTML = loading ? SVG_STOP : SVG_RELOAD;
    el.navReload.title = loading ? 'Stop loading' : 'Reload';
    el.navReload.setAttribute('aria-label', loading ? 'Stop loading' : 'Reload page');
  }

  // FEAT-TOR: Sync Tor button visual state
  function syncTorButton() {
    if (!el.torBtn) return;
    el.torBtn.classList.toggle('tor-active', state.torActive && !state.torConnecting);
    el.torBtn.classList.toggle('tor-connecting', !!state.torConnecting);
    el.torBtn.title = state.torConnecting ? 'Tor: Connecting\u2026'
      : state.torActive ? 'Tor Proxy (on) \u2014 click to disconnect'
      : 'Tor Proxy (off) \u2014 click to connect';
    // Show persistent purple load bar indicator when Tor is active
    if (el.loadBar) {
      if (state.torActive && !state.torConnecting) {
        el.loadBar.classList.add('tor-indicator');
        el.loadBar.classList.remove('hidden');
      } else {
        el.loadBar.classList.remove('tor-indicator');
        syncLoadBar(); // restore normal load bar state
      }
    }
  }

  function syncDownloadIndicator() {
    // DL pill removed — the badge on the download button is sufficient (Chrome-style)

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

  moduleBridge.deps.scheduleSessionSave = scheduleSessionSave;

  var downloadsModule = useWebModule('downloads');
  var formatBytes = downloadsModule.formatBytes;
  var formatSpeed = downloadsModule.formatSpeed;
  var formatEta = downloadsModule.formatEta;
  var hostFromUrl = downloadsModule.hostFromUrl;
  var faviconFor = downloadsModule.faviconFor;
  var normalizeDownload = downloadsModule.normalizeDownload;
  var recomputeDownloadingCount = downloadsModule.recomputeDownloadingCount;
  var scheduleDlRender = downloadsModule.scheduleDlRender;
  var upsertDownload = downloadsModule.upsertDownload;
  var loadDownloadHistory = downloadsModule.loadDownloadHistory;
  var renderDownloadList = downloadsModule.renderDownloadList;
  var renderDownloadsPanel = downloadsModule.renderDownloadsPanel;
  var renderHomeDownloads = downloadsModule.renderHomeDownloads;

  function isDirectActiveState(stateStr) {
    var s = String(stateStr || '').toLowerCase();
    return s === 'progressing' || s === 'downloading' || s === 'paused' || s === 'in_progress';
  }

  // ── Torrent tab rendering ──

  var torrentTabModule = useWebModule('torrentTab');
  var renderTorrentTab = torrentTabModule.renderTorrentTab;
  var _torrentHasVideoFiles = torrentTabModule._torrentHasVideoFiles;
  var renderTorrentMetadataReady = torrentTabModule.renderTorrentMetadataReady;
  var renderTorrentDownloading = torrentTabModule.renderTorrentDownloading;
  var renderTorrentCompleted = torrentTabModule.renderTorrentCompleted;
  var buildFileTreeHtml = torrentTabModule.buildFileTreeHtml;
  var buildFileRowHtml = torrentTabModule.buildFileRowHtml;
  var loadDefaultSavePath = torrentTabModule.loadDefaultSavePath;
  var bindTorrentTabEvents = torrentTabModule.bindTorrentTabEvents;
  var handleTorrentAction = torrentTabModule.handleTorrentAction;
  var mergeLocalFileSelection = torrentTabModule.mergeLocalFileSelection;
  var updateTorrentTabFromEntry = torrentTabModule.updateTorrentTabFromEntry;
  var updateTorrentTabProgress = torrentTabModule.updateTorrentTabProgress;

  moduleBridge.deps.renderDownloadsPanel = renderDownloadsPanel;
  moduleBridge.deps.renderHomeDownloads = renderHomeDownloads;

  var hubModule = useWebModule('hub');
  var isTorrentActiveState = hubModule.isTorrentActiveState;
  var isTorrentCompletedState = hubModule.isTorrentCompletedState;
  var isTorrentErroredState = hubModule.isTorrentErroredState;
  var formatWhen = hubModule.formatWhen;
  var pctText = hubModule.pctText;
  var renderHubDirectActive = hubModule.renderHubDirectActive;
  var normalizeTorrentEntry = hubModule.normalizeTorrentEntry;
  var findActiveTorrentById = hubModule.findActiveTorrentById;
  var renderHubTorrentActive = hubModule.renderHubTorrentActive;
  var applyTorrentBulkAction = hubModule.applyTorrentBulkAction;
  var buildUnifiedHistory = hubModule.buildUnifiedHistory;
  var renderHubDownloadHistory = hubModule.renderHubDownloadHistory;
  var renderHubBrowsingHistory = hubModule.renderHubBrowsingHistory;
  var renderHubAll = hubModule.renderHubAll;
  var loadBrowsingHistory = hubModule.loadBrowsingHistory;
  var refreshTorrentState = hubModule.refreshTorrentState;
  var maybeRecordBrowsingHistory = hubModule.maybeRecordBrowsingHistory;
  var normalizeBookmarkEntry = hubModule.normalizeBookmarkEntry;
  var findBookmarkByUrl = hubModule.findBookmarkByUrl;
  var isActiveTabBookmarked = hubModule.isActiveTabBookmarked;
  var updateBookmarkButton = hubModule.updateBookmarkButton;
  var renderHubBookmarks = hubModule.renderHubBookmarks;
  var loadBookmarks = hubModule.loadBookmarks;
  var toggleBookmarkForActiveTab = hubModule.toggleBookmarkForActiveTab;
  var updateFindCountLabel = hubModule.updateFindCountLabel;
  var runFindAction = hubModule.runFindAction;
  var openFindBar = hubModule.openFindBar;
  var closeFindBar = hubModule.closeFindBar;
  var runFindFromInput = hubModule.runFindFromInput;
  var formatByteSize = hubModule.formatByteSize;
  var rangeToFromTs = hubModule.rangeToFromTs;
  var loadDataUsage = hubModule.loadDataUsage;
  var clearSelectedBrowsingData = hubModule.clearSelectedBrowsingData;
  var normalizePermissionRule = hubModule.normalizePermissionRule;
  var renderPermissions = hubModule.renderPermissions;
  var loadPermissions = hubModule.loadPermissions;
  var savePermissionRuleFromHub = hubModule.savePermissionRuleFromHub;
  var renderAdblockInfo = hubModule.renderAdblockInfo;
  var loadAdblockState = hubModule.loadAdblockState;

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

  // ---- Tab open helpers ----

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

    createTab(src, url, { toastText: 'Opened in new tab', openerTabId: parentTab ? parentTab.id : null });
  }

  function openSourceInNewTab(source) {
    if (!source) return;
    createTab(source, source.url);
    if (!state.browserOpen) openBrowserForTab(state.activeTabId);
  }

  // CHROMIUM_PARITY: Insert tab next to its opener (like Chrome's tab placement)
  function insertTabAtOpenerPosition(tab) {
    if (!tab.openerTabId) {
      state.tabs.push(tab);
      return;
    }
    var openerIdx = -1;
    for (var i = 0; i < state.tabs.length; i++) {
      if (state.tabs[i].id === tab.openerTabId) { openerIdx = i; break; }
    }
    if (openerIdx === -1) {
      state.tabs.push(tab);
      return;
    }
    // Find the last consecutive sibling from the same opener (insert after it)
    var insertIdx = openerIdx + 1;
    while (insertIdx < state.tabs.length && state.tabs[insertIdx].openerTabId === tab.openerTabId) {
      insertIdx++;
    }
    state.tabs.splice(insertIdx, 0, tab);
  }

  // BUILD_WCV: createTab now uses IPC instead of DOM webview
  function createTab(source, urlOverride, opts) {
    opts = opts || {};
    if (state.tabs.length >= MAX_TABS) {
      showToast('Tab limit reached');
      return null;
    }

    var src = normalizeSourceInput(source, urlOverride);
    var forcedId = Number(opts.forcedId || 0);
    var tabId = (isFinite(forcedId) && forcedId > 0) ? forcedId : state.nextTabId++;
    for (var existingIdx = 0; existingIdx < state.tabs.length; existingIdx++) {
      if (state.tabs[existingIdx] && state.tabs[existingIdx].id === tabId) {
        tabId = state.nextTabId++;
        break;
      }
    }
    if (tabId >= state.nextTabId) state.nextTabId = tabId + 1;
    var homeUrl = String(opts.homeUrlOverride || src.url || urlOverride || 'about:blank').trim() || 'about:blank';
    var startUrl = String(urlOverride || src.url || 'about:blank').trim() || 'about:blank';
    var prevActiveId = state.activeTabId;

    var tab = {
      id: tabId,
      sourceId: src.id,
      sourceName: src.name,
      title: opts.titleOverride ? String(opts.titleOverride) : src.name,
      url: startUrl,
      homeUrl: homeUrl,
      mainTabId: null,  // BUILD_WCV: set after IPC create resolves
      loading: false,
      canGoBack: false,
      canGoForward: false,
      pinned: !!opts.pinned,
      openerTabId: opts.openerTabId || null, // CHROMIUM_PARITY: opener tracking
      runtime: createTabRuntime(startUrl)
    };

    insertTabAtOpenerPosition(tab);
    state.activeTabId = tabId;
    state.showBrowserHome = false;
    // Record the initial URL immediately as a fallback for sites where URL
    // update events are suppressed or delayed.
    if (!opts.skipHistory) maybeRecordBrowsingHistory(tab, startUrl);
    renderTabs();
    renderBrowserHome();
    renderContinue();
    updateBookmarkButton();

    if (!opts.silentToast) {
      showToast(opts.toastText || ('Opened: ' + (src.name || 'Source')));
    }
    if (!opts.skipSessionSave) {
      scheduleSessionSave();
    }

    // BUILD_WCV: create WebContentsView in main process
    webTabs.create({ url: startUrl }).then(function (res) {
      if (!(res && res.ok && res.tabId)) {
        throw new Error((res && res.error) ? String(res.error) : 'Failed to create tab');
      }
      var stillExists = false;
      for (var si = 0; si < state.tabs.length; si++) {
        if (state.tabs[si] && state.tabs[si].id === tabId) { stillExists = true; break; }
      }
      if (!stillExists) {
        // Tab was closed before async create resolved; tear down native view.
        webTabs.close({ tabId: res.tabId }).catch(function () {});
        return;
      }
      tab.mainTabId = res.tabId;
      // Activate this tab's view (show it, hide others)
      webTabs.activate({ tabId: res.tabId }).catch(function () {});
      // Report bounds after a frame so layout is settled
      setTimeout(reportBoundsForActiveTab, 50);
    }).catch(function (e) {
      console.warn('[BUILD_WCV] Failed to create tab view', e);
      // Roll back tab state so failed creates do not leave ghost tabs.
      var idx = -1;
      for (var i = 0; i < state.tabs.length; i++) {
        if (state.tabs[i] && state.tabs[i].id === tabId) { idx = i; break; }
      }
      if (idx !== -1) state.tabs.splice(idx, 1);
      else return;
      state.activeTabId = (prevActiveId != null) ? prevActiveId : (state.tabs[0] ? state.tabs[0].id : null);
      renderTabs();
      renderBrowserHome();
      renderContinue();
      updateNavButtons();
      updateUrlDisplay();
      syncLoadBar();
      renderSources();
      updateBookmarkButton();
      if (!opts.silentToast) showToast('Failed to open tab');
      if (!opts.skipSessionSave) scheduleSessionSave();
    });

    return tab;
  }

  // BUILD_WCV: activateTab uses IPC instead of CSS visibility
  function activateTab(tabId) {
    saveOmniState(); // CHROMIUM_PARITY: save omnibox state before switching
    state.activeTabId = tabId;
    state.showBrowserHome = false;
    var tab = getActiveTab();
    if (tab && tab.type === 'torrent') {
      // Torrent tab — no native WebContentsView, show DOM panel
      webTabs.hideAll().catch(function () {});
      renderTorrentTab(tab);
    } else if (tab && tab.mainTabId) {
      webTabs.activate({ tabId: tab.mainTabId }).catch(function () {});
      // Defer bounds report to let layout settle
      setTimeout(reportBoundsForActiveTab, 30);
    }
    renderTabs();
    renderBrowserHome();
    updateNavButtons();
    updateUrlDisplay();
    restoreOmniState(tabId); // CHROMIUM_PARITY: restore omnibox state for new tab
    syncLoadBar();
    renderSources();
    if (state.findBarOpen) {
      state.findResult = { activeMatchOrdinal: 0, matches: 0 };
      updateFindCountLabel();
      runFindFromInput('find');
    }
    updateBookmarkButton();
    scheduleSessionSave();
  }

  // CHROMIUM_PARITY: Pin tab (move to end of pinned zone, show favicon-only)
  function pinTab(tabId) {
    var idx = -1;
    for (var i = 0; i < state.tabs.length; i++) {
      if (state.tabs[i].id === tabId) { idx = i; break; }
    }
    if (idx === -1) return;
    var tab = state.tabs[idx];
    if (tab.pinned) return;
    tab.pinned = true;
    // Move to end of pinned zone
    state.tabs.splice(idx, 1);
    var lastPinned = -1;
    for (var j = 0; j < state.tabs.length; j++) {
      if (state.tabs[j].pinned) lastPinned = j;
    }
    state.tabs.splice(lastPinned + 1, 0, tab);
    renderTabs();
    scheduleSessionSave();
  }

  function unpinTab(tabId) {
    var idx = -1;
    for (var i = 0; i < state.tabs.length; i++) {
      if (state.tabs[i].id === tabId) { idx = i; break; }
    }
    if (idx === -1) return;
    var tab = state.tabs[idx];
    if (!tab.pinned) return;
    tab.pinned = false;
    // Move to first unpinned position
    state.tabs.splice(idx, 1);
    var firstUnpinned = state.tabs.length;
    for (var j = 0; j < state.tabs.length; j++) {
      if (!state.tabs[j].pinned) { firstUnpinned = j; break; }
    }
    state.tabs.splice(firstUnpinned, 0, tab);
    renderTabs();
    scheduleSessionSave();
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
    if (tab.type !== 'torrent') pushClosedTab(tab);

    // Clean up torrent tab state
    if (tab.type === 'torrent') {
      delete state.torrentTabEntries[tabId];
    }

    // MERIDIAN_SPLIT: unsplit if closing a tab involved in split
    if (state.split && (tabId === state.activeTabId || tabId === state.splitTabId)) {
      state.split = false;
      state.splitTabId = null;
      var splitBtnEl = document.getElementById('webSplitBtn');
      if (splitBtnEl) splitBtnEl.classList.remove('active');
    }

    // BUILD_WCV: destroy view in main process (torrent tabs have no mainTabId)
    if (tab.mainTabId) {
      webTabs.close({ tabId: tab.mainTabId }).catch(function () {});
    }

    state.tabs.splice(idx, 1);

    // CHROMIUM_PARITY: Prefer activating opener tab on close, fallback to adjacent
    if (state.activeTabId === tabId) {
      if (state.tabs.length) {
        var openerFallback = null;
        if (tab.openerTabId) {
          for (var oi = 0; oi < state.tabs.length; oi++) {
            if (state.tabs[oi].id === tab.openerTabId) { openerFallback = state.tabs[oi].id; break; }
          }
        }
        var newIdx = Math.min(idx, state.tabs.length - 1);
        activateTab(openerFallback != null ? openerFallback : state.tabs[newIdx].id);
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
      openYandexNewTab();
    }

    renderSources();
    renderContinue();
    updateBookmarkButton();
    scheduleSessionSave();
  }

  function closeAllTabs() {
    var ids = [];
    for (var i = 0; i < state.tabs.length; i++) {
      if (state.tabs[i]) ids.push(state.tabs[i].id);
    }
    for (var j = 0; j < ids.length; j++) {
      closeTab(ids[j]);
    }
    state.tabs = [];
    state.activeTabId = null;
    webTabs.hideAll().catch(function () {});
    renderTabs();
    renderSources();
    renderSourcesGrid();
    renderContinue();
    syncLoadBar();
    updateBookmarkButton();
    scheduleSessionSave(true);
    if (state.browserOpen) openYandexNewTab();
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
    updateBookmarkButton();
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

  var HOME_PAGE_URL = 'https://yandex.com';

  function openYandexNewTab() {
    var tab = createTab({
      id: 'src_' + Date.now(),
      name: 'Yandex',
      url: HOME_PAGE_URL,
      color: '#fc0'
    }, HOME_PAGE_URL, { silentToast: true });
    if (!tab) return;
    if (!state.browserOpen) openBrowserForTab(tab.id);
  }

  function openTabPicker() {
    openYandexNewTab();
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
    var key = String(e.key || '');
    var lower = key.toLowerCase();
    var ctrl = !!(e.ctrlKey || e.metaKey);

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
      if (state.findBarOpen) {
        e.preventDefault();
        closeFindBar();
        return;
      }
      if (el.addSourceOverlay && !el.addSourceOverlay.classList.contains('hidden')) {
        e.preventDefault();
        closeAddSourceDialog();
        return;
      }
      // CHROMIUM_PARITY: Escape stops page loading before closing browser
      if (state.browserOpen) {
        var escTab = getActiveTab();
        if (escTab && escTab.loading && escTab.mainTabId) {
          e.preventDefault();
          webTabs.navigate({ tabId: escTab.mainTabId, action: 'stop' }).catch(function () {});
          return;
        }
      }
      if (state.browserOpen) {
        e.preventDefault();
        closeBrowser();
        return;
      }
      return;
    }

    // Chrome-like address bar focus should work even when typing in other fields.
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

    // Do not steal keys while typing (except Escape above)
    if (isTypingTarget(e.target)) return;
    if (ctrl && !e.shiftKey && (lower === 'j')) {
      e.preventDefault();
      toggleDownloadsPanel();
      return;
    }

    if (ctrl && !e.shiftKey && lower === 'f') {
      e.preventDefault();
      openFindBar();
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

    if (key === 'F11') {
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

    if (ctrl && e.shiftKey && lower === 't') {
      e.preventDefault();
      reopenClosedTab();
      return;
    }

    if (ctrl && lower === 't') {
      e.preventDefault();
      openTabPicker();
      return;
    }
  }

  // CHROMIUM_PARITY: Long-press detection for back/forward history dropdown
  var _navLongPressTriggered = false;

  function addNavLongPressHandler(btn, onLongPress) {
    var timer = null;
    var LONG_PRESS_MS = 500;
    btn.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      timer = setTimeout(function () {
        timer = null;
        _navLongPressTriggered = true;
        onLongPress(e);
      }, LONG_PRESS_MS);
    });
    btn.addEventListener('mouseup', function () {
      if (timer) { clearTimeout(timer); timer = null; }
    });
    btn.addEventListener('mouseleave', function () {
      if (timer) { clearTimeout(timer); timer = null; }
    });
    btn.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (timer) { clearTimeout(timer); timer = null; }
      _navLongPressTriggered = true;
      onLongPress(e);
    });
  }

  function showNavHistoryDropdown(direction, event) {
    var tab = getActiveTab();
    if (!tab) return;
    var runtime = ensureTabRuntime(tab);
    var entries = runtime.navEntries;
    var idx = runtime.currentIndex;
    if (!entries || !entries.length) return;

    var items = [];
    if (direction === 'back') {
      for (var i = idx - 1; i >= 0 && items.length < 15; i--) {
        (function (entryIdx) {
          var entry = entries[entryIdx];
          var label = entry.title || siteNameFromUrl(entry.url) || entry.url;
          if (label.length > 60) label = label.substring(0, 57) + '...';
          items.push({
            label: label,
            onClick: function () {
              if (tab.mainTabId != null) {
                webTabs.navigate({ tabId: tab.mainTabId, action: 'goToIndex', index: entryIdx }).catch(function () {});
              }
            }
          });
        })(i);
      }
    } else {
      for (var j = idx + 1; j < entries.length && items.length < 15; j++) {
        (function (entryIdx) {
          var entry = entries[entryIdx];
          var label = entry.title || siteNameFromUrl(entry.url) || entry.url;
          if (label.length > 60) label = label.substring(0, 57) + '...';
          items.push({
            label: label,
            onClick: function () {
              if (tab.mainTabId != null) {
                webTabs.navigate({ tabId: tab.mainTabId, action: 'goToIndex', index: entryIdx }).catch(function () {});
              }
            }
          });
        })(j);
      }
    }

    if (!items.length) return;
    var rect = (direction === 'back' ? el.navBack : el.navForward).getBoundingClientRect();
    showContextMenu(items, rect.left, rect.bottom + 4);
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
      el.sourcesList.addEventListener('auxclick', function (e) {
        if (!e || e.button !== 1) return;
        var target = e.target;
        while (target && target !== el.sourcesList && !target.getAttribute('data-source-id')) {
          target = target.parentNode;
        }
        if (!target || target === el.sourcesList) return;
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        var sourceId = target.getAttribute('data-source-id');
        var src = getSourceById(sourceId);
        if (!src) return;
        openSourceInNewTab(src);
      });

      el.sourcesList.onclick = function (e) {
        if (shouldSuppressPrimaryActivation(e, 'sources-list')) return;
        var target = e.target;
        while (target && target !== el.sourcesList && !target.getAttribute('data-source-id')) {
          target = target.parentNode;
        }
        if (!target || target === el.sourcesList) return;
        var sourceId = target.getAttribute('data-source-id');
        if (e && (e.ctrlKey || e.metaKey)) {
          var srcCtrl = getSourceById(sourceId);
          if (srcCtrl) openSourceInNewTab(srcCtrl);
          return;
        }
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
        rememberContextGesture(e, 'sources-list');
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
      el.browserHomeGrid.addEventListener('auxclick', function (e) {
        if (!e || e.button !== 1) return;
        var target = e.target;
        while (target && target !== el.browserHomeGrid && !target.getAttribute('data-source-id')) {
          target = target.parentNode;
        }
        if (!target || target === el.browserHomeGrid) return;
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        var sourceId = target.getAttribute('data-source-id');
        var src = getSourceById(sourceId);
        if (!src) return;
        openSourceInNewTab(src);
      });

      el.browserHomeGrid.addEventListener('click', function (e) {
        if (shouldSuppressPrimaryActivation(e, 'browser-home-grid')) return;
        var target = e.target;
        while (target && target !== el.browserHomeGrid && !target.getAttribute('data-source-id')) {
          target = target.parentNode;
        }
        if (!target || target === el.browserHomeGrid) return;
        var sourceId = target.getAttribute('data-source-id');
        var src = getSourceById(sourceId);
        if (!src) return;
        if (e && (e.ctrlKey || e.metaKey)) {
          openSourceInNewTab(src);
          return;
        }
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
    // CHROMIUM_PARITY: Long-press/right-click shows history dropdown
    if (el.navBack) {
      el.navBack.onclick = function () {
        if (_navLongPressTriggered) { _navLongPressTriggered = false; return; }
        var tab = getActiveTab();
        if (tab && tab.mainTabId) {
          webTabs.navigate({ tabId: tab.mainTabId, action: 'back' }).catch(function () {});
        }
      };
      addNavLongPressHandler(el.navBack, function (e) {
        showNavHistoryDropdown('back', e);
      });
    }

    if (el.navForward) {
      el.navForward.onclick = function () {
        if (_navLongPressTriggered) { _navLongPressTriggered = false; return; }
        var tab = getActiveTab();
        if (tab && tab.mainTabId) {
          webTabs.navigate({ tabId: tab.mainTabId, action: 'forward' }).catch(function () {});
        }
      };
      addNavLongPressHandler(el.navForward, function (e) {
        showNavHistoryDropdown('forward', e);
      });
    }

    // CHROMIUM_PARITY: Reload/Stop toggle — stop while loading, reload otherwise
    if (el.navReload) {
      el.navReload.onclick = function () {
        var tab = getActiveTab();
        if (!tab || !tab.mainTabId) return;
        if (tab.loading) {
          webTabs.navigate({ tabId: tab.mainTabId, action: 'stop' }).catch(function () {});
          return;
        }
        webTabs.navigate({ tabId: tab.mainTabId, action: 'reload' }).catch(function () {});
      };
    }

    // CHROMIUM_PARITY: Drop URL on empty tab-bar area → new tab (C3)
    if (el.tabBar) {
      el.tabBar.addEventListener('dragover', function (e) {
        if (state.dragTabId != null) return; // tab reorder handled per-tab
        var hasUrl = false;
        try { hasUrl = e.dataTransfer.types.indexOf('text/uri-list') !== -1 || e.dataTransfer.types.indexOf('text/plain') !== -1; } catch (err) {}
        if (hasUrl) { e.preventDefault(); try { e.dataTransfer.dropEffect = 'copy'; } catch (ex) {} }
      });
      el.tabBar.addEventListener('drop', function (e) {
        if (state.dragTabId != null) return; // tab reorder handled per-tab
        // Only fire if the drop landed on the bar itself, not on a tab element
        if (e.target !== el.tabBar) return;
        e.preventDefault();
        var droppedUrl = '';
        try { droppedUrl = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || ''; } catch (err) {}
        droppedUrl = String(droppedUrl || '').trim();
        if (droppedUrl && /^https?:\/\//i.test(droppedUrl)) {
          var host = '';
          try { host = new URL(droppedUrl).hostname.replace(/^www\./, ''); } catch (err) {}
          createTab({
            id: 'drop_' + Date.now(),
            name: host || 'Tab',
            url: droppedUrl,
            color: '#888'
          }, droppedUrl, { silentToast: true });
        }
      });
    }

    if (el.navHome) {
      el.navHome.onclick = function () {
        var tab = getActiveTab();
        if (tab && tab.mainTabId) {
          webTabs.navigate({ tabId: tab.mainTabId, action: 'loadUrl', url: tab.homeUrl || tab.url || '' }).catch(function () {});
        }
      };
    }

    if (el.bookmarkBtn) {
      el.bookmarkBtn.onclick = function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        toggleBookmarkForActiveTab();
      };
    }

    if (el.findBtn) {
      el.findBtn.onclick = function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        if (state.findBarOpen) closeFindBar();
        else openFindBar();
      };
    }

    // CHROMIUM_PARITY: Drag URL from omnibox lock/globe icon (C3)
    if (el.omniIcon) {
      el.omniIcon.setAttribute('draggable', 'true');
      el.omniIcon.addEventListener('dragstart', function (e) {
        var tab = getActiveTab();
        var url = tab ? (tab.url || '') : '';
        if (!url || url === 'about:blank') { e.preventDefault(); return; }
        try {
          e.dataTransfer.setData('text/plain', url);
          e.dataTransfer.setData('text/uri-list', url);
          e.dataTransfer.effectAllowed = 'copyLink';
        } catch (err) {}
      });
    }

    // Chrome-ish omnibox behavior
    if (el.urlDisplay) {
      syncOmniPlaceholder();

      el.urlDisplay.addEventListener('focus', function () {
        if (state._omniRestoreInProgress) return; // CHROMIUM_PARITY: don't select-all during restore
        try { this.select(); } catch (e) {}
        refreshOmniSuggestionsFromInput();
      });

      el.urlDisplay.addEventListener('input', function () {
        refreshOmniSuggestionsFromInput();
      });

      el.urlDisplay.addEventListener('keydown', function (e) {
        var key = String((e && e.key) || '');
        // CHROMIUM_PARITY: Tab or Right-arrow at end of input accepts ghost text
        if (key === 'Tab' && _omniGhostCompletion) {
          e.preventDefault();
          acceptOmniGhost();
          refreshOmniSuggestionsFromInput();
          return;
        }
        if (key === 'ArrowRight' && _omniGhostCompletion && el.urlDisplay.selectionStart === el.urlDisplay.value.length) {
          e.preventDefault();
          acceptOmniGhost();
          refreshOmniSuggestionsFromInput();
          return;
        }
        if (key === 'ArrowDown' || key === 'ArrowUp') {
          if (!state.omniSuggestOpen || !state.omniSuggestItems.length) return;
          try { e.preventDefault(); } catch (e0) {}
          var dir = key === 'ArrowDown' ? 1 : -1;
          var len = state.omniSuggestItems.length;
          var idx = state.omniSuggestActiveIndex + dir;
          if (idx < 0) idx = len - 1;
          if (idx >= len) idx = 0;
          state.omniSuggestActiveIndex = idx;
          renderOmniSuggestions();
          return;
        }

        if (e.key === 'Enter') {
          if (state.omniSuggestOpen && state.omniSuggestItems.length && state.omniSuggestActiveIndex >= 0) {
            var selected = state.omniSuggestItems[state.omniSuggestActiveIndex];
            var suggestedUrl = String(selected && selected.url ? selected.url : '');
            var newTabFromSuggest = !!(e.altKey || e.shiftKey);
            openUrlFromOmni(suggestedUrl, { newTab: newTabFromSuggest });
            try { e.preventDefault(); } catch (ep0) {}
            try { el.urlDisplay.blur(); } catch (eb0) {}
            return;
          }
          var ctrlEnterUrl = (e && (e.ctrlKey || e.metaKey)) ? tryResolveCtrlEnterUrl(el.urlDisplay.value) : '';
          var resolved = ctrlEnterUrl || resolveOmniInputToUrl(el.urlDisplay.value);
          if (!resolved) return;
          var newTab = !!(e.altKey || e.shiftKey);
          openUrlFromOmni(resolved, { newTab: newTab });
          try { el.urlDisplay.blur(); } catch (err) {}
          showToast('Loadingâ€¦');
          e.preventDefault();
          return;
        }

        if (e.key === 'Escape') {
          closeOmniSuggestions();
          // Revert to current tab URL
          updateUrlDisplay();
          try { el.urlDisplay.blur(); } catch (err2) {}
          e.preventDefault();
          return;
        }
      });

      el.urlDisplay.addEventListener('blur', function () {
        if (state._omniRestoreInProgress) return; // CHROMIUM_PARITY: don't clobber during tab switch
        setTimeout(function () { closeOmniSuggestions(); }, 120);
        clearOmniGhost(); // CHROMIUM_PARITY
        updateUrlDisplay();
      });

      // CHROMIUM_PARITY: IME composition safety for ghost text
      el.urlDisplay.addEventListener('compositionstart', function () {
        state._omniComposing = true;
        clearOmniGhost();
      });
      el.urlDisplay.addEventListener('compositionend', function () {
        state._omniComposing = false;
        setTimeout(function () { updateOmniGhostText(); }, 10);
      });
    }

    if (el.searchEngineSelect) {
      el.searchEngineSelect.addEventListener('change', function () {
        saveBrowserSettings({ defaultSearchEngine: el.searchEngineSelect.value });
      });
      syncSearchEngineSelect();
    }

    if (el.findInput) {
      el.findInput.addEventListener('input', function () {
        runFindFromInput('find');
      });
      el.findInput.addEventListener('keydown', function (evt) {
        var key = String((evt && evt.key) || '');
        if (key === 'Enter') {
          try { evt.preventDefault(); } catch (e) {}
          runFindFromInput(evt && evt.shiftKey ? 'prev' : 'next');
        } else if (key === 'Escape') {
          try { evt.preventDefault(); } catch (e2) {}
          closeFindBar();
        }
      });
    }

    if (el.findPrevBtn) {
      el.findPrevBtn.onclick = function () { runFindFromInput('prev'); };
    }

    if (el.findNextBtn) {
      el.findNextBtn.onclick = function () { runFindFromInput('next'); };
    }

    if (el.findCloseBtn) {
      el.findCloseBtn.onclick = function () { closeFindBar(); };
    }

    // MERIDIAN_SPLIT: split view toggle button
    var splitBtn = document.getElementById('webSplitBtn');
    if (splitBtn) {
      splitBtn.onclick = function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        toggleSplit();
      };
    }

    // Chrome-style kebab menu
    if (el.menuBtn) {
      el.menuBtn.onclick = function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        var rect = el.menuBtn.getBoundingClientRect();
        var items = [
          { label: 'New tab', onClick: function () { openTabPicker(); } },
          { separator: true },
          { label: 'History', onClick: function () { openHubPanelSection('browsingHistory'); } },
          { label: 'Downloads', onClick: function () { toggleDownloadsPanel(); } },
          { label: 'Bookmarks', onClick: function () { openHubPanelSection('bookmarks'); } },
          { separator: true },
          { label: 'Split view', onClick: function () { toggleSplit(); } },
          { label: 'Find in page', onClick: function () { openFindBar(); } },
          { separator: true },
          { label: 'Keyboard shortcuts', onClick: function () { toggleTips(); } },
          { label: 'Settings', onClick: function () {
            if (window.Tanko && window.Tanko.settings && typeof window.Tanko.settings.open === 'function') {
              window.Tanko.settings.open({ tab: 'browser' });
            }
          }}
        ];
        showContextMenu(items, rect.right - 200, rect.bottom + 4);
      };
    }

    // FIX-WIN-CTRL2: window controls moved to shell_bindings.js for single-source wiring

    if (el.dlBtn) {
      el.dlBtn.onclick = function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        toggleDownloadsPanel();
      };
    }

    // FEAT-TOR: Tor proxy toggle button
    if (el.torBtn) {
      el.torBtn.onclick = function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        if (state.torConnecting) return;
        if (state.torActive) {
          state.torConnecting = true;
          syncTorButton();
          api.torProxy.stop().then(function (res) {
            state.torActive = false;
            state.torConnecting = false;
            syncTorButton();
            showToast('Tor disconnected');
          }).catch(function () {
            state.torConnecting = false;
            syncTorButton();
            showToast('Failed to stop Tor');
          });
        } else {
          state.torConnecting = true;
          syncTorButton();
          showToast('Connecting to Tor...');
          api.torProxy.start().then(function (res) {
            if (res && res.ok) {
              state.torActive = true;
              showToast('Tor connected \u2014 browsing through Tor');
            } else {
              showToast((res && res.error) || 'Failed to start Tor');
            }
            state.torConnecting = false;
            syncTorButton();
          }).catch(function (err) {
            state.torConnecting = false;
            syncTorButton();
            showToast('Failed to start Tor');
          });
        }
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
    window.addEventListener('beforeunload', function () {
      scheduleSessionSave(true);
    });

    // Context menu global close handlers
    withContextMenuCloseHandlers();

    // Downloads panel outside-click close
    document.addEventListener('mousedown', function (evt) {
      var t = evt && evt.target ? evt.target : null;
      if (state.omniSuggestOpen) {
        if (!(el.omniSuggest && el.omniSuggest.contains(t)) && t !== el.urlDisplay) {
          closeOmniSuggestions();
        }
      }
      if (!state.dlPanelOpen) return;
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
          var direct = null;
          for (var i = 0; i < state.downloads.length; i++) {
            if (state.downloads[i] && String(state.downloads[i].id) === id) { direct = state.downloads[i]; break; }
          }
          if (!direct) return;
          if (action === 'pause') {
            if (!direct.canPause || !api.webSources.pauseDownload) return;
            api.webSources.pauseDownload({ id: id }).catch(function () {});
          } else if (action === 'resume') {
            if (!direct.canResume || !api.webSources.resumeDownload) return;
            api.webSources.resumeDownload({ id: id }).catch(function () {});
          } else if (action === 'cancel') {
            if (!direct.canCancel || !api.webSources.cancelDownload) return;
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
        try { evt.preventDefault(); evt.stopPropagation(); } catch (e) {}
        var action = String(actionEl.getAttribute('data-torrent-action') || '');
        var id = String(actionEl.getAttribute('data-torrent-id') || '');
        if (!id) return;
        var activeEntry = findActiveTorrentById(id);
        if (action === 'pause' && api.webTorrent.pause) {
          if (!activeEntry) {
            showToast('Torrent is not active in this session');
            refreshTorrentState();
            return;
          }
          api.webTorrent.pause({ id: id }).then(function (res) {
            if (res && res.ok === false) showToast(String(res.error || 'Unable to pause torrent'));
            refreshTorrentState();
          }).catch(function () {
            showToast('Unable to pause torrent');
            refreshTorrentState();
          });
        } else if (action === 'resume' && api.webTorrent.resume) {
          if (!activeEntry) {
            showToast('Torrent is not active in this session');
            refreshTorrentState();
            return;
          }
          api.webTorrent.resume({ id: id }).then(function (res) {
            if (res && res.ok === false) showToast(String(res.error || 'Unable to resume torrent'));
            refreshTorrentState();
          }).catch(function () {
            showToast('Unable to resume torrent');
            refreshTorrentState();
          });
        } else if (action === 'cancel' && api.webTorrent.cancel) {
          if (!activeEntry) {
            showToast('Torrent is not active in this session');
            refreshTorrentState();
            return;
          }
          api.webTorrent.cancel({ id: id }).then(function (res) {
            if (res && res.ok === false) showToast(String(res.error || 'Unable to cancel torrent'));
            refreshTorrentState();
          }).catch(function () {
            showToast('Unable to cancel torrent');
            refreshTorrentState();
          });
        } else if (action === 'remove-history' && api.webTorrent.removeHistory) {
          api.webTorrent.removeHistory({ id: id }).then(function (res) {
            if (res && res.ok === false) showToast(String(res.error || 'Unable to remove history'));
            refreshTorrentState();
          }).catch(function () {
            showToast('Unable to remove history');
            refreshTorrentState();
          });
        }
      });
    }

    if (el.hubTorrentFilter) {
      if (String(el.hubTorrentFilter.value || '') !== String(state.hubTorrentFilter || 'active')) {
        el.hubTorrentFilter.value = String(state.hubTorrentFilter || 'active');
      }
      el.hubTorrentFilter.addEventListener('change', function () {
        state.hubTorrentFilter = String(el.hubTorrentFilter.value || 'active').toLowerCase();
        renderHubTorrentActive();
      });
    }

    if (el.hubTorrentPauseAllBtn) {
      el.hubTorrentPauseAllBtn.onclick = function () { applyTorrentBulkAction('pause'); };
    }
    if (el.hubTorrentResumeAllBtn) {
      el.hubTorrentResumeAllBtn.onclick = function () { applyTorrentBulkAction('resume'); };
    }
    if (el.hubTorrentCancelAllBtn) {
      el.hubTorrentCancelAllBtn.onclick = function () { applyTorrentBulkAction('cancel'); };
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

    if (el.hubSourcesList) {
      el.hubSourcesList.addEventListener('click', function (evt) {
        var t = evt && evt.target ? evt.target : null;
        if (!t) return;
        var editBtn = t.closest ? t.closest('[data-settings-source-edit-id]') : null;
        if (editBtn) {
          var editId = String(editBtn.getAttribute('data-settings-source-edit-id') || '').trim();
          if (!editId) return;
          var sourceToEdit = null;
          for (var i = 0; i < state.sources.length; i++) {
            if (state.sources[i] && String(state.sources[i].id) === editId) { sourceToEdit = state.sources[i]; break; }
          }
          if (sourceToEdit) openAddSourceDialog(sourceToEdit);
          return;
        }

        var removeBtn = t.closest ? t.closest('[data-settings-source-remove-id]') : null;
        if (removeBtn) {
          var removeId = String(removeBtn.getAttribute('data-settings-source-remove-id') || '').trim();
          if (!removeId) return;
          removeSource(removeId);
          return;
        }

        var sourceCard = t.closest ? t.closest('[data-settings-source-id]') : null;
        if (!sourceCard) return;
        var sourceId = String(sourceCard.getAttribute('data-settings-source-id') || '').trim();
        if (!sourceId) return;
        for (var si = 0; si < state.sources.length; si++) {
          var src = state.sources[si];
          if (!src || String(src.id) !== sourceId) continue;
          openBrowser(src);
          break;
        }
      });
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
          id: 'history_' + Date.now(),
          name: siteNameFromUrl(url) || 'History',
          url: url,
          color: '#667085'
        };
        openBrowser(src);
      });
    }

    if (el.hubBookmarkCurrentBtn) {
      el.hubBookmarkCurrentBtn.onclick = function () {
        toggleBookmarkForActiveTab();
      };
    }

    if (el.hubBookmarksList) {
      el.hubBookmarksList.addEventListener('click', function (evt) {
        var t = evt && evt.target ? evt.target : null;
        if (!t) return;

        var removeBtn = t.closest ? t.closest('[data-bookmark-remove-id]') : null;
        if (removeBtn) {
          var rid = String(removeBtn.getAttribute('data-bookmark-remove-id') || '').trim();
          if (!rid || !api.webBookmarks || !api.webBookmarks.remove) return;
          api.webBookmarks.remove({ id: rid }).then(function () {
            loadBookmarks();
          }).catch(function () {});
          return;
        }

        var editBtn = t.closest ? t.closest('[data-bookmark-edit-id]') : null;
        if (editBtn) {
          var eid = String(editBtn.getAttribute('data-bookmark-edit-id') || '').trim();
          if (!eid || !api.webBookmarks || !api.webBookmarks.update) return;
          var target = null;
          for (var bi = 0; bi < state.bookmarks.length; bi++) {
            if (state.bookmarks[bi] && String(state.bookmarks[bi].id) === eid) { target = state.bookmarks[bi]; break; }
          }
          if (!target) return;
          var newTitle = window.prompt('Bookmark title', String(target.title || ''));
          if (newTitle == null) return;
          var newFolder = window.prompt('Folder (optional)', String(target.folder || ''));
          if (newFolder == null) return;
          api.webBookmarks.update({
            id: eid,
            title: String(newTitle || '').trim(),
            folder: String(newFolder || '').trim()
          }).then(function () { loadBookmarks(); }).catch(function () {});
          return;
        }

        var open = t.closest ? t.closest('[data-bookmark-open-id]') : null;
        if (!open) return;
        var oid = String(open.getAttribute('data-bookmark-open-id') || '').trim();
        if (!oid) return;
        var bm = null;
        for (var bo = 0; bo < state.bookmarks.length; bo++) {
          if (state.bookmarks[bo] && String(state.bookmarks[bo].id) === oid) { bm = state.bookmarks[bo]; break; }
        }
        if (!bm || !bm.url) return;
        var src = {
          id: 'bookmark_' + Date.now(),
          name: bm.title || siteNameFromUrl(bm.url) || 'Bookmark',
          url: bm.url,
          color: '#667085'
        };
        openBrowser(src);
      });
    }

    if (el.hubDataUsageBtn) {
      el.hubDataUsageBtn.onclick = function () {
        loadDataUsage();
      };
    }

    if (el.hubDataClearBtn) {
      el.hubDataClearBtn.onclick = function () {
        clearSelectedBrowsingData();
      };
    }

    if (el.hubPermSaveBtn) {
      el.hubPermSaveBtn.onclick = function () {
        savePermissionRuleFromHub();
      };
    }

    if (el.hubPermissionsList) {
      el.hubPermissionsList.addEventListener('click', function (evt) {
        var t = evt && evt.target ? evt.target : null;
        if (!t) return;
        var resetBtn = t.closest ? t.closest('[data-perm-remove-origin]') : null;
        if (!resetBtn || !api.webPermissions || !api.webPermissions.reset) return;
        var origin = String(resetBtn.getAttribute('data-perm-remove-origin') || '').trim();
        var permission = String(resetBtn.getAttribute('data-perm-remove-type') || '').trim();
        if (!origin || !permission) return;
        api.webPermissions.reset({
          origin: origin,
          permission: permission
        }).then(function () {
          loadPermissions();
        }).catch(function () {});
      });
    }

    if (el.hubAdblockEnabled) {
      el.hubAdblockEnabled.addEventListener('change', function () {
        if (!api.webAdblock || !api.webAdblock.setEnabled) return;
        var enabled = !!el.hubAdblockEnabled.checked;
        api.webAdblock.setEnabled({ enabled: enabled }).then(function (res) {
          if (!res || !res.ok) {
            showToast('Failed to update ad blocker');
            return;
          }
          state.adblock.enabled = !!res.enabled;
          saveBrowserSettings({ adblockEnabled: enabled });
          renderAdblockInfo();
        }).catch(function () {
          showToast('Failed to update ad blocker');
        });
      });
    }

    if (el.hubAdblockUpdateBtn) {
      el.hubAdblockUpdateBtn.onclick = function () {
        if (!api.webAdblock || !api.webAdblock.updateLists) return;
        api.webAdblock.updateLists().then(function (res) {
          if (res && res.ok) {
            showToast('Adblock lists updated');
            loadAdblockState();
          } else {
            showToast((res && res.error) ? String(res.error) : 'List update failed');
          }
        }).catch(function () {
          showToast('List update failed');
        });
      };
    }

    if (el.hubAdblockStatsBtn) {
      el.hubAdblockStatsBtn.onclick = function () {
        if (!api.webAdblock || !api.webAdblock.stats) return;
        api.webAdblock.stats().then(function (res) {
          if (!res || !res.ok || !res.stats) {
            showToast('Failed to load stats');
            return;
          }
          var s = res.stats;
          state.adblock.blockedCount = Number(s.blockedCount || 0) || 0;
          state.adblock.domainCount = Number(s.domainCount || 0) || 0;
          state.adblock.listUpdatedAt = Number(s.listUpdatedAt || 0) || 0;
          renderAdblockInfo('Sources: ' + Number(s.sourceCount || 0));
          showToast('Adblock stats refreshed');
        }).catch(function () {
          showToast('Failed to load stats');
        });
      };
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

    // BUILD_WCV: Popup/new-window â†’ same tab (main-process handler sends tabId)
    if (api.webSources.onPopupOpen) {
      api.webSources.onPopupOpen(function (info) {
        var url = info && info.url ? String(info.url) : '';
        if (!url) return;
        var mainTabId = info && info.tabId ? info.tabId : null;
        if (mainTabId == null && info && info.sourceWebContentsId != null && webTabs.findByWebContentsId) {
          mainTabId = webTabs.findByWebContentsId(info.sourceWebContentsId);
        }
        routePopupFromMainTab(mainTabId, url, info && info.sourceUrl ? String(info.sourceUrl) : '');
      });
    }

    if (el.hubMagnetStartBtn) {
      el.hubMagnetStartBtn.onclick = function () {
        startTorrentFromHubInput(el.hubMagnetInput ? el.hubMagnetInput.value : '');
      };
    }

    if (el.hubMagnetInput) {
      el.hubMagnetInput.addEventListener('keydown', function (evt) {
        var key = evt && evt.key ? String(evt.key) : '';
        if (key !== 'Enter') return;
        try { evt.preventDefault(); } catch (e) {}
        startTorrentFromHubInput(el.hubMagnetInput.value);
      });
    }

    if (el.hubMagnetPasteBtn) {
      el.hubMagnetPasteBtn.onclick = function () {
        try {
          if (!navigator.clipboard || !navigator.clipboard.readText) {
            showToast('Clipboard unavailable');
            return;
          }
          navigator.clipboard.readText().then(function (text) {
            var v = String(text || '').trim();
            if (!v) {
              showToast('Clipboard is empty');
              return;
            }
            if (el.hubMagnetInput) el.hubMagnetInput.value = v;
            startTorrentFromHubInput(v);
          }).catch(function () {
            showToast('Failed to read clipboard');
          });
        } catch (e) {
          showToast('Clipboard unavailable');
        }
      };
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
      // CHROMIUM_PARITY: sync title into navEntries for history dropdown
      var rt = ensureTabRuntime(tab);
      if (rt.currentIndex >= 0 && rt.navEntries[rt.currentIndex]) {
        rt.navEntries[rt.currentIndex].title = String(data.title || '');
      }
      renderTabs();
      renderBrowserHome();
      renderContinue();
      updateBookmarkButton();
      scheduleSessionSave();
    });

    webTabs.onUrlUpdated(function (data) {
      var tab = getTabByMainId(data && data.tabId);
      if (!tab) return;
      tab.url = data.url || '';
      // CHROMIUM_PARITY: direction-aware history tracking
      var direction = (data && data.direction) || '';
      if (direction === 'index' && data.targetIndex != null) {
        var runtime = ensureTabRuntime(tab);
        runtime.currentIndex = Math.max(0, Math.min(Number(data.targetIndex), runtime.navEntries.length - 1));
        if (runtime.navEntries[runtime.currentIndex]) runtime.navEntries[runtime.currentIndex].url = tab.url;
        runtime.lastVisibleUrl = tab.url;
        runtime.lastCommittedUrl = tab.url;
        runtime.pendingUrl = '';
        runtime.securityState = inferSecurityStateFromUrl(tab.url);
        runtime.isBlocked = false;
        runtime.lastError = null;
      } else {
        pushRuntimeCommittedUrl(tab, tab.url, direction);
      }
      maybeRecordBrowsingHistory(tab, tab.url);
      if (tab.id === state.activeTabId) {
        updateUrlDisplay();
      }
      renderBrowserHome();
      renderContinue();
      updateBookmarkButton();
      scheduleSessionSave();
    });

    webTabs.onLoading(function (data) {
      var tab = getTabByMainId(data && data.tabId);
      if (!tab) return;
      tab.loading = !!data.loading;
      var runtime = ensureTabRuntime(tab);
      if (tab.loading) {
        runtime.pendingUrl = String(tab.url || runtime.lastVisibleUrl || '').trim();
      } else {
        runtime.pendingUrl = '';
      }
      renderTabs();
      renderBrowserHome();
      syncLoadBar();
      scheduleSessionSave();
    });

    webTabs.onNavState(function (data) {
      var tab = getTabByMainId(data && data.tabId);
      if (!tab) return;
      tab.canGoBack = !!data.canGoBack;
      tab.canGoForward = !!data.canGoForward;
      var runtime = ensureTabRuntime(tab);
      runtime.securityState = inferSecurityStateFromUrl(tab.url || runtime.lastVisibleUrl || '');
      if (tab.id === state.activeTabId) {
        updateNavButtons();
      }
    });

    if (webTabs.onLoadFailed) {
      webTabs.onLoadFailed(function (data) {
        var tab = getTabByMainId(data && data.tabId);
        if (!tab) return;
        var runtime = ensureTabRuntime(tab);
        var failure = (data && data.failure) ? data.failure : classifyLoadFailure(data && data.errorCode, data && data.errorDescription, data && data.url);
        var failedUrl = String((data && data.url) || tab.url || runtime.lastVisibleUrl || '').trim();
        if (failedUrl) {
          tab.url = failedUrl;
          runtime.lastVisibleUrl = failedUrl;
        }
        runtime.pendingUrl = '';
        runtime.isBlocked = !!failure.isBlocked;
        runtime.lastError = {
          kind: String(failure.kind || 'load_failed'),
          code: Number(data && data.errorCode || 0),
          description: String(data && data.errorDescription || ''),
          url: failedUrl,
          at: Date.now()
        };
        runtime.securityState = inferSecurityStateFromUrl(failedUrl);
        if (failure && failure.title) {
          tab.title = String(failure.title);
        }
        if (tab.id === state.activeTabId) {
          updateUrlDisplay();
        }
        renderTabs();
        renderBrowserHome();
        renderContinue();
        syncLoadBar();
        scheduleSessionSave();
      });
    }

    webTabs.onFindResult(function (data) {
      var tab = getTabByMainId(data && data.tabId);
      if (!tab || tab.id !== state.activeTabId) return;
      var r = data && data.result ? data.result : {};
      state.findResult = {
        activeMatchOrdinal: Number(r.activeMatchOrdinal || 0) || 0,
        matches: Number(r.matches || 0) || 0
      };
      updateFindCountLabel();
    });

    if (api.webHistory && api.webHistory.onUpdated) {
      api.webHistory.onUpdated(function () {
        loadBrowsingHistory();
      });
    }

    if (api.webSession && api.webSession.onUpdated) {
      api.webSession.onUpdated(function (payload) {
        if (!payload || !payload.state || state.sessionRestoreInProgress) return;
        state.restoreLastSession = payload.state.restoreLastSession !== false;
      });
    }

    if (api.webBookmarks && api.webBookmarks.onUpdated) {
      api.webBookmarks.onUpdated(function () {
        loadBookmarks();
      });
    }

    if (api.webPermissions && api.webPermissions.onUpdated) {
      api.webPermissions.onUpdated(function () {
        loadPermissions();
      });
    }

    if (api.webAdblock && api.webAdblock.onUpdated) {
      api.webAdblock.onUpdated(function () {
        loadAdblockState();
      });
    }

    if (api.webTorrent && api.webTorrent.onUpdated) {
      api.webTorrent.onUpdated(function (payload) {
        if (payload && Array.isArray(payload.torrents)) {
          state.torrentActive = [];
          for (var ti = 0; ti < payload.torrents.length; ti++) {
            var ta = normalizeTorrentEntry(payload.torrents[ti]);
            if (ta) state.torrentActive.push(ta);
            if (payload.torrents[ti] && payload.torrents[ti].id) {
              updateTorrentTabFromEntry(payload.torrents[ti].id, payload.torrents[ti]);
            }
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
      api.webTorrent.onStarted(function (info) {
        refreshTorrentState();
      });
    }

    if (api.webTorrent && api.webTorrent.onMetadata) {
      api.webTorrent.onMetadata(function (info) {
        if (info && info.id) {
          updateTorrentTabFromEntry(info.id, info);
        }
        refreshTorrentState();
      });
    }

    if (api.webTorrent && api.webTorrent.onProgress) {
      api.webTorrent.onProgress(function (info) {
        renderHubTorrentActive();
        if (info && info.id) {
          updateTorrentTabProgress(info.id, info);
        }
      });
    }

    if (api.webTorrent && api.webTorrent.onCompleted) {
      api.webTorrent.onCompleted(function (info) {
        refreshTorrentState();
        if (info && info.id) {
          updateTorrentTabFromEntry(info.id, info);
        }
        var stateName = String(info && info.state || '').toLowerCase();
        var label = (info && info.name) ? String(info.name) : '';
        if (stateName === 'completed' || stateName === 'completed_with_errors') {
          showToast(label ? ('Torrent finished: ' + label) : 'Torrent finished');
        } else if (stateName === 'cancelled') {
          showToast(label ? ('Torrent cancelled: ' + label) : 'Torrent cancelled');
        } else if (stateName) {
          var err = String(info && info.error || '');
          showToast(err ? err : 'Torrent failed');
        }
      });
    }

    // FEAT-TOR: Listen for Tor proxy status changes (from main process)
    if (api.torProxy && api.torProxy.onStatusChanged) {
      api.torProxy.onStatusChanged(function (data) {
        state.torActive = !!(data && data.active);
        state.torConnecting = !!(data && data.connecting);
        syncTorButton();
        if (data && data.crashed) {
          showToast('Tor connection lost');
        }
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
    loadBrowserSettings().then(function () {
      loadSessionAndRestore();
    }).catch(function () {
      loadSessionAndRestore();
    });
    loadSources();
    loadDestinations();
    loadBrowsingHistory();
    loadBookmarks();
    loadPermissions();
    loadAdblockState();
    loadDataUsage();
    refreshTorrentState();
    // FEAT-TOR: Query initial Tor status
    if (api.torProxy && api.torProxy.getStatus) {
      api.torProxy.getStatus().then(function (res) {
        state.torActive = !!(res && res.active);
        syncTorButton();
      }).catch(function () {});
    }
    syncDownloadIndicator();
    updateFindCountLabel();
    renderDownloadsPanel();
    renderHomeDownloads();
    renderBrowserHome();
    updateBookmarkButton();
    renderHubAll();
    renderHubBookmarks();
    renderPermissions();
    renderAdblockInfo();
  }

  // ---- Init ----

  moduleBridge.deps.showToast = showToast;
  moduleBridge.deps.renderTabs = renderTabs;
  moduleBridge.deps.syncLoadBar = syncLoadBar;
  moduleBridge.deps.syncReloadStopButton = syncReloadStopButton;
  moduleBridge.deps.updateNavButtons = updateNavButtons;
  moduleBridge.deps.updateUrlDisplay = updateUrlDisplay;
  moduleBridge.deps.openBrowserForTab = openBrowserForTab;
  moduleBridge.deps.createTab = createTab;
  moduleBridge.deps.getActiveTab = getActiveTab;
  moduleBridge.deps.ensureTabRuntime = ensureTabRuntime;
  moduleBridge.deps.isWebModeActive = isWebModeActive;
  moduleBridge.deps.renderHubAll = renderHubAll;
  moduleBridge.deps.renderDownloadsPanel = renderDownloadsPanel;
  moduleBridge.deps.renderHomeDownloads = renderHomeDownloads;

  try {
    bindUI();
  } catch (e) {
    console.warn('[BUILD_WCV] bindUI failed', e);
  }

  // Expose openBrowser globally so Comics/Books sidebars can call it
  try {
    function openDefaultBrowserEntry() {
      if (state.tabs.length) {
        var targetId = state.activeTabId != null ? state.activeTabId : state.tabs[0].id;
        openBrowserForTab(targetId);
      } else {
        openYandexNewTab();
      }
    }
    window.Tanko = window.Tanko || {};
    window.Tanko.web = {
      openBrowser: openBrowser,
      openHome: openHome,
      openDefault: openDefaultBrowserEntry,
      isBrowserOpen: function () { return !!state.browserOpen; },
      openAddSourceDialog: function () { openAddSourceDialog(null); }
    };
  } catch (e) {}

})();
