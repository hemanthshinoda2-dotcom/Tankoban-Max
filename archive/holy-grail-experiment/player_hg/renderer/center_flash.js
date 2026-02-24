// Center Flash — large icon feedback for play/pause/speed.
// Matches Qt player's CenterFlashWidget (run_player.py lines 1569-1630).
(function () {
  'use strict';

  var FADE_IN_MS = 300;
  var HOLD_MS = 500;
  var FADE_OUT_MS = 300;

  var stageEl = null;
  var flashEl = null;
  var iconLabel = null;
  var holdTimer = null;
  var fadeOutTimer = null;

  function buildDom() {
    flashEl = document.createElement('div');
    flashEl.id = 'centerFlash';
    flashEl.className = 'overlay';
    flashEl.style.display = 'none';
    flashEl.style.opacity = '0';

    iconLabel = document.createElement('span');
    iconLabel.className = 'flash-icon';
    iconLabel.textContent = '\u25B6'; // ▶
    flashEl.appendChild(iconLabel);

    return flashEl;
  }

  function flash(icon) {
    if (!flashEl) return;
    iconLabel.textContent = icon || '\u25B6';

    // Cancel any pending timers
    if (holdTimer) clearTimeout(holdTimer);
    if (fadeOutTimer) clearTimeout(fadeOutTimer);

    // Show + fade in
    flashEl.style.display = '';
    flashEl.style.transition = 'opacity ' + FADE_IN_MS + 'ms ease';
    void flashEl.offsetWidth;
    flashEl.style.opacity = '1';

    // After hold, fade out
    holdTimer = setTimeout(function () {
      flashEl.style.transition = 'opacity ' + FADE_OUT_MS + 'ms ease';
      flashEl.style.opacity = '0';
      fadeOutTimer = setTimeout(function () {
        if (flashEl) flashEl.style.display = 'none';
      }, FADE_OUT_MS);
    }, HOLD_MS);
  }

  function init() {
    var root = window.TankoPlayer._root || document;
    stageEl = root.getElementById('playerStage');
    var el = buildDom();
    stageEl.appendChild(el);
  }

  function destroy() {
    if (holdTimer) clearTimeout(holdTimer);
    if (fadeOutTimer) clearTimeout(fadeOutTimer);
    if (flashEl && flashEl.parentNode) flashEl.parentNode.removeChild(flashEl);
    flashEl = null;
    stageEl = null;
  }

  window.TankoPlayer = window.TankoPlayer || {};
  window.TankoPlayer.centerFlash = {
    init: init,
    destroy: destroy,
    flash: flash,
  };
})();
