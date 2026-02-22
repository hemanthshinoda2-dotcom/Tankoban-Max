// Toast HUD — small fading notification at top-left.
// Matches Qt player's ToastHUD (run_player.py lines 1979-2053).
(function () {
  'use strict';

  var DEFAULT_MS = 1200;
  var FADE_IN_MS = 150;
  var FADE_OUT_MS = 220;
  var MARGIN = 18;

  var stageEl = null;
  var toastEl = null;
  var labelEl = null;
  var hideTimer = null;
  var fadeOutTimer = null;

  function buildDom() {
    toastEl = document.createElement('div');
    toastEl.id = 'toastHud';
    toastEl.className = 'overlay';
    toastEl.style.display = 'none';
    toastEl.style.opacity = '0';

    labelEl = document.createElement('span');
    labelEl.className = 'toast-label';
    labelEl.textContent = '';
    toastEl.appendChild(labelEl);

    return toastEl;
  }

  function show(text, ms) {
    if (!toastEl) return;
    if (ms === undefined) ms = DEFAULT_MS;

    labelEl.textContent = text;

    // Cancel any pending timers
    if (hideTimer) clearTimeout(hideTimer);
    if (fadeOutTimer) clearTimeout(fadeOutTimer);

    // Position: top-left with margin
    toastEl.style.left = MARGIN + 'px';
    toastEl.style.top = MARGIN + 'px';

    // Show + fade in
    toastEl.style.display = '';
    toastEl.style.transition = 'opacity ' + FADE_IN_MS + 'ms ease';
    void toastEl.offsetWidth;
    toastEl.style.opacity = '1';

    // Arm auto-hide
    hideTimer = setTimeout(fadeOut, ms);
  }

  function fadeOut() {
    if (!toastEl) return;
    toastEl.style.transition = 'opacity ' + FADE_OUT_MS + 'ms ease';
    toastEl.style.opacity = '0';
    fadeOutTimer = setTimeout(function () {
      if (toastEl) toastEl.style.display = 'none';
    }, FADE_OUT_MS);
  }

  function init() {
    stageEl = document.getElementById('playerStage');
    var el = buildDom();
    stageEl.appendChild(el);
  }

  function destroy() {
    if (hideTimer) clearTimeout(hideTimer);
    if (fadeOutTimer) clearTimeout(fadeOutTimer);
    if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
    toastEl = null;
    stageEl = null;
  }

  window.TankoPlayer = window.TankoPlayer || {};
  window.TankoPlayer.toast = {
    init: init,
    destroy: destroy,
    show: show,
  };
})();
