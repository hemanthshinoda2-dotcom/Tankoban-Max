(function () {
  'use strict';

  function setHudVisibleClass(stageEl, isVisible) {
    if (!stageEl || !stageEl.classList) return;
    stageEl.classList.toggle('showHud', !!isVisible);
  }

  function createHudController(opts) {
    var o = opts || {};
    var hideTimer = 0;
    var cursorHideTimer = 0;
    var scrubbing = false;
    var lastY = null;

    function getStage() {
      if (typeof o.stageElProvider === 'function') return o.stageElProvider();
      return null;
    }

    function getFlag(fnName, fallback) {
      try {
        if (typeof o[fnName] === 'function') return !!o[fnName]();
      } catch {}
      return !!fallback;
    }

    function hideDelayMs() {
      var v = Number(o.hideDelayMs);
      return Number.isFinite(v) && v >= 0 ? v : 1600;
    }

    function cursorDelayMs() {
      var v = Number(o.cursorHideDelayMs);
      return Number.isFinite(v) && v >= 0 ? v : 120;
    }

    function revealTopPx() {
      var v = Number(o.revealTopPx);
      return Number.isFinite(v) && v >= 0 ? v : 72;
    }

    function revealBottomPx() {
      var v = Number(o.revealBottomPx);
      return Number.isFinite(v) && v >= 0 ? v : 72;
    }

    function hysteresisPx() {
      var v = Number(o.hysteresisPx);
      return Number.isFinite(v) && v >= 0 ? v : 28;
    }

    function clearHideTimer() {
      if (hideTimer) {
        try { clearTimeout(hideTimer); } catch {}
        hideTimer = 0;
      }
      try {
        if (typeof o.onDisarmHideTimer === 'function') o.onDisarmHideTimer();
      } catch {}
    }

    function clearCursorHideTimer() {
      if (cursorHideTimer) {
        try { clearTimeout(cursorHideTimer); } catch {}
        cursorHideTimer = 0;
      }
    }

    function canHide() {
      if (getFlag('getUiHidden', false)) return false;
      if (getFlag('getKeepVisible', false)) return false;
      if (scrubbing) return false;
      if (getFlag('getHasBlockingOverlay', false)) return false;
      return true;
    }

    function scheduleCursorHide() {
      clearCursorHideTimer();
      if (!getFlag('getIsFullscreen', false)) return;
      if (!getFlag('getIsPlaying', false)) return;
      if (!canHide()) return;
      var stage = getStage();
      if (!stage) return;
      cursorHideTimer = setTimeout(function () {
        cursorHideTimer = 0;
        if (!canHide()) return;
        if (!getFlag('getIsFullscreen', false)) return;
        if (!getFlag('getIsPlaying', false)) return;
        try { stage.classList.add('hideCursor'); } catch {}
      }, cursorDelayMs());
    }

    function show(meta) {
      if (getFlag('getUiHidden', false)) return false;
      var stage = getStage();
      if (!stage) return false;

      clearHideTimer();
      clearCursorHideTimer();

      try {
        if (typeof o.onBeforeShow === 'function') o.onBeforeShow(meta || {});
      } catch {}

      try { stage.classList.remove('hideCursor'); } catch {}
      setHudVisibleClass(stage, true);

      try {
        if (typeof o.onAfterShow === 'function') o.onAfterShow(meta || {});
      } catch {}

      armAutoHide(meta || {});
      return true;
    }

    function hideNow(meta) {
      var stage = getStage();
      clearHideTimer();
      clearCursorHideTimer();
      if (!stage) return false;
      if (getFlag('getUiHidden', false)) return false;
      if (!canHide()) return false;

      setHudVisibleClass(stage, false);
      scheduleCursorHide();

      try {
        if (typeof o.onAfterHide === 'function') o.onAfterHide(meta || {});
      } catch {}
      return true;
    }

    function armAutoHide(meta) {
      clearHideTimer();
      if (!canHide()) return false;
      if (!getFlag('getIsPlaying', false)) return false;
      hideTimer = setTimeout(function () {
        hideTimer = 0;
        hideNow(meta || {});
      }, hideDelayMs());
      try {
        if (typeof o.onArmHideTimer === 'function') o.onArmHideTimer(meta || {});
      } catch {}
      return true;
    }

    function scheduleHide(meta) {
      return armAutoHide(meta);
    }

    function markPointerMove(ev) {
      if (!ev || typeof ev.clientY !== 'number') {
        lastY = null;
        return;
      }
      lastY = Number(ev.clientY);
      clearCursorHideTimer();
      var stage = getStage();
      try { stage && stage.classList && stage.classList.remove('hideCursor'); } catch {}
    }

    function shouldRevealFromPointer(ev) {
      if (!ev || typeof ev.clientY !== 'number') return false;
      if (getFlag('getUiHidden', false)) return false;
      if (!getFlag('getIsFullscreen', false)) return true;
      var stage = getStage();
      if (!stage || typeof stage.getBoundingClientRect !== 'function') return false;
      var rect = stage.getBoundingClientRect();
      var y = Number(ev.clientY);
      var topZone = rect.top + revealTopPx();
      var bottomZone = rect.bottom - revealBottomPx();
      if (y <= topZone || y >= bottomZone) return true;
      if (lastY != null) {
        var dy = Math.abs(y - lastY);
        if (dy <= hysteresisPx()) {
          var showing = !!(stage.classList && stage.classList.contains('showHud'));
          if (showing) return true;
        }
      }
      return false;
    }

    function beginScrub() {
      scrubbing = true;
      clearHideTimer();
      clearCursorHideTimer();
      var stage = getStage();
      try { stage && stage.classList && stage.classList.remove('hideCursor'); } catch {}
      show({ reason: 'scrub-begin' });
    }

    function endScrub() {
      scrubbing = false;
      show({ reason: 'scrub-end' });
    }

    function destroy() {
      clearHideTimer();
      clearCursorHideTimer();
      lastY = null;
      scrubbing = false;
    }

    return {
      show: show,
      hideNow: hideNow,
      armAutoHide: armAutoHide,
      scheduleHide: scheduleHide,
      clearHideTimer: clearHideTimer,
      markPointerMove: markPointerMove,
      shouldRevealFromPointer: shouldRevealFromPointer,
      beginScrub: beginScrub,
      endScrub: endScrub,
      destroy: destroy,
      isScrubbing: function () { return !!scrubbing; },
    };
  }

  window.TankoHgUi = window.TankoHgUi || {};
  window.TankoHgUi.setHudVisibleClass = setHudVisibleClass;
  window.TankoHgUi.createHudController = createHudController;
})();
