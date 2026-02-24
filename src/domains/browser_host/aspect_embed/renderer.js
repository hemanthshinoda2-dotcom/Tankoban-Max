// ── Embed compatibility / host hardening ──
var ASPECT_EMBED_CONFIG = (function () {
  var cfg = {};
  try {
    if (window.__ASPECT_EMBED__ && typeof window.__ASPECT_EMBED__ === 'object') {
      for (var k in window.__ASPECT_EMBED__) cfg[k] = window.__ASPECT_EMBED__[k];
    }
  } catch (_e) {}
  try {
    var qs = new URLSearchParams(window.location.search || '');
    if (qs.get('embed') === '1') cfg.enabled = true;
    if (qs.get('embedSuppressTitle') === '1') cfg.suppressWindowTitle = true;
  } catch (_e2) {}
  if (typeof cfg.enabled !== 'boolean') cfg.enabled = false;
  return cfg;
})();
var ASPECT_EMBED_MODE = !!ASPECT_EMBED_CONFIG.enabled;
var ASPECT_SUPPRESS_TITLE = !!ASPECT_EMBED_CONFIG.suppressWindowTitle;
var ASPECT_HOST_ADAPTER_REGISTERED = false;

function aspectNoop() {}
function aspectNoopAsync(val) { return Promise.resolve(val); }
function aspectSetWindowTitle(title) {
  if (ASPECT_EMBED_MODE && ASPECT_SUPPRESS_TITLE) return;
  try { document.title = title; } catch (_e) {}
}
function aspectGetRootElement() {
  if (!ASPECT_EMBED_MODE) return document.body;
  var root = null;
  try {
    if (ASPECT_EMBED_CONFIG && ASPECT_EMBED_CONFIG.rootElementId) {
      root = document.getElementById(String(ASPECT_EMBED_CONFIG.rootElementId));
    }
  } catch (_e) {}
  if (!root) {
    root = document.getElementById('tab-bar');
    if (root && root.parentElement) root = root.parentElement;
  }
  return root || document.body;
}
function aspectCanHandleGlobalKey(e) {
  if (!ASPECT_EMBED_MODE) return true;
  var root = aspectGetRootElement();
  if (!root || root === document.body) return true;
  var target = e && e.target;
  if (target && root.contains && root.contains(target)) return true;
  var ae = document.activeElement;
  if (ae && root.contains && root.contains(ae)) return true;
  return false;
}
function aspectEmit(name, detail) {
  try {
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  } catch (_e) {}
}
function ensureAspectBridge(existing) {
  var bridge = (existing && typeof existing === 'object') ? existing : null;
  var injected = null;
  try {
    if (window.__ASPECT_BRIDGE__ && typeof window.__ASPECT_BRIDGE__ === 'object') injected = window.__ASPECT_BRIDGE__;
    else if (window.TankoAspectBridge && typeof window.TankoAspectBridge === 'object') injected = window.TankoAspectBridge;
  } catch (_e) {}
  if (!bridge) bridge = {};
  if (injected) {
    for (var key in injected) {
      if (typeof bridge[key] === 'undefined') { try { bridge[key] = injected[key]; } catch (_assignErr0) {} }
    }
  }
  var asyncDefaults = {
    historyLoad: [], bookmarksLoad: [], searchSuggest: [],
    torStart: { ok: false, unsupported: true }, torStop: { ok: false, unsupported: true }, torGetStatus: { active: false },
    torrentStartMagnet: { ok: false, unsupported: true }, torrentStartUrl: { ok: false, unsupported: true },
    torrentPause: { ok: false, unsupported: true }, torrentResume: { ok: false, unsupported: true },
    torrentCancel: { ok: false, unsupported: true }, torrentRemove: { ok: false, unsupported: true },
    torrentPauseAll: { ok: false, unsupported: true }, torrentResumeAll: { ok: false, unsupported: true },
    torrentSelectFiles: { ok: false, unsupported: true }, torrentGetActive: { ok: true, torrents: [] },
    torrentGetHistory: { ok: true, torrents: [] }, torrentClearHistory: { ok: true },
    torrentSelectSaveFolder: { ok: false, cancelled: true }, torrentGetPeers: { ok: true, peers: [] },
    torrentGetDhtNodes: 0, torrentResolveMetadata: { ok: false, error: 'Torrent bridge unavailable' },
    torrentStartConfigured: { ok: false, error: 'Torrent bridge unavailable' }, torrentCancelResolve: { ok: true },
    bookmarksCheck: false, printPdf: { ok: false, unsupported: true }, capturePage: { ok: false, unsupported: true }
  };
  var fnDefaults = [
    'clipboardRead','clipboardWrite','onCreateTab','closeWindow','onShowContextMenu','ctxAction',
    'onDownloadStarted','onDownloadProgress','onDownloadDone','downloadAction','downloadOpen','downloadShow',
    'historyAdd','historyDelete','historyClear','bookmarksAdd','bookmarksRemove','bookmarksClear',
    'searchAdd','onTorStatusChanged','onTorrentStarted','onTorrentMetadata','onTorrentProgress','onTorrentCompleted',
    'onMagnetDetected','onTorrentFileDetected','torrentOpenFolder'
  ];
  fnDefaults.forEach(function (name) {
    if (typeof bridge[name] === 'function') return;
    try {
      if (name.indexOf('on') === 0) bridge[name] = function () { return aspectNoop; };
      else if (name === 'clipboardRead') bridge[name] = function () { return ''; };
      else bridge[name] = aspectNoop;
    } catch (_assignErr1) {}
  });
  Object.keys(asyncDefaults).forEach(function (name) {
    if (typeof bridge[name] === 'function') return;
    try { bridge[name] = function () { return aspectNoopAsync(asyncDefaults[name]); }; } catch (_assignErr2) {}
  });
  return bridge;
}
try { window.aspect = ensureAspectBridge(window.aspect); } catch (_e3) {}

// ── DOM refs ──
var tabsContainer    = document.getElementById('tabs-container');
var btnNewTab        = document.getElementById('btn-new-tab');
var urlBar           = document.getElementById('url-bar');
var btnBack          = document.getElementById('btn-back');
var btnFwd           = document.getElementById('btn-forward');
var btnRld           = document.getElementById('btn-reload');
var iconRld          = document.getElementById('icon-reload');
var iconStop         = document.getElementById('icon-stop');
var webviewContainer = document.getElementById('webview-container');
var loadingBar       = document.getElementById('loading-bar');
var loadingBarFill   = document.getElementById('loading-bar-fill');

// ── Tab state ──
var tabs = [];
var activeTabId = null;
var nextTabId = 1;

// ── Tab management ──

function createTab(url, switchTo) {
  if (switchTo === undefined) switchTo = true;

  var id = nextTabId++;
  var src = url || 'https://yandex.com';

  // Create webview
  var wv = document.createElement('webview');
  wv.setAttribute('src', src);
  wv.setAttribute('partition', 'persist:browser');
  wv.setAttribute('allowpopups', '');
  webviewContainer.appendChild(wv);

  // Create tab element
  var tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.tabId = id;
  tabEl.innerHTML =
    '<div class="tab-spinner"></div>' +
    '<img class="tab-favicon" style="display:none">' +
    '<span class="tab-title">New Tab</span>' +
    '<button class="tab-close" title="Close tab (Ctrl+W)">' +
      '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' +
    '</button>';
  tabsContainer.insertBefore(tabEl, btnNewTab);

  // Tab object
  var tab = {
    id: id,
    webview: wv,
    element: tabEl,
    title: 'New Tab',
    favicon: ''
  };
  tabs.push(tab);

  // ── Tab element events ──

  // Click to switch
  tabEl.addEventListener('click', function (e) {
    if (!e.target.closest('.tab-close')) switchTab(id);
  });

  // Middle-click to close
  tabEl.addEventListener('mousedown', function (e) {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(id);
    }
  });

  // Close button
  tabEl.querySelector('.tab-close').addEventListener('click', function (e) {
    e.stopPropagation();
    closeTab(id);
  });

  // ── Webview events ──
  bindWebviewEvents(tab);
  bindFindEvents(tab);

  // Switch to it
  if (switchTo) {
    switchTab(id);
    if (!url) setTimeout(function () { urlBar.focus(); }, 50);
  }

  return tab;
}

function closeTab(id) {
  var idx = tabs.findIndex(function (t) { return t.id === id; });
  if (idx === -1) return;

  // Last tab — in standalone close the window; in embed mode keep host alive
  if (tabs.length === 1) {
    if (ASPECT_EMBED_MODE) {
      createTab('https://yandex.com', true);
      idx = tabs.findIndex(function (t) { return t.id === id; });
      if (idx === -1) return;
    } else {
      window.aspect.closeWindow();
      return;
    }
  }

  var tab = tabs[idx];

  // If closing active tab, switch to the nearest neighbour
  if (activeTabId === id) {
    var newIdx = idx > 0 ? idx - 1 : idx + 1;
    switchTab(tabs[newIdx].id);
  }

  // Remove DOM
  tab.element.remove();
  if (tab.webview) tab.webview.remove();
  if (tab.type === 'torrent') {
    var tc = document.getElementById('torrent-container');
    if (tc) tc.style.display = 'none';
  }
  tabs.splice(idx, 1);
}

