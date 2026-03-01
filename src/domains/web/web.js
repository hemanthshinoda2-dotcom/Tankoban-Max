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

  // ── Butterfly (Qt) detection ──
  var isButterfly = !!(window.__tankoButterfly);

  function getTabByBridgeId(bridgeId) {
    if (!bridgeId) return null;
    for (var i = 0; i < state.sourcesTabs.length; i++) {
      if (state.sourcesTabs[i] && state.sourcesTabs[i]._bridgeTabId === bridgeId) return state.sourcesTabs[i];
    }
    return null;
  }

  // ── DOM element cache ──

  function qs(id) {
    try { return document.getElementById(id); } catch (e) { return null; }
  }

  var el = {
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
    torrentProvidersBtn: qs('webTorrentProvidersBtn'),
    utilityTorrentProvidersBtn: qs('webUtilityTorrentProvidersBtn'),
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
    torrentProvidersOverlay: qs('webTorrentProvidersOverlay'),
    torrentProvidersClose: qs('webTorrentProvidersClose'),
    torrentProvidersSave: qs('webTorrentProvidersSave'),
    torrentProviderSelect: qs('webTorrentProviderSelect'),
    jackettBaseUrl: qs('webJackettBaseUrl'),
    jackettApiKey: qs('webJackettApiKey'),
    prowlarrBaseUrl: qs('webProwlarrBaseUrl'),
    prowlarrApiKey: qs('webProwlarrApiKey'),
    providerOpenJackettUiBtn: qs('webProviderOpenJackettUiBtn'),
    providerOpenProwlarrUiBtn: qs('webProviderOpenProwlarrUiBtn'),

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
    sourcesSearchPanel: qs('sourcesSearchPanel'),
    sourcesTorrentPanel: qs('sourcesTorrentPanel'),
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
    sourcesBrowserPanel: qs('sourcesBrowserPanel'),
    sourcesBrowserTopBar: qs('sourcesBrowserTopBar'),
    sourcesBrowserBackBtn: qs('sourcesBrowserBackBtn'),
    sourcesBrowserForwardBtn: qs('sourcesBrowserForwardBtn'),
    sourcesBrowserReloadBtn: qs('sourcesBrowserReloadBtn'),
    sourcesBrowserHomeBtn: qs('sourcesBrowserHomeBtn'),
    sourcesBrowserOmniHost: qs('sourcesBrowserOmniHost'),
    sourcesBrowserOmniChip: qs('sourcesBrowserOmniChip'),
    sourcesBrowserUrlInput: qs('sourcesBrowserUrlInput'),
    sourcesBrowserOmniWrap: qs('sourcesBrowserOmniWrap'),
    sourcesBrowserOmniDropdown: qs('sourcesBrowserOmniDropdown'),
    sourcesBrowserGoBtn: qs('sourcesBrowserGoBtn'),
    sourcesBrowserBookmarkBtn: qs('sourcesBrowserBookmarkBtn'),
    sourcesBrowserBookmarksBtn: qs('sourcesBrowserBookmarksBtn'),
    sourcesBrowserHistoryBtn: qs('sourcesBrowserHistoryBtn'),
    sourcesBrowserDownloadsBtn: qs('sourcesBrowserDownloadsBtn'),
    sourcesBrowserStatus: qs('sourcesBrowserStatus'),
    sourcesBrowserTabList: qs('sourcesBrowserTabList'),
    sourcesBrowserNewTabBtn: qs('sourcesBrowserNewTabBtn'),
    sourcesBrowserWebview: qs('sourcesBrowserWebview'),
    sourcesBrowserCtxOverlay: qs('sourcesBrowserCtxOverlay'),
    sourcesBrowserCtxMenu: qs('sourcesBrowserCtxMenu'),
    sourcesBrowserDrawerOverlay: qs('sourcesBrowserDrawerOverlay'),
    sourcesBrowserDrawer: qs('sourcesBrowserDrawer'),
    sourcesBrowserDrawerTitle: qs('sourcesBrowserDrawerTitle'),
    sourcesBrowserDrawerCloseBtn: qs('sourcesBrowserDrawerCloseBtn'),
    sourcesBrowserHistoryOverlay: qs('sourcesBrowserHistoryOverlay'),
    sourcesBrowserBookmarksPanel: qs('sourcesBrowserBookmarksPanel'),
    sourcesBrowserDownloadsPanel: qs('sourcesBrowserDownloadsPanel'),
    sourcesBrowserHistoryClearBtn: qs('sourcesBrowserHistoryClearBtn'),
    sourcesBrowserHistorySearchInput: qs('sourcesBrowserHistorySearchInput'),
    sourcesBrowserHistoryList: qs('sourcesBrowserHistoryList'),
    sourcesBrowserHistoryEmpty: qs('sourcesBrowserHistoryEmpty'),
    sourcesBrowserBookmarksList: qs('sourcesBrowserBookmarksList'),
    sourcesBrowserBookmarksEmpty: qs('sourcesBrowserBookmarksEmpty'),
    sourcesBrowserHome: qs('sourcesBrowserHome'),
    sourcesBrowserHomeSearchForm: qs('sourcesBrowserHomeSearchForm'),
    sourcesBrowserHomeSearchInput: qs('sourcesBrowserHomeSearchInput'),
    sourcesBrowserHomeSearchBtn: qs('sourcesBrowserHomeSearchBtn'),
    sourcesBrowserHomeEngine: qs('sourcesBrowserHomeEngine'),
    sourcesBrowserHomeShortcuts: qs('sourcesBrowserHomeShortcuts'),
    sourcesBrowserHomeShortcutsEmpty: qs('sourcesBrowserHomeShortcutsEmpty'),
    sourcesBrowserHomeRecentTabs: qs('sourcesBrowserHomeRecentTabs'),
    sourcesBrowserHomeRecentTabsEmpty: qs('sourcesBrowserHomeRecentTabsEmpty'),
    sourcesBrowserHomeEmbeddedRoot: qs('sourcesBrowserHomeEmbeddedRoot'),
    sourcesBrowserHomeDownloadsBody: qs('sourcesBrowserHomeDownloadsBody'),
    sourcesBrowserHomeDownloadsClearBtn: qs('sourcesBrowserHomeDownloadsClearBtn'),
    sourcesBrowserTabSearchOverlay: qs('sourcesBrowserTabSearchOverlay'),
    sourcesBrowserTabSearchCloseBtn: qs('sourcesBrowserTabSearchCloseBtn'),
    sourcesBrowserTabSearchInput: qs('sourcesBrowserTabSearchInput'),
    sourcesBrowserTabSearchList: qs('sourcesBrowserTabSearchList'),
    sourcesBrowserTabSearchEmpty: qs('sourcesBrowserTabSearchEmpty'),
    sourcesBrowserDownloadsBody: qs('sourcesBrowserDownloadsBody'),
    sourcesBrowserDownloadsClearBtn: qs('sourcesBrowserDownloadsClearBtn'),

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
  var SOURCES_MAX_TABS = 20;
  var SOURCES_MAX_CLOSED_TABS = 20;
  var SOURCES_OMNI_MAX = 8;

  var state = {
    sources: [],
    tabs: [],
    activeTabId: null,
    nextTabId: 1,
    downloading: 0,
    downloadingHasProgress: false,
    lastDownloadName: '',
    lastDownloadProgress: null,
    downloads: {},
    dlPanelOpen: false,
    dlBarDismissed: false,
    dlBarTimer: null,
    browserOpen: false,
    editSourceId: null,
    toastTimer: null,
    ctxOpen: false,
    showBrowserHome: false,
    browserSettings: {
      defaultSearchEngine: 'google',
      parityV1Enabled: true,
      adblockEnabled: true,
      restoreLastSession: true,
      startup: { mode: 'continue', customUrl: '' },
      home: { homeUrl: '', newTabBehavior: 'tankoban_home' },
      downloads: { behavior: 'ask', folderModeHint: true },
      sourcesMinimalTorrentV1: false,
      sourcesLastDestinationByCategory: { comics: '', books: '', videos: '' },
      sourcesBrowser: { expandedByDefault: true, lastUrl: '', chromeDensity: 'single_row_v1', omniboxMode: 'collapsed_chip' },
      privacy: { doNotTrack: false, clearOnExit: { history: false, downloads: false, cookies: false, cache: false } }
      ,
      jackett: { baseUrl: '', apiKey: '', indexer: 'all', timeoutMs: 30000, indexersByCategory: { all: 'all', comics: 'all', books: 'all', tv: 'all' } },
      prowlarr: { baseUrl: '', apiKey: '', indexer: 'all', timeoutMs: 30000, indexersByCategory: { all: 'all', comics: 'all', books: 'all', tv: 'all' } },
      torrentSearch: { provider: 'jackett' }
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
    sourcesBrowserBound: false,
    sourcesBrowserLoading: false,
    sourcesBrowserUrl: '',
    sourcesBrowserBookmarked: false,
    sourcesBrowserLayoutRaf: 0,
    sourcesBrowserRenderRecovered: false,
    sourcesBrowserRenderWatchdogTimer: 0,
    sourcesBrowserRenderState: 'ok',
    sourcesBrowserOverlayLocked: false,
    sourcesBrowserLoadSettleTimer: 0,
    sourcesBrowserNavPollTimer: 0,
    sourcesBrowserLayoutSettleTimer: 0,
    sourcesBrowserNavToken: 0,
    sourcesBrowserRecoveryNavToken: -1,
    sourcesBrowserRecoveryStage: 0,
    sourcesBrowserRecoveryTimer: 0,
    sourcesBrowserLastHostWidth: 0,
    sourcesBrowserLastHostHeight: 0,
    sourcesBrowserResizeObserver: null,
    sourcesBrowserHistoryRows: [],
    sourcesBrowserHomeShortcuts: [],
    sourcesBrowserHomeReady: false,
    sourcesTabs: [],
    sourcesActiveTabId: null,
    sourcesClosedTabs: [],
    sourcesTabSeq: 1,
    sourcesHomeByTab: {},
    sourcesContextMenuMeta: null,
    sourcesHistoryWriteState: { ok: true, mode: 'add', url: '', at: 0, reason: '' },
    sourcesOmniResults: [],
    sourcesOmniSelectedIdx: -1,
    sourcesOmniOpen: false,
    sourcesOmniExpanded: false,
    sourcesOmniDebounceTimer: 0,
    sourcesOmniSuppressInputOnce: false,
    sourcesOmniReqSeq: 0,
    sourcesTabSearchOpen: false,
    sourcesTabSearchQuery: '',
    sourcesTabSearchSelectedIdx: -1,
    sourcesTabSearchMatches: [],
    sourcesBrowserDrawerKind: '',
    sourcesBridgeContextMenuBound: false,
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

  function permissionPromptLabel(permissionName) {
    var key = String(permissionName || '').trim().toLowerCase();
    if (key === 'geolocation') return 'location';
    if (key === 'media') return 'camera/microphone';
    if (key === 'notifications') return 'notifications';
    if (key === 'clipboard-read') return 'clipboard';
    if (key === 'display-capture') return 'screen capture';
    return key || 'this capability';
  }

  function runPermissionPromptQueue() {
    if (!api.webPermissions || typeof api.webPermissions.resolvePrompt !== 'function') return;
    if (state.permissionPromptActive) return;
    if (!Array.isArray(state.permissionPromptQueue) || !state.permissionPromptQueue.length) return;
    var prompt = state.permissionPromptQueue.shift();
    if (!prompt || !prompt.promptId) {
      runPermissionPromptQueue();
      return;
    }
    state.permissionPromptActive = prompt;
    setTimeout(function () {
      var origin = String(prompt.origin || '').trim();
      var permission = permissionPromptLabel(prompt.permission);
      var host = origin;
      try { host = new URL(origin).host || origin; } catch (_eHost) {}
      var allow = false;
      var remember = false;
      try {
        allow = !!window.confirm(host + ' wants access to ' + permission + '. Allow?');
        remember = !!window.confirm('Remember this decision for ' + host + '?');
      } catch (_ePrompt) {
        allow = false;
        remember = false;
      }
      api.webPermissions.resolvePrompt({
        promptId: String(prompt.promptId),
        decision: allow ? 'allow' : 'deny',
        remember: remember,
      }).catch(function () {
        showToast('Failed to resolve permission prompt');
      }).finally(function () {
        state.permissionPromptActive = null;
        runPermissionPromptQueue();
      });
    }, 0);
  }

  function enqueuePermissionPrompt(prompt) {
    if (!prompt || !prompt.promptId) return;
    if (!Array.isArray(state.permissionPromptQueue)) state.permissionPromptQueue = [];
    state.permissionPromptQueue.push(prompt);
    runPermissionPromptQueue();
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
      health: feat && typeof feat.health === 'function' ? feat.health : (api.torrentSearch && api.torrentSearch.health ? api.torrentSearch.health : null),
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

  function isSourcesModeActive() {
    var router = window.Tanko && window.Tanko.modeRouter;
    if (!router || typeof router.getMode !== 'function') return false;
    return String(router.getMode() || '').toLowerCase() === 'sources';
  }

  function getSourcesTabById(id) {
    var target = String(id || '').trim();
    if (!target) return null;
    for (var i = 0; i < state.sourcesTabs.length; i++) {
      var t = state.sourcesTabs[i];
      if (t && String(t.id) === target) return t;
    }
    return null;
  }

  function getSourcesActiveTab() {
    if (!state.sourcesActiveTabId) return null;
    return getSourcesTabById(state.sourcesActiveTabId);
  }

  function getSourcesBrowserWebview() {
    var active = getSourcesActiveTab();
    if (active && active.webview) return active.webview;
    return el.sourcesBrowserWebview || null;
  }

  function isAllowedSourcesHistoryUrl(url) {
    var raw = String(url || '').trim();
    if (!raw || raw === 'about:blank') return false;
    return !/^(data|chrome|devtools):/i.test(raw);
  }

  function getSourcesHistoryTitle(url, rawTitle) {
    var title = String(rawTitle || '').trim();
    if (title) return title;
    var site = siteNameFromUrl(url);
    if (site) return site;
    return String(url || '').trim();
  }

  function maybeRecordSourcesHistory(tab, url, reason) {
    if (!tab || !api.webHistory || typeof api.webHistory.add !== 'function') return;
    var target = String(url || '').trim();
    if (!isAllowedSourcesHistoryUrl(target)) {
      state.sourcesHistoryWriteState = { ok: false, mode: 'blocked', url: target, at: Date.now(), reason: String(reason || 'blocked') };
      return;
    }
    var now = Date.now();
    var mode = String(reason || '').trim().toLowerCase() === 'did-navigate' ? 'add' : 'upsert';
    if (mode === 'add') {
      if (tab.lastHistoryUrl === target && (now - Number(tab.lastHistoryAt || 0) < 3000)) {
        return;
      }
      tab.lastHistoryUrl = target;
      tab.lastHistoryAt = now;
    }
    var title = getSourcesHistoryTitle(target, tab.title);
    var favicon = String(tab.favicon || getFaviconUrl(target) || '').trim();
    var writer = mode === 'upsert' && typeof api.webHistory.upsert === 'function'
      ? api.webHistory.upsert({
          url: target,
          title: title || target,
          favicon: favicon,
          visitedAt: now,
          scope: 'sources_browser',
          dedupeWindowMs: 3000,
        })
      : api.webHistory.add({
          url: target,
          title: title || target,
          favicon: favicon,
          timestamp: now,
          scope: 'sources_browser',
        });
    writer.then(function () {
      state.sourcesHistoryWriteState = { ok: true, mode: mode, url: target, at: now, reason: String(reason || 'write') };
    }).catch(function () {
      state.sourcesHistoryWriteState = { ok: false, mode: 'error', url: target, at: now, reason: String(reason || 'write_failed') };
    });
  }

  function syncSourcesBrowserUrlInput() {
    if (!el.sourcesBrowserUrlInput) return;
    var active = getSourcesActiveTab();
    if (!active) return;
    if (document.activeElement !== el.sourcesBrowserUrlInput) {
      el.sourcesBrowserUrlInput.value = active.home ? '' : String(active.url || '');
    }
    syncSourcesOmniChipText();
  }

  function getSourcesOmniChipText() {
    var active = getSourcesActiveTab();
    if (!active) return 'Search or enter URL';
    if (active.home) return 'Search or enter URL';
    var raw = String(active.url || '').trim();
    if (!raw) return 'Search or enter URL';
    var site = siteNameFromUrl(raw);
    if (site) return site;
    return raw;
  }

  function syncSourcesOmniChipText() {
    if (!el.sourcesBrowserOmniChip) return;
    var text = getSourcesOmniChipText();
    el.sourcesBrowserOmniChip.textContent = text;
    el.sourcesBrowserOmniChip.title = text;
  }

  function setSourcesOmniExpanded(expanded, opts) {
    var options = (opts && typeof opts === 'object') ? opts : {};
    var open = !!expanded;
    state.sourcesOmniExpanded = open;
    if (el.sourcesBrowserOmniHost) el.sourcesBrowserOmniHost.classList.toggle('isExpanded', open);
    if (el.sourcesBrowserOmniChip) el.sourcesBrowserOmniChip.classList.toggle('hidden', open);
    if (el.sourcesBrowserOmniWrap) el.sourcesBrowserOmniWrap.classList.toggle('hidden', !open);
    if (!open) {
      closeSourcesOmniDropdown();
      syncSourcesOmniChipText();
      return;
    }
    var active = getSourcesActiveTab();
    if (el.sourcesBrowserUrlInput) {
      if (!options.keepValue) {
        if (active && active.home) el.sourcesBrowserUrlInput.value = '';
        else el.sourcesBrowserUrlInput.value = String(active && active.url || state.sourcesBrowserUrl || '');
      }
      setTimeout(function () {
        try { el.sourcesBrowserUrlInput.focus(); } catch (_eFocusOmni) {}
        if (options.select !== false && el.sourcesBrowserUrlInput && el.sourcesBrowserUrlInput.select) {
          try { el.sourcesBrowserUrlInput.select(); } catch (_eSelOmni) {}
        }
      }, 0);
    }
  }

  function ensureSourcesBrowserWebviewNode() {
    if (isButterfly) return null; // Qt manages views natively
    var viewport = null;
    var root = getSourcesBrowserWebview();
    if (root && root.parentElement) viewport = root.parentElement;
    if (!viewport && el.sourcesBrowserPanel) viewport = el.sourcesBrowserPanel.querySelector('.sourcesBrowserViewport');
    if (!viewport) return null;
    if (state.sourcesTabs.length === 0 && el.sourcesBrowserWebview) {
      var base = el.sourcesBrowserWebview;
      base.classList.add('sourcesBrowserWebviewTab');
      return base;
    }
    var wv = document.createElement('webview');
    wv.className = 'sourcesBrowserWebviewTab';
    wv.setAttribute('partition', 'persist:webmode');
    wv.setAttribute('allowpopups', '');
    wv.setAttribute('webpreferences', 'contextIsolation=yes');
    wv.src = 'about:blank';
    viewport.appendChild(wv);
    return wv;
  }

  function renderSourcesBrowserTabStrip() {
    if (isButterfly) return; // QTabBar in BrowserWidget manages tabs natively
    if (!el.sourcesBrowserTabList) return;
    var html = '';
    for (var i = 0; i < state.sourcesTabs.length; i++) {
      var tab = state.sourcesTabs[i];
      if (!tab) continue;
      var isAboutBlank = String(tab.url || '').trim().toLowerCase() === 'about:blank';
      var title = (tab.home || isAboutBlank)
        ? 'Home'
        : String(tab.title || siteNameFromUrl(tab.url) || tab.url || 'New Tab');
      html += '<div class="sourcesBrowserTab'
        + (String(tab.id) === String(state.sourcesActiveTabId) ? ' active' : '')
        + (tab.pinned ? ' pinned' : '')
        + '" data-sources-tab-id="' + escapeHtml(String(tab.id || '')) + '" title="' + escapeHtml(title) + '">'
        + '<span class="sourcesBrowserTabTitle">' + escapeHtml(title) + '</span>'
        + '<button class="sourcesBrowserTabClose" type="button" data-sources-tab-close="' + escapeHtml(String(tab.id || '')) + '" aria-label="Close tab">&times;</button>'
        + '</div>';
    }
    el.sourcesBrowserTabList.innerHTML = html;
  }

  function syncSourcesWebviewVisibility() {
    for (var i = 0; i < state.sourcesTabs.length; i++) {
      var tab = state.sourcesTabs[i];
      if (!tab || !tab.webview) continue;
      var active = String(tab.id) === String(state.sourcesActiveTabId) && !tab.home;
      tab.webview.classList.toggle('active', active);
      tab.webview.style.display = active ? 'flex' : 'none';
      tab.webview.style.pointerEvents = active ? 'auto' : 'none';
    }
  }

  function getSourcesSearchEngines() {
    var engines = (navOmnibox && navOmnibox.SEARCH_ENGINES && typeof navOmnibox.SEARCH_ENGINES === 'object')
      ? navOmnibox.SEARCH_ENGINES : { google: { label: 'Google' } };
    return engines;
  }

  function getSourcesHomeStateForTab(tab) {
    if (!tab || !tab.id) return null;
    if (!state.sourcesHomeByTab || typeof state.sourcesHomeByTab !== 'object') state.sourcesHomeByTab = {};
    var key = String(tab.id);
    if (!state.sourcesHomeByTab[key]) {
      state.sourcesHomeByTab[key] = {
        query: '',
        engine: String(state.browserSettings && state.browserSettings.defaultSearchEngine || 'google').trim().toLowerCase() || 'google',
      };
    }
    return state.sourcesHomeByTab[key];
  }

  function ensureSourcesHomeEngineOptions() {
    if (!el.sourcesBrowserHomeEngine || state.sourcesBrowserHomeReady) return;
    var engines = getSourcesSearchEngines();
    var keys = Object.keys(engines || {});
    if (!keys.length) keys = ['google'];
    var html = '';
    for (var i = 0; i < keys.length; i++) {
      var key = String(keys[i] || '').trim().toLowerCase();
      if (!key) continue;
      var meta = engines[key] || {};
      html += '<option value="' + escapeHtml(key) + '">' + escapeHtml(String(meta.label || key)) + '</option>';
    }
    el.sourcesBrowserHomeEngine.innerHTML = html;
    state.sourcesBrowserHomeReady = true;
  }

  function refreshSourcesBrowserHomeShortcuts() {
    var out = [];
    var seen = {};
    for (var i = 0; i < state.sources.length && out.length < 24; i++) {
      var src = state.sources[i] || {};
      var url = String(src.url || '').trim();
      if (!url || seen[url]) continue;
      seen[url] = 1;
      out.push({
        title: String(src.name || getSourcesHistoryTitle(url, '')).trim() || getSourcesHistoryTitle(url, ''),
        url: url,
      });
    }
    state.sourcesBrowserHomeShortcuts = out;
    renderSourcesBrowserHome();
    return Promise.resolve(out);
  }

  function mountSourcesBrowserHomePanels() {
    if (!el.sourcesBrowserHomeEmbeddedRoot) return;
    if (el.sourcesSearchPanel && el.sourcesSearchPanel.parentElement !== el.sourcesBrowserHomeEmbeddedRoot) {
      el.sourcesSearchPanel.classList.add('sourcesBrowserEmbeddedPanel');
      el.sourcesBrowserHomeEmbeddedRoot.appendChild(el.sourcesSearchPanel);
    }
    if (el.sourcesTorrentPanel && el.sourcesTorrentPanel.parentElement !== el.sourcesBrowserHomeEmbeddedRoot) {
      el.sourcesTorrentPanel.classList.add('sourcesBrowserEmbeddedPanel');
      el.sourcesBrowserHomeEmbeddedRoot.appendChild(el.sourcesTorrentPanel);
    }
  }

  function renderSourcesBrowserHome() {
    if (!el.sourcesBrowserHome) return;
    mountSourcesBrowserHomePanels();
    var active = getSourcesActiveTab();
    var show = !!(active && active.home);
    el.sourcesBrowserHome.classList.toggle('hidden', !show);
    if (!show) return;
    ensureSourcesHomeEngineOptions();
    var homeState = getSourcesHomeStateForTab(active) || { query: '', engine: 'google' };
    if (el.sourcesBrowserHomeEngine) {
      var engine = String(homeState.engine || state.browserSettings.defaultSearchEngine || 'google').trim().toLowerCase() || 'google';
      if (el.sourcesBrowserHomeEngine.value !== engine) el.sourcesBrowserHomeEngine.value = engine;
    }
    if (el.sourcesBrowserHomeSearchInput && document.activeElement !== el.sourcesBrowserHomeSearchInput) {
      el.sourcesBrowserHomeSearchInput.value = String(homeState.query || '');
    }

    if (el.sourcesBrowserHomeShortcuts) {
      var shortcuts = Array.isArray(state.sourcesBrowserHomeShortcuts) ? state.sourcesBrowserHomeShortcuts : [];
      var html = '';
      for (var i = 0; i < shortcuts.length; i++) {
        var sc = shortcuts[i] || {};
        var u = String(sc.url || '').trim();
        if (!u) continue;
        html += '<button class="sourcesBrowserHomeShortcut" type="button" data-sources-home-url="' + escapeHtml(u) + '">'
          + '<span class="sourcesBrowserHomeFaviconWrap"><img class="sourcesBrowserHomeFavicon" src="' + escapeHtml(getFaviconUrl(u)) + '" alt="" loading="lazy" onerror="this.style.display=\'none\';this.parentElement.classList.add(\'isFallback\')"></span>'
          + '<div class="sourcesBrowserHomeShortcutTitle">' + escapeHtml(getSourcesHistoryTitle(u, sc.title)) + '</div>'
          + '</button>';
      }
      el.sourcesBrowserHomeShortcuts.innerHTML = html;
      if (el.sourcesBrowserHomeShortcutsEmpty) el.sourcesBrowserHomeShortcutsEmpty.classList.toggle('hidden', !!html);
    }

    if (el.sourcesBrowserHomeRecentTabs) {
      var recent = '';
      for (var j = 0; j < state.sourcesTabs.length; j++) {
        var tab = state.sourcesTabs[j];
        if (!tab || String(tab.id) === String(active.id)) continue;
        var tabUrl = String(tab.url || '').trim();
        var tabTitle = String(tab.title || getSourcesHistoryTitle(tabUrl, '') || 'Tab');
        recent += '<button class="sourcesBrowserHomeRecentTab" type="button" data-sources-recent-tab-id="' + escapeHtml(String(tab.id || '')) + '">'
          + '<span class="sourcesBrowserHomeFaviconWrap"><img class="sourcesBrowserHomeFavicon" src="' + escapeHtml(getFaviconUrl(tabUrl || '')) + '" alt="" loading="lazy" onerror="this.style.display=\'none\';this.parentElement.classList.add(\'isFallback\')"></span>'
          + '<div class="sourcesBrowserHomeRecentTabTitle">' + escapeHtml(tab.home ? 'Home' : tabTitle) + '</div>'
          + '</button>';
        if (j >= 7) break;
      }
      el.sourcesBrowserHomeRecentTabs.innerHTML = recent;
      if (el.sourcesBrowserHomeRecentTabsEmpty) el.sourcesBrowserHomeRecentTabsEmpty.classList.toggle('hidden', !!recent);
    }
  }

  function reorderSourcesTabsAfterPin(tab) {
    if (!tab) return;
    var idx = state.sourcesTabs.indexOf(tab);
    if (idx === -1) return;
    state.sourcesTabs.splice(idx, 1);
    if (tab.pinned) {
      var insertAt = 0;
      while (insertAt < state.sourcesTabs.length && state.sourcesTabs[insertAt] && state.sourcesTabs[insertAt].pinned) insertAt++;
      state.sourcesTabs.splice(insertAt, 0, tab);
    } else {
      state.sourcesTabs.push(tab);
    }
  }

  function switchSourcesTab(tabId, opts) {
    var options = (opts && typeof opts === 'object') ? opts : {};
    var tab = getSourcesTabById(tabId);
    if (!tab) return null;
    state.sourcesActiveTabId = tab.id;
    state.sourcesBrowserUrl = tab.home ? '' : String(tab.url || '');
    state.sourcesBrowserLoading = !!tab.loading;
    closeSourcesOmniDropdown();
    if (isButterfly) {
      // Butterfly: tell Qt which tab overlay to show
      if (tab._bridgeTabId) {
        try { api.webTabManager.switchTab({ tabId: tab._bridgeTabId }); } catch (_eBSwitch) {}
      }
      // Tell Qt whether this is a home tab (hide overlay when home)
      if (tab._bridgeTabId) {
        try { api.webTabManager.setTabHome({ tabId: tab._bridgeTabId, home: !!tab.home }); } catch (_eBHome) {}
      }
    } else {
      syncSourcesWebviewVisibility();
    }
    renderSourcesBrowserTabStrip();
    renderSourcesBrowserHome();
    syncSourcesBrowserUrlInput();
    syncSourcesBrowserOmniPlaceholder();
    if (!options.keepOmni) setSourcesOmniExpanded(false, { keepValue: true, select: false });
    refreshSourcesBrowserNav();
    refreshSourcesBrowserBookmarkUi(tab.home ? '' : (tab.url || ''));
    scheduleSourcesBrowserViewportLayout();
    if (options.focus && !tab.home) {
      if (isButterfly) {
        // Focus is handled by Qt overlay — no webview DOM to focus
      } else if (tab.webview && typeof tab.webview.focus === 'function') {
        setTimeout(function () { try { tab.webview.focus(); } catch (_eFocus) {} }, 0);
      }
    }
    return tab;
  }

  function closeSourcesTab(tabId) {
    var tab = getSourcesTabById(tabId);
    if (!tab) return;
    var idx = state.sourcesTabs.indexOf(tab);
    if (idx === -1) return;
    state.sourcesTabs.splice(idx, 1);
    if (state.sourcesHomeByTab && tab && tab.id != null) {
      try { delete state.sourcesHomeByTab[String(tab.id)]; } catch (_eDelHome) {}
    }
    state.sourcesClosedTabs.unshift({
      url: String(tab.url || ''),
      title: String(tab.title || ''),
      pinned: !!tab.pinned,
      home: !!tab.home,
    });
    if (state.sourcesClosedTabs.length > SOURCES_MAX_CLOSED_TABS) state.sourcesClosedTabs.length = SOURCES_MAX_CLOSED_TABS;
    if (isButterfly) {
      // Butterfly: tell Qt to destroy the QWebEngineView
      if (tab._bridgeTabId) {
        try { api.webTabManager.closeTab({ tabId: tab._bridgeTabId }); } catch (_eBClose) {}
      }
    } else if (tab.webview && tab.webview.parentElement) {
      try {
        if (tab.webview === el.sourcesBrowserWebview) {
          tab.webview.src = 'about:blank';
          tab.webview.style.display = 'none';
        } else {
          tab.webview.parentElement.removeChild(tab.webview);
        }
      } catch (_eRemove) {}
    }
    if (!state.sourcesTabs.length) {
      openSourcesTab('', { switchTo: true, persist: false, home: true, focus: true });
      return;
    }
    var next = state.sourcesTabs[Math.max(0, idx - 1)] || state.sourcesTabs[0];
    switchSourcesTab(next && next.id, { focus: false });
  }

  function reopenSourcesClosedTab() {
    if (!state.sourcesClosedTabs.length) return;
    var snap = state.sourcesClosedTabs.shift();
    if (!snap) return;
    var hasUrl = !!String(snap.url || '').trim();
    var homeMode = !!snap.home || !hasUrl;
    var restored = openSourcesTab(hasUrl ? String(snap.url) : '', {
      switchTo: true,
      pinned: !!snap.pinned,
      home: homeMode,
      persist: false,
    });
    if (restored && snap.title) restored.title = String(snap.title);
    renderSourcesBrowserTabStrip();
  }

  function duplicateSourcesTab(tabId) {
    var tab = getSourcesTabById(tabId);
    if (!tab) return;
    openSourcesTab(tab.home ? '' : String(tab.url || getSourcesBrowserStartUrl()), {
      switchTo: true,
      pinned: !!tab.pinned,
      home: !!tab.home,
      persist: !tab.home,
    });
  }

  function closeSourcesOtherTabs(tabId) {
    var keep = String(tabId || '');
    var ids = [];
    for (var i = 0; i < state.sourcesTabs.length; i++) {
      var t = state.sourcesTabs[i];
      if (!t) continue;
      if (String(t.id) !== keep) ids.push(t.id);
    }
    for (var j = 0; j < ids.length; j++) closeSourcesTab(ids[j]);
  }

  function closeSourcesTabsToRight(tabId) {
    var idx = -1;
    for (var i = 0; i < state.sourcesTabs.length; i++) {
      if (state.sourcesTabs[i] && String(state.sourcesTabs[i].id) === String(tabId)) { idx = i; break; }
    }
    if (idx === -1) return;
    var ids = [];
    for (var j = idx + 1; j < state.sourcesTabs.length; j++) {
      if (state.sourcesTabs[j]) ids.push(state.sourcesTabs[j].id);
    }
    for (var k = 0; k < ids.length; k++) closeSourcesTab(ids[k]);
  }

  function toggleSourcesTabPinned(tabId) {
    var tab = getSourcesTabById(tabId);
    if (!tab) return;
    tab.pinned = !tab.pinned;
    reorderSourcesTabsAfterPin(tab);
    renderSourcesBrowserTabStrip();
  }

  function cycleSourcesTabs(direction) {
    if (!state.sourcesTabs.length) return;
    var dir = Number(direction || 1) < 0 ? -1 : 1;
    var idx = -1;
    for (var i = 0; i < state.sourcesTabs.length; i++) {
      if (state.sourcesTabs[i] && String(state.sourcesTabs[i].id) === String(state.sourcesActiveTabId)) { idx = i; break; }
    }
    if (idx === -1) idx = 0;
    var next = idx + dir;
    if (next < 0) next = state.sourcesTabs.length - 1;
    if (next >= state.sourcesTabs.length) next = 0;
    if (state.sourcesTabs[next]) switchSourcesTab(state.sourcesTabs[next].id, { focus: true });
  }

  function closeSourcesOmniDropdown() {
    state.sourcesOmniResults = [];
    state.sourcesOmniSelectedIdx = -1;
    state.sourcesOmniOpen = false;
    if (el.sourcesBrowserOmniDropdown) {
      el.sourcesBrowserOmniDropdown.classList.add('hidden');
      el.sourcesBrowserOmniDropdown.innerHTML = '';
    }
  }

  function renderSourcesOmniDropdown() {
    if (!el.sourcesBrowserOmniDropdown) return;
    var rows = Array.isArray(state.sourcesOmniResults) ? state.sourcesOmniResults : [];
    if (!rows.length) {
      closeSourcesOmniDropdown();
      return;
    }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || {};
      var label = String(row.type || 'history').trim().toUpperCase();
      var text = String(row.text || row.url || '').trim();
      var url = String(row.url || '').trim();
      html += '<div class="sourcesBrowserOmniRow' + (i === state.sourcesOmniSelectedIdx ? ' active' : '') + '" data-sources-omni-index="' + i + '">'
        + '<span class="sourcesBrowserOmniLabel">' + escapeHtml(label) + '</span>'
        + '<span class="sourcesBrowserOmniText">' + escapeHtml(text) + '</span>'
        + (url ? '<span class="sourcesBrowserOmniText sourcesBrowserOmniUrl">' + escapeHtml(url) + '</span>' : '')
        + '</div>';
    }
    el.sourcesBrowserOmniDropdown.innerHTML = html;
    el.sourcesBrowserOmniDropdown.classList.remove('hidden');
    state.sourcesOmniOpen = true;
  }

  function selectSourcesOmniRow(index, keepInput) {
    var rows = Array.isArray(state.sourcesOmniResults) ? state.sourcesOmniResults : [];
    if (!rows.length) return;
    var idx = Number(index);
    if (!isFinite(idx)) idx = 0;
    if (idx < 0) idx = rows.length - 1;
    if (idx >= rows.length) idx = 0;
    state.sourcesOmniSelectedIdx = idx;
    renderSourcesOmniDropdown();
    if (keepInput === false || !el.sourcesBrowserUrlInput) return;
    var row = rows[idx] || {};
    var text = String(row.url || row.text || '').trim();
    if (!text) return;
    state.sourcesOmniSuppressInputOnce = true;
    el.sourcesBrowserUrlInput.value = text;
  }

  function runSourcesOmniResult(index) {
    var rows = Array.isArray(state.sourcesOmniResults) ? state.sourcesOmniResults : [];
    if (!rows.length) return false;
    var idx = Number(index);
    if (!isFinite(idx)) idx = state.sourcesOmniSelectedIdx;
    if (!isFinite(idx) || idx < 0 || idx >= rows.length) idx = 0;
    var row = rows[idx] || {};
    var text = String(row.url || row.text || '').trim();
    if (!text) return false;
    closeSourcesOmniDropdown();
    navigateSourcesBrowser(text, { focus: true });
    setSourcesOmniExpanded(false, { keepValue: true, select: false });
    return true;
  }

  function requestSourcesOmniSuggestions(raw) {
    if (state.sourcesOmniDebounceTimer) {
      try { clearTimeout(state.sourcesOmniDebounceTimer); } catch (_eDebounce) {}
      state.sourcesOmniDebounceTimer = 0;
    }
    var query = String(raw || '').trim();
    if (!query) {
      closeSourcesOmniDropdown();
      return;
    }
    state.sourcesOmniDebounceTimer = setTimeout(function () {
      state.sourcesOmniDebounceTimer = 0;
      var seq = Number(state.sourcesOmniReqSeq || 0) + 1;
      state.sourcesOmniReqSeq = seq;
      var q = query.toLowerCase();
      var historyPromise = (api.webHistory && typeof api.webHistory.list === 'function')
        ? api.webHistory.list({ scope: 'sources_browser', query: query, limit: SOURCES_OMNI_MAX }).catch(function () { return null; })
        : Promise.resolve(null);
      var bookmarksPromise = (api.webBookmarks && typeof api.webBookmarks.list === 'function')
        ? api.webBookmarks.list().catch(function () { return null; })
        : Promise.resolve(null);
      var searchPromise = (api.webSearch && typeof api.webSearch.suggest === 'function')
        ? api.webSearch.suggest(query).catch(function () { return []; })
        : Promise.resolve([]);
      Promise.all([historyPromise, bookmarksPromise, searchPromise]).then(function (res) {
        if (seq !== state.sourcesOmniReqSeq) return;
        var historyRows = (res[0] && res[0].ok && Array.isArray(res[0].entries)) ? res[0].entries : [];
        var bookmarks = (res[1] && res[1].ok && Array.isArray(res[1].bookmarks)) ? res[1].bookmarks : [];
        var suggestions = Array.isArray(res[2]) ? res[2] : [];
        var out = [];
        var seen = {};
        function push(type, text, url) {
          var t = String(text || '').trim();
          var u = String(url || '').trim();
          var key = (u || t).toLowerCase();
          if (!key || seen[key]) return;
          seen[key] = 1;
          out.push({ type: type, text: t || u, url: u });
        }
        for (var i = 0; i < historyRows.length && out.length < SOURCES_OMNI_MAX; i++) {
          var h = historyRows[i] || {};
          push('history', getSourcesHistoryTitle(h.url, h.title), h.url);
        }
        for (var j = 0; j < bookmarks.length && out.length < SOURCES_OMNI_MAX; j++) {
          var b = bookmarks[j] || {};
          var bTitle = String(b.title || '').toLowerCase();
          var bUrl = String(b.url || '').toLowerCase();
          if (bTitle.indexOf(q) === -1 && bUrl.indexOf(q) === -1) continue;
          push('bookmark', b.title || b.url, b.url);
        }
        for (var k = 0; k < suggestions.length && out.length < SOURCES_OMNI_MAX; k++) {
          var s = suggestions[k] || {};
          push(s.type || 'search', s.text || s.url || '', s.url || '');
        }
        state.sourcesOmniResults = out;
        state.sourcesOmniSelectedIdx = out.length ? 0 : -1;
        renderSourcesOmniDropdown();
      });
    }, 130);
  }

  function openSourcesTabSearchOverlay() {
    if (!el.sourcesBrowserTabSearchOverlay) return;
    state.sourcesTabSearchOpen = true;
    state.sourcesTabSearchQuery = '';
    state.sourcesTabSearchSelectedIdx = -1;
    el.sourcesBrowserTabSearchOverlay.classList.remove('hidden');
    renderSourcesTabSearchRows('');
    syncSourcesBrowserOverlayLock();
    setTimeout(function () {
      if (!el.sourcesBrowserTabSearchInput) return;
      try { el.sourcesBrowserTabSearchInput.focus(); } catch (_eFocusTabSearch) {}
      if (el.sourcesBrowserTabSearchInput.select) el.sourcesBrowserTabSearchInput.select();
    }, 0);
  }

  function closeSourcesTabSearchOverlay() {
    state.sourcesTabSearchOpen = false;
    state.sourcesTabSearchQuery = '';
    state.sourcesTabSearchSelectedIdx = -1;
    if (el.sourcesBrowserTabSearchOverlay) el.sourcesBrowserTabSearchOverlay.classList.add('hidden');
    syncSourcesBrowserOverlayLock();
  }

  function renderSourcesTabSearchRows(query) {
    if (!el.sourcesBrowserTabSearchList) return;
    var q = String(query || '').trim().toLowerCase();
    state.sourcesTabSearchQuery = q;
    var matches = [];
    for (var i = 0; i < state.sourcesTabs.length; i++) {
      var tab = state.sourcesTabs[i];
      if (!tab) continue;
      var title = String(tab.title || getSourcesHistoryTitle(tab.url, '') || 'New Tab');
      var url = String(tab.url || '').trim();
      if (q) {
        var hay = (title + ' ' + url).toLowerCase();
        if (hay.indexOf(q) === -1) continue;
      }
      matches.push({ tab: tab, title: title, url: url, index: i + 1 });
    }
    state.sourcesTabSearchMatches = matches;
    if (!matches.length) {
      el.sourcesBrowserTabSearchList.innerHTML = '';
      if (el.sourcesBrowserTabSearchEmpty) el.sourcesBrowserTabSearchEmpty.classList.remove('hidden');
      return;
    }
    if (el.sourcesBrowserTabSearchEmpty) el.sourcesBrowserTabSearchEmpty.classList.add('hidden');
    if (state.sourcesTabSearchSelectedIdx < 0 || state.sourcesTabSearchSelectedIdx >= matches.length) {
      state.sourcesTabSearchSelectedIdx = 0;
    }
    var html = '';
    for (var j = 0; j < matches.length; j++) {
      var m = matches[j] || {};
      html += '<button class="sourcesBrowserTabSearchRow' + (j === state.sourcesTabSearchSelectedIdx ? ' active' : '') + '" type="button" data-sources-tab-search-index="' + j + '">'
        + '<span class="sourcesBrowserTabSearchIndex">Tab ' + escapeHtml(String(m.index || '')) + '</span>'
        + '<span class="sourcesBrowserTabSearchMain">'
          + '<span class="sourcesBrowserTabSearchTitle">' + escapeHtml(String(m.title || '')) + '</span>'
          + '<span class="sourcesBrowserTabSearchUrl">' + escapeHtml(String(m.url || 'New tab')) + '</span>'
        + '</span>'
        + '</button>';
    }
    el.sourcesBrowserTabSearchList.innerHTML = html;
  }

  function activateSourcesTabSearchResult(index) {
    var matches = Array.isArray(state.sourcesTabSearchMatches) ? state.sourcesTabSearchMatches : [];
    if (!matches.length) return false;
    var idx = Number(index);
    if (!isFinite(idx)) idx = state.sourcesTabSearchSelectedIdx;
    if (!isFinite(idx) || idx < 0 || idx >= matches.length) idx = 0;
    var match = matches[idx] || {};
    if (!match.tab || !match.tab.id) return false;
    closeSourcesTabSearchOverlay();
    switchSourcesTab(match.tab.id, { focus: true });
    return true;
  }

  function showSourcesBrowserContextMenu(items, x, y, meta) {
    if (!el.sourcesBrowserCtxMenu || !el.sourcesBrowserCtxOverlay) return;
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item) continue;
      if (item.separator) {
        html += '<div class="sourcesBrowserCtxSep"></div>';
        continue;
      }
      html += '<button class="sourcesBrowserCtxItem" type="button"'
        + (item.disabled ? ' disabled' : '')
        + ' data-sources-ctx-action="' + escapeHtml(String(item.action || '')) + '">'
        + '<span>' + escapeHtml(String(item.label || '')) + '</span>'
        + '<span class="muted tiny">' + escapeHtml(String(item.shortcut || '')) + '</span>'
        + '</button>';
    }
    el.sourcesBrowserCtxMenu.innerHTML = html;
    state.sourcesContextMenuMeta = meta || null;
    el.sourcesBrowserCtxOverlay.classList.remove('hidden');
    el.sourcesBrowserCtxMenu.classList.remove('hidden');
    var w = Math.max(180, Number(el.sourcesBrowserCtxMenu.offsetWidth || 240));
    var h = Math.max(32, Number(el.sourcesBrowserCtxMenu.offsetHeight || 120));
    var left = Math.max(4, Math.min(Number(x || 0), window.innerWidth - w - 6));
    var top = Math.max(4, Math.min(Number(y || 0), window.innerHeight - h - 6));
    el.sourcesBrowserCtxMenu.style.left = left + 'px';
    el.sourcesBrowserCtxMenu.style.top = top + 'px';
    syncSourcesBrowserOverlayLock();
  }

  function hideSourcesBrowserContextMenu() {
    state.sourcesContextMenuMeta = null;
    if (el.sourcesBrowserCtxOverlay) el.sourcesBrowserCtxOverlay.classList.add('hidden');
    if (el.sourcesBrowserCtxMenu) {
      el.sourcesBrowserCtxMenu.classList.add('hidden');
      el.sourcesBrowserCtxMenu.innerHTML = '';
    }
    syncSourcesBrowserOverlayLock();
  }

  function pasteAndGoFromClipboard() {
    if (!(navigator.clipboard && navigator.clipboard.readText)) {
      showToast('Clipboard access unavailable');
      return;
    }
    navigator.clipboard.readText().then(function (text) {
      var value = String(text || '').trim();
      if (!value) return;
      setSourcesOmniExpanded(true, { keepValue: true, select: false });
      if (el.sourcesBrowserUrlInput) el.sourcesBrowserUrlInput.value = value;
      navigateSourcesBrowser(value, { focus: true });
      setSourcesOmniExpanded(false, { keepValue: true, select: false });
    }).catch(function () {
      showToast('Unable to read clipboard');
    });
  }

  function runSourcesContextAction(action) {
    var meta = state.sourcesContextMenuMeta || {};
    var active = getSourcesActiveTab();
    var wv = active && active.webview ? active.webview : null;
    var tabTarget = meta.tabId ? getSourcesTabById(meta.tabId) : null;
    var targetWv = tabTarget && tabTarget.webview ? tabTarget.webview : wv;
    var wcId = 0;
    if (!isButterfly) {
      try { wcId = Number(targetWv && typeof targetWv.getWebContentsId === 'function' ? targetWv.getWebContentsId() : 0) || 0; } catch (_eWc) { wcId = 0; }
    }
    var ctx = meta.params || {};
    var sendCtx = function (name, payload) {
      if (!api.webBrowserActions || typeof api.webBrowserActions.ctxAction !== 'function') return;
      if (isButterfly) {
        // Butterfly: ctxAction operates on the page set by switchTab — no wcId needed
        api.webBrowserActions.ctxAction({ webContentsId: 0, action: name, payload: payload });
      } else {
        if (!wcId) return;
        api.webBrowserActions.ctxAction({ webContentsId: wcId, action: name, payload: payload });
      }
    };
    var runHomeEdit = function (kind) {
      var input = document.activeElement;
      if (!input || (input !== el.sourcesBrowserHomeSearchInput && input !== el.sourcesBrowserUrlInput)) return;
      try {
        if (kind === 'copy') document.execCommand('copy');
        else if (kind === 'cut') document.execCommand('cut');
        else if (kind === 'paste') document.execCommand('paste');
        else if (kind === 'selectAll') input.select();
      } catch (_eHomeEdit) {}
    };
    switch (String(action || '')) {
      case 'back':
        if (isButterfly) { if (active && active._bridgeTabId) try { api.webTabManager.goBack({ tabId: active._bridgeTabId }); } catch (_e) {} }
        else if (wv && typeof wv.goBack === 'function') wv.goBack();
        break;
      case 'forward':
        if (isButterfly) { if (active && active._bridgeTabId) try { api.webTabManager.goForward({ tabId: active._bridgeTabId }); } catch (_e) {} }
        else if (wv && typeof wv.goForward === 'function') wv.goForward();
        break;
      case 'reload':
        if (isButterfly) { var rt = tabTarget || active; if (rt && rt._bridgeTabId) try { api.webTabManager.reload({ tabId: rt._bridgeTabId }); } catch (_e) {} }
        else if (targetWv && typeof targetWv.reload === 'function') targetWv.reload();
        break;
      case 'copy': sendCtx('copy'); break;
      case 'cut': sendCtx('cut'); break;
      case 'paste': sendCtx('paste'); break;
      case 'pasteAndMatchStyle': sendCtx('pasteAndMatchStyle'); break;
      case 'undo': sendCtx('undo'); break;
      case 'redo': sendCtx('redo'); break;
      case 'selectAll': sendCtx('selectAll'); break;
      case 'homeCopy': runHomeEdit('copy'); break;
      case 'homeCut': runHomeEdit('cut'); break;
      case 'homePaste': runHomeEdit('paste'); break;
      case 'homeSelectAll': runHomeEdit('selectAll'); break;
      case 'homePasteGo': pasteAndGoFromClipboard(); break;
      case 'homeOpenShortcut': if (ctx.homeUrl) navigateSourcesBrowser(String(ctx.homeUrl), { focus: true }); break;
      case 'homeOpenShortcutNewTab': if (ctx.homeUrl) openSourcesTab(String(ctx.homeUrl), { switchTo: true, focus: true }); break;
      case 'homeCopyLink':
        if (ctx.homeUrl) {
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(String(ctx.homeUrl));
            else if (api.webBrowserActions && api.webBrowserActions.ctxAction) sendCtx('copyLink', String(ctx.homeUrl));
          } catch (_eClipHome) {}
        }
        break;
      case 'copyLink': if (ctx.linkURL) sendCtx('copyLink', String(ctx.linkURL)); break;
      case 'openLinkNewTab': if (ctx.linkURL) openSourcesTab(String(ctx.linkURL), { switchTo: true }); break;
      case 'openLinkNewTabBg': if (ctx.linkURL) openSourcesTab(String(ctx.linkURL), { switchTo: false }); break;
      case 'saveLinkAs': if (ctx.linkURL) sendCtx('saveLinkAs', String(ctx.linkURL)); break;
      case 'openLinkExternal': if (ctx.linkURL) sendCtx('openLinkExternal', String(ctx.linkURL)); break;
      case 'openImageNewTab': if (ctx.srcURL) openSourcesTab(String(ctx.srcURL), { switchTo: true }); break;
      case 'saveImage': if (ctx.srcURL) sendCtx('saveImage', String(ctx.srcURL)); break;
      case 'copyImage':
        if (ctx.srcURL) sendCtx('copyImage', { url: String(ctx.srcURL), x: Number(ctx.x) || 0, y: Number(ctx.y) || 0 });
        else sendCtx('copyImage');
        break;
      case 'inspect':
        if (ctx.x != null && ctx.y != null) sendCtx('inspect', { x: Number(ctx.x) || 0, y: Number(ctx.y) || 0 });
        break;
      case 'newTab': openSourcesTab('', { switchTo: true, persist: false, home: true, focus: true }); break;
      case 'duplicateTab': if (meta.tabId) duplicateSourcesTab(meta.tabId); break;
      case 'pinTab': if (meta.tabId) toggleSourcesTabPinned(meta.tabId); break;
      case 'closeTab': if (meta.tabId) closeSourcesTab(meta.tabId); break;
      case 'closeOthers': if (meta.tabId) closeSourcesOtherTabs(meta.tabId); break;
      case 'closeRight': if (meta.tabId) closeSourcesTabsToRight(meta.tabId); break;
      case 'reopenClosed': reopenSourcesClosedTab(); break;
      case 'viewSource':
        if (ctx.pageURL) openSourcesTab('view-source:' + String(ctx.pageURL), { switchTo: true, persist: false });
        else if (active && active.url) openSourcesTab('view-source:' + String(active.url), { switchTo: true, persist: false });
        break;
      default:
        break;
    }
  }

  function showSourcesWebviewContextMenu(params, tab) {
    var items = [];
    var p = (params && typeof params === 'object') ? params : {};
    var wv = tab && tab.webview ? tab.webview : getSourcesBrowserWebview();
    var canGoBack = !!p.canGoBack;
    var canGoForward = !!p.canGoForward;
    if (!isButterfly) {
      try { canGoBack = !!(wv && typeof wv.canGoBack === 'function' && wv.canGoBack()); } catch (_eA) {}
      try { canGoForward = !!(wv && typeof wv.canGoForward === 'function' && wv.canGoForward()); } catch (_eB) {}
    } else if (tab) {
      if (!canGoBack) canGoBack = !!tab._canGoBack;
      if (!canGoForward) canGoForward = !!tab._canGoForward;
    }
    items.push({ label: 'Back', action: 'back', disabled: !canGoBack, shortcut: 'Alt+Left' });
    items.push({ label: 'Forward', action: 'forward', disabled: !canGoForward, shortcut: 'Alt+Right' });
    items.push({ label: 'Reload', action: 'reload', shortcut: 'Ctrl+R' });
    items.push({ separator: true });
    if (p.linkURL) {
      items.push({ label: 'Open Link in New Tab', action: 'openLinkNewTab' });
      items.push({ label: 'Open Link in Background Tab', action: 'openLinkNewTabBg' });
      items.push({ label: 'Copy Link Address', action: 'copyLink' });
      items.push({ label: 'Save Link As...', action: 'saveLinkAs' });
      items.push({ label: 'Open Link in External Browser', action: 'openLinkExternal' });
      items.push({ separator: true });
    }
    if (String(p.mediaType || '').toLowerCase() === 'image' && p.srcURL) {
      items.push({ label: 'Open Image in New Tab', action: 'openImageNewTab' });
      items.push({ label: 'Save Image As...', action: 'saveImage' });
      items.push({ label: 'Copy Image', action: 'copyImage' });
      items.push({ separator: true });
    }
    if (p.isEditable) {
      items.push({ label: 'Undo', action: 'undo', shortcut: 'Ctrl+Z' });
      items.push({ label: 'Redo', action: 'redo', shortcut: 'Ctrl+Y' });
      items.push({ separator: true });
    }
    if (p.selectionText) {
      items.push({ label: 'Copy', action: 'copy', shortcut: 'Ctrl+C' });
      if (p.isEditable) items.push({ label: 'Cut', action: 'cut', shortcut: 'Ctrl+X' });
      items.push({ separator: true });
    }
    if (p.isEditable) {
      items.push({ label: 'Paste', action: 'paste', shortcut: 'Ctrl+V' });
      items.push({ label: 'Paste and Match Style', action: 'pasteAndMatchStyle' });
      items.push({ label: 'Select All', action: 'selectAll', shortcut: 'Ctrl+A' });
      items.push({ separator: true });
    }
    items.push({ label: 'View Page Source', action: 'viewSource' });
    items.push({ label: 'Inspect', action: 'inspect', shortcut: 'Ctrl+Shift+I' });
    var menuX = (p.x != null) ? Number(p.x) : Number((p.screenX != null) ? p.screenX : 0);
    var menuY = (p.y != null) ? Number(p.y) : Number((p.screenY != null) ? p.screenY : 0);
    showSourcesBrowserContextMenu(items, menuX, menuY, {
      type: 'page',
      tabId: tab && tab.id,
      params: p,
    });
  }

  function showSourcesHomeContextMenu(params) {
    var p = (params && typeof params === 'object') ? params : {};
    var items = [];
    if (p.isEditable) {
      items.push({ label: 'Copy', action: 'homeCopy', shortcut: 'Ctrl+C' });
      items.push({ label: 'Cut', action: 'homeCut', shortcut: 'Ctrl+X' });
      items.push({ label: 'Paste', action: 'homePaste', shortcut: 'Ctrl+V' });
      items.push({ label: 'Select All', action: 'homeSelectAll', shortcut: 'Ctrl+A' });
    } else if (p.homeUrl) {
      items.push({ label: 'Open', action: 'homeOpenShortcut' });
      items.push({ label: 'Open in New Tab', action: 'homeOpenShortcutNewTab' });
      items.push({ label: 'Copy Link Address', action: 'homeCopyLink' });
    } else {
      items.push({ label: 'New Tab', action: 'newTab', shortcut: 'Ctrl+T' });
      if (p.omniChip) {
        items.push({ label: 'Paste and Go', action: 'homePasteGo' });
      }
    }
    showSourcesBrowserContextMenu(items, Number(p.x || 0), Number(p.y || 0), {
      type: 'home',
      params: p,
    });
  }

  function showSourcesTabContextMenu(tabId, x, y) {
    var tab = getSourcesTabById(tabId);
    if (!tab) return;
    var items = [
      { label: 'New Tab', action: 'newTab', shortcut: 'Ctrl+T' },
      { label: 'Reload Tab', action: 'reload' },
      { label: 'Duplicate', action: 'duplicateTab' },
      { label: tab.pinned ? 'Unpin Tab' : 'Pin Tab', action: 'pinTab' },
      { separator: true },
      { label: 'Close Tab', action: 'closeTab', shortcut: 'Ctrl+W' },
      { label: 'Close Other Tabs', action: 'closeOthers' },
      { label: 'Close Tabs to the Right', action: 'closeRight' },
      { separator: true },
      { label: 'Reopen Closed Tab', action: 'reopenClosed', shortcut: 'Ctrl+Shift+T', disabled: !state.sourcesClosedTabs.length },
    ];
    showSourcesBrowserContextMenu(items, x, y, { type: 'tab', tabId: tab.id, params: {} });
  }

  function bindSourcesTabWebviewEvents(tab) {
    if (!tab || !tab.webview || tab._bound) return;
    tab._bound = true;
    var wv = tab.webview;
    wv.addEventListener('did-start-loading', function () {
      tab.loading = true;
      if (String(tab.id) === String(state.sourcesActiveTabId)) {
        state.sourcesBrowserLoading = true;
        refreshSourcesBrowserNav();
        setSourcesBrowserStatus('Loading...', true);
      }
      scheduleSourcesBrowserViewportLayout();
      scheduleSourcesBrowserLoadingSettleCheck();
    });
    wv.addEventListener('did-stop-loading', function () {
      tab.loading = false;
      var url = '';
      try { url = String(wv.getURL() || '').trim(); } catch (_e1) { url = ''; }
      if (!tab.home && url) tab.url = url;
      try {
        var title = String(wv.getTitle() || '').trim();
        if (!tab.home && title) tab.title = title;
      } catch (_e2) {}
      if (!tab.home && isAllowedSourcesHistoryUrl(tab.url)) maybeRecordSourcesHistory(tab, tab.url, 'did-stop-loading');
      if (String(tab.id) === String(state.sourcesActiveTabId)) {
        state.sourcesBrowserLoading = false;
        state.sourcesBrowserUrl = tab.home ? '' : String(tab.url || '');
        syncSourcesBrowserUrlInput();
        refreshSourcesBrowserNav();
        setSourcesBrowserStatus(String((tab.home ? 'Home' : tab.url) || 'Ready'), false);
        refreshSourcesBrowserBookmarkUi(tab.home ? '' : (tab.url || ''));
      }
      renderSourcesBrowserTabStrip();
      scheduleSourcesBrowserViewportLayout();
      scheduleSourcesBrowserLoadingSettleCheck();
    });
    wv.addEventListener('did-finish-load', function () {
      tab.loading = false;
      if (String(tab.id) === String(state.sourcesActiveTabId)) {
        state.sourcesBrowserLoading = false;
        refreshSourcesBrowserNav();
        setSourcesBrowserStatus(String(tab.url || state.sourcesBrowserUrl || 'Ready'), false);
      }
      scheduleSourcesBrowserLoadingSettleCheck();
    });
    wv.addEventListener('dom-ready', function () {
      if (String(tab.id) === String(state.sourcesActiveTabId)) refreshSourcesBrowserNav();
      scheduleSourcesBrowserViewportLayout();
    });
    wv.addEventListener('did-fail-load', function (e) {
      var code = Number(e && e.errorCode || 0);
      if (code === -3) return;
      tab.loading = false;
      if (String(tab.id) === String(state.sourcesActiveTabId)) {
        state.sourcesBrowserLoading = false;
        refreshSourcesBrowserNav();
        setSourcesBrowserStatus('Load failed (HTTP/NET error)', false);
      }
    });
    wv.addEventListener('did-navigate', function (e) {
      var next = String(e && e.url || '').trim();
      if (/^magnet:/i.test(next)) {
        emit('openMagnet', next);
        return;
      }
      if (!next || tab.home) return;
      tab.url = next;
      if (isAllowedSourcesHistoryUrl(next)) maybeRecordSourcesHistory(tab, next, 'did-navigate');
      if (isAllowedSourcesHistoryUrl(next)) persistSourcesBrowserLastUrl(next);
      if (String(tab.id) === String(state.sourcesActiveTabId)) {
        state.sourcesBrowserUrl = next;
        syncSourcesBrowserUrlInput();
        refreshSourcesBrowserBookmarkUi(next);
        refreshSourcesBrowserNav();
      }
      renderSourcesBrowserTabStrip();
    });
    wv.addEventListener('page-title-updated', function (e) {
      var t = String(e && e.title || '').trim();
      if (!t || tab.home) return;
      tab.title = t;
      if (isAllowedSourcesHistoryUrl(tab.url)) maybeRecordSourcesHistory(tab, tab.url, 'page-title-updated');
      renderSourcesBrowserTabStrip();
    });
    wv.addEventListener('page-favicon-updated', function (e) {
      var favs = e && e.favicons;
      if (!favs || !favs.length || tab.home) return;
      tab.favicon = String(favs[0] || '').trim();
      if (isAllowedSourcesHistoryUrl(tab.url)) maybeRecordSourcesHistory(tab, tab.url, 'page-favicon-updated');
    });
    wv.addEventListener('new-window', function (e) {
      var next = String((e && e.url) || '').trim();
      if (!next) return;
      if (/^magnet:/i.test(next)) {
        emit('openMagnet', next);
        return;
      }
      openSourcesTab(next, { switchTo: true });
    });
    wv.addEventListener('context-menu', function (e) {
      var p = (e && e.params && typeof e.params === 'object') ? e.params : (e || {});
      showSourcesWebviewContextMenu(p, tab);
    });
  }

  function openSourcesTab(rawUrl, opts) {
    var options = (opts && typeof opts === 'object') ? opts : {};
    if (state.sourcesTabs.length >= SOURCES_MAX_TABS) {
      showToast('Tab limit reached');
      return null;
    }
    var initialUrl = String(rawUrl || '').trim();
    var homeMode = !!options.home || initialUrl === 'about:blank';
    var id = 'st_' + String(state.sourcesTabSeq++);

    if (isButterfly) {
      // Butterfly: Qt manages QWebEngineView natively — no DOM webview
      var tab = {
        id: id,
        webview: null,
        _bridgeTabId: null,
        _creationPending: true,
        url: '',
        title: homeMode ? 'Home' : 'New Tab',
        pinned: !!options.pinned,
        loading: false,
        favicon: '',
        lastHistoryUrl: '',
        lastHistoryAt: 0,
        home: homeMode,
      };
      getSourcesHomeStateForTab(tab);
      if (tab.pinned) {
        var insertAt = 0;
        while (insertAt < state.sourcesTabs.length && state.sourcesTabs[insertAt] && state.sourcesTabs[insertAt].pinned) insertAt++;
        state.sourcesTabs.splice(insertAt, 0, tab);
      } else {
        state.sourcesTabs.push(tab);
      }
      var target = '';
      if (!homeMode) {
        target = normalizeSourcesBrowserInput(rawUrl || '');
        if (!target) target = getSourcesBrowserStartUrl();
        tab.url = target;
        tab.loading = true;
      }
      // Butterfly: for home tabs, show content immediately — don't wait for the bridge
      // round-trip. The createTab Promise can take 5-60s on first call (Chromium
      // browser-profile init), leaving the panel blank the whole time. Showing the
      // home div now gives instant feedback; switchSourcesTab() re-runs on resolve.
      if (homeMode && options.switchTo !== false) {
        state.sourcesActiveTabId = tab.id;
        renderSourcesBrowserTabStrip();
        renderSourcesBrowserHome();
        refreshSourcesBrowserNav();
      }
      var createResult = api.webTabManager.createTab({ url: target || '', home: homeMode });
      var _bfFinishTab = function () {
        if (!tab._bridgeTabId) tab._creationPending = false;
        renderSourcesBrowserTabStrip();
        if (!homeMode && String(tab.id) === String(state.sourcesActiveTabId)) {
          state.sourcesBrowserLoading = true;
          state.sourcesBrowserUrl = target;
          if (el.sourcesBrowserUrlInput) el.sourcesBrowserUrlInput.value = target;
          refreshSourcesBrowserNav();
          if (options.persist !== false) persistSourcesBrowserLastUrl(target);
        } else if (homeMode && String(tab.id) === String(state.sourcesActiveTabId)) {
          state.sourcesBrowserLoading = false;
          state.sourcesBrowserUrl = '';
          if (el.sourcesBrowserUrlInput) el.sourcesBrowserUrlInput.value = '';
          refreshSourcesBrowserNav();
        }
        if (options.switchTo !== false) switchSourcesTab(tab.id, { focus: !!options.focus });
        // Force immediate viewport bounds update (not just debounced) so the Qt
        // overlay is positioned as soon as the bridge tab is wired.
        try { applySourcesBrowserViewportLayout(); } catch (_eImmLayout) {}
      };
      var _bfApplyBridgeId = function (tabId) {
        tab._bridgeTabId = tabId;
        tab._creationPending = false;
        // Execute any navigation queued while createTab was pending
        if (tab._pendingNav && tab._pendingNav.url) {
          var nav = tab._pendingNav;
          tab._pendingNav = null;
          try { api.webTabManager.navigateTo({ tabId: tabId, url: nav.url }); } catch (_ePN) {}
          try { api.webTabManager.setTabHome({ tabId: tabId, home: false }); } catch (_ePH) {}
        }
      };
      if (createResult && typeof createResult.then === 'function') {
        createResult.then(function (r) {
          var parsed = null;
          try { parsed = (typeof r === 'string') ? JSON.parse(r) : r; } catch (_eParse) { parsed = null; }
          if (parsed && parsed.tabId) _bfApplyBridgeId(parsed.tabId);
          _bfFinishTab();
        });
      } else if (createResult) {
        var parsed = null;
        try { parsed = (typeof createResult === 'string') ? JSON.parse(createResult) : createResult; } catch (_eParseSync) { parsed = null; }
        if (parsed && parsed.tabId) _bfApplyBridgeId(parsed.tabId);
        _bfFinishTab();
      }
      return tab;
    }

    // Electron: create <webview> DOM element
    var wv = ensureSourcesBrowserWebviewNode();
    if (!wv) return null;
    var tab = {
      id: id,
      webview: wv,
      url: '',
      title: homeMode ? 'Home' : 'New Tab',
      pinned: !!options.pinned,
      loading: false,
      favicon: '',
      lastHistoryUrl: '',
      lastHistoryAt: 0,
      home: homeMode,
    };
    getSourcesHomeStateForTab(tab);
    bindSourcesTabWebviewEvents(tab);
    if (tab.pinned) {
      var insertAt = 0;
      while (insertAt < state.sourcesTabs.length && state.sourcesTabs[insertAt] && state.sourcesTabs[insertAt].pinned) insertAt++;
      state.sourcesTabs.splice(insertAt, 0, tab);
    } else {
      state.sourcesTabs.push(tab);
    }
    renderSourcesBrowserTabStrip();
    switchSourcesTab(tab.id, { focus: false });
    if (!homeMode) {
      var target = normalizeSourcesBrowserInput(rawUrl || '');
      if (!target) target = getSourcesBrowserStartUrl();
      try {
        tab.webview.loadURL(target);
        tab.loading = true;
        tab.url = target;
        if (String(tab.id) === String(state.sourcesActiveTabId)) {
          state.sourcesBrowserLoading = true;
          state.sourcesBrowserUrl = target;
          if (el.sourcesBrowserUrlInput) el.sourcesBrowserUrlInput.value = target;
          refreshSourcesBrowserNav();
        }
        if (options.persist !== false) persistSourcesBrowserLastUrl(target);
      } catch (_eLoad) {}
    } else if (String(tab.id) === String(state.sourcesActiveTabId)) {
      state.sourcesBrowserLoading = false;
      state.sourcesBrowserUrl = '';
      if (el.sourcesBrowserUrlInput) el.sourcesBrowserUrlInput.value = '';
      refreshSourcesBrowserNav();
    }
    if (options.switchTo !== false) switchSourcesTab(tab.id, { focus: !!options.focus });
    return tab;
  }

  function getSourcesBrowserDownloadsList() {
    if (Array.isArray(state.downloads)) {
      return state.downloads.filter(function (d) { return !!d; });
    }
    if (!state.downloads || typeof state.downloads !== 'object') return [];
    var out = [];
    var keys = Object.keys(state.downloads);
    for (var i = 0; i < keys.length; i++) {
      var d = state.downloads[keys[i]];
      if (d) out.push(d);
    }
    return out;
  }

  function normalizeSourcesDownloadState(rawState) {
    var s = String(rawState || '').trim().toLowerCase();
    if (s === 'downloading' || s === 'started' || s === 'in_progress') return 'progressing';
    if (s === 'canceled') return 'cancelled';
    return s || 'progressing';
  }

  function normalizeSourcesDownloadInfo(info) {
    var src = (info && typeof info === 'object') ? info : {};
    var id = String(src.id || '').trim();
    if (!id) return null;
    var received = Number(src.received);
    if (!isFinite(received)) received = Number(src.receivedBytes || 0);
    if (!isFinite(received) || received < 0) received = 0;
    var totalBytes = Number(src.totalBytes || 0);
    if (!isFinite(totalBytes) || totalBytes < 0) totalBytes = 0;
    var speed = Number(src.speed);
    if (!isFinite(speed)) speed = Number(src.bytesPerSec || 0);
    if (!isFinite(speed) || speed < 0) speed = 0;
    var stateName = normalizeSourcesDownloadState(src.state || src.status || src.rawState || '');
    var savePath = String(src.savePath || src.path || src.destination || '').trim();
    var destination = String(src.destination || '').trim();
    var progress = Number(src.progress);
    if (!isFinite(progress) || progress < 0) {
      progress = totalBytes > 0 ? Math.max(0, Math.min(1, received / totalBytes)) : 0;
    }
    if (progress > 1) progress = 1;
    return {
      id: id,
      filename: String(src.filename || src.name || 'download'),
      totalBytes: totalBytes,
      received: received,
      speed: speed,
      state: stateName,
      savePath: savePath,
      destination: destination,
      startedAt: Number(src.startedAt || 0) || 0,
      finishedAt: Number(src.finishedAt || 0) || 0,
      progress: progress,
      error: String(src.error || ''),
      transport: String(src.transport || ''),
      canPause: !!src.canPause,
      canResume: !!src.canResume,
      canCancel: !!src.canCancel,
    };
  }

  function upsertSourcesDownload(info) {
    var normalized = normalizeSourcesDownloadInfo(info);
    if (!normalized) return null;
    if (!state.downloads || typeof state.downloads !== 'object' || Array.isArray(state.downloads)) {
      state.downloads = {};
    }
    var existing = state.downloads[normalized.id] || null;
    if (existing && typeof existing === 'object') {
      var next = {};
      var keys = Object.keys(existing);
      for (var i = 0; i < keys.length; i++) next[keys[i]] = existing[keys[i]];
      var nkeys = Object.keys(normalized);
      for (var j = 0; j < nkeys.length; j++) next[nkeys[j]] = normalized[nkeys[j]];
      if (!next.savePath && next.destination) next.savePath = String(next.destination || '');
      state.downloads[normalized.id] = next;
      return next;
    }
    state.downloads[normalized.id] = normalized;
    return normalized;
  }

  function loadSourcesDownloadHistory() {
    if (!api.webSources || typeof api.webSources.getDownloadHistory !== 'function') return Promise.resolve();
    return api.webSources.getDownloadHistory().then(function (res) {
      var rows = (res && res.ok && Array.isArray(res.downloads)) ? res.downloads : [];
      var next = {};
      for (var i = 0; i < rows.length; i++) {
        var item = normalizeSourcesDownloadInfo(rows[i]);
        if (!item) continue;
        next[item.id] = item;
      }
      state.downloads = next;
      renderHomeDownloads();
      renderSourcesBrowserDownloadsRows();
      syncDownloadIndicator();
      if (hub && hub.renderHubDirectActive) hub.renderHubDirectActive();
      if (hub && hub.renderHubDownloadHistory) hub.renderHubDownloadHistory();
    }).catch(function () {
      // Keep existing in-memory state on history read failure.
    });
  }

  function formatSpeedForSources(bytesPerSec) {
    var n = Number(bytesPerSec || 0);
    if (!isFinite(n) || n <= 0) return '-';
    return formatBytesForSources(n) + '/s';
  }

  function getSourcesBrowserStartUrl() {
    return 'https://www.google.com/';
  }

  function setSourcesBrowserStatus(text, loading) {
    if (!el.sourcesBrowserStatus) return;
    el.sourcesBrowserStatus.textContent = String(text || '');
    el.sourcesBrowserStatus.setAttribute('data-loading', loading ? '1' : '0');
  }

  function setSourcesBrowserRenderState(next) {
    var value = String(next || '').trim().toLowerCase();
    if (value !== 'recovering' && value !== 'failed') value = 'ok';
    state.sourcesBrowserRenderState = value;
  }

  function getSourcesBrowserViewportMetrics() {
    var wv = getSourcesBrowserWebview();
    var viewport = wv && wv.parentElement;
    if (!wv || !viewport || !document.body.contains(viewport)) return null;
    var rect = null;
    try { rect = viewport.getBoundingClientRect(); } catch (_e0) { rect = null; }
    var width = Math.max(0, Math.round(Number(rect && rect.width) || Number(viewport.clientWidth) || 0));
    var height = Math.max(0, Math.round(Number(rect && rect.height) || Number(viewport.clientHeight) || 0));
    var visible = !viewport.classList.contains('hidden')
      && !!(el.webLibraryView && !el.webLibraryView.classList.contains('hidden'));
    return { wv: wv, viewport: viewport, width: width, height: height, visible: visible };
  }

  function sourcesBrowserBoundsMismatch(metrics) {
    if (!metrics || !metrics.wv || !metrics.viewport) return false;
    var wvRect = null;
    var vpRect = null;
    try { wvRect = metrics.wv.getBoundingClientRect(); } catch (_e1) { wvRect = null; }
    try { vpRect = metrics.viewport.getBoundingClientRect(); } catch (_e2) { vpRect = null; }
    if (!wvRect || !vpRect) return false;
    var dw = Math.abs(Math.round((wvRect.width || 0) - (vpRect.width || 0)));
    var dh = Math.abs(Math.round((wvRect.height || 0) - (vpRect.height || 0)));
    return dw > 2 || dh > 2;
  }

  function runSourcesBrowserRecoveryPass() {
    // Keep this intentionally non-destructive:
    // do not auto-reload/re-attach webview surfaces from layout watchdog.
    setSourcesBrowserRenderState('ok');
  }

  function setSourcesBrowserBookmarkUi(isBookmarked) {
    state.sourcesBrowserBookmarked = !!isBookmarked;
    if (!el.sourcesBrowserBookmarkBtn) return;
    el.sourcesBrowserBookmarkBtn.title = isBookmarked ? 'Bookmarked' : 'Bookmark page';
    el.sourcesBrowserBookmarkBtn.setAttribute('aria-label', isBookmarked ? 'Bookmarked' : 'Bookmark page');
    el.sourcesBrowserBookmarkBtn.classList.toggle('isBookmarked', !!isBookmarked);
  }

  function refreshSourcesBrowserBookmarkUi(url) {
    var target = String(url || state.sourcesBrowserUrl || '').trim();
    if (!target) {
      setSourcesBrowserBookmarkUi(false);
      return;
    }
    if (api.webBookmarks && typeof api.webBookmarks.list === 'function') {
      api.webBookmarks.list().then(function (res) {
        var rows = (res && res.ok && Array.isArray(res.bookmarks)) ? res.bookmarks : [];
        state.bookmarks = rows;
        var found = false;
        for (var i = 0; i < rows.length; i++) {
          if (String(rows[i] && rows[i].url || '').trim() === target) { found = true; break; }
        }
        setSourcesBrowserBookmarkUi(found);
      }).catch(function () {
        setSourcesBrowserBookmarkUi(false);
      });
      return;
    }
    setSourcesBrowserBookmarkUi(false);
  }

  function getSourcesActiveSearchEngineKey() {
    var engines = getSourcesSearchEngines();
    var key = String(state.browserSettings && state.browserSettings.defaultSearchEngine || 'google').trim().toLowerCase();
    var active = getSourcesActiveTab();
    var homeState = getSourcesHomeStateForTab(active);
    if (active && active.home && homeState && homeState.engine) key = String(homeState.engine).trim().toLowerCase();
    if (!engines[key]) key = 'google';
    if (!engines[key]) {
      var keys = Object.keys(engines || {});
      key = keys.length ? String(keys[0]) : 'google';
    }
    return key;
  }

  function getSourcesSearchUrl(query, forcedEngine) {
    var q = String(query || '').trim();
    if (!q) return '';
    var engines = getSourcesSearchEngines();
    var key = String(forcedEngine || getSourcesActiveSearchEngineKey() || 'google').trim().toLowerCase();
    if (!engines[key]) key = 'google';
    var meta = engines[key] || engines.google || null;
    if (!meta || !meta.url) return 'https://www.google.com/search?q=' + encodeURIComponent(q);
    return String(meta.url) + encodeURIComponent(q);
  }

  function syncSourcesBrowserOmniPlaceholder() {
    if (!el.sourcesBrowserUrlInput) return;
    var engines = getSourcesSearchEngines();
    var key = getSourcesActiveSearchEngineKey();
    var meta = engines[key] || engines.google || null;
    var label = String(meta && meta.label || 'Google');
    el.sourcesBrowserUrlInput.placeholder = 'Search with ' + label + ' or enter URL';
    syncSourcesOmniChipText();
  }

  function normalizeSourcesBrowserInput(raw) {
    var input = String(raw || '').trim();
    if (!input) return '';
    if (/^about:?blank$/i.test(input)) return getSourcesBrowserStartUrl();
    if (/^about:/i.test(input)) return input;
    if (/^(https?:\/\/|magnet:)/i.test(input)) return input;
    if (/^[a-z0-9-]+\.[a-z0-9.-]+(\/.*)?$/i.test(input)) return 'https://' + input;
    return getSourcesSearchUrl(input);
  }

  function persistSourcesBrowserLastUrl(url) {
    var target = String(url || '').trim();
    if (!target) return;
    saveBrowserSettings({ sourcesBrowser: { lastUrl: target } });
  }

  function refreshSourcesBrowserNav() {
    var activeTab = getSourcesActiveTab();
    var activeHome = !!(activeTab && activeTab.home);
    state.sourcesBrowserLoading = !!(activeTab && activeTab.loading && !activeHome);
    syncSourcesOmniChipText();
    if (activeHome) {
      if (el.sourcesBrowserBackBtn) el.sourcesBrowserBackBtn.disabled = true;
      if (el.sourcesBrowserForwardBtn) el.sourcesBrowserForwardBtn.disabled = true;
      if (el.sourcesBrowserReloadBtn) {
        el.sourcesBrowserReloadBtn.classList.remove('isLoading');
        el.sourcesBrowserReloadBtn.title = 'Reload';
        el.sourcesBrowserReloadBtn.setAttribute('aria-label', 'Reload');
      }
      return;
    }
    if (isButterfly) {
      // Butterfly: canGoBack/canGoForward tracked from onTabUpdated signals
      var canBack = !!(activeTab && activeTab._canGoBack);
      var canFwd = !!(activeTab && activeTab._canGoForward);
      if (el.sourcesBrowserBackBtn) el.sourcesBrowserBackBtn.disabled = !canBack;
      if (el.sourcesBrowserForwardBtn) el.sourcesBrowserForwardBtn.disabled = !canFwd;
    } else {
      var wv = getSourcesBrowserWebview();
      if (!wv) return;
      if (el.sourcesBrowserBackBtn) {
        try {
          var canBack = !!(wv && typeof wv.canGoBack === 'function' && wv.canGoBack());
          el.sourcesBrowserBackBtn.disabled = !(canBack || !activeHome);
        } catch (_e) {
          el.sourcesBrowserBackBtn.disabled = !!activeHome;
        }
      }
      if (el.sourcesBrowserForwardBtn) {
        try { el.sourcesBrowserForwardBtn.disabled = !wv.canGoForward(); } catch (_e2) { el.sourcesBrowserForwardBtn.disabled = true; }
      }
    }
    if (el.sourcesBrowserReloadBtn) {
      el.sourcesBrowserReloadBtn.classList.toggle('isLoading', !!state.sourcesBrowserLoading);
      if (state.sourcesBrowserLoading) {
        el.sourcesBrowserReloadBtn.title = 'Stop loading';
        el.sourcesBrowserReloadBtn.setAttribute('aria-label', 'Stop loading');
      } else {
        el.sourcesBrowserReloadBtn.title = 'Reload';
        el.sourcesBrowserReloadBtn.setAttribute('aria-label', 'Reload');
      }
    }
  }

  function applySourcesBrowserViewportLayout() {
    if (isButterfly) {
      // Native Qt browser — BrowserWidget QStackedWidget manages its own geometry.
      return;
    }
    // Electron: position <webview> via CSS
    syncSourcesWebviewVisibility();
    var metrics = getSourcesBrowserViewportMetrics();
    if (!metrics) return;
    var activeTab = getSourcesActiveTab();
    var activeHome = !!(activeTab && activeTab.home);
    var wv = metrics.wv;
    var vw = metrics.width;
    var vh = metrics.height;
    var visible = metrics.visible;
    var interactive = visible && !state.sourcesBrowserOverlayLocked && !activeHome;
    wv.style.visibility = (visible && !activeHome) ? 'visible' : 'hidden';
    wv.style.pointerEvents = interactive ? 'auto' : 'none';
    wv.style.position = 'absolute';
    // Electron docs: keep webview as flex so internal iframe fills host bounds.
    wv.style.display = activeHome ? 'none' : 'flex';
    wv.style.left = '0px';
    wv.style.top = '0px';
    wv.style.right = '0px';
    wv.style.bottom = '0px';
    wv.style.width = '100%';
    wv.style.height = '100%';
    wv.style.transform = 'translateZ(0)';
    wv.style.borderRadius = '8px';
    wv.style.zIndex = '1';
    try {
      wv.removeAttribute('minwidth');
      wv.removeAttribute('maxwidth');
      wv.removeAttribute('minheight');
      wv.removeAttribute('maxheight');
    } catch (_eAttr) {}
    if (vw < 8 || vh < 8) {
      wv.style.visibility = 'hidden';
      wv.style.pointerEvents = 'none';
    }
    state.sourcesBrowserLastHostWidth = vw;
    state.sourcesBrowserLastHostHeight = vh;
    if (visible && vw >= 8 && vh >= 8) setSourcesBrowserRenderState('ok');
  }

  function scheduleSourcesBrowserViewportLayout() {
    if (state.sourcesBrowserLayoutRaf) return;
    state.sourcesBrowserLayoutRaf = requestAnimationFrame(function () {
      state.sourcesBrowserLayoutRaf = 0;
      applySourcesBrowserViewportLayout();
      if (state.sourcesBrowserLayoutSettleTimer) {
        try { clearTimeout(state.sourcesBrowserLayoutSettleTimer); } catch (_e0) {}
      }
      state.sourcesBrowserLayoutSettleTimer = setTimeout(function () {
        state.sourcesBrowserLayoutSettleTimer = 0;
        applySourcesBrowserViewportLayout();
      }, 120);
    });
  }

  function scheduleSourcesBrowserRepaintKick() {
    var wv = getSourcesBrowserWebview();
    var viewport = wv && wv.parentElement;
    if (!wv || !viewport) return;
    scheduleSourcesBrowserViewportLayout();
  }

  function runSourcesBrowserRenderWatchdog() {
    scheduleSourcesBrowserViewportLayout();
    runSourcesBrowserRecoveryPass();
  }

  function scheduleSourcesBrowserLoadingSettleCheck() {
    var wv = getSourcesBrowserWebview();
    if (!wv) return;
    if (state.sourcesBrowserLoadSettleTimer) {
      try { clearTimeout(state.sourcesBrowserLoadSettleTimer); } catch (_e) {}
      state.sourcesBrowserLoadSettleTimer = 0;
    }
    var attempts = 0;
    function tick() {
      attempts++;
      var loading = false;
      try { loading = !!(typeof wv.isLoading === 'function' && wv.isLoading()); } catch (_e2) { loading = false; }
      if (!loading) {
        state.sourcesBrowserLoading = false;
        refreshSourcesBrowserNav();
        setSourcesBrowserStatus(String(state.sourcesBrowserUrl || 'Ready'), false);
        setSourcesBrowserRenderState('ok');
        state.sourcesBrowserLoadSettleTimer = 0;
        return;
      }
      if (attempts >= 8) {
        // Safety stop to avoid indefinite spinner when engine events are missed.
        state.sourcesBrowserLoading = false;
        refreshSourcesBrowserNav();
        setSourcesBrowserStatus(String(state.sourcesBrowserUrl || 'Ready'), false);
        setSourcesBrowserRenderState('ok');
        state.sourcesBrowserLoadSettleTimer = 0;
        return;
      }
      state.sourcesBrowserLoadSettleTimer = setTimeout(tick, 450);
    }
    state.sourcesBrowserLoadSettleTimer = setTimeout(tick, 500);
  }

  function navigateSourcesBrowser(raw, opts) {
    var options = (opts && typeof opts === 'object') ? opts : {};
    var active = getSourcesActiveTab();
    if (!active) {
      active = openSourcesTab('', { switchTo: true, persist: false, home: true });
      if (!active) return false;
    }
    var target = normalizeSourcesBrowserInput(raw);
    if (!target) return false;
    if (target === 'about:blank') target = getSourcesBrowserStartUrl();
    var rawInput = String(raw || '').trim();
    var searchUrlForRaw = getSourcesSearchUrl(rawInput);
    if (rawInput && searchUrlForRaw && target === searchUrlForRaw && api.webSearch && typeof api.webSearch.add === 'function') {
      try { api.webSearch.add(rawInput); } catch (_eSearchAdd) {}
    }
    state.sourcesBrowserNavToken += 1;
    state.sourcesBrowserRecoveryStage = 0;
    state.sourcesBrowserRecoveryNavToken = -1;
    if (state.sourcesBrowserRecoveryTimer) {
      try { clearTimeout(state.sourcesBrowserRecoveryTimer); } catch (_eClear) {}
      state.sourcesBrowserRecoveryTimer = 0;
    }
    active.home = false;
    setSourcesBrowserRenderState('ok');
    state.sourcesBrowserUrl = target;
    active.url = target;
    if (el.sourcesBrowserUrlInput && !options.keepInput) el.sourcesBrowserUrlInput.value = target;
    syncSourcesBrowserOmniPlaceholder();
    renderSourcesBrowserHome();
    if (isButterfly) {
      // Butterfly: delegate navigation to Qt
      if (active._bridgeTabId) {
        try { api.webTabManager.navigateTo({ tabId: active._bridgeTabId, url: target }); } catch (_eBNav) {}
        try { api.webTabManager.setTabHome({ tabId: active._bridgeTabId, home: false }); } catch (_eBHome) {}
      } else {
        // _bridgeTabId not yet set (createTab Promise pending) — queue for later
        active._pendingNav = { url: target };
      }
      active.loading = true;
      state.sourcesBrowserLoading = true;
      refreshSourcesBrowserNav();
      setSourcesBrowserStatus('Loading...', true);
      scheduleSourcesBrowserViewportLayout();
      if (options.persist !== false) persistSourcesBrowserLastUrl(target);
      return true;
    }
    // Electron: use webview.loadURL
    var wv = active.webview;
    if (!wv) return false;
    try {
      wv.loadURL(target);
      active.loading = true;
      state.sourcesBrowserLoading = true;
      refreshSourcesBrowserNav();
      setSourcesBrowserStatus('Loading...', true);
      scheduleSourcesBrowserViewportLayout();
      if (options.persist !== false) persistSourcesBrowserLastUrl(target);
      if (options.focus && typeof wv.focus === 'function') {
        setTimeout(function () {
          try { wv.focus(); } catch (_focusErr) {}
        }, 0);
      }
      return true;
    } catch (_e) {
      setSourcesBrowserStatus('Failed to load URL', false);
      return false;
    }
  }

  function submitSourcesHomeSearch(raw, engineKey) {
    var active = getSourcesActiveTab();
    if (!active) return;
    var homeState = getSourcesHomeStateForTab(active);
    if (homeState) {
      homeState.query = String(raw || '').trim();
      var chosen = String(engineKey || '').trim().toLowerCase();
      if (!chosen) chosen = getSourcesActiveSearchEngineKey();
      homeState.engine = chosen;
      if (state.browserSettings && String(state.browserSettings.defaultSearchEngine || '') !== chosen) {
        saveBrowserSettings({ defaultSearchEngine: chosen });
      }
    }
    syncSourcesBrowserOmniPlaceholder();
    navigateSourcesBrowser(raw, { focus: true });
  }

  function renderSourcesBrowserHistoryRows(query) {
    if (!el.sourcesBrowserHistoryList) return;
    var q = String(query || '').trim().toLowerCase();
    var rows = Array.isArray(state.sourcesBrowserHistoryRows) ? state.sourcesBrowserHistoryRows.slice() : [];
    if (q) {
      rows = rows.filter(function (r) {
        var t = String(r && r.title || '').toLowerCase();
        var u = String(r && r.url || '').toLowerCase();
        return t.indexOf(q) !== -1 || u.indexOf(q) !== -1;
      });
    }
    rows.sort(function (a, b) { return Number(b && b.visitedAt || 0) - Number(a && a.visitedAt || 0); });
    var html = '';
    var lastDateKey = '';
    for (var i = 0; i < Math.min(rows.length, MAX_BROWSING_HISTORY_UI); i++) {
      var r = rows[i] || {};
      var visitedAt = Number(r.visitedAt || Date.now());
      var dt = new Date(visitedAt);
      var dateKey = '';
      var dateLabel = '';
      try {
        dateKey = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
        var now = new Date();
        var todayKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        var yd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        var yesterdayKey = yd.getFullYear() + '-' + String(yd.getMonth() + 1).padStart(2, '0') + '-' + String(yd.getDate()).padStart(2, '0');
        if (dateKey === todayKey) dateLabel = 'Today';
        else if (dateKey === yesterdayKey) dateLabel = 'Yesterday';
        else dateLabel = dt.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      } catch (_eDate) {
        dateKey = '';
        dateLabel = 'Earlier';
      }
      if (dateKey !== lastDateKey) {
        html += '<div class="sourcesBrowserHistoryDateGroup">' + escapeHtml(dateLabel) + '</div>';
        lastDateKey = dateKey;
      }
      var when = '';
      try { when = dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); } catch (_eWhen) { when = ''; }
      var url = String(r.url || '').trim();
      var id = String(r.id || '');
      var title = getSourcesHistoryTitle(url, r.title) || '-';
      var favicon = String(r.favicon || '').trim();
      var faviconHtml = favicon
        ? '<img class="sourcesBrowserHistoryFavicon" src="' + escapeHtml(favicon) + '" alt="">'
        : '<span class="sourcesBrowserHistoryFavicon sourcesBrowserHistoryFaviconFallback"></span>';
      html += '<div class="sourcesBrowserHistoryRow" data-history-url="' + escapeHtml(url) + '" data-history-id="' + escapeHtml(id) + '">'
        + faviconHtml
        + '<div class="sourcesBrowserHistoryInfo">'
          + '<div class="sourcesBrowserHistoryTitle" title="' + escapeHtml(title) + '">' + escapeHtml(title) + '</div>'
          + '<div class="sourcesBrowserHistoryUrl" title="' + escapeHtml(url) + '">' + escapeHtml(url || '-') + '</div>'
        + '</div>'
        + '<div class="sourcesBrowserHistoryTime">' + escapeHtml(when || '-') + '</div>'
        + '<button class="sourcesBrowserHistoryRemoveBtn" type="button" title="Remove" data-history-remove-id="' + escapeHtml(id) + '">×</button>'
      + '</div>';
    }
    el.sourcesBrowserHistoryList.innerHTML = html;
    if (el.sourcesBrowserHistoryEmpty) el.sourcesBrowserHistoryEmpty.classList.toggle('hidden', !!html);
  }

  function renderSourcesBrowserBookmarksRows() {
    if (!el.sourcesBrowserBookmarksList) return;
    var rows = Array.isArray(state.bookmarks) ? state.bookmarks.slice() : [];
    rows.sort(function (a, b) { return Number(b && b.updatedAt || 0) - Number(a && a.updatedAt || 0); });
    if (!rows.length) {
      el.sourcesBrowserBookmarksList.innerHTML = '';
      if (el.sourcesBrowserBookmarksEmpty) el.sourcesBrowserBookmarksEmpty.classList.remove('hidden');
      return;
    }
    if (el.sourcesBrowserBookmarksEmpty) el.sourcesBrowserBookmarksEmpty.classList.add('hidden');
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || {};
      var id = String(r.id || '').trim();
      var url = String(r.url || '').trim();
      var title = getSourcesHistoryTitle(url, r.title);
      var favicon = String(r.favicon || getFaviconUrl(url) || '').trim();
      var faviconHtml = favicon
        ? '<img class="sourcesBrowserHistoryFavicon" src="' + escapeHtml(favicon) + '" alt="">'
        : '<span class="sourcesBrowserHistoryFavicon sourcesBrowserHistoryFaviconFallback"></span>';
      html += '<div class="sourcesBrowserHistoryRow" data-bookmark-url="' + escapeHtml(url) + '" data-bookmark-id="' + escapeHtml(id) + '">'
        + faviconHtml
        + '<div class="sourcesBrowserHistoryInfo">'
          + '<div class="sourcesBrowserHistoryTitle" title="' + escapeHtml(title) + '">' + escapeHtml(title) + '</div>'
          + '<div class="sourcesBrowserHistoryUrl" title="' + escapeHtml(url) + '">' + escapeHtml(url || '-') + '</div>'
        + '</div>'
        + '<button class="sourcesBrowserHistoryRemoveBtn" type="button" title="Remove bookmark" data-bookmark-remove-id="' + escapeHtml(id) + '">x</button>'
      + '</div>';
    }
    el.sourcesBrowserBookmarksList.innerHTML = html;
  }

  function openSourcesBrowserDrawer(kind) {
    var panel = String(kind || '').trim().toLowerCase();
    if (!panel) return;
    state.sourcesBrowserDrawerKind = panel;
    if (el.sourcesBrowserDrawerTitle) {
      if (panel === 'history') el.sourcesBrowserDrawerTitle.textContent = 'History';
      else if (panel === 'bookmarks') el.sourcesBrowserDrawerTitle.textContent = 'Bookmarks';
      else if (panel === 'downloads') el.sourcesBrowserDrawerTitle.textContent = 'Downloads';
      else el.sourcesBrowserDrawerTitle.textContent = 'Panel';
    }
    if (el.sourcesBrowserHistoryOverlay) el.sourcesBrowserHistoryOverlay.classList.toggle('hidden', panel !== 'history');
    if (el.sourcesBrowserBookmarksPanel) el.sourcesBrowserBookmarksPanel.classList.toggle('hidden', panel !== 'bookmarks');
    if (el.sourcesBrowserDownloadsPanel) el.sourcesBrowserDownloadsPanel.classList.toggle('hidden', panel !== 'downloads');
    if (el.sourcesBrowserDrawerOverlay) el.sourcesBrowserDrawerOverlay.classList.remove('hidden');
    if (el.sourcesBrowserDrawer) {
      el.sourcesBrowserDrawer.classList.remove('hidden');
      el.sourcesBrowserDrawer.setAttribute('aria-hidden', 'false');
    }
    if (panel === 'history') {
      setSourcesOmniExpanded(false, { keepValue: true, select: false });
      if (!api.webHistory || typeof api.webHistory.list !== 'function') {
        showToast('History service unavailable');
      } else {
        api.webHistory.list({ scope: 'sources_browser', limit: MAX_BROWSING_HISTORY_UI }).then(function (res) {
          state.sourcesBrowserHistoryRows = (res && res.ok && Array.isArray(res.entries)) ? res.entries : [];
          renderSourcesBrowserHistoryRows(el.sourcesBrowserHistorySearchInput && el.sourcesBrowserHistorySearchInput.value);
          if (el.sourcesBrowserHistorySearchInput) {
            setTimeout(function () {
              try { el.sourcesBrowserHistorySearchInput.focus(); } catch (_eHistFocus) {}
            }, 0);
          }
        }).catch(function () {
          showToast('Failed to load history');
        });
      }
    } else if (panel === 'bookmarks') {
      setSourcesOmniExpanded(false, { keepValue: true, select: false });
      if (api.webBookmarks && typeof api.webBookmarks.list === 'function') {
        api.webBookmarks.list().then(function (res) {
          state.bookmarks = (res && res.ok && Array.isArray(res.bookmarks)) ? res.bookmarks : [];
          renderSourcesBrowserBookmarksRows();
        }).catch(function () {
          state.bookmarks = [];
          renderSourcesBrowserBookmarksRows();
          showToast('Failed to load bookmarks');
        });
      } else {
        state.bookmarks = [];
        renderSourcesBrowserBookmarksRows();
      }
    } else if (panel === 'downloads') {
      setSourcesOmniExpanded(false, { keepValue: true, select: false });
      renderSourcesBrowserDownloadsRows();
    }
    syncSourcesBrowserOverlayLock();
  }

  function closeSourcesBrowserDrawer() {
    state.sourcesBrowserDrawerKind = '';
    if (el.sourcesBrowserDrawerOverlay) el.sourcesBrowserDrawerOverlay.classList.add('hidden');
    if (el.sourcesBrowserDrawer) {
      el.sourcesBrowserDrawer.classList.add('hidden');
      el.sourcesBrowserDrawer.setAttribute('aria-hidden', 'true');
    }
    if (el.sourcesBrowserHistoryOverlay) el.sourcesBrowserHistoryOverlay.classList.add('hidden');
    if (el.sourcesBrowserBookmarksPanel) el.sourcesBrowserBookmarksPanel.classList.add('hidden');
    if (el.sourcesBrowserDownloadsPanel) el.sourcesBrowserDownloadsPanel.classList.add('hidden');
    syncSourcesBrowserOverlayLock();
  }

  function openSourcesBrowserHistoryOverlay() {
    openSourcesBrowserDrawer('history');
  }

  function closeSourcesBrowserHistoryOverlay() {
    closeSourcesBrowserDrawer();
  }

  function syncSourcesBrowserOverlayLock() {
    var locked = false;
    if (el.sourcesBrowserDrawer && !el.sourcesBrowserDrawer.classList.contains('hidden')) locked = true;
    if (el.sourcesBrowserTabSearchOverlay && !el.sourcesBrowserTabSearchOverlay.classList.contains('hidden')) locked = true;
    if (el.torrentProvidersOverlay && !el.torrentProvidersOverlay.classList.contains('hidden')) locked = true;
    if (el.sourcesBrowserCtxOverlay && !el.sourcesBrowserCtxOverlay.classList.contains('hidden')) locked = true;
    state.sourcesBrowserOverlayLocked = locked;
    scheduleSourcesBrowserViewportLayout();
    if (!locked) runSourcesBrowserRenderWatchdog();
  }

  function initSourcesBrowser() {
    if (state.sourcesBrowserBound) return;
    state.sourcesBrowserBound = true;

    if (isButterfly) {
      // Butterfly: register bridge signal listeners for tab state sync
      if (api.webTabManager) {
        if (typeof api.webTabManager.onTabUpdated === 'function') {
          api.webTabManager.onTabUpdated(function (raw) {
            var data = (typeof raw === 'string') ? JSON.parse(raw) : raw;
            if (!data || !data.tabId) return;
            var tab = getTabByBridgeId(data.tabId);
            if (!tab) return;
            if (data.url != null) tab.url = String(data.url);
            if (data.title != null) tab.title = String(data.title);
            if (data.icon != null) tab.favicon = String(data.icon);
            if (data.loading != null) tab.loading = !!data.loading;
            if (data.canGoBack != null) tab._canGoBack = !!data.canGoBack;
            if (data.canGoForward != null) tab._canGoForward = !!data.canGoForward;
            var isActive = String(tab.id) === String(state.sourcesActiveTabId);
            if (isActive) {
              if (data.url != null) {
                state.sourcesBrowserUrl = tab.home ? '' : String(data.url);
                syncSourcesBrowserUrlInput();
                if (isAllowedSourcesHistoryUrl(data.url)) maybeRecordSourcesHistory(tab, data.url, 'page-url-updated');
              }
              if (data.title != null) {
                if (isAllowedSourcesHistoryUrl(tab.url)) maybeRecordSourcesHistory(tab, tab.url, 'page-title-updated');
              }
              refreshSourcesBrowserNav();
              refreshSourcesBrowserBookmarkUi(tab.home ? '' : (tab.url || ''));
            }
            renderSourcesBrowserTabStrip();
          });
        }
        if (typeof api.webTabManager.onTabCreated === 'function') {
          api.webTabManager.onTabCreated(function (raw) {
            var data = (typeof raw === 'string') ? JSON.parse(raw) : raw;
            if (!data || !data.tabId) return;
            var source = String(data.source || '').trim().toLowerCase();
            // Only host-initiated creations should come through this path.
            if (source && source !== 'popup') return;
            if (!source) {
              // Legacy fallback: ignore ambiguous events while renderer createTab is pending.
              for (var p = 0; p < state.sourcesTabs.length; p++) {
                var pt = state.sourcesTabs[p];
                if (pt && pt._creationPending && !pt._bridgeTabId) return;
              }
            }
            var existing = getTabByBridgeId(data.tabId);
            if (existing) return; // Already tracked from openSourcesTab
            // Qt created a tab (e.g. from createWindow) — create matching JS tab
            var id = 'st_' + String(state.sourcesTabSeq++);
            var tab = {
              id: id,
              webview: null,
              _bridgeTabId: data.tabId,
              _creationPending: false,
              url: String(data.url || ''),
              title: String(data.title || 'New Tab'),
              pinned: false,
              loading: false,
              favicon: '',
              lastHistoryUrl: '',
              lastHistoryAt: 0,
              home: !!data.home,
              _canGoBack: false,
              _canGoForward: false,
            };
            getSourcesHomeStateForTab(tab);
            state.sourcesTabs.push(tab);
            renderSourcesBrowserTabStrip();
            switchSourcesTab(tab.id, { focus: false });
          });
        }
        if (typeof api.webTabManager.onTabClosed === 'function') {
          api.webTabManager.onTabClosed(function (raw) {
            var data = (typeof raw === 'string') ? JSON.parse(raw) : raw;
            if (!data || !data.tabId) return;
            var tab = getTabByBridgeId(data.tabId);
            if (!tab) return;
            // Qt closed a tab — remove from JS state
            var idx = state.sourcesTabs.indexOf(tab);
            if (idx !== -1) state.sourcesTabs.splice(idx, 1);
            if (!state.sourcesTabs.length) {
              openSourcesTab('', { switchTo: true, persist: false, home: true, focus: true });
              return;
            }
            var next = state.sourcesTabs[Math.max(0, idx - 1)] || state.sourcesTabs[0];
            switchSourcesTab(next && next.id, { focus: false });
          });
        }
        if (typeof api.webTabManager.onMagnetRequested === 'function') {
          api.webTabManager.onMagnetRequested(function (raw) {
            var data = (typeof raw === 'string') ? JSON.parse(raw) : raw;
            if (data && data.url) emit('openMagnet', data.url);
          });
        }
      }
      if (!state.sourcesBridgeContextMenuBound && api.webBrowserActions && typeof api.webBrowserActions.onContextMenu === 'function') {
        state.sourcesBridgeContextMenuBound = true;
        api.webBrowserActions.onContextMenu(function (raw) {
          var data = (typeof raw === 'string') ? JSON.parse(raw) : raw;
          if (!data || typeof data !== 'object') return;
          var bridgeTabId = String(data.tabId || '').trim();
          var tab = bridgeTabId ? getTabByBridgeId(bridgeTabId) : null;
          if (!tab) tab = getSourcesActiveTab();
          showSourcesWebviewContextMenu(data, tab);
        });
      }
      // Butterfly: observe viewport for resize bounds reporting
      var viewport = el.sourcesBrowserViewport || document.querySelector('.sourcesBrowserViewport');
      if (viewport && !state.sourcesBrowserResizeObserver && typeof ResizeObserver === 'function') {
        try {
          state.sourcesBrowserResizeObserver = new ResizeObserver(function () {
            scheduleSourcesBrowserViewportLayout();
          });
          state.sourcesBrowserResizeObserver.observe(viewport);
        } catch (_eObs) {
          state.sourcesBrowserResizeObserver = null;
        }
      }
    } else {
      // Electron: set up base webview
      var baseWv = el.sourcesBrowserWebview;
      if (!baseWv) return;
      try { baseWv.removeAttribute('autosize'); } catch (_e0) {}
      var viewport = baseWv.parentElement;
      if (viewport && !state.sourcesBrowserResizeObserver && typeof ResizeObserver === 'function') {
        try {
          state.sourcesBrowserResizeObserver = new ResizeObserver(function () {
            scheduleSourcesBrowserViewportLayout();
          });
          state.sourcesBrowserResizeObserver.observe(viewport);
        } catch (_eObs) {
          state.sourcesBrowserResizeObserver = null;
        }
      }
    }

    mountSourcesBrowserHomePanels();
    syncSourcesBrowserOmniPlaceholder();
    setSourcesOmniExpanded(false, { keepValue: true, select: false });

    if (el.sourcesBrowserOmniChip) {
      el.sourcesBrowserOmniChip.addEventListener('click', function () {
        setSourcesOmniExpanded(true);
      });
      el.sourcesBrowserOmniChip.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        showSourcesHomeContextMenu({
          x: e.clientX,
          y: e.clientY,
          omniChip: true,
        });
      });
    }

    if (el.sourcesBrowserGoBtn) {
      el.sourcesBrowserGoBtn.addEventListener('click', function () {
        if (!state.sourcesOmniExpanded) {
          setSourcesOmniExpanded(true);
          return;
        }
        closeSourcesOmniDropdown();
        navigateSourcesBrowser(el.sourcesBrowserUrlInput && el.sourcesBrowserUrlInput.value, { focus: true });
        setSourcesOmniExpanded(false, { keepValue: true, select: false });
      });
    }
    if (el.sourcesBrowserUrlInput) {
      el.sourcesBrowserUrlInput.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') {
          if (!state.sourcesOmniOpen) return;
          e.preventDefault();
          selectSourcesOmniRow(state.sourcesOmniSelectedIdx + 1, true);
          return;
        }
        if (e.key === 'ArrowUp') {
          if (!state.sourcesOmniOpen) return;
          e.preventDefault();
          selectSourcesOmniRow(state.sourcesOmniSelectedIdx - 1, true);
          return;
        }
        if (e.key === 'Tab') {
          if (!state.sourcesOmniOpen) return;
          e.preventDefault();
          selectSourcesOmniRow(state.sourcesOmniSelectedIdx, true);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          if (state.sourcesOmniOpen) closeSourcesOmniDropdown();
          setSourcesOmniExpanded(false, { keepValue: true, select: false });
          return;
        }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (state.sourcesOmniOpen && runSourcesOmniResult(state.sourcesOmniSelectedIdx)) return;
        closeSourcesOmniDropdown();
        navigateSourcesBrowser(el.sourcesBrowserUrlInput.value, { focus: true });
        setSourcesOmniExpanded(false, { keepValue: true, select: false });
      });
      el.sourcesBrowserUrlInput.addEventListener('input', function () {
        if (state.sourcesOmniSuppressInputOnce) {
          state.sourcesOmniSuppressInputOnce = false;
          return;
        }
        requestSourcesOmniSuggestions(el.sourcesBrowserUrlInput.value);
      });
      el.sourcesBrowserUrlInput.addEventListener('focus', function () {
        if (!state.sourcesOmniExpanded) setSourcesOmniExpanded(true, { keepValue: true, select: false });
        requestSourcesOmniSuggestions(el.sourcesBrowserUrlInput.value);
      });
      el.sourcesBrowserUrlInput.addEventListener('blur', function () {
        setTimeout(function () {
          closeSourcesOmniDropdown();
          if (document.activeElement === el.sourcesBrowserUrlInput) return;
          if (state.sourcesBrowserDrawerKind) return;
          setSourcesOmniExpanded(false, { keepValue: true, select: false });
        }, 120);
      });
    }
    if (el.sourcesBrowserOmniDropdown) {
      el.sourcesBrowserOmniDropdown.addEventListener('mousedown', function (e) {
        var row = e.target && e.target.closest ? e.target.closest('[data-sources-omni-index]') : null;
        if (!row) return;
        e.preventDefault();
        runSourcesOmniResult(Number(row.getAttribute('data-sources-omni-index')));
      });
    }
    if (el.sourcesBrowserBackBtn) {
      el.sourcesBrowserBackBtn.addEventListener('click', function () {
        var active = getSourcesActiveTab();
        var navigated = false;
        if (isButterfly) {
          if (active && active._bridgeTabId && active._canGoBack) {
            try { api.webTabManager.goBack({ tabId: active._bridgeTabId }); } catch (_eBBack) {}
            navigated = true;
          }
        } else {
          var wv = getSourcesBrowserWebview();
          try {
            if (wv && typeof wv.canGoBack === 'function' && wv.canGoBack()) {
              wv.goBack();
              navigated = true;
            }
          } catch (_e) {}
        }
        if (!navigated && active && !active.home) {
          active.home = true;
          state.sourcesBrowserUrl = '';
          switchSourcesTab(active.id, { focus: false });
        }
      });
    }
    if (el.sourcesBrowserHomeBtn) {
      el.sourcesBrowserHomeBtn.addEventListener('click', function () {
        var active = getSourcesActiveTab();
        if (!active) {
          openSourcesTab('', { switchTo: true, persist: false, home: true, focus: true });
          return;
        }
        active.home = true;
        state.sourcesBrowserUrl = '';
        switchSourcesTab(active.id, { focus: false });
      });
    }
    if (el.sourcesBrowserForwardBtn) {
      el.sourcesBrowserForwardBtn.addEventListener('click', function () {
        if (isButterfly) {
          var active = getSourcesActiveTab();
          if (active && active._bridgeTabId && active._canGoForward) {
            try { api.webTabManager.goForward({ tabId: active._bridgeTabId }); } catch (_eBFwd) {}
          }
          return;
        }
        var wv = getSourcesBrowserWebview();
        try { if (wv && wv.canGoForward()) wv.goForward(); } catch (_e) {}
      });
    }
    if (el.sourcesBrowserReloadBtn) {
      el.sourcesBrowserReloadBtn.addEventListener('click', function () {
        var active = getSourcesActiveTab();
        if (isButterfly) {
          if (active && active._bridgeTabId) {
            try {
              if (state.sourcesBrowserLoading) api.webTabManager.stop({ tabId: active._bridgeTabId });
              else api.webTabManager.reload({ tabId: active._bridgeTabId });
            } catch (_eBReload) {}
          }
          return;
        }
        var wv = active && active.webview ? active.webview : getSourcesBrowserWebview();
        try {
          if (!wv) return;
          if (state.sourcesBrowserLoading && typeof wv.stop === 'function') wv.stop();
          else if (typeof wv.reload === 'function') wv.reload();
        } catch (_e) {}
      });
    }
    if (el.sourcesBrowserBookmarkBtn) {
      el.sourcesBrowserBookmarkBtn.addEventListener('click', function () {
        if (!api.webBookmarks || typeof api.webBookmarks.toggle !== 'function') return;
        var active = getSourcesActiveTab();
        var wv = active && active.webview ? active.webview : getSourcesBrowserWebview();
        var target = String((active && active.url) || state.sourcesBrowserUrl || (el.sourcesBrowserUrlInput && el.sourcesBrowserUrlInput.value) || '').trim();
        if (!target) return;
        var title = '';
        try { title = String((active && active.title) || (wv && wv.getTitle && wv.getTitle()) || '').trim(); } catch (_e) {}
        api.webBookmarks.toggle({ url: target, title: title, favicon: getFaviconUrl(target) }).then(function () {
          refreshSourcesBrowserBookmarkUi(target);
          renderSourcesBrowserBookmarksRows();
          if (panels.renderBookmarkBar) panels.renderBookmarkBar();
          if (hub.renderHubBookmarks) hub.renderHubBookmarks();
        }).catch(function () {});
      });
    }
    if (el.sourcesBrowserBookmarksBtn) {
      el.sourcesBrowserBookmarksBtn.addEventListener('click', function () {
        openSourcesBrowserDrawer('bookmarks');
      });
    }
    if (el.sourcesBrowserHistoryBtn) {
      el.sourcesBrowserHistoryBtn.addEventListener('click', function () {
        openSourcesBrowserHistoryOverlay();
      });
    }
    if (el.sourcesBrowserDownloadsBtn) {
      el.sourcesBrowserDownloadsBtn.addEventListener('click', function () {
        var active = getSourcesActiveTab();
        if (active && active.home && el.sourcesBrowserHomeDownloadsBody) {
          closeSourcesBrowserDrawer();
          var section = el.sourcesBrowserHomeDownloadsBody.closest
            ? el.sourcesBrowserHomeDownloadsBody.closest('.sourcesBrowserHomeSection')
            : null;
          if (section && typeof section.scrollIntoView === 'function') {
            section.scrollIntoView({ block: 'start', behavior: 'smooth' });
          }
          return;
        }
        openSourcesBrowserDrawer('downloads');
      });
    }
    if (el.sourcesBrowserDrawerCloseBtn) {
      el.sourcesBrowserDrawerCloseBtn.addEventListener('click', closeSourcesBrowserDrawer);
    }
    if (el.sourcesBrowserDrawerOverlay) {
      el.sourcesBrowserDrawerOverlay.addEventListener('click', function () {
        closeSourcesBrowserDrawer();
      });
    }
    if (el.sourcesBrowserHistorySearchInput) {
      el.sourcesBrowserHistorySearchInput.addEventListener('input', function () {
        renderSourcesBrowserHistoryRows(el.sourcesBrowserHistorySearchInput.value);
      });
    }
    if (el.sourcesBrowserHistoryClearBtn) {
      el.sourcesBrowserHistoryClearBtn.addEventListener('click', function () {
        if (!api.webHistory || typeof api.webHistory.clear !== 'function') return;
        api.webHistory.clear({ scope: 'sources_browser' }).then(function () {
          state.sourcesBrowserHistoryRows = [];
          renderSourcesBrowserHistoryRows('');
          if (el.sourcesBrowserHistorySearchInput) el.sourcesBrowserHistorySearchInput.value = '';
          refreshSourcesBrowserHomeShortcuts();
        }).catch(function () {
          showToast('Failed to clear history');
        });
      });
    }
    if (el.sourcesBrowserHistoryList) {
      el.sourcesBrowserHistoryList.addEventListener('click', function (e) {
        var removeBtn = e.target && e.target.closest ? e.target.closest('[data-history-remove-id]') : null;
        if (removeBtn) {
          var removeId = String(removeBtn.getAttribute('data-history-remove-id') || '').trim();
          if (!removeId || !api.webHistory || typeof api.webHistory.remove !== 'function') return;
          api.webHistory.remove({ id: removeId }).then(function () {
            state.sourcesBrowserHistoryRows = (state.sourcesBrowserHistoryRows || []).filter(function (x) {
              return !(x && String(x.id) === removeId);
            });
            renderSourcesBrowserHistoryRows(el.sourcesBrowserHistorySearchInput && el.sourcesBrowserHistorySearchInput.value);
            refreshSourcesBrowserHomeShortcuts();
          }).catch(function () {
            showToast('Failed to remove history entry');
          });
          return;
        }
        var row = e.target && e.target.closest ? e.target.closest('.sourcesBrowserHistoryRow[data-history-url]') : null;
        if (!row) return;
        var url = String(row.getAttribute('data-history-url') || '').trim();
        if (!url) return;
        closeSourcesBrowserHistoryOverlay();
        navigateSourcesBrowser(url, { focus: true });
      });
    }
    if (el.sourcesBrowserBookmarksList) {
      el.sourcesBrowserBookmarksList.addEventListener('click', function (e) {
        var removeBtn = e.target && e.target.closest ? e.target.closest('[data-bookmark-remove-id]') : null;
        if (removeBtn) {
          var removeId = String(removeBtn.getAttribute('data-bookmark-remove-id') || '').trim();
          if (!removeId || !api.webBookmarks || typeof api.webBookmarks.remove !== 'function') return;
          api.webBookmarks.remove({ id: removeId }).then(function () {
            state.bookmarks = (state.bookmarks || []).filter(function (b) { return !(b && String(b.id) === removeId); });
            renderSourcesBrowserBookmarksRows();
            refreshSourcesBrowserBookmarkUi(state.sourcesBrowserUrl || '');
          }).catch(function () {
            showToast('Failed to remove bookmark');
          });
          return;
        }
        var row = e.target && e.target.closest ? e.target.closest('.sourcesBrowserHistoryRow[data-bookmark-url]') : null;
        if (!row) return;
        var url = String(row.getAttribute('data-bookmark-url') || '').trim();
        if (!url) return;
        closeSourcesBrowserDrawer();
        navigateSourcesBrowser(url, { focus: true });
      });
    }
    if (el.sourcesBrowserHomeSearchForm) {
      el.sourcesBrowserHomeSearchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var query = el.sourcesBrowserHomeSearchInput ? el.sourcesBrowserHomeSearchInput.value : '';
        var engine = el.sourcesBrowserHomeEngine ? el.sourcesBrowserHomeEngine.value : '';
        submitSourcesHomeSearch(query, engine);
      });
    }
    if (el.sourcesBrowserHomeSearchInput) {
      el.sourcesBrowserHomeSearchInput.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var query = el.sourcesBrowserHomeSearchInput.value;
        var engine = el.sourcesBrowserHomeEngine ? el.sourcesBrowserHomeEngine.value : '';
        submitSourcesHomeSearch(query, engine);
      });
      el.sourcesBrowserHomeSearchInput.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        showSourcesHomeContextMenu({
          x: e.clientX,
          y: e.clientY,
          isEditable: true,
        });
      });
    }
    if (el.sourcesBrowserHomeEngine) {
      el.sourcesBrowserHomeEngine.addEventListener('change', function () {
        var active = getSourcesActiveTab();
        var homeState = getSourcesHomeStateForTab(active);
        if (homeState) homeState.engine = String(el.sourcesBrowserHomeEngine.value || 'google').trim().toLowerCase() || 'google';
        syncSourcesBrowserOmniPlaceholder();
      });
    }
    if (el.sourcesBrowserHomeShortcuts) {
      el.sourcesBrowserHomeShortcuts.addEventListener('click', function (e) {
        var row = e.target && e.target.closest ? e.target.closest('[data-sources-home-url]') : null;
        if (!row) return;
        var url = String(row.getAttribute('data-sources-home-url') || '').trim();
        if (!url) return;
        navigateSourcesBrowser(url, { focus: true });
      });
      el.sourcesBrowserHomeShortcuts.addEventListener('contextmenu', function (e) {
        var row = e.target && e.target.closest ? e.target.closest('[data-sources-home-url]') : null;
        if (!row) return;
        e.preventDefault();
        showSourcesHomeContextMenu({
          x: e.clientX,
          y: e.clientY,
          homeUrl: String(row.getAttribute('data-sources-home-url') || '').trim(),
        });
      });
    }
    if (el.sourcesBrowserHomeRecentTabs) {
      el.sourcesBrowserHomeRecentTabs.addEventListener('click', function (e) {
        var row = e.target && e.target.closest ? e.target.closest('[data-sources-recent-tab-id]') : null;
        if (!row) return;
        var id = String(row.getAttribute('data-sources-recent-tab-id') || '').trim();
        if (!id) return;
        switchSourcesTab(id, { focus: true });
      });
      el.sourcesBrowserHomeRecentTabs.addEventListener('contextmenu', function (e) {
        var row = e.target && e.target.closest ? e.target.closest('[data-sources-recent-tab-id]') : null;
        if (!row) return;
        e.preventDefault();
        var id = String(row.getAttribute('data-sources-recent-tab-id') || '').trim();
        var tab = getSourcesTabById(id);
        showSourcesHomeContextMenu({
          x: e.clientX,
          y: e.clientY,
          homeUrl: String(tab && tab.url || '').trim(),
        });
      });
    }
    if (el.sourcesBrowserTabSearchCloseBtn) {
      el.sourcesBrowserTabSearchCloseBtn.addEventListener('click', closeSourcesTabSearchOverlay);
    }
    if (el.sourcesBrowserTabSearchOverlay) {
      el.sourcesBrowserTabSearchOverlay.addEventListener('click', function (e) {
        if (e.target === el.sourcesBrowserTabSearchOverlay) closeSourcesTabSearchOverlay();
      });
    }
    if (el.sourcesBrowserTabSearchInput) {
      el.sourcesBrowserTabSearchInput.addEventListener('input', function () {
        renderSourcesTabSearchRows(el.sourcesBrowserTabSearchInput.value);
      });
      el.sourcesBrowserTabSearchInput.addEventListener('keydown', function (e) {
        var matches = Array.isArray(state.sourcesTabSearchMatches) ? state.sourcesTabSearchMatches : [];
        if (e.key === 'ArrowDown') {
          if (!matches.length) return;
          e.preventDefault();
          state.sourcesTabSearchSelectedIdx = (state.sourcesTabSearchSelectedIdx + 1 + matches.length) % matches.length;
          renderSourcesTabSearchRows(el.sourcesBrowserTabSearchInput.value);
          return;
        }
        if (e.key === 'ArrowUp') {
          if (!matches.length) return;
          e.preventDefault();
          state.sourcesTabSearchSelectedIdx = (state.sourcesTabSearchSelectedIdx - 1 + matches.length) % matches.length;
          renderSourcesTabSearchRows(el.sourcesBrowserTabSearchInput.value);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          activateSourcesTabSearchResult(state.sourcesTabSearchSelectedIdx);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeSourcesTabSearchOverlay();
        }
      });
    }
    if (el.sourcesBrowserTabSearchList) {
      el.sourcesBrowserTabSearchList.addEventListener('click', function (e) {
        var row = e.target && e.target.closest ? e.target.closest('[data-sources-tab-search-index]') : null;
        if (!row) return;
        activateSourcesTabSearchResult(Number(row.getAttribute('data-sources-tab-search-index')));
      });
    }
    if (el.sourcesBrowserTabList) {
      el.sourcesBrowserTabList.addEventListener('click', function (e) {
        var closeBtn = e.target && e.target.closest ? e.target.closest('[data-sources-tab-close]') : null;
        if (closeBtn) {
          e.preventDefault();
          e.stopPropagation();
          closeSourcesTab(closeBtn.getAttribute('data-sources-tab-close'));
          return;
        }
        var tabEl = e.target && e.target.closest ? e.target.closest('[data-sources-tab-id]') : null;
        if (!tabEl) return;
        switchSourcesTab(tabEl.getAttribute('data-sources-tab-id'), { focus: true });
      });
      el.sourcesBrowserTabList.addEventListener('contextmenu', function (e) {
        var tabEl = e.target && e.target.closest ? e.target.closest('[data-sources-tab-id]') : null;
        if (!tabEl) return;
        e.preventDefault();
        showSourcesTabContextMenu(tabEl.getAttribute('data-sources-tab-id'), e.clientX, e.clientY);
      });
    }
    if (el.sourcesBrowserNewTabBtn) {
      el.sourcesBrowserNewTabBtn.addEventListener('click', function () {
        openSourcesTab('', { switchTo: true, focus: true, persist: false, home: true });
      });
    }
    if (el.sourcesBrowserCtxOverlay) {
      el.sourcesBrowserCtxOverlay.addEventListener('mousedown', function () {
        hideSourcesBrowserContextMenu();
      });
    }
    if (el.sourcesBrowserCtxMenu) {
      el.sourcesBrowserCtxMenu.addEventListener('click', function (e) {
        var row = e.target && e.target.closest ? e.target.closest('[data-sources-ctx-action]') : null;
        if (!row || row.disabled) return;
        var action = String(row.getAttribute('data-sources-ctx-action') || '').trim();
        hideSourcesBrowserContextMenu();
        runSourcesContextAction(action);
      });
    }
    document.addEventListener('mousedown', function (e) {
      if (!state.sourcesContextMenuMeta) return;
      if (el.sourcesBrowserCtxMenu && el.sourcesBrowserCtxMenu.contains(e.target)) return;
      if (el.sourcesBrowserCtxOverlay && e.target === el.sourcesBrowserCtxOverlay) return;
      hideSourcesBrowserContextMenu();
    });
    if (api.webHistory && typeof api.webHistory.onUpdated === 'function') {
      api.webHistory.onUpdated(function () {
        refreshSourcesBrowserHomeShortcuts();
      });
    }
    refreshSourcesBrowserHomeShortcuts();
    renderSourcesBrowserHome();
    var clearSourcesBrowserDownloads = function () {
      var src = state.downloads;
      if (Array.isArray(src)) {
        state.downloads = src.filter(function (d) {
          var st = String(d && d.state || '').toLowerCase();
          return st !== 'completed' && st !== 'cancelled' && st !== 'failed' && st !== 'interrupted';
        });
      } else if (src && typeof src === 'object') {
        var next = {};
        var keys = Object.keys(src);
        for (var i = 0; i < keys.length; i++) {
          var item = src[keys[i]];
          var s = String(item && item.state || '').toLowerCase();
          if (s === 'completed' || s === 'cancelled' || s === 'failed' || s === 'interrupted') continue;
          next[keys[i]] = item;
        }
        state.downloads = next;
      }
      renderHomeDownloads();
    };
    if (el.sourcesBrowserDownloadsClearBtn) {
      el.sourcesBrowserDownloadsClearBtn.addEventListener('click', clearSourcesBrowserDownloads);
    }
    if (el.sourcesBrowserHomeDownloadsClearBtn) {
      el.sourcesBrowserHomeDownloadsClearBtn.addEventListener('click', clearSourcesBrowserDownloads);
    }

    refreshSourcesBrowserNav();
    setSourcesBrowserStatus('Ready', false);
    window.addEventListener('resize', scheduleSourcesBrowserViewportLayout);
    if (!state.sourcesTabs.length) {
      var cfg = state.browserSettings && state.browserSettings.sourcesBrowser ? state.browserSettings.sourcesBrowser : null;
      var initialUrl = String((cfg && cfg.lastUrl) || '').trim();
      if (!initialUrl || initialUrl === 'about:blank') initialUrl = getSourcesBrowserStartUrl();
      openSourcesTab(initialUrl, { switchTo: true, focus: false, persist: false });
    } else {
      var current = getSourcesActiveTab() || state.sourcesTabs[0];
      if (current) switchSourcesTab(current.id, { focus: false });
    }
    renderSourcesBrowserTabStrip();
    scheduleSourcesBrowserViewportLayout();
  }

  function renderSourcesBrowserDownloadsRows() {
    var bodies = [];
    if (el.sourcesBrowserDownloadsBody) bodies.push(el.sourcesBrowserDownloadsBody);
    if (el.sourcesBrowserHomeDownloadsBody) bodies.push(el.sourcesBrowserHomeDownloadsBody);
    if (!bodies.length) return;
    var rows = getSourcesBrowserDownloadsList();
    rows.sort(function (a, b) {
      return Number(b && b.startedAt || b && b.updatedAt || 0) - Number(a && a.startedAt || a && a.updatedAt || 0);
    });
    if (!rows.length) {
      for (var bi = 0; bi < bodies.length; bi++) {
        bodies[bi].innerHTML = '<tr><td colspan="7" class="muted tiny">No downloads yet.</td></tr>';
      }
      return;
    }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var d = rows[i] || {};
      var id = String(d.id || '');
      var size = Number(d.totalBytes || d.received || 0);
      var received = Number(d.received || 0);
      var pct = '-';
      if (size > 0) pct = String(Math.max(0, Math.min(100, Math.round((received / size) * 100)))) + '%';
      var speed = formatSpeedForSources(d.speed || 0);
      var status = String(d.state || 'downloading');
      var action = '';
      if (status === 'completed') {
        action = '<button class="btn btn-ghost btn-sm" data-dl-open="' + escapeHtml(id) + '">Open</button>'
          + ' <button class="btn btn-ghost btn-sm" data-dl-show="' + escapeHtml(id) + '">Folder</button>';
      } else if (id) {
        action = '<button class="btn btn-ghost btn-sm" data-dl-cancel="' + escapeHtml(id) + '">Cancel</button>';
      }
      html += '<tr>'
        + '<td>' + (i + 1) + '</td>'
        + '<td class="sourcesSearchTitleCell" title="' + escapeHtml(String(d.filename || d.name || 'Download')) + '">' + escapeHtml(String(d.filename || d.name || 'Download')) + '</td>'
        + '<td>' + escapeHtml(formatBytesForSources(size)) + '</td>'
        + '<td>' + escapeHtml(speed) + '</td>'
        + '<td>' + escapeHtml(pct) + '</td>'
        + '<td>' + escapeHtml(status) + '</td>'
        + '<td>' + action + '</td>'
      + '</tr>';
    }
    for (var bi2 = 0; bi2 < bodies.length; bi2++) {
      bodies[bi2].innerHTML = html;
    }
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
  bridge.deps.addTabListener    = tabsState.addTabListener;

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
    ensureSourcesModeActive().then(function () {
      applySourcesWorkspace(state.sourcesSubMode === 'downloads' ? 'downloads' : 'search');
      initSourcesBrowser();
      if (source && source.url) {
        navigateSourcesBrowser(source.url, { focus: true });
      } else if (el.sourcesBrowserUrlInput) {
        setSourcesOmniExpanded(true);
      }
    });
  }

  function openHome() {
    ensureSourcesModeActive().then(function () {
      applySourcesWorkspace(state.sourcesSubMode === 'downloads' ? 'downloads' : 'search');
      initSourcesBrowser();
      openSourcesTab('', { switchTo: true, focus: true, persist: false, home: true });
    });
  }

  function openBrowserForTab(tabId) {
    var t = getSourcesTabById(tabId);
    if (t) {
      ensureSourcesModeActive().then(function () {
        applySourcesWorkspace(state.sourcesSubMode === 'downloads' ? 'downloads' : 'search');
        initSourcesBrowser();
        switchSourcesTab(t.id, { focus: true });
      });
    }
    else openHome();
  }

  function openNewTab() {
    ensureSourcesModeActive().then(function () {
      applySourcesWorkspace(state.sourcesSubMode === 'downloads' ? 'downloads' : 'search');
      initSourcesBrowser();
      openSourcesTab('', { switchTo: true, focus: true, persist: false, home: true });
    });
  }

  function closeBrowser() {
    var routerMode = '';
    try {
      var router = window.Tanko && window.Tanko.modeRouter;
      routerMode = router && typeof router.getMode === 'function' ? String(router.getMode() || '').toLowerCase() : '';
    } catch (_e) {}
    state.browserOpen = false;
    state.showBrowserHome = false;
    if (routerMode === 'sources' || !routerMode) {
      applySourcesWorkspace(state.sourcesSubMode === 'downloads' ? 'downloads' : 'search');
      requestAnimationFrame(function () {
        applySourcesWorkspace(state.sourcesSubMode === 'downloads' ? 'downloads' : 'search');
      });
      setTimeout(function () {
        applySourcesWorkspace(state.sourcesSubMode === 'downloads' ? 'downloads' : 'search');
      }, 120);
    } else {
      _showCurrentLibraryView();
    }
  }

  // Wire orchestrator functions as deps
  bridge.deps.openBrowserForTab  = openBrowserForTab;
  bridge.deps.openNewTab         = openNewTab;
  bridge.deps.openHubPanelSection = function () {}; // not used in new browser

  // ── Source management ──

  function renderSources() {
    var sidebarHtml = '';
    var settingsHtml = '';
    var activeSourcesTab = getSourcesActiveTab();
    var activeUrl = String(activeSourcesTab && activeSourcesTab.url || '').trim();
    for (var i = 0; i < state.sources.length; i++) {
      var s = state.sources[i];
      var sourceUrl = String(s && s.url || '').trim();
      var isActive = !!(activeUrl && sourceUrl && activeUrl.indexOf(sourceUrl) === 0);
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
    var key = String(state.browserSettings && state.browserSettings.defaultSearchEngine || 'google').trim().toLowerCase();
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
    if (isSourcesModeActive() || !state.browserOpen) {
      ensureSourcesModeActive().then(function () {
        applySourcesWorkspace(state.sourcesSubMode === 'downloads' ? 'downloads' : 'search');
        initSourcesBrowser();
        openSourcesTab(url, { switchTo: true, focus: true });
      });
      return;
    }
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
        refreshSourcesBrowserHomeShortcuts();
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
    var key = String(mode || '').toLowerCase() === 'downloads' ? 'downloads' : 'search';
    if (key === 'downloads' && !el.sourcesDownloadsView) key = 'search';
    state.sourcesSubMode = key;
    if (el.sourcesSearchTabBtn) el.sourcesSearchTabBtn.classList.toggle('active', key === 'search');
    if (el.sourcesDownloadsTabBtn) el.sourcesDownloadsTabBtn.classList.toggle('active', key === 'downloads');
    if (el.sourcesSearchView) el.sourcesSearchView.classList.toggle('hidden', key !== 'search');
    if (el.sourcesDownloadsView) el.sourcesDownloadsView.classList.toggle('hidden', key !== 'downloads');
    if (el.torrentContainer) el.torrentContainer.style.display = 'none';
    if (el.sourcesDownloadsView && el.torrentContainer && el.torrentContainer.parentElement === el.sourcesDownloadsView && el.contentArea) {
      el.contentArea.appendChild(el.torrentContainer);
    }
    // Do not auto-focus search on mode entry; it scrolls the Sources page
    // away from the top now that TankoBrowser is the first panel.
  }

  function enforceProvidersOnlySidebar() {
    if (!el.webLibraryView || !el.webLibraryView.querySelectorAll) return;
    var sections = el.webLibraryView.querySelectorAll('.libSidebar .navSection');
    var seps = el.webLibraryView.querySelectorAll('.libSidebar .navSep');
    var i;
    for (i = 0; i < sections.length; i++) {
      if (sections[i] && sections[i].style && sections[i].style.setProperty) {
        var isUtility = sections[i].classList && sections[i].classList.contains('navSectionUtility');
        sections[i].style.setProperty('display', isUtility ? 'block' : 'none', 'important');
      }
    }
    for (i = 0; i < seps.length; i++) {
      if (seps[i] && seps[i].style && seps[i].style.setProperty) {
        seps[i].style.setProperty('display', 'none', 'important');
      }
    }
    try {
      var utilityItems = el.webLibraryView.querySelectorAll('.libSidebar .navSection.navSectionUtility .navItems > *');
      for (i = 0; i < utilityItems.length; i++) {
        if (!utilityItems[i] || !utilityItems[i].style || !utilityItems[i].style.setProperty) continue;
        utilityItems[i].style.setProperty('display', 'none', 'important');
      }
      var providersBtn = document.getElementById('webUtilityTorrentProvidersBtn');
      if (providersBtn && providersBtn.style && providersBtn.style.setProperty) {
        providersBtn.style.setProperty('display', 'inline-flex', 'important');
      }
    } catch (_e2) {}
  }

  function forceSourcesViewVisible() {
    try {
      var comicsView = document.getElementById('libraryView');
      var booksView = document.getElementById('booksLibraryView');
      var videosView = document.getElementById('videoLibraryView');
      var homeView = document.getElementById('webHomeView');
      if (comicsView) comicsView.classList.add('hidden');
      if (booksView) booksView.classList.add('hidden');
      if (videosView) videosView.classList.add('hidden');
      if (el.webLibraryView) el.webLibraryView.classList.remove('hidden');
      if (homeView) {
        homeView.classList.remove('hidden');
        homeView.style.display = '';
      }
      document.body.classList.add('inSourcesMode');
      document.body.classList.remove('inComicsMode', 'inBooksMode', 'inVideoMode');
      enforceProvidersOnlySidebar();
      scheduleSourcesBrowserViewportLayout();
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
      el.sourcesTorrentBody.innerHTML = '<tr><td colspan="6" class="muted tiny">No torrents yet.</td></tr>';
      return;
    }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var t = rows[i] || {};
      var isStreamable = !!(t && t.videoLibraryStreamable === true);
      var pctText = isStreamable ? '-' : asPct01(t.progress);
      var statusText = isStreamable ? 'Streaming' : String(t.state || 'unknown');
      html += '<tr data-source-torrent-id="' + escapeHtml(String(t.id || '')) + '">'
        + '<td>' + (i + 1) + '</td>'
        + '<td class="sourcesSearchTitleCell" title="' + escapeHtml(String(t.name || t.infoHash || 'Torrent')) + '">' + escapeHtml(String(t.name || t.infoHash || 'Torrent')) + '</td>'
        + '<td>' + escapeHtml(formatBytesForSources(t.totalSize || 0)) + '</td>'
        + '<td>' + escapeHtml(formatBytesForSources(t.downloadRate || 0)) + '/s</td>'
        + '<td>' + escapeHtml(pctText) + '</td>'
        + '<td>' + escapeHtml(statusText) + '</td>'
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

  function openTorrentProvidersDialog() {
    syncBrowserSettingsControls();
    if (el.torrentProvidersOverlay) el.torrentProvidersOverlay.classList.remove('hidden');
    syncSourcesBrowserOverlayLock();
  }

  function closeTorrentProvidersDialog() {
    if (el.torrentProvidersOverlay) el.torrentProvidersOverlay.classList.add('hidden');
    syncSourcesBrowserOverlayLock();
  }

  function normalizeProviderBaseUrl(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    try {
      var u = new URL(s);
      var proto = /^https?:$/i.test(u.protocol) ? u.protocol.toLowerCase() : 'http:';
      var host = String(u.host || '').trim();
      if (!host) return '';
      var normalized = proto + '//' + host + String(u.pathname || '');
      normalized = normalized.replace(/\/+$/, '');
      return normalized;
    } catch (_e) {
      return '';
    }
  }

  function classifyProviderHealthMessage(rawMsg) {
    var msg = String(rawMsg || '').trim();
    var low = msg.toLowerCase();
    if (!msg) return 'Unknown provider error';
    if (/401|403|unauthorized|forbidden|api key|apikey|auth/.test(low)) return 'Authentication failed (check API key)';
    if (/404|not found/.test(low)) return 'Endpoint not found (check base URL)';
    if (/timeout|timed out|aborted/.test(low)) return 'Request timed out (provider too slow or unreachable)';
    if (/econnrefused|enotfound|network|failed to fetch|unreachable|socket hang up|connect/.test(low)) return 'Network error (cannot reach provider host)';
    if (/http\s*\d+/.test(low)) return msg;
    return msg;
  }

  function runActiveProviderHealthCheck(opts) {
    var options = (opts && typeof opts === 'object') ? opts : {};
    var srcOps = getSourcesOps();
    if (!srcOps || typeof srcOps.health !== 'function') return Promise.resolve(null);
    return srcOps.health().then(function (res) {
      var provider = String(res && res.details && res.details.provider || (state.browserSettings && state.browserSettings.torrentSearch && state.browserSettings.torrentSearch.provider) || 'jackett').trim().toLowerCase();
      if (provider !== 'prowlarr') provider = 'jackett';
      var pLabel = provider === 'prowlarr' ? 'Prowlarr' : 'Jackett';
      if (res && res.ready) {
        if (!options.silent) showToast(pLabel + ' is healthy');
        return res;
      }
      var reason = classifyProviderHealthMessage(res && res.error);
      if (!options.silent) showToast(pLabel + ': ' + reason);
      return res;
    }).catch(function (err) {
      if (!options.silent) {
        var active = String(state.browserSettings && state.browserSettings.torrentSearch && state.browserSettings.torrentSearch.provider || 'jackett').toLowerCase();
        var label = active === 'prowlarr' ? 'Prowlarr' : 'Jackett';
        showToast(label + ': ' + classifyProviderHealthMessage(err && err.message));
      }
      return null;
    });
  }

  function openProviderWebUi(rawUrl) {
    var url = normalizeProviderBaseUrl(rawUrl);
    if (!url) {
      showToast('Set a valid provider base URL first');
      return;
    }
    ensureSourcesModeActive().then(function () {
      closeTorrentProvidersDialog();
      forceSourcesViewVisible();
      applySourcesWorkspace(state.sourcesSubMode === 'downloads' ? 'downloads' : 'search');
      initSourcesBrowser();
      if (!getSourcesActiveTab()) {
        openSourcesTab('', { switchTo: true, focus: false, persist: false, home: true });
      }
      var ok = false;
      try { ok = navigateSourcesBrowser(url, { focus: true }); } catch (_eNow) { ok = false; }
      if (ok) {
        showToast('Opened provider UI in TankoBrowser');
        return;
      }
      setTimeout(function () {
        var okRetry = false;
        try { okRetry = navigateSourcesBrowser(url, { focus: true }); } catch (_eRetry) { okRetry = false; }
        if (okRetry) {
          showToast('Opened provider UI in TankoBrowser');
          return;
        }
        showToast('Unable to open provider UI');
      }, 220);
    });
  }

  function saveTorrentProvidersSettings() {
    var provider = String(el.torrentProviderSelect && el.torrentProviderSelect.value || 'jackett').trim().toLowerCase();
    if (provider !== 'prowlarr') provider = 'jackett';
    var jackettBaseUrl = normalizeProviderBaseUrl(el.jackettBaseUrl && el.jackettBaseUrl.value);
    var prowlarrBaseUrl = normalizeProviderBaseUrl(el.prowlarrBaseUrl && el.prowlarrBaseUrl.value);
    if (el.jackettBaseUrl) el.jackettBaseUrl.value = jackettBaseUrl;
    if (el.prowlarrBaseUrl) el.prowlarrBaseUrl.value = prowlarrBaseUrl;
    saveBrowserSettings({
      torrentSearch: { provider: provider },
      jackett: {
        baseUrl: jackettBaseUrl,
        apiKey: String(el.jackettApiKey && el.jackettApiKey.value || '').trim()
      },
      prowlarr: {
        baseUrl: prowlarrBaseUrl,
        apiKey: String(el.prowlarrApiKey && el.prowlarrApiKey.value || '').trim()
      }
    });
    closeTorrentProvidersDialog();
    setTimeout(function () {
      loadSourcesSearchIndexers();
    }, 150);
    showToast('Torrent provider settings saved');
    setTimeout(function () { runActiveProviderHealthCheck({ silent: false }); }, 200);
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
    var jackett = (src.jackett && typeof src.jackett === 'object') ? src.jackett : {};
    var prowlarr = (src.prowlarr && typeof src.prowlarr === 'object') ? src.prowlarr : {};
    var torrentSearch = (src.torrentSearch && typeof src.torrentSearch === 'object') ? src.torrentSearch : {};
    var sourcesBrowser = (src.sourcesBrowser && typeof src.sourcesBrowser === 'object') ? src.sourcesBrowser : {};
    var provider = String(torrentSearch.provider || src.torrentSearchProvider || 'jackett').trim().toLowerCase();
    if (provider !== 'prowlarr') provider = 'jackett';
    return {
      defaultSearchEngine: String(src.defaultSearchEngine || 'google').trim().toLowerCase() || 'google',
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
      sourcesBrowser: {
        expandedByDefault: sourcesBrowser.expandedByDefault !== false,
        lastUrl: String(sourcesBrowser.lastUrl || src.sourcesBrowserLastUrl || '').trim(),
        chromeDensity: String(sourcesBrowser.chromeDensity || 'single_row_v1').trim().toLowerCase() || 'single_row_v1',
        omniboxMode: String(sourcesBrowser.omniboxMode || 'collapsed_chip').trim().toLowerCase() || 'collapsed_chip'
      },
      privacy: { doNotTrack: !!privacy.doNotTrack, clearOnExit: { history: !!clearOnExit.history, downloads: !!clearOnExit.downloads, cookies: !!clearOnExit.cookies, cache: !!clearOnExit.cache } },
      jackett: {
        baseUrl: String(jackett.baseUrl || src.jackettBaseUrl || '').trim(),
        apiKey: String(jackett.apiKey || src.jackettApiKey || '').trim(),
        indexer: String(jackett.indexer || src.jackettIndexer || 'all').trim() || 'all',
        timeoutMs: Number(jackett.timeoutMs || src.jackettTimeoutMs || 30000) || 30000,
        indexersByCategory: jackett.indexersByCategory && typeof jackett.indexersByCategory === 'object' ? jackett.indexersByCategory : { all: 'all', comics: 'all', books: 'all', tv: 'all' }
      },
      prowlarr: {
        baseUrl: String(prowlarr.baseUrl || src.prowlarrBaseUrl || '').trim(),
        apiKey: String(prowlarr.apiKey || src.prowlarrApiKey || '').trim(),
        indexer: String(prowlarr.indexer || src.prowlarrIndexer || 'all').trim() || 'all',
        timeoutMs: Number(prowlarr.timeoutMs || src.prowlarrTimeoutMs || 30000) || 30000,
        indexersByCategory: prowlarr.indexersByCategory && typeof prowlarr.indexersByCategory === 'object' ? prowlarr.indexersByCategory : { all: 'all', comics: 'all', books: 'all', tv: 'all' }
      },
      torrentSearch: { provider: provider }
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
    if (el.torrentProviderSelect) el.torrentProviderSelect.value = String(s.torrentSearch && s.torrentSearch.provider || 'jackett');
    if (el.jackettBaseUrl) el.jackettBaseUrl.value = String(s.jackett && s.jackett.baseUrl || '');
    if (el.jackettApiKey) el.jackettApiKey.value = String(s.jackett && s.jackett.apiKey || '');
    if (el.prowlarrBaseUrl) el.prowlarrBaseUrl.value = String(s.prowlarr && s.prowlarr.baseUrl || '');
    if (el.prowlarrApiKey) el.prowlarrApiKey.value = String(s.prowlarr && s.prowlarr.apiKey || '');
    applySourcesMinimalFlag();
    state.sourcesBrowserHomeReady = false;
    ensureSourcesHomeEngineOptions();
    syncSourcesBrowserOmniPlaceholder();
    renderSourcesBrowserHome();
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
    var active = getSourcesBrowserDownloadsList();
    active.sort(function (a, b) { return Number(b && b.startedAt || b && b.updatedAt || 0) - Number(a && a.startedAt || a && a.updatedAt || 0); });

    if (el.homeDlList && el.homeDlEmpty) {
      if (!active.length) {
        el.homeDlList.innerHTML = '';
        el.homeDlEmpty.classList.remove('hidden');
      } else {
        el.homeDlEmpty.classList.add('hidden');
        var html = '';
        for (var j = 0; j < Math.min(active.length, 20); j++) {
          var x = active[j] || {};
          var total = Number(x.totalBytes || 0);
          var recv = Number(x.received || 0);
          var pctNum = total > 0 ? Math.round((recv / total) * 100) : null;
          var pct = pctNum != null && isFinite(pctNum) ? (pctNum + '%') : '';
          html += '<div class="webHomeDlItem">'
            + '<div class="webHomeDlName">' + escapeHtml(String(x.filename || x.name || 'Download')) + '</div>'
            + '<div class="webHomeDlSub">' + escapeHtml(String(x.state || 'downloading')) + (pct ? ' &bull; ' + pct : '') + '</div>'
            + '</div>';
        }
        el.homeDlList.innerHTML = html;
      }
    }

    renderSourcesBrowserDownloadsRows();
    syncDownloadIndicator();
  }

  // Update the stub to point to real function
  bridge.deps.renderHomeDownloads = renderHomeDownloads;

  // ── Keyboard shortcuts ──

  function handleKeyDown(e) {
    // Only handle when browser view is visible or web mode is active
    if (!state.browserOpen && !isWebModeActive()) return;

    var ctrl = e.ctrlKey || e.metaKey;
    var shift = e.shiftKey;
    var key = e.key;
    var sourcesActive = isSourcesModeActive() && !state.browserOpen;

    if (sourcesActive) {
      if (ctrl && !shift && key === 't') {
        e.preventDefault();
        openSourcesTab('', { switchTo: true, focus: true, persist: false, home: true });
        return;
      }
      if (ctrl && !shift && /^[1-9]$/.test(key)) {
        e.preventDefault();
        var idxTarget = Number(key) - 1;
        if (key === '9') idxTarget = Math.max(0, state.sourcesTabs.length - 1);
        var targetTab = state.sourcesTabs[idxTarget];
        if (targetTab && targetTab.id) switchSourcesTab(targetTab.id, { focus: true });
        return;
      }
      if (ctrl && !shift && key === 'w') {
        e.preventDefault();
        var activeClose = getSourcesActiveTab();
        if (activeClose) closeSourcesTab(activeClose.id);
        return;
      }
      if (ctrl && key === 'Tab') {
        e.preventDefault();
        cycleSourcesTabs(shift ? -1 : 1);
        return;
      }
      if (ctrl && shift && (key === 'T' || key === 't')) {
        e.preventDefault();
        reopenSourcesClosedTab();
        return;
      }
      if (ctrl && !shift && key === 'l') {
        e.preventDefault();
        setSourcesOmniExpanded(true);
        return;
      }
      if (ctrl && !shift && key === 'h') {
        e.preventDefault();
        openSourcesBrowserHistoryOverlay();
        return;
      }
      if (ctrl && !shift && key === 'b') {
        e.preventDefault();
        openSourcesBrowserDrawer('bookmarks');
        return;
      }
      if (ctrl && !shift && key === 'j') {
        e.preventDefault();
        openSourcesBrowserDrawer('downloads');
        return;
      }
      if (ctrl && shift && (key === 'A' || key === 'a')) {
        e.preventDefault();
        openSourcesTabSearchOverlay();
        return;
      }
      if (ctrl && !shift && key === 'r') {
        e.preventDefault();
        if (isButterfly) {
          var activeReload = getSourcesActiveTab();
          if (activeReload && activeReload._bridgeTabId) {
            try { api.webTabManager.reload({ tabId: activeReload._bridgeTabId }); } catch (_eReloadKey) {}
          }
        } else {
          var rwv = getSourcesBrowserWebview();
          if (rwv && typeof rwv.reload === 'function') rwv.reload();
        }
        return;
      }
      if (e.altKey && key === 'ArrowLeft') {
        e.preventDefault();
        var activeBack = getSourcesActiveTab();
        var moved = false;
        if (isButterfly) {
          if (activeBack && activeBack._bridgeTabId && activeBack._canGoBack) {
            try { api.webTabManager.goBack({ tabId: activeBack._bridgeTabId }); } catch (_eAltBackQt) {}
            moved = true;
          }
        } else {
          var bwv0 = getSourcesBrowserWebview();
          try {
            if (bwv0 && typeof bwv0.canGoBack === 'function' && bwv0.canGoBack()) {
              bwv0.goBack();
              moved = true;
            }
          } catch (_eAltBack) {}
        }
        if (!moved && activeBack && !activeBack.home) {
          activeBack.home = true;
          state.sourcesBrowserUrl = '';
          switchSourcesTab(activeBack.id, { focus: false });
        }
        return;
      }
      if (e.altKey && key === 'ArrowRight') {
        e.preventDefault();
        if (isButterfly) {
          var activeForward = getSourcesActiveTab();
          if (activeForward && activeForward._bridgeTabId && activeForward._canGoForward) {
            try { api.webTabManager.goForward({ tabId: activeForward._bridgeTabId }); } catch (_eAltFwdQt) {}
          }
        } else {
          var fwv0 = getSourcesBrowserWebview();
          if (fwv0 && typeof fwv0.goForward === 'function') fwv0.goForward();
        }
        return;
      }
      if (key === 'Escape') {
        if (state.sourcesContextMenuMeta) {
          hideSourcesBrowserContextMenu();
          e.preventDefault();
          return;
        }
        if (state.sourcesOmniOpen) {
          closeSourcesOmniDropdown();
          setSourcesOmniExpanded(false, { keepValue: true, select: false });
          e.preventDefault();
          return;
        }
        if (state.sourcesTabSearchOpen) {
          closeSourcesTabSearchOverlay();
          e.preventDefault();
          return;
        }
        if (state.sourcesBrowserDrawerKind) {
          closeSourcesBrowserDrawer();
          e.preventDefault();
          return;
        }
      }
    }

    if (sourcesActive) return;

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
    if (el.torrentProvidersBtn) el.torrentProvidersBtn.addEventListener('click', openTorrentProvidersDialog);
    if (el.utilityTorrentProvidersBtn) el.utilityTorrentProvidersBtn.addEventListener('click', openTorrentProvidersDialog);
    if (el.torrentProvidersClose) el.torrentProvidersClose.addEventListener('click', closeTorrentProvidersDialog);
    if (el.torrentProvidersSave) el.torrentProvidersSave.addEventListener('click', saveTorrentProvidersSettings);
    if (el.torrentProvidersOverlay) {
      el.torrentProvidersOverlay.addEventListener('click', function (e) {
        if (e.target === el.torrentProvidersOverlay) closeTorrentProvidersDialog();
      });
    }
    if (el.providerOpenJackettUiBtn) {
      el.providerOpenJackettUiBtn.addEventListener('click', function () {
        openProviderWebUi((el.jackettBaseUrl && el.jackettBaseUrl.value) || (state.browserSettings && state.browserSettings.jackett && state.browserSettings.jackett.baseUrl));
      });
    }
    if (el.providerOpenProwlarrUiBtn) {
      el.providerOpenProwlarrUiBtn.addEventListener('click', function () {
        openProviderWebUi((el.prowlarrBaseUrl && el.prowlarrBaseUrl.value) || (state.browserSettings && state.browserSettings.prowlarr && state.browserSettings.prowlarr.baseUrl));
      });
    }

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
      var key = String(el.searchEngineSelect.value || 'google').trim().toLowerCase() || 'google';
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
        if (Array.isArray(state.downloads)) {
          state.downloads = state.downloads.filter(function (d) {
            var st = String(d && d.state || '').toLowerCase();
            return st !== 'completed' && st !== 'cancelled' && st !== 'failed' && st !== 'interrupted';
          });
        } else if (state.downloads && typeof state.downloads === 'object') {
          var keep = {};
          var keys = Object.keys(state.downloads);
          for (var i = 0; i < keys.length; i++) {
            var item = state.downloads[keys[i]];
            var s = String(item && item.state || '').toLowerCase();
            if (s === 'completed' || s === 'cancelled' || s === 'failed' || s === 'interrupted') continue;
            keep[keys[i]] = item;
          }
          state.downloads = keep;
        }
        renderHomeDownloads();
      });
    }
    var onSourcesBrowserDownloadsClick = function (e) {
      var cancelBtn = e.target && e.target.closest ? e.target.closest('[data-dl-cancel]') : null;
      if (cancelBtn) {
        var id = String(cancelBtn.getAttribute('data-dl-cancel') || '').trim();
        if (id && api.webSources && typeof api.webSources.cancelDownload === 'function') {
          api.webSources.cancelDownload({ id: id }).catch(function () {});
        }
        return;
      }
      var openBtn = e.target && e.target.closest ? e.target.closest('[data-dl-open]') : null;
      if (openBtn) {
        var openId = String(openBtn.getAttribute('data-dl-open') || '').trim();
        var list = getSourcesBrowserDownloadsList();
        for (var i = 0; i < list.length; i++) {
          var item = list[i];
          if (String(item && item.id || '') !== openId) continue;
          if (item.savePath && api.webBrowserActions && typeof api.webBrowserActions.downloadOpenFile === 'function') {
            api.webBrowserActions.downloadOpenFile({ path: item.savePath });
          }
          break;
        }
        return;
      }
      var showBtn = e.target && e.target.closest ? e.target.closest('[data-dl-show]') : null;
      if (showBtn) {
        var showId = String(showBtn.getAttribute('data-dl-show') || '').trim();
        var list2 = getSourcesBrowserDownloadsList();
        for (var j = 0; j < list2.length; j++) {
          var it = list2[j];
          if (String(it && it.id || '') !== showId) continue;
          if (it.savePath && api.webBrowserActions && typeof api.webBrowserActions.downloadShowInFolder === 'function') {
            api.webBrowserActions.downloadShowInFolder({ path: it.savePath });
          }
          break;
        }
      }
    };
    if (el.sourcesBrowserDownloadsBody) {
      el.sourcesBrowserDownloadsBody.addEventListener('click', onSourcesBrowserDownloadsClick);
    }
    if (el.sourcesBrowserHomeDownloadsBody) {
      el.sourcesBrowserHomeDownloadsBody.addEventListener('click', onSourcesBrowserDownloadsClick);
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
        if (isSourcesModeActive() || !state.browserOpen) {
          ensureSourcesModeActive().then(function () {
            applySourcesWorkspace(state.sourcesSubMode === 'downloads' ? 'downloads' : 'search');
            initSourcesBrowser();
            openSourcesTab(popupUrl, { switchTo: true, focus: true });
          });
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

    if (api.webSources && api.webSources.onDownloadStarted) {
      api.webSources.onDownloadStarted(function (info) {
        upsertSourcesDownload(info);
        renderHomeDownloads();
        renderSourcesBrowserDownloadsRows();
        syncDownloadIndicator();
        if (hub && hub.renderHubDirectActive) hub.renderHubDirectActive();
        if (hub && hub.renderHubDownloadHistory) hub.renderHubDownloadHistory();
      });
    }
    if (api.webSources && api.webSources.onDownloadProgress) {
      api.webSources.onDownloadProgress(function (info) {
        upsertSourcesDownload(info);
        renderHomeDownloads();
        renderSourcesBrowserDownloadsRows();
        syncDownloadIndicator();
        if (hub && hub.renderHubDirectActive) hub.renderHubDirectActive();
      });
    }
    if (api.webSources && api.webSources.onDownloadCompleted) {
      api.webSources.onDownloadCompleted(function (info) {
        upsertSourcesDownload(info);
        renderHomeDownloads();
        renderSourcesBrowserDownloadsRows();
        syncDownloadIndicator();
        if (hub && hub.renderHubDirectActive) hub.renderHubDirectActive();
        if (hub && hub.renderHubDownloadHistory) hub.renderHubDownloadHistory();
      });
    }
    if (api.webSources && api.webSources.onDownloadsUpdated) {
      api.webSources.onDownloadsUpdated(function () {
        loadSourcesDownloadHistory();
      });
    }

    if (api.webPermissions && typeof api.webPermissions.onPrompt === 'function') {
      api.webPermissions.onPrompt(function (data) {
        enqueuePermissionPrompt(data);
      });
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
    var all = getSourcesBrowserDownloadsList();
    for (var i = 0; i < all.length; i++) {
      var d = all[i];
      var s = String(d && d.state || '').toLowerCase();
      if (s === 'started' || s === 'progressing' || s === 'downloading' || s === 'paused' || s === 'queued') activeCount++;
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
  }).catch(function () {
    loadSourcesSearchIndexers();
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
  loadSourcesDownloadHistory();

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
      if (api.webBookmarks && typeof api.webBookmarks.list === 'function') {
        api.webBookmarks.list().then(function (res) {
          state.bookmarks = (res && res.ok && Array.isArray(res.bookmarks)) ? res.bookmarks : [];
          renderSourcesBrowserBookmarksRows();
          refreshSourcesBrowserBookmarkUi(state.sourcesBrowserUrl || '');
        }).catch(function () {});
      }
      if (panels.renderBookmarkBar) panels.renderBookmarkBar();
    });
  }

  // ── Public API ──

  var openDefaultBrowserEntry = standalone.openDefaultBrowserEntry || function () {
    if (state.sourcesTabs.length) {
      var targetId = state.sourcesActiveTabId != null ? state.sourcesActiveTabId : state.sourcesTabs[0].id;
      openBrowserForTab(targetId);
      return;
    }
    openNewTab();
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
    if (panels.hideAllPanels) panels.hideAllPanels();
    if (contextMenu.hideContextMenu) contextMenu.hideContextMenu();
    hideSourcesBrowserContextMenu();
    if (find.closeFind) find.closeFind();
    if (navOmnibox.hideOmniDropdown) navOmnibox.hideOmniDropdown();
    forceSourcesViewVisible();
    setSourcesSubMode(mode === 'downloads' ? 'downloads' : 'search');
    scheduleSourcesBrowserViewportLayout();
  }

  function openSources() {
    ensureSourcesModeActive().then(function () {
      var mode = state.sourcesSubMode === 'downloads' ? 'downloads' : 'search';
      applySourcesWorkspace(mode);
      initSourcesBrowser();
      if (!state.sourcesTabs.length) {
        var cfg = state.browserSettings && state.browserSettings.sourcesBrowser ? state.browserSettings.sourcesBrowser : null;
        var lastUrl = String(cfg && cfg.lastUrl || '').trim();
        if (lastUrl === 'about:blank') lastUrl = '';
        // Home is always the first tab — never skip it even when restoring a session URL
        openSourcesTab('', { switchTo: !lastUrl, focus: false, persist: false, home: true });
        if (lastUrl) {
          openSourcesTab(lastUrl, { switchTo: true, focus: false, persist: false });
        }
      } else {
        var active = getSourcesActiveTab() || state.sourcesTabs[0];
        if (active) switchSourcesTab(active.id, { focus: false });
      }
      loadSourcesSearchIndexers();
      refreshSourcesTorrents();
      if (isButterfly) {
        // Native Qt browser — hand off to BrowserWidget via bridge; no HTML chrome needed.
        try { api.webTabManager.openBrowser(); } catch (_eBrowser) {}
        return;
      }
      scheduleSourcesBrowserViewportLayout();
      if (el.homeView) {
        try { el.homeView.scrollTop = 0; } catch (_eScrollTop) {}
      }
    });
  }

  function openSourcesSearch() {
    state.sourcesSubMode = 'search';
    openSources();
  }

  function openSourcesDownloads() {
    state.sourcesSubMode = 'downloads';
    openSources();
    if (!el.sourcesDownloadsView) {
      var torrentPanel = document.querySelector('#webHomeView .sourcesTorrentPanel');
      if (torrentPanel && typeof torrentPanel.scrollIntoView === 'function') {
        setTimeout(function () {
          try { torrentPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_e) { torrentPanel.scrollIntoView(); }
        }, 0);
      }
    }
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
          if (isButterfly) {
            // Qt BrowserWidget handles sources mode natively — activate via bridge.
            // Never render old HTML browser chrome in Butterfly mode.
            try { api.webTabManager.openBrowser(); } catch (_eBf) {}
            return Promise.resolve();
          }
          applySourcesWorkspace(state.sourcesSubMode === 'downloads' ? 'downloads' : 'search');
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
