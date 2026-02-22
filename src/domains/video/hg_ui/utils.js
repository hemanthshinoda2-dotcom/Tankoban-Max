(function () {
  'use strict';

  function clamp(n, lo, hi) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function toFiniteNumber(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : Number(fallback || 0);
  }

  function fmtTime(sec) {
    var s = Math.floor(Math.max(0, toFiniteNumber(sec, 0)));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var r = s % 60;
    if (h > 0) {
      var mm = m < 10 ? '0' + m : String(m);
      var ss = r < 10 ? '0' + r : String(r);
      return String(h) + ':' + mm + ':' + ss;
    }
    var s2 = r < 10 ? '0' + r : String(r);
    return String(m) + ':' + s2;
  }

  function naturalCompare(a, b) {
    return String(a || '').localeCompare(String(b || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }

  window.TankoHgUi = window.TankoHgUi || {};
  window.TankoHgUi.utils = {
    clamp: clamp,
    toFiniteNumber: toFiniteNumber,
    fmtTime: fmtTime,
    naturalCompare: naturalCompare,
  };
})();
