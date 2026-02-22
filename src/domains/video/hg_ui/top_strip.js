(function () {
  'use strict';

  function createTopStripController(opts) {
    var o = opts || {};

    function getBadgeEl() {
      if (typeof o.badgeElProvider === 'function') return o.badgeElProvider();
      return null;
    }

    function normalizeEngine(engine) {
      var e = String(engine || 'none').toLowerCase();
      if (e !== 'embedded' && e !== 'qt') return 'none';
      return e;
    }

    function normalizeReason(reason) {
      var r = String(reason || '').trim();
      return r || 'unknown';
    }

    function normalizeOpenReason(openReason) {
      var r = String(openReason || '').trim();
      return r || 'unknown_open_reason';
    }

    function shouldShowBadge(engine, reason) {
      if (engine === 'none') return false;
      if (engine === 'embedded' && reason === 'default_embedded') return false;
      return true;
    }

    function setRoute(engine, reason, openReason) {
      var badge = getBadgeEl();
      if (!badge) return;
      var e = normalizeEngine(engine);
      var r = normalizeReason(reason);
      var or = normalizeOpenReason(openReason);

      badge.dataset.engine = e;
      badge.dataset.reason = r;
      badge.dataset.openReason = or;
      badge.classList.toggle('hidden', !shouldShowBadge(e, r));

      if (e === 'embedded') badge.textContent = 'Embedded (HG)';
      else if (e === 'qt') badge.textContent = 'Qt';
      else badge.textContent = 'No Engine';

      if (e === 'embedded') {
        badge.title = (r === 'unknown' || r === 'default_embedded')
          ? 'Embedded Holy Grail engine active.'
          : ('Embedded Holy Grail engine active (' + r + '; ' + or + ').');
      } else if (e === 'qt') {
        badge.title = 'Qt engine active (' + r + '; ' + or + ').';
      } else {
        badge.title = 'No active engine.';
      }
    }

    function setEngine(engine, reason) {
      setRoute(engine, reason, null);
    }

    return {
      setEngine: setEngine,
      setRoute: setRoute,
    };
  }

  window.TankoHgUi = window.TankoHgUi || {};
  window.TankoHgUi.createTopStripController = createTopStripController;
})();
