(function registerFindModule() {
  'use strict';

  window.__tankoWebModules = window.__tankoWebModules || {};

  window.__tankoWebModules.find = function initFindModule(bridge) {
    var state = bridge.state;
    var el = bridge.el;

    function dep(name) { return (bridge.deps || {})[name]; }
    var getActiveWebview = function () {
      var fn = dep('getActiveWebview');
      return fn ? fn.apply(null, arguments) : null;
    };

    var findResultBound = false;

    function openFind() {
      state.findBarOpen = true;
      if (el.findBar) el.findBar.style.display = '';
      if (el.findInput) {
        el.findInput.focus();
        el.findInput.select();
      }
    }

    function closeFind() {
      state.findBarOpen = false;
      if (el.findBar) el.findBar.style.display = 'none';
      if (el.findInput) el.findInput.value = '';
      if (el.findMatches) el.findMatches.textContent = '';

      var wv = getActiveWebview();
      if (wv && typeof wv.stopFindInPage === 'function') {
        try { wv.stopFindInPage('clearSelection'); } catch (e) {}
      }
    }

    function doFind(forward) {
      var text = el.findInput ? el.findInput.value : '';
      var wv = getActiveWebview();
      if (!wv || !text || typeof wv.findInPage !== 'function') return;
      try {
        wv.findInPage(text, { forward: !!forward, findNext: true });
      } catch (e) {}
    }

    function bindFindEvents() {
      if (findResultBound) return;
      findResultBound = true;
      bridge.on('find:result', function (r) {
        if (!el.findMatches || !r || r.matches === undefined) return;
        el.findMatches.textContent = r.matches > 0
          ? (r.activeMatchOrdinal + ' of ' + r.matches)
          : 'No matches';
      });
    }

    function initFindEvents() {
      bindFindEvents();

      if (el.findInput) {
        el.findInput.addEventListener('input', function () {
          var text = el.findInput.value;
          var wv = getActiveWebview();
          if (!wv) return;

          if (text && typeof wv.findInPage === 'function') {
            try { wv.findInPage(text); } catch (e) {}
            return;
          }

          if (el.findMatches) el.findMatches.textContent = '';
          if (typeof wv.stopFindInPage === 'function') {
            try { wv.stopFindInPage('clearSelection'); } catch (e2) {}
          }
        });

        el.findInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            doFind(!e.shiftKey);
            return;
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
