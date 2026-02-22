(function () {
  'use strict';

  function createHudController(opts) {
    var o = opts || {};
    var timer = null;

    function getStage() {
      if (typeof o.stageElProvider === 'function') return o.stageElProvider();
      return null;
    }

    function clearTimer() {
      if (timer) clearTimeout(timer);
      timer = null;
    }

    function show() {
      var stage = getStage();
      if (!stage) return;
      stage.classList.add('showHud');
      clearTimer();

      var blocking = (typeof o.isBlocking === 'function') ? !!o.isBlocking() : false;
      var playing = (typeof o.getPlaying === 'function') ? !!o.getPlaying() : false;
      if (blocking || !playing) return;

      timer = setTimeout(function () {
        var s = getStage();
        if (!s) return;
        var stillBlocking = (typeof o.isBlocking === 'function') ? !!o.isBlocking() : false;
        if (stillBlocking) return;
        s.classList.remove('showHud');
        if (typeof o.onHide === 'function') o.onHide();
      }, Number(o.hideMs) > 0 ? Number(o.hideMs) : 2800);
    }

    function hideNow() {
      var stage = getStage();
      if (!stage) return;
      clearTimer();
      stage.classList.remove('showHud');
      if (typeof o.onHide === 'function') o.onHide();
    }

    return {
      show: show,
      hideNow: hideNow,
      destroy: hideNow,
    };
  }

  window.TankoHgUi = window.TankoHgUi || {};
  window.TankoHgUi.createHudController = createHudController;
})();