function switchTab(id) {
  var tab = tabs.find(function (t) { return t.id === id; });
  if (!tab) return;

  activeTabId = id;

  // Update tab bar + webview visibility
  tabs.forEach(function (t) {
    t.element.classList.toggle('active', t.id === id);
    if (t.webview) t.webview.classList.toggle('active', t.id === id);
  });

  // Show/hide torrent container
  var tc = document.getElementById('torrent-container');
  if (tc) tc.style.display = (tab.type === 'torrent') ? '' : 'none';

  // Close find bar on tab switch
  if (findOpen) closeFind();

  // Sync toolbar to this tab
  if (tab.type === 'torrent') {
    urlBar.value = 'aspect://torrents';
    aspectSetWindowTitle('Tankoban Torrent — Aspect');
    setLoadingUI(false);
    // Torrent tab is an internal UI (no webview), so make sure the global page
    // loading bar is fully cleared when switching into it.
    clearTimeout(loadingBarTimer);
    loadingBar.className = '';
    loadingBarFill.style.width = '';
    btnBack.disabled = true;
    btnFwd.disabled = true;
  } else {
    try { urlBar.value = tab.webview.getURL() || ''; } catch (e) { urlBar.value = ''; }
    aspectSetWindowTitle((tab.title || 'New Tab') + ' — Aspect');
    syncLoadingState(tab);
    updateNavButtons();
  }
  updateBookmarkIcon();
  aspectEmit('aspect-browser:tab-changed', { activeTabId: activeTabId, kind: (tab && tab.type) || 'web' });
}

function getActiveTab() {
  return tabs.find(function (t) { return t.id === activeTabId; });
}

function getActiveWebview() {
  var tab = getActiveTab();
  return tab ? tab.webview : null;
}

// ── Webview event binding (per-tab) ──

function bindWebviewEvents(tab) {
  var wv = tab.webview;

  wv.addEventListener('did-navigate', function (e) {
    if (tab.id === activeTabId) {
      urlBar.value = e.url;
      updateNavButtons();
      updateBookmarkIcon();
    }
  });

  wv.addEventListener('did-navigate-in-page', function (e) {
    if (e.isMainFrame && tab.id === activeTabId) {
      urlBar.value = e.url;
      updateNavButtons();
      updateBookmarkIcon();
    }
  });

  wv.addEventListener('page-title-updated', function (e) {
    tab.title = e.title;
    tab.element.querySelector('.tab-title').textContent = e.title;
    if (tab.id === activeTabId) {
      aspectSetWindowTitle(e.title + ' — Aspect');
    }
  });

  wv.addEventListener('page-favicon-updated', function (e) {
    if (e.favicons && e.favicons.length > 0) {
      tab.favicon = e.favicons[0];
      var img = tab.element.querySelector('.tab-favicon');
      img.src = e.favicons[0];
      img.style.display = '';
      // Hide spinner once we have a real favicon
      tab.element.querySelector('.tab-spinner').style.display = 'none';
    }
  });

  wv.addEventListener('did-start-loading', function () {
    tab.loading = true;
    if (tab.id === activeTabId) {
      setLoadingUI(true);
      showLoadingBar();
    }
    // Show spinner, hide favicon
    var spinner = tab.element.querySelector('.tab-spinner');
    var img = tab.element.querySelector('.tab-favicon');
    spinner.style.display = '';
    tab.favicon = '';
    img.style.display = 'none';
    img.src = '';
  });

  wv.addEventListener('did-stop-loading', function () {
    tab.loading = false;
    if (tab.id === activeTabId) {
      setLoadingUI(false);
      hideLoadingBar();
      updateNavButtons();
    }
    // Hide spinner (favicon shows if page-favicon-updated fires)
    var spinner = tab.element.querySelector('.tab-spinner');
    spinner.style.display = 'none';
    // Record to history
    try {
      var url = wv.getURL();
      if (url && url !== 'about:blank' && !/^data:/i.test(url)) {
        window.aspect.historyAdd({
          url: url,
          title: tab.title || url,
          favicon: tab.favicon || '',
          timestamp: Date.now()
        });
        // Live-update the history panel if it's open
        if (historyOpen) loadHistoryPanel();
      }
    } catch (e) { /* webview not ready */ }
  });

  // ── Magnet link interception ──

  wv.addEventListener('will-navigate', function (e) {
    var url = e.url || '';
    if (/^magnet:/i.test(url)) {
      try { e.preventDefault(); } catch (_e) {}
      openTorrentTab(url);
    }
  });

  // ── Popup / new-window handling ──

  wv.addEventListener('new-window', function (e) {
    try { e.preventDefault(); } catch (_e) {}
    var url = (e.url || '').trim();
    if (!url || url === 'about:blank') return;
    if (/^magnet:/i.test(url)) {
      openTorrentTab(url);
      return;
    }
    createTab(url, true);
  });

  // ── DOM-level magnet interception (v2) ──
  // Chromium on Windows delegates magnet: to the OS before will-navigate fires.
  // Inject a click interceptor into the guest page to catch <a href="magnet:...">
  // clicks at the DOM level, before Chromium processes the navigation.

  wv.addEventListener('dom-ready', function () {
    wv.executeJavaScript(
      'document.addEventListener("click", function(e) {' +
      '  var a = e.target.closest ? e.target.closest("a[href]") : null;' +
      '  if (!a) return;' +
      '  var h = a.getAttribute("href") || "";' +
      '  if (/^magnet:/i.test(h)) {' +
      '    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();' +
      '    console.log("__TK_MAGNET__:" + h);' +
      '  }' +
      '}, true);'
    ).catch(function(){});
  });

  wv.addEventListener('console-message', function (e) {
    var msg = String(e.message || '');
    if (msg.indexOf('__TK_MAGNET__:') === 0) {
      openTorrentTab(msg.substring('__TK_MAGNET__:'.length));
    }
  });

}

// ── Loading state helpers ──

function setLoadingUI(loading) {
  iconRld.style.display  = loading ? 'none' : '';
  iconStop.style.display = loading ? ''     : 'none';
  btnRld.title = loading ? 'Stop loading (Esc)' : 'Reload (Ctrl+R)';
}

var loadingBarTimer = null;

function showLoadingBar() {
  clearTimeout(loadingBarTimer);
  loadingBar.className = 'loading';
}

function hideLoadingBar() {
  loadingBar.className = 'done';
  clearTimeout(loadingBarTimer);
  loadingBarTimer = setTimeout(function () {
    loadingBar.className = '';
    loadingBarFill.style.width = '';
  }, 300);
}

function syncLoadingState(tab) {
  var loading = false;
  try { loading = tab.webview.isLoading(); } catch (e) {}
  setLoadingUI(loading);
  if (loading) showLoadingBar();
  else { loadingBar.className = ''; }
}

// ── Navigation buttons ──

btnBack.addEventListener('click', function () {
  var wv = getActiveWebview();
  if (wv && wv.canGoBack()) wv.goBack();
});

btnFwd.addEventListener('click', function () {
  var wv = getActiveWebview();
  if (wv && wv.canGoForward()) wv.goForward();
});

btnRld.addEventListener('click', function () {
  var wv = getActiveWebview();
  if (!wv) return;
  try {
    if (wv.isLoading()) wv.stop();
    else wv.reload();
  } catch (e) {
    // webview not ready yet
  }
});

// ── URL bar + omnibox autocomplete ──

var omniDropdown = document.getElementById('omni-dropdown');
var omniSelectedIdx = -1;
var omniResults = [];
var omniDebounce = null;

function navigateUrl(raw) {
  if (!raw) return;
  var url;
  var isSearch = false;
  if (/^https?:\/\//i.test(raw)) {
    url = raw;
  } else if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+/i.test(raw) && !/\s/.test(raw)) {
    url = 'https://' + raw;
  } else {
    url = 'https://yandex.com/search/?text=' + encodeURIComponent(raw);
    isSearch = true;
  }

  // Save search query
  if (isSearch) {
    window.aspect.searchAdd(raw);
  }

  var wv = getActiveWebview();
  if (wv) wv.loadURL(url);
}

