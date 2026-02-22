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

    function setEngine(engine, reason) {
      var badge = getBadgeEl();
      if (!badge) return;
      var e = normalizeEngine(engine);
      var r = normalizeReason(reason);

      badge.dataset.engine = e;
      badge.dataset.reason = r;
      if (e === 'embedded') badge.textContent = 'Embedded (HG)';
      else if (e === 'qt') badge.textContent = 'Qt';
      else badge.textContent = 'No Engine';

      if (e === 'embedded') {
        badge.title = (r === 'unknown' || r === 'default_embedded')
          ? 'Embedded Holy Grail engine active.'
          : ('Embedded Holy Grail engine active (' + r + ').');
      } else if (e === 'qt') {
        badge.title = 'Qt engine active (' + r + ').';
      } else {
        badge.title = 'No active engine.';
      }
    }

    return {
      setEngine: setEngine,
    };
  }

  window.TankoHgUi = window.TankoHgUi || {};
  window.TankoHgUi.createTopStripController = createTopStripController;
})();
