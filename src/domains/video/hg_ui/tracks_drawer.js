(function () {
  'use strict';

  function createTracksDrawerController(opts) {
    var o = opts || {};
    var dirty = true;
    var refreshTimer = 0;
    var lastFocus = 'audio';
    var panelKeydownBound = false;

    function getPanel() {
      if (typeof o.panelElProvider === 'function') return o.panelElProvider();
      return null;
    }

    function bindPanelHandlers() {
      if (panelKeydownBound) return;
      var panel = getPanel();
      if (!panel || !panel.addEventListener) return;
      panel.addEventListener('keydown', function (ev) {
        var key = String((ev && ev.key) || '');
        if (key === 'Escape') {
          try { ev.preventDefault(); } catch {}
          try { ev.stopPropagation(); } catch {}
          close({ reason: 'escape' });
        }
      });
      panelKeydownBound = true;
    }

    function isOpen() {
      var panel = getPanel();
      return !!(panel && !panel.classList.contains('hidden'));
    }

    function runRefresh(meta) {
      dirty = false;
      if (typeof o.refreshFn === 'function') {
        try { o.refreshFn(meta || {}); } catch {}
      }
    }

    function refreshSoon(reason) {
      if (!isOpen()) { dirty = true; return; }
      if (refreshTimer) return;
      refreshTimer = setTimeout(function () {
        refreshTimer = 0;
        runRefresh({ reason: reason || 'scheduled' });
      }, 40);
    }

    function markDirty(reason) {
      dirty = true;
      if (isOpen()) refreshSoon(reason || 'dirty');
    }

    function open(meta) {
      var panel = getPanel();
      if (!panel) return;
      bindPanelHandlers();
      if (meta && meta.focus) lastFocus = String(meta.focus);
      panel.classList.remove('hidden');
      if (typeof o.onOpen === 'function') o.onOpen({ focus: lastFocus, reason: (meta && meta.reason) || 'open' });
      if (dirty) runRefresh({ reason: 'open', focus: lastFocus });
      if (typeof o.focusFn === 'function') {
        try { o.focusFn(lastFocus); } catch {}
      }
    }

    function close(meta) {
      var panel = getPanel();
      if (!panel) return;
      panel.classList.add('hidden');
      if (typeof o.onClose === 'function') o.onClose({ reason: (meta && meta.reason) || 'close' });
    }

    function toggle(meta) {
      if (isOpen()) close({ reason: 'toggle' });
      else open(meta || { reason: 'toggle' });
    }

    return {
      isOpen: isOpen,
      open: open,
      close: close,
      toggle: toggle,
      markDirty: markDirty,
      notifyTracksChanged: function () { markDirty('tracks'); },
      notifyDelaysChanged: function () { markDirty('delays'); },
      notifyPlayerLoaded: function () { markDirty('file-loaded'); },
      refreshNow: function () { if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = 0; } runRefresh({ reason: 'manual' }); },
      getLastFocus: function () { return lastFocus; },
    };
  }

  window.TankoHgUi = window.TankoHgUi || {};
  window.TankoHgUi.createTracksDrawerController = createTracksDrawerController;
})();