urlBar.addEventListener('keydown', function (e) {
  // Arrow navigation in dropdown
  if (omniDropdown.style.display !== 'none' && omniResults.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      omniSelectedIdx = Math.min(omniSelectedIdx + 1, omniResults.length - 1);
      updateOmniSelection();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      omniSelectedIdx = Math.max(omniSelectedIdx - 1, -1);
      updateOmniSelection();
      return;
    }
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    // If a dropdown item is selected, use it
    if (omniSelectedIdx >= 0 && omniSelectedIdx < omniResults.length) {
      var item = omniResults[omniSelectedIdx];
      if (item.url) {
        var wv = getActiveWebview();
        if (wv) wv.loadURL(item.url);
      } else {
        navigateUrl(item.text);
      }
    } else {
      navigateUrl(urlBar.value.trim());
    }
    hideOmniDropdown();
    urlBar.blur();
  }

  if (e.key === 'Escape') {
    if (omniDropdown.style.display !== 'none') {
      hideOmniDropdown();
    } else {
      var wv = getActiveWebview();
      urlBar.value = (wv && wv.getURL()) || '';
      urlBar.blur();
    }
  }
});

urlBar.addEventListener('input', function () {
  var val = urlBar.value.trim();
  if (!val) { hideOmniDropdown(); return; }
  clearTimeout(omniDebounce);
  omniDebounce = setTimeout(function () {
    window.aspect.searchSuggest(val).then(function (results) {
      if (!results || results.length === 0 || urlBar !== document.activeElement) {
        hideOmniDropdown();
        return;
      }
      omniResults = results;
      omniSelectedIdx = -1;
      renderOmniDropdown();
    });
  }, 100);
});

urlBar.addEventListener('focus', function () {
  setTimeout(function () { urlBar.select(); }, 0);
  // Show suggestions for current value
  var val = urlBar.value.trim();
  if (val) {
    window.aspect.searchSuggest(val).then(function (results) {
      if (!results || results.length === 0 || urlBar !== document.activeElement) return;
      omniResults = results;
      omniSelectedIdx = -1;
      renderOmniDropdown();
    });
  }
});

urlBar.addEventListener('blur', function () {
  // Delay to allow click on dropdown item
  setTimeout(function () { hideOmniDropdown(); }, 150);
});

function renderOmniDropdown() {
  omniDropdown.innerHTML = '';
  omniResults.forEach(function (item, idx) {
    var el = document.createElement('div');
    el.className = 'omni-item' + (idx === omniSelectedIdx ? ' selected' : '');
    el.dataset.idx = idx;

    var icon;
    if (item.type === 'search') {
      icon = '<svg class="omni-icon" width="16" height="16" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M9.5 9.5L13 13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    } else if (item.type === 'bookmark') {
      icon = '<svg class="omni-icon" width="16" height="16" viewBox="0 0 16 16"><path d="M4 2.5h8v11L8 10.5 4 13.5z" stroke="#f9ab00" stroke-width="1.3" fill="#f9ab00" stroke-linejoin="round"/></svg>';
    } else {
      icon = item.favicon
        ? '<img class="omni-icon" width="16" height="16" src="' + escapeHtml(item.favicon) + '">'
        : '<svg class="omni-icon" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M8 4.5V8l2.5 2" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }

    var text = escapeHtml(item.text || '');
    var url = item.url ? '<span class="omni-url">' + escapeHtml(item.url) + '</span>' : '';

    el.innerHTML = icon + '<span class="omni-text">' + text + '</span>' + url;

    el.addEventListener('mousedown', function (e) {
      e.preventDefault(); // prevent blur
      if (item.url) {
        var wv = getActiveWebview();
        if (wv) wv.loadURL(item.url);
      } else {
        navigateUrl(item.text);
      }
      hideOmniDropdown();
      urlBar.blur();
    });

    el.addEventListener('mouseenter', function () {
      omniSelectedIdx = idx;
      updateOmniSelection();
    });

    omniDropdown.appendChild(el);
  });
  omniDropdown.style.display = '';
}

function hideOmniDropdown() {
  omniDropdown.style.display = 'none';
  omniDropdown.innerHTML = '';
  omniResults = [];
  omniSelectedIdx = -1;
}

function updateOmniSelection() {
  var items = omniDropdown.querySelectorAll('.omni-item');
  items.forEach(function (el, i) {
    el.classList.toggle('selected', i === omniSelectedIdx);
  });
  // Update URL bar text to match selection
  if (omniSelectedIdx >= 0 && omniSelectedIdx < omniResults.length) {
    var item = omniResults[omniSelectedIdx];
    urlBar.value = item.url || item.text;
  }
}

// ── New tab button ──

btnNewTab.addEventListener('click', function () {
  createTab();
});

// ── Keyboard shortcuts ──

document.addEventListener('keydown', function (e) {
  if (!aspectCanHandleGlobalKey(e)) return;
  var wv = getActiveWebview();

  // Ctrl+F — find in page
  if (e.ctrlKey && !e.shiftKey && e.key === 'f') {
    e.preventDefault();
    openFind();
    return;
  }

  // Ctrl+T — new tab
  if (e.ctrlKey && !e.shiftKey && e.key === 't') {
    e.preventDefault();
    createTab();
  }

  // Ctrl+W — close tab
  if (e.ctrlKey && !e.shiftKey && e.key === 'w') {
    e.preventDefault();
    if (activeTabId !== null) closeTab(activeTabId);
  }

  // Ctrl+L — focus URL bar
  if (e.ctrlKey && e.key === 'l') {
    e.preventDefault();
    urlBar.focus();
  }

  // Ctrl+Tab — next tab
  if (e.ctrlKey && !e.shiftKey && e.key === 'Tab') {
    e.preventDefault();
    cycleTab(1);
  }

  // Ctrl+Shift+Tab — previous tab
  if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
    e.preventDefault();
    cycleTab(-1);
  }

  // Ctrl+1 through Ctrl+8 — switch to tab N
  if (e.ctrlKey && e.key >= '1' && e.key <= '8') {
    e.preventDefault();
    var n = parseInt(e.key) - 1;
    if (n < tabs.length) switchTab(tabs[n].id);
  }

  // Ctrl+9 — switch to last tab
  if (e.ctrlKey && e.key === '9') {
    e.preventDefault();
    if (tabs.length > 0) switchTab(tabs[tabs.length - 1].id);
  }

  // Alt+Left — back
  if (e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault();
    if (wv && wv.canGoBack()) wv.goBack();
  }

  // Alt+Right — forward
  if (e.altKey && e.key === 'ArrowRight') {
    e.preventDefault();
    if (wv && wv.canGoForward()) wv.goForward();
  }

  // Ctrl+R or F5 — reload
  if ((e.ctrlKey && !e.shiftKey && e.key === 'r') || (!e.shiftKey && e.key === 'F5')) {
    e.preventDefault();
    if (wv) wv.reload();
  }

  // Ctrl+Shift+R or Shift+F5 — hard reload
  if ((e.ctrlKey && e.shiftKey && e.key === 'R') || (e.shiftKey && e.key === 'F5')) {
    e.preventDefault();
    if (wv) wv.reloadIgnoringCache();
  }

  // Ctrl+= or Ctrl+Shift+= — zoom in
  if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
    e.preventDefault();
    zoomIn();
  }

  // Ctrl+- — zoom out
  if (e.ctrlKey && e.key === '-') {
    e.preventDefault();
    zoomOut();
  }

  // Ctrl+0 — reset zoom
  if (e.ctrlKey && e.key === '0') {
    e.preventDefault();
    zoomReset();
  }

  // F12 or Ctrl+Shift+I — DevTools
  if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
    e.preventDefault();
    toggleDevTools();
  }

  // Ctrl+Shift+T — toggle Tor
  if (e.ctrlKey && e.shiftKey && e.key === 'T') {
    e.preventDefault();
    toggleTor();
  }
});

function cycleTab(direction) {
  if (tabs.length < 2) return;
  var idx = tabs.findIndex(function (t) { return t.id === activeTabId; });
  var next = (idx + direction + tabs.length) % tabs.length;
  switchTab(tabs[next].id);
}

// ── Helpers ──

function updateNavButtons() {
  var wv = getActiveWebview();
  try {
    btnBack.disabled = !(wv && wv.canGoBack());
    btnFwd.disabled  = !(wv && wv.canGoForward());
  } catch (e) {
    btnBack.disabled = true;
    btnFwd.disabled  = true;
  }
}

// ── Find in page ──

var findBar   = document.getElementById('find-bar');
var findInput = document.getElementById('find-input');
var findMatches = document.getElementById('find-matches');
var findPrev  = document.getElementById('find-prev');
var findNext  = document.getElementById('find-next');
var findClose = document.getElementById('find-close');
var findOpen  = false;

function openFind() {
  findOpen = true;
  findBar.style.display = '';
  findInput.focus();
  findInput.select();
}

function closeFind() {
  findOpen = false;
  findBar.style.display = 'none';
  findInput.value = '';
  findMatches.textContent = '';
  var wv = getActiveWebview();
  if (wv) wv.stopFindInPage('clearSelection');
}

