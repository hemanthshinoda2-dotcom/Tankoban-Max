(function () {
  'use strict';

  function createVolumeHudController(opts) {
    var o = opts || {};
    var timer = null;
    var hud = null;

    function ensureHud() {
      if (hud) return hud;
      var stage = (typeof o.stageElProvider === 'function') ? o.stageElProvider() : null;
      if (!stage) return null;
      hud = document.createElement('div');
      hud.id = 'videoVolumeHud';
      hud.className = 'videoVolumeHud hidden';
      hud.innerHTML = '<div class="videoVolumeHudIcon"></div><div class="videoVolumeHudBar"><div class="videoVolumeHudFill"></div></div><div class="videoVolumeHudPct">0%</div>';
      stage.appendChild(hud);
      return hud;
    }

    function show(volume01) {
      var el = ensureHud();
      if (!el) return;
      var pct = Math.max(0, Math.min(100, Math.round(Number(volume01 || 0) * 100)));
      var icon = el.querySelector('.videoVolumeHudIcon');
      var fill = el.querySelector('.videoVolumeHudFill');
      var label = el.querySelector('.videoVolumeHudPct');
      if (icon) icon.textContent = pct === 0 ? 'MUTE' : (pct < 50 ? 'VOL-' : 'VOL+');
      if (fill) fill.style.width = String(pct) + '%';
      if (label) label.textContent = String(pct) + '%';
      el.classList.remove('hidden');
      el.classList.add('visible');
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        el.classList.remove('visible');
        el.classList.add('hidden');
      }, 900);
    }

    function hide() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (hud) {
        hud.classList.remove('visible');
        hud.classList.add('hidden');
      }
    }

    function destroy() {
      hide();
      if (hud && hud.parentNode) hud.parentNode.removeChild(hud);
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
