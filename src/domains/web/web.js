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
    if (!SEARCH_ENGINES[key]) key = 'yandex';
    return key;
  }

  function getSearchQueryUrl(query) {
    var key = getActiveSearchEngine();
    var base = SEARCH_ENGINE_URLS[key] || SEARCH_ENGINE_URLS.yandex;
    return base + encodeURIComponent(String(query || ''));
  }

  function syncSearchEngineSelect() {
    if (!el.searchEngineSelect) return;
    var key = getActiveSearchEngine();
    if (String(el.searchEngineSelect.value || '') !== key) {
      el.searchEngineSelect.value = key;
    }
  }

  function syncOmniPlaceholder() {
    if (!el.urlDisplay) return;
    var key = getActiveSearchEngine();
    var label = (SEARCH_ENGINES[key] && SEARCH_ENGINES[key].label) ? SEARCH_ENGINES[key].label : 'Yandex';
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

  function tryResolveCtrlEnterUrl(input) {
    var raw = String(input || '').trim();
    if (!raw) return '';
    if (raw.indexOf(' ') !== -1) return '';
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return '';
    if (raw.indexOf('.') !== -1 || raw.indexOf('/') !== -1) return '';
    return 'https://www.' + raw + '.com';
  }

  function closeOmniSuggestions() {
    state.omniSuggestOpen = false;
    state.omniSuggestItems = [];
    state.omniSuggestActiveIndex = -1;
    clearOmniGhost(); // CHROMIUM_PARITY
    if (!el.omniSuggest) return;
    el.omniSuggest.classList.add('hidden');
    el.omniSuggest.innerHTML = '';
  }

  // CHROMIUM_PARITY: Inline autocomplete ghost text (C1)
  var _omniGhostCompletion = ''; // current completion suffix

  function clearOmniGhost() {
    _omniGhostCompletion = '';
    if (el.omniGhost) el.omniGhost.innerHTML = '';
  }

  function stripUrlPrefix(url) {
    var s = String(url || '');
    s = s.replace(/^https?:\/\//, '');
    s = s.replace(/^www\./, '');
    return s;
  }

  function updateOmniGhostText() {
    if (!el.omniGhost || !el.urlDisplay) { clearOmniGhost(); return; }
    if (state._omniComposing) { clearOmniGhost(); return; } // IME active

    var typed = String(el.urlDisplay.value || '');
    if (!typed) { clearOmniGhost(); return; }

    var typedLower = typed.toLowerCase();
    var strippedTyped = stripUrlPrefix(typed).toLowerCase();

    // Find best matching suggestion URL
    var bestMatch = '';
    var items = state.omniSuggestItems || [];
    for (var i = 0; i < items.length; i++) {
      if (!items[i] || !items[i].url) continue;
      var candidate = stripUrlPrefix(items[i].url);
      if (candidate.toLowerCase().indexOf(strippedTyped) === 0 && candidate.length > strippedTyped.length) {
        bestMatch = candidate;
        break;
      }
      // Also try matching raw typed text against full URL
      var fullLower = String(items[i].url || '').toLowerCase();
      if (fullLower.indexOf(typedLower) === 0 && items[i].url.length > typed.length) {
        bestMatch = items[i].url.substring(typed.length);
        _omniGhostCompletion = bestMatch;
        el.omniGhost.innerHTML = '<span class="ghost-spacer">' + escapeHtml(typed) + '</span><span class="ghost-completion">' + escapeHtml(bestMatch) + '</span>';
        return;
      }
    }

    if (!bestMatch) { clearOmniGhost(); return; }

    var completion = bestMatch.substring(strippedTyped.length);
    _omniGhostCompletion = completion;
    el.omniGhost.innerHTML = '<span class="ghost-spacer">' + escapeHtml(typed) + '</span><span class="ghost-completion">' + escapeHtml(completion) + '</span>';
  }

  function acceptOmniGhost() {
    if (!_omniGhostCompletion || !el.urlDisplay) return false;
    el.urlDisplay.value = el.urlDisplay.value + _omniGhostCompletion;
    clearOmniGhost();
    return true;
  }

  // CHROMIUM_PARITY: Per-tab omnibox state (C2)
  function saveOmniState() {
    if (!el.urlDisplay) return;
    var focused = (document.activeElement === el.urlDisplay);
    if (!focused) return;
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

  function restoreOmniState(tabId) {
    var tab = null;
    for (var i = 0; i < state.tabs.length; i++) {
      if (state.tabs[i].id === tabId) { tab = state.tabs[i]; break; }
    }
    if (!tab || !el.urlDisplay) return;
    var runtime = ensureTabRuntime(tab);
    var saved = runtime.omniState;
    runtime.omniState = null;
    if (!saved || !saved.focused) return;
    state._omniRestoreInProgress = true;
    el.urlDisplay.value = saved.text;
    try { el.urlDisplay.setSelectionRange(saved.selStart, saved.selEnd); } catch (e) {}
    el.urlDisplay.focus();
    setTimeout(function () { state._omniRestoreInProgress = false; }, 50);
  }

  function applyOmniSuggestion(item) {
    if (!item || !item.url || !el.urlDisplay) return;
    if (typeof el.urlDisplay.value !== 'undefined') el.urlDisplay.value = String(item.url);
    else el.urlDisplay.textContent = String(item.url);
    setOmniIconForUrl(String(item.url));
    closeOmniSuggestions();
  }

  function buildOmniSuggestions(input) {
    var query = String(input || '').trim().toLowerCase();
    if (!query) return [];
    var out = [];
    var seen = Object.create(null);

    function push(url, title, kind) {
      var u = String(url || '').trim();
      if (!u) return;
      var key = u.toLowerCase();
      if (seen[key]) return;
      var t = String(title || '').trim();
      if (query) {
        var h = (u + ' ' + t).toLowerCase();
        if (h.indexOf(query) === -1) return;
      }
      seen[key] = 1;
      out.push({
        url: u,
        title: t || siteNameFromUrl(u) || u,
        kind: kind || 'page'
      });
    }

    for (var i = 0; i < state.tabs.length; i++) {
      var tab = state.tabs[i];
      if (!tab || tab.type === 'torrent') continue;
      push(tab.url || tab.homeUrl, tab.title || tab.sourceName, 'tab');
      if (out.length >= 10) break;
    }
    for (var b = 0; b < state.bookmarks.length && out.length < 10; b++) {
      var bm = state.bookmarks[b];
      if (!bm) continue;
      push(bm.url, bm.title, 'bookmark');
    }
    for (var h = 0; h < state.browsingHistory.length && out.length < 10; h++) {
      var hi = state.browsingHistory[h];
      if (!hi) continue;
      push(hi.url, hi.title, 'history');
    }
    return out.slice(0, 8);
  }

  function renderOmniSuggestions() {
    if (!el.omniSuggest) return;
    if (!state.omniSuggestOpen || !state.omniSuggestItems.length) {
      closeOmniSuggestions();
      return;
    }
    var html = '';
    for (var i = 0; i < state.omniSuggestItems.length; i++) {
      var s = state.omniSuggestItems[i];
      var kind = String(s.kind || 'page');
      var activeCls = i === state.omniSuggestActiveIndex ? ' active' : '';
      html += '' +
        '<button type="button" class="webOmniSuggestItem' + activeCls + '" data-omni-suggest-idx="' + i + '">' +
          '<span class="webHubBadge">' + escapeHtml(kind) + '</span>' +
          '<span class="webOmniSuggestMain">' + escapeHtml(s.title || s.url) + '</span>' +
          '<span class="webOmniSuggestSub">' + escapeHtml(s.url) + '</span>' +
        '</button>';
    }
    el.omniSuggest.innerHTML = html;
    el.omniSuggest.classList.remove('hidden');

    var btns = el.omniSuggest.querySelectorAll('[data-omni-suggest-idx]');
    for (var j = 0; j < btns.length; j++) {
      btns[j].onclick = function (evt) {
        try { evt.preventDefault(); evt.stopPropagation(); } catch (e) {}
        var idx = Number(this.getAttribute('data-omni-suggest-idx'));
        if (!isFinite(idx) || idx < 0 || idx >= state.omniSuggestItems.length) return;
        var item = state.omniSuggestItems[idx];
        applyOmniSuggestion(item);
        openUrlFromOmni(String(item && item.url ? item.url : ''));
      };
    }
  }

  function refreshOmniSuggestionsFromInput() {
    if (!el.urlDisplay) return;
    var raw = String(el.urlDisplay.value || '').trim();
    state.omniSuggestItems = buildOmniSuggestions(raw);
    state.omniSuggestActiveIndex = state.omniSuggestItems.length ? 0 : -1;
    state.omniSuggestOpen = !!state.omniSuggestItems.length;
    renderOmniSuggestions();
    updateOmniGhostText(); // CHROMIUM_PARITY: refresh inline autocomplete
  }

  function openUrlFromOmni(resolved, opts) {
    var o = opts || {};
    var inNewTab = !!o.newTab;
    var targetTabId = Number(o.tabId);
    var targetTab = null;
    if (isFinite(targetTabId) && targetTabId > 0) {
      for (var ti = 0; ti < state.tabs.length; ti++) {
        if (state.tabs[ti] && state.tabs[ti].id === targetTabId) {
          targetTab = state.tabs[ti];
          break;
        }
      }
    }
    var resolvedUrl = String(resolved || '').trim();
    if (!resolvedUrl) return;
    if (typeof el.urlDisplay.value !== 'undefined') el.urlDisplay.value = resolvedUrl;
    else el.urlDisplay.textContent = resolvedUrl;
    setOmniIconForUrl(resolvedUrl);
    closeOmniSuggestions();
    if (inNewTab) {
      var src = {
        id: 'omni_' + Date.now(),
        name: siteNameFromUrl(resolvedUrl) || 'New Tab',
        url: resolvedUrl,
        color: '#555'
      };
      createTab(src, resolvedUrl, { silentToast: true });
      return;
    }
    var tab = targetTab || getActiveTab();
    if (!tab || !tab.mainTabId) {
      var src0 = {
        id: 'omni_' + Date.now(),
        name: siteNameFromUrl(resolvedUrl) || 'New Tab',
        url: resolvedUrl,
        color: '#555'
      };
      createTab(src0, resolvedUrl, { silentToast: true });
      return;
    }
    webTabs.navigate({ tabId: tab.mainTabId, action: 'loadUrl', url: resolvedUrl }).catch(function () {});
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

  function createTabRuntime(url) {
    var u = String(url || '').trim();
    var entries = [];
    if (u) entries.push({ url: u, title: '' });
    return {
      navEntries: entries,
      currentIndex: entries.length ? 0 : -1,
      pendingUrl: '',
      lastVisibleUrl: u,
      lastCommittedUrl: u,
      lastError: null,
      securityState: inferSecurityStateFromUrl(u),
      isBlocked: false,
      omniState: null // CHROMIUM_PARITY: per-tab omnibox state (C2)
    };
  }

  function ensureTabRuntime(tab) {
    if (!tab) return createTabRuntime('');
    if (!tab.runtime || typeof tab.runtime !== 'object') {
      tab.runtime = createTabRuntime(tab.url || tab.homeUrl || '');
    }
    // CHROMIUM_PARITY: Migrate legacy string navEntries to { url, title } objects
    var rt = tab.runtime;
    if (rt.navEntries && rt.navEntries.length > 0 && typeof rt.navEntries[0] === 'string') {
      rt.navEntries = rt.navEntries.map(function (e) {
        return typeof e === 'string' ? { url: e, title: '' } : e;
      });
    }
    return rt;
  }

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

    var out = {
      kind: 'load_failed',
      isBlocked: false,
      title: '',
      toast: ''
    };

    if (code === -20 || code === -21 || lower.indexOf('blocked') !== -1 || lower.indexOf('client blocked') !== -1) {
      out.kind = 'blocked';
      out.isBlocked = true;
    } else if (code === -105 || code === -137 || code === -300 || lower.indexOf('name not resolved') !== -1 || lower.indexOf('dns') !== -1) {
      out.kind = 'dns';
    } else if (code <= -200 && code >= -299) {
      out.kind = 'tls';
    } else if (code === -118 || code === -7 || lower.indexOf('timed out') !== -1) {
      out.kind = 'timeout';
    } else if (code === -106 || lower.indexOf('internet disconnected') !== -1) {
      out.kind = 'offline';
    }

    if (out.kind === 'blocked') out.title = 'Blocked';
    else if (out.kind === 'dns') out.title = 'DNS error';
    else if (out.kind === 'tls') out.title = 'TLS error';
    else if (out.kind === 'timeout') out.title = 'Timed out';
    else if (out.kind === 'offline') out.title = 'Offline';
    else out.title = 'Load failed';

    if (host) out.title += ' - ' + host;

    if (out.kind === 'blocked') out.toast = 'Blocked: ' + (host || 'site');
    else if (desc) out.toast = 'Load failed: ' + desc;
    else out.toast = out.title;

    return out;
  }

  // CHROMIUM_PARITY: direction-aware history tracking for back/forward dropdown
  function pushRuntimeCommittedUrl(tab, url, direction) {
    var runtime = ensureTabRuntime(tab);
    var u = String(url || '').trim();
    if (!u) return;
    runtime.lastVisibleUrl = u;
    runtime.lastCommittedUrl = u;
    runtime.pendingUrl = '';
    runtime.securityState = inferSecurityStateFromUrl(u);
    runtime.isBlocked = false;
    runtime.lastError = null;

    if (direction === 'back') {
      if (runtime.currentIndex > 0) runtime.currentIndex--;
      if (runtime.navEntries[runtime.currentIndex]) runtime.navEntries[runtime.currentIndex].url = u;
      return;
    }
    if (direction === 'forward') {
      if (runtime.currentIndex < runtime.navEntries.length - 1) runtime.currentIndex++;
      if (runtime.navEntries[runtime.currentIndex]) runtime.navEntries[runtime.currentIndex].url = u;
      return;
    }
    if (direction === 'index') return; // index handled directly in onUrlUpdated

    // Normal new navigation
    var current = runtime.navEntries[runtime.currentIndex];
    if (current && current.url === u) return;
    if (runtime.currentIndex < runtime.navEntries.length - 1) {
      runtime.navEntries = runtime.navEntries.slice(0, runtime.currentIndex + 1);
    }
    runtime.navEntries.push({ url: u, title: String(tab.title || '') });
    if (runtime.navEntries.length > 250) {
      runtime.navEntries.shift();
    }
    runtime.currentIndex = runtime.navEntries.length - 1;
  }

  function normalizeSourceInput(source, urlOverride) {
    if (source && typeof source === 'object') {
      var objUrl = String(source.url || urlOverride || '').trim();
      return {
        id: source.id != null ? source.id : ('src_' + Date.now()),
        name: String(source.name || siteNameFromUrl(objUrl) || 'New Tab'),
        url: objUrl || String(urlOverride || 'about:blank').trim(),
        color: String(source.color || '#555')
      };
    }

    var asUrl = String(source || urlOverride || '').trim();
    if (!asUrl) asUrl = 'about:blank';
    return {
      id: 'src_' + Date.now(),
      name: siteNameFromUrl(asUrl) || 'New Tab',
      url: asUrl,
      color: '#555'
    };
  }

  function snapshotTabForSession(tab) {
    if (!tab) return null;
    if (tab.type === 'torrent') return null; // torrent tabs are transient, don't persist
    var url = String(tab.url || '').trim();
    if (!url) return null;
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
    var tabs = [];
    for (var i = 0; i < state.tabs.length; i++) {
      var snap = snapshotTabForSession(state.tabs[i]);
      if (snap) tabs.push(snap);
      if (tabs.length >= MAX_TABS) break;
    }
    var closedTabs = [];
    for (var j = 0; j < state.closedTabs.length; j++) {
      var closed = snapshotTabForSession(state.closedTabs[j]);
      if (closed) closedTabs.push(closed);
      if (closedTabs.length >= MAX_CLOSED_TABS) break;
    }
    return {
      tabs: tabs,
      activeTabId: state.activeTabId != null ? String(state.activeTabId) : '',
      closedTabs: closedTabs,
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
      toastText: 'Reopened tab',
      skipHistory: true,
      titleOverride: snap.title || '',
      forcedId: Number(snap.id || 0) || null
    });
    if (restored) {
      restored.pinned = !!snap.pinned;
      renderTabs();
      showToast('Reopened tab');
      scheduleSessionSave();
    }
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
          titleOverride: s.title || '',
          forcedId: sidNum > 0 ? sidNum : null
        });
        if (tab) tab.pinned = !!s.pinned;
      }
      if (maxId >= state.nextTabId) state.nextTabId = maxId + 1;

      if (targetActive) {
        for (var j = 0; j < state.tabs.length; j++) {
          if (String(state.tabs[j].id) === targetActive) {
            activateTab(state.tabs[j].id);
            break;
          }
        }
      }
      renderTabs();
    }).catch(function () {
      // ignore restore failures
    }).finally(function () {
      state.sessionRestoreInProgress = false;
      scheduleSessionSave();
    });
  }

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
      transport: d.transport != null ? String(d.transport) : '',
      canPause: d.canPause != null ? !!d.canPause : null,
      canResume: d.canResume != null ? !!d.canResume : null,
      canCancel: d.canCancel != null ? !!d.canCancel : null,
    };

    var stateName = String(out.state || '').toLowerCase();
    if (stateName === 'started' || stateName === 'downloading' || stateName === 'in_progress' || stateName === 'progressing') out.state = 'progressing';
    else if (stateName === 'paused') out.state = 'paused';
    else if (stateName === 'completed' || stateName === 'saved' || stateName === 'done') out.state = 'completed';
    else if (stateName === 'cancelled' || stateName === 'canceled') out.state = 'cancelled';
    else if (stateName === 'interrupted') out.state = 'interrupted';
    else if (stateName === 'failed' || stateName === 'error') out.state = 'failed';
    else if (out.error) out.state = 'failed';

    if (!out.transport) out.transport = 'electron-item';
    if (out.canPause == null) out.canPause = out.transport !== 'direct';
    if (out.canResume == null) out.canResume = out.transport !== 'direct';
    if (out.canCancel == null) out.canCancel = true;
    if (typeof out.progress === 'number') out.progress = Math.max(0, Math.min(1, out.progress));
    if (out.progress == null && out.totalBytes > 0 && out.receivedBytes >= 0) out.progress = Math.max(0, Math.min(1, out.receivedBytes / out.totalBytes));
    if (!out.id) {
      var seed = String(out.destination || out.downloadUrl || out.filename || Date.now());
      out.id = 'dl_' + seed.replace(/[^a-z0-9_\-.]+/gi, '_').slice(0, 42);
    }
    if (!out.filename) out.filename = 'Download';
    return out;
  }

  function isDownloadActiveState(stateStr) {
    var s = String(stateStr || '').toLowerCase();
    return s === 'progressing' || s === 'downloading' || s === 'paused' || s === 'in_progress' || s === 'started';
  }

  function isDownloadTerminalState(stateStr) {
    var s = String(stateStr || '').toLowerCase();
    return s === 'completed' || s === 'cancelled' || s === 'failed' || s === 'interrupted';
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
    var norm = normalizeDownload(info);
    if (!norm) return;

    var found = null;
    for (var i = 0; i < state.downloads.length; i++) {
      var d = state.downloads[i];
      if (!d) continue;
      if (norm.id && d.id === norm.id) { found = d; break; }
      if (!norm.id && norm.destination && d.destination === norm.destination) { found = d; break; }
    }

    if (!found) {
      state.downloads.unshift(norm);
    } else {
      Object.assign(found, normalizeDownload(Object.assign({}, found, info)));
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

  function doDownloadAction(id, action) {
    if (!id || !api || !api.webSources) return;
    if (action === 'pause' && api.webSources.pauseDownload) api.webSources.pauseDownload({ id: id }).catch(function () {});
    else if (action === 'resume' && api.webSources.resumeDownload) api.webSources.resumeDownload({ id: id }).catch(function () {});
    else if (action === 'cancel' && api.webSources.cancelDownload) api.webSources.cancelDownload({ id: id }).catch(function () {});
    else if (action === 'retry' && api.webSources.downloadFromUrl) {
      var item = null;
      for (var i = 0; i < state.downloads.length; i++) { if (state.downloads[i] && state.downloads[i].id === id) { item = state.downloads[i]; break; } }
      if (!item || !item.downloadUrl) { showToast('Retry unavailable'); return; }
      api.webSources.downloadFromUrl({ url: item.downloadUrl, referer: item.pageUrl || '' }).catch(function () {});
    }
  }

  function removeDownloadItem(id) {
    if (!id) return;
    var d = null;
    for (var k = 0; k < state.downloads.length; k++) {
      if (state.downloads[k] && state.downloads[k].id === id) { d = state.downloads[k]; break; }
    }
    if (!d || isDownloadActiveState(d.state)) {
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

      var isActive = isDownloadActiveState(d.state);
      var isOk = d.state === 'completed';
      var isCancelled = d.state === 'cancelled';
      var isBad = d.state === 'failed' || d.state === 'interrupted';
      var stateTxt = isActive ? (d.state === 'paused' ? 'Paused' : 'Downloading') : (isOk ? 'Saved' : (isCancelled ? 'Cancelled' : 'Failed'));

      var sub = '';
      var libTag = d.library ? ('→ ' + d.library) : '';
      if (isActive) {
        var left = (d.totalBytes > 0 && d.receivedBytes >= 0) ? (formatBytes(d.receivedBytes) + ' / ' + formatBytes(d.totalBytes)) : '';
        var sp = formatSpeed(d.bytesPerSec);
        var eta = formatEta(d.receivedBytes, d.totalBytes, d.bytesPerSec);
        sub = libTag;
        if (left) sub = (sub ? (sub + ' • ') : '') + left;
        if (sp) sub = (sub ? (sub + ' • ') : '') + sp;
        if (eta) sub = (sub ? (sub + ' • ETA ' + eta) : ('ETA ' + eta));
      } else if (isOk) {
        sub = libTag;
        if (d.destination) sub = (sub ? (sub + ' • ') : '') + shortPath(d.destination);
      } else {
        sub = d.error ? d.error : (isCancelled ? 'Cancelled' : 'Download failed');
      }

      var p = null;
      if (isActive && !opts.compact) p = (typeof d.progress === 'number') ? Math.max(0, Math.min(1, d.progress)) : null;
      var pctTxt = (p != null) ? Math.round(p * 100) + '%' : '';
      var iconUrl = faviconFor(d.pageUrl || d.downloadUrl);
      var canPauseAction = !!(d.canPause && api && api.webSources && api.webSources.pauseDownload);
      var canResumeAction = !!(d.canResume && api && api.webSources && api.webSources.resumeDownload);
      var canCancelAction = !!(d.canCancel && api && api.webSources && api.webSources.cancelDownload);
      var canRetry = !!(api && api.webSources && api.webSources.downloadFromUrl && d.downloadUrl && !isActive && !isOk);
      var canOpenFile = !!(isOk && d.destination && api && api.shell && api.shell.openPath);
      var canOpenFolder = !!(d.destination && api && api.shell && api.shell.revealPath);

      var actionsHtml = '';
      if (isActive) {
        if (d.state === 'paused') {
          if (canResumeAction) actionsHtml += '<button class="webDlAction" type="button" title="Resume" data-dl-action="resume">▶</button>';
        } else if (canPauseAction) actionsHtml += '<button class="webDlAction" type="button" title="Pause" data-dl-action="pause">❚❚</button>';
        if (canCancelAction) actionsHtml += '<button class="webDlAction" type="button" title="Cancel" data-dl-action="cancel">✕</button>';
      } else {
        if (canOpenFile) actionsHtml += '<button class="webDlAction" type="button" title="Open file" data-dl-action="open-file">Open</button>';
        if (canOpenFolder) actionsHtml += '<button class="webDlAction" type="button" title="Open folder" data-dl-action="open-folder">Folder</button>';
        if (canRetry) actionsHtml += '<button class="webDlAction" type="button" title="Retry" data-dl-action="retry">Retry</button>';
      }

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
            (actionsHtml ? ('<div class="webDlActions">' + actionsHtml + '</div>') : '') +
            (opts.allowRemove ? ('<button class="iconBtn webDlRemove" title="Remove" aria-label="Remove" data-dl-remove="1">×</button>') : '') +
          '</div>' +
        '</div>';
    }

    targetEl.innerHTML = html;
    var items = targetEl.querySelectorAll('.webDlItem');
    for (var j = 0; j < items.length; j++) {
      var rm = items[j].querySelector('.webDlRemove');
      if (rm) rm.onclick = function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        var p = this.parentElement; while (p && !p.classList.contains('webDlItem')) p = p.parentElement;
        if (!p) return; removeDownloadItem(p.getAttribute('data-dl-id'));
      };
      var actionBtns = items[j].querySelectorAll('[data-dl-action]');
      for (var ai = 0; ai < actionBtns.length; ai++) {
        actionBtns[ai].onclick = function (e) {
          try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
          var action = String(this.getAttribute('data-dl-action') || '');
          var p = this.parentElement; while (p && !p.classList.contains('webDlItem')) p = p.parentElement;
          if (!p) return;
          var id = p.getAttribute('data-dl-id');
          var d = null;
          for (var k = 0; k < state.downloads.length; k++) { if (state.downloads[k] && state.downloads[k].id === id) { d = state.downloads[k]; break; } }
          if (!d) return;
          if (action === 'open-file' && d.destination && api && api.shell && api.shell.openPath) api.shell.openPath(d.destination).catch(function () {});
          else if (action === 'open-folder' && d.destination && api && api.shell && api.shell.revealPath) api.shell.revealPath(d.destination).catch(function () {});
          else doDownloadAction(id, action);
        };
      }
    }
  }

  function getDownloadGroups() {
    var active = [];
    var terminal = [];
    for (var i = 0; i < state.downloads.length; i++) {
      var d = state.downloads[i];
      if (!d) continue;
      if (isDownloadActiveState(d.state)) active.push(d);
      else terminal.push(d);
    }
    active.sort(function (a, b) { return Number(b.startedAt || 0) - Number(a.startedAt || 0); });
    terminal.sort(function (a, b) { return Number(b.finishedAt || b.startedAt || 0) - Number(a.finishedAt || a.startedAt || 0); });
    return { active: active, terminal: terminal };
  }

  function renderDownloadsPanel() {
    if (!el.dlList || !el.dlEmpty) return;
    var groups = getDownloadGroups();
    renderDownloadList(el.dlList, el.dlEmpty, groups.active.concat(groups.terminal), { allowRemove: true });
  }

  function renderHomeDownloads() {
    if (!el.homeDlList || !el.homeDlEmpty) return;
    var groups = getDownloadGroups();
    renderDownloadList(el.homeDlList, el.homeDlEmpty, groups.active.concat(groups.terminal).slice(0, 8), { compact: true, allowRemove: true });
  }

  function isDirectActiveState(stateStr) {
    var s = String(stateStr || '').toLowerCase();
    return s === 'progressing' || s === 'downloading' || s === 'paused' || s === 'in_progress';
  }

  // ── Torrent tab rendering ──

  function renderTorrentTab(tab) {
    if (!tab || tab.type !== 'torrent' || !el.torrentPanelInner) return;
    var entry = state.torrentTabEntries[tab.id];
    var torrentState = entry ? String(entry.state || '') : 'resolving_metadata';
    var html = '';

    if (torrentState === 'resolving_metadata') {
      var hash = String(tab.url || '');
      try { hash = new URL(tab.url).searchParams.get('xt') || tab.url; } catch (e) {}
      html = '<div class="wtResolving">' +
        '<div class="wtResolvingSpinner"></div>' +
        '<div>Resolving torrent metadata...</div>' +
        '<div class="wtResolvingHash">' + escapeHtml(hash) + '</div>' +
        '</div>';
    } else if (torrentState === 'metadata_ready') {
      html = renderTorrentMetadataReady(tab, entry);
    } else if (torrentState === 'downloading' || torrentState === 'paused') {
      html = renderTorrentDownloading(tab, entry);
    } else if (torrentState === 'completed' || torrentState === 'completed_pending' || torrentState === 'completed_with_errors') {
      html = renderTorrentCompleted(tab, entry);
    } else if (torrentState === 'error') {
      html = '<div class="wtHeader"><div class="wtName">' + escapeHtml(entry.name || 'Torrent') + '</div></div>' +
        '<div class="wtMeta"><span style="color:#e57373">Error: ' + escapeHtml(entry.error || 'Unknown error') + '</span></div>' +
        '<div class="wtActions"><button class="wtBtn" data-wt-action="close">Close Tab</button></div>';
    } else {
      html = '<div class="wtResolving"><div>Status: ' + escapeHtml(torrentState) + '</div></div>';
    }

    el.torrentPanelInner.innerHTML = html;
    bindTorrentTabEvents(tab);
  }

  var _VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.webm', '.mov', '.wmv', '.flv', '.m4v', '.ts', '.m2ts'];
  function _torrentHasVideoFiles(files) {
    if (!files || !files.length) return false;
    for (var i = 0; i < files.length; i++) {
      var name = String(files[i].name || files[i].path || '').toLowerCase();
      var dotIdx = name.lastIndexOf('.');
      if (dotIdx > 0 && _VIDEO_EXTS.indexOf(name.substring(dotIdx)) !== -1) return true;
    }
    return false;
  }

  function renderTorrentMetadataReady(tab, entry) {
    var files = entry.files || [];
    var totalSize = 0;
    var selectedCount = 0;
    for (var i = 0; i < files.length; i++) {
      totalSize += Number(files[i].length || 0);
      if (files[i].selected !== false) selectedCount++;
    }

    var html = '<div class="wtHeader">' +
      '<div class="wtName">' + escapeHtml(entry.name || 'Torrent') + '</div>' +
      '<div class="wtMeta">' +
        '<span>' + files.length + ' file' + (files.length !== 1 ? 's' : '') + '</span>' +
        '<span>' + formatBytes(totalSize) + '</span>' +
        '<span>' + entry.numPeers + ' peer' + (entry.numPeers !== 1 ? 's' : '') + '</span>' +
      '</div></div>';

    // File tree
    html += '<div class="wtFileTree">';
    html += buildFileTreeHtml(files, true);
    html += '</div>';

    // Sequential download toggle
    html += '<label class="wtSequential"><input type="checkbox" id="wtSequentialCheck" /> Download in sequential order (for streaming)</label>';

    // Save path — qBittorrent-style: path display + Browse button + mode shortcuts
    html += '<div class="wtDestSection">';
    html += '<div class="wtDestLabel">Save to</div>';
    html += '<div class="wtSavePath">' +
      '<span class="wtSavePathText" id="wtSavePathText">' + escapeHtml(_wtDestState.selectedPath || 'No folder selected') + '</span>' +
      '<button class="wtBtn" data-wt-action="browse" style="padding:4px 12px;font-size:12px">Browse...</button>' +
      '</div>';
    html += '<div class="wtDestModes">';
    var modes = ['videos', 'comics', 'books'];
    for (var m = 0; m < modes.length; m++) {
      var active = _wtDestState.mode === modes[m];
      html += '<button class="wtDestModeBtn' + (active ? ' active' : '') + '" data-wt-dest-mode="' + modes[m] + '">' +
        modes[m].charAt(0).toUpperCase() + modes[m].slice(1) + '</button>';
    }
    html += '</div>';
    html += '</div>';

    // Actions
    var hasVideo = _torrentHasVideoFiles(files);
    html += '<div class="wtActions">' +
      '<button class="wtBtn primary" data-wt-action="start" id="wtStartBtn">Start Download</button>' +
      (hasVideo ? '<button class="wtBtn videoLib" data-wt-action="addToVideoLib">Save to Video Library</button>' : '') +
      '<button class="wtBtn" data-wt-action="cancel">Cancel</button>' +
      '</div>';

    return html;
  }

  function renderTorrentDownloading(tab, entry) {
    var pct = Math.round((entry.progress || 0) * 100);
    var speedText = formatBytes(entry.downloadRate || 0) + '/s';
    var isPaused = entry.state === 'paused';

    var html = '<div class="wtHeader">' +
      '<div class="wtName">' + escapeHtml(entry.name || 'Torrent') + '</div>' +
      '<div class="wtMeta">' +
        '<span>' + pct + '%</span>' +
        '<span>' + speedText + '</span>' +
        '<span>' + entry.numPeers + ' peer' + (entry.numPeers !== 1 ? 's' : '') + '</span>' +
        '<span>' + formatBytes(entry.downloaded || 0) + ' / ' + formatBytes(entry.totalSize || 0) + '</span>' +
        (isPaused ? '<span style="color:var(--vx-accent,rgba(var(--chrome-rgb),.55))">Paused</span>' : '') +
      '</div></div>';

    // Video library badge
    if (entry.videoLibrary) {
      html += '<div class="wtVideoLibBadge">Streaming to Video Library</div>';
    }

    // Overall progress bar
    html += '<div class="wtProgressWrap"><div class="wtProgressFill" style="width:' + pct + '%"></div></div>';

    // File tree with per-file progress (not editable)
    var files = entry.files || [];
    html += '<div class="wtFileTree">';
    html += buildFileTreeHtml(files, false);
    html += '</div>';

    // Actions
    html += '<div class="wtActions">';
    if (isPaused) {
      html += '<button class="wtBtn primary" data-wt-action="resume">Resume</button>';
    } else {
      html += '<button class="wtBtn" data-wt-action="pause">Pause</button>';
    }
    html += '<button class="wtBtn" data-wt-action="cancel">Cancel</button>';
    html += '</div>';

    return html;
  }

  function renderTorrentCompleted(tab, entry) {
    var html = '<div class="wtHeader">' +
      '<div class="wtName"><span class="wtCompleteIcon">&#10003;</span>' + escapeHtml(entry.name || 'Torrent') + '</div>' +
      '<div class="wtMeta"><span>Complete!</span><span>' + formatBytes(entry.totalSize || entry.downloaded || 0) + '</span></div>' +
      '</div>';

    if (entry.routedFiles || entry.ignoredFiles || entry.failedFiles) {
      html += '<div class="wtCompleteStats">';
      if (entry.routedFiles) html += '<span>Routed: ' + entry.routedFiles + '</span>';
      if (entry.ignoredFiles) html += '<span>Ignored: ' + entry.ignoredFiles + '</span>';
      if (entry.failedFiles) html += '<span style="color:#e57373">Failed: ' + entry.failedFiles + '</span>';
      html += '</div>';
    }

    // Video library badge
    if (entry.videoLibrary) {
      html += '<div class="wtVideoLibBadge complete">Available in Video Library</div>';
    }

    // Show destination if set
    if (entry.destinationRoot) {
      html += '<div class="wtSavePath"><span class="wtSavePathText">' + escapeHtml(entry.destinationRoot) + '</span></div>';
    }

    // If completed_pending, show save path picker
    if (entry.state === 'completed_pending') {
      html += '<div class="wtDestSection"><div class="wtDestLabel">Save to</div>' +
        '<div class="wtSavePath"><span class="wtSavePathText" id="wtSavePathText">' + escapeHtml(_wtDestState.selectedPath || 'No folder selected') + '</span>' +
        '<button class="wtBtn" data-wt-action="browse" style="padding:4px 12px;font-size:12px">Browse...</button></div></div>';
      html += '<div class="wtActions"><button class="wtBtn primary" data-wt-action="setDest">Route Files</button><button class="wtBtn" data-wt-action="close">Close Tab</button></div>';
    } else {
      html += '<div class="wtActions"><button class="wtBtn" data-wt-action="close">Close Tab</button></div>';
    }

    return html;
  }

  // ── File tree builder ──

  function buildFileTreeHtml(files, editable) {
    if (!files || !files.length) return '<div style="padding:12px;color:rgba(var(--chrome-rgb),.4);font-size:12px">No files</div>';

    // Group files by folder path
    var folders = {}; // folderPath -> [file]
    var rootFiles = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var path = String(f.path || f.name || '');
      var slashIdx = path.lastIndexOf('/');
      if (slashIdx > 0) {
        var folder = path.substring(0, slashIdx);
        if (!folders[folder]) folders[folder] = [];
        folders[folder].push(f);
      } else {
        rootFiles.push(f);
      }
    }

    var html = '';
    var folderKeys = Object.keys(folders).sort();

    for (var fi = 0; fi < folderKeys.length; fi++) {
      var folderPath = folderKeys[fi];
      var folderFiles = folders[folderPath];
      var folderSize = 0;
      for (var fs = 0; fs < folderFiles.length; fs++) folderSize += Number(folderFiles[fs].length || 0);

      html += '<div class="wtFolderRow" data-folder="' + escapeHtml(folderPath) + '">' +
        '<svg class="wtFolderChevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 3l5 5-5 5"/></svg>' +
        '<span>' + escapeHtml(folderPath) + '</span>' +
        '<span class="wtFileSize">' + formatBytes(folderSize) + '</span>' +
        '</div>';

      for (var ffi = 0; ffi < folderFiles.length; ffi++) {
        html += buildFileRowHtml(folderFiles[ffi], editable, folderPath);
      }
    }

    // Root-level files
    for (var ri = 0; ri < rootFiles.length; ri++) {
      html += buildFileRowHtml(rootFiles[ri], editable, '');
    }

    return html;
  }

  function buildFileRowHtml(file, editable, folderPath) {
    var name = String(file.name || file.path || '');
    var displayName = name;
    // Strip folder prefix from display name
    if (folderPath && displayName.indexOf(folderPath + '/') === 0) {
      displayName = displayName.substring(folderPath.length + 1);
    }
    var checked = file.selected !== false;
    var pct = Math.round((Number(file.progress || 0)) * 100);

    var html = '<div class="wtFileRow" data-file-index="' + file.index + '"' +
      (folderPath ? ' data-folder="' + escapeHtml(folderPath) + '"' : '') + '>';

    if (editable) {
      html += '<input type="checkbox" class="wtFileCheck" data-file-index="' + file.index + '"' + (checked ? ' checked' : '') + ' />';
    }

    html += '<span class="wtFileName" title="' + escapeHtml(name) + '">' + escapeHtml(displayName) + '</span>';
    html += '<span class="wtFileSize">' + formatBytes(file.length || 0) + '</span>';

    if (!editable) {
      html += '<div class="wtFileProgress"><div class="wtFileProgressFill" style="width:' + pct + '%"></div></div>';
    }

    html += '</div>';
    return html;
  }

  // ── Save path state ──

  var _wtDestState = { mode: 'videos', selectedPath: '' };

  function loadDefaultSavePath(mode) {
    _wtDestState.mode = mode || 'videos';
    if (!api.webSources || !api.webSources.listDestinationFolders) return;
    api.webSources.listDestinationFolders({ mode: _wtDestState.mode, path: '' }).then(function (res) {
      if (!res || !res.ok || !res.folders || !res.folders.length) return;
      // Auto-select the first root folder of this mode
      _wtDestState.selectedPath = String(res.folders[0].path || '');
      var tab = getActiveTab();
      if (tab && tab.type === 'torrent') renderTorrentTab(tab);
    }).catch(function () {});
  }

  // ── Torrent tab event delegation ──

  function bindTorrentTabEvents(tab) {
    if (!el.torrentPanelInner) return;
    el.torrentPanelInner.onclick = function (e) {
      var target = e.target;
      if (!target) return;

      // Action buttons
      var actionBtn = target.closest('[data-wt-action]');
      if (actionBtn) {
        var action = actionBtn.getAttribute('data-wt-action');
        handleTorrentAction(tab, action);
        return;
      }

      // Folder collapse toggle
      var folderRow = target.closest('.wtFolderRow');
      if (folderRow) {
        folderRow.classList.toggle('collapsed');
        var folderPath = folderRow.getAttribute('data-folder');
        var sibling = folderRow.nextElementSibling;
        while (sibling && sibling.classList.contains('wtFileRow')) {
          if (sibling.getAttribute('data-folder') === folderPath) {
            sibling.classList.toggle('hidden', folderRow.classList.contains('collapsed'));
          }
          sibling = sibling.nextElementSibling;
        }
        return;
      }

      // Mode quick-select buttons — switch to first root of that mode
      var modeBtn = target.closest('[data-wt-dest-mode]');
      if (modeBtn) {
        var mode = modeBtn.getAttribute('data-wt-dest-mode');
        loadDefaultSavePath(mode);
        return;
      }
    };

    // Checkbox change for file selection
    el.torrentPanelInner.onchange = function (e) {
      var target = e.target;
      if (!target || !target.classList.contains('wtFileCheck')) return;
      var fileIdx = parseInt(target.getAttribute('data-file-index'), 10);
      var entry = state.torrentTabEntries[tab.id];
      if (entry && entry.files) {
        for (var i = 0; i < entry.files.length; i++) {
          if (entry.files[i].index === fileIdx) {
            entry.files[i].selected = !!target.checked;
            break;
          }
        }
      }
    };
  }

  function handleTorrentAction(tab, action) {
    var entry = state.torrentTabEntries[tab.id];
    var torrentId = tab.torrentId;
    if (!torrentId) return;

    if (action === 'browse') {
      // Open native OS folder picker
      var browseApi = api.webSources && api.webSources.pickSaveFolder;
      if (!browseApi) { showToast('Browse not available'); return; }
      browseApi({ defaultPath: _wtDestState.selectedPath || '' }).then(function (res) {
        if (!res || !res.ok || !res.path) return;
        _wtDestState.selectedPath = res.path;
        var pathEl = document.getElementById('wtSavePathText');
        if (pathEl) pathEl.textContent = res.path;
      }).catch(function () {});
      return;
    }

    if (action === 'start') {
      // Gather selected file indices
      var selectedIndices = [];
      if (entry && entry.files) {
        for (var i = 0; i < entry.files.length; i++) {
          if (entry.files[i].selected !== false) selectedIndices.push(entry.files[i].index);
        }
      }
      if (!selectedIndices.length) {
        showToast('Select at least one file');
        return;
      }
      if (!_wtDestState.selectedPath) {
        showToast('Pick a destination folder first');
        return;
      }
      var seqCheck = document.getElementById('wtSequentialCheck');
      var sequential = !!(seqCheck && seqCheck.checked);
      api.webTorrent.selectFiles({
        id: torrentId,
        selectedIndices: selectedIndices,
        destinationRoot: _wtDestState.selectedPath,
        sequential: sequential
      }).then(function (res) {
        if (res && res.ok) {
          showToast('Download started');
          // Force immediate state update and re-render
          if (entry) entry.state = 'downloading';
          state.torrentTabEntries[tab.id] = entry;
          renderTorrentTab(tab);
          refreshTorrentState();
        } else {
          showToast((res && res.error) ? String(res.error) : 'Failed to start download');
        }
      }).catch(function () { showToast('Failed to start download'); });
    } else if (action === 'pause') {
      api.webTorrent.pause({ id: torrentId }).then(function () { refreshTorrentState(); }).catch(function () {});
    } else if (action === 'resume') {
      api.webTorrent.resume({ id: torrentId }).then(function () { refreshTorrentState(); }).catch(function () {});
    } else if (action === 'cancel') {
      api.webTorrent.cancel({ id: torrentId }).then(function () {
        refreshTorrentState();
        closeTab(tab.id);
      }).catch(function () {});
    } else if (action === 'close') {
      closeTab(tab.id);
    } else if (action === 'setDest') {
      if (!_wtDestState.selectedPath) {
        showToast('Pick a destination folder');
        return;
      }
      api.webTorrent.setDestination({
        id: torrentId,
        destinationRoot: _wtDestState.selectedPath
      }).then(function (res) {
        if (res && res.ok) {
          showToast('Files routed');
          refreshTorrentState();
        } else {
          showToast((res && res.error) ? String(res.error) : 'Failed to set destination');
        }
      }).catch(function () { showToast('Failed to route files'); });
    } else if (action === 'addToVideoLib') {
      // Open folder picker, then add torrent to video library
      var browseApi2 = api.webSources && api.webSources.pickSaveFolder;
      if (!browseApi2) { showToast('Browse not available'); return; }
      browseApi2({ defaultPath: _wtDestState.selectedPath || '' }).then(function (res) {
        if (!res || !res.ok || !res.path) return;
        var label = (entry && entry.name) ? entry.name : 'Torrent';
        showToast('Saving to Video Library \u2014 ' + label);
        api.webTorrent.addToVideoLibrary({
          id: torrentId,
          destinationRoot: res.path
        }).then(function (result) {
          if (result && result.ok) {
            showToast('Added to Video Library');
            if (entry) {
              entry.state = 'downloading';
              entry.videoLibrary = true;
              entry.showFolderPath = result.showPath || '';
            }
            state.torrentTabEntries[tab.id] = entry;
            renderTorrentTab(tab);
            refreshTorrentState();
          } else {
            showToast((result && result.error) ? String(result.error) : 'Failed to add to video library');
          }
        }).catch(function (err) { showToast('Failed: ' + (err && err.message || err)); });
      }).catch(function () {});
    }
  }

  // ── Torrent tab IPC event updaters ──

  // Preserve the user's local file checkbox state when merging backend updates.
  // Backend sends selected=false for all files in metadata_ready (files deselected
  // until user picks), but the user may have checked files locally.
  function mergeLocalFileSelection(newEntry, prevEntry) {
    if (!newEntry || !newEntry.files || !prevEntry || !prevEntry.files) return;
    if (newEntry.state !== 'metadata_ready' && newEntry.state !== 'completed_pending') return;
    var prevMap = {};
    for (var i = 0; i < prevEntry.files.length; i++) {
      prevMap[prevEntry.files[i].index] = prevEntry.files[i].selected;
    }
    for (var j = 0; j < newEntry.files.length; j++) {
      var idx = newEntry.files[j].index;
      if (prevMap[idx] !== undefined) {
        newEntry.files[j].selected = prevMap[idx];
      }
    }
  }

  function updateTorrentTabFromEntry(torrentId, entryData) {
    var tab = findTorrentTabByTorrentId(torrentId);
    if (!tab) return;
    var prevEntry = state.torrentTabEntries[tab.id];
    var entry = normalizeTorrentEntry(entryData);
    if (!entry) return;
    mergeLocalFileSelection(entry, prevEntry);
    state.torrentTabEntries[tab.id] = entry;
    if (entry.name && tab.title !== entry.name) {
      tab.title = entry.name;
      renderTabs();
    }
    // When metadata first arrives: check all files by default + auto-select save path
    var wasResolving = !prevEntry || prevEntry.state === 'resolving_metadata';
    if (wasResolving && entry.state === 'metadata_ready') {
      // Check all files by default (qBittorrent behavior)
      if (entry.files) {
        for (var fi = 0; fi < entry.files.length; fi++) entry.files[fi].selected = true;
      }
      loadDefaultSavePath(_wtDestState.mode);
    }
    // Only re-render if this is the active tab AND state actually changed.
    // In metadata_ready, the user is interacting (checkboxes, dest picker) —
    // don't blow away the DOM on every 800ms progress tick.
    var stateChanged = !prevEntry || prevEntry.state !== entry.state;
    if (state.activeTabId === tab.id && stateChanged) {
      renderTorrentTab(tab);
    }
  }

  function updateTorrentTabProgress(torrentId, entryData) {
    var tab = findTorrentTabByTorrentId(torrentId);
    if (!tab) return;
    var prevEntry = state.torrentTabEntries[tab.id];
    var entry = normalizeTorrentEntry(entryData);
    if (!entry) return;
    mergeLocalFileSelection(entry, prevEntry);
    state.torrentTabEntries[tab.id] = entry;
    if (state.activeTabId !== tab.id || !el.torrentPanelInner) return;
    // If state changed (e.g. metadata_ready → downloading), do a full re-render
    var stateChanged = prevEntry && prevEntry.state !== entry.state;
    if (stateChanged) {
      renderTorrentTab(tab);
      return;
    }
    // Lightweight DOM update — only update progress values, not full re-render
    var pct = Math.round((entry.progress || 0) * 100);
    // Update overall progress bar
    var fillEl = el.torrentPanelInner.querySelector('.wtProgressFill');
    if (fillEl) fillEl.style.width = pct + '%';
    // Update meta text
    var metaEl = el.torrentPanelInner.querySelector('.wtMeta');
    if (metaEl) {
      metaEl.innerHTML = '<span>' + pct + '%</span>' +
        '<span>' + formatBytes(entry.downloadRate || 0) + '/s</span>' +
        '<span>' + entry.numPeers + ' peer' + (entry.numPeers !== 1 ? 's' : '') + '</span>' +
        '<span>' + formatBytes(entry.downloaded || 0) + ' / ' + formatBytes(entry.totalSize || 0) + '</span>' +
        (entry.state === 'paused' ? '<span style="color:var(--vx-accent,rgba(var(--chrome-rgb),.55))">Paused</span>' : '');
    }
    // Update per-file progress bars
    if (entry.files) {
      for (var i = 0; i < entry.files.length; i++) {
        var fileFill = el.torrentPanelInner.querySelector('.wtFileRow[data-file-index="' + entry.files[i].index + '"] .wtFileProgressFill');
        if (fileFill) fileFill.style.width = Math.round((entry.files[i].progress || 0) * 100) + '%';
      }
    }
  }

  function isTorrentActiveState(stateStr) {
    var s = String(stateStr || '').toLowerCase();
    return s === 'downloading' || s === 'paused' || s === 'checking';
  }

  function isTorrentCompletedState(stateStr) {
    var s = String(stateStr || '').toLowerCase();
    return s === 'completed' || s === 'completed_pending' || s === 'completed_with_errors';
  }

  function isTorrentErroredState(stateStr) {
    var s = String(stateStr || '').toLowerCase();
    return s === 'failed' || s === 'error' || s === 'cancelled';
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
    var active = getDownloadGroups().active;

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
      var left = (x.totalBytes > 0) ? (formatBytes(x.receivedBytes || 0) + ' / ' + formatBytes(x.totalBytes || 0)) : '';
      var speed = formatSpeed(x.bytesPerSec || 0);
      var eta = formatEta(x.receivedBytes, x.totalBytes, x.bytesPerSec);
      var sub = (x.library ? ('→ ' + x.library) : 'Direct download');
      if (left) sub += ' • ' + left;
      if (speed) sub += ' • ' + speed;
      if (eta) sub += ' • ETA ' + eta;

      var pauseResume = '';
      var canPauseAction = !!(x.canPause && api && api.webSources && api.webSources.pauseDownload);
      var canResumeAction = !!(x.canResume && api && api.webSources && api.webSources.resumeDownload);
      var canCancelAction = !!(x.canCancel && api && api.webSources && api.webSources.cancelDownload);
      if (String(x.state) === 'paused') {
        if (canResumeAction) pauseResume = '<button class="btn btn-ghost btn-sm" data-direct-action="resume" data-direct-id="' + escapeHtml(x.id) + '">Resume</button>';
      } else if (canPauseAction) {
        pauseResume = '<button class="btn btn-ghost btn-sm" data-direct-action="pause" data-direct-id="' + escapeHtml(x.id) + '">Pause</button>';
      }

      html += '' +
        '<div class="webHubItem" data-direct-open-id="' + escapeHtml(x.id) + '">' +
          '<div class="webHubItemTop">' +
            '<div class="webHubItemTitle">' + escapeHtml(x.filename || 'Download') + '</div>' +
            '<span class="webHubBadge">Direct</span>' +
          '</div>' +
          '<div class="webHubItemSub">' + escapeHtml(sub) + '</div>' +
          (pTxt ? ('<div class="webHubProgress"><div class="webHubProgressFill" style="width:' + escapeHtml(pTxt) + '"></div></div>') : '') +
          '<div class="webHubItemActions">' +
            pauseResume +
            (canCancelAction ? ('<button class="btn btn-ghost btn-sm" data-direct-action="cancel" data-direct-id="' + escapeHtml(x.id) + '">Cancel</button>') : '') +
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
      uploadSpeed: Number(t.uploadSpeed || 0),
      uploaded: Number(t.uploaded || 0),
      downloaded: Number(t.downloaded || 0),
      totalSize: Number(t.totalSize || 0),
      numPeers: Number(t.numPeers || 0),
      startedAt: Number(t.startedAt || 0),
      finishedAt: t.finishedAt != null ? Number(t.finishedAt) : null,
      error: String(t.error || ''),
      routedFiles: Number(t.routedFiles || 0),
      ignoredFiles: Number(t.ignoredFiles || 0),
      failedFiles: Number(t.failedFiles || 0),
      metadataReady: !!t.metadataReady,
      files: Array.isArray(t.files) ? t.files : null,
      destinationRoot: t.destinationRoot ? String(t.destinationRoot) : '',
    };
  }

  function findActiveTorrentById(id) {
    var key = String(id || '');
    if (!key) return null;
    for (var i = 0; i < state.torrentActive.length; i++) {
      var t = state.torrentActive[i];
      if (t && String(t.id || '') === key) return t;
    }
    return null;
  }

  function renderHubTorrentActive() {
    if (!el.hubTorrentActiveList || !el.hubTorrentActiveEmpty) return;
    var filterKey = String(state.hubTorrentFilter || 'active').toLowerCase();
    var combined = [];
    var seen = Object.create(null);
    var activeById = Object.create(null);
    for (var ai = 0; ai < state.torrentActive.length; ai++) {
      var a = state.torrentActive[ai];
      if (!a || !a.id) continue;
      seen[a.id] = 1;
      activeById[a.id] = 1;
      combined.push(a);
    }
    for (var hi = 0; hi < state.torrentHistory.length; hi++) {
      var h = state.torrentHistory[hi];
      if (!h || !h.id || seen[h.id]) continue;
      combined.push(h);
    }
    var rows = [];
    for (var i = 0; i < combined.length; i++) {
      var t = combined[i];
      if (!t) continue;
      var s = String(t.state || '').toLowerCase();
      var isLive = !!activeById[String(t.id || '')];
      if (filterKey === 'active' && !isLive) continue;
      if (filterKey === 'paused' && s !== 'paused') continue;
      if (filterKey === 'completed' && !isTorrentCompletedState(s)) continue;
      if (filterKey === 'errored' && !isTorrentErroredState(s) && s !== 'completed_with_errors') continue;
      rows.push(t);
    }
    rows.sort(function (a, b) { return Number(b.startedAt || 0) - Number(a.startedAt || 0); });

    if (!rows.length) {
      el.hubTorrentActiveList.innerHTML = '';
      if (el.hubTorrentActiveEmpty) {
        var emptyText = 'No torrents.';
        if (filterKey === 'active') emptyText = 'No active torrent downloads.';
        else if (filterKey === 'paused') emptyText = 'No paused torrents.';
        else if (filterKey === 'completed') emptyText = 'No completed torrents.';
        else if (filterKey === 'errored') emptyText = 'No errored torrents.';
        el.hubTorrentActiveEmpty.textContent = emptyText;
      }
      el.hubTorrentActiveEmpty.classList.remove('hidden');
      return;
    }
    el.hubTorrentActiveEmpty.classList.add('hidden');

    var html = '';
    for (var j = 0; j < rows.length; j++) {
      var x = rows[j];
      var pTxt = pctText(x.progress);
      var speed = x.downloadRate > 0 ? (' \u2022 ' + formatSpeed(x.downloadRate)) : '';
      var stateLower = String(x.state || '').toLowerCase();
      var isLive = !!activeById[String(x.id || '')];
      var stateLabel = x.state || 'downloading';
      if (!isLive && isTorrentActiveState(stateLower)) stateLabel = 'session ended';
      var sub = stateLabel + (pTxt ? (' \u2022 ' + pTxt) : '') + speed;
      var pauseResume = '';
      if (isLive && stateLower === 'paused') {
        pauseResume = '<button class="btn btn-ghost btn-sm" data-torrent-action="resume" data-torrent-id="' + escapeHtml(x.id) + '">Resume</button>';
      } else if (isLive && isTorrentActiveState(stateLower)) {
        pauseResume = '<button class="btn btn-ghost btn-sm" data-torrent-action="pause" data-torrent-id="' + escapeHtml(x.id) + '">Pause</button>';
      }
      var actionButtons = pauseResume;
      if (isLive && isTorrentActiveState(stateLower)) {
        actionButtons += '<button class="btn btn-ghost btn-sm" data-torrent-action="cancel" data-torrent-id="' + escapeHtml(x.id) + '">Cancel</button>';
      } else {
        actionButtons += '<button class="btn btn-ghost btn-sm" data-torrent-action="remove-history" data-torrent-id="' + escapeHtml(x.id) + '">Remove</button>';
      }

      html += '' +
        '<div class="webHubItem">' +
          '<div class="webHubItemTop">' +
            '<div class="webHubItemTitle">' + escapeHtml(x.name || x.infoHash || 'Torrent') + '</div>' +
            '<span class="webHubBadge">Torrent</span>' +
          '</div>' +
          '<div class="webHubItemSub">' + escapeHtml(sub) + '</div>' +
          (pTxt ? ('<div class="webHubProgress"><div class="webHubProgressFill" style="width:' + escapeHtml(pTxt) + '"></div></div>') : '') +
          '<div class="webHubItemActions">' +
            actionButtons +
          '</div>' +
        '</div>';
    }
    el.hubTorrentActiveList.innerHTML = html;
  }

  function applyTorrentBulkAction(action) {
    if (!api.webTorrent) return;
    var ids = [];
    for (var i = 0; i < state.torrentActive.length; i++) {
      var t = state.torrentActive[i];
      if (!t || !t.id) continue;
      var s = String(t.state || '').toLowerCase();
      if (action === 'pause' && s === 'downloading') ids.push(t.id);
      else if (action === 'resume' && s === 'paused') ids.push(t.id);
      else if (action === 'cancel' && isTorrentActiveState(s)) ids.push(t.id);
    }
    if (!ids.length) {
      showToast('No torrents to ' + action);
      return;
    }
    var calls = [];
    var invoke = null;
    for (var j = 0; j < ids.length; j++) {
      var id = ids[j];
      if (action === 'pause' && api.webTorrent.pause) invoke = api.webTorrent.pause;
      else if (action === 'resume' && api.webTorrent.resume) invoke = api.webTorrent.resume;
      else if (action === 'cancel' && api.webTorrent.cancel) invoke = api.webTorrent.cancel;
      else invoke = null;
      if (!invoke) continue;
      calls.push(
        invoke({ id: id }).then(function (res) {
          return {
            ok: !(res && res.ok === false),
            error: (res && res.error) ? String(res.error) : ''
          };
        }).catch(function (err) {
          return {
            ok: false,
            error: String((err && err.message) || err || 'Request failed')
          };
        })
      );
    }
    if (!calls.length) {
      showToast('Action unavailable: ' + action);
      return;
    }
    Promise.all(calls).then(function (results) {
      var okCount = 0;
      var failCount = 0;
      for (var k = 0; k < results.length; k++) {
        if (results[k] && results[k].ok) okCount++;
        else failCount++;
      }
      var actionLabel = action.charAt(0).toUpperCase() + action.slice(1);
      if (failCount === 0) {
        showToast(actionLabel + ' applied to ' + okCount + ' torrent' + (okCount === 1 ? '' : 's'));
      } else if (okCount === 0) {
        showToast(actionLabel + ' failed for ' + failCount + ' torrent' + (failCount === 1 ? '' : 's'));
      } else {
        showToast(actionLabel + ' applied to ' + okCount + ' torrent' + (okCount === 1 ? '' : 's') + ' (' + failCount + ' failed)');
      }
      refreshTorrentState();
    }).catch(function () {
      refreshTorrentState();
    });
  }

  function buildUnifiedHistory() {
    var merged = [];
    for (var i = 0; i < state.downloads.length; i++) {
      var d = state.downloads[i];
      if (!d || !d.id) continue;
      if (!isDownloadTerminalState(d.state)) continue;
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
        destination: d.destination || '',
        downloadUrl: d.downloadUrl || '',
        pageUrl: d.pageUrl || ''
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
      var actions = '';
      if (x.transport === 'direct') {
        var openFile = x.destination ? '<button class="btn btn-ghost btn-sm" data-unified-open-file-id="' + escapeHtml(x.id) + '">Open</button>' : '';
        var openFolder = x.destination ? '<button class="btn btn-ghost btn-sm" data-unified-open-folder-id="' + escapeHtml(x.id) + '">Folder</button>' : '';
        var retry = (x.state !== 'completed' && x.downloadUrl) ? '<button class="btn btn-ghost btn-sm" data-unified-retry-id="' + escapeHtml(x.id) + '">Retry</button>' : '';
        actions = openFile + openFolder + retry;
      }
      actions += '<button class="btn btn-ghost btn-sm" data-unified-remove-id="' + escapeHtml(x.id) + '">Remove</button>';
      html += '' +
        '<div class="webHubItem" data-unified-open-id="' + escapeHtml(x.id) + '">' +
          '<div class="webHubItemTop">' +
            '<div class="webHubItemTitle">' + escapeHtml(x.filename) + '</div>' +
            '<span class="webHubBadge">' + escapeHtml(badge) + '</span>' +
          '</div>' +
          '<div class="webHubItemSub">' + escapeHtml(sub) + (x.error ? (' \u2022 ' + escapeHtml(x.error)) : '') + '</div>' +
          '<div class="webHubItemActions">' + actions + '</div>' +
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
          '<div class="webHubItemActions">' +
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
    renderHubBookmarks();
    renderPermissions();
    renderAdblockInfo();
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
    var payload = {
      url: u,
      title: String(tab.title || tab.sourceName || ''),
      visitedAt: now,
      sourceTabId: String(tab.id)
    };
    api.webHistory.add(payload).catch(function () {
      var retryKey = u + '|' + String(now);
      if (tab._lastHistoryRetryKey === retryKey) return;
      tab._lastHistoryRetryKey = retryKey;
      setTimeout(function () {
        api.webHistory.add(payload).catch(function () {});
      }, 800);
    });
  }

  function normalizeBookmarkEntry(b) {
    if (!b) return null;
    var url = String(b.url || '').trim();
    if (!url) return null;
    return {
      id: String(b.id || ''),
      url: url,
      title: String(b.title || '').trim(),
      folder: String(b.folder || '').trim(),
      createdAt: Number(b.createdAt || 0) || 0,
      updatedAt: Number(b.updatedAt || 0) || 0
    };
  }

  function findBookmarkByUrl(url) {
    var target = String(url || '').trim();
    if (!target) return null;
    for (var i = 0; i < state.bookmarks.length; i++) {
      var b = state.bookmarks[i];
      if (!b) continue;
      if (String(b.url || '').trim() === target) return b;
    }
    return null;
  }

  function isActiveTabBookmarked() {
    var tab = getActiveTab();
    if (!tab) return false;
    var url = String(tab.url || '').trim();
    if (!/^https?:\/\//i.test(url)) return false;
    return !!findBookmarkByUrl(url);
  }

  function updateBookmarkButton() {
    if (!el.bookmarkBtn) return;
    var active = isActiveTabBookmarked();
    el.bookmarkBtn.classList.toggle('active', active);
    el.bookmarkBtn.innerHTML = active ? '&#9733;' : '&#9734;';
    el.bookmarkBtn.title = active ? 'Remove bookmark' : 'Add bookmark';
  }

  function renderHubBookmarks() {
    if (!el.hubBookmarksList || !el.hubBookmarksEmpty) return;
    if (!state.bookmarks.length) {
      el.hubBookmarksList.innerHTML = '';
      el.hubBookmarksEmpty.classList.remove('hidden');
      return;
    }
    el.hubBookmarksEmpty.classList.add('hidden');
    var html = '';
    for (var i = 0; i < state.bookmarks.length; i++) {
      var b = state.bookmarks[i];
      if (!b) continue;
      var title = b.title || siteNameFromUrl(b.url) || b.url;
      var sub = b.url + (b.folder ? (' \u2022 ' + b.folder) : '');
      html += '' +
        '<div class="webHubItem" data-bookmark-open-id="' + escapeHtml(String(b.id || '')) + '">' +
          '<div class="webHubItemTop">' +
            '<div class="webHubItemTitle">' + escapeHtml(title) + '</div>' +
          '</div>' +
          '<div class="webHubItemSub">' + escapeHtml(sub) + '</div>' +
          '<div class="webHubItemActions">' +
            '<button class="btn btn-ghost btn-sm" data-bookmark-edit-id="' + escapeHtml(String(b.id || '')) + '">Edit</button>' +
            '<button class="btn btn-ghost btn-sm" data-bookmark-remove-id="' + escapeHtml(String(b.id || '')) + '">Remove</button>' +
          '</div>' +
        '</div>';
    }
    el.hubBookmarksList.innerHTML = html;
  }

  function loadBookmarks() {
    if (!api.webBookmarks || typeof api.webBookmarks.list !== 'function') return;
    api.webBookmarks.list().then(function (res) {
      if (!res || !res.ok || !Array.isArray(res.bookmarks)) return;
      state.bookmarks = [];
      for (var i = 0; i < res.bookmarks.length; i++) {
        var b = normalizeBookmarkEntry(res.bookmarks[i]);
        if (b) state.bookmarks.push(b);
      }
      renderHubBookmarks();
      updateBookmarkButton();
    }).catch(function () {});
  }

  function toggleBookmarkForActiveTab() {
    if (!api.webBookmarks || typeof api.webBookmarks.toggle !== 'function') return;
    var tab = getActiveTab();
    if (!tab) return;
    var url = String(tab.url || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      showToast('Only web pages can be bookmarked');
      return;
    }
    api.webBookmarks.toggle({
      url: url,
      title: String(tab.title || tab.sourceName || siteNameFromUrl(url) || url)
    }).then(function (res) {
      if (!res || !res.ok) {
        showToast('Bookmark action failed');
        return;
      }
      if (res.added) showToast('Bookmarked');
      else showToast('Bookmark removed');
      loadBookmarks();
    }).catch(function () {
      showToast('Bookmark action failed');
    });
  }

  function updateFindCountLabel() {
    if (!el.findCount) return;
    var r = state.findResult || {};
    var current = Number(r.activeMatchOrdinal || 0) || 0;
    var total = Number(r.matches || 0) || 0;
    el.findCount.textContent = current + ' / ' + total;
  }

  function runFindAction(action, query) {
    var tab = getActiveTab();
    if (!tab || !tab.mainTabId) return;
    webTabs.findInPage({
      tabId: tab.mainTabId,
      action: action,
      query: query
    }).catch(function () {});
  }

  function openFindBar() {
    state.findBarOpen = true;
    if (el.findBar) el.findBar.classList.remove('hidden');
    updateFindCountLabel();
    if (el.findInput && el.findInput.focus) {
      try { el.findInput.focus(); el.findInput.select(); } catch (e) {}
    }
  }

  function closeFindBar() {
    if (!state.findBarOpen) return;
    state.findBarOpen = false;
    if (el.findBar) el.findBar.classList.add('hidden');
    state.findResult = { activeMatchOrdinal: 0, matches: 0 };
    updateFindCountLabel();
    runFindAction('stop', '');
  }

  function runFindFromInput(direction) {
    if (!el.findInput) return;
    var q = String(el.findInput.value || '').trim();
    state.findQuery = q;
    if (!q) {
      state.findResult = { activeMatchOrdinal: 0, matches: 0 };
      updateFindCountLabel();
      runFindAction('stop', '');
      return;
    }
    if (direction === 'prev') runFindAction('prev', q);
    else if (direction === 'next') runFindAction('next', q);
    else runFindAction('find', q);
  }

  function formatByteSize(bytes) {
    var n = Number(bytes || 0);
    if (!isFinite(n) || n <= 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var idx = 0;
    while (n >= 1024 && idx < units.length - 1) {
      n = n / 1024;
      idx += 1;
    }
    return n.toFixed(idx > 1 ? 1 : 0) + ' ' + units[idx];
  }

  function rangeToFromTs(range) {
    var now = Date.now();
    var key = String(range || 'all').trim().toLowerCase();
    if (key === 'hour') return now - 3600 * 1000;
    if (key === 'day') return now - 24 * 3600 * 1000;
    if (key === 'week') return now - 7 * 24 * 3600 * 1000;
    if (key === 'month') return now - 28 * 24 * 3600 * 1000;
    return 0;
  }

  function loadDataUsage() {
    if (!api.webData || typeof api.webData.usage !== 'function' || !el.hubDataUsageText) return;
    api.webData.usage().then(function (res) {
      if (!res || !res.ok || !res.usage) return;
      var u = res.usage || {};
      var text = 'Total: ' + formatByteSize(u.totalBytes || 0)
        + ' (History ' + formatByteSize(u.historyBytes || 0)
        + ', Downloads ' + formatByteSize(u.downloadsBytes || 0)
        + ', Torrents ' + formatByteSize(u.torrentsBytes || 0) + ')';
      el.hubDataUsageText.textContent = text;
    }).catch(function () {
      el.hubDataUsageText.textContent = 'Failed to read data usage.';
    });
  }

  function clearSelectedBrowsingData() {
    if (!api.webData || typeof api.webData.clear !== 'function') return;
    var kinds = [];
    if (el.hubDataHistory && el.hubDataHistory.checked) kinds.push('history');
    if (el.hubDataDownloads && el.hubDataDownloads.checked) kinds.push('downloads');
    if (el.hubDataTorrents && el.hubDataTorrents.checked) kinds.push('torrents');
    if (el.hubDataCookies && el.hubDataCookies.checked) {
      kinds.push('cookies');
      kinds.push('siteData');
    }
    if (el.hubDataCache && el.hubDataCache.checked) kinds.push('cache');
    if (!kinds.length) {
      showToast('Select at least one data type');
      return;
    }
    var from = rangeToFromTs(el.hubDataRange ? el.hubDataRange.value : 'all');
    api.webData.clear({
      from: from,
      to: Date.now(),
      kinds: kinds
    }).then(function (res) {
      if (!res || !res.ok) {
        showToast('Failed to clear data');
        return;
      }
      showToast('Browsing data cleared');
      loadDownloadHistory();
      loadBrowsingHistory();
      refreshTorrentState();
      loadDataUsage();
    }).catch(function () {
      showToast('Failed to clear data');
    });
  }

  function normalizePermissionRule(rule) {
    if (!rule) return null;
    var origin = String(rule.origin || '').trim();
    var permission = String(rule.permission || '').trim();
    if (!origin || !permission) return null;
    return {
      origin: origin,
      permission: permission,
      decision: String(rule.decision || 'ask').trim().toLowerCase(),
      updatedAt: Number(rule.updatedAt || 0) || 0
    };
  }

  function renderPermissions() {
    if (!el.hubPermissionsList || !el.hubPermissionsEmpty) return;
    if (!state.permissions.length) {
      el.hubPermissionsList.innerHTML = '';
      el.hubPermissionsEmpty.classList.remove('hidden');
      return;
    }
    el.hubPermissionsEmpty.classList.add('hidden');
    var html = '';
    for (var i = 0; i < state.permissions.length; i++) {
      var r = state.permissions[i];
      if (!r) continue;
      html += '' +
        '<div class="webHubItem">' +
          '<div class="webHubItemTop">' +
            '<div class="webHubItemTitle">' + escapeHtml(r.origin) + '</div>' +
            '<span class="webHubBadge">' + escapeHtml(r.decision) + '</span>' +
          '</div>' +
          '<div class="webHubItemSub">' + escapeHtml(r.permission) + '</div>' +
          '<div class="webHubItemActions">' +
            '<button class="btn btn-ghost btn-sm" data-perm-remove-origin="' + escapeHtml(r.origin) + '" data-perm-remove-type="' + escapeHtml(r.permission) + '">Reset</button>' +
          '</div>' +
        '</div>';
    }
    el.hubPermissionsList.innerHTML = html;
  }

  function loadPermissions() {
    if (!api.webPermissions || typeof api.webPermissions.list !== 'function') return;
    api.webPermissions.list().then(function (res) {
      state.permissions = [];
      if (res && res.ok && Array.isArray(res.rules)) {
        for (var i = 0; i < res.rules.length; i++) {
          var r = normalizePermissionRule(res.rules[i]);
          if (r) state.permissions.push(r);
        }
      }
      state.permissions.sort(function (a, b) {
        var ao = String(a.origin || '');
        var bo = String(b.origin || '');
        if (ao === bo) return String(a.permission || '').localeCompare(String(b.permission || ''));
        return ao.localeCompare(bo);
      });
      renderPermissions();
    }).catch(function () {});
  }

  function savePermissionRuleFromHub() {
    if (!api.webPermissions || typeof api.webPermissions.set !== 'function') return;
    var origin = String((el.hubPermOrigin && el.hubPermOrigin.value) || '').trim();
    var permission = String((el.hubPermType && el.hubPermType.value) || '').trim();
    var decision = String((el.hubPermDecision && el.hubPermDecision.value) || '').trim();
    if (!origin) {
      showToast('Origin is required');
      return;
    }
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(origin)) {
      origin = 'https://' + origin;
    }
    api.webPermissions.set({
      origin: origin,
      permission: permission,
      decision: decision
    }).then(function (res) {
      if (!res || !res.ok) {
        showToast('Failed to save permission');
        return;
      }
      showToast('Permission saved');
      if (el.hubPermOrigin) el.hubPermOrigin.value = '';
      loadPermissions();
    }).catch(function () {
      showToast('Failed to save permission');
    });
  }

  function renderAdblockInfo(extra) {
    if (!el.hubAdblockInfo) return;
    var a = state.adblock || {};
    var parts = [];
    parts.push('Blocked: ' + Number(a.blockedCount || 0));
    parts.push('Domains: ' + Number(a.domainCount || 0));
    if (a.listUpdatedAt) parts.push('Updated: ' + formatWhen(a.listUpdatedAt));
    if (extra) parts.push(String(extra));
    el.hubAdblockInfo.textContent = parts.join(' • ');
  }

  function loadAdblockState() {
    if (!api.webAdblock || typeof api.webAdblock.get !== 'function') return;
    api.webAdblock.get().then(function (res) {
      if (!res || !res.ok) return;
      state.adblock.enabled = !!res.enabled;
      state.adblock.blockedCount = Number(res.blockedCount || 0) || 0;
      state.adblock.domainCount = Number(res.domainCount || 0) || 0;
      state.adblock.listUpdatedAt = Number(res.listUpdatedAt || 0) || 0;
      if (el.hubAdblockEnabled) el.hubAdblockEnabled.checked = !!state.adblock.enabled;
      renderAdblockInfo();
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
        var openFileBtn = t.closest ? t.closest('[data-unified-open-file-id]') : null;
        if (openFileBtn) {
          var ofid = String(openFileBtn.getAttribute('data-unified-open-file-id') || '');
          if (ofid.indexOf('direct:') === 0) {
            var did = ofid.slice('direct:'.length);
            for (var di = 0; di < state.downloads.length; di++) {
              var dd = state.downloads[di];
              if (!dd || String(dd.id) !== did) continue;
              if (dd.destination && api.shell && api.shell.openPath) {
                try { api.shell.openPath(dd.destination); } catch (e) {}
              }
              break;
            }
          }
          return;
        }

        var openFolderBtn = t.closest ? t.closest('[data-unified-open-folder-id]') : null;
        if (openFolderBtn) {
          var ofdid = String(openFolderBtn.getAttribute('data-unified-open-folder-id') || '');
          if (ofdid.indexOf('direct:') === 0) {
            var did2 = ofdid.slice('direct:'.length);
            for (var dj = 0; dj < state.downloads.length; dj++) {
              var dd2 = state.downloads[dj];
              if (!dd2 || String(dd2.id) !== did2) continue;
              if (dd2.destination && api.shell && api.shell.revealPath) {
                try { api.shell.revealPath(dd2.destination); } catch (e2) {}
              }
              break;
            }
          }
          return;
        }

        var retryBtn = t.closest ? t.closest('[data-unified-retry-id]') : null;
        if (retryBtn) {
          var rrid = String(retryBtn.getAttribute('data-unified-retry-id') || '');
          if (rrid.indexOf('direct:') === 0 && api.webSources && api.webSources.downloadFromUrl) {
            var did3 = rrid.slice('direct:'.length);
            for (var dk = 0; dk < state.downloads.length; dk++) {
              var dd3 = state.downloads[dk];
              if (!dd3 || String(dd3.id) !== did3) continue;
              if (dd3.downloadUrl) api.webSources.downloadFromUrl({ url: dd3.downloadUrl, referer: dd3.pageUrl || '' }).catch(function () {});
              break;
            }
          }
          return;
        }

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
        var stateName = String((info && info.state) || '').toLowerCase();
        if (!stateName) {
          if (info && info.ok) stateName = 'completed';
          else if (String((info && info.error) || '').toLowerCase() === 'cancelled') stateName = 'cancelled';
          else stateName = 'failed';
        }
        upsertDownload(Object.assign({}, info || {}, { state: stateName }));
        var cancelled = stateName === 'cancelled';
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
