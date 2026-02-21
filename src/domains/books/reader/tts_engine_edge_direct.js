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


  // EDGE_DIRECT: renderer-native WebSocket transport (with IPC voices fallback)
  var EDGE_DIRECT_API_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
  var EDGE_DIRECT_WS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
  var EDGE_DIRECT_VOICES_URL = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list';
  var EDGE_DIRECT_CHROMIUM_FULL_VERSION = '143.0.3650.75';
  var EDGE_DIRECT_CHROMIUM_MAJOR_VERSION = String(EDGE_DIRECT_CHROMIUM_FULL_VERSION).split('.')[0];
  var EDGE_DIRECT_WIN_EPOCH_OFFSET = 11644473600;
  var EDGE_DIRECT_S_TO_NS = 1000000000;
  var _edgeDirectVoicesCache = { at: 0, voices: [] };
  var _edgeDirectBackend = null;

  function _edgeDirectNowIso() {
    return new Date().toISOString();
  }

  function _edgeDirectGenUuidNoDash() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return String(window.crypto.randomUUID()).replace(/-/g, '').toUpperCase();
      }
    } catch {}
    var out = '';
    try {
      var a = new Uint8Array(16);
      window.crypto.getRandomValues(a);
      for (var i = 0; i < a.length; i++) {
        var h = a[i].toString(16);
        if (h.length < 2) h = '0' + h;
        out += h;
      }
      return out.toUpperCase();
    } catch {}
    for (var j = 0; j < 32; j++) out += Math.floor(Math.random() * 16).toString(16);
    return out.toUpperCase();
  }

  function _edgeDirectBufToHexUpper(buf) {
    var arr = new Uint8Array(buf || new ArrayBuffer(0));
    var out = '';
    for (var i = 0; i < arr.length; i++) {
      var h = arr[i].toString(16).toUpperCase();
      if (h.length < 2) h = '0' + h;
      out += h;
    }
    return out;
  }

  function _edgeDirectAsciiBytes(s) {
    var str = String(s || '');
    var arr = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i) & 0xFF;
    return arr;
  }

  async function _edgeDirectSha256HexUpperAscii(s) {
    var data = _edgeDirectAsciiBytes(s);
    if (window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function') {
      var digest = await window.crypto.subtle.digest('SHA-256', data);
      return _edgeDirectBufToHexUpper(digest);
    }
    throw new Error('edge_direct_crypto_subtle_missing');
  }

  async function _edgeDirectGenerateSecMsGec() {
    var ticks = Math.floor(Date.now() / 1000);
    ticks += EDGE_DIRECT_WIN_EPOCH_OFFSET;
    ticks -= (ticks % 300);
    ticks *= EDGE_DIRECT_S_TO_NS / 100;
    var strToHash = String(ticks.toFixed(0)) + EDGE_DIRECT_API_TOKEN;
    return _edgeDirectSha256HexUpperAscii(strToHash);
  }

  function _edgeDirectRateToString(rate) {
    var n = Number(rate);
    if (!isFinite(n)) n = 1.0;
    if (n < 0.5) n = 0.5;
    if (n > 2.0) n = 2.0;
    var pct = Math.round((n - 1) * 100);
    return (pct >= 0 ? '+' : '') + String(pct) + '%';
  }

  function _edgeDirectPitchToString(pitch) {
    var n = Number(pitch);
    if (!isFinite(n)) n = 1.0;
    if (n < 0.5) n = 0.5;
    if (n > 2.0) n = 2.0;
    var hz = Math.round((n - 1) * 50);
    return (hz >= 0 ? '+' : '') + String(hz) + 'Hz';
  }

  function _edgeDirectXmlEscape(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function _edgeDirectGuessLangFromVoice(voice) {
    var v = String(voice || '');
    var m = v.match(/^([a-z]{2,3}(?:-[A-Za-z]{2,8})?)/);
    return m ? m[1] : 'en-US';
  }

  function _edgeDirectBuildSsml(payload) {
    var text = String(payload && payload.text || '');
    var voice = String(payload && payload.voice || 'en-US-AriaNeural');
    var lang = _edgeDirectGuessLangFromVoice(voice);
    var rate = _edgeDirectRateToString(payload && payload.rate);
    var pitch = _edgeDirectPitchToString(payload && payload.pitch);
    return '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="' + _edgeDirectXmlEscape(lang) + '">' +
      '<voice name="' + _edgeDirectXmlEscape(voice) + '">' +
      '<prosody rate="' + _edgeDirectXmlEscape(rate) + '" pitch="' + _edgeDirectXmlEscape(pitch) + '">' +
      _edgeDirectXmlEscape(text) +
      '</prosody></voice></speak>';
  }

  function _edgeDirectFrame(headersObj, body) {
    var header = '';
    var keys = Object.keys(headersObj || {});
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      header += String(k) + ': ' + String(headersObj[k]) + '\r\n';
    }
    return header + '\r\n' + String(body || '');
  }

  function _edgeDirectParseTextFrame(msg) {
    var text = String(msg || '');
    var sep = text.indexOf('\r\n\r\n');
    if (sep < 0) sep = text.indexOf('\n\n');
    var head = sep >= 0 ? text.slice(0, sep) : text;
    var body = sep >= 0 ? text.slice(sep + ((text.slice(sep, sep + 4) === '\r\n\r\n') ? 4 : 2)) : '';
    var lines = head.split(/\r?\n/);
    var headers = {};
    for (var i = 0; i < lines.length; i++) {
      var line = String(lines[i] || '');
      if (!line) continue;
      var idx = line.indexOf(':');
      if (idx < 0) continue;
      var key = line.slice(0, idx).trim();
      var val = line.slice(idx + 1).trim();
      if (key) headers[key] = val;
    }
    return { headers: headers, body: body };
  }

  function _edgeDirectExtractBinaryBody(buffer) {
    try {
      if (!(buffer instanceof ArrayBuffer)) return null;
      if (buffer.byteLength < 2) return null;
      var view = new DataView(buffer);
      var headerLen = view.getUint16(0, false);
      var bodyStart = 2 + headerLen;
      if (bodyStart < 0 || bodyStart > buffer.byteLength) return null;
      return buffer.slice(bodyStart);
    } catch {
      return null;
    }
  }

  function _edgeDirectPushBoundaryFromItem(boundaries, item) {
    try {
      if (!item || !item.Data) return;
      var d = item.Data || {};
      var offsetMs = d.Offset ? Math.round(Number(d.Offset) / 10000) : 0;
      var durationMs = d.Duration ? Math.round(Number(d.Duration) / 10000) : 0;
      var word = '';
      if (d.text && d.text.Text != null) word = String(d.text.Text);
      boundaries.push({ offsetMs: offsetMs, durationMs: durationMs, text: word });
    } catch {}
  }

  function _edgeDirectHandleMetadataBody(boundaries, bodyText) {
    try {
      var obj = JSON.parse(String(bodyText || '').trim());
      var items = (obj && obj.Metadata) ? obj.Metadata : [obj];
      for (var i = 0; i < items.length; i++) _edgeDirectPushBoundaryFromItem(boundaries, items[i]);
    } catch {}
  }

  function _edgeDirectConcatBuffers(chunks) {
    var total = 0;
    for (var i = 0; i < chunks.length; i++) total += (chunks[i] ? chunks[i].byteLength : 0);
    var out = new Uint8Array(total);
    var off = 0;
    for (var j = 0; j < chunks.length; j++) {
      var c = chunks[j];
      if (!c) continue;
      out.set(new Uint8Array(c), off);
      off += c.byteLength;
    }
    return out.buffer;
  }

  function _edgeDirectArrayBufferToBase64(buf) {
    return new Promise(function (resolve, reject) {
      try {
        var blob = new Blob([buf], { type: 'audio/mpeg' });
        var fr = new FileReader();
        fr.onload = function () {
          try {
            var s = String(fr.result || '');
            var idx = s.indexOf(',');
            resolve(idx >= 0 ? s.slice(idx + 1) : s);
          } catch (e) { reject(e); }
        };
        fr.onerror = function () { reject(fr.error || new Error('edge_direct_filereader_error')); };
        fr.readAsDataURL(blob);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function _edgeDirectFetchVoices(opts) {
    var maxAgeMs = Math.max(0, Number(opts && opts.maxAgeMs || 600000));
    if (_edgeDirectVoicesCache.voices.length && (Date.now() - _edgeDirectVoicesCache.at) <= maxAgeMs) {
      return { ok: true, voices: _edgeDirectVoicesCache.voices.slice(), cached: true };
    }
    try {
      var secMsGec = await _edgeDirectGenerateSecMsGec();
      var url = new URL(EDGE_DIRECT_VOICES_URL);
      url.searchParams.set('trustedclienttoken', EDGE_DIRECT_API_TOKEN);
      url.searchParams.set('Sec-MS-GEC', secMsGec);
      url.searchParams.set('Sec-MS-GEC-Version', '1-' + EDGE_DIRECT_CHROMIUM_FULL_VERSION);
      var resp = await fetch(url.toString(), {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
      });
      if (!resp || !resp.ok) throw new Error('edge_direct_voices_http_' + String(resp && resp.status || 'fail'));
      var raw = await resp.json();
      var list = Array.isArray(raw) ? raw : [];
      var voices = [];
      for (var i = 0; i < list.length; i++) {
        var v = list[i] || {};
        var shortName = String(v.ShortName || v.Name || '');
        if (!shortName) continue;
        voices.push({
          name: shortName,
          voiceURI: shortName,
          lang: String(v.Locale || v.locale || ''),
          gender: String(v.Gender || ''),
          localService: false,
          default: shortName === 'en-US-AriaNeural',
          engine: 'edgeDirect',
        });
      }
      if (!voices.length) throw new Error('voices_empty');
      _edgeDirectVoicesCache = { at: Date.now(), voices: voices.slice() };
      return { ok: true, voices: voices };
    } catch (err) {
      var ipcApi = window.Tanko && window.Tanko.api && window.Tanko.api.booksTtsEdge;
      if (ipcApi && typeof ipcApi.getVoices === 'function') {
        try {
          var fallback = await ipcApi.getVoices(opts || {});
          if (fallback && fallback.ok && Array.isArray(fallback.voices)) {
            return fallback;
          }
        } catch {}
      }
      return { ok: false, voices: [], reason: String(err && err.message ? err.message : err) };
    }
  }

  async function _edgeDirectSynth(payload) {
    var text = String(payload && payload.text || '').trim();
    if (!text) {
      return { ok: false, errorCode: 'edge_empty_text', reason: 'Text is empty', boundaries: [], audioBase64: '' };
    }

    var voice = String(payload && payload.voice || 'en-US-AriaNeural');
    var rate = Number(payload && payload.rate);
    var pitch = Number(payload && payload.pitch);

    var connectionId = _edgeDirectGenUuidNoDash();
    var requestId = connectionId;
    var secMsGec = await _edgeDirectGenerateSecMsGec();

    var wsUrl = new URL(EDGE_DIRECT_WS_URL);
    wsUrl.searchParams.set('TrustedClientToken', EDGE_DIRECT_API_TOKEN);
    wsUrl.searchParams.set('ConnectionId', connectionId);
    wsUrl.searchParams.set('Sec-MS-GEC', secMsGec);
    wsUrl.searchParams.set('Sec-MS-GEC-Version', '1-' + EDGE_DIRECT_CHROMIUM_FULL_VERSION);

    var timestamp = _edgeDirectNowIso();
    var configHeaders = {
      'Content-Type': 'application/json; charset=utf-8',
      'Path': 'speech.config',
      'X-Timestamp': timestamp
    };
    var ssmlHeaders = {
      'Content-Type': 'application/ssml+xml',
      'Path': 'ssml',
      'X-RequestId': requestId,
      'X-Timestamp': timestamp
    };
    var configBody = JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: true },
            outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
          }
        }
      }
    });
    var ssml = _edgeDirectBuildSsml({ text: text, voice: voice, rate: rate, pitch: pitch });

    return new Promise(function (resolve) {
      var ws = null;
      var settled = false;
      var audioChunks = [];
      var boundaries = [];
      var timer = null;

      function done(out) {
        if (settled) return;
        settled = true;
        try { if (timer) clearTimeout(timer); } catch {}
        try { if (ws && ws.readyState === 1) ws.close(); } catch {}
        resolve(out);
      }

      function fail(code, reason) {
        done({ ok: false, errorCode: String(code || 'edge_direct_fail'), reason: String(reason || code || 'edge_direct_fail'), boundaries: boundaries, audioBase64: '' });
      }

      async function finalizeSuccess() {
        try {
          if (!audioChunks.length) {
            fail('edge_audio_chunk_recv_none', 'No audio data received');
            return;
          }
          var audioBuf = _edgeDirectConcatBuffers(audioChunks);
          var b64 = await _edgeDirectArrayBufferToBase64(audioBuf);
          done({ ok: true, mime: 'audio/mpeg', boundaries: boundaries, audioBase64: b64 });
        } catch (err) {
          fail('edge_direct_finalize_fail', String(err && err.message ? err.message : err));
        }
      }

      timer = setTimeout(function () {
        fail('edge_synth_timeout', 'edge_synth_timeout');
      }, Math.max(5000, Number(payload && payload.timeoutMs) || 20000));

      try {
        ws = new WebSocket(wsUrl.toString());
      } catch (err) {
        fail('edge_ws_open_fail', String(err && err.message ? err.message : err));
        return;
      }

      ws.binaryType = 'arraybuffer';

      ws.addEventListener('open', function () {
        try {
          ws.send(_edgeDirectFrame(configHeaders, configBody));
          ws.send(_edgeDirectFrame(ssmlHeaders, ssml));
        } catch (err) {
          fail('edge_ws_send_fail', String(err && err.message ? err.message : err));
        }
      });

      ws.addEventListener('message', function (event) {
        if (settled) return;
        try {
          if (typeof event.data === 'string') {
            var parsed = _edgeDirectParseTextFrame(event.data);
            var p = String(parsed && parsed.headers && parsed.headers.Path || '').toLowerCase();
            if (p === 'audio.metadata') {
              _edgeDirectHandleMetadataBody(boundaries, parsed.body || '');
            } else if (p === 'turn.end') {
              finalizeSuccess();
            }
            return;
          }
          if (event.data instanceof ArrayBuffer) {
            var body = _edgeDirectExtractBinaryBody(event.data);
            if (body && body.byteLength) audioChunks.push(body);
            return;
          }
          if (event.data && typeof event.data.arrayBuffer === 'function') {
            event.data.arrayBuffer().then(function (ab) {
              if (settled) return;
              var body = _edgeDirectExtractBinaryBody(ab);
              if (body && body.byteLength) audioChunks.push(body);
            }).catch(function () {});
            return;
          }
        } catch (err) {
          fail('edge_ws_message_fail', String(err && err.message ? err.message : err));
        }
      });

      ws.addEventListener('error', function () {
        if (settled) return;
        fail('edge_ws_error', 'WebSocket error');
      });

      ws.addEventListener('close', function () {
        if (settled) return;
        if (audioChunks.length) {
          finalizeSuccess();
          return;
        }
        fail('edge_audio_chunk_recv_none', 'No audio data received');
      });
    });
  }

  async function _edgeDirectProbe(payload) {
    var p = (payload && typeof payload === 'object') ? payload : {};
    var text = String(p.text || 'Edge probe');
    var voice = String(p.voice || 'en-US-AriaNeural');
    var timeoutMs = Math.max(1000, Number(p.timeoutMs) || 5000);
    try {
      var res = await _edgeDirectSynth({
        text: text,
        voice: voice,
        rate: 1,
        pitch: 1,
        timeoutMs: timeoutMs
      });
      var ok = !!(res && res.ok && res.audioBase64);
      return {
        ok: true,
        available: ok,
        reason: ok ? 'edge_direct_probe_ok' : String(res && (res.reason || res.errorCode) || 'edge_direct_probe_failed'),
        details: { synth: res || null }
      };
    } catch (err) {
      return { ok: true, available: false, reason: String(err && err.message ? err.message : err) };
    }
  }

  function getEdgeDirectBackend() {
    if (_edgeDirectBackend) return _edgeDirectBackend;
    _edgeDirectBackend = {
      synth: _edgeDirectSynth,
      probe: _edgeDirectProbe,
      getVoices: _edgeDirectFetchVoices,
      warmup: function () { return Promise.resolve({ ok: true }); },
      resetInstance: function () { return Promise.resolve({ ok: true }); },
    };
    return _edgeDirectBackend;
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

    // FIX-TTS-B5 #8: Pre-buffered second audio element for gapless block transitions
    var _prepAudio = null;
    var _prepCacheKey = null;

    function _clearPrepared() {
      if (!_prepAudio) return;
      try { _prepAudio.pause(); } catch {}
      try { _prepAudio.removeAttribute('src'); } catch {}
      if (_prepAudio._blobUrl) { try { URL.revokeObjectURL(_prepAudio._blobUrl); } catch {} }
      _prepAudio = null;
      _prepCacheKey = null;
    }

    function prepareNext(text) {
      var t = String(text || '').trim();
      if (!t) return;
      var key = _lruKey(t);
      if (_prepCacheKey === key && _prepAudio) return;
      _clearPrepared();
      var cached = _lruCache.has(key) ? _lruCache.get(key) : null;
      if (!cached) return;
      var audio = new Audio();
      audio.preload = 'auto';
      audio.volume = state.volume;
      if (cached.audioUrl) {
        audio.src = String(cached.audioUrl);
      } else if (cached.blob) {
        audio._blobUrl = URL.createObjectURL(cached.blob);
        audio.src = audio._blobUrl;
      } else {
        return;
      }
      try { audio.load(); } catch {}
      _prepAudio = audio;
      _prepCacheKey = key;
    }

    function clearPreloadCache() {
      _lruCache.forEach(function (entry) {
        if (entry && entry.blobUrl) {
          try { URL.revokeObjectURL(entry.blobUrl); } catch {}
        }
      });
      _lruCache.clear();
      _preloadFailed.clear();
      _clearPrepared();
    }

    // FIX-TTS05: Background preload — synthesize and cache without playing
    // FIX-TTS-B3 #6: Retry up to 3 attempts with backoff; log final failures
    async function preload(text) {
      var t = String(text || '').trim();
      if (!t) return;
      var key = _lruKey(t);
      if (_lruCache.has(key)) return;
      if (_preloadFailed.has(key)) return;
      var api = getEdgeDirectBackend();
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
            var api = getEdgeDirectBackend();
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
        var api = getEdgeDirectBackend();
        if (!api || typeof api.getVoices !== 'function') {
          state.voiceList = [];
          diag('edge_voices_fetch_fail', 'edge_direct_api_missing');
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
        var api = getEdgeDirectBackend();
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
          engine: 'edgeDirect',
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
      if (_prepAudio) _prepAudio.volume = state.volume; // FIX-TTS-B5 #8
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
          // FIX-TTS-B5 #9: Fallback — if forward search fails, look back slightly
          // to recover from boundary text mismatches at high speed
          if (idx2 < 0 && normPos > 0) {
            idx2 = normTxt.indexOf(nw, Math.max(0, normPos - nw.length * 2));
          }
          // Cap max forward jump to prevent matching a distant repeated word
          if (idx2 >= 0 && idx2 > normPos + 200) idx2 = -1;
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
        var api = getEdgeDirectBackend();
        if (!api || typeof api.synth !== 'function') {
          state.playing = false;
          diag('edge_ws_open_fail', 'edge_direct_api_missing');
          if (typeof state.onError === 'function') state.onError({ error: 'edge_ws_open_fail', stage: 'edge_ws_open', reason: 'edge_direct_api_missing' });
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
    // FIX-TTS-B5 #8: Use pre-buffered audio element when available for near-zero gap
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

      var cacheKey = _lruKey(t);

      // FIX-TTS-B5 #8: If next block was pre-buffered and ready, use it directly
      if (_prepAudio && _prepCacheKey === cacheKey && _prepAudio.readyState >= 2) {
        var pAudio = _prepAudio;
        var pBlobUrl = pAudio._blobUrl || null;
        _prepAudio = null;
        _prepCacheKey = null;
        var pCached = _lruGet(cacheKey);
        _revokeBlobUrl();
        if (state.audio) { try { state.audio.pause(); state.audio.removeAttribute('src'); } catch {} }
        state.audio = pAudio;
        if (pBlobUrl) state.blobUrl = pBlobUrl;
        state.playing = true;
        state.paused = false;
        pAudio.onended = function () {
          if (newReqId !== state.requestId) return;
          state.playing = false;
          state.paused = false;
          _synthErrorCount = 0;
          diag('edge_play_ok', '');
          if (typeof state.onEnd === 'function') state.onEnd();
        };
        pAudio.onerror = function () {
          if (newReqId !== state.requestId) return;
          state.playing = false;
          var reason = pAudio.error ? String(pAudio.error.message || pAudio.error.code || 'unknown') : 'unknown';
          diag('edge_play_fail', reason);
          if (typeof state.onError === 'function') state.onError({ error: 'edge_play_fail', stage: 'edge_play', reason: reason });
        };
        fireBoundaries(newReqId, pCached ? pCached.boundaries : [], t);
        try {
          var pp = pAudio.play();
          if (pp && typeof pp.catch === 'function') {
            pp.catch(function (err) {
              if (newReqId !== state.requestId) return;
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
        diag('edge_preload_hit', 'prepared');
        return;
      }
      _clearPrepared();

      // Check LRU cache
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
        var api = getEdgeDirectBackend();
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
      _clearPrepared(); // FIX-TTS-B5 #8
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
      prepareNext: prepareNext, // FIX-TTS-B5 #8
      clearPreloadCache: clearPreloadCache,
      isSpeaking: isSpeaking,
      isPaused: isPaused,
      isAvailable: isAvailable,
      probe: probe,
      loadVoices: loadVoices,
      getHealth: getHealth,
      getLastDiag: getLastDiag,
      engineId: 'edgeDirect',
      set onBoundary(fn) { state.onBoundary = (typeof fn === 'function') ? fn : null; },
      set onEnd(fn) { state.onEnd = (typeof fn === 'function') ? fn : null; },
      set onError(fn) { state.onError = (typeof fn === 'function') ? fn : null; },
      set onDiag(fn) { state.onDiag = (typeof fn === 'function') ? fn : null; },
    };
  }

  window.booksTTSEngines.edgeDirect = { create: create };
})();
