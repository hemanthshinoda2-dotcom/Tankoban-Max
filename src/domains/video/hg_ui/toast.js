(function () {
  'use strict';

  function createToastController(opts) {
    var o = opts || {};
    var timer = null;
    var hideToken = 0;

    function getEl() {
      if (typeof o.toastElProvider === 'function') {
        var e = o.toastElProvider();
        if (e) return e;
      }
      return null;
    }

    function clearTimer() {
      if (!timer) return;
      try { clearTimeout(timer); } catch {}
      timer = null;
    }

    function show(text, ms, extra) {
      var el = getEl();
      if (!el) {
        if (typeof o.fallbackShow === 'function') o.fallbackShow(text, ms, extra);
        return;
      }
      var timeoutMs = Number(ms);
      if (!isFinite(timeoutMs) || timeoutMs <= 0) timeoutMs = 1200;

      var payload = (extra && typeof extra === 'object') ? extra : {};
      var className = String(payload.className || '').trim();

      clearTimer();
      hideToken += 1;
      var token = hideToken;

      try {
        el.textContent = String(text || '');
        el.setAttribute('aria-live', 'polite');
        el.classList.remove('hidden');
        if (className) el.dataset.variant = className;
        else delete el.dataset.variant;
      } catch {}

      timer = setTimeout(function () {
        if (token !== hideToken) return;
        try { el.classList.add('hidden'); } catch {}
        timer = null;
      }, timeoutMs);
    }

    function hide() {
      hideToken += 1;
      clearTimer();
      var el = getEl();
      if (!el) return;
      try {
        el.classList.add('hidden');
        delete el.dataset.variant;
      } catch {}
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
