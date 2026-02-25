(function registerStandaloneModule() {
  'use strict';

  window.__tankoWebModules = window.__tankoWebModules || {};

  window.__tankoWebModules.standalone = function initStandaloneModule(bridge) {
    var state = bridge.state;

    function dep(name) { return (bridge.deps || {})[name]; }
    var activateTab = function () { var fn = dep('activateTab'); return fn && fn.apply(null, arguments); };
    var createTab = function () { var fn = dep('createTab'); return fn && fn.apply(null, arguments); };
    var openBrowserForTab = function () { var fn = dep('openBrowserForTab'); return fn && fn.apply(null, arguments); };
    var showHome = function () { var fn = dep('showHome'); return fn && fn.apply(null, arguments); };
    var openTorrentTab = function () { var fn = dep('openTorrentTab'); return fn && fn.apply(null, arguments); };

    function openDefaultBrowserEntry() {
      if (state.tabs.length) {
        var targetId = state.activeTabId != null ? state.activeTabId : state.tabs[0].id;
        openBrowserForTab(targetId);
        return;
      }
      if (createTab) {
        createTab(null, '', { switchTo: false });
      }
      showHome();
    }

    function openTorrentWorkspace() {
      var torrentTabId = null;
      for (var i = 0; i < state.tabs.length; i++) {
        var tab = state.tabs[i];
        if (tab && tab.type === 'torrent') {
          torrentTabId = tab.id;
          break;
        }
      }

      if (torrentTabId != null) {
        activateTab(torrentTabId);
        openBrowserForTab(torrentTabId);
        return;
      }

      if (openTorrentTab) {
        var t = openTorrentTab();
        if (t && t.id != null) openBrowserForTab(t.id);
        return;
      }

      openDefaultBrowserEntry();
    }

    return {
      openDefaultBrowserEntry: openDefaultBrowserEntry,
      openTorrentWorkspace: openTorrentWorkspace
    };
  };
})();
