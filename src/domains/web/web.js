// Tankoban Max — Web browser mode orchestrator (FEAT-BROWSER Phase 3 rewrite)
// Replaces 8,973-line monolith with thin orchestrator that delegates to modules.
(function webBrowserDomain() {
  'use strict';

  if (window.__tankoWebBrowserBound) return;

  var api = window.Tanko && window.Tanko.api ? window.Tanko.api : null;
  if (!api || !api.webSources) {
    console.warn('[web.js] Tanko.api.webSources not available — aborting');
    return;
  }

  window.__tankoWebBrowserBound = true;

  // ── DOM element cache ──

  function qs(id) {
    try { return document.getElementById(id); } catch (e) { return null; }
  }

  var el = {
    // Browser chrome (webBrowserView)
    browserView:       qs('webBrowserView'),
    tabBar:            qs('web-tab-bar'),
    tabsContainer:     qs('web-tabs-container'),
    btnNewTab:         qs('web-btn-new-tab'),
    libraryBack:       qs('web-library-back'),
    winMin:            qs('web-win-min'),
    winMax:            qs('web-win-max'),
    winClose:          qs('web-win-close'),

    // Toolbar
    btnBack:           qs('web-btn-back'),
    btnForward:        qs('web-btn-forward'),
    btnReload:         qs('web-btn-reload'),
    iconReload:        qs('web-icon-reload'),
    iconStop:          qs('web-icon-stop'),
    urlBar:            qs('web-url-bar'),
    omniIcon:          qs('web-omni-icon'),
    omniGhost:         qs('web-omni-ghost'),
    omniDropdown:      qs('web-omni-dropdown'),
    searchEngineSelect: qs('web-search-engine-select'),
    btnBookmark:       qs('web-btn-bookmark'),
    iconBookmarkOutline: qs('web-icon-bookmark-outline'),
    iconBookmarkFilled:  qs('web-icon-bookmark-filled'),
    btnTor:            qs('web-btn-tor'),
    torBadge:          qs('web-tor-badge'),
    btnMenu:           qs('web-btn-menu'),
    toolbar:           qs('web-toolbar'),

    // Bookmark bar
    bookmarkBar:         qs('web-bookmark-bar'),
    bookmarkBarItems:    qs('web-bookmark-bar-items'),
    bookmarkBarOverflow: qs('web-bookmark-bar-overflow'),

    // Panels
    menuPanel:       qs('web-menu-panel'),
    downloadsPanel:  qs('web-downloads-panel'),
    downloadsClose:  qs('web-downloads-close'),
    downloadsList:   qs('web-downloads-list'),
    downloadsEmpty:  qs('web-downloads-empty'),
    historyPanel:    qs('web-history-panel'),
    historyClose:    qs('web-history-close'),
    historyClearAll:  qs('web-history-clear-all'),
    historySearch:   qs('web-history-search'),
    historyList:     qs('web-history-list'),
    bookmarksPanel:  qs('web-bookmarks-panel'),
    bookmarksClose:  qs('web-bookmarks-close'),
    bookmarksSearch: qs('web-bookmarks-search'),
    bookmarksList:   qs('web-bookmarks-list'),

    // Loading bar
    loadingBar:     qs('web-loading-bar'),
    loadingBarFill: qs('web-loading-bar-fill'),

    // Content area
    contentArea:       qs('web-content-area'),
    webviewContainer:  qs('web-webview-container'),
    torrentContainer:  qs('torrent-container'),
    zoomIndicator:     qs('web-zoom-indicator'),

    // Home panel (new-tab page)
    homePanel:      qs('web-home-panel'),
    homeGrid:       qs('web-home-grid'),
    homeEmpty:      qs('web-home-empty'),
    homeAddSource:  qs('web-home-add-source'),
    homeSearchForm: qs('web-home-search-form'),
    homeSearchInput: qs('web-home-search-input'),
    homeSearchTitle: qs('web-home-search-title'),
    homeQuickTitle: qs('web-home-quick-title'),

    // Find bar
    findBar:     qs('web-find-bar'),
    findInput:   qs('web-find-input'),
    findMatches: qs('web-find-matches'),
    findPrev:    qs('web-find-prev'),
    findNext:    qs('web-find-next'),
    findClose:   qs('web-find-close'),

    // Overlays
    menuOverlay: qs('web-menu-overlay'),
    contextMenu: qs('web-context-menu'),
    ctxOverlay:  qs('web-menu-overlay'),  // shares overlay with menu

    // Library view elements (webLibraryView)
    webLibraryView: qs('webLibraryView'),
    homeView:       qs('webHomeView'),
    sourcesList:    qs('webSourcesList'),
    sourcesGrid:    qs('webSourcesGrid'),
    sourcesEmpty:   qs('webSourcesEmpty'),
    continuePanel:  qs('webContinuePanel'),
    continueEmpty:  qs('webContinueEmpty'),
    homeDownloadsPanel: qs('webHomeDownloadsPanel'),
    homeDlList:     qs('webHomeDownloadsList'),
    homeDlEmpty:    qs('webHomeDownloadsEmpty'),
    homeDlClearBtn: qs('webHomeDownloadsClear'),
    addSourceBtn:   qs('webAddSourceBtn'),
    downloadStatus: qs('webDownloadStatus'),
    sidebarDlRow:   qs('webDownloadProgressRow'),
    sidebarDlFill:  qs('webDownloadProgressFill'),
    sidebarDlPct:   qs('webDownloadProgressPct'),
    destBooks:      qs('webDestBooks'),
    destComics:     qs('webDestComics'),
    toast:          qs('webToast'),

    // Add source dialog
    addSourceOverlay: qs('webAddSourceOverlay'),
    addSourceClose:   qs('webAddSourceClose'),
    addTitle:         qs('webAddTitle'),
    sourceName:       qs('webSourceName'),
    sourceUrl:        qs('webSourceUrl'),
    sourceSaveBtn:    qs('webSourceSaveBtn'),

    // Settings hub elements
    hubSourcesList:  qs('webHubSourcesList'),
    hubSourcesEmpty: qs('webHubSourcesEmpty'),
    hubBrowseHistoryList:    qs('webHubBrowseHistoryList'),
    hubBrowseHistoryEmpty:   qs('webHubBrowseHistoryEmpty'),
    hubBrowseSearch:         qs('webHubBrowseSearch'),
    hubBrowseHistoryClearBtn: qs('webHubBrowseHistoryClearBtn'),
    hubBookmarksList:   qs('webHubBookmarksList'),
    hubBookmarksEmpty:  qs('webHubBookmarksEmpty'),
    hubBookmarkCurrentBtn: qs('webHubBookmarkCurrentBtn'),
    hubDataRange:       qs('webHubDataRange'),
    hubDataHistory:     qs('webHubDataHistory'),
    hubDataDownloads:   qs('webHubDataDownloads'),
    hubDataTorrents:    qs('webHubDataTorrents'),
    hubDataCookies:     qs('webHubDataCookies'),
    hubDataCache:       qs('webHubDataCache'),
    hubDataUsageBtn:    qs('webHubDataUsageBtn'),
    hubDataClearBtn:    qs('webHubDataClearBtn'),
    hubDataUsageText:   qs('webHubDataUsageText'),
    hubPermOrigin:      qs('webHubPermOrigin'),
    hubPermType:        qs('webHubPermType'),
    hubPermDecision:    qs('webHubPermDecision'),
    hubPermSaveBtn:     qs('webHubPermSaveBtn'),
    hubPermissionsList: qs('webHubPermissionsList'),
    hubPermissionsEmpty: qs('webHubPermissionsEmpty'),
    hubAdblockEnabled:  qs('webHubAdblockEnabled'),
    hubAdblockUpdateBtn: qs('webHubAdblockUpdateBtn'),
    hubAdblockStatsBtn: qs('webHubAdblockStatsBtn'),
    hubAdblockInfo:     qs('webHubAdblockInfo'),
    hubUserscriptsEnabled: qs('webHubUserscriptsEnabled'),
    hubUserscriptAddCurrentBtn: qs('webHubUserscriptAddCurrentBtn'),
    hubUserscriptClearBtn: qs('webHubUserscriptClearBtn'),
    hubUserscriptTitle: qs('webHubUserscriptTitle'),
    hubUserscriptMatch: qs('webHubUserscriptMatch'),
    hubUserscriptRunAt:  qs('webHubUserscriptRunAt'),
    hubUserscriptCode:  qs('webHubUserscriptCode'),
    hubUserscriptSaveBtn: qs('webHubUserscriptSaveBtn'),
    hubUserscriptInfo:  qs('webHubUserscriptInfo'),
    hubUserscriptsList: qs('webHubUserscriptsList'),
    hubUserscriptsEmpty: qs('webHubUserscriptsEmpty'),
    hubStartupMode:     qs('webHubStartupMode'),
    hubStartupCustomUrl: qs('webHubStartupCustomUrl'),
    hubHomeUrl:         qs('webHubHomeUrl'),
    hubNewTabBehavior:  qs('webHubNewTabBehavior'),
    hubDownloadBehavior: qs('webHubDownloadBehavior'),
    hubDownloadFolderHint: qs('webHubDownloadFolderHint'),
    hubPrivacyDoNotTrack: qs('webHubPrivacyDoNotTrack'),
    hubClearOnExitHistory:   qs('webHubClearOnExitHistory'),
    hubClearOnExitDownloads: qs('webHubClearOnExitDownloads'),
    hubClearOnExitCookies:   qs('webHubClearOnExitCookies'),
    hubClearOnExitCache:     qs('webHubClearOnExitCache'),
    hubMagnetInput:       qs('webHubMagnetInput'),
    hubMagnetPasteBtn:    qs('webHubMagnetPasteBtn'),
    hubMagnetStartBtn:    qs('webHubMagnetStartBtn'),
    hubTorrentFilter:     qs('webHubTorrentFilter'),
    hubTorrentPauseAllBtn:  qs('webHubTorrentPauseAllBtn'),
    hubTorrentResumeAllBtn: qs('webHubTorrentResumeAllBtn'),
    hubTorrentCancelAllBtn: qs('webHubTorrentCancelAllBtn'),
    hubDirectActiveList:  qs('webHubDirectActiveList'),
    hubDirectActiveEmpty: qs('webHubDirectActiveEmpty'),
    hubTorrentActiveList: qs('webHubTorrentActiveList'),
    hubTorrentActiveEmpty: qs('webHubTorrentActiveEmpty'),
    hubDownloadHistoryList:  qs('webHubDownloadHistoryList'),
    hubDownloadHistoryEmpty: qs('webHubDownloadHistoryEmpty'),
    hubDownloadHistoryClearBtn: qs('webHubDownloadHistoryClearBtn'),

    // Bookmark button (alias for panels module)
    bookmarkBtn: qs('web-btn-bookmark'),

    // Download destination picker
    destPickerOverlay:  qs('downloadDestPickerOverlay'),
    destPickerTitle:    qs('downloadDestPickerTitle'),
    destPickerCancel:   qs('downloadDestPickerCancelBtn'),
    destPickerUse:      qs('downloadDestPickerUseBtn'),
    destPickerUp:       qs('downloadDestPickerUpBtn'),
    destPickerRoot:     qs('downloadDestPickerRootSelect'),
    destPickerModes:    qs('downloadDestPickerModes'),
    destPickerList:     qs('downloadDestPickerList'),
    destPickerPath:     qs('downloadDestPickerPath'),
    destPickerEmpty:    qs('downloadDestPickerEmpty'),

    // Sources search UI
    sourcesSearchInput: qs('sourcesSearchInput'),
    sourcesSearchSource: qs('sourcesSearchSource'),
    sourcesSearchType: qs('sourcesSearchType'),
    sourcesSearchSort: qs('sourcesSearchSort'),
    sourcesSearchBtn: qs('sourcesSearchBtn'),
    sourcesSearchTableWrap: qs('sourcesSearchTableWrap'),
    sourcesSearchBody: qs('sourcesSearchBody'),
    sourcesSearchStatus: qs('sourcesSearchStatus'),
    sourcesSearchTabBtn: qs('sourcesSearchTabBtn'),
    sourcesDownloadsTabBtn: qs('sourcesDownloadsTabBtn'),
    sourcesSearchView: qs('sourcesSearchView'),
    sourcesDownloadsView: qs('sourcesDownloadsView'),
    sourcesTorrentBody: qs('sourcesTorrentBody'),

    // Save-to-library flow
    sourcesSaveOverlay: qs('sourcesSaveFlowOverlay'),
    sourcesSaveCancel: qs('sourcesSaveFlowCancel'),
    sourcesSaveBack: qs('sourcesSaveFlowBack'),
    sourcesSaveStream: qs('sourcesSaveFlowStream'),
    sourcesSaveStart: qs('sourcesSaveFlowStart'),
    sourcesSaveCategory: qs('sourcesSaveCategory'),
    sourcesSaveDestMode: qs('sourcesSaveDestMode'),
    sourcesSaveExistingWrap: qs('sourcesSaveExistingWrap'),
    sourcesSaveExistingFolder: qs('sourcesSaveExistingFolder'),
    sourcesSaveNewWrap: qs('sourcesSaveNewWrap'),
    sourcesSaveNewFolder: qs('sourcesSaveNewFolder'),
    sourcesSaveResolvedPath: qs('sourcesSaveResolvedPath'),
    sourcesSaveSequential: qs('sourcesSaveSequential'),
    sourcesSaveFilesList: qs('sourcesSaveFilesList'),
    sourcesSaveSelectAll: qs('sourcesSaveSelectAll'),
    sourcesSaveDeselectAll: qs('sourcesSaveDeselectAll'),
    sourcesUnhideBtn: qs('sourcesUnhideBtn'),
  };

  // ── Shared state ──

  var MAX_BROWSING_HISTORY_UI = 500;

  var state = {
    sources: [],
    tabs: [],
    activeTabId: null,
    nextTabId: 1,
    downloading: 0,
    downloadingHasProgress: false,
    lastDownloadName: '',
    lastDownloadProgress: null,
    downloads: [],
    dlPanelOpen: false,
    dlBarDismissed: false,
    dlBarTimer: null,
    browserOpen: false,
    editSourceId: null,
    toastTimer: null,
    ctxOpen: false,
    showBrowserHome: false,
    browserSettings: {
      defaultSearchEngine: 'yandex',
      parityV1Enabled: true,
      adblockEnabled: true,
      restoreLastSession: true,
      startup: { mode: 'continue', customUrl: '' },
      home: { homeUrl: '', newTabBehavior: 'tankoban_home' },
      downloads: { behavior: 'ask', folderModeHint: true },
      sourcesMinimalTorrentV1: false,
      sourcesLastDestinationByCategory: { comics: '', books: '', videos: '' },
      privacy: { doNotTrack: false, clearOnExit: { history: false, downloads: false, cookies: false, cache: false } }
    },
    torActive: false,
    torConnecting: false,
    browsingHistory: [],
    browsingHistoryQuery: '',
    browseSearchTimer: null,
    torrentActive: [],
    torrentHistory: [],
    closedTabs: [],
    restoreLastSession: true,
    sessionRestoreInProgress: false,
    sessionSaveTimer: null,
    bookmarks: [],
    permissions: [],
    permissionPromptQueue: [],
    permissionPromptActive: null,
    adblock: { enabled: true, blockedCount: 0, domainCount: 0, listUpdatedAt: 0 },
    userscripts: { enabled: true, rules: [] },
    userscriptEditingId: null,
    findBarOpen: false,
    findQuery: '',
    findResult: { activeMatchOrdinal: 0, matches: 0 },
    omniSuggestOpen: false,
    omniSuggestItems: [],
    omniSuggestActiveIndex: -1,
    menuOpen: false,
    downloadsOpen: false,
    historyOpen: false,
    bookmarksOpen: false,
    hubTorrentFilter: 'active',
    destPickerData: null,
    sourcesSubMode: 'search',
    searchResultsRaw: [],
    searchResults: [],
    searchQuery: '',
    searchPage: 0,
    searchHasMore: false,
    searchLoading: false,
    searchLoadingMore: false,
    searchRequestToken: 0,
    searchLimit: 40,
    searchSourceOptions: [],
    pendingMagnet: null,
    saveFlowMode: 'onboarding',
    managingTorrentId: null,
    pendingResolveId: null,
    pendingResolveFiles: [],
    pendingFileSelection: {},
    pendingFilePriorities: {},
    sourcesTorrents: [],
    lastSaveCategory: 'comics',
    hiddenSourceTorrentIds: {},
    destinationRoots: { books: null, comics: null, videos: null, allBooks: [], allComics: [], allVideos: [] },
  };

  // ── Event bus ──

  var _bus = Object.create(null);

  function on(event, fn) {
    if (!_bus[event]) _bus[event] = [];
    _bus[event].push(fn);
  }

  function emit(event, payload) {
    var listeners = _bus[event];
    if (!listeners) return;
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](payload); } catch (e) { console.warn('[web-bus]', event, e); }
    }
  }

  // ── Utility functions (shared via bridge.deps) ──

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

  function getFaviconUrl(url) {
    try {
      var hostname = new URL(String(url || '')).hostname;
      return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(hostname) + '&sz=32';
    } catch (e) { return ''; }
  }

  function getSourceColor(id) {
    for (var i = 0; i < state.sources.length; i++) {
      if (state.sources[i] && state.sources[i].id === id) return state.sources[i].color || '#888';
    }
    return '#555';
  }

  function getSourceById(id) {
    for (var i = 0; i < state.sources.length; i++) {
      if (state.sources[i] && state.sources[i].id === id) return state.sources[i];
    }
    return null;
  }

  function shortPath(p) {
    var s = String(p || '');
    if (s.length > 40) return '...' + s.slice(-37);
    return s;
  }

  var _toastTimer = null;
  function showToast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.remove('hidden');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () {
      el.toast.classList.add('hidden');
    }, 2500);
  }

  function getFeature(name) {
    try {
      var f = window.Tanko && window.Tanko.features ? window.Tanko.features : null;
      if (!f || !name) return null;
      return f[name] || null;
    } catch (_e) {
      return null;
    }
  }

  function getSourcesOps() {
    var feat = getFeature('sources');
    return {
      search: feat && typeof feat.search === 'function' ? feat.search : (api.torrentSearch && api.torrentSearch.query ? api.torrentSearch.query : null),
      indexers: feat && typeof feat.indexers === 'function' ? feat.indexers : (api.torrentSearch && api.torrentSearch.indexers ? api.torrentSearch.indexers : null),
      resolveMetadata: feat && typeof feat.resolveMetadata === 'function' ? feat.resolveMetadata : (api.webTorrent && api.webTorrent.resolveMetadata ? api.webTorrent.resolveMetadata : null),
      startConfigured: feat && typeof feat.startConfigured === 'function' ? feat.startConfigured : (api.webTorrent && api.webTorrent.startConfigured ? api.webTorrent.startConfigured : null),
      cancelResolve: feat && typeof feat.cancelResolve === 'function' ? feat.cancelResolve : (api.webTorrent && api.webTorrent.cancelResolve ? api.webTorrent.cancelResolve : null),
      startMagnet: feat && typeof feat.startMagnet === 'function' ? feat.startMagnet : (api.webTorrent && api.webTorrent.startMagnet ? api.webTorrent.startMagnet : null),
    };
  }

  function getTorrentOps() {
    var feat = getFeature('torrent');
    return {
      getActive: feat && typeof feat.getActive === 'function' ? feat.getActive : (api.webTorrent && api.webTorrent.getActive ? api.webTorrent.getActive : null),
      getHistory: feat && typeof feat.getHistory === 'function' ? feat.getHistory : (api.webTorrent && api.webTorrent.getHistory ? api.webTorrent.getHistory : null),
      selectFiles: feat && typeof feat.selectFiles === 'function' ? feat.selectFiles : (api.webTorrent && api.webTorrent.selectFiles ? api.webTorrent.selectFiles : null),
      remove: feat && typeof feat.remove === 'function' ? feat.remove : (api.webTorrent && api.webTorrent.remove ? api.webTorrent.remove : null),
      removeHistory: feat && typeof feat.removeHistory === 'function' ? feat.removeHistory : (api.webTorrent && api.webTorrent.removeHistory ? api.webTorrent.removeHistory : null),
      pauseAll: feat && typeof feat.pauseAll === 'function' ? feat.pauseAll : (api.webTorrent && api.webTorrent.pauseAll ? api.webTorrent.pauseAll : null),
      resumeAll: feat && typeof feat.resumeAll === 'function' ? feat.resumeAll : (api.webTorrent && api.webTorrent.resumeAll ? api.webTorrent.resumeAll : null),
      onStarted: feat && typeof feat.onStarted === 'function' ? feat.onStarted : (api.webTorrent && api.webTorrent.onStarted ? api.webTorrent.onStarted : null),
      onMetadata: feat && typeof feat.onMetadata === 'function' ? feat.onMetadata : (api.webTorrent && api.webTorrent.onMetadata ? api.webTorrent.onMetadata : null),
      onProgress: feat && typeof feat.onProgress === 'function' ? feat.onProgress : (api.webTorrent && api.webTorrent.onProgress ? api.webTorrent.onProgress : null),
      onCompleted: feat && typeof feat.onCompleted === 'function' ? feat.onCompleted : (api.webTorrent && api.webTorrent.onCompleted ? api.webTorrent.onCompleted : null),
      onMagnetDetected: feat && typeof feat.onMagnetDetected === 'function' ? feat.onMagnetDetected : (api.webTorrent && api.webTorrent.onMagnetDetected ? api.webTorrent.onMagnetDetected : null),
      addToVideoLibrary: feat && typeof feat.addToVideoLibrary === 'function' ? feat.addToVideoLibrary : (api.webTorrent && api.webTorrent.addToVideoLibrary ? api.webTorrent.addToVideoLibrary : null),
    };
  }

  function getBrowserOps() {
    var feat = getFeature('browser');
    return {
      getSettings: feat && typeof feat.getSettings === 'function'
        ? feat.getSettings
        : (api.webBrowserSettings && api.webBrowserSettings.get ? api.webBrowserSettings.get : null),
      saveSettings: feat && typeof feat.saveSettings === 'function'
        ? feat.saveSettings
        : (api.webBrowserSettings && api.webBrowserSettings.save ? api.webBrowserSettings.save : null),
    };
  }

  function getWebSourcesOps() {
    return {
      get: api.webSources && typeof api.webSources.get === 'function' ? api.webSources.get : null,
      getDestinations: api.webSources && typeof api.webSources.getDestinations === 'function' ? api.webSources.getDestinations : null,
      listDestinationFolders: api.webSources && typeof api.webSources.listDestinationFolders === 'function' ? api.webSources.listDestinationFolders : null,
      add: api.webSources && typeof api.webSources.add === 'function' ? api.webSources.add : null,
      update: api.webSources && typeof api.webSources.update === 'function' ? api.webSources.update : null,
      remove: api.webSources && typeof api.webSources.remove === 'function' ? api.webSources.remove : null,
      clearDownloadHistory: api.webSources && typeof api.webSources.clearDownloadHistory === 'function' ? api.webSources.clearDownloadHistory : null,
      onUpdated: api.webSources && typeof api.webSources.onUpdated === 'function' ? api.webSources.onUpdated : null,
      onDestinationPickerRequest: api.webSources && typeof api.webSources.onDestinationPickerRequest === 'function' ? api.webSources.onDestinationPickerRequest : null,
    };
  }

  function loadHiddenSourcesTorrents() {
    try {
      var raw = localStorage.getItem('tankoSourcesHiddenTorrents');
      var parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') state.hiddenSourceTorrentIds = parsed;
    } catch (_e) {}
  }

  function saveHiddenSourcesTorrents() {
    try { localStorage.setItem('tankoSourcesHiddenTorrents', JSON.stringify(state.hiddenSourceTorrentIds || {})); } catch (_e) {}
  }

  function isWebModeActive() {
    var router = window.Tanko && window.Tanko.modeRouter;
    if (!router || typeof router.getMode !== 'function') return false;
    var mode = String(router.getMode() || '').toLowerCase();
    return mode === 'sources' || mode === 'web';
  }

  // ── webTabs shim (replaces old WCV IPC) ──
  // New architecture uses <webview> tags directly in DOM.
  // This shim keeps hub module's findInPage call working.

  var webTabs = {
    findInPage: function (opts) {
      if (!opts) return Promise.resolve();
      var tabId = opts.tabId;
      // Find the webview for this tab
      var tab = null;
      for (var i = 0; i < state.tabs.length; i++) {
        if (state.tabs[i] && String(state.tabs[i].id) === String(tabId)) { tab = state.tabs[i]; break; }
      }
      if (!tab) return Promise.resolve();
      var wv = tab._webview;
      if (!wv || typeof wv.findInPage !== 'function') return Promise.resolve();
      try {
        if (opts.action === 'clear') {
          wv.stopFindInPage('clearSelection');
        } else if (opts.action === 'previous') {
          wv.findInPage(opts.query || '', { forward: false, findNext: true });
        } else {
          wv.findInPage(opts.query || '', { forward: true, findNext: opts.action === 'next' });
        }
      } catch (e) {}
      return Promise.resolve();
    },
    hideAll: function () { return Promise.resolve(); },
    setMuted: function () { return Promise.resolve(); }
  };

  // ── Bridge + module initialization ──

  var bridge = {
    state: state,
    el: el,
    api: api,
    webTabs: webTabs,
    on: on,
    emit: emit,
    deps: {}
  };

  function useWebModule(name) {
    var registry = window.__tankoWebModules || {};
    if (typeof registry[name] !== 'function') {
      console.warn('[web.js] module not found:', name);
      return {};
    }
    try {
      return registry[name](bridge);
    } catch (e) {
      console.error('[web.js] module "' + name + '" threw during init:', e);
      return {};
    }
  }

  // Initialize all modules
  var tabsState    = useWebModule('tabsState');
  var navOmnibox   = useWebModule('navOmnibox');
  var downloads    = useWebModule('downloads');
  var panels       = useWebModule('panels');
  var contextMenu  = useWebModule('contextMenu');
  var find         = useWebModule('find');
  var torrentTab   = useWebModule('torrentTab');
  var hub          = useWebModule('hub');
  var standalone   = useWebModule('standalone');

  // ── Cross-dependency wiring ──
  // Modules access bridge.deps lazily, so we can wire after all factories run.
  try {

  bridge.deps.escapeHtml       = escapeHtml;
  bridge.deps.siteNameFromUrl  = siteNameFromUrl;
  bridge.deps.getFaviconUrl    = getFaviconUrl;
  bridge.deps.getSourceColor   = getSourceColor;
  bridge.deps.getSourceById    = getSourceById;
  bridge.deps.shortPath        = shortPath;
  bridge.deps.showToast        = showToast;
  bridge.deps.isWebModeActive  = isWebModeActive;
  bridge.deps.MAX_BROWSING_HISTORY_UI = MAX_BROWSING_HISTORY_UI;

  // From tabsState
  bridge.deps.getActiveTab      = tabsState.getActiveTab;
  bridge.deps.getActiveWebview   = tabsState.getActiveWebview;
  bridge.deps.createTab         = tabsState.createTab;
  bridge.deps.activateTab       = tabsState.activateTab;
  bridge.deps.ensureWebview     = tabsState.ensureWebview;
  bridge.deps.ensureTabRuntime  = tabsState.ensureWebview;
  bridge.deps.openTorrentTab    = tabsState.openTorrentTab;
  bridge.deps.renderTabs        = tabsState.renderTabs;
  bridge.deps.syncLoadBar       = tabsState.syncLoadingState;
  bridge.deps.syncReloadStopButton = tabsState.syncLoadingState;
  bridge.deps.updateNavButtons  = tabsState.updateNavButtons;
  bridge.deps.scheduleSessionSave = tabsState.scheduleSessionSave;

  // Allow other modules to clean up torrent tab resources when closed. The
  // torrentTab module exposes a `destroy` method which clears its internal
  // intervals and resets internal state. Without invoking destroy, closing
  // the torrent tab leaves behind a running DHT update interval which
  // continues to tick and leaks memory/resources. Provide a dependency
  // so tabsState can invoke it during tab close events.
  if (torrentTab && typeof torrentTab.destroy === 'function') {
    bridge.deps.destroyTorrentTab = torrentTab.destroy;
  }

  // From navOmnibox
  bridge.deps.navigateUrl         = navOmnibox.navigateUrl;
  bridge.deps.closeOmniSuggestions = navOmnibox.hideOmniDropdown;
  bridge.deps.setOmniIconForUrl   = navOmnibox.setOmniIconForUrl;
  bridge.deps.getActiveSearchEngine = navOmnibox.getActiveSearchEngine;
  bridge.deps.getSearchUrl        = navOmnibox.getSearchUrl;

  // From downloads
  bridge.deps.showDownloadsPanel  = downloads.showDownloadsPanel;
  bridge.deps.renderDownloadsPanel = downloads.showDownloadsPanel;
  bridge.deps.renderHomeDownloads = function () {}; // stub — home downloads rendered by orchestrator

  // From panels
  bridge.deps.hideAllPanels      = panels.hideAllPanels;
  bridge.deps.showContextMenu    = contextMenu.showContextMenu;
  bridge.deps.hideContextMenu    = contextMenu.hideContextMenu;

  // From find
  bridge.deps.closeFind          = find.closeFind;
  bridge.deps.bindFindEvents     = find.bindFindEvents;
  bridge.deps.openFind           = find.openFind;

  // From hub
  bridge.deps.updateBookmarkIcon  = hub.updateBookmarkButton;
  bridge.deps.renderHubAll       = hub.renderHubAll;

  // Orchestrator functions (wired after definition below)
  // bridge.deps.openBrowserForTab, bridge.deps.openNewTab, bridge.deps.openHubPanelSection
  // are set after mode-switching functions are defined.

  // ── Mode switching ──

  var _libraryViewMap = { comics: 'libraryView', books: 'booksLibraryView', videos: 'videoLibraryView', sources: 'webLibraryView' };

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

  function syncContentVisibility() {
    var activeTab = tabsState.getActiveTab ? tabsState.getActiveTab() : null;
    var showHome = !!state.showBrowserHome;
    var showTorrent = !showHome && activeTab && activeTab.type === 'torrent';
    var showWebview = !showHome && !showTorrent;

    if (el.homePanel) el.homePanel.style.display = showHome ? '' : 'none';
    if (el.torrentContainer) el.torrentContainer.style.display = showTorrent ? '' : 'none';
    if (el.webviewContainer) el.webviewContainer.style.display = showWebview ? '' : 'none';
  }

  function updateUrlDisplay() {
    if (!el.urlBar) return;
    var tab = tabsState.getActiveTab ? tabsState.getActiveTab() : null;
    if (!tab) {
      el.urlBar.value = '';
      if (navOmnibox.setOmniIconForUrl) navOmnibox.setOmniIconForUrl('');
      return;
    }
    var url = String(tab.url || '');
    // Don't overwrite while user is editing
    if (document.activeElement !== el.urlBar) {
      el.urlBar.value = url;
    }
    if (navOmnibox.setOmniIconForUrl) navOmnibox.setOmniIconForUrl(url);
  }

  function ensureTorrentContainerInBrowser() {
    if (!el.torrentContainer || !el.contentArea) return;
    if (el.torrentContainer.parentElement !== el.contentArea) {
      el.contentArea.appendChild(el.torrentContainer);
    }
  }

  // Wire updateUrlDisplay as a dep
  bridge.deps.updateUrlDisplay = updateUrlDisplay;

  function openBrowser(source) {
    ensureTorrentContainerInBrowser();
    if (panels.hideAllPanels) panels.hideAllPanels();
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
      if (tabsState.switchTab) tabsState.switchTab(existing.id);
    } else {
      if (tabsState.createTab) tabsState.createTab(source, source.url);
    }

    state.showBrowserHome = false;
    state.browserOpen = true;
    _hideCurrentLibraryView();
    if (el.browserView) el.browserView.classList.remove('hidden');
    renderSources();
    renderBrowserHome();
    syncContentVisibility();
    if (el.webviewContainer) el.webviewContainer.classList.remove('wb-pointer-disabled');
    if (hub.updateBookmarkButton) hub.updateBookmarkButton();
  }

  function openHome() {
    ensureTorrentContainerInBrowser();
    if (panels.hideAllPanels) panels.hideAllPanels();
    state.showBrowserHome = true;
    state.browserOpen = true;
    _hideCurrentLibraryView();
    if (el.browserView) el.browserView.classList.remove('hidden');
    syncContentVisibility();
    updateUrlDisplay();
    if (tabsState.updateNavButtons) tabsState.updateNavButtons();
    if (hub.updateBookmarkButton) hub.updateBookmarkButton();
    renderBrowserHome();
    if (el.webviewContainer) el.webviewContainer.classList.remove('wb-pointer-disabled');
    if (el.homeSearchInput) {
      setTimeout(function () {
        if (state.showBrowserHome && el.homeSearchInput) el.homeSearchInput.focus();
      }, 0);
    }
  }

  function openBrowserForTab(tabId) {
    ensureTorrentContainerInBrowser();
    var tab = null;
    for (var i = 0; i < state.tabs.length; i++) {
      if (state.tabs[i].id === tabId) { tab = state.tabs[i]; break; }
    }
    if (!tab) return;

    if (panels.hideAllPanels) panels.hideAllPanels();
    if (tabsState.switchTab) tabsState.switchTab(tabId);
    state.showBrowserHome = false;
    state.browserOpen = true;
    _hideCurrentLibraryView();
    if (el.browserView) el.browserView.classList.remove('hidden');
    renderSources();
    syncContentVisibility();
    if (el.webviewContainer) el.webviewContainer.classList.remove('wb-pointer-disabled');
    if (hub.updateBookmarkButton) hub.updateBookmarkButton();
  }

  function openNewTab() {
    var behavior = state.browserSettings.home.newTabBehavior || 'tankoban_home';
    if (behavior === 'tankoban_home' || behavior === 'home') {
      openHome();
    } else if (behavior === 'custom' && state.browserSettings.home.homeUrl) {
      if (tabsState.createTab) tabsState.createTab(null, state.browserSettings.home.homeUrl);
      state.showBrowserHome = false;
      state.browserOpen = true;
      _hideCurrentLibraryView();
      if (el.browserView) el.browserView.classList.remove('hidden');
      syncContentVisibility();
    } else {
      openHome();
    }
  }

  function closeBrowser() {
    state.browserOpen = false;
    state.showBrowserHome = false;
    if (el.browserView) el.browserView.classList.add('hidden');
    _showCurrentLibraryView();
    updateUrlDisplay();
    renderSources();
    renderSourcesGrid();
    renderBrowserHome();
    renderContinue();
    if (panels.hideAllPanels) panels.hideAllPanels();
    if (contextMenu.hideContextMenu) contextMenu.hideContextMenu();
    if (find.closeFind) find.closeFind();
    if (navOmnibox.hideOmniDropdown) navOmnibox.hideOmniDropdown();
    if (el.webviewContainer) el.webviewContainer.classList.remove('wb-pointer-disabled');
    syncContentVisibility();
  }

  // Wire orchestrator functions as deps
  bridge.deps.openBrowserForTab  = openBrowserForTab;
  bridge.deps.openNewTab         = openNewTab;
  bridge.deps.openHubPanelSection = function () {}; // not used in new browser

  // ── Source management ──

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

  function renderSourcesGrid() {
    if (!el.sourcesGrid || !el.sourcesEmpty) return;
    el.sourcesGrid.innerHTML = '';
    el.sourcesEmpty.classList.toggle('hidden', !!state.sources.length);
    if (!state.sources.length) return;

    for (var i = 0; i < state.sources.length; i++) {
      el.sourcesGrid.appendChild(makeSourceCard(state.sources[i]));
    }
  }

  function makeSourceCard(source) {
    var card = document.createElement('div');
    card.className = 'seriesCard';
    card.setAttribute('tabindex', '0');
    card.setAttribute('data-source-id', source.id);

    var color = source.color || '#888';
    card.innerHTML = '<div class="seriesThumb" style="background:' + color + ';display:flex;align-items:center;justify-content:center">'
      + '<span style="font-size:2rem;font-weight:bold;color:#fff">' + escapeHtml((source.name || '?').charAt(0).toUpperCase()) + '</span>'
      + '</div>'
      + '<div class="seriesTitle">' + escapeHtml(source.name) + '</div>';

    card.addEventListener('click', function () { openBrowser(source); });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBrowser(source); }
    });
    return card;
  }

  function getSearchEngineMetaForHome() {
    var engines = navOmnibox.SEARCH_ENGINES || {};
    var key = String(state.browserSettings && state.browserSettings.defaultSearchEngine || 'yandex').trim().toLowerCase();
    if (!engines[key]) key = 'yandex';
    return engines[key] || { label: 'Yandex' };
  }

  function syncHomeSearchUi() {
    var meta = getSearchEngineMetaForHome();
    if (el.homeSearchTitle) el.homeSearchTitle.textContent = meta.label + ' Search';
    if (el.homeQuickTitle) el.homeQuickTitle.textContent = 'Quick access';
    if (el.homeSearchInput) el.homeSearchInput.setAttribute('placeholder', 'Search with ' + meta.label + ' or type a URL');
  }

  function submitHomeSearch(raw) {
    var q = String(raw || '').trim();
    if (!q) return;
    var url = navOmnibox.resolveInput ? navOmnibox.resolveInput(q) : (navOmnibox.getSearchUrl ? navOmnibox.getSearchUrl(q) : q);
    if (!url) return;
    if (tabsState.createTab) tabsState.createTab(null, url, { switchTo: true });
    state.showBrowserHome = false;
    syncContentVisibility();
  }

  function renderBrowserHome() {
    if (!el.homeGrid || !el.homePanel) return;
    syncHomeSearchUi();
    el.homeGrid.innerHTML = '';
    if (el.homeEmpty) el.homeEmpty.style.display = state.sources.length ? 'none' : '';

    for (var i = 0; i < state.sources.length; i++) {
      var s = state.sources[i];
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'web-home-card';
      card.setAttribute('data-source-id', s.id);

      var iconWrap = document.createElement('div');
      iconWrap.className = 'web-home-card-icon';
      var img = document.createElement('img');
      img.alt = '';
      img.src = getFaviconUrl(s.url);
      img.onerror = function () { this.style.display = 'none'; };
      iconWrap.appendChild(img);

      var name = document.createElement('div');
      name.className = 'web-home-card-title';
      name.textContent = s.name || 'Source';

      card.appendChild(iconWrap);
      card.appendChild(name);
      el.homeGrid.appendChild(card);
    }

    syncContentVisibility();
  }

  function renderContinue() {
    if (!el.continuePanel || !el.continueEmpty) return;
    el.continuePanel.innerHTML = '';
    var hasTabs = state.tabs.length > 0;
    el.continuePanel.classList.toggle('hidden', !hasTabs);
    el.continueEmpty.classList.toggle('hidden', hasTabs);
    if (!hasTabs) return;

    for (var i = 0; i < state.tabs.length; i++) {
      var tab = state.tabs[i];
      if (!tab) continue;
      var tile = document.createElement('div');
      tile.className = 'continueYacTile';
      tile.setAttribute('data-tab-id', tab.id);
      tile.innerHTML = '<div class="continueYacTitle">' + escapeHtml(tab.title || tab.url || 'Tab') + '</div>'
        + '<div class="continueYacUrl">' + escapeHtml(tab.url || '') + '</div>';
      tile.addEventListener('click', (function (tid) {
        return function () { openBrowserForTab(tid); };
      })(tab.id));
      el.continuePanel.appendChild(tile);
    }
  }

  function loadSources() {
    var srcOps = getWebSourcesOps();
    if (!srcOps.get) return;
    srcOps.get().then(function (res) {
      if (res && res.ok && Array.isArray(res.sources)) {
        state.sources = res.sources;
        renderSources();
        renderSourcesGrid();
        renderBrowserHome();
        renderContinue();
      }
    }).catch(function () {});
  }

  function loadDestinations() {
    var srcOps = getWebSourcesOps();
    if (!srcOps.getDestinations) return;
    srcOps.getDestinations().then(function (res) {
      if (!res || !res.ok) return;
      state.destinationRoots = {
        books: res.books || null,
        comics: res.comics || null,
        videos: res.videos || null,
        allBooks: Array.isArray(res.allBooks) ? res.allBooks : [],
        allComics: Array.isArray(res.allComics) ? res.allComics : [],
        allVideos: Array.isArray(res.allVideos) ? res.allVideos : []
      };
      if (el.destBooks) el.destBooks.textContent = shortPath(res.books || 'Not configured');
      if (el.destComics) el.destComics.textContent = shortPath(res.comics || 'Not configured');
    }).catch(function () {});
  }

  function isSourcesV2Torrent(entry) {
    var e = (entry && typeof entry === 'object') ? entry : null;
    if (!e) return false;
    return String(e.origin || '').toLowerCase() === 'sources_v2';
  }

  function refreshSourcesTorrents() {
    var tor = getTorrentOps();
    if (!tor.getActive && !tor.getHistory) return;
    var p1 = (typeof tor.getActive === 'function')
      ? tor.getActive()
      : Promise.resolve({ ok: false, torrents: [] });
    var p2 = (typeof tor.getHistory === 'function')
      ? tor.getHistory()
      : Promise.resolve({ ok: false, torrents: [] });
    Promise.all([p1, p2]).then(function (res) {
      var a = (res[0] && res[0].ok && Array.isArray(res[0].torrents)) ? res[0].torrents : [];
      var h = (res[1] && res[1].ok && Array.isArray(res[1].torrents)) ? res[1].torrents : [];
      var map = Object.create(null);
      for (var i = 0; i < h.length; i++) {
        var itemH = h[i];
        if (!itemH || !isSourcesV2Torrent(itemH)) continue;
        map[String(itemH.id || '')] = itemH;
      }
      for (var j = 0; j < a.length; j++) {
        var itemA = a[j];
        if (!itemA || !isSourcesV2Torrent(itemA)) continue;
        map[String(itemA.id || '')] = itemA;
      }
      var out = [];
      var keys = Object.keys(map);
      for (var k = 0; k < keys.length; k++) out.push(map[keys[k]]);
      out.sort(function (x, y) { return Number(y.startedAt || 0) - Number(x.startedAt || 0); });
      state.sourcesTorrents = out;
      renderSourcesTorrentRows();
    }).catch(function () {});
  }

  function getSourcesTorrentById(id) {
    var key = String(id || '');
    for (var i = 0; i < state.sourcesTorrents.length; i++) {
      var t = state.sourcesTorrents[i];
      if (t && String(t.id || '') === key) return t;
    }
    return null;
  }

  function openManageFilesOverlayByTorrentId(id) {
    var entry = getSourcesTorrentById(id);
    if (!entry) return;
    resetSaveFlowState();
    state.saveFlowMode = 'manage';
    state.managingTorrentId = String(entry.id || '');
    state.pendingMagnet = { magnetUri: String(entry.magnetUri || ''), title: String(entry.name || 'torrent') };
    state.pendingResolveFiles = Array.isArray(entry.files) ? entry.files : [];
    state.pendingFileSelection = {};
    state.pendingFilePriorities = {};
    for (var i = 0; i < state.pendingResolveFiles.length; i++) {
      var f = state.pendingResolveFiles[i] || {};
      state.pendingFileSelection[i] = f.selected !== false;
      state.pendingFilePriorities[i] = String((entry.filePriorities && entry.filePriorities[i]) || f.priority || 'normal');
    }
    var cat = 'comics';
    if ((entry.destinationRoot || '').toLowerCase().indexOf('\\tv') !== -1 || (entry.destinationRoot || '').toLowerCase().indexOf('/tv') !== -1) cat = 'videos';
    if (el.sourcesSaveCategory) el.sourcesSaveCategory.value = cat;
    if (el.sourcesSaveDestMode) el.sourcesSaveDestMode.value = 'existing';
    refreshSaveFlowInputs();
    if (el.sourcesSaveSequential) el.sourcesSaveSequential.checked = entry.sequential !== false;
    if (el.sourcesSaveStart) {
      el.sourcesSaveStart.textContent = 'Apply';
      el.sourcesSaveStart.disabled = !state.pendingResolveFiles.length;
    }
    if (el.sourcesSaveBack) el.sourcesSaveBack.classList.remove('hidden');
    renderSaveFlowFiles();
    updateStreamableButtonState();
    if (el.sourcesSaveOverlay) el.sourcesSaveOverlay.classList.remove('hidden');
  }

  function showSourcesTorrentContextMenu(x, y, id) {
    if (!el.webLibraryView) return;
    var t0 = getSourcesTorrentById(id);
    var seqOn = !t0 || t0.sequential !== false;
    var existing = document.getElementById('sourcesTorrentCtxMenu');
    if (existing && existing.parentElement) existing.parentElement.removeChild(existing);
    var menu = document.createElement('div');
    menu.id = 'sourcesTorrentCtxMenu';
    menu.className = 'tt-ctx-menu';
    menu.style.display = 'block';
    menu.style.position = 'fixed';
    menu.style.zIndex = '9999';
    menu.innerHTML = ''
      + '<div class="tt-ctx-item" data-action="see-files">See files</div>'
      + '<div class="tt-ctx-item" data-action="toggle-seq">' + (seqOn ? '&#10003; ' : '') + 'Sequential download</div>'
      + '<div class="tt-ctx-parent-wrap">'
      +   '<div class="tt-ctx-item tt-ctx-parent">Remove <span class="tt-ctx-caret">&#9656;</span></div>'
      +   '<div class="tt-ctx-submenu">'
      +     '<div class="tt-ctx-item" data-action="remove-hide">Hide torrent</div>'
      +     '<div class="tt-ctx-item" data-action="remove-only">Remove from Sources</div>'
      +     '<div class="tt-ctx-item" data-action="remove-lib">Remove from Sources & Library</div>'
      +     '<div class="tt-ctx-item" data-action="remove-delete">Remove and delete files</div>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(menu);
    menu.style.left = Math.max(8, x) + 'px';
    menu.style.top = Math.max(8, y) + 'px';
    var cleanup = function () {
      if (menu && menu.parentElement) menu.parentElement.removeChild(menu);
      document.removeEventListener('mousedown', onDocDown, true);
    };
    var onDocDown = function (e) {
      if (menu.contains(e.target)) return;
      cleanup();
    };
    document.addEventListener('mousedown', onDocDown, true);
    menu.addEventListener('click', function (e) {
      var item = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
      if (!item) return;
      var action = item.getAttribute('data-action');
      cleanup();
      if (action === 'see-files') { openManageFilesOverlayByTorrentId(id); return; }
      if (action === 'toggle-seq') {
        var t = getSourcesTorrentById(id);
        var torOps = getTorrentOps();
        if (!t || typeof torOps.selectFiles !== 'function') return;
        var files = Array.isArray(t.files) ? t.files : [];
        var selected = [];
        var priorities = {};
        for (var i = 0; i < files.length; i++) {
          var f = files[i] || {};
          if (f.selected === false) continue;
          selected.push(i);
          priorities[i] = String((t.filePriorities && t.filePriorities[i]) || f.priority || 'normal');
        }
        torOps.selectFiles({
          id: id,
          selectedIndices: selected,
          priorities: priorities,
          sequential: !(t.sequential === true),
          destinationRoot: t.destinationRoot || t.savePath || ''
        }).then(function () {
          t.sequential = !(t.sequential === true);
          refreshSourcesTorrents();
        }).catch(function () {});
        return;
      }
      if (action === 'remove-hide') {
        state.hiddenSourceTorrentIds[String(id)] = true;
        saveHiddenSourcesTorrents();
        renderSourcesTorrentRows();
        return;
      }
      var tor = getTorrentOps();
      if (!tor.remove) return;
      if (action === 'remove-only') {
        Promise.resolve(tor.remove({ id: id, removeFiles: false, removeFromLibrary: false }))
          .then(function () { return tor.removeHistory ? tor.removeHistory({ id: id }) : { ok: true }; })
          .finally(refreshSourcesTorrents);
        return;
      }
      if (action === 'remove-lib') {
        Promise.resolve(tor.remove({ id: id, removeFiles: false, removeFromLibrary: true }))
          .then(function () { return tor.removeHistory ? tor.removeHistory({ id: id }) : { ok: true }; })
          .finally(refreshSourcesTorrents);
        return;
      }
      if (action === 'remove-delete') {
        Promise.resolve(tor.remove({ id: id, removeFiles: true, removeFromLibrary: true }))
          .then(function () { return tor.removeHistory ? tor.removeHistory({ id: id }) : { ok: true }; })
          .finally(refreshSourcesTorrents);
      }
    });
  }

  function formatBytesForSources(bytes) {
    var n = Number(bytes || 0);
    if (!isFinite(n) || n <= 0) return '-';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var idx = Math.floor(Math.log(n) / Math.log(1024));
    if (idx < 0) idx = 0;
    if (idx >= units.length) idx = units.length - 1;
    var value = n / Math.pow(1024, idx);
    return value.toFixed(idx === 0 ? 0 : 1) + ' ' + units[idx];
  }

  function setSourcesSubMode(mode) {
    var key = 'search';
    state.sourcesSubMode = key;
    if (el.sourcesSearchTabBtn) el.sourcesSearchTabBtn.classList.toggle('active', key === 'search');
    if (el.sourcesDownloadsTabBtn) el.sourcesDownloadsTabBtn.classList.toggle('active', key === 'downloads');
    if (el.sourcesSearchView) el.sourcesSearchView.classList.toggle('hidden', key !== 'search');
    if (el.sourcesDownloadsView) el.sourcesDownloadsView.classList.toggle('hidden', key !== 'downloads');
    if (el.torrentContainer) el.torrentContainer.style.display = 'none';
    if (el.sourcesDownloadsView && el.torrentContainer && el.torrentContainer.parentElement === el.sourcesDownloadsView && el.contentArea) {
      el.contentArea.appendChild(el.torrentContainer);
    }
    if (el.sourcesSearchInput) {
      setTimeout(function () {
        try { el.sourcesSearchInput.focus(); } catch (_e) {}
      }, 0);
    }
  }

  function forceSourcesViewVisible() {
    try {
      var comicsView = document.getElementById('libraryView');
      var booksView = document.getElementById('booksLibraryView');
      var videosView = document.getElementById('videoLibraryView');
      if (comicsView) comicsView.classList.add('hidden');
      if (booksView) booksView.classList.add('hidden');
      if (videosView) videosView.classList.add('hidden');
      if (el.webLibraryView) el.webLibraryView.classList.remove('hidden');
      document.body.classList.add('inSourcesMode');
      document.body.classList.remove('inComicsMode', 'inBooksMode', 'inVideoMode');
    } catch (_e) {}
  }

  function renderSourcesSearchRows() {
    if (!el.sourcesSearchBody) return;
    var html = '';
    for (var i = 0; i < state.searchResults.length; i++) {
      var row = state.searchResults[i] || {};
      var metaBits = [];
      if (row.sourceName) metaBits.push(String(row.sourceName));
      if (Array.isArray(row.typeLabels) && row.typeLabels.length) metaBits.push(String(row.typeLabels.slice(0, 2).join(', ')));
      var sub = metaBits.length ? ('<div class="muted tiny">' + escapeHtml(metaBits.join(' • ')) + '</div>') : '';
      html += '<tr>'
        + '<td class="sourcesSearchTitleCell" title="' + escapeHtml(row.title || '') + '">' + escapeHtml(row.title || '-') + sub + '</td>'
        + '<td>' + escapeHtml(formatBytesForSources(row.sizeBytes)) + '</td>'
        + '<td>' + escapeHtml(String(row.fileCount != null ? row.fileCount : '-')) + '</td>'
        + '<td>' + escapeHtml(String(row.seeders != null ? row.seeders : 0)) + '</td>'
        + '<td><button class="btn btn-sm" data-magnet-id="' + escapeHtml(String(row.id || '')) + '">Magnet</button></td>'
      + '</tr>';
    }
    if (!html) {
      html = '<tr><td colspan="5" class="muted tiny">No results.</td></tr>';
    }
    el.sourcesSearchBody.innerHTML = html;
  }

  function getSearchSource() {
    return String((el.sourcesSearchSource && el.sourcesSearchSource.value) || 'all').trim() || 'all';
  }

  function getSearchTypeFilter() {
    return String((el.sourcesSearchType && el.sourcesSearchType.value) || 'all').trim().toLowerCase() || 'all';
  }

  function getSearchSort() {
    return String((el.sourcesSearchSort && el.sourcesSearchSort.value) || 'relevance').trim().toLowerCase() || 'relevance';
  }

  function applySourcesSearchView() {
    var rows = Array.isArray(state.searchResultsRaw) ? state.searchResultsRaw.slice() : [];
    var typeFilter = getSearchTypeFilter();
    if (typeFilter !== 'all') {
      rows = rows.filter(function (row) {
        var keys = Array.isArray(row && row.typeKeys) ? row.typeKeys : [];
        for (var i = 0; i < keys.length; i++) {
          if (String(keys[i] || '').trim().toLowerCase() === typeFilter) return true;
        }
        return false;
      });
    }

    var sortMode = getSearchSort();
    if (sortMode === 'seeders_desc') {
      rows.sort(function (a, b) {
        var sa = Number(a && a.seeders || 0);
        var sb = Number(b && b.seeders || 0);
        if (sb !== sa) return sb - sa;
        var za = Number(a && a.sizeBytes || 0);
        var zb = Number(b && b.sizeBytes || 0);
        if (zb !== za) return zb - za;
        return String(a && a.title || '').localeCompare(String(b && b.title || ''), undefined, { sensitivity: 'base' });
      });
    } else if (sortMode === 'size_desc') {
      rows.sort(function (a, b) {
        var za = Number(a && a.sizeBytes || 0);
        var zb = Number(b && b.sizeBytes || 0);
        if (zb !== za) return zb - za;
        var sa = Number(a && a.seeders || 0);
        var sb = Number(b && b.seeders || 0);
        if (sb !== sa) return sb - sa;
        return String(a && a.title || '').localeCompare(String(b && b.title || ''), undefined, { sensitivity: 'base' });
      });
    }

    state.searchResults = rows;
    renderSourcesSearchRows();
  }

  function renderSearchTypeOptions() {
    if (!el.sourcesSearchType) return;
    var selected = getSearchTypeFilter();
    var map = new Map();
    var rows = Array.isArray(state.searchResultsRaw) ? state.searchResultsRaw : [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || {};
      var keys = Array.isArray(row.typeKeys) ? row.typeKeys : [];
      var labels = Array.isArray(row.typeLabels) ? row.typeLabels : [];
      for (var j = 0; j < keys.length; j++) {
        var key = String(keys[j] || '').trim().toLowerCase();
        if (!key) continue;
        if (map.has(key)) continue;
        var label = String(labels[j] || key).trim() || key;
        map.set(key, label);
      }
    }
    var entries = Array.from(map.entries()).sort(function (a, b) {
      return String(a[1] || a[0] || '').localeCompare(String(b[1] || b[0] || ''), undefined, { sensitivity: 'base' });
    });
    var html = '<option value="all">All Types</option>';
    for (var k = 0; k < entries.length; k++) {
      html += '<option value="' + escapeHtml(entries[k][0]) + '">' + escapeHtml(entries[k][1]) + '</option>';
    }
    el.sourcesSearchType.innerHTML = html;
    if (selected !== 'all' && map.has(selected)) el.sourcesSearchType.value = selected;
    else el.sourcesSearchType.value = 'all';
  }

  function renderSearchSourceOptions() {
    if (!el.sourcesSearchSource) return;
    var selected = getSearchSource();
    var list = Array.isArray(state.searchSourceOptions) ? state.searchSourceOptions.slice() : [];
    list.sort(function (a, b) {
      var aName = String((a && (a.name || a.id)) || '');
      var bName = String((b && (b.name || b.id)) || '');
      var aNyaa = /nyaa/i.test(aName);
      var bNyaa = /nyaa/i.test(bName);
      if (aNyaa !== bNyaa) return aNyaa ? -1 : 1;
      return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
    });
    var html = '<option value="all">All Sources</option>';
    for (var i = 0; i < list.length; i++) {
      var row = list[i] || {};
      var id = String(row.id || '').trim();
      if (!id) continue;
      var name = String(row.name || id).trim() || id;
      html += '<option value="' + escapeHtml(id) + '">' + escapeHtml(name) + '</option>';
    }
    el.sourcesSearchSource.innerHTML = html;
    if (selected !== 'all' && list.some(function (row) { return String(row && row.id || '') === selected; })) {
      el.sourcesSearchSource.value = selected;
    } else {
      el.sourcesSearchSource.value = 'all';
    }
  }

  function appendSearchResults(items) {
    var src = Array.isArray(items) ? items : [];
    if (!src.length) return 0;
    var seen = new Set();
    var out = Array.isArray(state.searchResultsRaw) ? state.searchResultsRaw.slice() : [];
    var added = 0;
    for (var i = 0; i < out.length; i++) {
      var key0 = String(out[i] && (out[i].magnetUri || out[i].id || out[i].title) || '').trim();
      if (key0) seen.add(key0);
    }
    for (var j = 0; j < src.length; j++) {
      var row = src[j] || {};
      var key = String(row.magnetUri || row.id || row.title || '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(row);
      added += 1;
    }
    state.searchResultsRaw = out;
    return added;
  }

  function asPct01(value) {
    var n = Number(value || 0);
    if (!isFinite(n) || n <= 0) return '0%';
    if (n >= 1) return '100%';
    return Math.round(n * 100) + '%';
  }

  function renderSourcesTorrentRows() {
    if (!el.sourcesTorrentBody) return;
    var rows = Array.isArray(state.sourcesTorrents) ? state.sourcesTorrents.filter(function (t) {
      var id = String(t && t.id || '');
      return !!id && !state.hiddenSourceTorrentIds[id];
    }) : [];
    if (!rows.length) {
      el.sourcesTorrentBody.innerHTML = '<tr><td colspan="5" class="muted tiny">No torrents yet.</td></tr>';
      return;
    }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var t = rows[i] || {};
      html += '<tr data-source-torrent-id="' + escapeHtml(String(t.id || '')) + '">'
        + '<td>' + (i + 1) + '</td>'
        + '<td class="sourcesSearchTitleCell" title="' + escapeHtml(String(t.name || t.infoHash || 'Torrent')) + '">' + escapeHtml(String(t.name || t.infoHash || 'Torrent')) + '</td>'
        + '<td>' + escapeHtml(formatBytesForSources(t.totalSize || 0)) + '</td>'
        + '<td>' + escapeHtml(formatBytesForSources(t.downloadRate || 0)) + '/s</td>'
        + '<td>' + escapeHtml(asPct01(t.progress)) + ' / ' + escapeHtml(String(t.state || 'unknown')) + '</td>'
      + '</tr>';
    }
    el.sourcesTorrentBody.innerHTML = html;
  }

  function getDestinationRootByCategory(category) {
    var key = String(category || 'comics').trim().toLowerCase();
    if (key === 'books') return state.destinationRoots.books || '';
    if (key === 'videos') return state.destinationRoots.videos || '';
    return state.destinationRoots.comics || '';
  }

  function getRootListByCategory(category) {
    var key = String(category || 'comics').trim().toLowerCase();
    if (key === 'books') return state.destinationRoots.allBooks || [];
    if (key === 'videos') return state.destinationRoots.allVideos || [];
    return state.destinationRoots.allComics || [];
  }

  function listFoldersForSaveFlow(category, rootPath) {
    var srcOps = getWebSourcesOps();
    if (!srcOps.listDestinationFolders) {
      return Promise.resolve({ ok: true, folders: [] });
    }
    return srcOps.listDestinationFolders({ mode: category, path: rootPath || '' });
  }

  function renderSaveFlowFiles() {
    if (!el.sourcesSaveFilesList) return;
    var files = Array.isArray(state.pendingResolveFiles) ? state.pendingResolveFiles : [];
    if (!files.length) {
      el.sourcesSaveFilesList.innerHTML = '<div class="muted tiny">No file information available.</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < files.length; i++) {
      var f = files[i] || {};
      var checked = state.pendingFileSelection[i] !== false;
      var priority = String(state.pendingFilePriorities[i] || 'normal');
      html += '<label class="sourcesSaveFileRow">'
        + '<input type="checkbox" class="sourcesSaveFileCheck" data-idx="' + i + '"' + (checked ? ' checked' : '') + ' />'
        + '<span class="sourcesSaveFileName" title="' + escapeHtml(String(f.path || f.name || '')) + '">' + escapeHtml(String(f.name || f.path || ('File ' + (i + 1)))) + '</span>'
        + '<select class="select sourcesSaveFilePriority" data-priority-idx="' + i + '">'
          + '<option value="high"' + (priority === 'high' ? ' selected' : '') + '>High</option>'
          + '<option value="normal"' + (priority === 'normal' ? ' selected' : '') + '>Normal</option>'
          + '<option value="low"' + (priority === 'low' ? ' selected' : '') + '>Low</option>'
        + '</select>'
        + '<span class="sourcesSaveFileSize">' + escapeHtml(formatBytesForSources(f.length || 0)) + '</span>'
      + '</label>';
    }
    el.sourcesSaveFilesList.innerHTML = html;
  }

  function updateSavePathPreview() {
    var resolved = buildSavePath();
    if (el.sourcesSaveResolvedPath) {
      el.sourcesSaveResolvedPath.textContent = resolved || 'Destination not configured';
      el.sourcesSaveResolvedPath.title = resolved || '';
    }
  }

  function shouldShowStreamableButton() {
    var category = String((el.sourcesSaveCategory && el.sourcesSaveCategory.value) || 'comics').trim().toLowerCase();
    return category === 'videos';
  }

  function updateStreamableButtonState() {
    if (!el.sourcesSaveStream) return;
    var show = shouldShowStreamableButton();
    el.sourcesSaveStream.classList.toggle('hidden', !show);
    if (!show) {
      el.sourcesSaveStream.disabled = true;
      return;
    }
    var hasResolve = !!state.pendingResolveId;
    var hasManage = !!(state.saveFlowMode === 'manage' && state.managingTorrentId);
    el.sourcesSaveStream.disabled = !(hasResolve || hasManage);
  }

  function waitForTorrentState(torrentId, wantedState, timeoutMs) {
    var id = String(torrentId || '').trim();
    if (!id) return Promise.resolve(false);
    var wanted = String(wantedState || 'metadata_ready').trim();
    var torOps = getTorrentOps();
    if (!torOps || typeof torOps.getActive !== 'function') return Promise.resolve(false);
    var timeout = Math.max(2000, Number(timeoutMs) || 30000);
    var startedAt = Date.now();
    return new Promise(function (resolve) {
      function tick() {
        torOps.getActive().then(function (res) {
          var rows = (res && res.ok && Array.isArray(res.torrents)) ? res.torrents : [];
          for (var i = 0; i < rows.length; i++) {
            var t = rows[i] || {};
            if (String(t.id || '') === id && String(t.state || '') === wanted) return resolve(true);
          }
          if ((Date.now() - startedAt) >= timeout) return resolve(false);
          setTimeout(tick, 450);
        }).catch(function () {
          if ((Date.now() - startedAt) >= timeout) return resolve(false);
          setTimeout(tick, 700);
        });
      }
      tick();
    });
  }

  function refreshSaveFlowInputs() {
    var category = String((el.sourcesSaveCategory && el.sourcesSaveCategory.value) || 'comics').trim().toLowerCase();
    var mode = String((el.sourcesSaveDestMode && el.sourcesSaveDestMode.value) || 'default').trim().toLowerCase();
    var lastByCat = state.browserSettings && state.browserSettings.sourcesLastDestinationByCategory
      ? state.browserSettings.sourcesLastDestinationByCategory : {};
    var preferred = String(lastByCat[category] || '').trim();
    var preferredNorm = preferred.replace(/\//g, '\\').toLowerCase();
    if (mode === 'default' && preferred && el.sourcesSaveDestMode) {
      el.sourcesSaveDestMode.value = 'existing';
      mode = 'existing';
    }
    if (el.sourcesSaveExistingWrap) el.sourcesSaveExistingWrap.classList.toggle('hidden', mode !== 'existing');
    if (el.sourcesSaveNewWrap) el.sourcesSaveNewWrap.classList.toggle('hidden', mode !== 'new');
    if (mode !== 'existing') {
      updateSavePathPreview();
      updateStreamableButtonState();
      return;
    }
    var roots = getRootListByCategory(category);
    var root = roots.length ? roots[0] : getDestinationRootByCategory(category);
    listFoldersForSaveFlow(category, root).then(function (res) {
      if (!el.sourcesSaveExistingFolder) return;
      var rows = (res && res.ok && Array.isArray(res.folders)) ? res.folders : [];
      var html = '';
      var seenPreferred = false;
      for (var i = 0; i < rows.length; i++) {
        var p = String(rows[i] && rows[i].path || '');
        if (!p) continue;
        if (preferred && p.replace(/\//g, '\\').toLowerCase() === preferredNorm) seenPreferred = true;
        html += '<option value="' + escapeHtml(p) + '">' + escapeHtml(rows[i].name || p) + '</option>';
      }
      if (preferred && !seenPreferred) {
        html = '<option value="' + escapeHtml(preferred) + '">' + escapeHtml(preferred) + '</option>' + html;
      }
      if (!html && root) html = '<option value="' + escapeHtml(root) + '">' + escapeHtml(root) + '</option>';
      el.sourcesSaveExistingFolder.innerHTML = html;
      if (preferred) el.sourcesSaveExistingFolder.value = preferred;
      updateSavePathPreview();
      updateStreamableButtonState();
    }).catch(function () {
      updateSavePathPreview();
      updateStreamableButtonState();
    });
  }

  function resetSaveFlowState() {
    var srcOps = getSourcesOps();
    if (state.pendingResolveId && typeof srcOps.cancelResolve === 'function') {
      srcOps.cancelResolve({ resolveId: state.pendingResolveId }).catch(function () {});
    }
    state.pendingResolveId = null;
    state.pendingResolveFiles = [];
    state.pendingFileSelection = {};
    state.pendingFilePriorities = {};
    state.saveFlowMode = 'onboarding';
    state.managingTorrentId = null;
  }

  function resolveFilesForSaveFlow() {
    var row = state.pendingMagnet;
    var srcOps = getSourcesOps();
    if (!row || !row.magnetUri || typeof srcOps.resolveMetadata !== 'function') {
      if (el.sourcesSaveStart) el.sourcesSaveStart.disabled = false;
      renderSaveFlowFiles();
      updateStreamableButtonState();
      return;
    }
    if (el.sourcesSaveFilesList) el.sourcesSaveFilesList.innerHTML = '<div class="muted tiny">Resolving metadata...</div>';
    function acceptMeta(meta) {
      if (!meta || !meta.ok) throw new Error((meta && meta.error) || 'Metadata resolution failed');
      state.pendingResolveId = meta.resolveId;
      state.pendingResolveFiles = Array.isArray(meta.files) ? meta.files : [];
      state.pendingFileSelection = {};
      state.pendingFilePriorities = {};
      for (var i = 0; i < state.pendingResolveFiles.length; i++) {
        state.pendingFileSelection[i] = true;
        state.pendingFilePriorities[i] = 'normal';
      }
      if (el.sourcesSaveStart) el.sourcesSaveStart.disabled = !state.pendingResolveFiles.length;
      renderSaveFlowFiles();
      updateStreamableButtonState();
      if (!state.pendingResolveFiles.length) throw new Error('No file metadata returned for this torrent.');
    }

    function doResolve(withDestination) {
      var payload = { source: row.magnetUri };
      if (withDestination) payload.destinationRoot = buildSavePath() || undefined;
      return srcOps.resolveMetadata(payload).then(acceptMeta);
    }

    doResolve(true).catch(function () {
      return doResolve(false);
    }).catch(function (err) {
      if (el.sourcesSaveStart) el.sourcesSaveStart.disabled = true;
      updateStreamableButtonState();
      if (el.sourcesSaveFilesList) {
        el.sourcesSaveFilesList.innerHTML = ''
          + '<div class="muted tiny">' + escapeHtml(String((err && err.message) || err || 'Could not resolve files')) + '</div>'
          + '<div class="tiny" style="margin-top:8px;"><button id="sourcesSaveRetryResolve" class="btn btn-ghost btn-sm" type="button">Retry</button></div>';
        var retry = document.getElementById('sourcesSaveRetryResolve');
        if (retry) retry.addEventListener('click', function () { resolveFilesForSaveFlow(); });
      }
    });
  }

  function inferSaveCategoryFromRow(row) {
    var r = (row && typeof row === 'object') ? row : {};
    var keys = [];
    if (Array.isArray(r.typeKeys)) {
      for (var i = 0; i < r.typeKeys.length; i++) keys.push(String(r.typeKeys[i] || '').toLowerCase());
    }
    if (Array.isArray(r.typeLabels)) {
      for (var j = 0; j < r.typeLabels.length; j++) keys.push(String(r.typeLabels[j] || '').toLowerCase());
    }

    var hasAny = function (patterns) {
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        for (var j = 0; j < patterns.length; j++) {
          if (patterns[j].test(k)) return true;
        }
      }
      return false;
    };

    if (hasAny([/comic/, /manga/, /manhwa/, /graphic/])) return 'comics';
    if (hasAny([/book/, /ebook/, /novel/, /audiobook/, /literature/])) return 'books';
    if (hasAny([/\btv\b/, /series/, /show/, /movie/, /film/, /video/, /anime/])) return 'videos';
    return String(state.lastSaveCategory || 'comics').trim().toLowerCase() || 'comics';
  }

  function openSaveFlow(resultRow) {
    if (!resultRow || !resultRow.magnetUri) return;
    resetSaveFlowState();
    state.pendingMagnet = resultRow;
    var inferredCategory = inferSaveCategoryFromRow(resultRow);
    if (el.sourcesSaveCategory) el.sourcesSaveCategory.value = inferredCategory;
    var lastByCat = state.browserSettings && state.browserSettings.sourcesLastDestinationByCategory
      ? state.browserSettings.sourcesLastDestinationByCategory : {};
    var lastPath = String(lastByCat[inferredCategory] || '').trim();
    if (el.sourcesSaveDestMode) el.sourcesSaveDestMode.value = lastPath ? 'existing' : 'default';
    if (el.sourcesSaveNewFolder) el.sourcesSaveNewFolder.value = '';
    if (el.sourcesSaveSequential) el.sourcesSaveSequential.checked = true;
    if (el.sourcesSaveStart) {
      el.sourcesSaveStart.disabled = true;
      el.sourcesSaveStart.textContent = 'Start Download';
    }
    if (el.sourcesSaveStream) el.sourcesSaveStream.disabled = true;
    if (el.sourcesSaveBack) el.sourcesSaveBack.classList.add('hidden');
    refreshSaveFlowInputs();
    updateStreamableButtonState();
    if (el.sourcesSaveOverlay) el.sourcesSaveOverlay.classList.remove('hidden');
    state.saveFlowMode = 'onboarding';
    resolveFilesForSaveFlow();
  }

  function closeSaveFlow() {
    resetSaveFlowState();
    state.pendingMagnet = null;
    if (el.sourcesSaveStart) el.sourcesSaveStart.textContent = 'Start Download';
    if (el.sourcesSaveBack) el.sourcesSaveBack.classList.add('hidden');
    if (el.sourcesSaveStream) {
      el.sourcesSaveStream.classList.add('hidden');
      el.sourcesSaveStream.disabled = true;
    }
    if (el.sourcesSaveOverlay) el.sourcesSaveOverlay.classList.add('hidden');
  }

  function buildSavePath() {
    var category = String((el.sourcesSaveCategory && el.sourcesSaveCategory.value) || 'comics').trim().toLowerCase();
    var mode = String((el.sourcesSaveDestMode && el.sourcesSaveDestMode.value) || 'default').trim().toLowerCase();
    var root = getDestinationRootByCategory(category);
    if (!root) return '';
    if (mode === 'existing') {
      return String((el.sourcesSaveExistingFolder && el.sourcesSaveExistingFolder.value) || root).trim() || root;
    }
    if (mode === 'new') {
      var folderName = String((el.sourcesSaveNewFolder && el.sourcesSaveNewFolder.value) || '').trim();
      if (!folderName) return '';
      var normalizedRoot = String(root).replace(/[\\\/]+$/, '');
      var safeName = folderName.replace(/[\\\/]+/g, '_');
      return normalizedRoot + '/' + safeName;
    }
    if (mode === 'default') {
      var lastByCat = state.browserSettings && state.browserSettings.sourcesLastDestinationByCategory
        ? state.browserSettings.sourcesLastDestinationByCategory : {};
      var last = String(lastByCat[category] || '').trim();
      if (last) return last;
    }
    return root;
  }

  function startConfiguredDownload() {
    var row = state.pendingMagnet;
    var srcOps = getSourcesOps();
    var torOps = getTorrentOps();
    if (!row || !row.magnetUri) {
      if (el.sourcesSearchStatus) el.sourcesSearchStatus.textContent = 'No magnet selected.';
      showToast('No magnet selected');
      return;
    }
    var savePath = buildSavePath();
    if (!savePath) {
      var category = String((el.sourcesSaveCategory && el.sourcesSaveCategory.value) || 'comics');
      if (el.sourcesSearchStatus) el.sourcesSearchStatus.textContent = 'No destination configured for ' + category + '. Add a library root folder first.';
      showToast('No destination configured for ' + category);
      return;
    }

    var selected = [];
    var priorities = {};
    if (Array.isArray(state.pendingResolveFiles) && state.pendingResolveFiles.length) {
      for (var i = 0; i < state.pendingResolveFiles.length; i++) {
        if (state.pendingFileSelection[i] !== false) {
          selected.push(i);
          priorities[i] = String(state.pendingFilePriorities[i] || 'normal');
        }
      }
    }
    if (!selected.length && Array.isArray(state.pendingResolveFiles) && state.pendingResolveFiles.length) {
      if (el.sourcesSearchStatus) el.sourcesSearchStatus.textContent = 'Select at least one file.';
      showToast('Select at least one file');
      return;
    }

    var sequential = !!(el.sourcesSaveSequential && el.sourcesSaveSequential.checked);
    if (el.sourcesSaveStart) el.sourcesSaveStart.disabled = true;

    function persistDestinationChoice() {
      var cat = String((el.sourcesSaveCategory && el.sourcesSaveCategory.value) || 'comics').trim().toLowerCase();
      state.lastSaveCategory = cat;
      if (!state.browserSettings.sourcesLastDestinationByCategory) {
        state.browserSettings.sourcesLastDestinationByCategory = { comics: '', books: '', videos: '' };
      }
      state.browserSettings.sourcesLastDestinationByCategory[cat] = savePath;
      var patch = { sourcesLastDestinationByCategory: {} };
      patch.sourcesLastDestinationByCategory[cat] = savePath;
      saveBrowserSettings(patch);
    }

    function onStartedOk(started) {
      if (!started || !started.ok) throw new Error((started && started.error) || 'Failed to start download');
      persistDestinationChoice();
      closeSaveFlow();
      if (el.sourcesSearchStatus) el.sourcesSearchStatus.textContent = '';
      forceSourcesViewVisible();
      if (hub && typeof hub.refreshTorrentState === 'function') hub.refreshTorrentState();
      showToast('Torrent added to Downloads');
    }

    var startPromise;
    if (state.saveFlowMode === 'manage' && state.managingTorrentId && typeof torOps.selectFiles === 'function') {
      startPromise = torOps.selectFiles({
        id: state.managingTorrentId,
        selectedIndices: selected,
        priorities: priorities,
        sequential: sequential,
        destinationRoot: savePath
      }).then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.error) || 'Failed to apply torrent file changes');
        return { ok: true, id: state.managingTorrentId };
      });
    } else if (state.pendingResolveId && typeof srcOps.startConfigured === 'function') {
      startPromise = srcOps.startConfigured({
        resolveId: state.pendingResolveId,
        origin: 'sources_v2',
        savePath: savePath,
        selectedFiles: selected.length ? selected : null
      }).then(function (started) {
        if (!started || !started.ok) throw new Error((started && started.error) || 'Failed to start download');
        if (selected.length && typeof torOps.selectFiles === 'function') {
          return torOps.selectFiles({
            id: started.id,
            selectedIndices: selected,
            priorities: priorities,
            sequential: sequential,
            destinationRoot: savePath
          }).then(function () { return started; });
        }
        return started;
      });
    } else if (typeof srcOps.startMagnet === 'function') {
      startPromise = srcOps.startMagnet({ magnetUri: row.magnetUri, destinationRoot: savePath, origin: 'sources_v2' });
    } else {
      startPromise = Promise.reject(new Error('Download start unavailable'));
    }

    startPromise.then(onStartedOk).catch(function (err) {
      var msg = String((err && err.message) || err || 'Failed to start torrent');
      if (el.sourcesSearchStatus) el.sourcesSearchStatus.textContent = msg;
      showToast(msg);
    }).finally(function () {
      if (el.sourcesSaveStart) el.sourcesSaveStart.disabled = false;
      updateStreamableButtonState();
    });
  }

  function startStreamableVideoFolder() {
    var row = state.pendingMagnet;
    var srcOps = getSourcesOps();
    var torOps = getTorrentOps();
    if (!row || !row.magnetUri) {
      if (el.sourcesSearchStatus) el.sourcesSearchStatus.textContent = 'No magnet selected.';
      showToast('No magnet selected');
      return;
    }
    var category = String((el.sourcesSaveCategory && el.sourcesSaveCategory.value) || 'comics').trim().toLowerCase();
    if (category !== 'videos') {
      showToast('Streamable folders are only supported for TV/Videos');
      return;
    }
    var savePath = buildSavePath();
    if (!savePath) {
      if (el.sourcesSearchStatus) el.sourcesSearchStatus.textContent = 'No destination configured for videos. Add a Videos root folder first.';
      showToast('No destination configured for videos');
      return;
    }
    if (!torOps || typeof torOps.addToVideoLibrary !== 'function') {
      showToast('Streamable video library integration is unavailable');
      return;
    }

    if (el.sourcesSaveStart) el.sourcesSaveStart.disabled = true;
    if (el.sourcesSaveStream) el.sourcesSaveStream.disabled = true;

    function persistDestinationChoice() {
      state.lastSaveCategory = 'videos';
      if (!state.browserSettings.sourcesLastDestinationByCategory) {
        state.browserSettings.sourcesLastDestinationByCategory = { comics: '', books: '', videos: '' };
      }
      state.browserSettings.sourcesLastDestinationByCategory.videos = savePath;
      saveBrowserSettings({ sourcesLastDestinationByCategory: { videos: savePath } });
    }

    var startPromise;
    if (state.saveFlowMode === 'manage' && state.managingTorrentId) {
      startPromise = waitForTorrentState(state.managingTorrentId, 'metadata_ready', 30000).then(function (ready) {
        if (!ready) throw new Error('Torrent metadata is not ready');
        return { ok: true, id: state.managingTorrentId };
      });
    } else if (state.pendingResolveId && typeof srcOps.startConfigured === 'function') {
      startPromise = srcOps.startConfigured({
        resolveId: state.pendingResolveId,
        origin: 'sources_v2',
        streamableOnly: true
      }).then(function (started) {
        if (!started || !started.ok || !started.id) throw new Error((started && started.error) || 'Failed to start torrent');
        return waitForTorrentState(started.id, 'metadata_ready', 30000).then(function (ready) {
          if (!ready) throw new Error('Torrent metadata is not ready');
          return started;
        });
      });
    } else {
      startPromise = Promise.reject(new Error('Resolve metadata first'));
    }

    startPromise.then(function (started) {
      return torOps.addToVideoLibrary({
        id: started.id,
        destinationRoot: savePath,
        streamable: true
      });
    }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'Failed to add streamable folder');
      persistDestinationChoice();
      closeSaveFlow();
      if (el.sourcesSearchStatus) el.sourcesSearchStatus.textContent = '';
      forceSourcesViewVisible();
      if (hub && typeof hub.refreshTorrentState === 'function') hub.refreshTorrentState();
      showToast('Streamable folder added to Video Library');
    }).catch(function (err) {
      var msg = String((err && err.message) || err || 'Failed to add streamable folder');
      if (el.sourcesSearchStatus) el.sourcesSearchStatus.textContent = msg;
      showToast(msg);
    }).finally(function () {
      if (el.sourcesSaveStart) el.sourcesSaveStart.disabled = false;
      updateStreamableButtonState();
    });
  }

  function setSourcesSearchStatus(text) {
    if (el.sourcesSearchStatus) el.sourcesSearchStatus.textContent = String(text || '');
  }

  function updateSourcesSearchStatusTail() {
    var filteredCount = Array.isArray(state.searchResults) ? state.searchResults.length : 0;
    var totalCount = Array.isArray(state.searchResultsRaw) ? state.searchResultsRaw.length : 0;
    if (!totalCount) {
      setSourcesSearchStatus(state.searchQuery ? '0 result(s)' : '');
      return;
    }
    var msg = filteredCount === totalCount
      ? (totalCount + ' result(s)')
      : (filteredCount + ' filtered / ' + totalCount + ' result(s)');
    if (state.searchLoadingMore) msg += ' • loading more...';
    else if (!state.searchHasMore) msg += ' • end reached';
    setSourcesSearchStatus(msg);
  }

  function resetSourcesSearchState() {
    state.searchRequestToken += 1;
    state.searchQuery = '';
    state.searchPage = 0;
    state.searchHasMore = false;
    state.searchLoading = false;
    state.searchLoadingMore = false;
    state.searchResultsRaw = [];
    state.searchResults = [];
    renderSearchTypeOptions();
    renderSourcesSearchRows();
    setSourcesSearchStatus('');
  }

  function runSourcesSearch(opts) {
    var options = (opts && typeof opts === 'object') ? opts : {};
    var append = !!options.append;
    var query = String((el.sourcesSearchInput && el.sourcesSearchInput.value) || '').trim();
    if (!query) {
      resetSourcesSearchState();
      return;
    }

    var srcOps = getSourcesOps();
    if (typeof srcOps.search !== 'function') {
      setSourcesSearchStatus('Torrent search backend is unavailable.');
      return;
    }

    if (!append) {
      state.searchQuery = query;
      state.searchPage = 0;
      state.searchHasMore = true;
      state.searchResultsRaw = [];
      state.searchResults = [];
      state.searchRequestToken += 1;
      renderSourcesSearchRows();
      renderSearchTypeOptions();
    } else {
      if (state.searchLoading || state.searchLoadingMore || !state.searchHasMore) return;
      if (query !== state.searchQuery) {
        runSourcesSearch({ append: false });
        return;
      }
    }

    var token = state.searchRequestToken;
    var page = append ? state.searchPage : 0;
    var source = getSearchSource();
    if (append) {
      state.searchLoadingMore = true;
      setSourcesSearchStatus('Loading more...');
    } else {
      state.searchLoading = true;
      setSourcesSearchStatus('Searching...');
    }

    srcOps.search({
      query: query,
      category: 'all',
      source: source,
      limit: state.searchLimit,
      page: page
    }).then(function (res) {
      if (token !== state.searchRequestToken) return;
      if (!res || !res.ok) {
        state.searchHasMore = false;
        if (!append) {
          state.searchResultsRaw = [];
          state.searchResults = [];
          renderSearchTypeOptions();
          renderSourcesSearchRows();
        }
        setSourcesSearchStatus((res && res.error) || 'Search failed');
        return;
      }

      var items = Array.isArray(res.items) ? res.items : [];
      if (!append) state.searchResultsRaw = [];
      appendSearchResults(items);
      state.searchPage = page + 1;
      state.searchHasMore = items.length > 0;
      renderSearchTypeOptions();
      applySourcesSearchView();
      updateSourcesSearchStatusTail();
    }).catch(function (err) {
      if (token !== state.searchRequestToken) return;
      state.searchHasMore = false;
      if (!append) {
        state.searchResultsRaw = [];
        state.searchResults = [];
        renderSearchTypeOptions();
        renderSourcesSearchRows();
      }
      setSourcesSearchStatus(String((err && err.message) || err || 'Search failed'));
    }).finally(function () {
      if (token !== state.searchRequestToken) return;
      state.searchLoading = false;
      state.searchLoadingMore = false;
      if (Array.isArray(state.searchResultsRaw) && state.searchResultsRaw.length) updateSourcesSearchStatusTail();
      setTimeout(ensureSourcesSearchViewportFilled, 0);
    });
  }

  function maybeLoadMoreSourcesSearch() {
    if (state.sourcesSubMode !== 'search') return;
    if (!el.sourcesSearchTableWrap) return;
    if (state.searchLoading || state.searchLoadingMore || !state.searchHasMore) return;
    if (!state.searchQuery) return;
    var wrap = el.sourcesSearchTableWrap;
    var remain = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight;
    if (remain > 120) return;
    runSourcesSearch({ append: true });
  }

  function ensureSourcesSearchViewportFilled() {
    if (state.sourcesSubMode !== 'search') return;
    if (!el.sourcesSearchTableWrap) return;
    if (state.searchLoading || state.searchLoadingMore || !state.searchHasMore) return;
    if (!state.searchQuery) return;
    var wrap = el.sourcesSearchTableWrap;
    if ((wrap.scrollHeight - wrap.clientHeight) > 12) return;
    runSourcesSearch({ append: true });
  }

  function loadSourcesSearchIndexers() {
    var srcOps = getSourcesOps();
    if (!srcOps || typeof srcOps.indexers !== 'function') {
      state.searchSourceOptions = [];
      renderSearchSourceOptions();
      return;
    }
    srcOps.indexers().then(function (res) {
      var rows = (res && res.ok && Array.isArray(res.indexers)) ? res.indexers : [];
      state.searchSourceOptions = rows.map(function (row) {
        return { id: String(row && row.id || '').trim(), name: String(row && row.name || row && row.id || '').trim() };
      }).filter(function (row) { return !!row.id; });
      renderSearchSourceOptions();
    }).catch(function () {
      state.searchSourceOptions = [];
      renderSearchSourceOptions();
    });
  }

  function openAddSourceDialog(source) {
    state.editSourceId = source ? source.id : null;
    if (el.addTitle) el.addTitle.textContent = source ? 'Edit Source' : 'Add Download Source';
    if (el.sourceName) el.sourceName.value = source ? (source.name || '') : '';
    if (el.sourceUrl) el.sourceUrl.value = source ? (source.url || '') : '';
    if (el.sourceSaveBtn) el.sourceSaveBtn.textContent = source ? 'Save' : 'Add Source';
    if (el.addSourceOverlay) el.addSourceOverlay.classList.remove('hidden');
  }

  function closeAddSourceDialog() {
    state.editSourceId = null;
    if (el.addSourceOverlay) el.addSourceOverlay.classList.add('hidden');
    if (el.sourceName) el.sourceName.value = '';
    if (el.sourceUrl) el.sourceUrl.value = '';
  }

  function saveSource() {
    var name = (el.sourceName ? el.sourceName.value : '').trim();
    var url = (el.sourceUrl ? el.sourceUrl.value : '').trim();
    if (!name || !url) { showToast('Name and URL are required'); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    var srcOps = getWebSourcesOps();
    var method = state.editSourceId ? srcOps.update : srcOps.add;
    var payload = state.editSourceId
      ? { id: state.editSourceId, name: name, url: url }
      : { name: name, url: url };

    method(payload).then(function (res) {
      if (!res || !res.ok) { showToast('Failed to save source'); return; }
      showToast(state.editSourceId ? 'Source updated' : 'Source added');
      closeAddSourceDialog();
      loadSources();
    }).catch(function () { showToast('Failed to save source'); });
  }

  function removeSource(id) {
    if (!id) return;
    var srcOps = getWebSourcesOps();
    if (!srcOps.remove) return;
    srcOps.remove(id).then(function (res) {
      if (!res || !res.ok) { showToast('Failed to remove source'); return; }
      showToast('Source removed');
      loadSources();
    }).catch(function () { showToast('Failed to remove source'); });
  }

  // ── Browser settings ──

  function normalizeBrowserSettingsForUi(settings) {
    var src = (settings && typeof settings === 'object') ? settings : {};
    var startup = (src.startup && typeof src.startup === 'object') ? src.startup : {};
    var home = (src.home && typeof src.home === 'object') ? src.home : {};
    var dls = (src.downloads && typeof src.downloads === 'object') ? src.downloads : {};
    var privacy = (src.privacy && typeof src.privacy === 'object') ? src.privacy : {};
    var clearOnExit = (privacy.clearOnExit && typeof privacy.clearOnExit === 'object') ? privacy.clearOnExit : {};
    return {
      defaultSearchEngine: String(src.defaultSearchEngine || 'yandex').trim().toLowerCase() || 'yandex',
      parityV1Enabled: src.parityV1Enabled !== false,
      adblockEnabled: src.adblockEnabled !== false,
      restoreLastSession: src.restoreLastSession !== false,
      startup: { mode: String(startup.mode || 'continue').trim().toLowerCase() || 'continue', customUrl: String(startup.customUrl || '').trim() },
      home: { homeUrl: String(home.homeUrl || '').trim(), newTabBehavior: String(home.newTabBehavior || 'tankoban_home').trim().toLowerCase() || 'tankoban_home' },
      downloads: { behavior: String(dls.behavior || 'ask').trim().toLowerCase() || 'ask', folderModeHint: dls.folderModeHint !== false },
      sourcesMinimalTorrentV1: !!src.sourcesMinimalTorrentV1,
      sourcesLastDestinationByCategory: {
        comics: String(src.sourcesLastDestinationByCategory && src.sourcesLastDestinationByCategory.comics || '').trim(),
        books: String(src.sourcesLastDestinationByCategory && src.sourcesLastDestinationByCategory.books || '').trim(),
        videos: String(src.sourcesLastDestinationByCategory && src.sourcesLastDestinationByCategory.videos || '').trim()
      },
      privacy: { doNotTrack: !!privacy.doNotTrack, clearOnExit: { history: !!clearOnExit.history, downloads: !!clearOnExit.downloads, cookies: !!clearOnExit.cookies, cache: !!clearOnExit.cache } }
    };
  }

  function applySourcesMinimalFlag() {
    document.body.classList.toggle('sourcesMinimalTorrentV1', !!(state.browserSettings && state.browserSettings.sourcesMinimalTorrentV1));
  }

  function syncBrowserSettingsControls() {
    var s = state.browserSettings;
    if (el.hubStartupMode) el.hubStartupMode.value = s.startup.mode;
    if (el.hubStartupCustomUrl) el.hubStartupCustomUrl.value = s.startup.customUrl;
    if (el.hubHomeUrl) el.hubHomeUrl.value = s.home.homeUrl;
    if (el.hubNewTabBehavior) el.hubNewTabBehavior.value = s.home.newTabBehavior;
    if (el.hubDownloadBehavior) el.hubDownloadBehavior.value = s.downloads.behavior;
    if (el.hubDownloadFolderHint) el.hubDownloadFolderHint.checked = s.downloads.folderModeHint;
    if (el.hubPrivacyDoNotTrack) el.hubPrivacyDoNotTrack.checked = s.privacy.doNotTrack;
    if (el.hubClearOnExitHistory) el.hubClearOnExitHistory.checked = s.privacy.clearOnExit.history;
    if (el.hubClearOnExitDownloads) el.hubClearOnExitDownloads.checked = s.privacy.clearOnExit.downloads;
    if (el.hubClearOnExitCookies) el.hubClearOnExitCookies.checked = s.privacy.clearOnExit.cookies;
    if (el.hubClearOnExitCache) el.hubClearOnExitCache.checked = s.privacy.clearOnExit.cache;
    applySourcesMinimalFlag();
  }

  function loadBrowserSettings() {
    var browserOps = getBrowserOps();
    if (typeof browserOps.getSettings !== 'function') {
      if (navOmnibox.syncOmniPlaceholder) navOmnibox.syncOmniPlaceholder();
      return Promise.resolve();
    }
    return browserOps.getSettings().then(function (res) {
      if (!res || !res.ok || !res.settings) return;
      state.browserSettings = normalizeBrowserSettingsForUi(res.settings || {});
      state.restoreLastSession = state.browserSettings.restoreLastSession !== false;
      if (navOmnibox.syncSearchEngineSelect) navOmnibox.syncSearchEngineSelect();
      if (navOmnibox.syncOmniPlaceholder) navOmnibox.syncOmniPlaceholder();
      syncBrowserSettingsControls();
      if (api.webAdblock && typeof api.webAdblock.setEnabled === 'function') {
        api.webAdblock.setEnabled({ enabled: state.browserSettings.adblockEnabled !== false }).catch(function () {});
      }
    }).catch(function () {
      if (navOmnibox.syncSearchEngineSelect) navOmnibox.syncSearchEngineSelect();
      if (navOmnibox.syncOmniPlaceholder) navOmnibox.syncOmniPlaceholder();
      syncBrowserSettingsControls();
    });
  }

  function saveBrowserSettings(patch) {
    var browserOps = getBrowserOps();
    if (typeof browserOps.saveSettings !== 'function') return;
    var payload = (patch && typeof patch === 'object') ? patch : {};
    browserOps.saveSettings(payload).then(function (res) {
      if (!res || !res.ok || !res.settings) return;
      state.browserSettings = normalizeBrowserSettingsForUi(res.settings);
      state.restoreLastSession = state.browserSettings.restoreLastSession !== false;
      if (navOmnibox.syncSearchEngineSelect) navOmnibox.syncSearchEngineSelect();
      if (navOmnibox.syncOmniPlaceholder) navOmnibox.syncOmniPlaceholder();
      syncBrowserSettingsControls();
      if (tabsState.scheduleSessionSave) tabsState.scheduleSessionSave();
    }).catch(function () {});
  }

  // ── Download destination picker ──

  function handleDestPickerRequest(data) {
    state.destPickerData = data || null;
    if (el.destPickerOverlay) el.destPickerOverlay.classList.remove('hidden');
  }

  function closeDestPicker() {
    state.destPickerData = null;
    if (el.destPickerOverlay) el.destPickerOverlay.classList.add('hidden');
  }

  // ── Home downloads rendering ──

  function renderHomeDownloads() {
    if (!el.homeDlList || !el.homeDlEmpty) return;
    var active = [];
    for (var i = 0; i < state.downloads.length; i++) {
      var d = state.downloads[i];
      if (!d) continue;
      active.push(d);
    }
    active.sort(function (a, b) { return Number(b.startedAt || 0) - Number(a.startedAt || 0); });
    if (!active.length) {
      el.homeDlList.innerHTML = '';
      el.homeDlEmpty.classList.remove('hidden');
      return;
    }
    el.homeDlEmpty.classList.add('hidden');
    var html = '';
    for (var j = 0; j < Math.min(active.length, 20); j++) {
      var x = active[j];
      var pct = x.progress != null ? Math.round((Number(x.progress) || 0) * 100) + '%' : '';
      html += '<div class="webHomeDlItem">'
        + '<div class="webHomeDlName">' + escapeHtml(x.filename || 'Download') + '</div>'
        + '<div class="webHomeDlSub">' + escapeHtml(x.state || '') + (pct ? ' &bull; ' + pct : '') + '</div>'
        + '</div>';
    }
    el.homeDlList.innerHTML = html;
  }

  // Update the stub to point to real function
  bridge.deps.renderHomeDownloads = renderHomeDownloads;

  // ── Keyboard shortcuts ──

  function handleKeyDown(e) {
    try {
      var hostCfg = window.Tanko && window.Tanko.browserHost && typeof window.Tanko.browserHost.getConfig === 'function'
        ? window.Tanko.browserHost.getConfig() : null;
      if (hostCfg && hostCfg.enabled && hostCfg.adapter === 'aspect-embed') {
        var hostPane = document.getElementById('aspectEmbedMountRoot');
        if (hostPane && hostPane.isConnected && !document.getElementById('webBrowserView')?.classList?.contains('hidden')) return;
      }
    } catch (_embedKeyErr) {}
    try {
      var hostCfg = window.Tanko && window.Tanko.browserHost && typeof window.Tanko.browserHost.getConfig === 'function'
        ? window.Tanko.browserHost.getConfig() : null;
      if (hostCfg && hostCfg.enabled && hostCfg.adapter === 'aspect-embed') {
        var hostPane = document.getElementById('aspectEmbedMountRoot');
        if (hostPane && !hostPane.classList.contains('hidden')) return;
      }
    } catch (_embedKeyErr) {}
    // Only handle when browser view is visible or web mode is active
    if (!state.browserOpen && !isWebModeActive()) return;

    var ctrl = e.ctrlKey || e.metaKey;
    var shift = e.shiftKey;
    var key = e.key;

    // Ctrl+T — new tab
    if (ctrl && !shift && key === 't') {
      e.preventDefault();
      openNewTab();
      return;
    }

    // Ctrl+W — close tab
    if (ctrl && !shift && key === 'w') {
      e.preventDefault();
      if (state.browserOpen && tabsState.closeTab) {
        var activeTab = tabsState.getActiveTab ? tabsState.getActiveTab() : null;
        if (activeTab) {
          tabsState.closeTab(activeTab.id);
          if (!state.tabs.length) closeBrowser();
        } else {
          closeBrowser();
        }
      }
      return;
    }

    // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs
    if (ctrl && key === 'Tab') {
      e.preventDefault();
      if (tabsState.cycleTab) tabsState.cycleTab(shift ? -1 : 1);
      return;
    }

    // Ctrl+L — focus URL bar
    if (ctrl && !shift && key === 'l') {
      e.preventDefault();
      if (el.urlBar && state.browserOpen) { el.urlBar.focus(); el.urlBar.select(); }
      return;
    }

    // Ctrl+F — find in page
    if (ctrl && !shift && key === 'f') {
      e.preventDefault();
      if (state.browserOpen && find.openFind) find.openFind();
      return;
    }

    // Ctrl+D — bookmark
    if (ctrl && !shift && key === 'd') {
      e.preventDefault();
      if (state.browserOpen && panels.toggleBookmark) panels.toggleBookmark();
      return;
    }

    // Ctrl+H — history
    if (ctrl && !shift && key === 'h') {
      e.preventDefault();
      if (state.browserOpen && panels.showHistoryPanel) panels.showHistoryPanel();
      return;
    }

    // Ctrl+J — downloads
    if (ctrl && !shift && key === 'j') {
      e.preventDefault();
      if (state.browserOpen && downloads.showDownloadsPanel) downloads.showDownloadsPanel();
      return;
    }

    // Ctrl+B — bookmarks
    if (ctrl && !shift && key === 'b') {
      e.preventDefault();
      if (state.browserOpen && panels.showBookmarksPanel) panels.showBookmarksPanel();
      return;
    }

    // Ctrl+R — reload
    if (ctrl && !shift && key === 'r') {
      e.preventDefault();
      if (state.browserOpen) {
        var wv = tabsState.getActiveWebview ? tabsState.getActiveWebview() : null;
        if (wv && typeof wv.reload === 'function') wv.reload();
      }
      return;
    }

    // Ctrl+P — print as PDF
    if (ctrl && !shift && key === 'p') {
      e.preventDefault();
      if (state.browserOpen && api.webBrowserActions && api.webBrowserActions.printPdf) {
        var tab = tabsState.getActiveTab ? tabsState.getActiveTab() : null;
        if (tab) api.webBrowserActions.printPdf({ tabId: tab.id });
      }
      return;
    }

    // Ctrl+Shift+S — screenshot
    if (ctrl && shift && key === 'S') {
      e.preventDefault();
      if (state.browserOpen && api.webBrowserActions && api.webBrowserActions.capturePage) {
        var capTab = tabsState.getActiveTab ? tabsState.getActiveTab() : null;
        if (capTab) api.webBrowserActions.capturePage({ tabId: capTab.id });
      }
      return;
    }

    // Ctrl+Shift+T — toggle Tor
    if (ctrl && shift && key === 'T') {
      e.preventDefault();
      if (panels.toggleTor) panels.toggleTor();
      return;
    }

    // Ctrl+Shift+Z — reopen closed tab
    if (ctrl && shift && key === 'Z') {
      e.preventDefault();
      if (tabsState.reopenClosedTab) tabsState.reopenClosedTab();
      return;
    }

    // Ctrl+Plus/Minus/0 — zoom
    if (ctrl && (key === '+' || key === '=')) {
      e.preventDefault();
      if (tabsState.zoomIn) tabsState.zoomIn();
      return;
    }
    if (ctrl && key === '-') {
      e.preventDefault();
      if (tabsState.zoomOut) tabsState.zoomOut();
      return;
    }
    if (ctrl && key === '0') {
      e.preventDefault();
      if (tabsState.zoomReset) tabsState.zoomReset();
      return;
    }

    // Ctrl+Shift+I — DevTools
    if (ctrl && shift && key === 'I') {
      e.preventDefault();
      if (tabsState.toggleDevTools) tabsState.toggleDevTools();
      return;
    }

    // Escape — close panels/find/overlay
    if (key === 'Escape') {
      if (state.findBarOpen && find.closeFind) { find.closeFind(); e.preventDefault(); return; }
      if (state.menuOpen || state.downloadsOpen || state.historyOpen || state.bookmarksOpen) {
        if (panels.hideAllPanels) panels.hideAllPanels();
        e.preventDefault();
        return;
      }
    }

    // Alt+Left/Right — navigate
    if (e.altKey && key === 'ArrowLeft') {
      e.preventDefault();
      var bwv = tabsState.getActiveWebview ? tabsState.getActiveWebview() : null;
      if (bwv && typeof bwv.goBack === 'function') bwv.goBack();
      return;
    }
    if (e.altKey && key === 'ArrowRight') {
      e.preventDefault();
      var fwv = tabsState.getActiveWebview ? tabsState.getActiveWebview() : null;
      if (fwv && typeof fwv.goForward === 'function') fwv.goForward();
      return;
    }
  }

  // ── UI binding ──

  function bindUI() {
    function setWebviewPointerDisabled(disabled) {
      if (!el.webviewContainer) return;
      el.webviewContainer.classList.toggle('wb-pointer-disabled', !!disabled);
    }

    function syncChromePointerShield(target, pointY) {
      if (!state.browserOpen) {
        setWebviewPointerDisabled(false);
        return;
      }
      var t = target || document.activeElement;
      var inChromeByDom = !!(t && t.closest && t.closest(
        '#web-tab-bar, #web-toolbar, #web-bookmark-bar, #web-menu-panel, #web-context-menu, #web-downloads-panel, #web-history-panel, #web-bookmarks-panel'
      ));
      var inChromeByGeometry = false;
      if (typeof pointY === 'number' && el.contentArea) {
        try {
          var top = el.contentArea.getBoundingClientRect().top;
          inChromeByGeometry = pointY < top;
        } catch (e) {}
      }
      setWebviewPointerDisabled(inChromeByDom || inChromeByGeometry);
    }

    document.addEventListener('mousemove', function (e) { syncChromePointerShield(e.target, e.clientY); });
    document.addEventListener('mousedown', function (e) { syncChromePointerShield(e.target, e.clientY); }, true);

    // Library back button
    if (el.libraryBack) {
      el.libraryBack.addEventListener('click', function () { closeBrowser(); });
    }

    // Window controls
    if (el.winMin) el.winMin.addEventListener('click', function () { if (api.window && api.window.minimize) api.window.minimize(); });
    if (el.winMax) el.winMax.addEventListener('click', function () { if (api.window && api.window.toggleMaximize) api.window.toggleMaximize(); });
    if (el.winClose) el.winClose.addEventListener('click', function () { closeBrowser(); });

    // New tab button
    if (el.btnNewTab) {
      el.btnNewTab.addEventListener('click', function () { openNewTab(); });
    }

    // Home panel source click delegation
    if (el.homeGrid) {
      el.homeGrid.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-source-id]');
        if (!btn) return;
        var source = getSourceById(btn.getAttribute('data-source-id'));
        if (source) openBrowser(source);
      });
    }

    if (el.homeSearchForm) {
      el.homeSearchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        submitHomeSearch(el.homeSearchInput ? el.homeSearchInput.value : '');
      });
    }
    if (el.homeSearchInput) {
      el.homeSearchInput.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        submitHomeSearch(el.homeSearchInput.value);
      });
    }

    // Sources-first UI
    if (el.sourcesSearchBtn) {
      el.sourcesSearchBtn.addEventListener('click', function () { runSourcesSearch(); });
    }
    if (el.sourcesSearchInput) {
      el.sourcesSearchInput.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        runSourcesSearch({ append: false });
      });
    }
    if (el.sourcesSearchSource) {
      el.sourcesSearchSource.addEventListener('change', function () {
        if (el.sourcesSearchType) el.sourcesSearchType.value = 'all';
        if ((el.sourcesSearchInput && el.sourcesSearchInput.value || '').trim()) runSourcesSearch({ append: false });
      });
    }
    if (el.sourcesSearchType) {
      el.sourcesSearchType.addEventListener('change', function () {
        applySourcesSearchView();
        updateSourcesSearchStatusTail();
      });
    }
    if (el.sourcesSearchSort) {
      el.sourcesSearchSort.addEventListener('change', function () {
        applySourcesSearchView();
        updateSourcesSearchStatusTail();
      });
    }
    if (el.sourcesSearchTableWrap) {
      el.sourcesSearchTableWrap.addEventListener('scroll', function () {
        maybeLoadMoreSourcesSearch();
      });
    }
    if (el.sourcesSearchBody) {
      el.sourcesSearchBody.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-magnet-id]') : null;
        if (!btn) return;
        var id = btn.getAttribute('data-magnet-id');
        var row = null;
        for (var i = 0; i < state.searchResults.length; i++) {
          if (String(state.searchResults[i] && state.searchResults[i].id) === String(id)) { row = state.searchResults[i]; break; }
        }
        if (row) openSaveFlow(row);
      });
    }
    if (el.sourcesSearchTabBtn) {
      el.sourcesSearchTabBtn.addEventListener('click', function () { setSourcesSubMode('search'); });
    }
    if (el.sourcesDownloadsTabBtn) {
      el.sourcesDownloadsTabBtn.addEventListener('click', function () { setSourcesSubMode('downloads'); });
    }
    if (el.sourcesSaveCancel) el.sourcesSaveCancel.addEventListener('click', closeSaveFlow);
    if (el.sourcesSaveBack) el.sourcesSaveBack.addEventListener('click', closeSaveFlow);
    if (el.sourcesSaveStart) el.sourcesSaveStart.addEventListener('click', startConfiguredDownload);
    if (el.sourcesSaveStream) el.sourcesSaveStream.addEventListener('click', startStreamableVideoFolder);
    if (el.sourcesSaveCategory) el.sourcesSaveCategory.addEventListener('change', refreshSaveFlowInputs);
    if (el.sourcesSaveDestMode) el.sourcesSaveDestMode.addEventListener('change', refreshSaveFlowInputs);
    if (el.sourcesSaveExistingFolder) el.sourcesSaveExistingFolder.addEventListener('change', updateSavePathPreview);
    if (el.sourcesSaveNewFolder) el.sourcesSaveNewFolder.addEventListener('input', updateSavePathPreview);
    if (el.sourcesSaveSelectAll) {
      el.sourcesSaveSelectAll.addEventListener('click', function () {
        for (var i = 0; i < state.pendingResolveFiles.length; i++) state.pendingFileSelection[i] = true;
        renderSaveFlowFiles();
      });
    }
    if (el.sourcesSaveDeselectAll) {
      el.sourcesSaveDeselectAll.addEventListener('click', function () {
        for (var i = 0; i < state.pendingResolveFiles.length; i++) state.pendingFileSelection[i] = false;
        renderSaveFlowFiles();
      });
    }
    if (el.sourcesSaveFilesList) {
      el.sourcesSaveFilesList.addEventListener('change', function (e) {
        var cb = e.target && e.target.closest ? e.target.closest('.sourcesSaveFileCheck') : null;
        if (cb) {
          var idx = Number(cb.getAttribute('data-idx'));
          if (!isFinite(idx) || idx < 0) return;
          state.pendingFileSelection[idx] = !!cb.checked;
          return;
        }
        var pr = e.target && e.target.closest ? e.target.closest('.sourcesSaveFilePriority') : null;
        if (!pr) return;
        var pidx = Number(pr.getAttribute('data-priority-idx'));
        if (!isFinite(pidx) || pidx < 0) return;
        var value = String(pr.value || 'normal').toLowerCase();
        state.pendingFilePriorities[pidx] = (value === 'high' || value === 'low') ? value : 'normal';
      });
    }
    if (el.sourcesTorrentBody) {
      el.sourcesTorrentBody.addEventListener('contextmenu', function (e) {
        var row = e.target && e.target.closest ? e.target.closest('tr[data-source-torrent-id]') : null;
        if (!row) return;
        e.preventDefault();
        var id = row.getAttribute('data-source-torrent-id');
        if (!id) return;
        showSourcesTorrentContextMenu(e.clientX || 0, e.clientY || 0, id);
      });
    }
    if (el.sourcesUnhideBtn) {
      el.sourcesUnhideBtn.addEventListener('click', function () {
        state.hiddenSourceTorrentIds = {};
        saveHiddenSourcesTorrents();
        renderSourcesTorrentRows();
      });
    }

    // Home panel add source
    if (el.homeAddSource) {
      el.homeAddSource.addEventListener('click', function () { openAddSourceDialog(null); });
    }

    // Sidebar source click delegation
    if (el.sourcesList) {
      el.sourcesList.addEventListener('click', function (e) {
        var row = e.target.closest('[data-source-id]');
        if (!row) return;
        var source = getSourceById(row.getAttribute('data-source-id'));
        if (source) openBrowser(source);
      });
    }

    // Add source dialog
    if (el.addSourceBtn) el.addSourceBtn.addEventListener('click', function () { openAddSourceDialog(null); });
    if (el.addSourceClose) el.addSourceClose.addEventListener('click', closeAddSourceDialog);
    if (el.sourceSaveBtn) el.sourceSaveBtn.addEventListener('click', saveSource);

    // Settings hub source actions (delegation)
    if (el.hubSourcesList) {
      el.hubSourcesList.addEventListener('click', function (e) {
        var editBtn = e.target.closest('[data-settings-source-edit-id]');
        if (editBtn) {
          var src = getSourceById(editBtn.getAttribute('data-settings-source-edit-id'));
          if (src) openAddSourceDialog(src);
          return;
        }
        var removeBtn = e.target.closest('[data-settings-source-remove-id]');
        if (removeBtn) {
          removeSource(removeBtn.getAttribute('data-settings-source-remove-id'));
          return;
        }
        var openBtn = e.target.closest('[data-settings-source-id]');
        if (openBtn) {
          var s = getSourceById(openBtn.getAttribute('data-settings-source-id'));
          if (s) openBrowser(s);
        }
      });
    }

    // Hub settings changes
    if (el.hubStartupMode) el.hubStartupMode.addEventListener('change', function () {
      saveBrowserSettings({ startup: { mode: el.hubStartupMode.value, customUrl: state.browserSettings.startup.customUrl } });
    });
    if (el.hubStartupCustomUrl) el.hubStartupCustomUrl.addEventListener('change', function () {
      saveBrowserSettings({ startup: { mode: state.browserSettings.startup.mode, customUrl: el.hubStartupCustomUrl.value.trim() } });
    });
    if (el.hubHomeUrl) el.hubHomeUrl.addEventListener('change', function () {
      saveBrowserSettings({ home: { homeUrl: el.hubHomeUrl.value.trim(), newTabBehavior: state.browserSettings.home.newTabBehavior } });
    });
    if (el.hubNewTabBehavior) el.hubNewTabBehavior.addEventListener('change', function () {
      saveBrowserSettings({ home: { homeUrl: state.browserSettings.home.homeUrl, newTabBehavior: el.hubNewTabBehavior.value } });
    });
    if (el.hubDownloadBehavior) el.hubDownloadBehavior.addEventListener('change', function () {
      saveBrowserSettings({ downloads: { behavior: el.hubDownloadBehavior.value } });
    });
    if (el.hubDownloadFolderHint) el.hubDownloadFolderHint.addEventListener('change', function () {
      saveBrowserSettings({ downloads: { folderModeHint: el.hubDownloadFolderHint.checked } });
    });
    if (el.hubPrivacyDoNotTrack) el.hubPrivacyDoNotTrack.addEventListener('change', function () {
      saveBrowserSettings({ privacy: { doNotTrack: el.hubPrivacyDoNotTrack.checked } });
    });
    if (el.searchEngineSelect) el.searchEngineSelect.addEventListener('change', function () {
      var key = String(el.searchEngineSelect.value || 'yandex').trim().toLowerCase() || 'yandex';
      saveBrowserSettings({ defaultSearchEngine: key });
      if (navOmnibox.syncOmniPlaceholder) navOmnibox.syncOmniPlaceholder();
      renderBrowserHome();
    });
    var exitCheckboxes = [el.hubClearOnExitHistory, el.hubClearOnExitDownloads, el.hubClearOnExitCookies, el.hubClearOnExitCache];
    exitCheckboxes.forEach(function (cb) {
      if (!cb) return;
      cb.addEventListener('change', function () {
        saveBrowserSettings({
          privacy: {
            clearOnExit: {
              history: !!(el.hubClearOnExitHistory && el.hubClearOnExitHistory.checked),
              downloads: !!(el.hubClearOnExitDownloads && el.hubClearOnExitDownloads.checked),
              cookies: !!(el.hubClearOnExitCookies && el.hubClearOnExitCookies.checked),
              cache: !!(el.hubClearOnExitCache && el.hubClearOnExitCache.checked),
            }
          }
        });
      });
    });

    // Destination picker
    if (el.destPickerCancel) el.destPickerCancel.addEventListener('click', closeDestPicker);
    var srcOps = getWebSourcesOps();
    if (srcOps.onDestinationPickerRequest) {
      srcOps.onDestinationPickerRequest(handleDestPickerRequest);
    }

    // Home downloads clear
    if (el.homeDlClearBtn) {
      el.homeDlClearBtn.addEventListener('click', function () {
        state.downloads = state.downloads.filter(function (d) {
          return d && d.state !== 'completed' && d.state !== 'cancelled' && d.state !== 'failed';
        });
        renderHomeDownloads();
      });
    }

    // Continue browsing tile clicks are bound in renderContinue()

    // Menu panel action delegation
    if (el.menuPanel) {
      el.menuPanel.addEventListener('click', function (e) {
        var item = e.target.closest('[data-action]');
        if (!item) return;
        var action = item.getAttribute('data-action');
        if (panels.hideAllPanels) panels.hideAllPanels();
        switch (action) {
          case 'new-tab': openNewTab(); break;
          case 'downloads': if (downloads.showDownloadsPanel) downloads.showDownloadsPanel(); break;
          case 'history': if (panels.showHistoryPanel) panels.showHistoryPanel(); break;
          case 'bookmarks': if (panels.showBookmarksPanel) panels.showBookmarksPanel(); break;
          case 'print-pdf':
            if (api.webBrowserActions && api.webBrowserActions.printPdf) {
              var tab = tabsState.getActiveTab ? tabsState.getActiveTab() : null;
              if (tab) api.webBrowserActions.printPdf({ tabId: tab.id });
            }
            break;
          case 'screenshot':
            if (api.webBrowserActions && api.webBrowserActions.capturePage) {
              var capTab = tabsState.getActiveTab ? tabsState.getActiveTab() : null;
              if (capTab) api.webBrowserActions.capturePage({ tabId: capTab.id });
            }
            break;
        }
      });
    }

    // Menu overlay click → close panels
    if (el.menuOverlay) {
      el.menuOverlay.addEventListener('click', function () {
        if (panels.hideAllPanels) panels.hideAllPanels();
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyDown);

    // Module-specific event binding
    if (navOmnibox.initUrlBarEvents) navOmnibox.initUrlBarEvents();
    if (downloads.initDownloadEvents) downloads.initDownloadEvents();
    if (panels.initPanelEvents) panels.initPanelEvents();
    if (contextMenu.initContextMenuEvents) contextMenu.initContextMenuEvents();
    if (find.initFindEvents) find.initFindEvents();
    if (torrentTab.initTorrentTab) torrentTab.initTorrentTab();

    on('openMagnet', function (magnetUrl) {
      var m = String(magnetUrl || '').trim();
      if (!m || m.toLowerCase().indexOf('magnet:') !== 0) return;
      if (tabsState.openTorrentTab) tabsState.openTorrentTab(m);
    });

    // IPC: create-tab from main process (e.g. window.open interception)
    if (api.webBrowserActions && api.webBrowserActions.onCreateTab) {
      api.webBrowserActions.onCreateTab(function (data) {
        if (!data || !data.url) return;
        var popupUrl = String(data.url || '').trim();
        if (popupUrl.toLowerCase().indexOf('magnet:') === 0) {
          if (tabsState.openTorrentTab) tabsState.openTorrentTab(popupUrl);
          return;
        }
        if (tabsState.createTab) tabsState.createTab(null, data.url);
        if (!state.browserOpen) openBrowserForTab(state.activeTabId);
      });
    }

    // IPC: sources updated
    if (srcOps.onUpdated) {
      srcOps.onUpdated(function () { loadSources(); });
    }

    // IPC: torrent events
    var torrentOps = getTorrentOps();
    if (torrentOps.onStarted) torrentOps.onStarted(function () {
      if (hub.refreshTorrentState) hub.refreshTorrentState();
      refreshSourcesTorrents();
    });
    if (torrentOps.onMetadata) torrentOps.onMetadata(function () {
      if (hub.refreshTorrentState) hub.refreshTorrentState();
      refreshSourcesTorrents();
    });
    if (torrentOps.onProgress) torrentOps.onProgress(function () {
      if (hub.renderHubTorrentActive) hub.renderHubTorrentActive();
      refreshSourcesTorrents();
    });
    if (torrentOps.onCompleted) torrentOps.onCompleted(function (info) {
      if (hub.refreshTorrentState) hub.refreshTorrentState();
      refreshSourcesTorrents();
      var label = (info && info.name) ? String(info.name) : '';
      var stateName = String(info && info.state || '').toLowerCase();
      if (stateName === 'completed' || stateName === 'completed_with_errors') {
        showToast(label ? ('Torrent finished: ' + label) : 'Torrent finished');
      } else if (stateName === 'cancelled') {
        showToast(label ? ('Torrent cancelled: ' + label) : 'Torrent cancelled');
      } else if (stateName) {
        showToast(String(info && info.error || '') || 'Torrent failed');
      }
    });
    if (torrentOps.onMagnetDetected) torrentOps.onMagnetDetected(function (data) {
      var magnet = '';
      if (typeof data === 'string') magnet = String(data || '').trim();
      else magnet = String((data && (data.magnetUri || data.magnet)) || '').trim();
      if (!magnet) return;
      showToast('Magnet link detected');
      if (torrentTab.addSource) torrentTab.addSource(magnet);
      if (tabsState.openTorrentTab) tabsState.openTorrentTab(magnet);
    });

    // IPC: Tor status
    if (api.torProxy && api.torProxy.onStatusChanged) {
      api.torProxy.onStatusChanged(function (data) {
        state.torActive = !!(data && data.active);
        state.torConnecting = !!(data && data.connecting);
        if (panels.updateTorUI) panels.updateTorUI();
        if (data && data.crashed) showToast('Tor connection lost');
      });
    }

    // Hub settings event bindings (permissions, adblock, userscripts, data, etc.)
    bindHubSettingsEvents();
  }

  function bindHubSettingsEvents() {
    // Hub permissions
    if (el.hubPermSaveBtn) el.hubPermSaveBtn.addEventListener('click', function () {
      if (hub.savePermissionRuleFromHub) hub.savePermissionRuleFromHub();
    });

    // Hub adblock
    if (el.hubAdblockEnabled) el.hubAdblockEnabled.addEventListener('change', function () {
      if (!api.webAdblock || !api.webAdblock.setEnabled) return;
      api.webAdblock.setEnabled({ enabled: el.hubAdblockEnabled.checked }).then(function () {
        state.browserSettings.adblockEnabled = el.hubAdblockEnabled.checked;
        saveBrowserSettings({ adblockEnabled: el.hubAdblockEnabled.checked });
        if (hub.loadAdblockState) hub.loadAdblockState();
      }).catch(function () {});
    });
    if (el.hubAdblockUpdateBtn) el.hubAdblockUpdateBtn.addEventListener('click', function () {
      if (!api.webAdblock || !api.webAdblock.updateLists) return;
      showToast('Updating ad blocker lists...');
      api.webAdblock.updateLists().then(function () {
        showToast('Ad blocker lists updated');
        if (hub.loadAdblockState) hub.loadAdblockState();
      }).catch(function () { showToast('Failed to update lists'); });
    });
    if (el.hubAdblockStatsBtn) el.hubAdblockStatsBtn.addEventListener('click', function () {
      if (!api.webAdblock || !api.webAdblock.stats) return;
      api.webAdblock.stats().then(function (res) {
        if (res && res.ok) showToast('Blocked: ' + (res.blockedCount || 0) + ' requests');
      }).catch(function () {});
    });

    // Hub userscripts
    if (el.hubUserscriptsEnabled) el.hubUserscriptsEnabled.addEventListener('change', function () {
      if (!api.webUserscripts || !api.webUserscripts.setEnabled) return;
      api.webUserscripts.setEnabled({ enabled: el.hubUserscriptsEnabled.checked }).catch(function () {});
    });
    if (el.hubUserscriptSaveBtn) el.hubUserscriptSaveBtn.addEventListener('click', function () {
      if (!api.webUserscripts || !api.webUserscripts.upsert) return;
      var payload = {
        id: state.userscriptEditingId || undefined,
        title: (el.hubUserscriptTitle ? el.hubUserscriptTitle.value : '').trim(),
        match: (el.hubUserscriptMatch ? el.hubUserscriptMatch.value : '').trim(),
        runAt: el.hubUserscriptRunAt ? el.hubUserscriptRunAt.value : 'document_idle',
        code: el.hubUserscriptCode ? el.hubUserscriptCode.value : ''
      };
      if (!payload.title || !payload.match || !payload.code) {
        showToast('Title, match pattern, and code are required');
        return;
      }
      api.webUserscripts.upsert(payload).then(function (res) {
        if (!res || !res.ok) { showToast('Failed to save userscript'); return; }
        showToast('Userscript saved');
        state.userscriptEditingId = null;
        clearUserscriptForm();
        loadUserscripts();
      }).catch(function () { showToast('Failed to save userscript'); });
    });
    if (el.hubUserscriptClearBtn) el.hubUserscriptClearBtn.addEventListener('click', function () {
      state.userscriptEditingId = null;
      clearUserscriptForm();
    });

    // Hub data clear/usage
    if (el.hubDataClearBtn) el.hubDataClearBtn.addEventListener('click', function () {
      if (hub.clearSelectedBrowsingData) hub.clearSelectedBrowsingData();
    });
    if (el.hubDataUsageBtn) el.hubDataUsageBtn.addEventListener('click', function () {
      if (hub.loadDataUsage) hub.loadDataUsage();
    });

    // Hub browse history
    if (el.hubBrowseSearch) el.hubBrowseSearch.addEventListener('input', function () {
      state.browsingHistoryQuery = el.hubBrowseSearch.value;
      clearTimeout(state.browseSearchTimer);
      state.browseSearchTimer = setTimeout(function () {
        if (hub.loadBrowsingHistory) hub.loadBrowsingHistory();
      }, 300);
    });
    if (el.hubBrowseHistoryClearBtn) el.hubBrowseHistoryClearBtn.addEventListener('click', function () {
      if (!api.webHistory || !api.webHistory.clear) return;
      api.webHistory.clear({}).then(function () {
        state.browsingHistory = [];
        if (hub.renderHubBrowsingHistory) hub.renderHubBrowsingHistory();
        showToast('Browsing history cleared');
      }).catch(function () { showToast('Failed to clear history'); });
    });

    // Hub bookmark current tab
    if (el.hubBookmarkCurrentBtn) el.hubBookmarkCurrentBtn.addEventListener('click', function () {
      if (hub.toggleBookmarkForActiveTab) hub.toggleBookmarkForActiveTab();
    });

    // Userscripts list delegation
    if (el.hubUserscriptsList) {
      el.hubUserscriptsList.addEventListener('click', function (e) {
        var editBtn = e.target.closest('[data-userscript-edit-id]');
        if (editBtn) {
          var id = editBtn.getAttribute('data-userscript-edit-id');
          editUserscript(id);
          return;
        }
        var removeBtn = e.target.closest('[data-userscript-remove-id]');
        if (removeBtn) {
          var rid = removeBtn.getAttribute('data-userscript-remove-id');
          if (api.webUserscripts && api.webUserscripts.remove) {
            api.webUserscripts.remove({ id: rid }).then(function () {
              showToast('Userscript removed');
              loadUserscripts();
            }).catch(function () { showToast('Failed to remove'); });
          }
        }
      });
    }

    // Permissions list delegation
    if (el.hubPermissionsList) {
      el.hubPermissionsList.addEventListener('click', function (e) {
        var resetBtn = e.target.closest('[data-perm-remove-origin]');
        if (resetBtn && api.webPermissions && api.webPermissions.reset) {
          api.webPermissions.reset({
            origin: resetBtn.getAttribute('data-perm-remove-origin'),
            permission: resetBtn.getAttribute('data-perm-remove-type')
          }).then(function () {
            showToast('Permission reset');
            if (hub.loadPermissions) hub.loadPermissions();
          }).catch(function () { showToast('Failed to reset'); });
        }
      });
    }

    // Download history delegation
    if (el.hubDownloadHistoryList) {
      el.hubDownloadHistoryList.addEventListener('click', function (e) {
        var clearBtn = e.target.closest('[data-dl-history-clear]');
        var srcOps = getWebSourcesOps();
        if (clearBtn && srcOps.clearDownloadHistory) {
          srcOps.clearDownloadHistory().then(function () {
            showToast('Download history cleared');
            if (hub.renderHubDownloadHistory) hub.renderHubDownloadHistory();
          }).catch(function () {});
        }
      });
    }
    if (el.hubDownloadHistoryClearBtn) {
      el.hubDownloadHistoryClearBtn.addEventListener('click', function () {
        var srcOps = getWebSourcesOps();
        if (!srcOps.clearDownloadHistory) return;
        srcOps.clearDownloadHistory().then(function () {
          showToast('Download history cleared');
          if (hub.renderHubDownloadHistory) hub.renderHubDownloadHistory();
        }).catch(function () {});
      });
    }

    // Torrent hub controls
    if (el.hubTorrentPauseAllBtn) el.hubTorrentPauseAllBtn.addEventListener('click', function () {
      var torrentOps = getTorrentOps();
      if (torrentOps.pauseAll) torrentOps.pauseAll().then(function () {
        if (hub.refreshTorrentState) hub.refreshTorrentState();
      }).catch(function () {});
    });
    if (el.hubTorrentResumeAllBtn) el.hubTorrentResumeAllBtn.addEventListener('click', function () {
      var torrentOps = getTorrentOps();
      if (torrentOps.resumeAll) torrentOps.resumeAll().then(function () {
        if (hub.refreshTorrentState) hub.refreshTorrentState();
      }).catch(function () {});
    });
    if (el.hubTorrentCancelAllBtn) el.hubTorrentCancelAllBtn.addEventListener('click', function () {
      if (hub.applyTorrentBulkAction) hub.applyTorrentBulkAction('cancel');
    });
    if (el.hubMagnetStartBtn) el.hubMagnetStartBtn.addEventListener('click', function () {
      var magnetInput = el.hubMagnetInput ? el.hubMagnetInput.value.trim() : '';
      if (!magnetInput) { showToast('Paste a magnet link first'); return; }
      var sourcesOps = getSourcesOps();
      if (sourcesOps.startMagnet) {
        sourcesOps.startMagnet({ magnetUri: magnetInput }).then(function (res) {
          if (res && res.ok) {
            showToast('Torrent started');
            if (el.hubMagnetInput) el.hubMagnetInput.value = '';
            if (hub.refreshTorrentState) hub.refreshTorrentState();
          } else {
            showToast(String((res && res.error) || 'Failed to start torrent'));
          }
        }).catch(function () { showToast('Failed to start torrent'); });
      }
    });
    if (el.hubMagnetPasteBtn) el.hubMagnetPasteBtn.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function (text) {
          if (el.hubMagnetInput) el.hubMagnetInput.value = text;
        }).catch(function () {});
      }
    });
    if (el.hubTorrentFilter) el.hubTorrentFilter.addEventListener('change', function () {
      state.hubTorrentFilter = el.hubTorrentFilter.value;
      if (hub.renderHubTorrentActive) hub.renderHubTorrentActive();
    });
  }

  // ── Userscript helpers ──

  function clearUserscriptForm() {
    if (el.hubUserscriptTitle) el.hubUserscriptTitle.value = '';
    if (el.hubUserscriptMatch) el.hubUserscriptMatch.value = '';
    if (el.hubUserscriptCode) el.hubUserscriptCode.value = '';
    if (el.hubUserscriptRunAt) el.hubUserscriptRunAt.value = 'document_idle';
    if (el.hubUserscriptInfo) el.hubUserscriptInfo.textContent = 'Simple built-in userscripts for site fixes and custom behaviors. Use carefully.';
  }

  function loadUserscripts() {
    if (!api.webUserscripts || typeof api.webUserscripts.get !== 'function') return;
    api.webUserscripts.get().then(function (res) {
      if (!res || !res.ok) return;
      state.userscripts.enabled = res.enabled !== false;
      state.userscripts.rules = Array.isArray(res.rules) ? res.rules : [];
      if (el.hubUserscriptsEnabled) el.hubUserscriptsEnabled.checked = state.userscripts.enabled;
      renderUserscriptsList();
    }).catch(function () {});
  }

  function renderUserscriptsList() {
    if (!el.hubUserscriptsList || !el.hubUserscriptsEmpty) return;
    var rules = state.userscripts.rules;
    if (!rules.length) {
      el.hubUserscriptsList.innerHTML = '';
      el.hubUserscriptsEmpty.classList.remove('hidden');
      return;
    }
    el.hubUserscriptsEmpty.classList.add('hidden');
    var html = '';
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (!r) continue;
      html += '<div class="webHubItem">'
        + '<div class="webHubItemTop"><div class="webHubItemTitle">' + escapeHtml(r.title || 'Script') + '</div></div>'
        + '<div class="webHubItemSub">' + escapeHtml(r.match || '') + '</div>'
        + '<div class="webHubItemActions">'
          + '<button class="btn btn-ghost btn-sm" data-userscript-edit-id="' + escapeHtml(String(r.id || '')) + '">Edit</button>'
          + '<button class="btn btn-ghost btn-sm" data-userscript-remove-id="' + escapeHtml(String(r.id || '')) + '">Remove</button>'
        + '</div>'
      + '</div>';
    }
    el.hubUserscriptsList.innerHTML = html;
  }

  function editUserscript(id) {
    var rule = null;
    for (var i = 0; i < state.userscripts.rules.length; i++) {
      if (state.userscripts.rules[i] && String(state.userscripts.rules[i].id) === String(id)) {
        rule = state.userscripts.rules[i];
        break;
      }
    }
    if (!rule) return;
    state.userscriptEditingId = rule.id;
    if (el.hubUserscriptTitle) el.hubUserscriptTitle.value = rule.title || '';
    if (el.hubUserscriptMatch) el.hubUserscriptMatch.value = rule.match || '';
    if (el.hubUserscriptCode) el.hubUserscriptCode.value = rule.code || '';
    if (el.hubUserscriptRunAt) el.hubUserscriptRunAt.value = rule.runAt || 'document_idle';
    if (el.hubUserscriptInfo) el.hubUserscriptInfo.textContent = 'Editing: ' + (rule.title || 'Script');
  }

  // ── Download sidebar indicator ──

  function syncDownloadIndicator() {
    var activeCount = 0;
    for (var i = 0; i < state.downloads.length; i++) {
      var d = state.downloads[i];
      if (d && (d.state === 'started' || d.state === 'progressing')) activeCount++;
    }
    if (el.downloadStatus) {
      el.downloadStatus.textContent = activeCount ? (activeCount + ' active download' + (activeCount > 1 ? 's' : '')) : 'No active downloads';
    }
    if (el.sidebarDlRow) el.sidebarDlRow.classList.toggle('hidden', !activeCount);
  }

  // ── Init sequence ──

  try {
    bindUI();
  } catch (e) {
    console.warn('[web.js] bindUI failed', e);
  }
  loadHiddenSourcesTorrents();
  renderSearchSourceOptions();
  renderSearchTypeOptions();
  renderSourcesSearchRows();
  setSourcesSubMode('search');

  loadBrowserSettings().then(function () {
    loadSourcesSearchIndexers();
    if (tabsState.loadSessionAndRestore) tabsState.loadSessionAndRestore();
  }).catch(function () {
    loadSourcesSearchIndexers();
    if (tabsState.loadSessionAndRestore) tabsState.loadSessionAndRestore();
  });

  loadSources();
  loadDestinations();
  refreshSourcesTorrents();
  if (hub.loadBrowsingHistory) hub.loadBrowsingHistory();
  if (hub.loadBookmarks) hub.loadBookmarks();
  if (hub.loadPermissions) hub.loadPermissions();
  if (hub.loadAdblockState) hub.loadAdblockState();
  if (hub.loadDataUsage) hub.loadDataUsage();
  if (hub.refreshTorrentState) hub.refreshTorrentState();
  loadUserscripts();

  // Query initial Tor status
  if (api.torProxy && api.torProxy.getStatus) {
    api.torProxy.getStatus().then(function (res) {
      state.torActive = !!(res && res.active);
      if (panels.updateTorUI) panels.updateTorUI();
    }).catch(function () {});
  }

  syncDownloadIndicator();
  renderHomeDownloads();
  renderBrowserHome();
  if (panels.renderBookmarkBar) panels.renderBookmarkBar();
  if (hub.updateBookmarkButton) hub.updateBookmarkButton();
  if (hub.renderHubAll) hub.renderHubAll();
  if (hub.renderPermissions) hub.renderPermissions();
  if (hub.renderAdblockInfo) hub.renderAdblockInfo();
  if (hub.renderHubBookmarks) hub.renderHubBookmarks();

  // Auto-refresh bookmark bar when bookmarks change from any source
  if (api.webBookmarks && api.webBookmarks.onUpdated) {
    api.webBookmarks.onUpdated(function () {
      if (panels.renderBookmarkBar) panels.renderBookmarkBar();
    });
  }

  // ── Public API ──

  var openDefaultBrowserEntry = standalone.openDefaultBrowserEntry || function () {
    if (state.tabs.length) {
      var targetId = state.activeTabId != null ? state.activeTabId : state.tabs[0].id;
      openBrowserForTab(targetId);
    } else {
      openNewTab();
    }
  };
  var openTorrentWorkspace = standalone.openTorrentWorkspace || function () {
    openDefaultBrowserEntry();
    if (tabsState.openTorrentTab) tabsState.openTorrentTab();
  };

  function ensureSourcesModeActive() {
    var router = null;
    try {
      router = window.Tanko && window.Tanko.modeRouter;
      if (!router || typeof router.setMode !== 'function') return Promise.resolve();
      if (typeof router.getMode === 'function' && router.getMode() === 'sources') return Promise.resolve();
      return Promise.resolve(router.setMode('sources', { force: true })).catch(function () {});
    } catch (_e) {
      return Promise.resolve();
    }
  }

  function applySourcesWorkspace(mode) {
    state.browserOpen = false;
    state.showBrowserHome = false;
    if (el.browserView) el.browserView.classList.add('hidden');
    if (panels.hideAllPanels) panels.hideAllPanels();
    if (contextMenu.hideContextMenu) contextMenu.hideContextMenu();
    if (find.closeFind) find.closeFind();
    if (navOmnibox.hideOmniDropdown) navOmnibox.hideOmniDropdown();
    forceSourcesViewVisible();
    setSourcesSubMode(mode === 'downloads' ? 'downloads' : 'search');
  }

  function openSources() {
    ensureSourcesModeActive().then(function () {
      applySourcesWorkspace('search');
      loadSourcesSearchIndexers();
      refreshSourcesTorrents();
    });
  }

  function openSourcesSearch() {
    openSources();
    setSourcesSubMode('search');
  }

  function openSourcesDownloads() {
    openSourcesSearch();
  }

  function openSaveFlowForResult(result) {
    if (!result || typeof result !== 'object') return;
    openSaveFlow(result);
  }

  window.Tanko = window.Tanko || {};
  try {
    if (window.Tanko.modeRouter && typeof window.Tanko.modeRouter.registerModeHandler === 'function') {
      window.Tanko.modeRouter.registerModeHandler('sources', {
        setMode: function () {
          if (el.webLibraryView) el.webLibraryView.classList.remove('hidden');
          return Promise.resolve();
        },
        refresh: function () {
          if (state.sourcesSubMode === 'downloads' && hub.refreshTorrentState) hub.refreshTorrentState();
          return Promise.resolve();
        },
        back: function () {
          if (state.browserOpen) {
            closeBrowser();
            return Promise.resolve();
          }
          return Promise.resolve();
        }
      });
    }
  } catch (_routerErr) {}
  window.Tanko.web = {
    openBrowser: openBrowser,
    openHome: openHome,
    openDefault: openDefaultBrowserEntry,
    openHubSection: function () {},
    openTorrentWorkspace: openTorrentWorkspace,
    isBrowserOpen: function () { return !!state.browserOpen; },
    openAddSourceDialog: function () { openAddSourceDialog(null); }
  };
  window.Tanko.sources = {
    openSources: openSources,
    openSearch: openSourcesSearch,
    openDownloads: openSourcesDownloads,
    search: function (query, filter) {
      if (el.sourcesSearchInput) el.sourcesSearchInput.value = String(query || '');
      if (el.sourcesSearchType && filter) el.sourcesSearchType.value = String(filter || 'all').toLowerCase();
      setSourcesSubMode('search');
      runSourcesSearch({ append: false });
    },
    openSaveFlow: openSaveFlowForResult,
    startConfiguredDownload: startConfiguredDownload
  };

  } catch (webInitErr) {
    console.error('[web.js] FATAL init error:', webInitErr);
  }

})();
