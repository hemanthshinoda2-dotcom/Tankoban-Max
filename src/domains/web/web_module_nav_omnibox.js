(function registerNavOmniboxModule() {
  'use strict';
  window.__tankoWebModules = window.__tankoWebModules || {};
  window.__tankoWebModules.navOmnibox = function initNavOmniboxModule(bridge) {
    var state = bridge.state;
    var el = bridge.el;
    var api = bridge.api;

    function dep(name) { return (bridge.deps || {})[name]; }
    var escapeHtml = function () { var fn = dep('escapeHtml'); return fn ? fn.apply(null, arguments) : ''; };
    var getActiveTab = function () { var fn = dep('getActiveTab'); return fn ? fn.apply(null, arguments) : null; };
    var getActiveWebview = function () { var fn = dep('getActiveWebview'); return fn ? fn.apply(null, arguments) : null; };
    var createTab = function () { var fn = dep('createTab'); return fn && fn.apply(null, arguments); };
    var ensureWebview = function () { var fn = dep('ensureWebview'); return fn ? fn.apply(null, arguments) : null; };
    var openBrowserForTab = function () { var fn = dep('openBrowserForTab'); return fn && fn.apply(null, arguments); };
    var siteNameFromUrl = function () { var fn = dep('siteNameFromUrl'); return fn ? fn.apply(null, arguments) : ''; };
    var updateNavButtons = function () { var fn = dep('updateNavButtons'); return fn && fn.apply(null, arguments); };

    var SEARCH_ENGINES = {
      yandex:     { label: 'Yandex',      url: 'https://yandex.com/search/?text=' },
      google:     { label: 'Google',      url: 'https://www.google.com/search?q=' },
      bing:       { label: 'Bing',        url: 'https://www.bing.com/search?q=' },
      duckduckgo: { label: 'DuckDuckGo',  url: 'https://duckduckgo.com/?q=' },
      brave:      { label: 'Brave',       url: 'https://search.brave.com/search?q=' }
    };

    var omniDebounce = null;
    var _omniGhostCompletion = '';

    // ── Search engine ──

    function getActiveSearchEngine() {
      var key = String(state.browserSettings && state.browserSettings.defaultSearchEngine || 'yandex')
        .trim().toLowerCase();
      if (!SEARCH_ENGINES[key]) key = 'yandex';
      return key;
    }

    function getSearchUrl(query) {
      var engine = SEARCH_ENGINES[getActiveSearchEngine()] || SEARCH_ENGINES.yandex;
      return engine.url + encodeURIComponent(String(query || ''));
    }

    function syncSearchEngineSelect() {
      if (!el.searchEngineSelect) return;
      var key = getActiveSearchEngine();
      if (String(el.searchEngineSelect.value || '') !== key) {
        el.searchEngineSelect.value = key;
      }
    }

    function syncOmniPlaceholder() {
      if (!el.urlBar) return;
      var engine = SEARCH_ENGINES[getActiveSearchEngine()];
      var label = engine ? engine.label : 'Yandex';
      try { el.urlBar.setAttribute('placeholder', 'Search ' + label + ' or type a URL'); } catch (e) {}
    }

    // ── URL resolution ──

    function isAllowedScheme(raw) {
      var lower = String(raw || '').trim().toLowerCase();
      return lower.indexOf('http:') === 0 || lower.indexOf('https:') === 0 || lower === 'about:blank';
    }

    function resolveInput(raw) {
      var input = String(raw || '').trim();
      if (!input) return '';

      // Block dangerous schemes (javascript:, data:, file:, etc.)
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input)) {
        if (isAllowedScheme(input)) return input;
        return getSearchUrl(input);
      }

      // Looks like a domain (no spaces, has a dot)
      if (input.indexOf(' ') === -1 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+/i.test(input)) {
        return 'https://' + input;
      }

      return getSearchUrl(input);
    }

    function tryCtrlEnterUrl(input) {
      var raw = String(input || '').trim();
      if (!raw || raw.indexOf(' ') !== -1) return '';
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return '';
      if (raw.indexOf('.') !== -1 || raw.indexOf('/') !== -1) return '';
      return 'https://www.' + raw + '.com';
    }

    function ensureBrowserSurface(tabId) {
      if (tabId == null) return;
      // If the user navigates from Tankoban home/new-tab UI, force the content
      // area back to the active webview so pages are actually visible.
      if (!state.showBrowserHome && state.browserOpen) return;
      try { openBrowserForTab(tabId); } catch (e) {}
    }

    // ── Navigate ──

    function navigateUrl(raw, opts) {
      var url = resolveInput(raw);
      if (!url) return;
      var o = opts || {};

      // Save search query for suggestions
      if (url.indexOf(SEARCH_ENGINES[getActiveSearchEngine()].url) === 0) {
        api.webSearch.add(String(raw || '').trim());
      }

      if (o.newTab) {
        var newTab = createTab(null, url, { switchTo: true });
        if (newTab && newTab.id != null) ensureBrowserSurface(newTab.id);
        return;
      }

      var tab = getActiveTab();
      if (!tab) {
        var created = createTab(null, url, { switchTo: true });
        if (created && created.id != null) ensureBrowserSurface(created.id);
        return;
      }

      // Ensure webview exists (tab might be showing home page)
      var wv = tab.webview || ensureWebview(tab, url);
      if (wv) {
        wv.loadURL(url);
        ensureBrowserSurface(tab.id);
      } else {
        var fallbackTab = createTab(null, url, { switchTo: true });
        if (fallbackTab && fallbackTab.id != null) ensureBrowserSurface(fallbackTab.id);
      }
    }

    // ── Omnibox dropdown (IPC-based suggestions) ──

    function showOmniDropdown(results) {
      if (!el.omniDropdown || !results || results.length === 0) {
        hideOmniDropdown();
        return;
      }
      state.omniResults = results;
      state.omniSelectedIdx = -1;
      renderOmniDropdown();
    }

    function renderOmniDropdown() {
      if (!el.omniDropdown) return;
      el.omniDropdown.innerHTML = '';

      var results = state.omniResults || [];
      for (var i = 0; i < results.length; i++) {
        (function (item, idx) {
          var row = document.createElement('div');
          row.className = 'omni-item' + (idx === state.omniSelectedIdx ? ' selected' : '');
          row.dataset.idx = idx;

          var icon;
          if (item.type === 'search') {
            icon = '<svg class="omni-icon" width="16" height="16" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M9.5 9.5L13 13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
          } else if (item.type === 'bookmark') {
            icon = '<svg class="omni-icon" width="16" height="16" viewBox="0 0 16 16"><path d="M4 2.5h8v11L8 10.5 4 13.5z" stroke="#f9ab00" stroke-width="1.3" fill="#f9ab00" stroke-linejoin="round"/></svg>';
          } else if (item.favicon) {
            icon = '<img class="omni-icon" width="16" height="16" src="' + escapeHtml(item.favicon) + '">';
          } else {
            icon = '<svg class="omni-icon" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M8 4.5V8l2.5 2" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          }

          var text = escapeHtml(item.text || '');
          var urlHtml = item.url ? '<span class="omni-url">' + escapeHtml(item.url) + '</span>' : '';
          row.innerHTML = icon + '<span class="omni-text">' + text + '</span>' + urlHtml;

          row.addEventListener('mousedown', function (e) {
            e.preventDefault();
            if (item.url) {
              navigateUrl(item.url);
            } else {
              navigateUrl(item.text);
            }
            hideOmniDropdown();
            if (el.urlBar) el.urlBar.blur();
          });

          row.addEventListener('mouseenter', function () {
            state.omniSelectedIdx = idx;
            updateOmniSelection();
          });

          el.omniDropdown.appendChild(row);
        })(results[i], i);
      }
      el.omniDropdown.style.display = '';
    }

    function hideOmniDropdown() {
      if (el.omniDropdown) {
        el.omniDropdown.style.display = 'none';
        el.omniDropdown.innerHTML = '';
      }
      state.omniResults = [];
      state.omniSelectedIdx = -1;
      clearOmniGhost();
    }

    function updateOmniSelection() {
      if (!el.omniDropdown) return;
      var items = el.omniDropdown.querySelectorAll('.omni-item');
      for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle('selected', i === state.omniSelectedIdx);
      }
      if (state.omniSelectedIdx >= 0 && state.omniResults && state.omniSelectedIdx < state.omniResults.length) {
        var item = state.omniResults[state.omniSelectedIdx];
        if (el.urlBar) el.urlBar.value = item.url || item.text;
      }
    }

    // ── Ghost text (inline autocomplete) ──

    function clearOmniGhost() {
      _omniGhostCompletion = '';
      if (el.omniGhost) el.omniGhost.innerHTML = '';
    }

    function updateOmniGhostText() {
      if (!el.omniGhost || !el.urlBar) { clearOmniGhost(); return; }

      var typed = String(el.urlBar.value || '');
      if (!typed) { clearOmniGhost(); return; }

      var typedLower = typed.toLowerCase();
      var results = state.omniResults || [];

      for (var i = 0; i < results.length; i++) {
        if (!results[i] || !results[i].url) continue;
        var candidate = String(results[i].url);
        if (candidate.toLowerCase().indexOf(typedLower) === 0 && candidate.length > typed.length) {
          var completion = candidate.substring(typed.length);
          _omniGhostCompletion = completion;
          el.omniGhost.innerHTML =
            '<span class="ghost-spacer">' + escapeHtml(typed) + '</span>' +
            '<span class="ghost-completion">' + escapeHtml(completion) + '</span>';
          return;
        }
      }
      clearOmniGhost();
    }

    function acceptOmniGhost() {
      if (!_omniGhostCompletion || !el.urlBar) return false;
      el.urlBar.value = el.urlBar.value + _omniGhostCompletion;
      clearOmniGhost();
      return true;
    }

    // ── Omnibox icon ──

    function setOmniIconForUrl(url) {
      if (!el.omniIcon) return;
      var u = String(url || '').trim();
      var lockSvg = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5.5 7V5.2c0-1.4 1.1-2.6 2.5-2.6s2.5 1.2 2.5 2.6V7h.9c.9 0 1.6.7 1.6 1.6v4.1c0 .9-.7 1.6-1.6 1.6H4c-.9 0-1.6-.7-1.6-1.6V8.6C2.4 7.7 3.1 7 4 7h1.5zm1.2 0h2.6V5.2c0-.8-.6-1.4-1.3-1.4s-1.3.6-1.3 1.4V7z"/></svg>';
      var globeSvg = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm4.8 6H10.9a10.8 10.8 0 0 0-.8-3.1A5.3 5.3 0 0 1 12.8 7.5zM8 2.7c.8 1 1.5 2.8 1.7 4.8H6.3C6.5 5.5 7.2 3.7 8 2.7zM3.2 7.5A5.3 5.3 0 0 1 5.9 4.4a10.8 10.8 0 0 0-.8 3.1H3.2zm0 1.1h1.9c.1 1.1.4 2.2.8 3.1A5.3 5.3 0 0 1 3.2 8.6zM8 13.3c-.8-1-1.5-2.8-1.7-4.8h3.4c-.2 2-1 3.8-1.7 4.8zm2.1-1.6c.4-.9.7-2 .8-3.1h1.9a5.3 5.3 0 0 1-2.7 3.1z"/></svg>';
      var searchSvg = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.9 1.8a5.1 5.1 0 1 0 3.1 9.2l2.8 2.8a.7.7 0 0 0 1-1l-2.8-2.8a5.1 5.1 0 0 0-4.1-8.2zm0 1.4a3.7 3.7 0 1 1 0 7.4 3.7 3.7 0 0 1 0-7.4z"/></svg>';

      if (!u) el.omniIcon.innerHTML = searchSvg;
      else if (u.indexOf('https://') === 0) el.omniIcon.innerHTML = lockSvg;
      else el.omniIcon.innerHTML = globeSvg;
    }

    // ── URL bar event wiring ──

    function initUrlBarEvents() {
      if (!el.urlBar) return;

      el.urlBar.addEventListener('keydown', function (e) {
        // Arrow navigation in dropdown
        if (el.omniDropdown && el.omniDropdown.style.display !== 'none' &&
            state.omniResults && state.omniResults.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            state.omniSelectedIdx = Math.min(state.omniSelectedIdx + 1, state.omniResults.length - 1);
            updateOmniSelection();
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            state.omniSelectedIdx = Math.max(state.omniSelectedIdx - 1, -1);
            updateOmniSelection();
            return;
          }
        }

        // Tab — accept ghost text
        if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
          if (acceptOmniGhost()) {
            e.preventDefault();
            return;
          }
        }

        // Enter — navigate
        if (e.key === 'Enter') {
          e.preventDefault();
          var newTab = e.altKey;
          if (state.omniSelectedIdx >= 0 && state.omniResults &&
              state.omniSelectedIdx < state.omniResults.length) {
            var item = state.omniResults[state.omniSelectedIdx];
            navigateUrl(item.url || item.text, { newTab: newTab });
          } else if (e.ctrlKey) {
            var ctrlUrl = tryCtrlEnterUrl(el.urlBar.value);
            if (ctrlUrl) navigateUrl(ctrlUrl, { newTab: newTab });
            else navigateUrl(el.urlBar.value.trim(), { newTab: newTab });
          } else {
            navigateUrl(el.urlBar.value.trim(), { newTab: newTab });
          }
          hideOmniDropdown();
          el.urlBar.blur();
        }

        // Escape — dismiss dropdown or reset URL
        if (e.key === 'Escape') {
          if (el.omniDropdown && el.omniDropdown.style.display !== 'none') {
            hideOmniDropdown();
          } else {
            var wv = getActiveWebview();
            el.urlBar.value = (wv && wv.getURL()) || '';
            el.urlBar.blur();
          }
        }
      });

      el.urlBar.addEventListener('input', function () {
        var val = el.urlBar.value.trim();
        if (!val) { hideOmniDropdown(); return; }
        clearTimeout(omniDebounce);
        omniDebounce = setTimeout(function () {
          api.webSearch.suggest(val).then(function (results) {
            if (!results || results.length === 0 || el.urlBar !== document.activeElement) {
              hideOmniDropdown();
              return;
            }
            showOmniDropdown(results);
            updateOmniGhostText();
          }).catch(function () {
            hideOmniDropdown();
          });
        }, 100);
      });

      el.urlBar.addEventListener('focus', function () {
        setTimeout(function () { if (el.urlBar) el.urlBar.select(); }, 0);
        var val = el.urlBar.value.trim();
        if (val) {
          api.webSearch.suggest(val).then(function (results) {
            if (!results || results.length === 0 || el.urlBar !== document.activeElement) return;
            showOmniDropdown(results);
            updateOmniGhostText();
          }).catch(function () {});
        }
      });

      el.urlBar.addEventListener('blur', function () {
        setTimeout(function () { hideOmniDropdown(); }, 150);
      });

      // Nav buttons
      if (el.btnBack) {
        el.btnBack.addEventListener('click', function () {
          var wv = getActiveWebview();
          if (wv && wv.canGoBack()) wv.goBack();
        });
      }
      if (el.btnForward) {
        el.btnForward.addEventListener('click', function () {
          var wv = getActiveWebview();
          if (wv && wv.canGoForward()) wv.goForward();
        });
      }
      if (el.btnReload) {
        el.btnReload.addEventListener('click', function () {
          var wv = getActiveWebview();
          if (!wv) return;
          try {
            if (wv.isLoading()) wv.stop();
            else wv.reload();
          } catch (e) {}
        });
      }
      if (el.btnNewTab) {
        el.btnNewTab.addEventListener('click', function () {
          createTab(null, '', { switchTo: true });
        });
      }
    }

    return {
      SEARCH_ENGINES: SEARCH_ENGINES,
      getActiveSearchEngine: getActiveSearchEngine,
      getSearchUrl: getSearchUrl,
      syncSearchEngineSelect: syncSearchEngineSelect,
      syncOmniPlaceholder: syncOmniPlaceholder,
      isAllowedScheme: isAllowedScheme,
      resolveInput: resolveInput,
      tryCtrlEnterUrl: tryCtrlEnterUrl,
      navigateUrl: navigateUrl,
      showOmniDropdown: showOmniDropdown,
      hideOmniDropdown: hideOmniDropdown,
      clearOmniGhost: clearOmniGhost,
      updateOmniGhostText: updateOmniGhostText,
      acceptOmniGhost: acceptOmniGhost,
      setOmniIconForUrl: setOmniIconForUrl,
      initUrlBarEvents: initUrlBarEvents
    };
  };
})();
