(function registerFindModule() {
  'use strict';
  window.__tankoWebModules = window.__tankoWebModules || {};
  window.__tankoWebModules.find = function initFindModule(bridge) {
    var state = bridge.state;
    var el = bridge.el;

    function dep(name) { return (bridge.deps || {})[name]; }
    var getActiveWebview = function () { var fn = dep('getActiveWebview'); return fn ? fn.apply(null, arguments) : null; };

    // ── Find in page ──

    function openFind() {
      state.findOpen = true;
      if (el.findBar) el.findBar.style.display = '';
      if (el.findInput) {
        el.findInput.focus();
        el.findInput.select();
      }
    }

    function closeFind() {
      state.findOpen = false;
      if (el.findBar) el.findBar.style.display = 'none';
      if (el.findInput) el.findInput.value = '';
      if (el.findMatches) el.findMatches.textContent = '';
      var wv = getActiveWebview();
      if (wv) {
        try { wv.stopFindInPage('clearSelection'); } catch (e) {}
      }
    }

    function doFind(forward) {
      var text = el.findInput ? el.findInput.value : '';
      var wv = getActiveWebview();
      if (!wv || !text) return;
      try {
        wv.findInPage(text, { forward: forward, findNext: true });
      } catch (e) {}
    }

    // ── Bind find-result listener on a webview (called per-tab) ──

    function bindFindEvents(tab) {
      if (!tab || !tab.webview) return;
      tab.webview.addEventListener('found-in-page', function (e) {
        if (tab.id !== state.activeTabId) return;
        var r = e.result;
        if (r.matches !== undefined && el.findMatches) {
          el.findMatches.textContent = r.matches > 0
            ? r.activeMatchOrdinal + ' of ' + r.matches
            : 'No matches';
        }
      });
    }

    // ── Event wiring ──

    function initFindEvents() {
      if (el.findInput) {
        el.findInput.addEventListener('input', function () {
          var text = el.findInput.value;
          var wv = getActiveWebview();
          if (!wv) return;
          if (text) {
            try { wv.findInPage(text); } catch (e) {}
          } else {
            if (el.findMatches) el.findMatches.textContent = '';
            try { wv.stopFindInPage('clearSelection'); } catch (e) {}
          }
        });

        el.findInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            doFind(!e.shiftKey);
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            closeFind();
          }
        });
      }

      if (el.findPrev) {
        el.findPrev.addEventListener('click', function () { doFind(false); });
      }
      if (el.findNext) {
        el.findNext.addEventListener('click', function () { doFind(true); });
      }
      if (el.findClose) {
        el.findClose.addEventListener('click', closeFind);
      }
    }

    return {
      openFind: openFind,
      closeFind: closeFind,
      doFind: doFind,
      bindFindEvents: bindFindEvents,
      initFindEvents: initFindEvents
    };
  };
})();
