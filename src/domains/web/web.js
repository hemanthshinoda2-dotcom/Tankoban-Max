// Tankoban Max — Web browser mode renderer (BUILD_WEB + BUILD_WEB_HOME + BUILD_WCV)
// BUILD_WCV: Replaced <webview> tags with main-process WebContentsView via IPC.
(function webBrowserDomain() {
  'use strict';

  if (window.__tankoWebBrowserBound) return;

  var api = window.Tanko && window.Tanko.api ? window.Tanko.api : null;
  if (!api || !api.webSources || !api.webTabs) {
    console.warn('[BUILD_WCV] Tanko.api.webSources or webTabs not available');
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
    viewContainer: qs('webViewContainer'),
    loadBar: qs('webLoadBar'),
    dlPill: qs('webDlPill'),
    dlBtn: qs('webDlBtn'),
    dlBadge: qs('webDlBadge'),
    dlPanel: qs('webDlPanel'),
    dlList: qs('webDlList'),
    dlEmpty: qs('webDlEmpty'),
    dlClearBtn: qs('webDlClearBtn'),
    // Sidebar
    sourcesList: qs('webSourcesList'),
    addSourceBtn: qs('webAddSourceBtn'),
    downloadStatus: qs('webDownloadStatus'),
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
    contextMenu: qs('contextMenu')
  };

  var MAX_TABS = 8;

  var state = {
    sources: [],
    tabs: [],          // BUILD_WCV: { id, sourceId, sourceName, title, url, homeUrl, mainTabId, loading, canGoBack, canGoForward }
    activeTabId: null,
    nextTabId: 1,
    downloading: 0,
    lastDownloadName: '',
    downloads: [],      // { id, filename, destination?, library?, state, startedAt, finishedAt?, error? }
    dlPanelOpen: false,
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
    splitRatio: 0.5
  };

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

  function getFaviconUrl(url) {
    try {
      var domain = new URL(url).hostname;
      return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=128';
    } catch (e) {
      return '';
    }
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
    api.webTabs.setBounds({ tabId: tab.mainTabId, bounds: bounds }).catch(function () {});
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
    api.webTabs.splitBounds({
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
        renderContinue();    // BUILD_WEB_HOME
      }
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

  function openBrowser(source) {
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

    state.browserOpen = true;
    if (el.homeView) el.homeView.classList.add('hidden');
    if (el.webLibraryView) el.webLibraryView.classList.add('hidden');
    if (el.browserView) el.browserView.classList.remove('hidden');
    if (el.browserTitle) el.browserTitle.textContent = source.name || '';
    renderSources();
    syncLoadBar();
    // BUILD_WCV: report bounds after browser opens (needs a frame for layout)
    setTimeout(reportBoundsForActiveTab, 50);
  }

  function openBrowserForTab(tabId) {
    var tab = null;
    for (var i = 0; i < state.tabs.length; i++) {
      if (state.tabs[i].id === tabId) { tab = state.tabs[i]; break; }
    }
    if (!tab) return;

    activateTab(tabId);
    state.browserOpen = true;
    if (el.homeView) el.homeView.classList.add('hidden');
    if (el.webLibraryView) el.webLibraryView.classList.add('hidden');
    if (el.browserView) el.browserView.classList.remove('hidden');
    if (el.browserTitle) el.browserTitle.textContent = tab.sourceName || '';
    renderSources();
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
    if (el.browserView) el.browserView.classList.add('hidden');
    if (el.webLibraryView) el.webLibraryView.classList.remove('hidden');
    if (el.homeView) el.homeView.classList.remove('hidden');
    if (el.browserTitle) el.browserTitle.textContent = '';
    if (el.urlDisplay) el.urlDisplay.textContent = '';
    renderSources();
    renderSourcesGrid();
    renderContinue();
    hideTips();
    hideContextMenu();
    syncLoadBar();
    // BUILD_WCV: hide all views in main process
    api.webTabs.hideAll().catch(function () {});
  }

  // ---- Tabs management ----

  function renderTabs() {
    if (!el.tabBar) return;
    var html = '';
    for (var i = 0; i < state.tabs.length; i++) {
      var t = state.tabs[i];
      var active = (t.id === state.activeTabId);
      var loadingClass = t.loading ? ' loading' : '';
      html += '<div class="webTab' + (active ? ' active' : '') + loadingClass + '" data-tab-id="' + t.id + '" role="tab" aria-selected="' + (active ? 'true' : 'false') + '" draggable="true">' +
        '<span class="webTabLabel">' + escapeHtml(t.title || t.sourceName || 'Tab') + '</span>' +
        '<button class="webTabClose" data-close-tab="' + t.id + '" title="Close">×</button>' +
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
        if (state.downloading > 1) el.dlPill.textContent = 'Downloading… (' + state.downloading + ')';
        else el.dlPill.textContent = 'Downloading…';
      }
    }

    if (el.downloadStatus) {
      if (state.downloading > 0) {
        el.downloadStatus.textContent = state.lastDownloadName ? ('Downloading: ' + state.lastDownloadName) : ('Downloading… (' + state.downloading + ')');
      } else {
        // keep whatever latest completion message set; fall back if blank
        if (!el.downloadStatus.textContent) el.downloadStatus.textContent = 'No active downloads';
      }
    }

    if (el.dlBadge) {
      el.dlBadge.classList.toggle('hidden', !(state.downloading > 0));
    }
  }

  // ---- Downloads panel ----

  function makeDlId(filename, destination) {
    return 'dl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '_' + String(filename || '') + '_' + String(destination || '');
  }

  function findDownloadMatch(info) {
    var fn = info && info.filename ? String(info.filename) : '';
    var dest = info && (info.destination || info.path) ? String(info.destination || info.path) : '';
    for (var i = state.downloads.length - 1; i >= 0; i--) {
      var d = state.downloads[i];
      if (dest && d.destination && d.destination === dest) return d;
      if (fn && d.filename === fn && d.state === 'downloading') return d;
    }
    return null;
  }

  function addDownloadStarted(info) {
    var filename = info && info.filename ? String(info.filename) : 'Download';
    var destination = info && (info.destination || info.path) ? String(info.destination || info.path) : '';
    var library = info && info.library ? String(info.library) : '';

    var entry = {
      id: makeDlId(filename, destination),
      filename: filename,
      destination: destination,
      library: library,
      state: 'downloading',
      startedAt: Date.now(),
      finishedAt: null,
      error: ''
    };

    state.downloads.unshift(entry);
    if (state.downloads.length > 40) state.downloads.length = 40;
    renderDownloadsPanel();
  }

  function addDownloadCompleted(info) {
    var match = findDownloadMatch(info);
    var ok = !!(info && info.ok);
    var filename = info && info.filename ? String(info.filename) : (match ? match.filename : 'Download');
    var destination = info && (info.destination || info.path) ? String(info.destination || info.path) : (match ? match.destination : '');
    var library = info && info.library ? String(info.library) : (match ? match.library : '');
    var error = info && info.error ? String(info.error) : '';

    if (!match) {
      match = {
        id: makeDlId(filename, destination),
        filename: filename,
        destination: destination,
        library: library,
        state: ok ? 'completed' : 'failed',
        startedAt: Date.now(),
        finishedAt: Date.now(),
        error: error
      };
      state.downloads.unshift(match);
    } else {
      match.filename = filename;
      match.destination = destination;
      match.library = library;
      match.state = ok ? 'completed' : 'failed';
      match.finishedAt = Date.now();
      match.error = error;
    }

    renderDownloadsPanel();
  }

  function renderDownloadsPanel() {
    if (!el.dlList || !el.dlEmpty) return;

    if (!state.downloads.length) {
      el.dlList.innerHTML = '';
      el.dlEmpty.classList.remove('hidden');
      return;
    }

    el.dlEmpty.classList.add('hidden');

    var html = '';
    for (var i = 0; i < state.downloads.length; i++) {
      var d = state.downloads[i];
      var stateTxt = d.state === 'downloading' ? 'Downloading\u2026' : (d.state === 'completed' ? 'Saved' : 'Failed');
      var sub = '';
      if (d.state === 'downloading') {
        sub = d.library ? ('\u2192 ' + d.library) : '';
      } else if (d.state === 'completed') {
        sub = d.library ? ('\u2192 ' + d.library) : '';
        if (d.destination) sub = (sub ? (sub + ' \u2022 ') : '') + shortPath(d.destination);
      } else {
        sub = d.error ? d.error : 'Download failed';
      }

      html += '' +
        '<div class="webDlItem" data-dl-id="' + escapeHtml(d.id) + '">' +
          '<div class="webDlMeta">' +
            '<div class="webDlName">' + escapeHtml(d.filename) + '</div>' +
            '<div class="webDlSub">' + escapeHtml(sub) + '</div>' +
          '</div>' +
          '<div class="webDlState">' + escapeHtml(stateTxt) + '</div>' +
        '</div>';
    }
    el.dlList.innerHTML = html;

    var items = el.dlList.querySelectorAll('.webDlItem');
    for (var j = 0; j < items.length; j++) {
      items[j].onclick = function () {
        var id = this.getAttribute('data-dl-id');
        var d = null;
        for (var k = 0; k < state.downloads.length; k++) {
          if (state.downloads[k].id === id) { d = state.downloads[k]; break; }
        }
        if (!d) return;
        if (d.destination && api && api.shell && api.shell.revealPath) {
          try { api.shell.revealPath(d.destination); } catch (e) {}
        }
      };
    }
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
  }

  function toggleDownloadsPanel() {
    if (state.dlPanelOpen) closeDownloadsPanel();
    else openDownloadsPanel();
  }

  // ---- Popup → new tab ----

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
    renderTabs();
    renderContinue();

    if (!opts.silentToast) {
      showToast(opts.toastText || ('Opened: ' + (source.name || 'Source')));
    }

    // BUILD_WCV: create WebContentsView in main process
    api.webTabs.create({ url: startUrl }).then(function (res) {
      if (res && res.ok && res.tabId) {
        tab.mainTabId = res.tabId;
        // Activate this tab's view (show it, hide others)
        api.webTabs.activate({ tabId: res.tabId }).catch(function () {});
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
    var tab = getActiveTab();
    if (tab && tab.mainTabId) {
      api.webTabs.activate({ tabId: tab.mainTabId }).catch(function () {});
      // Defer bounds report to let layout settle
      setTimeout(reportBoundsForActiveTab, 30);
    }
    renderTabs();
    updateNavButtons();
    updateUrlDisplay();
    syncLoadBar();
    renderSources();
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
      api.webTabs.close({ tabId: tab.mainTabId }).catch(function () {});
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
      closeBrowser();
    }

    renderSources();
  }

  function closeAllTabs() {
    for (var i = state.tabs.length - 1; i >= 0; i--) {
      closeTab(state.tabs[i].id);
    }
    state.tabs = [];
    state.activeTabId = null;
    renderTabs();
    renderSources();
    renderSourcesGrid();
    renderContinue();
    syncLoadBar();
  }

  // BUILD_WCV: nav state from cached tab properties (updated via IPC events)
  function updateNavButtons() {
    var tab = getActiveTab();
    if (!tab) {
      if (el.navBack) el.navBack.disabled = true;
      if (el.navForward) el.navForward.disabled = true;
      return;
    }
    if (el.navBack) el.navBack.disabled = !tab.canGoBack;
    if (el.navForward) el.navForward.disabled = !tab.canGoForward;
  }

  function updateUrlDisplay() {
    if (!el.urlDisplay) return;
    var tab = getActiveTab();
    if (!tab) { el.urlDisplay.textContent = ''; return; }
    el.urlDisplay.textContent = tab.url || '';
  }

  // MERIDIAN_SPLIT: Split view (BUILD_WCV: uses bounds-based split instead of DOM)

  function applySplitLayout() {
    if (!state.split) {
      // Unsplit: just activate the current tab normally
      var tab = getActiveTab();
      if (tab && tab.mainTabId) {
        api.webTabs.activate({ tabId: tab.mainTabId }).catch(function () {});
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
    // BUILD_WEB_PARITY: simple behavior — send user back to Home picker
    if (state.browserOpen) {
      closeBrowser();
      showToast('Pick a source');
    } else {
      if (el.homeView) el.homeView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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
    if (!isWebModeActive()) return;

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
        api.webTabs.navigate({ tabId: tab.mainTabId, action: 'back' }).catch(function () {});
      } else {
        closeBrowser();
      }
      return;
    }

    if (ctrl && lower === 'r') {
      e.preventDefault();
      if (state.browserOpen) {
        var t = getActiveTab();
        if (t && t.mainTabId) {
          api.webTabs.navigate({ tabId: t.mainTabId, action: 'reload' }).catch(function () {});
          showToast('Reloading…');
        }
      } else {
        loadSources();
        loadDestinations();
        showToast('Refreshing sources…');
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
          api.webTabs.navigate({ tabId: tab.mainTabId, action: 'back' }).catch(function () {});
        }
      };
    }

    if (el.navForward) {
      el.navForward.onclick = function () {
        var tab = getActiveTab();
        if (tab && tab.mainTabId) {
          api.webTabs.navigate({ tabId: tab.mainTabId, action: 'forward' }).catch(function () {});
        }
      };
    }

    if (el.navReload) {
      el.navReload.onclick = function () {
        var tab = getActiveTab();
        if (tab && tab.mainTabId) {
          api.webTabs.navigate({ tabId: tab.mainTabId, action: 'reload' }).catch(function () {});
          showToast('Reloading…');
        }
      };
    }

    if (el.navHome) {
      el.navHome.onclick = function () {
        var tab = getActiveTab();
        if (tab && tab.mainTabId) {
          api.webTabs.navigate({ tabId: tab.mainTabId, action: 'loadUrl', url: tab.homeUrl || tab.url || '' }).catch(function () {});
        }
      };
    }

    // MERIDIAN_SPLIT: split view toggle button
    var splitBtn = document.getElementById('webSplitBtn');
    if (splitBtn) {
      splitBtn.onclick = function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        toggleSplit();
      };
    }

    if (el.dlBtn) {
      el.dlBtn.onclick = function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        toggleDownloadsPanel();
      };
    }

    if (el.dlClearBtn) {
      el.dlClearBtn.onclick = function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        state.downloads = [];
        renderDownloadsPanel();
        closeDownloadsPanel();
        showToast('Downloads cleared');
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

    // Download events
    if (api.webSources.onDownloadStarted) {
      api.webSources.onDownloadStarted(function (info) {
        state.downloading = Math.max(0, state.downloading + 1);
        state.lastDownloadName = info && info.filename ? String(info.filename) : '';
        syncDownloadIndicator();
        addDownloadStarted(info);
        showToast('Downloading: ' + (info && info.filename ? info.filename : ''));
      });
    }

    api.webSources.onDownloadCompleted(function (info) {
      state.downloading = Math.max(0, state.downloading - 1);
      syncDownloadIndicator();

      addDownloadCompleted(info);

      if (info && info.ok) {
        var msg = 'Download saved';
        if (info && info.library) msg += ' to ' + info.library;
        showToast(msg);
        if (el.downloadStatus) {
          el.downloadStatus.textContent = 'Saved: ' + (info.filename || '') + (info.library ? (' \u2192 ' + info.library) : '');
        }
      } else {
        showToast('Download failed');
        if (el.downloadStatus) {
          el.downloadStatus.textContent = 'Download failed: ' + ((info && info.filename) ? info.filename : '');
        }
      }

      if (state.downloading === 0) {
        setTimeout(function () {
          if (!el.downloadStatus) return;
          if (state.downloading === 0) el.downloadStatus.textContent = 'No active downloads';
        }, 2500);
      }
    });

    // BUILD_WCV: Popup → new tab (main-process handler now sends tabId instead of wcId)
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
    api.webTabs.onTitleUpdated(function (data) {
      var tab = getTabByMainId(data && data.tabId);
      if (!tab) return;
      tab.title = data.title || tab.sourceName || 'Tab';
      renderTabs();
      renderContinue();
    });

    api.webTabs.onUrlUpdated(function (data) {
      var tab = getTabByMainId(data && data.tabId);
      if (!tab) return;
      tab.url = data.url || '';
      if (tab.id === state.activeTabId) {
        updateUrlDisplay();
      }
      renderContinue();
    });

    api.webTabs.onLoading(function (data) {
      var tab = getTabByMainId(data && data.tabId);
      if (!tab) return;
      tab.loading = !!data.loading;
      renderTabs();
      syncLoadBar();
    });

    api.webTabs.onNavState(function (data) {
      var tab = getTabByMainId(data && data.tabId);
      if (!tab) return;
      tab.canGoBack = !!data.canGoBack;
      tab.canGoForward = !!data.canGoForward;
      if (tab.id === state.activeTabId) {
        updateNavButtons();
      }
    });

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
    loadSources();
    loadDestinations();
    syncDownloadIndicator();
    renderDownloadsPanel();
  }

  // ---- Init ----

  try {
    bindUI();
  } catch (e) {
    console.warn('[BUILD_WCV] bindUI failed', e);
  }

  // FIX-WEB-MODE: register mode handler for lifecycle
  try {
    var tanko = window.Tanko || {};
    if (tanko.modeRouter && typeof tanko.modeRouter.registerModeHandler === 'function') {
      tanko.modeRouter.registerModeHandler('web', {
        setMode: function (mode, opts) {
          // Entering web mode: restore browser if tabs were open
          if (state.browserOpen && state.tabs.length > 0) {
            if (el.homeView) el.homeView.classList.add('hidden');
            if (el.webLibraryView) el.webLibraryView.classList.add('hidden');
            if (el.browserView) el.browserView.classList.remove('hidden');
            var tab = getActiveTab();
            if (tab && tab.mainTabId) {
              api.webTabs.activate({ tabId: tab.mainTabId }).catch(function () {});
            }
            setTimeout(reportBoundsForActiveTab, 50);
          }
        },
        refresh: function () {
          loadSources();
          loadDestinations();
        },
        back: function () {
          if (state.browserOpen) {
            closeBrowser();
            return true;
          }
        }
      });
    }
  } catch (e) {}

})();