function doFind(forward) {
  var text = findInput.value;
  var wv = getActiveWebview();
  if (!wv || !text) return;
  wv.findInPage(text, { forward: forward, findNext: true });
}

findInput.addEventListener('input', function () {
  var text = findInput.value;
  var wv = getActiveWebview();
  if (!wv) return;
  if (text) {
    wv.findInPage(text);
  } else {
    findMatches.textContent = '';
    wv.stopFindInPage('clearSelection');
  }
});

findInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    doFind(!e.shiftKey);
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    closeFind();
  }
});

findPrev.addEventListener('click', function () { doFind(false); });
findNext.addEventListener('click', function () { doFind(true); });
findClose.addEventListener('click', closeFind);

// Listen for found-in-page results on each webview
function bindFindEvents(tab) {
  tab.webview.addEventListener('found-in-page', function (e) {
    if (tab.id !== activeTabId) return;
    var r = e.result;
    if (r.matches !== undefined) {
      findMatches.textContent = r.matches > 0
        ? r.activeMatchOrdinal + ' of ' + r.matches
        : 'No matches';
    }
  });
}

// ── Zoom ──

var zoomIndicator = document.getElementById('zoom-indicator');
var zoomLevel = 0; // Electron zoom levels: -3 = 50%, 0 = 100%, 3 = 200% (each step ≈ 20%)
var zoomTimer = null;

function zoomIn() {
  zoomLevel = Math.min(zoomLevel + 1, 5);
  applyZoom();
}

function zoomOut() {
  zoomLevel = Math.max(zoomLevel - 1, -5);
  applyZoom();
}

function zoomReset() {
  zoomLevel = 0;
  applyZoom();
}

function applyZoom() {
  var wv = getActiveWebview();
  if (wv) wv.setZoomLevel(zoomLevel);
  showZoomIndicator();
}

function showZoomIndicator() {
  // Convert zoom level to percentage: factor = 1.2^level
  var pct = Math.round(Math.pow(1.2, zoomLevel) * 100);
  zoomIndicator.textContent = pct + '%';
  zoomIndicator.style.display = '';
  zoomIndicator.style.opacity = '1';
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(function () {
    zoomIndicator.style.opacity = '0';
    setTimeout(function () { zoomIndicator.style.display = 'none'; }, 200);
  }, 1500);
}

// ── DevTools ──

function toggleDevTools() {
  var wv = getActiveWebview();
  if (!wv) return;
  // Use IPC since webview.openDevTools() requires webContents access
  var wcId = wv.getWebContentsId();
  window.aspect.ctxAction(wcId, 'devtools');
}

// ── Context menu ──

var ctxMenu = document.getElementById('context-menu');
var ctxOverlay = document.getElementById('ctx-overlay');
var ctxParams = null;

function showContextMenu(params) {
  ctxParams = params;
  var items = [];

  // Back / Forward / Reload
  items.push({ label: 'Back', shortcut: 'Alt+Left', action: 'back', disabled: !params.canGoBack });
  items.push({ label: 'Forward', shortcut: 'Alt+Right', action: 'forward', disabled: !params.canGoForward });
  items.push({ label: 'Reload', shortcut: 'Ctrl+R', action: 'reload' });
  items.push({ separator: true });

  // Link context
  if (params.linkURL) {
    items.push({ label: 'Open link in new tab', action: 'openLinkNewTab' });
    items.push({ label: 'Copy link address', action: 'copyLink' });
    items.push({ separator: true });
  }

  // Image context
  if (params.mediaType === 'image') {
    items.push({ label: 'Save image as...', action: 'saveImage' });
    items.push({ label: 'Copy image', action: 'copyImage' });
    if (params.srcURL) {
      items.push({ label: 'Open image in new tab', action: 'openImageNewTab' });
    }
    items.push({ separator: true });
  }

  // Text selection
  if (params.selectionText) {
    items.push({ label: 'Copy', shortcut: 'Ctrl+C', action: 'copy' });
    if (params.isEditable) {
      items.push({ label: 'Cut', shortcut: 'Ctrl+X', action: 'cut' });
    }
    items.push({ label: 'Search Yandex for "' + truncate(params.selectionText, 30) + '"', action: 'searchSelection' });
    items.push({ separator: true });
  }

  // Editable field
  if (params.isEditable && !params.selectionText) {
    items.push({ label: 'Paste', shortcut: 'Ctrl+V', action: 'paste' });
    items.push({ label: 'Select all', shortcut: 'Ctrl+A', action: 'selectAll' });
    items.push({ separator: true });
  }

  // Always available
  items.push({ label: 'Inspect', shortcut: 'Ctrl+Shift+I', action: 'inspect' });

  // Build DOM
  ctxMenu.innerHTML = '';
  items.forEach(function (item) {
    if (item.separator) {
      var sep = document.createElement('div');
      sep.className = 'ctx-separator';
      ctxMenu.appendChild(sep);
      return;
    }
    var el = document.createElement('div');
    el.className = 'ctx-item' + (item.disabled ? ' disabled' : '');
    el.innerHTML = '<span>' + item.label + '</span>' +
      (item.shortcut ? '<span class="ctx-shortcut">' + item.shortcut + '</span>' : '');
    el.addEventListener('click', function () {
      var action = item.action;
      execContextAction(action);
      hideContextMenu();
    });
    ctxMenu.appendChild(el);
  });

  // Show overlay to catch clicks outside the menu (webview eats events)
  ctxOverlay.style.display = '';

  // Position — keep on screen
  ctxMenu.style.display = '';
  var mw = ctxMenu.offsetWidth;
  var mh = ctxMenu.offsetHeight;
  var x = Math.min(params.screenX, window.innerWidth - mw - 4);
  var y = Math.min(params.screenY, window.innerHeight - mh - 4);
  ctxMenu.style.left = Math.max(0, x) + 'px';
  ctxMenu.style.top  = Math.max(0, y) + 'px';
}

function hideContextMenu() {
  ctxMenu.style.display = 'none';
  ctxOverlay.style.display = 'none';
  ctxParams = null;
}

function execContextAction(action) {
  if (!ctxParams) return;
  var wcId = ctxParams.webContentsId;

  switch (action) {
    case 'back':
    case 'forward':
    case 'reload':
    case 'copy':
    case 'cut':
    case 'paste':
    case 'selectAll':
      window.aspect.ctxAction(wcId, action);
      break;
    case 'openLinkNewTab':
      createTab(ctxParams.linkURL);
      break;
    case 'copyLink':
      window.aspect.ctxAction(wcId, 'copyLink', ctxParams.linkURL);
      break;
    case 'saveImage':
      window.aspect.ctxAction(wcId, 'saveImage', ctxParams.srcURL);
      break;
    case 'copyImage':
      window.aspect.ctxAction(wcId, 'copyImage', { x: ctxParams.x, y: ctxParams.y });
      break;
    case 'openImageNewTab':
      createTab(ctxParams.srcURL);
      break;
    case 'searchSelection':
      createTab('https://yandex.com/search/?text=' + encodeURIComponent(ctxParams.selectionText));
      break;
    case 'inspect':
      window.aspect.ctxAction(wcId, 'inspect', { x: ctxParams.x, y: ctxParams.y });
      break;
  }
}

function truncate(str, max) {
  return str.length > max ? str.substring(0, max) + '...' : str;
}

// Dismiss context menu on click anywhere or Escape
ctxOverlay.addEventListener('mousedown', function () {
  hideContextMenu();
});
document.addEventListener('mousedown', function (e) {
  if (ctxParams && !ctxMenu.contains(e.target) && e.target !== ctxOverlay) hideContextMenu();
});
document.addEventListener('keydown', function (e) {
  if (!aspectCanHandleGlobalKey(e)) return;
  if (e.key === 'Escape' && ctxParams) hideContextMenu();
});

