(function () {
  'use strict';

  function createToastController(opts) {
    var o = opts || {};
    var timer = null;

    function getEl() {
      if (typeof o.toastElProvider === 'function') {
        var e = o.toastElProvider();
        if (e) return e;
      }
      return null;
    }

    function show(text, ms) {
      var el = getEl();
      if (!el) {
        if (typeof o.fallbackShow === 'function') o.fallbackShow(text, ms);
        return;
      }
      var timeoutMs = Number(ms);
      if (!isFinite(timeoutMs) || timeoutMs <= 0) timeoutMs = 1200;
      el.textContent = String(text || '');
      el.classList.remove('hidden');
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        try { el.classList.add('hidden'); } catch {}
      }, timeoutMs);
    }

    function hide() {
      var el = getEl();
      if (!el) return;
      if (timer) clearTimeout(timer);
      timer = null;
      el.classList.add('hidden');
    }

    return {
      show: show,
      hide: hide,
      destroy: hide,
    };
  }

  window.TankoHgUi = window.TankoHgUi || {};
  window.TankoHgUi.createToastController = createToastController;
})();
