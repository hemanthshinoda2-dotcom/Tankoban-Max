(function registerNavOmniboxModule() {
  'use strict';
  window.__tankoWebModules = window.__tankoWebModules || {};
  window.__tankoWebModules.navOmnibox = function initNavOmniboxModule(bridge) {
    var state = bridge.state;
    var el = bridge.el;
    var api = bridge.api;
    var webTabs = bridge.webTabs;
    function dep(name) { return (bridge.deps || {})[name]; }
    var escapeHtml = function () { var fn = dep('escapeHtml'); return fn ? fn.apply(null, arguments) : ''; };
    var shortPath = function () { var fn = dep('shortPath'); return fn ? fn.apply(null, arguments) : ''; };
    var getSourceColor = function () { var fn = dep('getSourceColor'); return fn ? fn.apply(null, arguments) : '#555'; };
    var getSourceById = function () { var fn = dep('getSourceById'); return fn ? fn.apply(null, arguments) : null; };
    var siteNameFromUrl = function () { var fn = dep('siteNameFromUrl'); return fn ? fn.apply(null, arguments) : ''; };
    var getFaviconUrl = function () { var fn = dep('getFaviconUrl'); return fn ? fn.apply(null, arguments) : ''; };
    var showToast = function () { var fn = dep('showToast'); return fn && fn.apply(null, arguments); };
    var renderTabs = function () { var fn = dep('renderTabs'); return fn && fn.apply(null, arguments); };
    var syncLoadBar = function () { var fn = dep('syncLoadBar'); return fn && fn.apply(null, arguments); };
    var syncReloadStopButton = function () { var fn = dep('syncReloadStopButton'); return fn && fn.apply(null, arguments); };
    var updateNavButtons = function () { var fn = dep('updateNavButtons'); return fn && fn.apply(null, arguments); };
    var updateUrlDisplay = function () { var fn = dep('updateUrlDisplay'); return fn && fn.apply(null, arguments); };
    var scheduleSessionSave = function () { var fn = dep('scheduleSessionSave'); return fn && fn.apply(null, arguments); };
    var openBrowserForTab = function () { var fn = dep('openBrowserForTab'); return fn && fn.apply(null, arguments); };
    var createTab = function () { var fn = dep('createTab'); return fn && fn.apply(null, arguments); };
    var getActiveTab = function () { var fn = dep('getActiveTab'); return fn ? fn.apply(null, arguments) : null; };
    var ensureTabRuntime = function () { var fn = dep('ensureTabRuntime'); return fn ? fn.apply(null, arguments) : null; };
    var closeOmniSuggestions = function () { var fn = dep('closeOmniSuggestions'); return fn && fn.apply(null, arguments); };
    var setOmniIconForUrl = function () { var fn = dep('setOmniIconForUrl'); return fn && fn.apply(null, arguments); };
    var isWebModeActive = function () { var fn = dep('isWebModeActive'); return fn ? fn.apply(null, arguments) : false; };
    var renderHubAll = function () { var fn = dep('renderHubAll'); return fn && fn.apply(null, arguments); };
    var renderDownloadsPanel = function () { var fn = dep('renderDownloadsPanel'); return fn && fn.apply(null, arguments); };
    var renderHomeDownloads = function () { var fn = dep('renderHomeDownloads'); return fn && fn.apply(null, arguments); };

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

    return {
      getActiveSearchEngine: getActiveSearchEngine,
      getSearchQueryUrl: getSearchQueryUrl,
      syncSearchEngineSelect: syncSearchEngineSelect,
      syncOmniPlaceholder: syncOmniPlaceholder,
      isAllowedOmniScheme: isAllowedOmniScheme,
      resolveOmniInputToUrl: resolveOmniInputToUrl,
      tryResolveCtrlEnterUrl: tryResolveCtrlEnterUrl,
      closeOmniSuggestions: closeOmniSuggestions,
      clearOmniGhost: clearOmniGhost,
      stripUrlPrefix: stripUrlPrefix,
      updateOmniGhostText: updateOmniGhostText,
      acceptOmniGhost: acceptOmniGhost,
      saveOmniState: saveOmniState,
      restoreOmniState: restoreOmniState,
      applyOmniSuggestion: applyOmniSuggestion,
      buildOmniSuggestions: buildOmniSuggestions,
      renderOmniSuggestions: renderOmniSuggestions,
      refreshOmniSuggestionsFromInput: refreshOmniSuggestionsFromInput,
      openUrlFromOmni: openUrlFromOmni,
      setOmniIconForUrl: setOmniIconForUrl
    };
  };
})();
