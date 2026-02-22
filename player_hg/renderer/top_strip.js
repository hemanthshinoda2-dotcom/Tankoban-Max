// Top Strip — title + window controls (minimize, fullscreen, close).
// Matches Qt player's TopStripWidget (run_player.py lines 666-745).
(function () {
  'use strict';

  var stageEl = null;
  var stripEl = null;
  var titleLabel = null;
  var visible = false;

  function buildDom() {
    stripEl = document.createElement('div');
    stripEl.id = 'topStrip';
    stripEl.className = 'overlay';
    stripEl.style.display = 'none';

    titleLabel = document.createElement('span');
    titleLabel.className = 'strip-title';
    titleLabel.textContent = '';

    var spacer = document.createElement('span');
    spacer.className = 'strip-spacer';

    var minimizeBtn = document.createElement('button');
    minimizeBtn.className = 'strip-btn';
    minimizeBtn.textContent = '\u2014'; // —
    minimizeBtn.title = 'Minimize';
    minimizeBtn.addEventListener('click', function () {
      if (window.PlayerBridge && window.PlayerBridge.minimize) {
        window.PlayerBridge.minimize();
      }
    });

    var fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'strip-btn';
    fullscreenBtn.textContent = '\u25A2'; // ▢
    fullscreenBtn.title = 'Fullscreen';
    fullscreenBtn.addEventListener('click', function () {
      if (window.PlayerBridge && window.PlayerBridge.toggleFullscreen) {
        window.PlayerBridge.toggleFullscreen();
      }
    });

    var closeBtn = document.createElement('button');
    closeBtn.className = 'strip-btn strip-btn-close';
    closeBtn.textContent = '\u2715'; // ✕
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', function () {
      if (window.PlayerBridge && window.PlayerBridge.quit) {
        window.PlayerBridge.quit();
      }
    });

    stripEl.appendChild(titleLabel);
    stripEl.appendChild(spacer);
    stripEl.appendChild(minimizeBtn);
    stripEl.appendChild(fullscreenBtn);
    stripEl.appendChild(closeBtn);

    return stripEl;
  }

  function setTitle(name) {
    if (titleLabel) titleLabel.textContent = name || '';
  }

  function show() {
    if (!stripEl) return;
    var s = window.TankoPlayer.state.get();
    if (!s.fileLoaded) return;
    stripEl.style.display = '';
    visible = true;
  }

  function hide() {
    if (!stripEl) return;
    stripEl.style.display = 'none';
    visible = false;
  }

  function isVisible() {
    return visible;
  }

  function init() {
    stageEl = document.getElementById('playerStage');
    var el = buildDom();
    stageEl.appendChild(el);
  }

  function destroy() {
    if (stripEl && stripEl.parentNode) stripEl.parentNode.removeChild(stripEl);
    stripEl = null;
    stageEl = null;
    visible = false;
  }

  window.TankoPlayer = window.TankoPlayer || {};
  window.TankoPlayer.topStrip = {
    init: init,
    destroy: destroy,
    show: show,
    hide: hide,
    isVisible: isVisible,
    setTitle: setTitle,
  };
})();
