(function () {
  'use strict';

  function createTracksDrawerController(opts) {
    var o = opts || {};

    function getPanel() {
      if (typeof o.panelElProvider === 'function') return o.panelElProvider();
      return null;
    }

    function isOpen() {
      var panel = getPanel();
      return !!(panel && !panel.classList.contains('hidden'));
    }

    function open() {
      var panel = getPanel();
      if (!panel) return;
      panel.classList.remove('hidden');
      if (typeof o.onOpen === 'function') o.onOpen();
    }

    function close() {
      var panel = getPanel();
      if (!panel) return;
      panel.classList.add('hidden');
      if (typeof o.onClose === 'function') o.onClose();
    }

    function toggle() {
      if (isOpen()) close();
      else open();
    }

    return {
      isOpen: isOpen,
      open: open,
      close: close,
      toggle: toggle,
    };
  }

  window.TankoHgUi = window.TankoHgUi || {};
  window.TankoHgUi.createTracksDrawerController = createTracksDrawerController;
})();
