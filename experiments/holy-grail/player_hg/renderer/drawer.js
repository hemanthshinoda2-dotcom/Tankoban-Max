// Slide Drawer — base component for right-edge drawers.
// Matches Qt player's SlideDrawer (run_player.py lines 2055-2175).
(function () {
  'use strict';

  var DRAWER_WIDTH = 420;
  var DRAWER_TOP = 50;
  var DRAWER_BOTTOM = 50;
  var SLIDE_MS = 180;

  // Creates a drawer element and returns a controller object.
  // opts: { id, title, side ('right'), onClose }
  function createDrawer(opts) {
    var id = opts.id || 'drawer';
    var side = opts.side || 'right';
    var root = window.TankoPlayer._root || document;
    var stageEl = root.getElementById('playerStage');

    var el = document.createElement('div');
    el.id = id;
    el.className = 'drawer-panel';
    el.style.display = 'none';

    // Header
    var header = document.createElement('div');
    header.className = 'drawer-header';

    var titleEl = document.createElement('span');
    titleEl.className = 'drawer-title';
    titleEl.textContent = opts.title || '';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'drawer-close-btn';
    closeBtn.textContent = '\u2715'; // ✕
    closeBtn.title = 'Close';

    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    el.appendChild(header);

    // Content area (caller fills this)
    var contentEl = document.createElement('div');
    contentEl.className = 'drawer-content';
    el.appendChild(contentEl);

    stageEl.appendChild(el);

    var isOpen = false;

    function positionDrawer() {
      var stageRect = stageEl.getBoundingClientRect();
      var height = Math.max(100, stageRect.height - DRAWER_TOP - DRAWER_BOTTOM);
      el.style.top = DRAWER_TOP + 'px';
      el.style.height = height + 'px';
      el.style.width = DRAWER_WIDTH + 'px';
      if (side === 'right') {
        el.style.right = '0';
        el.style.left = 'auto';
      } else {
        el.style.left = '0';
        el.style.right = 'auto';
      }
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      positionDrawer();
      el.style.display = '';
      el.style.transition = 'transform ' + SLIDE_MS + 'ms ease';
      if (side === 'right') {
        el.style.transform = 'translateX(100%)';
        void el.offsetWidth;
        el.style.transform = 'translateX(0)';
      } else {
        el.style.transform = 'translateX(-100%)';
        void el.offsetWidth;
        el.style.transform = 'translateX(0)';
      }
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      el.style.transition = 'transform ' + SLIDE_MS + 'ms ease';
      if (side === 'right') {
        el.style.transform = 'translateX(100%)';
      } else {
        el.style.transform = 'translateX(-100%)';
      }
      setTimeout(function () {
        if (!isOpen) el.style.display = 'none';
      }, SLIDE_MS);
    }

    function toggle() {
      if (isOpen) close();
      else open();
    }

    closeBtn.addEventListener('click', function () {
      close();
      if (opts.onClose) opts.onClose();
    });

    return {
      el: el,
      contentEl: contentEl,
      open: open,
      close: close,
      toggle: toggle,
      isOpen: function () { return isOpen; },
    };
  }

  window.TankoPlayer = window.TankoPlayer || {};
  window.TankoPlayer.createDrawer = createDrawer;
})();
