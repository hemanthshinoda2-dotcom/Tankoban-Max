(function () {
  'use strict';

  function createDiagnosticsController(opts) {
    var o = opts || {};
    var timer = null;

    function getEl() {
      if (typeof o.targetElProvider === 'function') return o.targetElProvider();
      return null;
    }

    function stopTimer() {
      if (timer) clearInterval(timer);
      timer = null;
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
      if (timer) return;
      timer = setInterval(function () {
        var target = getEl();
        if (!target) return;
        try {
          var text = (typeof o.renderText === 'function') ? o.renderText() : '';
          target.textContent = String(text || '');
        } catch {}
      }, Number(o.intervalMs) > 0 ? Number(o.intervalMs) : 500);
    }

    function isVisible() {
      var el = getEl();
      return !!(el && !el.classList.contains('hidden'));
    }

    return {
      setVisible: setVisible,
      isVisible: isVisible,
      destroy: function () {
        stopTimer();
        var el = getEl();
        if (el) el.classList.add('hidden');
      },
    };
  }

  window.TankoHgUi = window.TankoHgUi || {};
  window.TankoHgUi.createDiagnosticsController = createDiagnosticsController;
})();
