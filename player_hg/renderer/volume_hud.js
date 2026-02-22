// Volume HUD — floating overlay showing icon + bar + percentage.
// Matches Qt player's VolumeHUD (run_player.py lines 404-499).
(function () {
  'use strict';

  var clamp = window.TankoPlayer.utils.clamp;

  var SHOW_MS = 1000;
  var FADE_IN_MS = 150;
  var FADE_OUT_MS = 200;

  var stageEl = null;
  var hudEl = null;
  var symbolLabel = null;
  var barFill = null;
  var percentLabel = null;
  var hideTimer = null;
  var fadeOutTimer = null;

  function buildDom() {
    hudEl = document.createElement('div');
    hudEl.id = 'volumeHud';
    hudEl.className = 'overlay';
    hudEl.style.display = 'none';
    hudEl.style.opacity = '0';

    symbolLabel = document.createElement('span');
    symbolLabel.className = 'vol-symbol';
    symbolLabel.textContent = '\u25D5'; // ◕

    var barContainer = document.createElement('div');
    barContainer.className = 'vol-bar-container';
    barFill = document.createElement('div');
    barFill.className = 'vol-bar-fill';
    barContainer.appendChild(barFill);

    percentLabel = document.createElement('span');
    percentLabel.className = 'vol-percent';
    percentLabel.textContent = '100%';

    hudEl.appendChild(symbolLabel);
    hudEl.appendChild(barContainer);
    hudEl.appendChild(percentLabel);

    return hudEl;
  }

  function getSymbol(vol) {
    if (vol === 0) return '\u2298'; // ⊘
    if (vol < 33) return '\u25D4'; // ◔
    if (vol < 66) return '\u25D1'; // ◑
    return '\u25D5'; // ◕
  }

  // vol: 0-100 integer
  function show(vol) {
    if (!hudEl) return;
    vol = clamp(Math.round(vol), 0, 100);

    symbolLabel.textContent = getSymbol(vol);
    barFill.style.width = vol + '%';
    percentLabel.textContent = vol + '%';

    // Cancel any pending fade-out
    if (hideTimer) clearTimeout(hideTimer);
    if (fadeOutTimer) clearTimeout(fadeOutTimer);

    // Position: centered horizontally, 1/3 from top
    if (stageEl) {
      var stageRect = stageEl.getBoundingClientRect();
      var hudWidth = 240; // approximate
      hudEl.style.left = Math.round((stageRect.width - hudWidth) / 2) + 'px';
      hudEl.style.top = Math.round(stageRect.height / 3) + 'px';
    }

    // Show + fade in
    hudEl.style.display = '';
    hudEl.style.transition = 'opacity ' + FADE_IN_MS + 'ms ease';
    // Force reflow so transition triggers
    void hudEl.offsetWidth;
    hudEl.style.opacity = '1';

    // Arm auto-hide
    hideTimer = setTimeout(fadeOut, SHOW_MS);
  }

  function fadeOut() {
    if (!hudEl) return;
    hudEl.style.transition = 'opacity ' + FADE_OUT_MS + 'ms ease';
    hudEl.style.opacity = '0';
    fadeOutTimer = setTimeout(function () {
      if (hudEl) hudEl.style.display = 'none';
    }, FADE_OUT_MS);
  }

  function init() {
    var root = window.TankoPlayer._root || document;
    stageEl = root.getElementById('playerStage');
    var el = buildDom();
    stageEl.appendChild(el);
  }

  function destroy() {
    if (hideTimer) clearTimeout(hideTimer);
    if (fadeOutTimer) clearTimeout(fadeOutTimer);
    if (hudEl && hudEl.parentNode) hudEl.parentNode.removeChild(hudEl);
    hudEl = null;
    stageEl = null;
  }

  window.TankoPlayer = window.TankoPlayer || {};
  window.TankoPlayer.volumeHud = {
    init: init,
    destroy: destroy,
    show: show,
  };
})();
