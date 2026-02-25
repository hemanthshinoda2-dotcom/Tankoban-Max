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

  function isWebModeActive() {
    var router = window.Tanko && window.Tanko.modeRouter;
    return router ? router.getMode() === 'web' : false;
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

  // Wire updateUrlDisplay as a dep
  bridge.deps.updateUrlDisplay = updateUrlDisplay;

  function openBrowser(source) {
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
    api.webSources.get().then(function (res) {
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
    if (!api.webSources || typeof api.webSources.getDestinations !== 'function') return;
    api.webSources.getDestinations().then(function (res) {
      if (!res || !res.ok) return;
      if (el.destBooks) el.destBooks.textContent = shortPath(res.books || 'Not configured');
      if (el.destComics) el.destComics.textContent = shortPath(res.comics || 'Not configured');
    }).catch(function () {});
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

    var method = state.editSourceId ? api.webSources.update : api.webSources.add;
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
    api.webSources.remove(id).then(function (res) {
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
      privacy: { doNotTrack: !!privacy.doNotTrack, clearOnExit: { history: !!clearOnExit.history, downloads: !!clearOnExit.downloads, cookies: !!clearOnExit.cookies, cache: !!clearOnExit.cache } }
    };
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
  }

  function loadBrowserSettings() {
    if (!api.webBrowserSettings || typeof api.webBrowserSettings.get !== 'function') {
      if (navOmnibox.syncOmniPlaceholder) navOmnibox.syncOmniPlaceholder();
      return Promise.resolve();
    }
    return api.webBrowserSettings.get().then(function (res) {
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
    if (!api.webBrowserSettings || typeof api.webBrowserSettings.save !== 'function') return;
    var payload = (patch && typeof patch === 'object') ? patch : {};
    api.webBrowserSettings.save(payload).then(function (res) {
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
    if (api.webSources && api.webSources.onDestinationPickerRequest) {
      api.webSources.onDestinationPickerRequest(handleDestPickerRequest);
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
          case 'torrent':
            if (tabsState.openTorrentTab) tabsState.openTorrentTab();
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
    if (api.webSources && api.webSources.onUpdated) {
      api.webSources.onUpdated(function () { loadSources(); });
    }

    // IPC: torrent events
    if (api.webTorrent) {
      if (api.webTorrent.onStarted) api.webTorrent.onStarted(function () {
        if (hub.refreshTorrentState) hub.refreshTorrentState();
      });
      if (api.webTorrent.onMetadata) api.webTorrent.onMetadata(function () {
        if (hub.refreshTorrentState) hub.refreshTorrentState();
      });
      if (api.webTorrent.onProgress) api.webTorrent.onProgress(function () {
        if (hub.renderHubTorrentActive) hub.renderHubTorrentActive();
      });
      if (api.webTorrent.onCompleted) api.webTorrent.onCompleted(function (info) {
        if (hub.refreshTorrentState) hub.refreshTorrentState();
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
      if (api.webTorrent.onMagnetDetected) api.webTorrent.onMagnetDetected(function (data) {
        var magnet = '';
        if (typeof data === 'string') magnet = String(data || '').trim();
        else magnet = String((data && (data.magnetUri || data.magnet)) || '').trim();
        if (!magnet) return;
        showToast('Magnet link detected');
        if (torrentTab.addSource) torrentTab.addSource(magnet);
        if (tabsState.openTorrentTab) tabsState.openTorrentTab(magnet);
      });
    }

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
        if (clearBtn && api.webSources && api.webSources.clearDownloadHistory) {
          api.webSources.clearDownloadHistory().then(function () {
            showToast('Download history cleared');
            if (hub.renderHubDownloadHistory) hub.renderHubDownloadHistory();
          }).catch(function () {});
        }
      });
    }
    if (el.hubDownloadHistoryClearBtn) {
      el.hubDownloadHistoryClearBtn.addEventListener('click', function () {
        if (!api.webSources || !api.webSources.clearDownloadHistory) return;
        api.webSources.clearDownloadHistory().then(function () {
          showToast('Download history cleared');
          if (hub.renderHubDownloadHistory) hub.renderHubDownloadHistory();
        }).catch(function () {});
      });
    }

    // Torrent hub controls
    if (el.hubTorrentPauseAllBtn) el.hubTorrentPauseAllBtn.addEventListener('click', function () {
      if (api.webTorrent && api.webTorrent.pauseAll) api.webTorrent.pauseAll().then(function () {
        if (hub.refreshTorrentState) hub.refreshTorrentState();
      }).catch(function () {});
    });
    if (el.hubTorrentResumeAllBtn) el.hubTorrentResumeAllBtn.addEventListener('click', function () {
      if (api.webTorrent && api.webTorrent.resumeAll) api.webTorrent.resumeAll().then(function () {
        if (hub.refreshTorrentState) hub.refreshTorrentState();
      }).catch(function () {});
    });
    if (el.hubTorrentCancelAllBtn) el.hubTorrentCancelAllBtn.addEventListener('click', function () {
      if (hub.applyTorrentBulkAction) hub.applyTorrentBulkAction('cancel');
    });
    if (el.hubMagnetStartBtn) el.hubMagnetStartBtn.addEventListener('click', function () {
      var magnetInput = el.hubMagnetInput ? el.hubMagnetInput.value.trim() : '';
      if (!magnetInput) { showToast('Paste a magnet link first'); return; }
      if (api.webTorrent && api.webTorrent.startMagnet) {
        api.webTorrent.startMagnet({ magnetUri: magnetInput }).then(function (res) {
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

  loadBrowserSettings().then(function () {
    if (tabsState.loadSessionAndRestore) tabsState.loadSessionAndRestore();
  }).catch(function () {
    if (tabsState.loadSessionAndRestore) tabsState.loadSessionAndRestore();
  });

  loadSources();
  loadDestinations();
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

  window.Tanko = window.Tanko || {};
  window.Tanko.web = {
    openBrowser: openBrowser,
    openHome: openHome,
    openDefault: openDefaultBrowserEntry,
    openHubSection: function () {},
    openTorrentWorkspace: openTorrentWorkspace,
    isBrowserOpen: function () { return !!state.browserOpen; },
    openAddSourceDialog: function () { openAddSourceDialog(null); }
  };

  } catch (webInitErr) {
    console.error('[web.js] FATAL init error:', webInitErr);
  }

})();
