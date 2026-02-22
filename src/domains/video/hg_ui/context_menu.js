(function () {
  'use strict';

  function createContextMenuController(opts) {
    var o = opts || {};
    var isOpen = false;
    var lastPos = { x: 0, y: 0 };
    var lastOpenAt = 0;
    var bound = false;

    function menuEl() {
      try {
        return (typeof o.menuElProvider === 'function') ? (o.menuElProvider() || null) : null;
      } catch (_) {
        return null;
      }
    }

    function bindGlobal() {
      if (bound || typeof document === 'undefined') return;
      bound = true;
      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('blur', onWindowBlur);
      window.addEventListener('resize', onWindowResize);
      window.addEventListener('scroll', onWindowResize, true);
    }

    function unbindGlobal() {
      if (!bound || typeof document === 'undefined') return;
      bound = false;
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('scroll', onWindowResize, true);
    }

    function onPointerDown(e) {
      if (!isOpen) return;
      var target = e && e.target;
      var m = menuEl();
      if (m && target && typeof target.closest === 'function') {
        if (target === m || target.closest('#videoCtxMenu') || target.closest('.ctxSubmenuPanel')) return;
      }
      close();
    }

    function onKeyDown(e) {
      if (!isOpen) return;
      var key = String((e && e.key) || '');
      if (key === 'Escape') {
        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
        close();
      }
    }

    function onWindowBlur() {
      if (!isOpen) return;
      close();
    }

    function onWindowResize() {
      if (!isOpen) return;
      if (typeof o.onReposition === 'function') {
        try { o.onReposition(lastPos.x, lastPos.y); return; } catch (_) {}
      }
      if (typeof o.onOpen === 'function') {
        try { o.onOpen(lastPos.x, lastPos.y); } catch (_) {}
      }
    }

    function open(x, y) {
      lastPos.x = Number(x) || 0;
      lastPos.y = Number(y) || 0;
      lastOpenAt = Date.now();
      isOpen = true;
      bindGlobal();
      if (typeof o.onOpen === 'function') o.onOpen(lastPos.x, lastPos.y);
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      unbindGlobal();
      if (typeof o.onClose === 'function') o.onClose();
    }

    function toggle(x, y) {
      var nx = Number(x) || 0;
      var ny = Number(y) || 0;
      if (isOpen) {
        var dx = Math.abs(nx - lastPos.x);
        var dy = Math.abs(ny - lastPos.y);
        if (dx <= 6 && dy <= 6 && Date.now() - lastOpenAt < 600) {
          close();
          return;
        }
      }
      open(nx, ny);
    }

    function syncOpen(x, y) {
      lastPos.x = Number(x) || lastPos.x || 0;
      lastPos.y = Number(y) || lastPos.y || 0;
      lastOpenAt = Date.now();
      isOpen = true;
      bindGlobal();
    }

    function syncClosed() {
      isOpen = false;
      unbindGlobal();
    }

    return {
      open: open,
      close: close,
      toggle: toggle,
      syncOpen: syncOpen,
      syncClosed: syncClosed,
      getLastPosition: function () { return { x: lastPos.x, y: lastPos.y }; },
      isOpen: function () { return isOpen; }
    };
  }

  window.TankoHgUi = window.TankoHgUi || {};
  window.TankoHgUi.createContextMenuController = createContextMenuController;
})();