// ── URL bar context menu ──
urlBar.addEventListener('contextmenu', function (e) {
  e.preventDefault();
  // Capture selection now — clicking menu items will blur the input
  var selStart = urlBar.selectionStart;
  var selEnd = urlBar.selectionEnd;
  var hasSelection = selStart !== selEnd;
  var items = [];

  if (hasSelection) {
    items.push({ label: 'Cut', shortcut: 'Ctrl+X', action: 'urlCut' });
    items.push({ label: 'Copy', shortcut: 'Ctrl+C', action: 'urlCopy' });
  }
  items.push({ label: 'Paste', shortcut: 'Ctrl+V', action: 'urlPaste' });
  if (urlBar.value) {
    items.push({ label: 'Select all', shortcut: 'Ctrl+A', action: 'urlSelectAll' });
  }

  // Build and show using the same context menu element
  ctxParams = { isUrlBar: true };
  ctxMenu.innerHTML = '';
  items.forEach(function (item) {
    var el = document.createElement('div');
    el.className = 'ctx-item';
    el.innerHTML = '<span>' + item.label + '</span>' +
      '<span class="ctx-shortcut">' + item.shortcut + '</span>';
    el.addEventListener('click', function () {
      var val = urlBar.value;
      switch (item.action) {
        case 'urlCut':
          window.aspect.clipboardWrite(val.substring(selStart, selEnd));
          urlBar.value = val.substring(0, selStart) + val.substring(selEnd);
          urlBar.focus();
          urlBar.setSelectionRange(selStart, selStart);
          break;
        case 'urlCopy':
          window.aspect.clipboardWrite(val.substring(selStart, selEnd));
          break;
        case 'urlPaste':
          var clip = window.aspect.clipboardRead();
          urlBar.value = val.substring(0, selStart) + clip + val.substring(selEnd);
          urlBar.focus();
          var newPos = selStart + clip.length;
          urlBar.setSelectionRange(newPos, newPos);
          break;
        case 'urlSelectAll':
          urlBar.focus();
          urlBar.select();
          break;
      }
      hideContextMenu();
    });
    ctxMenu.appendChild(el);
  });

  ctxOverlay.style.display = '';
  ctxMenu.style.display = '';
  var mw = ctxMenu.offsetWidth;
  var mh = ctxMenu.offsetHeight;
  var x = Math.min(e.clientX, window.innerWidth - mw - 4);
  var y = Math.min(e.clientY, window.innerHeight - mh - 4);
  ctxMenu.style.left = Math.max(0, x) + 'px';
  ctxMenu.style.top  = Math.max(0, y) + 'px';
});

// Receive context menu params from main process
// screenX/screenY are pre-calculated in main.js using cursor screen position
window.aspect.onShowContextMenu(function (params) {
  showContextMenu(params);
});

// ── Three-dot menu ──

var btnMenu = document.getElementById('btn-menu');
var menuPanel = document.getElementById('menu-panel');
var menuOverlay = document.getElementById('menu-overlay');
var downloadsPanel = document.getElementById('downloads-panel');
var downloadsList = document.getElementById('downloads-list');
var downloadsEmpty = document.getElementById('downloads-empty');
var downloadsClose = document.getElementById('downloads-close');
var historyPanel = document.getElementById('history-panel');
var historyList = document.getElementById('history-list');
var historyEmpty = document.getElementById('history-empty');
var historyClose = document.getElementById('history-close');
var historySearch = document.getElementById('history-search');
var historyClearAll = document.getElementById('history-clear-all');
var bookmarksPanel = document.getElementById('bookmarks-panel');
var bookmarksList = document.getElementById('bookmarks-list');
var bookmarksEmpty = document.getElementById('bookmarks-empty');
var bookmarksClose = document.getElementById('bookmarks-close');
var bookmarksSearch = document.getElementById('bookmarks-search');
var btnBookmark = document.getElementById('btn-bookmark');
var iconBookmarkOutline = document.getElementById('icon-bookmark-outline');
var iconBookmarkFilled = document.getElementById('icon-bookmark-filled');
var menuOpen = false;
var downloadsOpen = false;
var historyOpen = false;
var bookmarksOpen = false;

function showMenuPanel() {
  hideAllPanels();
  menuOpen = true;
  menuPanel.style.display = '';
  menuOverlay.style.display = '';
}

function showDownloadsPanel() {
  hideAllPanels();
  downloadsOpen = true;
  downloadsPanel.style.display = '';
  menuOverlay.style.display = '';
}

function showHistoryPanel() {
  hideAllPanels();
  historyOpen = true;
  historyPanel.style.display = '';
  menuOverlay.style.display = '';
  historySearch.value = '';
  loadHistoryPanel();
}

function showBookmarksPanel() {
  hideAllPanels();
  bookmarksOpen = true;
  bookmarksPanel.style.display = '';
  menuOverlay.style.display = '';
  bookmarksSearch.value = '';
  loadBookmarksPanel();
}

function hideAllPanels() {
  menuOpen = false;
  downloadsOpen = false;
  historyOpen = false;
  bookmarksOpen = false;
  menuPanel.style.display = 'none';
  downloadsPanel.style.display = 'none';
  historyPanel.style.display = 'none';
  bookmarksPanel.style.display = 'none';
  menuOverlay.style.display = 'none';
}

btnMenu.addEventListener('click', function () {
  if (menuOpen) hideAllPanels();
  else showMenuPanel();
});

menuOverlay.addEventListener('mousedown', function () {
  hideAllPanels();
});

downloadsClose.addEventListener('click', function () {
  hideAllPanels();
});

// Menu item clicks
menuPanel.addEventListener('click', function (e) {
  var item = e.target.closest('.menu-item');
  if (!item) return;
  var action = item.dataset.action;
  hideAllPanels();

  switch (action) {
    case 'new-tab':   createTab(); break;
    case 'downloads': showDownloadsPanel(); break;
    case 'history':   showHistoryPanel(); break;
    case 'bookmarks': showBookmarksPanel(); break;
    case 'print-pdf': {
      var wv = getActiveWebview();
      if (wv) window.aspect.printPdf(wv.getWebContentsId());
      break;
    }
    case 'screenshot': {
      var wv = getActiveWebview();
      if (wv) window.aspect.capturePage(wv.getWebContentsId());
      break;
    }
    case 'torrent':   openTorrentTab(); break;
  }
});

// Ctrl+J — toggle downloads panel
document.addEventListener('keydown', function (e) {
  if (!aspectCanHandleGlobalKey(e)) return;
  if (e.ctrlKey && !e.shiftKey && e.key === 'j') {
    e.preventDefault();
    if (downloadsOpen) hideAllPanels();
    else showDownloadsPanel();
  }
});

// Ctrl+H — toggle history panel
document.addEventListener('keydown', function (e) {
  if (!aspectCanHandleGlobalKey(e)) return;
  if (e.ctrlKey && !e.shiftKey && e.key === 'h') {
    e.preventDefault();
    if (historyOpen) hideAllPanels();
    else showHistoryPanel();
  }
});

// Ctrl+B — toggle bookmarks panel
document.addEventListener('keydown', function (e) {
  if (!aspectCanHandleGlobalKey(e)) return;
  if (e.ctrlKey && !e.shiftKey && e.key === 'b') {
    e.preventDefault();
    if (bookmarksOpen) hideAllPanels();
    else showBookmarksPanel();
  }
});

// Ctrl+D — bookmark / unbookmark current page
document.addEventListener('keydown', function (e) {
  if (!aspectCanHandleGlobalKey(e)) return;
  if (e.ctrlKey && !e.shiftKey && e.key === 'd') {
    e.preventDefault();
    toggleBookmark();
  }
});

// Ctrl+P — print page as PDF
document.addEventListener('keydown', function (e) {
  if (!aspectCanHandleGlobalKey(e)) return;
  if (e.ctrlKey && !e.shiftKey && e.key === 'p') {
    e.preventDefault();
    var wv = getActiveWebview();
    if (wv) window.aspect.printPdf(wv.getWebContentsId());
  }
});

// Ctrl+Shift+S — screenshot full page
document.addEventListener('keydown', function (e) {
  if (!aspectCanHandleGlobalKey(e)) return;
  if (e.ctrlKey && e.shiftKey && e.key === 'S') {
    e.preventDefault();
    var wv = getActiveWebview();
    if (wv) window.aspect.capturePage(wv.getWebContentsId());
  }
});

// ── History panel ──

historyClose.addEventListener('click', function () {
  hideAllPanels();
});

historyClearAll.addEventListener('click', function () {
  window.aspect.historyClear();
  historyList.innerHTML = '<div id="history-empty">No history yet</div>';
});

historySearch.addEventListener('input', function () {
  loadHistoryPanel();
});

function loadHistoryPanel() {
  window.aspect.historyLoad().then(function (entries) {
    var query = historySearch.value.toLowerCase().trim();
    if (query) {
      entries = entries.filter(function (h) {
        return (h.title && h.title.toLowerCase().indexOf(query) !== -1) ||
               (h.url && h.url.toLowerCase().indexOf(query) !== -1);
      });
    }

    historyList.innerHTML = '';
    if (entries.length === 0) {
      historyList.innerHTML = '<div id="history-empty">' +
        (query ? 'No matches' : 'No history yet') + '</div>';
      return;
    }

    // Group by date
    var groups = {};
    entries.forEach(function (h) {
      var d = new Date(h.timestamp);
      var key = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    });

    // Render (limit to 200 entries for performance)
    var count = 0;
    Object.keys(groups).forEach(function (dateLabel) {
      if (count >= 200) return;
      var header = document.createElement('div');
      header.className = 'history-date-group';
      header.textContent = dateLabel;
      historyList.appendChild(header);

      groups[dateLabel].forEach(function (h) {
        if (count >= 200) return;
        var el = document.createElement('div');
        el.className = 'history-item';
        el.dataset.url = h.url;
        el.dataset.timestamp = h.timestamp;

        var time = new Date(h.timestamp);
        var timeStr = time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

        var faviconHtml = h.favicon
          ? '<img class="history-item-favicon" src="' + escapeHtml(h.favicon) + '">'
          : '<svg class="history-item-favicon" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" stroke="#5f6368" stroke-width="1" fill="none"/></svg>';

        el.innerHTML = faviconHtml +
          '<div class="history-item-info">' +
            '<div class="history-item-title">' + escapeHtml(h.title || h.url) + '</div>' +
            '<div class="history-item-url">' + escapeHtml(h.url) + '</div>' +
          '</div>' +
          '<span class="history-item-time">' + timeStr + '</span>' +
          '<button class="history-item-delete" title="Remove"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></button>';

        historyList.appendChild(el);
        count++;
      });
    });
  });
}

