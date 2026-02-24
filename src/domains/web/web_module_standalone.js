(function registerStandaloneModule() {
  'use strict';

  window.__tankoWebModules = window.__tankoWebModules || {};
  window.__tankoWebModules.standalone = function initStandaloneModule(bridge) {
    var state = bridge.state;
    var el = bridge.el;

    function dep(name) { return (bridge.deps || {})[name]; }
    var activateTab = function () { var fn = dep('activateTab'); return fn && fn.apply(null, arguments); };
    var openNewTab = function () { var fn = dep('openNewTab'); return fn && fn.apply(null, arguments); };
    var openHubPanelSection = function () { var fn = dep('openHubPanelSection'); return fn && fn.apply(null, arguments); };
    var openBrowserForTab = function () { var fn = dep('openBrowserForTab'); return fn && fn.apply(null, arguments); };

    function openDefaultBrowserEntry() {
      if (state.tabs.length) {
        var targetId = state.activeTabId != null ? state.activeTabId : state.tabs[0].id;
        openBrowserForTab(targetId);
      } else {
        openNewTab();
      }
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
      if (torrentTabId != null) activateTab(torrentTabId);
      else openDefaultBrowserEntry();

      openHubPanelSection('browser');
      try {
        if (el.hubMagnetInput && typeof el.hubMagnetInput.focus === 'function') {
          el.hubMagnetInput.focus();
          if (typeof el.hubMagnetInput.select === 'function') el.hubMagnetInput.select();
        }
      } catch (e) {}
    }

    return {
      openDefaultBrowserEntry: openDefaultBrowserEntry,
      openTorrentWorkspace: openTorrentWorkspace,
    };
  };
})();

