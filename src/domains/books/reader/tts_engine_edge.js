// FIX-TTS05: Edge TTS engine with LRU audio cache and multi-chunk preload
// Replaces single-item preCache with proper LRU (20 items).
// Cache key: voice|rate|pitch|text — replay/seek is instant on cache hit.
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
      volume: 1.0, // TTS-QOL4
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
      // Resume hint from TTS core (character index inside the next spoken text).
      resumeCharIndex: -1,
      // Internal: seek target in milliseconds (computed from boundary offsets).
      _resumeSeekMs: null,
    };

    // FIX-TTS05: LRU audio cache — keyed by "voice|rate|pitch|text"
    // Uses Map for insertion-order iteration (oldest first for eviction).
    // OPT1: increased from 20 to 50 for longer listening sessions
    var _lruCache = new Map();
    var LRU_MAX = 50;

    function _lruKey(text) {
      return state.voiceName + '|' + state.rate + '|' + state.pitch + '|' + text;
    }

    function _lruGet(key) {
      if (!_lruCache.has(key)) return null;
      var entry = _lruCache.get(key);
      // Move to end (most recently used)
      _lruCache.delete(key);
      _lruCache.set(key, entry);
      return entry;
    }

    function _lruSet(key, entry) {
      if (_lruCache.has(key)) {
        _lruCache.delete(key);
      } else if (_lruCache.size >= LRU_MAX) {
        // Evict oldest (first entry in Map)
        var oldest = _lruCache.keys().next().value;
        var evicted = _lruCache.get(oldest);
        if (evicted && evicted.blobUrl) {
          try { URL.revokeObjectURL(evicted.blobUrl); } catch {}
        }
        _lruCache.delete(oldest);
      }
      _lruCache.set(key, entry);
    }

    // FIX-TTS-B3 #6: Track preload keys that exhausted all retries
    var _preloadFailed = new Set();

    function clearPreloadCache() {
      _lruCache.forEach(function (entry) {
        if (entry && entry.blobUrl) {
          try { URL.revokeObjectURL(entry.blobUrl); } catch {}
        }
      });
      _lruCache.clear();
      _preloadFailed.clear();
    }

    // FIX-TTS05: Background preload — synthesize and cache without playing
    // FIX-TTS-B3 #6: Retry up to 3 attempts with backoff; log final failures
    async function preload(text) {
      var t = String(text || '').trim();
      if (!t) return;
      var key = _lruKey(t);
      if (_lruCache.has(key)) return;
      if (_preloadFailed.has(key)) return;
      var api = window.Tanko && window.Tanko.api && window.Tanko.api.booksTtsEdge;
      if (!api || typeof api.synth !== 'function') return;
      var reqAtStart = state.requestId;
      var delays = [0, 500, 1000];
      for (var attempt = 0; attempt < delays.length; attempt++) {
        if (attempt > 0) {
          if (state.requestId !== reqAtStart && reqAtStart !== '') return;
          await new Promise(function (resolve) { setTimeout(resolve, delays[attempt]); });
          if (state.requestId !== reqAtStart && reqAtStart !== '') return;
          if (_lruCache.has(key)) return;
        }
        try {
          var res = await api.synth({
            text: t,
            voice: state.voiceName,
            rate: state.rate,
            pitch: state.pitch,
            returnBase64: false,
          });
          if (res && res.ok) {
            if (res.audioUrl) {
              _lruSet(key, { audioUrl: String(res.audioUrl), boundaries: res.boundaries || [] });
              _preloadFailed.delete(key);
              return;
            }
            if (res.audioBase64) {
              var blob = base64ToBlob(res.audioBase64, 'audio/mpeg');
              if (blob) {
                _lruSet(key, { blob: blob, blobUrl: null, boundaries: res.boundaries || [] });
                _preloadFailed.delete(key);
                return;
              }
            }
          }
        } catch (err) {
          if (attempt === delays.length - 1) {
            diag('preload_fail', 'len=' + t.length + ' err=' + String(err && err.message ? err.message : err));
            _preloadFailed.add(key);
          }
        }
      }
    }

    // FIX-TTS06: Track synth failures — reset main-process WS after repeated errors
    var _synthErrorCount = 0;

    function diag(code, detail) {
      state.lastDiag = { code: String(code || ''), detail: String(detail || '') };
      if (typeof state.onDiag === 'function') {
        try { state.onDiag({ code: state.lastDiag.code, detail: state.lastDiag.detail }); } catch {}
      }
      // FIX-TTS06: If we're seeing synth/ws failures, proactively reset the main-process instance
      // so the next speak attempt gets a fresh WebSocket instead of hitting the same dead one.
      if (code && (String(code).indexOf('fail') >= 0 || String(code).indexOf('timeout') >= 0)) {
        _synthErrorCount++;
        if (_synthErrorCount >= 2) {
          _synthErrorCount = 0;
          try {
            var api = window.Tanko && window.Tanko.api && window.Tanko.api.booksTtsEdge;
            if (api && typeof api.resetInstance === 'function') {
              api.resetInstance().catch(function () {});
            }
          } catch {}
        }
      }
    }

    function ensureAudio() {
      if (!state.audio) {
        try {
          state.audio = new Audio();
          state.audio.preload = 'auto';
          state.audio.volume = state.volume; // TTS-QOL4
        } catch {
          state.audio = null;
        }
      }
      return state.audio;
    }

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
      // OPT2: skip re-probe if already confirmed available this session
      if (state.health.known && state.health.available) {
        diag('edge_probe_cached', 'skipped');
        return true;
      }
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
        var probeReq = Object.assign({ requireSynthesis: true, timeoutMs: 5000 }, payload || {}); // OPT2: reduced from 10s
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

    // TTS-QOL4: Volume control via HTMLAudioElement.volume (0–1)
    function setVolume(vol) {
      state.volume = Math.max(0, Math.min(1, Number(vol) || 1.0));
      if (state.audio) state.audio.volume = state.volume;
    }

    function setPitch(pitch) {
      state.pitch = Math.max(0.5, Math.min(2.0, Number(pitch) || 1.0));
    }

    function setVoice(voiceURI) {
      state.voiceName = String(voiceURI || 'en-US-AriaNeural');
    }

    function setResumeHint(charIndex) {
      var v = (typeof charIndex === 'number' && isFinite(charIndex)) ? Math.max(0, Math.floor(charIndex)) : -1;
      state.resumeCharIndex = v;
    }

    // FIX-TTS08: Boundary scheduling state — survives pause/resume cycles.
    // Stores pre-computed boundary entries and a polling timer that checks
    // audio.currentTime to fire them at the right moment, even after pauses.
    var _bd = {
      entries: [],     // [{ offsetMs, charIndex, charLength }]
      nextIdx: 0,      // next entry to fire
      rafId: null,     // requestAnimationFrame / setTimeout id
      reqId: '',       // matches state.requestId to invalidate on cancel
    };

    function _bdStop() {
      if (_bd.rafId) { clearTimeout(_bd.rafId); _bd.rafId = null; }
      _bd.entries = [];
      _bd.nextIdx = 0;
      _bd.reqId = '';
    }

    // FIX-TTS-B1: pause/resume boundary polling without clearing entries
    function _bdPause() {
      if (_bd.rafId) { clearTimeout(_bd.rafId); _bd.rafId = null; }
    }

    function _bdResume() {
      if (!_bd.rafId && _bd.nextIdx < _bd.entries.length && _bd.reqId === state.requestId) {
        _bd.rafId = setTimeout(_bdPoll, 16);
      }
    }

    function _bdPoll() {
      _bd.rafId = null;
      if (_bd.reqId !== state.requestId) return;
      if (!state.playing) return;
      if (state.paused) return; // FIX-TTS-B1: don't reschedule while paused — _bdResume() restarts on resume
      var audio = state.audio;
      if (!audio) return;
      var currentMs = (audio.currentTime || 0) * 1000;
      // Fire all boundaries whose offset has been reached
      while (_bd.nextIdx < _bd.entries.length) {
        var entry = _bd.entries[_bd.nextIdx];
        if (entry.offsetMs <= currentMs) {
          _bd.nextIdx++;
          if (typeof state.onBoundary === 'function') {
            try { state.onBoundary(entry.charIndex, entry.charLength, 'word'); } catch {}
          }
        } else {
          break;
        }
      }
      // Schedule next poll if there are remaining entries
      if (_bd.nextIdx < _bd.entries.length) {
        var nextDelay = Math.max(16, _bd.entries[_bd.nextIdx].offsetMs - currentMs);
        _bd.rafId = setTimeout(_bdPoll, Math.min(nextDelay, 50));
      }
    }

    // FIX-LISTEN-STAB: Edge wordBoundary `text` values don't always match the exact
    // substring in our spoken text (punctuation, quotes, repeated words). Doing a
    // naive indexOf() causes highlight drift. We instead search in a normalized
    // stream and map back to original char indices.
    function _buildNormMap(original) {
      var src = String(original || '');
      var norm = '';
      var map = [];
      var lastWasSpace = false;
      for (var i = 0; i < src.length; i++) {
        var ch = src[i];
        var lower = ch.toLowerCase();
        // Normalize curly apostrophes
        if (lower === '’') lower = "'";

        var isWs = (lower === ' ' || lower === '\n' || lower === '\r' || lower === '\t' || lower === '\f');
        if (isWs) {
          if (!lastWasSpace) {
            norm += ' ';
            map.push(i);
            lastWasSpace = true;
          }
          continue;
        }

        lastWasSpace = false;
        var code = lower.charCodeAt(0);
        var isAZ = (code >= 97 && code <= 122);
        var is09 = (code >= 48 && code <= 57);
        var isKeep = isAZ || is09 || lower === "'" || lower === '-';
        if (!isKeep) continue;
        norm += lower;
        map.push(i);
      }
      return { norm: norm, map: map };
    }

    function _normWord(word) {
      var w = String(word || '').toLowerCase();
      w = w.replace(/’/g, "'");
      // Keep only [a-z0-9' -] then trim & collapse spaces
      w = w.replace(/[^a-z0-9\s'\-]+/g, ' ');
      w = w.replace(/\s+/g, ' ').trim();
      return w;
    }

    function fireBoundaries(reqId, boundaries, spokenText) {
      _bdStop();
      var list = Array.isArray(boundaries) ? boundaries : [];
      var txt = String(spokenText || '');
      var normInfo = _buildNormMap(txt);
      var normTxt = normInfo.norm;
      var normMap = normInfo.map;
      var normPos = 0;
      var lastCharIndex = 0;
      var entries = [];
      for (var i = 0; i < list.length; i++) {
        var word = (list[i] && list[i].text) ? String(list[i].text) : '';
        var charIndex = lastCharIndex;
        var charLength = 0;

        var nw = _normWord(word);
        if (nw && normTxt) {
          var idx2 = normTxt.indexOf(nw, normPos);
          if (idx2 >= 0) {
            var startOrig = normMap[idx2] != null ? normMap[idx2] : lastCharIndex;
            var endNorm = idx2 + nw.length - 1;
            var endOrig = normMap[endNorm] != null ? normMap[endNorm] : startOrig;
            charIndex = startOrig;
            charLength = Math.max(0, (endOrig - startOrig) + 1);
            lastCharIndex = charIndex;
            normPos = idx2 + nw.length;
          }
        }
        entries.push({
          offsetMs: Math.max(0, Number(list[i] && list[i].offsetMs || 0)),
          charIndex: charIndex,
          charLength: charLength,
        });
      }

      // Sort by offset to schedule
      entries.sort(function (a, b) { return a.offsetMs - b.offsetMs; });

      // Optional resume: skip earlier boundaries and compute a seek target.
      state._resumeSeekMs = null;
      var nextIdx = 0;
      var resumeChar = (typeof state.resumeCharIndex === 'number' && isFinite(state.resumeCharIndex)) ? Math.max(0, Math.floor(state.resumeCharIndex)) : -1;
      if (resumeChar >= 0 && entries.length) {
        var ridx = -1;
        for (var j = 0; j < entries.length; j++) {
          var e = entries[j];
          if (resumeChar <= (e.charIndex + e.charLength - 1)) { ridx = j; break; }
        }
        if (ridx < 0) ridx = entries.length - 1;
        nextIdx = ridx;
        state._resumeSeekMs = Math.max(0, entries[ridx].offsetMs || 0);
      }

      _bd.entries = entries;
      _bd.nextIdx = nextIdx;
      _bd.reqId = reqId;
      // Start polling
      if (entries.length) {
        _bd.rafId = setTimeout(_bdPoll, 16);
      }
    }

    function _applyResumeSeekIfAny(myReq, audio) {
      if (myReq !== state.requestId) return;
      if (!audio) return;
      if (typeof state._resumeSeekMs !== 'number' || !isFinite(state._resumeSeekMs) || state._resumeSeekMs == null) return;
      var seekMs = Math.max(0, state._resumeSeekMs);
      state._resumeSeekMs = null;
      try { audio.currentTime = seekMs / 1000; } catch {}
    }

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

      audio.onloadedmetadata = function () {
        _applyResumeSeekIfAny(myReq, audio);
      };

      audio.onended = function () {
        if (myReq !== state.requestId) return;
        state.playing = false;
        state.paused = false;
        _synthErrorCount = 0; // FIX-TTS06: reset error counter on successful playback
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

    function _playUrl(myReq, srcUrl, boundaries, text) {
      var audio = ensureAudio();
      if (!audio) {
        state.playing = false;
        diag('edge_play_fail', 'no_audio_element');
        if (typeof state.onError === 'function') state.onError({ error: 'edge_play_fail', stage: 'edge_play', reason: 'no_audio_element' });
        return;
      }

      // If the previous segment used a blob URL, release it.
      _revokeBlobUrl();

      audio.src = String(srcUrl || '');

      audio.onloadedmetadata = function () {
        _applyResumeSeekIfAny(myReq, audio);
      };

      audio.onended = function () {
        if (myReq !== state.requestId) return;
        state.playing = false;
        state.paused = false;
        _synthErrorCount = 0;
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

      // FIX-TTS05: Check LRU cache first — instant playback on hit
      var cacheKey = _lruKey(t);
      var cached = _lruGet(cacheKey);
      if (cached) {
        diag('edge_preload_hit', '');
        if (cached.audioUrl) {
          _playUrl(myReq, cached.audioUrl, cached.boundaries, t);
        } else {
          _playBlob(myReq, cached.blob, cached.boundaries, t);
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

        var res = await _synthWithTimeout(api, {
          text: t,
          voice: state.voiceName,
          rate: state.rate,
          pitch: state.pitch,
          returnBase64: false,
        }, 15000);
        if (signal.aborted || myReq !== state.requestId) return;

        if (!res || !res.ok || (!res.audioUrl && !res.audioBase64)) {
          state.playing = false;
          var code = String(res && (res.errorCode || res.reason) || 'edge_audio_chunk_recv_none');
          diag(code, String(res && res.reason || 'synth_failed'));
          if (typeof state.onError === 'function') state.onError({ error: code, stage: 'edge_synth', reason: String(res && res.reason || '') });
          return;
        }

        diag('edge_audio_chunk_recv_ok', '');
        if (res.audioUrl) {
          // Preferred: play from on-disk cache via file URL (avoids base64 decode/jank)
          _lruSet(cacheKey, { audioUrl: String(res.audioUrl), boundaries: res.boundaries || [] });
          _playUrl(myReq, String(res.audioUrl), res.boundaries || [], t);
          return;
        }

        // Fallback: base64 → Blob
        var blob = base64ToBlob(res.audioBase64, 'audio/mpeg');
        if (!blob) {
          state.playing = false;
          diag('edge_decode_fail', 'invalid_audio_payload');
          if (typeof state.onError === 'function') state.onError({ error: 'edge_decode_fail', stage: 'edge_decode', reason: 'invalid_audio_payload' });
          return;
        }
        if (signal.aborted || myReq !== state.requestId) return;
        diag('edge_decode_ok', '');

        // Store in LRU cache for replay/seek
        _lruSet(cacheKey, { blob: blob, blobUrl: null, boundaries: res.boundaries || [] });
        _playBlob(myReq, blob, res.boundaries || [], t);
      } catch (err3) {
        if (signal.aborted || myReq !== state.requestId) return;
        state.playing = false;
        diag('edge_ws_open_fail', String(err3 && err3.message ? err3.message : err3));
        if (typeof state.onError === 'function') state.onError({ error: 'edge_ws_open_fail', stage: 'edge_ws_open', reason: String(err3 && err3.message ? err3.message : err3) });
      }
    }

    // FIX-TTS05: Gapless re-speak — keep current audio playing until new audio is ready
    async function speakGapless(text) {
      var t = String(text || '').trim();
      if (!t) return;
      if (state.abortCtrl) {
        try { state.abortCtrl.abort(); } catch {}
      }
      var newReqId = Math.random().toString(36).slice(2);
      state.requestId = newReqId;
      state.abortCtrl = new AbortController();
      var signal = state.abortCtrl.signal;

      // Check LRU cache
      var cacheKey = _lruKey(t);
      var cached = _lruGet(cacheKey);
      if (cached) {
        diag('edge_preload_hit', '');
        if (cached.audioUrl) {
          _playUrl(newReqId, cached.audioUrl, cached.boundaries, t);
        } else {
          _playBlob(newReqId, cached.blob, cached.boundaries, t);
        }
        return;
      }

      try {
        var api = window.Tanko && window.Tanko.api && window.Tanko.api.booksTtsEdge;
        if (!api || typeof api.synth !== 'function') return;
        var res = await _synthWithTimeout(api, {
          text: t,
          voice: state.voiceName,
          rate: state.rate,
          pitch: state.pitch,
          returnBase64: false,
        }, 15000);
        if (signal.aborted || newReqId !== state.requestId) return;
        if (!res || !res.ok) return;
        if (res.audioUrl) {
          _lruSet(_lruKey(t), { audioUrl: String(res.audioUrl), boundaries: res.boundaries || [] });
          _playUrl(newReqId, String(res.audioUrl), res.boundaries || [], t);
          return;
        }
        if (!res.audioBase64) return;
        var blob = base64ToBlob(res.audioBase64, 'audio/mpeg');
        if (!blob) return;
        if (signal.aborted || newReqId !== state.requestId) return;
        _lruSet(_lruKey(t), { blob: blob, blobUrl: null, boundaries: res.boundaries || [] });
        _playBlob(newReqId, blob, res.boundaries || [], t);
      } catch {}
    }

    function pause() {
      if (!state.audio || !state.playing || state.paused) return;
      state.audio.pause();
      state.paused = true;
      _bdPause(); // FIX-TTS-B1: stop boundary polling on pause
    }

    // FIX-TTS-B1: Optimistic paused=false (required by tts_core.js synchronous isPaused check)
    // with 5s timeout safety net for the rare case where audio.play() promise never settles.
    function resume() {
      if (!state.audio || !state.paused) return;
      try {
        var playPromise = state.audio.play();
        if (playPromise && typeof playPromise.then === 'function') {
          var settled = false;
          state.paused = false;
          _bdResume();
          var safetyTimer = setTimeout(function () {
            if (!settled) {
              settled = true;
              state.paused = true;
              _bdPause();
              diag('edge_resume_timeout', 'play_promise_stuck');
            }
          }, 5000);
          playPromise.then(function () {
            settled = true;
            clearTimeout(safetyTimer);
          }).catch(function (err) {
            if (!settled) {
              settled = true;
              clearTimeout(safetyTimer);
              state.paused = true;
              _bdPause();
              diag('edge_resume_fail', String(err && err.message ? err.message : err));
            }
          });
        } else {
          state.paused = false;
          _bdResume();
        }
      } catch (err) {
        diag('edge_resume_fail', String(err && err.message ? err.message : err));
      }
    }

    function cancel() {
      _bdStop(); // FIX-TTS08: stop boundary poller
      state._resumeSeekMs = null;
      state.resumeCharIndex = -1;
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
      setVolume: setVolume, // TTS-QOL4
      setVoice: setVoice,
      setResumeHint: setResumeHint,
      setPitch: setPitch,
      speak: speak,
      speakGapless: speakGapless,
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