// History item clicks (navigate or delete)
historyList.addEventListener('click', function (e) {
  var deleteBtn = e.target.closest('.history-item-delete');
  var item = e.target.closest('.history-item');
  if (!item) return;

  if (deleteBtn) {
    // Delete this entry
    var ts = parseInt(item.dataset.timestamp);
    window.aspect.historyDelete(ts);
    item.remove();
    return;
  }

  // Navigate to URL in active tab
  var url = item.dataset.url;
  if (url) {
    var wv = getActiveWebview();
    if (wv) wv.loadURL(url);
    hideAllPanels();
  }
});

// ── Bookmarks panel ──

bookmarksClose.addEventListener('click', function () {
  hideAllPanels();
});

bookmarksSearch.addEventListener('input', function () {
  loadBookmarksPanel();
});

function loadBookmarksPanel() {
  window.aspect.bookmarksLoad().then(function (entries) {
    var query = bookmarksSearch.value.toLowerCase().trim();
    if (query) {
      entries = entries.filter(function (b) {
        return (b.title && b.title.toLowerCase().indexOf(query) !== -1) ||
               (b.url && b.url.toLowerCase().indexOf(query) !== -1);
      });
    }

    bookmarksList.innerHTML = '';
    if (entries.length === 0) {
      bookmarksList.innerHTML = '<div id="bookmarks-empty">' +
        (query ? 'No matches' : 'No bookmarks yet') + '</div>';
      return;
    }

    entries.forEach(function (b) {
      var el = document.createElement('div');
      el.className = 'bookmark-item';
      el.dataset.url = b.url;

      var faviconHtml = b.favicon
        ? '<img class="bookmark-item-favicon" src="' + escapeHtml(b.favicon) + '">'
        : '<svg class="bookmark-item-favicon" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" stroke="#5f6368" stroke-width="1" fill="none"/></svg>';

      el.innerHTML = faviconHtml +
        '<div class="bookmark-item-info">' +
          '<div class="bookmark-item-title">' + escapeHtml(b.title || b.url) + '</div>' +
          '<div class="bookmark-item-url">' + escapeHtml(b.url) + '</div>' +
        '</div>' +
        '<button class="bookmark-item-delete" title="Remove bookmark"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></button>';

      bookmarksList.appendChild(el);
    });
  });
}

// Bookmark item clicks (navigate or delete)
bookmarksList.addEventListener('click', function (e) {
  var deleteBtn = e.target.closest('.bookmark-item-delete');
  var item = e.target.closest('.bookmark-item');
  if (!item) return;

  if (deleteBtn) {
    var url = item.dataset.url;
    window.aspect.bookmarksRemove(url);
    item.remove();
    // Update star icon if we just removed the current page's bookmark
    updateBookmarkIcon();
    // Live-update the bookmark bar
    renderBookmarkBar();
    // Show empty message if no bookmarks left
    if (bookmarksList.children.length === 0) {
      bookmarksList.innerHTML = '<div id="bookmarks-empty">No bookmarks yet</div>';
    }
    return;
  }

  // Navigate to URL in active tab
  var url = item.dataset.url;
  if (url) {
    var wv = getActiveWebview();
    if (wv) wv.loadURL(url);
    hideAllPanels();
  }
});

// ── Bookmark star button ──

btnBookmark.addEventListener('click', function () {
  toggleBookmark();
});

function toggleBookmark() {
  var wv = getActiveWebview();
  if (!wv) return;
  var url;
  try { url = wv.getURL(); } catch (e) { return; }
  if (!url || url === 'about:blank') return;

  window.aspect.bookmarksCheck(url).then(function (isBookmarked) {
    if (isBookmarked) {
      window.aspect.bookmarksRemove(url);
      setBookmarkIcon(false);
    } else {
      var tab = getActiveTab();
      window.aspect.bookmarksAdd({
        url: url,
        title: tab ? tab.title : url,
        favicon: tab ? tab.favicon : '',
        timestamp: Date.now()
      });
      setBookmarkIcon(true);
    }
    // Live-update the bookmarks panel if it's open
    if (bookmarksOpen) loadBookmarksPanel();
    // Live-update the bookmark bar
    renderBookmarkBar();
  });
}

function setBookmarkIcon(filled) {
  iconBookmarkOutline.style.display = filled ? 'none' : '';
  iconBookmarkFilled.style.display = filled ? '' : 'none';
}

function updateBookmarkIcon() {
  var wv = getActiveWebview();
  if (!wv) { setBookmarkIcon(false); return; }
  var url;
  try { url = wv.getURL(); } catch (e) { setBookmarkIcon(false); return; }
  if (!url || url === 'about:blank') { setBookmarkIcon(false); return; }

  window.aspect.bookmarksCheck(url).then(function (isBookmarked) {
    setBookmarkIcon(isBookmarked);
  });
}

// ── Tor toggle ──

var btnTor = document.getElementById('btn-tor');
var torBadge = document.getElementById('tor-badge');
var torActive = false;
var torConnecting = false;

btnTor.addEventListener('click', function () {
  toggleTor();
});

function toggleTor() {
  if (torConnecting) return; // don't allow toggling while connecting

  if (torActive) {
    window.aspect.torStop().then(function (result) {
      if (!result.ok) console.error('Tor stop failed:', result.error);
    });
  } else {
    window.aspect.torStart().then(function (result) {
      if (!result.ok) {
        // Show error to user via the button title
        btnTor.title = 'Tor failed: ' + result.error;
        console.error('Tor start failed:', result.error);
      }
    });
  }
}

function updateTorUI(status) {
  torActive = status.active;
  torConnecting = status.connecting;

  // Button class
  btnTor.classList.toggle('tor-active', status.active);
  btnTor.classList.toggle('tor-connecting', status.connecting);

  // URL bar purple tint when Tor is active
  urlBar.classList.toggle('tor-on', status.active);

  // Badge
  if (status.active) {
    torBadge.style.display = '';
    torBadge.className = 'tor-badge connected';
    btnTor.title = 'Tor connected — click to disconnect (Ctrl+Shift+T)';
  } else if (status.connecting) {
    torBadge.style.display = '';
    torBadge.className = 'tor-badge connecting';
    var msg = status.statusMessage || 'Connecting...';
    if (status.bootstrapProgress > 0) msg = 'Bootstrapping... ' + status.bootstrapProgress + '%';
    btnTor.title = msg;
  } else {
    torBadge.style.display = 'none';
    torBadge.className = 'tor-badge';
    btnTor.title = 'Toggle Tor (Ctrl+Shift+T)';
  }
}

// Listen for status updates from main process
window.aspect.onTorStatusChanged(function (status) {
  updateTorUI(status);
});

// Sync initial state
window.aspect.torGetStatus().then(function (status) {
  updateTorUI(status);
});

// ── Downloads ──

