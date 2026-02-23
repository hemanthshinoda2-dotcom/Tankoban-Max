(function registerTabsStateModule() {
  'use strict';
  window.__tankoWebModules = window.__tankoWebModules || {};
  window.__tankoWebModules.tabsState = function initTabsStateModule(bridge) {
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

    return {
      getActiveTab: getActiveTab,
      getTabByMainId: getTabByMainId,
      createTabRuntime: createTabRuntime,
      ensureTabRuntime: ensureTabRuntime,
      inferSecurityStateFromUrl: inferSecurityStateFromUrl,
      classifyLoadFailure: classifyLoadFailure,
      pushRuntimeCommittedUrl: pushRuntimeCommittedUrl,
      normalizeSourceInput: normalizeSourceInput,
      snapshotTabForSession: snapshotTabForSession,
      buildSessionPayload: buildSessionPayload,
      scheduleSessionSave: scheduleSessionSave,
      pushClosedTab: pushClosedTab,
      reopenClosedTab: reopenClosedTab,
      loadSessionAndRestore: loadSessionAndRestore
    };
  };
})();
