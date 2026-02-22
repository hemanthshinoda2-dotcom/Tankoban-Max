(function () {
  'use strict';

  function createDiagnosticsController(opts) {
    var o = opts || {};
    var timer = null;

    function getEl() {
      if (typeof o.targetElProvider === 'function') return o.targetElProvider();
      return null;
    }

    function intervalMs() {
      var v = Number(o.intervalMs);
      return (isFinite(v) && v > 0) ? v : 500;
    }

    function stopTimer() {
      if (timer) {
        try { clearInterval(timer); } catch {}
      }
      timer = null;
    }

    function renderOnce() {
      var target = getEl();
      if (!target) return;
      try {
        var text = (typeof o.renderText === 'function') ? o.renderText() : '';
        target.textContent = String(text || '');
      } catch {}
    }

    function startTimer() {
      if (timer) return;
      timer = setInterval(function () {
        var el = getEl();
        if (!el || el.classList.contains('hidden')) return;
        renderOnce();
      }, intervalMs());
    }

    function setVisible(visible) {
      var el = getEl();
      if (!el) return;
      var on = !!visible;
      el.classList.toggle('hidden', !on);
      if (!on) {
        stopTimer();
        return;
      }
      renderOnce();
      startTimer();
    }

    function isVisible() {
      var el = getEl();
      return !!(el && !el.classList.contains('hidden'));
    }

    function destroy() {
      stopTimer();
      var el = getEl();
      if (el) {
        try { el.classList.add('hidden'); } catch {}
      }
    }

    return {
      setVisible: setVisible,
      isVisible: isVisible,
      refresh: renderOnce,
      destroy: destroy,
    };
  }

  window.TankoHgUi = window.TankoHgUi || {};
  window.TankoHgUi.createDiagnosticsController = createDiagnosticsController;
})();
