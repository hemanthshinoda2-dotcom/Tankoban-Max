(function () {
  'use strict';

  function createContextMenuController(opts) {
    var o = opts || {};
    var isOpen = false;

    function open(x, y) {
      isOpen = true;
      if (typeof o.onOpen === 'function') o.onOpen(x, y);
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      if (typeof o.onClose === 'function') o.onClose();
    }

    return {
      open: open,
      close: close,
      isOpen: function () { return isOpen; },
    };
  }

  window.TankoHgUi = window.TankoHgUi || {};
  window.TankoHgUi.createContextMenuController = createContextMenuController;
})();