var downloads = {}; // id → { id, filename, totalBytes, received, state, savePath }

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  var units = ['B', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function renderDownloadItem(dl) {
  var existing = document.getElementById('dl-' + dl.id);
  if (existing) {
    // Update in place
    var pct = dl.totalBytes > 0 ? Math.round((dl.received / dl.totalBytes) * 100) : 0;
    var fill = existing.querySelector('.dl-progress-fill');
    var status = existing.querySelector('.dl-status');
    var icon = existing.querySelector('.dl-icon');
    var actions = existing.querySelector('.dl-actions');

    if (dl.state === 'completed') {
      if (fill) fill.parentElement.style.display = 'none';
      status.textContent = formatBytes(dl.totalBytes || dl.received);
      icon.className = 'dl-icon complete';
      icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 8.5l3 3 5-6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      actions.innerHTML =
        '<button class="dl-btn" data-dl-action="open" title="Open file"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M5 2h7v7M12 2L5.5 8.5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<button class="dl-btn" data-dl-action="show" title="Show in folder"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 4.5h3l1-1.5h4l1 1.5h1v6H2z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/></svg></button>';
    } else if (dl.state === 'cancelled' || dl.state === 'interrupted') {
      if (fill) fill.parentElement.style.display = 'none';
      status.textContent = dl.state === 'cancelled' ? 'Cancelled' : 'Failed';
      icon.className = 'dl-icon failed';
      icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';
      actions.innerHTML = '';
    } else {
      // progressing
      if (fill) {
        fill.style.width = pct + '%';
        fill.parentElement.style.display = '';
      }
      status.textContent = formatBytes(dl.received) + (dl.totalBytes > 0 ? ' / ' + formatBytes(dl.totalBytes) + ' — ' + pct + '%' : '');
    }
    return;
  }

  // Create new item
  downloadsEmpty.style.display = 'none';

  var el = document.createElement('div');
  el.className = 'dl-item';
  el.id = 'dl-' + dl.id;

  var pct = dl.totalBytes > 0 ? Math.round((dl.received / dl.totalBytes) * 100) : 0;

  el.innerHTML =
    '<div class="dl-icon">' +
      '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 2v8M4.5 7.5L8 11l3.5-3.5M3 13h10" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '</div>' +
    '<div class="dl-info">' +
      '<div class="dl-name">' + escapeHtml(dl.filename) + '</div>' +
      '<div class="dl-status">' + formatBytes(dl.received) + (dl.totalBytes > 0 ? ' / ' + formatBytes(dl.totalBytes) + ' — ' + pct + '%' : '') + '</div>' +
      '<div class="dl-progress-bar"><div class="dl-progress-fill" style="width:' + pct + '%"></div></div>' +
    '</div>' +
    '<div class="dl-actions">' +
      '<button class="dl-btn" data-dl-action="cancel" title="Cancel"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></button>' +
    '</div>';

  downloadsList.insertBefore(el, downloadsList.firstChild);
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Download action buttons (open, show in folder, cancel)
downloadsList.addEventListener('click', function (e) {
  var btn = e.target.closest('.dl-btn');
  if (!btn) return;
  var action = btn.dataset.dlAction;
  var item = btn.closest('.dl-item');
  var id = parseInt(item.id.replace('dl-', ''));
  var dl = downloads[id];
  if (!dl) return;

  switch (action) {
    case 'cancel': window.aspect.downloadAction(id, 'cancel'); break;
    case 'open':   window.aspect.downloadOpen(dl.savePath); break;
    case 'show':   window.aspect.downloadShow(dl.savePath); break;
  }
});

// IPC: download events from main process
window.aspect.onDownloadStarted(function (info) {
  downloads[info.id] = {
    id: info.id,
    filename: info.filename,
    totalBytes: info.totalBytes,
    received: 0,
    state: 'progressing',
    savePath: ''
  };
  renderDownloadItem(downloads[info.id]);
  // Auto-open downloads panel when a download starts
  if (!downloadsOpen) showDownloadsPanel();
});

window.aspect.onDownloadProgress(function (info) {
  var dl = downloads[info.id];
  if (!dl) return;
  dl.received = info.received;
  dl.totalBytes = info.totalBytes;
  dl.state = info.state;
  renderDownloadItem(dl);
});

window.aspect.onDownloadDone(function (info) {
  var dl = downloads[info.id];
  if (!dl) return;
  dl.state = info.state;
  dl.savePath = info.savePath;
  renderDownloadItem(dl);
});

// ── IPC: new tab requests from main process (middle-click, window.open, etc.) ──
window.aspect.onCreateTab(function (url, disposition) {
  var foreground = disposition !== 'background-tab';
  createTab(url, foreground);
});

// ── Torrent tab (singleton) ──

function openTorrentTab(source) {
  // If a torrent tab already exists, switch to it
  var existing = tabs.find(function (t) { return t.type === 'torrent'; });
  if (existing) {
    switchTab(existing.id);
    if (source && typeof window.torrentTabAddSource === 'function') {
      window.torrentTabAddSource(source);
    }
    return existing;
  }

  var id = nextTabId++;

  // Create tab element
  var tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.tabId = id;
  tabEl.innerHTML =
    '<svg class="tab-favicon" width="16" height="16" viewBox="0 0 16 16" style="flex-shrink:0"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 5v4M6.5 7.5L8 9l1.5-1.5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '<span class="tab-title">Tankoban Torrent</span>' +
    '<button class="tab-close" title="Close tab (Ctrl+W)">' +
      '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' +
    '</button>';
  tabsContainer.insertBefore(tabEl, btnNewTab);

  var tab = {
    id: id,
    webview: null,
    type: 'torrent',
    element: tabEl,
    title: 'Tankoban Torrent',
    favicon: ''
  };
  tabs.push(tab);

  // Tab events
  tabEl.addEventListener('click', function (e) {
    if (!e.target.closest('.tab-close')) switchTab(id);
  });
  tabEl.addEventListener('mousedown', function (e) {
    if (e.button === 1) { e.preventDefault(); closeTab(id); }
  });
  tabEl.querySelector('.tab-close').addEventListener('click', function (e) {
    e.stopPropagation();
    closeTab(id);
  });

  switchTab(id);

  // Init the torrent UI if not already initialized
  if (typeof window.initTorrentTab === 'function') window.initTorrentTab();

  // If a source was passed, show the add dialog
  if (source && typeof window.torrentTabAddSource === 'function') {
    window.torrentTabAddSource(source);
  }

  return tab;
}

// Listen for magnet links detected by main process
window.aspect.onMagnetDetected(function (data) {
  var uri = (data && typeof data === 'object') ? (data.magnetUri || data.magnet || '') : String(data || '');
  if (uri) openTorrentTab(uri);
});

// Listen for .torrent files downloaded
window.aspect.onTorrentFileDetected(function (data) {
  var filePath = (data && typeof data === 'object') ? (data.filePath || data.path || '') : String(data || '');
  if (filePath) openTorrentTab(filePath);
});

// ── Bookmark bar ──

var bookmarkBarItems = document.getElementById('bookmark-bar-items');
var bookmarkBarOverflow = document.getElementById('bookmark-bar-overflow');
var bookmarkBarOverflowMenu = null; // created dynamically

function renderBookmarkBar() {
  window.aspect.bookmarksLoad().then(function (entries) {
    bookmarkBarItems.innerHTML = '';

    if (!entries || entries.length === 0) {
      var hint = document.createElement('span');
      hint.id = 'bookmark-bar-empty';
      hint.textContent = 'Bookmark pages with \u2606 or Ctrl+D';
      bookmarkBarItems.appendChild(hint);
      bookmarkBarOverflow.style.display = 'none';
      return;
    }

    entries.forEach(function (b) {
      var el = document.createElement('div');
      el.className = 'bookmark-bar-item';
      el.dataset.url = b.url;
      el.title = b.title + '\n' + b.url;

      var faviconHtml = b.favicon
        ? '<img src="' + escapeHtml(b.favicon) + '">'
        : '<svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" stroke="#5f6368" stroke-width="1" fill="none"/></svg>';

      el.innerHTML = faviconHtml + '<span>' + escapeHtml(b.title || b.url) + '</span>';

      // Left-click: navigate in active tab
      el.addEventListener('click', function (e) {
        if (e.button !== 0) return;
        var wv = getActiveWebview();
        if (wv) wv.loadURL(b.url);
        else createTab(b.url);
      });

      // Middle-click: open in new tab
      el.addEventListener('mousedown', function (e) {
        if (e.button === 1) {
          e.preventDefault();
          createTab(b.url);
        }
      });

      // Right-click: context menu
      el.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        showBookmarkBarCtxMenu(e.clientX, e.clientY, b);
      });

      bookmarkBarItems.appendChild(el);
    });

    // Check overflow after rendering
    checkBookmarkBarOverflow();
  });
}

function checkBookmarkBarOverflow() {
  var container = bookmarkBarItems;
  var items = container.querySelectorAll('.bookmark-bar-item');
  if (items.length === 0) { bookmarkBarOverflow.style.display = 'none'; return; }

  // Show all items first to measure
  items.forEach(function (el) { el.style.display = ''; });
  bookmarkBarOverflow.style.display = 'none';

  var containerRight = container.getBoundingClientRect().right;
  var hasOverflow = false;

  for (var i = 0; i < items.length; i++) {
    var itemRight = items[i].getBoundingClientRect().right;
    if (itemRight > containerRight) {
      hasOverflow = true;
      break;
    }
  }

  if (hasOverflow) {
    bookmarkBarOverflow.style.display = '';
  }
}

// Overflow button click — show dropdown with hidden items
bookmarkBarOverflow.addEventListener('click', function (e) {
  e.stopPropagation();
  if (bookmarkBarOverflowMenu) {
    bookmarkBarOverflowMenu.remove();
    bookmarkBarOverflowMenu = null;
    return;
  }
  showBookmarkBarOverflowMenu();
});

