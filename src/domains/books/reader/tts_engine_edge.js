// Books reader TTS engine: Edge neural bridge over main process IPC (FIX-R08)
(function () {
  'use strict';

  window.booksTTSEngines = window.booksTTSEngines || {};

  function base64ToArrayBuffer(b64) {
    try {
      const bin = atob(String(b64 || ''));
      const len = bin.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      return bytes.buffer;
    } catch {
      return null;
    }
  }

  function create() {
    var state = {
      audioCtx: null,
      source: null,
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
        var ctx = ensureAudioCtx();
        if (!ctx) return;
        var ab = base64ToArrayBuffer(res.audioBase64);
        if (!ab) return;
        var audioBuffer = await ctx.decodeAudioData(ab.slice(0));
        if (!audioBuffer) return;
        // Evict oldest if full
        if (_preCacheCount >= MAX_PRECACHE) {
          var keys = Object.keys(_preCache);
          if (keys.length) { delete _preCache[keys[0]]; _preCacheCount--; }
        }
        _preCache[key] = { audioBuffer: audioBuffer, boundaries: res.boundaries || [] };
        _preCacheCount++;
      } catch {}
    }

    function diag(code, detail) {
      state.lastDiag = { code: String(code || ''), detail: String(detail || '') };
      if (typeof state.onDiag === 'function') {
        try { state.onDiag({ code: state.lastDiag.code, detail: state.lastDiag.detail }); } catch {}
      }
    }

    function ensureAudioCtx() {
      if (!state.audioCtx) {
        try { state.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch {
          state.audioCtx = null;
        }
      }
      if (state.audioCtx && state.audioCtx.state === 'suspended') {
        try { state.audioCtx.resume(); } catch {}
      }
      return state.audioCtx;
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
            if (typeof state.onBoundary === 'function') {
              try { state.onBoundary(ci, cl, 'word'); } catch {}
            }
          }, delay);
        })(list[i], charIndex, charLength);
      }
    }

    // GAP3: play a decoded AudioBuffer (shared by cached and fresh paths)
    function _playBuffer(myReq, audioBuffer, boundaries, text) {
      var ctx = ensureAudioCtx();
      if (!ctx) {
        state.playing = false;
        diag('edge_decode_fail', 'no_audio_context');
        if (typeof state.onError === 'function') state.onError({ error: 'edge_decode_fail', stage: 'edge_decode', reason: 'no_audio_context' });
        return;
      }

      fireBoundaries(myReq, boundaries, text);

      var src = ctx.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(ctx.destination);
      state.source = src;

      src.onended = function () {
        if (myReq !== state.requestId) return;
        state.source = null;
        state.playing = false;
        state.paused = false;
        diag('edge_play_ok', '');
        if (typeof state.onEnd === 'function') state.onEnd();
      };

      try {
        src.start(0);
      } catch (err) {
        state.source = null;
        state.playing = false;
        diag('edge_play_fail', String(err && err.message ? err.message : err));
        if (typeof state.onError === 'function') state.onError({ error: 'edge_play_fail', stage: 'edge_play', reason: String(err && err.message ? err.message : err) });
      }
    }

    async function speak(text) {
      cancel();
      var t = String(text || '').trim();
      if (!t) return;

      state.playing = true;
      state.paused = false;
      state.requestId = Math.random().toString(36).slice(2);
      var myReq = state.requestId;

      // GAP3: check preload cache first
      var cacheKey = _preCacheKey(t);
      var cached = _preCache[cacheKey];
      if (cached) {
        delete _preCache[cacheKey];
        _preCacheCount--;
        diag('edge_preload_hit', '');
        _playBuffer(myReq, cached.audioBuffer, cached.boundaries, t);
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

        var res = await api.synth({
          text: t,
          voice: state.voiceName,
          rate: state.rate,
          pitch: state.pitch,
        });
        if (myReq !== state.requestId) return;

        if (!res || !res.ok || !res.audioBase64) {
          state.playing = false;
          var code = String(res && (res.errorCode || res.reason) || 'edge_audio_chunk_recv_none');
          diag(code, String(res && res.reason || 'synth_failed'));
          if (typeof state.onError === 'function') state.onError({ error: code, stage: 'edge_synth', reason: String(res && res.reason || '') });
          return;
        }

        diag('edge_audio_chunk_recv_ok', '');
        var ctx = ensureAudioCtx();
        if (!ctx) {
          state.playing = false;
          diag('edge_decode_fail', 'no_audio_context');
          if (typeof state.onError === 'function') state.onError({ error: 'edge_decode_fail', stage: 'edge_decode', reason: 'no_audio_context' });
          return;
        }

        var ab = base64ToArrayBuffer(res.audioBase64);
        if (!ab) {
          state.playing = false;
          diag('edge_decode_fail', 'invalid_audio_payload');
          if (typeof state.onError === 'function') state.onError({ error: 'edge_decode_fail', stage: 'edge_decode', reason: 'invalid_audio_payload' });
          return;
        }

        var audioBuffer = null;
        try {
          audioBuffer = await ctx.decodeAudioData(ab.slice(0));
        } catch (err) {
          state.playing = false;
          diag('edge_decode_fail', String(err && err.message ? err.message : err));
          if (typeof state.onError === 'function') state.onError({ error: 'edge_decode_fail', stage: 'edge_decode', reason: String(err && err.message ? err.message : err) });
          return;
        }
        if (myReq !== state.requestId) return;
        diag('edge_decode_ok', '');

        _playBuffer(myReq, audioBuffer, res.boundaries || [], t);
      } catch (err3) {
        if (myReq !== state.requestId) return;
        state.playing = false;
        diag('edge_ws_open_fail', String(err3 && err3.message ? err3.message : err3));
        if (typeof state.onError === 'function') state.onError({ error: 'edge_ws_open_fail', stage: 'edge_ws_open', reason: String(err3 && err3.message ? err3.message : err3) });
      }
    }

    function pause() {
      if (!state.audioCtx || !state.playing || state.paused) return;
      // TTS_REWRITE: verify AudioContext state before suspending
      if (state.audioCtx.state === 'running') {
        try { state.audioCtx.suspend(); } catch {}
      }
      state.paused = true;
    }

    function resume() {
      if (!state.audioCtx || !state.paused) return;
      // TTS_REWRITE: verify AudioContext state before resuming
      if (state.audioCtx.state === 'suspended') {
        try { state.audioCtx.resume(); } catch {}
      }
      state.paused = false;
    }

    function cancel() {
      state.requestId = '';
      state.playing = false;
      state.paused = false;
      if (state.source) {
        try { state.source.stop(); } catch {}
      }
      state.source = null;
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
