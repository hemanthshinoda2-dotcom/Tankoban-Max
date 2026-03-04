// Shared helpers — time formatting, clamping, type coercion.
(function () {
  'use strict';

  /**
   * Format seconds as m:ss or h:mm:ss.
   * Matches Qt player's _fmt_time (run_player.py line 350).
   */
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    var totalSec = Math.floor(sec);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    var sPad = s < 10 ? '0' + s : '' + s;
    if (h > 0) {
      var mPad = m < 10 ? '0' + m : '' + m;
      return h + ':' + mPad + ':' + sPad;
    }
    return m + ':' + sPad;
  }

  function clamp(n, lo, hi) {
    return n < lo ? lo : n > hi ? hi : n;
  }

  /**
   * Coerce to a finite number, returning fallback if NaN/Infinity.
   * Matches holy_grail_adapter.js line 17.
   */
  function toFiniteNumber(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : (fallback || 0);
  }

  /**
   * Natural sort key — splits string into text/number segments
   * so "episode2" sorts before "episode10".
   * Matches Qt player's _natural_sort_key (run_player.py line 388).
   */
  function naturalSortKey(str) {
    if (!str) return [''];
    return str.toLowerCase().split(/(\d+)/).map(function (part) {
      var n = parseInt(part, 10);
      return isNaN(n) ? part : n;
    });
  }

  function naturalCompare(a, b) {
    var ka = naturalSortKey(a);
    var kb = naturalSortKey(b);
    var len = Math.min(ka.length, kb.length);
    for (var i = 0; i < len; i++) {
      var ai = ka[i], bi = kb[i];
      if (typeof ai === 'number' && typeof bi === 'number') {
        if (ai !== bi) return ai - bi;
      } else {
        var sa = String(ai), sb = String(bi);
        if (sa !== sb) return sa < sb ? -1 : 1;
      }
    }
    return ka.length - kb.length;
  }

  window.TankoPlayer = window.TankoPlayer || {};
  window.TankoPlayer.utils = {
    fmtTime: fmtTime,
    clamp: clamp,
    toFiniteNumber: toFiniteNumber,
    naturalSortKey: naturalSortKey,
    naturalCompare: naturalCompare,
  };
})();
