// Tankoban Max — Web browser mode renderer (BUILD_WEB + BUILD_WEB_HOME)
(function webBrowserDomain() {
  'use strict';

  if (window.__tankoWebBrowserBound) return;
  window.__tankoWebBrowserBound = true;

  var api = window.Tanko && window.Tanko.api ? window.Tanko.api : null;
  if (!api || !api.webSources) {
    console.warn('[BUILD_WEB] Tanko.api.webSources not available');
    return;
  }

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
    // Sidebar
    sourcesList: qs('webSourcesList'),
    addSourceBtn: qs('webAddSourceBtn'),
    downloadStatus: qs('webDownloadStatus'),
    destBooks: qs('webDestBooks'),
    destComics: qs('webDestComics'),
    // Add source dialog
    addSourceOverlay: qs('webAddSourceOverlay'),
    addSourceClose: qs('webAddSourceClose'),
    sourceName: qs('webSourceName'),
    sourceUrl: qs('webSourceUrl'),
    sourceSaveBtn: qs('webSourceSaveBtn'),
  };

  var MAX_TABS = 8;
  var PARTITION = 'persist:webmode';

  var state = {
    sources: [],
    tabs: [],          // { id, sourceId, sourceName, title, url, homeUrl, webview, loading }
    activeTabId: null,
    nextTabId: 1,
    downloading: 0,
    browserOpen: false, // BUILD_WEB_HOME
  };

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

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

  function shortPath(p) {
    var s = String(p || '');
    if (s.length > 40) return '...' + s.slice(-37);
    return s;
  }

  // ---- BUILD_WEB_HOME: Home view rendering ----

  function getSourceColor(sourceId) {
    for (var i = 0; i < state.sources.length; i++) {
      if (state.sources[i].id === sourceId) return state.sources[i].color || '#555';
    }
    return '#555';
  }

  function getFaviconUrl(url) {
    try {
      var domain = new URL(url).hostname;
      return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=128';
    } catch (e) {
      return '';
    }
  }

  function makeSourceCard(source) {
    var card = document.createElement('div');
    card.className = 'seriesCard';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');

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
    card.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (confirm('Remove this source?')) {
        api.webSources.remove(source.id).then(function () {
          loadSources();
        });
      }
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
      createTab(source);
    }

    state.browserOpen = true;
    if (el.homeView) el.homeView.classList.add('hidden');
    if (el.webLibraryView) el.webLibraryView.classList.add('hidden');
    if (el.browserView) el.browserView.classList.remove('hidden');
    if (el.browserTitle) el.browserTitle.textContent = source.name || '';
    renderSources();
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
  }

  function closeBrowser() {
    state.browserOpen = false;
    if (el.browserView) el.browserView.classList.add('hidden');
    if (el.webLibraryView) el.webLibraryView.classList.remove('hidden');
    if (el.homeView) el.homeView.classList.remove('hidden');
    renderContinue();
    renderSourcesGrid();
    renderSources();
  }

  // ---- Tab management ----

  function createTab(source) {
    if (state.tabs.length >= MAX_TABS) {
      // Try closing the oldest non-active tab
      var closeable = null;
      for (var c = 0; c < state.tabs.length; c++) {
        if (state.tabs[c].id !== state.activeTabId) { closeable = state.tabs[c]; break; }
      }
      if (closeable) {
        closeTab(closeable.id);
      } else {
        return; // all tabs are active somehow, refuse
      }
    }

    var tabId = 'webtab_' + state.nextTabId++;
    var wv = document.createElement('webview');
    wv.setAttribute('partition', PARTITION);
    wv.setAttribute('src', source.url);
    wv.setAttribute('allowpopups', '');
    wv.classList.add('hidden');
    el.viewContainer.appendChild(wv);

    var tab = {
      id: tabId,
      sourceId: source.id,
      sourceName: source.name,
      title: source.name,
      url: source.url,
      homeUrl: source.url,
      webview: wv,
      loading: true,
    };

    // Bind webview events
    wv.addEventListener('did-start-loading', function () {
      tab.loading = true;
    });
    wv.addEventListener('did-stop-loading', function () {
      tab.loading = false;
    });
    wv.addEventListener('page-title-updated', function (e) {
      tab.title = e.title || tab.sourceName;
      renderTabs();
    });
    wv.addEventListener('did-navigate', function (e) {
      tab.url = e.url;
      if (tab.id === state.activeTabId) syncNavButtons();
    });
    wv.addEventListener('did-navigate-in-page', function (e) {
      if (e.isMainFrame) {
        tab.url = e.url;
        if (tab.id === state.activeTabId) syncNavButtons();
      }
    });

    // Handle new-window (popups) — redirect to same webview
    wv.addEventListener('new-window', function (e) {
      e.preventDefault();
      wv.loadURL(e.url);
    });

    state.tabs.push(tab);
    activateTab(tabId);
    renderTabs();
    renderSources();
  }

  function activateTab(tabId) {
    for (var i = 0; i < state.tabs.length; i++) {
      var t = state.tabs[i];
      if (t.id === tabId) {
        t.webview.classList.remove('hidden');
        state.activeTabId = tabId;
      } else {
        t.webview.classList.add('hidden');
      }
    }
    syncNavButtons();
    renderTabs();
    renderSources();
  }

  function closeTab(tabId) {
    var idx = -1;
    for (var i = 0; i < state.tabs.length; i++) {
      if (state.tabs[i].id === tabId) { idx = i; break; }
    }
    if (idx === -1) return;

    var tab = state.tabs[idx];
    try { tab.webview.remove(); } catch (e) {}
    state.tabs.splice(idx, 1);

    if (state.activeTabId === tabId) {
      if (state.tabs.length > 0) {
        var nextIdx = Math.min(idx, state.tabs.length - 1);
        activateTab(state.tabs[nextIdx].id);
      } else {
        state.activeTabId = null;
        if (state.browserOpen) closeBrowser(); // BUILD_WEB_HOME
        syncNavButtons();
      }
    }
    renderTabs();
    renderSources();
  }

  function getActiveTab() {
    if (!state.activeTabId) return null;
    for (var i = 0; i < state.tabs.length; i++) {
      if (state.tabs[i].id === state.activeTabId) return state.tabs[i];
    }
    return null;
  }

  // ---- Navigation ----

  function syncNavButtons() {
    var tab = getActiveTab();
    if (!tab || !tab.webview) {
      if (el.navBack) el.navBack.disabled = true;
      if (el.navForward) el.navForward.disabled = true;
      if (el.urlDisplay) el.urlDisplay.textContent = '';
      return;
    }
    try {
      if (el.navBack) el.navBack.disabled = !tab.webview.canGoBack();
      if (el.navForward) el.navForward.disabled = !tab.webview.canGoForward();
    } catch (e) { /* webview not ready */ }
    if (el.urlDisplay) el.urlDisplay.textContent = tab.url || '';
  }

  // ---- Rendering ----

  function renderTabs() {
    if (!el.tabBar) return;
    var html = '';
    for (var i = 0; i < state.tabs.length; i++) {
      var tab = state.tabs[i];
      var active = tab.id === state.activeTabId;
      html += '<div class="webTab' + (active ? ' active' : '') + '" role="tab" data-tab-id="' + tab.id + '">'
        + '<span class="webTabLabel">' + escapeHtml(tab.title) + '</span>'
        + '<button class="webTabClose" data-tab-id="' + tab.id + '" title="Close tab">&times;</button>'
        + '</div>';
    }
    el.tabBar.innerHTML = html;
  }

  // ---- Event bindings ----

  function bind() {
    // BUILD_WEB_HOME: Browser back button
    if (el.browserBackBtn) {
      el.browserBackBtn.addEventListener('click', function () {
        closeBrowser();
      });
    }

    // Tab bar clicks (delegation)
    if (el.tabBar) {
      el.tabBar.addEventListener('click', function (e) {
        var closeBtn = e.target.closest('.webTabClose');
        if (closeBtn) {
          closeTab(closeBtn.getAttribute('data-tab-id'));
          return;
        }
        var tabEl = e.target.closest('.webTab');
        if (tabEl) {
          activateTab(tabEl.getAttribute('data-tab-id'));
        }
      });
    }

    // Navigation buttons
    if (el.navBack) el.navBack.addEventListener('click', function () {
      var tab = getActiveTab();
      if (tab && tab.webview) try { tab.webview.goBack(); } catch (e) {}
    });
    if (el.navForward) el.navForward.addEventListener('click', function () {
      var tab = getActiveTab();
      if (tab && tab.webview) try { tab.webview.goForward(); } catch (e) {}
    });
    if (el.navReload) el.navReload.addEventListener('click', function () {
      var tab = getActiveTab();
      if (tab && tab.webview) try { tab.webview.reload(); } catch (e) {}
    });
    if (el.navHome) el.navHome.addEventListener('click', function () {
      var tab = getActiveTab();
      if (tab && tab.webview && tab.homeUrl) {
        try { tab.webview.loadURL(tab.homeUrl); } catch (e) {}
      }
    });

    // Sidebar source clicks — BUILD_WEB_HOME: route through openBrowser
    if (el.sourcesList) {
      el.sourcesList.addEventListener('click', function (e) {
        var item = e.target.closest('.webSourceItem');
        if (!item) return;
        var srcId = item.getAttribute('data-source-id');
        var source = null;
        for (var i = 0; i < state.sources.length; i++) {
          if (state.sources[i].id === srcId) { source = state.sources[i]; break; }
        }
        if (!source) return;
        openBrowser(source);
      });

      // Right-click source for removal
      el.sourcesList.addEventListener('contextmenu', function (e) {
        var item = e.target.closest('.webSourceItem');
        if (!item) return;
        e.preventDefault();
        var srcId = item.getAttribute('data-source-id');
        if (confirm('Remove this source?')) {
          api.webSources.remove(srcId).then(function () {
            loadSources();
          });
        }
      });
    }

    // Add source dialog
    if (el.addSourceBtn) {
      el.addSourceBtn.addEventListener('click', function () {
        if (el.addSourceOverlay) el.addSourceOverlay.classList.remove('hidden');
        if (el.sourceName) el.sourceName.value = '';
        if (el.sourceUrl) el.sourceUrl.value = '';
        if (el.sourceName) el.sourceName.focus();
      });
    }
    if (el.addSourceClose) {
      el.addSourceClose.addEventListener('click', function () {
        if (el.addSourceOverlay) el.addSourceOverlay.classList.add('hidden');
      });
    }
    if (el.sourceSaveBtn) {
      el.sourceSaveBtn.addEventListener('click', function () {
        var name = el.sourceName ? el.sourceName.value.trim() : '';
        var url = el.sourceUrl ? el.sourceUrl.value.trim() : '';
        if (!name || !url) return;
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

        api.webSources.add({ name: name, url: url }).then(function (res) {
          if (res && res.ok) {
            if (el.addSourceOverlay) el.addSourceOverlay.classList.add('hidden');
            loadSources();
          }
        });
      });
    }

    // Allow Enter key in add source dialog
    if (el.sourceUrl) {
      el.sourceUrl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (el.sourceSaveBtn) el.sourceSaveBtn.click();
        }
      });
    }

    // IPC event listeners
    if (api.webSources.onDownloadCompleted) {
      api.webSources.onDownloadCompleted(function (data) {
        state.downloading = Math.max(0, state.downloading - 1);
        if (el.downloadStatus) {
          if (data.error) {
            el.downloadStatus.textContent = 'Failed: ' + (data.error || data.filename);
          } else {
            el.downloadStatus.textContent = 'Saved: ' + data.filename + ' \u2192 ' + data.library;
          }
        }
        // Auto-clear status after 8s
        setTimeout(function () {
          if (el.downloadStatus && state.downloading === 0) {
            el.downloadStatus.textContent = 'No active downloads';
          }
        }, 8000);
      });
    }

    if (api.webSources.onUpdated) {
      api.webSources.onUpdated(function (data) {
        if (data && Array.isArray(data.sources)) {
          state.sources = data.sources;
          renderSources();
          renderSourcesGrid(); // BUILD_WEB_HOME
        }
      });
    }
  }

  // ---- Init ----

  function init() {
    bind();
    loadSources();
    loadDestinations();
  }

  init();

  // Register with mode router
  if (window.Tanko && window.Tanko.modeRouter) {
    window.Tanko.modeRouter.registerModeHandler('web', {
      setMode: function () {
        loadSources();
        loadDestinations();
        // BUILD_WEB_HOME: reset to home view when entering web mode
        if (state.browserOpen) closeBrowser();
      },
      refresh: function () {
        loadSources();
        loadDestinations();
      },
      back: function () {
        // BUILD_WEB_HOME: close browser view first
        if (state.browserOpen) {
          closeBrowser();
          return;
        }
      },
    });
  }

  // Window bridge
  window.webApp = {
    loadSources: loadSources,
    refresh: function () { loadSources(); loadDestinations(); },
    openBrowser: openBrowser,
    closeBrowser: closeBrowser,
  };
})();
