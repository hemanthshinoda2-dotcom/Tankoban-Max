(function () {
  'use strict';

  function createCenterFlashController(opts) {
    var o = opts || {};
    var holdTimer = null;

    function getEl() {
      if (typeof o.targetElProvider === 'function') return o.targetElProvider();
      return null;
    }

    function flash(text, ms) {
      var el = getEl();
      if (!el) return;
      if (holdTimer) clearTimeout(holdTimer);
      el.textContent = String(text || '');
      el.classList.remove('hidden');
      holdTimer = setTimeout(function () {
        try { el.classList.add('hidden'); } catch {}
      }, Number(ms) > 0 ? Number(ms) : 460);
    }

    function hide() {
      var el = getEl();
      if (!el) return;
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
      el.classList.add('hidden');
    }

    return {
      flash: flash,
      hide: hide,
      destroy: hide,
    };
  }

  window.TankoHgUi = window.TankoHgUi || {};
  window.TankoHgUi.createCenterFlashController = createCenterFlashController;
})();
