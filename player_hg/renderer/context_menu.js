// Context Menu — right-click menu with submenus.
// Matches Qt player's _show_context_menu (run_player.py lines 5457-5600).
(function () {
  'use strict';

  var menuEl = null;
  var backdrop = null;

  var SPEED_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0];

  function buildMenu(x, y) {
    closeMenu();

    var s = window.TankoPlayer.state.get();
    var paused = s.paused;

    // Backdrop: transparent click-catcher
    backdrop = document.createElement('div');
    backdrop.className = 'ctx-backdrop';
    backdrop.addEventListener('click', closeMenu);
    backdrop.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      closeMenu();
    });
    document.body.appendChild(backdrop);

    menuEl = document.createElement('div');
    menuEl.className = 'ctx-menu';

    // ── Open File ──
    addItem(menuEl, 'Open File\u2026', function () {
      if (window.PlayerBridge && window.PlayerBridge.openFileDialog) {
        window.PlayerBridge.openFileDialog().then(function (path) {
          if (path && window._loadFile) window._loadFile(path);
        });
      }
    });

    addSeparator(menuEl);

    // ── Playback submenu ──
    var playbackSub = addSubmenu(menuEl, 'Playback');
    addItem(playbackSub, paused ? 'Play' : 'Pause', function () {
      if (window._adapter) window._adapter.togglePlay();
    });
    addItem(playbackSub, 'Stop', function () {
      if (window._adapter) window._adapter.stop();
    });
    addItem(playbackSub, 'Restart from Beginning', function () {
      if (window._adapter) window._adapter.seekTo(0);
    });

    addSeparator(playbackSub);

    // Seek sub-submenu
    var seekSub = addSubmenu(playbackSub, 'Seek');
    addItem(seekSub, 'Back 10 seconds', function () {
      if (window._adapter) window._adapter.seekBy(-10);
    });
    addItem(seekSub, 'Back 30 seconds', function () {
      if (window._adapter) window._adapter.seekBy(-30);
    });
    addItem(seekSub, 'Forward 10 seconds', function () {
      if (window._adapter) window._adapter.seekBy(10);
    });
    addItem(seekSub, 'Forward 30 seconds', function () {
      if (window._adapter) window._adapter.seekBy(30);
    });

    // Speed sub-submenu
    var speedSub = addSubmenu(playbackSub, 'Speed');
    var currentSpeed = s.speed || 1.0;
    for (var i = 0; i < SPEED_PRESETS.length; i++) {
      (function (sp) {
        var label = sp + '\u00D7';
        if (Math.abs(sp - currentSpeed) < 0.001) label = '\u2713 ' + label;
        addItem(speedSub, label, function () {
          if (window.TankoPlayer._setSpeed) window.TankoPlayer._setSpeed(sp);
        });
      })(SPEED_PRESETS[i]);
    }
    addSeparator(speedSub);
    addItem(speedSub, '\u21BA 1.0\u00D7', function () {
      if (window.TankoPlayer._setSpeed) window.TankoPlayer._setSpeed(1.0);
    });

    // ── Video submenu ──
    var videoSub = addSubmenu(menuEl, 'Video');

    var aspectSub = addSubmenu(videoSub, 'Aspect Ratio');
    var aspectPresets = [
      ['Default', 'auto'], ['16:9', '16:9'], ['4:3', '4:3'],
      ['21:9', '21:9'], ['2.35:1', '2.35:1'], ['1:1', '1:1'],
    ];
    for (var a = 0; a < aspectPresets.length; a++) {
      (function (label, val) {
        addItem(aspectSub, label, function () {
          if (window._adapter) window._adapter.setAspectRatio(val);
          window.TankoPlayer.toast.show('\u25AD ' + label);
        });
      })(aspectPresets[a][0], aspectPresets[a][1]);
    }

    addItem(videoSub, 'Fullscreen', function () {
      if (window.PlayerBridge && window.PlayerBridge.toggleFullscreen) {
        window.PlayerBridge.toggleFullscreen();
      }
    });

    // ── Audio submenu ──
    var audioSub = addSubmenu(menuEl, 'Audio');
    addItem(audioSub, '(Requires mpv backend)', null, true);

    // ── Subtitles submenu ──
    var subSub = addSubmenu(menuEl, 'Subtitles');
    addItem(subSub, '(Requires mpv backend)', null, true);

    addSeparator(menuEl);
    addItem(menuEl, 'Go to Time\u2026', function () {
      if (window.TankoPlayer._goToTime) window.TankoPlayer._goToTime();
    });

    addSeparator(menuEl);
    addItem(menuEl, 'Show Info', function () {
      if (window.TankoPlayer.diagnostics) window.TankoPlayer.diagnostics.toggle();
    });
    addItem(menuEl, 'Take Screenshot', function () {
      if (window.TankoPlayer._takeScreenshot) window.TankoPlayer._takeScreenshot();
    });

    // Position menu at click point, clamped to viewport
    document.body.appendChild(menuEl);
    var mw = menuEl.offsetWidth;
    var mh = menuEl.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    if (x + mw > vw) x = vw - mw - 4;
    if (y + mh > vh) y = vh - mh - 4;
    if (x < 0) x = 4;
    if (y < 0) y = 4;
    menuEl.style.left = x + 'px';
    menuEl.style.top = y + 'px';
  }

  // ── Menu item builders ──

  function addItem(parent, label, handler, disabled) {
    var item = document.createElement('div');
    item.className = 'ctx-item' + (disabled ? ' ctx-disabled' : '');
    item.textContent = label;
    if (handler && !disabled) {
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        closeMenu();
        handler();
      });
    }
    parent.appendChild(item);
    return item;
  }

  function addSeparator(parent) {
    var sep = document.createElement('div');
    sep.className = 'ctx-separator';
    parent.appendChild(sep);
  }

  function addSubmenu(parent, label) {
    var wrapper = document.createElement('div');
    wrapper.className = 'ctx-submenu-wrapper';

    var trigger = document.createElement('div');
    trigger.className = 'ctx-item ctx-submenu-trigger';
    trigger.textContent = label;

    var arrow = document.createElement('span');
    arrow.className = 'ctx-arrow';
    arrow.textContent = '\u25B6'; // ▶
    trigger.appendChild(arrow);

    var submenu = document.createElement('div');
    submenu.className = 'ctx-menu ctx-submenu';

    wrapper.appendChild(trigger);
    wrapper.appendChild(submenu);
    parent.appendChild(wrapper);

    return submenu;
  }

  function closeMenu() {
    if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    menuEl = null;
    backdrop = null;
  }

  // ── Init ──

  function init() {
    document.getElementById('playerStage').addEventListener('contextmenu', function (e) {
      e.preventDefault();
      var s = window.TankoPlayer.state.get();
      if (!s.fileLoaded) return;
      buildMenu(e.clientX, e.clientY);
    });
  }

  window.TankoPlayer = window.TankoPlayer || {};
  window.TankoPlayer.contextMenu = {
    init: init,
    close: closeMenu,
  };
})();
