(function () {
  'use strict';

  function createPlaylistController(opts) {
    var o = opts || {};
    var triggeredKey = null;

    function markPlayedKey(key) {
      triggeredKey = String(key || '');
    }

    function reset() {
      triggeredKey = null;
    }

    function maybeAdvanceFromEof() {
      if (typeof o.getAutoAdvance !== 'function' || !o.getAutoAdvance()) return false;
      var next = (typeof o.getNextEpisode === 'function') ? o.getNextEpisode() : null;
      if (!next) return false;

      var curKey = (typeof o.getCurrentKey === 'function') ? String(o.getCurrentKey() || '') : '';
      if (curKey && triggeredKey === curKey) return false;
      triggeredKey = curKey || triggeredKey;

      if (typeof o.onOpenEpisode === 'function') {
        o.onOpenEpisode(next);
        return true;
      }
      return false;
    }

    return {
      markPlayedKey: markPlayedKey,
      reset: reset,
      maybeAdvanceFromEof: maybeAdvanceFromEof,
    };
  }

  window.TankoHgUi = window.TankoHgUi || {};
  window.TankoHgUi.createPlaylistController = createPlaylistController;
})();
