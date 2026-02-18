// Books reader TTS engine: Edge neural bridge over main process IPC (FIX-TTS02)
// Rewritten to use HTMLAudioElement for reliable pause/resume (replaces AudioContext).
(function () {
  'use strict';

  window.booksTTSEngines = window.booksTTSEngines || {};

  function base64ToBlob(b64, mime) {
    try {
      var bin = atob(String(b64 || ''));
      var len = bin.length;
      var bytes = new Uint8Array(len);
      for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime || 'audio/mpeg' });
    } catch {
      return null;
    }
  }

  function create() {
    var state = {
      audio: null,
      abortCtrl: null,
      blobUrl: null,
      rate: 1.0,
      pitch: 1.0,
      voiceName: 'en-US-AriaNeural',
      playing: false,
      paused: false,
      requestId: '',
      voiceList: [],
      health: {
        known: false,
        available: false,
        reason: 'edge_probe_uninitialized',
      },
      onBoundary: null,
      onEnd: null,
      onError: null,
      onDiag: null,
      lastDiag: {
        code: '',
        detail: '',
      },
    };

    // GAP3: Preload cache — synthesize next sentences while current plays
    var _preCache = {};
    var _preCacheCount = 0;
    var MAX_PRECACHE = 6;

    function _preCacheKey(text) {
      return state.voiceName + '|' + state.rate + '|' + state.pitch + '|' + text;
    }

    function clearPreloadCache() {
      var keys = Object.keys(_preCache);
      for (var i = 0; i < keys.length; i++) {
        var entry = _preCache[keys[i]];
        if (entry && entry.blobUrl) {
          try { URL.revokeObjectURL(entry.blobUrl); } catch {}
        }
      }
      _preCache = {};
      _preCacheCount = 0;
    }

    async function preload(text) {
      var t = String(text || '').trim();
      if (!t) return;
      var key = _preCacheKey(t);
      if (_preCache[key]) return;
      try {
        var api = window.Tanko && window.Tanko.api && window.Tanko.api.booksTtsEdge;
        if (!api || typeof api.synth !== 'function') return;
        var res = await api.synth({
          text: t,
          voice: state.voiceName,
          rate: state.rate,
          pitch: state.pitch,
        });
        if (!res || !res.ok || !res.audioBase64) return;
        var blob = base64ToBlob(res.audioBase64, 'audio/mpeg');
        if (!blob) return;
        // Evict oldest if full
        if (_preCacheCount >= MAX_PRECACHE) {
          var cacheKeys = Object.keys(_preCache);
          if (cacheKeys.length) {
            var evicted = _preCache[cacheKeys[0]];
            if (evicted && evicted.blobUrl) {
              try { URL.revokeObjectURL(evicted.blobUrl); } catch {}
            }
            delete _preCache[cacheKeys[0]];
            _preCacheCount--;
          }
        }
        _preCache[key] = { blob: blob, blobUrl: null, boundaries: res.boundaries || [] };
        _preCacheCount++;
      } catch {}
    }

    function diag(code, detail) {
      state.lastDiag = { code: String(code || ''), detail: String(detail || '') };
      if (typeof state.onDiag === 'function') {
        try { state.onDiag({ code: state.lastDiag.code, detail: state.lastDiag.detail }); } catch {}
      }
    }

    function ensureAudio() {
      if (!state.audio) {
        try {
          state.audio = new Audio();
          state.audio.preload = 'auto';
        } catch {
          state.audio = null;
        }
      }
      return state.audio;
    }

    // FIX-TTS02: Revoke old blob URL to prevent memory leaks
    function _revokeBlobUrl() {
      if (state.blobUrl) {
        try { URL.revokeObjectURL(state.blobUrl); } catch {}
        state.blobUrl = null;
      }
    }

    async function loadVoices(opts) {
      diag('edge_voices_fetch_start', '');
      try {
        var api = window.Tanko && window.Tanko.api && window.Tanko.api.booksTtsEdge;
        if (!api || typeof api.getVoices !== 'function') {
          state.voiceList = [];
          diag('edge_voices_fetch_fail', 'booksTtsEdge_api_missing');
          return state.voiceList;
        }
        var res = await api.getVoices(opts || {});
        if (res && res.ok && Array.isArray(res.voices) && res.voices.length) {
          state.voiceList = res.voices.slice();
          diag('edge_voices_fetch_ok', String(state.voiceList.length));
          return state.voiceList;
        }
        state.voiceList = [];
        diag('edge_voices_fetch_fail', String(res && (res.reason || 'voices_empty') || 'voices_fetch_failed'));
        return state.voiceList;
      } catch (err) {
        state.voiceList = [];
        diag('edge_voices_fetch_fail', String(err && err.message ? err.message : err));
        return state.voiceList;
      }
    }

    async function probe(payload) {
      diag('edge_probe_start', '');
      try {
        var api = window.Tanko && window.Tanko.api && window.Tanko.api.booksTtsEdge;
        if (!api || typeof api.probe !== 'function') {
          state.health.known = true;
          state.health.available = false;
          state.health.reason = 'edge_probe_api_missing';
          diag('edge_probe_fail', state.health.reason);
          return state.health.available;
        }
        // FIX-R08: strict probe requires successful synthesis payload, not voices-only success.
        var probeReq = Object.assign({ requireSynthesis: true, timeoutMs: 10000 }, payload || {});
        var res = await api.probe(probeReq);
        var ok = !!(res && res.ok && res.available);
        state.health.known = true;
        state.health.available = ok;
        state.health.reason = ok ? 'edge_probe_ok' : String(res && res.reason || 'edge_probe_failed');
        diag(ok ? 'edge_probe_ok' : 'edge_probe_fail', state.health.reason);
        if (ok) {
          await loadVoices({ maxAgeMs: 0 });
        } else if (res && res.details && res.details.synth && res.details.synth.errorCode) {
          diag('edge_probe_fail', String(res.details.synth.errorCode || state.health.reason));
        }
        return ok;
      } catch (err) {
        state.health.known = true;
        state.health.available = false;
        state.health.reason = String(err && err.message ? err.message : err);
        diag('edge_probe_fail', state.health.reason);
        return false;
      }
    }

    function getVoices() {
      if (!state.voiceList.length) return [];
      return state.voiceList.map(function (v) {
        return {
          voiceURI: String(v.voiceURI || v.name || ''),
          name: String(v.name || v.voiceURI || ''),
          lang: String(v.lang || ''),
          gender: String(v.gender || ''),
          localService: false,
          default: !!v.default,
          engine: 'edge',
        };
      }).filter(function (v) { return !!v.voiceURI; });
    }

    function setRate(rate) {
      state.rate = Math.max(0.5, Math.min(2.0, Number(rate) || 1.0));
    }

    function setPitch(pitch) {
      state.pitch = Math.max(0.5, Math.min(2.0, Number(pitch) || 1.0));
    }

    function setVoice(voiceURI) {
      state.voiceName = String(voiceURI || 'en-US-AriaNeural');
    }

    // FIX-TTS02: Boundary timers now also check AbortController signal
    function fireBoundaries(reqId, boundaries, spokenText) {
      var list = Array.isArray(boundaries) ? boundaries : [];
      var txt = String(spokenText || '');
      var searchFrom = 0;
      for (var i = 0; i < list.length; i++) {
        var word = list[i] && list[i].text || '';
        var charIndex = 0;
        var charLength = 0;
        if (word && txt) {
          var idx = txt.indexOf(word, searchFrom);
          if (idx >= 0) {
            charIndex = idx;
            charLength = word.length;
            searchFrom = idx + word.length;
          }
        }
        (function (b, ci, cl) {
          var delay = Math.max(0, Number(b && b.offsetMs || 0));
          setTimeout(function () {
            if (reqId !== state.requestId) return;
            if (!state.playing || state.paused) return;
            if (state.abortCtrl && state.abortCtrl.signal.aborted) return;
            if (typeof state.onBoundary === 'function') {
              try { state.onBoundary(ci, cl, 'word'); } catch {}
            }
          }, delay);
        })(list[i], charIndex, charLength);
      }
    }

    // FIX-TTS02: Play a Blob via HTMLAudioElement (replaces _playBuffer)
    function _playBlob(myReq, blob, boundaries, text) {
      var audio = ensureAudio();
      if (!audio) {
        state.playing = false;
        diag('edge_play_fail', 'no_audio_element');
        if (typeof state.onError === 'function') state.onError({ error: 'edge_play_fail', stage: 'edge_play', reason: 'no_audio_element' });
        return;
      }

      _revokeBlobUrl();
      state.blobUrl = URL.createObjectURL(blob);
      audio.src = state.blobUrl;

      audio.onended = function () {
        if (myReq !== state.requestId) return;
        state.playing = false;
        state.paused = false;
        diag('edge_play_ok', '');
        if (typeof state.onEnd === 'function') state.onEnd();
      };

      audio.onerror = function () {
        if (myReq !== state.requestId) return;
        state.playing = false;
        var reason = audio.error ? String(audio.error.message || audio.error.code || 'unknown') : 'unknown';
        diag('edge_play_fail', reason);
        if (typeof state.onError === 'function') state.onError({ error: 'edge_play_fail', stage: 'edge_play', reason: reason });
      };

      fireBoundaries(myReq, boundaries, text);

      try {
        var playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(function (err) {
            if (myReq !== state.requestId) return;
            state.playing = false;
            diag('edge_play_fail', String(err && err.message ? err.message : err));
            if (typeof state.onError === 'function') state.onError({ error: 'edge_play_fail', stage: 'edge_play', reason: String(err && err.message ? err.message : err) });
          });
        }
      } catch (err) {
        state.playing = false;
        diag('edge_play_fail', String(err && err.message ? err.message : err));
        if (typeof state.onError === 'function') state.onError({ error: 'edge_play_fail', stage: 'edge_play', reason: String(err && err.message ? err.message : err) });
      }
    }

    // FIX-TTS02: IPC synth with timeout to prevent hanging
    function _synthWithTimeout(api, payload, timeoutMs) {
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          reject(new Error('edge_synth_timeout'));
        }, timeoutMs || 15000);
        api.synth(payload).then(function (res) {
          clearTimeout(timer);
          resolve(res);
        }).catch(function (err) {
          clearTimeout(timer);
          reject(err);
        });
      });
    }

    async function speak(text) {
      cancel();
      var t = String(text || '').trim();
      if (!t) return;

      state.playing = true;
      state.paused = false;
      state.requestId = Math.random().toString(36).slice(2);
      state.abortCtrl = new AbortController();
      var myReq = state.requestId;
      var signal = state.abortCtrl.signal;

      // GAP3: check preload cache first
      var cacheKey = _preCacheKey(t);
      var cached = _preCache[cacheKey];
      if (cached) {
        delete _preCache[cacheKey];
        _preCacheCount--;
        diag('edge_preload_hit', '');
        _playBlob(myReq, cached.blob, cached.boundaries, t);
        if (cached.blobUrl) {
          try { URL.revokeObjectURL(cached.blobUrl); } catch {}
        }
        return;
      }

      diag('edge_ws_open_start', '');
      try {
        var api = window.Tanko && window.Tanko.api && window.Tanko.api.booksTtsEdge;
        if (!api || typeof api.synth !== 'function') {
          state.playing = false;
          diag('edge_ws_open_fail', 'booksTtsEdge_api_missing');
          if (typeof state.onError === 'function') state.onError({ error: 'edge_ws_open_fail', stage: 'edge_ws_open', reason: 'booksTtsEdge_api_missing' });
          return;
        }

        // FIX-TTS02: Use timeout wrapper to prevent hanging on slow Edge service
        var res = await _synthWithTimeout(api, {
          text: t,
          voice: state.voiceName,
          rate: state.rate,
          pitch: state.pitch,
        }, 15000);
        if (signal.aborted || myReq !== state.requestId) return;

        if (!res || !res.ok || !res.audioBase64) {
          state.playing = false;
          var code = String(res && (res.errorCode || res.reason) || 'edge_audio_chunk_recv_none');
          diag(code, String(res && res.reason || 'synth_failed'));
          if (typeof state.onError === 'function') state.onError({ error: code, stage: 'edge_synth', reason: String(res && res.reason || '') });
          return;
        }

        diag('edge_audio_chunk_recv_ok', '');
        var blob = base64ToBlob(res.audioBase64, 'audio/mpeg');
        if (!blob) {
          state.playing = false;
          diag('edge_decode_fail', 'invalid_audio_payload');
          if (typeof state.onError === 'function') state.onError({ error: 'edge_decode_fail', stage: 'edge_decode', reason: 'invalid_audio_payload' });
          return;
        }
        if (signal.aborted || myReq !== state.requestId) return;
        diag('edge_decode_ok', '');

        _playBlob(myReq, blob, res.boundaries || [], t);
      } catch (err3) {
        if (signal.aborted || myReq !== state.requestId) return;
        state.playing = false;
        diag('edge_ws_open_fail', String(err3 && err3.message ? err3.message : err3));
        if (typeof state.onError === 'function') state.onError({ error: 'edge_ws_open_fail', stage: 'edge_ws_open', reason: String(err3 && err3.message ? err3.message : err3) });
      }
    }

    // FIX-TTS03: Gapless re-speak — keep current audio playing until new audio is ready
    async function speakGapless(text) {
      var t = String(text || '').trim();
      if (!t) return;
      // Abort any previous in-flight requests but do NOT stop current audio
      if (state.abortCtrl) {
        try { state.abortCtrl.abort(); } catch {}
      }
      var newReqId = Math.random().toString(36).slice(2);
      state.requestId = newReqId;
      state.abortCtrl = new AbortController();
      var signal = state.abortCtrl.signal;

      // Check preload cache first
      var cacheKey = _preCacheKey(t);
      var cached = _preCache[cacheKey];
      if (cached) {
        delete _preCache[cacheKey];
        _preCacheCount--;
        diag('edge_preload_hit', '');
        _playBlob(newReqId, cached.blob, cached.boundaries, t);
        if (cached.blobUrl) {
          try { URL.revokeObjectURL(cached.blobUrl); } catch {}
        }
        return;
      }

      // Synthesize in background while old audio keeps playing
      try {
        var api = window.Tanko && window.Tanko.api && window.Tanko.api.booksTtsEdge;
        if (!api || typeof api.synth !== 'function') return;
        var res = await _synthWithTimeout(api, {
          text: t,
          voice: state.voiceName,
          rate: state.rate,
          pitch: state.pitch,
        }, 15000);
        if (signal.aborted || newReqId !== state.requestId) return;
        if (!res || !res.ok || !res.audioBase64) return;
        var blob = base64ToBlob(res.audioBase64, 'audio/mpeg');
        if (!blob) return;
        if (signal.aborted || newReqId !== state.requestId) return;
        // Now hot-swap: replace old audio with new
        _playBlob(newReqId, blob, res.boundaries || [], t);
      } catch {}
    }

    // FIX-TTS02: Pause is now synchronous via HTMLAudioElement.pause()
    function pause() {
      if (!state.audio || !state.playing || state.paused) return;
      state.audio.pause();
      state.paused = true;
    }

    // FIX-TTS02: Resume via HTMLAudioElement.play()
    function resume() {
      if (!state.audio || !state.paused) return;
      try {
        var playPromise = state.audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(function () {});
        }
      } catch {}
      state.paused = false;
    }

    function cancel() {
      // FIX-TTS02: Abort any in-flight IPC requests
      if (state.abortCtrl) {
        try { state.abortCtrl.abort(); } catch {}
        state.abortCtrl = null;
      }
      state.requestId = '';
      state.playing = false;
      state.paused = false;
      if (state.audio) {
        try { state.audio.pause(); } catch {}
        try { state.audio.removeAttribute('src'); } catch {}
        try { state.audio.load(); } catch {}
      }
      _revokeBlobUrl();
    }

    function isSpeaking() {
      return !!(state.playing && !state.paused);
    }

    function isPaused() {
      return !!state.paused;
    }

    function isAvailable() {
      return !!(state.health && state.health.known && state.health.available);
    }

    function getHealth() {
      return {
        known: !!state.health.known,
        available: !!state.health.available,
        reason: String(state.health.reason || ''),
      };
    }

    function getLastDiag() {
      return {
        code: String(state.lastDiag.code || ''),
        detail: String(state.lastDiag.detail || ''),
      };
    }

    return {
      getVoices: getVoices,
      setRate: setRate,
      setVoice: setVoice,
      setPitch: setPitch,
      speak: speak,
      speakGapless: speakGapless, // FIX-TTS03: keeps old audio until new is ready
      pause: pause,
      resume: resume,
      cancel: cancel,
      preload: preload,
      clearPreloadCache: clearPreloadCache,
      isSpeaking: isSpeaking,
      isPaused: isPaused,
      isAvailable: isAvailable,
      probe: probe,
      loadVoices: loadVoices,
      getHealth: getHealth,
      getLastDiag: getLastDiag,
      engineId: 'edge',
      set onBoundary(fn) { state.onBoundary = (typeof fn === 'function') ? fn : null; },
      set onEnd(fn) { state.onEnd = (typeof fn === 'function') ? fn : null; },
      set onError(fn) { state.onError = (typeof fn === 'function') ? fn : null; },
      set onDiag(fn) { state.onDiag = (typeof fn === 'function') ? fn : null; },
    };
  }

  window.booksTTSEngines.edge = { create: create };
})();
