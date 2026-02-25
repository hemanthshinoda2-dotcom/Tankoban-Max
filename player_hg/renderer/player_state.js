// Centralized state store + event emitter.
// State shape matches holy_grail_adapter.js createDefaultState() (line 68).
(function () {
  'use strict';

  // ── Event emitter (same pattern as holy_grail_adapter.js createEmitter) ──

  function createEmitter() {
    var listeners = new Map();
    return {
      on: function (event, handler) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
        return function off() {
          var set = listeners.get(event);
          if (set) set.delete(handler);
        };
      },
      emit: function (event) {
        var args = Array.prototype.slice.call(arguments, 1);
        var set = listeners.get(event);
        if (!set) return;
        set.forEach(function (fn) {
          try { fn.apply(null, args); } catch (e) { console.error('[state] event handler error:', event, e); }
        });
      },
      clear: function () {
        listeners.clear();
      },
    };
  }

  // ── Default state ──

  function createDefaultState() {
    return {
      ready: false,
      paused: true,
      timeSec: 0,
      durationSec: 0,
      volume: 1,
      muted: false,
      speed: 1,
      eofReached: false,
      subtitlesVisible: true,
      subtitleTrackId: null,
      audioTrackId: null,
      audioDelaySec: 0,
      subtitleDelaySec: 0,
      width: 0,
      height: 0,
      aspectRatio: 'auto',
      crop: 'none',
      renderQuality: 'auto',
      subtitleHudLiftPx: 40,
      trackList: [],
      chapterList: [],
      // UI-only state
      controlsVisible: false,
      fullscreen: false,
      fileLoaded: false,
      filePath: null,
    };
  }

  // ── Player state singleton ──

  var emitter = createEmitter();
  var state = createDefaultState();

  function getState() {
    return state;
  }

  function setState(partial) {
    var changed = [];
    for (var key in partial) {
      if (partial.hasOwnProperty(key) && state[key] !== partial[key]) {
        state[key] = partial[key];
        changed.push(key);
      }
    }
    if (changed.length > 0) {
      emitter.emit('state-changed', changed, state);
    }
    return changed;
  }

  function resetState() {
    state = createDefaultState();
    emitter.emit('state-changed', Object.keys(state), state);
  }

  window.TankoPlayer = window.TankoPlayer || {};
  window.TankoPlayer.state = {
    get: getState,
    set: setState,
    reset: resetState,
    on: emitter.on,
    emit: emitter.emit,
    clear: emitter.clear,
  };
})();