function showBookmarkBarOverflowMenu() {
  if (bookmarkBarOverflowMenu) { bookmarkBarOverflowMenu.remove(); bookmarkBarOverflowMenu = null; }

  var container = bookmarkBarItems;
  var items = container.querySelectorAll('.bookmark-bar-item');
  var containerRight = container.getBoundingClientRect().right;
  var overflowItems = [];

  for (var i = 0; i < items.length; i++) {
    if (items[i].getBoundingClientRect().right > containerRight) {
      overflowItems.push(items[i]);
    }
  }

  if (overflowItems.length === 0) return;

  var menu = document.createElement('div');
  menu.id = 'bookmark-bar-overflow-menu';
  document.body.appendChild(menu);
  bookmarkBarOverflowMenu = menu;

  overflowItems.forEach(function (origItem) {
    var url = origItem.dataset.url;
    var el = document.createElement('div');
    el.className = 'bookmark-bar-overflow-item';
    el.innerHTML = origItem.innerHTML; // reuse favicon + title
    el.title = origItem.title;

    el.addEventListener('click', function () {
      var wv = getActiveWebview();
      if (wv) wv.loadURL(url);
      else createTab(url);
      dismissBookmarkBarOverflowMenu();
    });

    el.addEventListener('mousedown', function (e) {
      if (e.button === 1) {
        e.preventDefault();
        createTab(url);
        dismissBookmarkBarOverflowMenu();
      }
    });

    menu.appendChild(el);
  });

  // Position below the overflow button
  var btnRect = bookmarkBarOverflow.getBoundingClientRect();
  menu.style.top = btnRect.bottom + 2 + 'px';
  menu.style.right = (window.innerWidth - btnRect.right) + 'px';
}

function dismissBookmarkBarOverflowMenu() {
  if (bookmarkBarOverflowMenu) {
    bookmarkBarOverflowMenu.remove();
    bookmarkBarOverflowMenu = null;
  }
}

// Dismiss overflow menu on outside click
document.addEventListener('mousedown', function (e) {
  if (bookmarkBarOverflowMenu && !bookmarkBarOverflowMenu.contains(e.target) &&
      e.target !== bookmarkBarOverflow && !bookmarkBarOverflow.contains(e.target)) {
    dismissBookmarkBarOverflowMenu();
  }
});

// Bookmark bar context menu
function showBookmarkBarCtxMenu(x, y, bookmark) {
  var items = [
    { label: 'Open in new tab', action: 'newTab' },
    { separator: true },
    { label: 'Remove bookmark', action: 'remove' }
  ];

  ctxParams = { isBookmarkBar: true };
  ctxMenu.innerHTML = '';

  items.forEach(function (item) {
    if (item.separator) {
      var sep = document.createElement('div');
      sep.className = 'ctx-separator';
      ctxMenu.appendChild(sep);
      return;
    }
    var el = document.createElement('div');
    el.className = 'ctx-item';
    el.innerHTML = '<span>' + item.label + '</span>';
    el.addEventListener('click', function () {
      switch (item.action) {
        case 'newTab':
          createTab(bookmark.url);
          break;
        case 'remove':
          window.aspect.bookmarksRemove(bookmark.url);
          renderBookmarkBar();
          updateBookmarkIcon();
          if (bookmarksOpen) loadBookmarksPanel();
          break;
      }
      hideContextMenu();
    });
    ctxMenu.appendChild(el);
  });

  ctxOverlay.style.display = '';
  ctxMenu.style.display = '';
  var mw = ctxMenu.offsetWidth;
  var mh = ctxMenu.offsetHeight;
  ctxMenu.style.left = Math.max(0, Math.min(x, window.innerWidth - mw - 4)) + 'px';
  ctxMenu.style.top = Math.max(0, Math.min(y, window.innerHeight - mh - 4)) + 'px';
}

// Re-check overflow on window resize
window.addEventListener('resize', function () {
  checkBookmarkBarOverflow();
  dismissBookmarkBarOverflowMenu();
});

// ── Embed host adapter API (Tankoban browserHost contract) ──
function aspectEnsureVisibleInHost() {
  if (!ASPECT_EMBED_MODE) return;
  var root = aspectGetRootElement();
  if (!root) return;
  try {
    root.classList.remove('hidden');
    root.style.display = '';
    root.setAttribute('data-aspect-open', '1');
  } catch (_e) {}
}

function aspectHasOpenUi() {
  var root = aspectGetRootElement();
  if (!root) return tabs.length > 0;
  try {
    if (root.classList && root.classList.contains('hidden')) return false;
    if (root.style && root.style.display === 'none') return false;
  } catch (_e) {}
  return tabs.length > 0;
}

function aspectOpenDefaultImpl() {
  aspectEnsureVisibleInHost();
  var existing = tabs.find(function (t) { return t.type !== 'torrent'; });
  if (existing) {
    switchTab(existing.id);
    return existing;
  }
  return createTab('https://yandex.com', true);
}

function aspectOpenUrlImpl(url) {
  aspectEnsureVisibleInHost();
  var target = (typeof url === 'string' && url.trim()) ? url.trim() : 'https://yandex.com';
  var tab = getActiveTab();
  if (tab && tab.webview && tab.type !== 'torrent') {
    try {
      tab.webview.loadURL(target);
      switchTab(tab.id);
      return tab;
    } catch (_e) {}
  }
  return createTab(target, true);
}

function aspectOpenTorrentWorkspaceImpl(source) {
  aspectEnsureVisibleInHost();
  return openTorrentTab(source);
}

function aspectOpenAddSourceDialogImpl() {
  aspectEnsureVisibleInHost();
  openTorrentTab();
  if (typeof window.torrentTabOpenAddDialog === 'function') {
    window.torrentTabOpenAddDialog();
    return { ok: true, opened: 'torrent-add-dialog' };
  }
  return { ok: true, opened: 'torrent-tab', note: 'add dialog export not available yet' };
}

function createTankoBrowserHostAdapter() {
  return {
    name: 'aspect-embed',
    mode: 'embedded',
    ensureReady: async function () {
      if (tabs.length === 0) aspectOpenDefaultImpl();
      return { ok: true, adapter: 'aspect-embed' };
    },
    openDefault: async function () {
      var tab = aspectOpenDefaultImpl();
      return { ok: true, activeTabId: tab && tab.id, kind: (tab && tab.type) || 'web' };
    },
    openTorrentWorkspace: async function () {
      var tab = aspectOpenTorrentWorkspaceImpl();
      return { ok: true, activeTabId: tab && tab.id, kind: 'torrent' };
    },
    openAddSourceDialog: async function () {
      return aspectOpenAddSourceDialogImpl();
    },
    openUrl: async function (url) {
      var tab = aspectOpenUrlImpl(url);
      return { ok: true, activeTabId: tab && tab.id, url: url || null };
    },
    canOpenAddSource: function () {
      return true;
    },
    isBrowserOpen: function () {
      return aspectHasOpenUi();
    }
  };
}

function registerTankoBrowserHostAdapter() {
  try {
    if (!window.Tanko || !window.Tanko.browserHost || typeof window.Tanko.browserHost.registerAdapter !== 'function') return false;
    window.Tanko.browserHost.registerAdapter(createTankoBrowserHostAdapter());
    ASPECT_HOST_ADAPTER_REGISTERED = true;
    aspectEmit('aspect-browser:adapter-registered', { adapter: 'aspect-embed' });
    return true;
  } catch (_e) {
    return false;
  }
}

window.AspectBrowserEmbed = {
  version: '1.0.0-embed-ready',
  isEmbeddedMode: function () { return ASPECT_EMBED_MODE; },
  ensureReady: async function () {
    if (tabs.length === 0) aspectOpenDefaultImpl();
    return { ok: true, tabs: tabs.length, adapterRegistered: ASPECT_HOST_ADAPTER_REGISTERED };
  },
  openDefault: async function () { return createTankoBrowserHostAdapter().openDefault(); },
  openTorrentWorkspace: async function (source) {
    var tab = aspectOpenTorrentWorkspaceImpl(source);
    return { ok: true, activeTabId: tab && tab.id, kind: 'torrent' };
  },
  openAddSourceDialog: async function () { return aspectOpenAddSourceDialogImpl(); },
  openUrl: async function (url) { return createTankoBrowserHostAdapter().openUrl(url); },
  isBrowserOpen: function () { return aspectHasOpenUi(); },
  canOpenAddSource: function () { return true; },
  setVisible: function (visible) {
    var root = aspectGetRootElement();
    if (!root) return false;
    root.style.display = visible ? '' : 'none';
    root.setAttribute('data-aspect-open', visible ? '1' : '0');
    return true;
  },
  createTankoBrowserHostAdapter: createTankoBrowserHostAdapter,
  registerTankoBrowserHostAdapter: registerTankoBrowserHostAdapter
};

// ── Boot ──
createTab('https://yandex.com');
renderBookmarkBar();
aspectEmit('aspect-browser:ready', { tabs: tabs.length, embedded: ASPECT_EMBED_MODE });
if (ASPECT_EMBED_MODE) { registerTankoBrowserHostAdapter(); }
