(function () {
  'use strict';

  function createVolumeHudController(opts) {
    var o = opts || {};
    var timer = null;
    var hud = null;
    var hideToken = 0;

    function getStage() {
      return (typeof o.stageElProvider === 'function') ? o.stageElProvider() : null;
    }

    function ensureHud() {
      var stage = getStage();
      if (!stage) return null;

      if (hud && hud.parentNode !== stage) {
        try { hud.parentNode && hud.parentNode.removeChild(hud); } catch {}
        hud = null;
      }

      if (hud) return hud;
      hud = document.createElement('div');
      hud.id = 'videoVolumeHud';
      hud.className = 'videoVolumeHud hidden';
      hud.innerHTML = '<div class="videoVolumeHudIcon"></div><div class="videoVolumeHudBar"><div class="videoVolumeHudFill"></div></div><div class="videoVolumeHudPct">0%</div>';
      stage.appendChild(hud);
      return hud;
    }

    function normalizePayload(volumeOrPayload, maybeOpts) {
      var p = {};
      if (volumeOrPayload && typeof volumeOrPayload === 'object') {
        p.volume = Number(volumeOrPayload.volume);
        p.muted = !!volumeOrPayload.muted;
      } else {
        p.volume = Number(volumeOrPayload);
        p.muted = !!(maybeOpts && maybeOpts.muted);
      }
      if (!isFinite(p.volume)) p.volume = 0;
      p.volume = Math.max(0, Math.min(1, p.volume));
      p.pct = Math.max(0, Math.min(100, Math.round(p.volume * 100)));
      return p;
    }

    function iconTextFor(p) {
      if (p.muted || p.pct === 0) return '\uD83D\uDD07';
      if (p.pct < 34) return '\uD83D\uDD08';
      if (p.pct < 67) return '\uD83D\uDD09';
      return '\uD83D\uDD0A';
    }

    function clearTimer() {
      if (!timer) return;
      try { clearTimeout(timer); } catch {}
      timer = null;
    }

    function show(volumeOrPayload, maybeOpts) {
      var el = ensureHud();
      if (!el) return;
      var p = normalizePayload(volumeOrPayload, maybeOpts);

      var icon = el.querySelector('.videoVolumeHudIcon');
      var fill = el.querySelector('.videoVolumeHudFill');
      var label = el.querySelector('.videoVolumeHudPct');

      if (icon) icon.textContent = iconTextFor(p);
      if (fill) fill.style.width = String(p.muted ? 0 : p.pct) + '%';
      if (label) label.textContent = p.muted ? ('Mute (' + String(p.pct) + '%)') : (String(p.pct) + '%');

      hideToken += 1;
      var token = hideToken;
      clearTimer();

      el.classList.remove('hidden');
      el.classList.add('visible');

      timer = setTimeout(function () {
        if (token !== hideToken) return;
        try {
          el.classList.remove('visible');
          el.classList.add('hidden');
        } catch {}
        timer = null;
      }, Number(o.holdMs) > 0 ? Number(o.holdMs) : 900);
    }

    function hide() {
      hideToken += 1;
      clearTimer();
      if (!hud) return;
      try {
        hud.classList.remove('visible');
        hud.classList.add('hidden');
      } catch {}
    }

    function destroy() {
      hide();
      if (hud && hud.parentNode) {
        try { hud.parentNode.removeChild(hud); } catch {}
      }
      hud = null;
    }

    return {
      show: show,
      hide: hide,
      destroy: destroy,
    };
  }

  window.TankoHgUi = window.TankoHgUi || {};
  window.TankoHgUi.createVolumeHudController = createVolumeHudController;
})();
