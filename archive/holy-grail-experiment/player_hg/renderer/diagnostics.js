// Diagnostics Overlay — shows player stats (I key toggle).
// Matches Qt DiagnosticsOverlay (run_player.py lines 1942-1976).
(function () {
  'use strict';

  var fmtTime = window.TankoPlayer.utils.fmtTime;

  var overlayEl = null;
  var labelEl = null;
  var visible = false;
  var rafId = null;

  function buildDom() {
    overlayEl = document.createElement('div');
    overlayEl.id = 'diagnosticsOverlay';
    overlayEl.className = 'overlay';
    overlayEl.style.display = 'none';

    labelEl = document.createElement('pre');
    labelEl.className = 'diag-label';
    overlayEl.appendChild(labelEl);

    return overlayEl;
  }

  function updateDisplay() {
    if (!visible || !labelEl) return;

    var s = window.TankoPlayer.state.get();
    var adapter = window._adapter;

    var lines = [];

    // File name
    if (s.filePath) {
      var name = s.filePath.replace(/\\/g, '/').split('/').pop();
      lines.push('File:       ' + name);
    }

    lines.push('Position:   ' + fmtTime(s.timeSec));
    lines.push('Duration:   ' + fmtTime(s.durationSec));
    lines.push('Resolution: ' + (s.width || '?') + '\u00D7' + (s.height || '?'));
    lines.push('Speed:      ' + (s.speed || 1).toFixed(2) + '\u00D7');
    lines.push('Volume:     ' + Math.round((s.muted ? 0 : s.volume) * 100) + '%');

    // FPS + dropped frames (Chromium getVideoPlaybackQuality)
    var videoEl = document.getElementById('videoSurface');
    if (videoEl && videoEl.getVideoPlaybackQuality) {
      var q = videoEl.getVideoPlaybackQuality();
      lines.push('Dropped:    ' + (q.droppedVideoFrames || 0));
      lines.push('Total Frms: ' + (q.totalVideoFrames || 0));
    }

    var backend = adapter ? adapter.kind : '?';
    lines.push('Backend:    ' + backend);

    labelEl.textContent = lines.join('\n');

    rafId = requestAnimationFrame(updateDisplay);
  }

  function show() {
    if (!overlayEl) return;
    overlayEl.style.display = '';
    visible = true;
    rafId = requestAnimationFrame(updateDisplay);
  }

  function hide() {
    if (!overlayEl) return;
    overlayEl.style.display = 'none';
    visible = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function toggle() {
    if (visible) hide();
    else show();
  }

  function isVisible() {
    return visible;
  }

  function init() {
    var root = window.TankoPlayer._root || document;
    var stageEl = root.getElementById('playerStage');
    var el = buildDom();
    stageEl.appendChild(el);
  }

  function destroy() {
    hide();
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null;
    labelEl = null;
  }

  window.TankoPlayer = window.TankoPlayer || {};
  window.TankoPlayer.diagnostics = {
    init: init,
    destroy: destroy,
    toggle: toggle,
    show: show,
    hide: hide,
    isVisible: isVisible,
  };
})();
