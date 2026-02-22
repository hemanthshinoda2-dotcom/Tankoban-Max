// Bottom HUD — seek row + main transport row.
// Matches Qt player's BottomHUDWidget (run_player.py lines 1177-1567).
(function () {
  'use strict';

  var fmtTime = window.TankoPlayer.utils.fmtTime;
  var clamp = window.TankoPlayer.utils.clamp;

  var AUTOHIDE_MS = 3000;
  var CURSOR_HIDE_MS = 2000;
  var BOTTOM_ZONE_PX = 110;
  var TOP_ZONE_PX = 60;

  // ── DOM refs (set by init) ──
  var stageEl = null;
  var hudEl = null;
  var timeLabel = null;
  var durationLabel = null;
  var seekTrack = null;
  var seekFill = null;
  var seekHandle = null;
  var playPauseBtn = null;
  var titleLabel = null;
  var speedChip = null;
  var adapter = null;

  var hideTimer = null;
  var visible = false;
  var duration = 0;
  var currentTime = 0;
  var seeking = false;
  var seekBubble = null;
  var seekSliderEl = null;
  var chapterTickContainer = null;
  var chapters = [];

  // ── Helpers ──

  function makeChip(label, tooltip) {
    var btn = document.createElement('button');
    btn.className = 'hud-chip';
    btn.textContent = label;
    btn.title = tooltip || '';
    return btn;
  }

  function setSpeedLabel(speed) {
    if (speedChip) speedChip.textContent = speed.toFixed(1) + '\u00D7';
  }

  // ── Build DOM ──

  function buildDom() {
    hudEl = document.createElement('div');
    hudEl.id = 'bottomHud';
    hudEl.className = 'overlay';
    // Starts invisible via CSS (opacity: 0), shown via .hud-visible class

    // Seek row
    var seekRow = document.createElement('div');
    seekRow.className = 'hud-seek-row';

    timeLabel = document.createElement('span');
    timeLabel.className = 'hud-time';
    timeLabel.textContent = '0:00';

    var seekBackBtn = document.createElement('button');
    seekBackBtn.className = 'hud-chip';
    seekBackBtn.textContent = '-10s';
    seekBackBtn.title = 'Seek back 10 seconds';
    seekBackBtn.addEventListener('click', function () {
      if (adapter) adapter.seekBy(-10);
    });

    var seekSlider = document.createElement('div');
    seekSlider.className = 'hud-seek-slider';
    seekSliderEl = seekSlider;
    seekTrack = document.createElement('div');
    seekTrack.className = 'hud-seek-track';
    seekFill = document.createElement('div');
    seekFill.className = 'hud-seek-fill';
    seekHandle = document.createElement('div');
    seekHandle.className = 'hud-seek-handle';

    // Chapter tick container (inside the track, behind the fill)
    chapterTickContainer = document.createElement('div');
    chapterTickContainer.className = 'hud-seek-chapters';
    seekTrack.appendChild(chapterTickContainer);
    seekTrack.appendChild(seekFill);

    // Hover time bubble
    seekBubble = document.createElement('div');
    seekBubble.className = 'hud-seek-bubble';
    seekBubble.textContent = '0:00';

    seekSlider.appendChild(seekTrack);
    seekSlider.appendChild(seekHandle);
    seekSlider.appendChild(seekBubble);

    // Click-to-seek + drag
    seekSlider.addEventListener('mousedown', onSeekMouseDown);
    // Hover bubble
    seekSlider.addEventListener('mousemove', onSeekHover);
    seekSlider.addEventListener('mouseleave', onSeekLeave);

    var seekForwardBtn = document.createElement('button');
    seekForwardBtn.className = 'hud-chip';
    seekForwardBtn.textContent = '+10s';
    seekForwardBtn.title = 'Seek forward 10 seconds';
    seekForwardBtn.addEventListener('click', function () {
      if (adapter) adapter.seekBy(10);
    });

    durationLabel = document.createElement('span');
    durationLabel.className = 'hud-time';
    durationLabel.textContent = '0:00';

    seekRow.appendChild(timeLabel);
    seekRow.appendChild(seekBackBtn);
    seekRow.appendChild(seekSlider);
    seekRow.appendChild(seekForwardBtn);
    seekRow.appendChild(durationLabel);

    // Main row
    var mainRow = document.createElement('div');
    mainRow.className = 'hud-main-row';

    var backBtn = document.createElement('button');
    backBtn.className = 'hud-btn';
    backBtn.textContent = '\u2190'; // ←
    backBtn.title = 'Back';
    backBtn.addEventListener('click', function () {
      // Standalone: open file dialog or quit
      if (window.PlayerBridge && window.PlayerBridge.openFileDialog) {
        window.PlayerBridge.openFileDialog().then(function (path) {
          if (path && window._loadFile) window._loadFile(path);
        });
      }
    });

    var prevBtn = document.createElement('button');
    prevBtn.className = 'hud-btn hud-btn-transport';
    prevBtn.textContent = '\u23EE\uFE0E'; // ⏮
    prevBtn.title = 'Previous';
    prevBtn.addEventListener('click', function () {
      if (window.TankoPlayer.playlist) window.TankoPlayer.playlist.prevEpisode();
    });

    playPauseBtn = document.createElement('button');
    playPauseBtn.className = 'hud-btn hud-btn-play';
    playPauseBtn.textContent = '\u25B6'; // ▶
    playPauseBtn.title = 'Play';
    playPauseBtn.addEventListener('click', function () {
      if (adapter) adapter.togglePlay();
    });

    var nextBtn = document.createElement('button');
    nextBtn.className = 'hud-btn hud-btn-transport';
    nextBtn.textContent = '\u23ED\uFE0E'; // ⏭
    nextBtn.title = 'Next';
    nextBtn.addEventListener('click', function () {
      if (window.TankoPlayer.playlist) window.TankoPlayer.playlist.nextEpisode();
    });

    titleLabel = document.createElement('span');
    titleLabel.className = 'hud-title';
    titleLabel.textContent = '';

    // Right-side chip buttons
    var chipRow = document.createElement('div');
    chipRow.className = 'hud-chip-row';

    var tracksChip = makeChip('\u266B', 'Tracks'); // ♫
    tracksChip.addEventListener('click', function () {
      if (window.TankoPlayer.tracksDrawer) window.TankoPlayer.tracksDrawer.toggle();
    });

    speedChip = makeChip('1.0\u00D7', 'Speed'); // 1.0×
    speedChip.addEventListener('click', function () {
      // Cycle speed preset on click
      if (window.TankoPlayer._cycleSpeed) window.TankoPlayer._cycleSpeed(+1);
    });

    var audioChip = makeChip('\u266A', 'Audio Track'); // ♪
    audioChip.addEventListener('click', function () {
      if (adapter && adapter.capabilities && adapter.capabilities.tracks) {
        adapter.cycleAudioTrack();
        setTimeout(function () {
          var tracks = adapter.getAudioTracks ? adapter.getAudioTracks() : [];
          var cur = adapter.getCurrentAudioTrack ? adapter.getCurrentAudioTrack() : null;
          for (var i = 0; i < tracks.length; i++) {
            if (tracks[i].id === cur) {
              window.TankoPlayer.toast.show('\u266A ' + (tracks[i].label || 'Track ' + tracks[i].id));
              break;
            }
          }
        }, 100);
      } else {
        window.TankoPlayer.toast.show('Audio tracks: requires mpv backend');
      }
    });

    var aspectChip = makeChip('\u25AD', 'Aspect'); // ▭
    aspectChip.addEventListener('click', function () {
      if (window.TankoPlayer._cycleAspect) window.TankoPlayer._cycleAspect();
    });

    var playlistChip = makeChip('\u2630', 'Playlist'); // ☰
    playlistChip.addEventListener('click', function () {
      if (window.TankoPlayer.playlist) window.TankoPlayer.playlist.toggle();
    });

    var ccChip = makeChip('CC', 'Subtitles');
    ccChip.addEventListener('click', function () {
      if (adapter && adapter.capabilities && adapter.capabilities.tracks) {
        adapter.cycleSubtitleTrack();
        setTimeout(function () {
          var cur = adapter.getCurrentSubtitleTrack ? adapter.getCurrentSubtitleTrack() : null;
          if (cur === null) {
            window.TankoPlayer.toast.show('CC Off');
          } else {
            var tracks = adapter.getSubtitleTracks ? adapter.getSubtitleTracks() : [];
            for (var i = 0; i < tracks.length; i++) {
              if (tracks[i].id === cur) {
                window.TankoPlayer.toast.show('CC ' + (tracks[i].label || 'Subtitle ' + tracks[i].id));
                break;
              }
            }
          }
        }, 100);
      } else {
        window.TankoPlayer.toast.show('Subtitles: requires mpv backend');
      }
    });

    var fsChip = makeChip('\u2922', 'Fullscreen'); // ⤢
    fsChip.addEventListener('click', function () {
      if (window.PlayerBridge && window.PlayerBridge.toggleFullscreen) {
        window.PlayerBridge.toggleFullscreen();
      }
    });

    chipRow.appendChild(tracksChip);
    chipRow.appendChild(speedChip);
    chipRow.appendChild(audioChip);
    chipRow.appendChild(aspectChip);
    chipRow.appendChild(playlistChip);
    chipRow.appendChild(ccChip);
    chipRow.appendChild(fsChip);

    mainRow.appendChild(backBtn);
    mainRow.appendChild(prevBtn);
    mainRow.appendChild(playPauseBtn);
    mainRow.appendChild(nextBtn);
    mainRow.appendChild(titleLabel);
    mainRow.appendChild(chipRow);

    hudEl.appendChild(seekRow);
    hudEl.appendChild(mainRow);

    return hudEl;
  }

  // ── Seek slider mouse handling ──

  function onSeekMouseDown(e) {
    if (!adapter || duration <= 0) return;
    e.preventDefault();
    seeking = true;
    seekToMouseX(e);
    document.addEventListener('mousemove', onSeekMouseMove);
    document.addEventListener('mouseup', onSeekMouseUp);
  }

  function onSeekMouseMove(e) {
    if (!seeking) return;
    seekToMouseX(e);
    armAutoHide();
  }

  function onSeekMouseUp(e) {
    if (!seeking) return;
    seeking = false;
    seekToMouseX(e);
    document.removeEventListener('mousemove', onSeekMouseMove);
    document.removeEventListener('mouseup', onSeekMouseUp);
  }

  function seekToMouseX(e) {
    if (!seekTrack || duration <= 0) return;
    var rect = seekTrack.getBoundingClientRect();
    var fraction = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    var sec = fraction * duration;
    updateSeekVisual(fraction);
    timeLabel.textContent = fmtTime(sec);
    adapter.seekTo(sec);
  }

  function updateSeekVisual(fraction) {
    var pct = (fraction * 100).toFixed(2) + '%';
    seekFill.style.width = pct;
    seekHandle.style.left = pct;
  }

  // ── Hover time bubble ──

  function onSeekHover(e) {
    if (!seekTrack || duration <= 0) return;
    var rect = seekTrack.getBoundingClientRect();
    var fraction = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    var sec = fraction * duration;

    seekBubble.textContent = fmtTime(sec);
    seekBubble.style.display = '';

    // Position bubble centered on cursor, above the slider
    var sliderRect = seekSliderEl.getBoundingClientRect();
    var bubbleWidth = seekBubble.offsetWidth;
    var left = e.clientX - sliderRect.left - bubbleWidth / 2;
    // Clamp so bubble stays within slider bounds
    left = clamp(left, 0, sliderRect.width - bubbleWidth);
    seekBubble.style.left = left + 'px';
  }

  function onSeekLeave() {
    if (!seeking) {
      seekBubble.style.display = 'none';
    }
  }

  // ── Chapter ticks ──

  function renderChapterTicks() {
    if (!chapterTickContainer) return;
    chapterTickContainer.innerHTML = '';
    if (!chapters.length || duration <= 0) return;

    for (var i = 0; i < chapters.length; i++) {
      var ch = chapters[i];
      var timeSec = ch.time || ch.timeSec || 0;
      if (timeSec <= 0 || timeSec >= duration) continue;
      var pct = (timeSec / duration * 100).toFixed(3);
      var tick = document.createElement('div');
      tick.className = 'hud-chapter-tick';
      tick.style.left = pct + '%';
      tick.title = ch.title || '';
      chapterTickContainer.appendChild(tick);
    }
  }

  function onChaptersEvent(chapterList) {
    chapters = chapterList || [];
    renderChapterTicks();
  }

  // ── Adapter events ──

  function onTimeEvent(t) {
    if (seeking) return; // Don't update while user is dragging
    currentTime = t;
    timeLabel.textContent = fmtTime(t);
    if (duration > 0) {
      updateSeekVisual(t / duration);
    }
  }

  function onDurationEvent(d) {
    duration = d;
    durationLabel.textContent = fmtTime(d);
    renderChapterTicks(); // re-render ticks when duration is known
  }

  function onPlayEvent() {
    playPauseBtn.textContent = '\u23F8'; // ⏸
    playPauseBtn.title = 'Pause';
  }

  function onPauseEvent() {
    playPauseBtn.textContent = '\u25B6'; // ▶
    playPauseBtn.title = 'Play';
  }

  function onFileLoaded() {
    // Show HUD briefly when file loads
    showHud();
    armAutoHide();
    // Set title from state
    var s = window.TankoPlayer.state.get();
    if (s.filePath) {
      var name = s.filePath.replace(/\\/g, '/').split('/').pop();
      // Strip extension
      name = name.replace(/\.[^.]+$/, '');
      titleLabel.textContent = name;
    }
  }

  // ── Show / Hide ──

  function showHud() {
    if (!hudEl) return;
    var s = window.TankoPlayer.state.get();
    if (!s.fileLoaded) return;
    hudEl.classList.add('hud-visible');
    visible = true;
    showCursor();
    // Also show top strip
    if (window.TankoPlayer.topStrip) window.TankoPlayer.topStrip.show();
  }

  function hideHud() {
    if (!hudEl) return;
    hudEl.classList.remove('hud-visible');
    visible = false;
    armCursorHide(); // also start cursor hide countdown
    // Also hide top strip
    if (window.TankoPlayer.topStrip) window.TankoPlayer.topStrip.hide();
  }

  function armAutoHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      var s = window.TankoPlayer.state.get();
      // Don't auto-hide if paused
      if (s.paused) return;
      hideHud();
    }, AUTOHIDE_MS);
  }

  function isVisible() {
    return visible;
  }

  // ── Cursor auto-hide ──

  var cursorTimer = null;
  var cursorHidden = false;

  function showCursor() {
    if (!stageEl) return;
    if (cursorHidden) {
      stageEl.classList.remove('hideCursor');
      cursorHidden = false;
    }
  }

  function hideCursor() {
    if (!stageEl) return;
    var s = window.TankoPlayer.state.get();
    if (s.paused) return; // never hide cursor when paused
    stageEl.classList.add('hideCursor');
    cursorHidden = true;
  }

  function armCursorHide() {
    if (cursorTimer) clearTimeout(cursorTimer);
    cursorTimer = setTimeout(function () {
      var s = window.TankoPlayer.state.get();
      if (!s.paused && !visible) hideCursor();
    }, CURSOR_HIDE_MS);
  }

  // ── Mouse move on stage → show cursor + bottom-edge reveal ──

  function onStageMouseMove(e) {
    // Always show cursor on move
    showCursor();
    armCursorHide();

    // Edge reveal zones (top or bottom)
    if (stageEl) {
      var stageRect = stageEl.getBoundingClientRect();
      var bottomThreshold = stageRect.bottom - BOTTOM_ZONE_PX;
      var topThreshold = stageRect.top + TOP_ZONE_PX;
      var inEdgeZone = e.clientY >= bottomThreshold || e.clientY <= topThreshold;

      if (inEdgeZone) {
        if (!visible) showHud();
        armAutoHide();
      }
      // If not in edge zone and HUD is visible, just refresh the autohide
      else if (visible) {
        armAutoHide();
      }
    }
  }

  // Keep HUD visible when mouse is over it
  function onHudMouseEnter() {
    if (hideTimer) clearTimeout(hideTimer);
    showCursor();
  }

  function onHudMouseLeave() {
    if (visible) armAutoHide();
  }

  // ── Init / Destroy ──

  var offHandlers = [];

  function init(adapterInstance) {
    adapter = adapterInstance;
    stageEl = document.getElementById('playerStage');

    // Make stage focusable so keyboard shortcuts work after button clicks
    if (!stageEl.hasAttribute('tabindex')) stageEl.setAttribute('tabindex', '-1');
    stageEl.style.outline = 'none';

    var el = buildDom();
    stageEl.appendChild(el);

    // Blur buttons after click so keyboard shortcuts keep working.
    // Without this, clicking a HUD button gives it focus and Space/Enter
    // trigger the button instead of the intended keyboard shortcut.
    el.addEventListener('click', function () {
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
        document.activeElement.blur();
      }
      stageEl.focus();
    });

    // Bind adapter events
    offHandlers.push(adapter.on('time', onTimeEvent));
    offHandlers.push(adapter.on('duration', onDurationEvent));
    offHandlers.push(adapter.on('play', onPlayEvent));
    offHandlers.push(adapter.on('pause', onPauseEvent));
    offHandlers.push(adapter.on('file-loaded', onFileLoaded));
    offHandlers.push(adapter.on('chapters', onChaptersEvent));

    // Stage mouse move for reveal
    stageEl.addEventListener('mousemove', onStageMouseMove);

    // HUD hover keeps it visible (bottom + top strip)
    hudEl.addEventListener('mouseenter', onHudMouseEnter);
    hudEl.addEventListener('mouseleave', onHudMouseLeave);

    // Defer top strip hover binding (it inits after us)
    requestAnimationFrame(function () {
      var topStripEl = document.getElementById('topStrip');
      if (topStripEl) {
        topStripEl.addEventListener('mouseenter', onHudMouseEnter);
        topStripEl.addEventListener('mouseleave', onHudMouseLeave);
      }
    });
  }

  function destroy() {
    offHandlers.forEach(function (off) { if (off) off(); });
    offHandlers = [];
    if (hideTimer) clearTimeout(hideTimer);
    if (cursorTimer) clearTimeout(cursorTimer);
    showCursor();
    if (stageEl) stageEl.removeEventListener('mousemove', onStageMouseMove);
    if (hudEl && hudEl.parentNode) hudEl.parentNode.removeChild(hudEl);
    hudEl = null;
    adapter = null;
    visible = false;
  }

  window.TankoPlayer = window.TankoPlayer || {};
  window.TankoPlayer.hud = {
    init: init,
    destroy: destroy,
    show: showHud,
    hide: hideHud,
    isVisible: isVisible,
    armAutoHide: armAutoHide,
    setSpeedLabel: setSpeedLabel,
  };
})();
