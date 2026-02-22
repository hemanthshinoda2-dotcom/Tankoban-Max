(function () {
  'use strict';

  function createCenterFlashController(opts) {
    var o = opts || {};
    var holdTimer = null;
    var fadeToken = 0;

    function getEl() {
      if (typeof o.targetElProvider === 'function') return o.targetElProvider();
      return null;
    }

    function normalizeText(text) {
      var raw = String(text == null ? '' : text).trim();
      var up = raw.toUpperCase();
      if (up === 'PLAY') return '\u25B6';
      if (up === 'PAUSE') return '\u2161';
      if (up === 'RESUME') return '\u25B6';
      if (up === 'MUTE') return '\uD83D\uDD07';
      if (up === 'UNMUTED' || up === 'UNMUTE') return '\uD83D\uDD0A';
      return raw;
    }

    function clearHoldTimer() {
      if (!holdTimer) return;
      try { clearTimeout(holdTimer); } catch {}
      holdTimer = null;
    }

    function flash(text, ms) {
      var el = getEl();
      if (!el) return;
      clearHoldTimer();
      fadeToken += 1;
      var token = fadeToken;

      try {
        el.textContent = normalizeText(text);
        el.classList.remove('hidden');
        el.setAttribute('aria-hidden', 'false');
      } catch {}

      holdTimer = setTimeout(function () {
        if (token !== fadeToken) return;
        try {
          el.classList.add('hidden');
          el.setAttribute('aria-hidden', 'true');
        } catch {}
        holdTimer = null;
      }, Number(ms) > 0 ? Number(ms) : 460);
    }

    function hide() {
      fadeToken += 1;
      clearHoldTimer();
      var el = getEl();
      if (!el) return;
      try {
        el.classList.add('hidden');
        el.setAttribute('aria-hidden', 'true');
      } catch {}
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
