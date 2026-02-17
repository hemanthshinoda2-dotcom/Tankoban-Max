// Books reader TTS core: state machine, foliate-js TTS integration, engine fallback
// TTS_REWRITE: uses foliate-js TTS class for text extraction, Overlayer for highlighting,
// renderer.scrollToAnchor for paginator-aware view tracking.
(function () {
  'use strict';

  var IDLE = 'idle';
  var PLAYING = 'playing';
  var PAUSED = 'paused';

  // FIX-R08: deterministic priority order.
  var ENGINE_PRIORITY = ['edge', 'webspeech'];

  // TTS-F05
  var TTS_PRESETS = {
    natural: { rate: 1.0, pitch: 1.0, label: 'Natural' },
    clear: { rate: 0.9, pitch: 1.05, label: 'Clear' },
    fast: { rate: 1.4, pitch: 1.0, label: 'Fast Study' },
    slow: { rate: 0.7, pitch: 0.95, label: 'Slow & Steady' },
  };

  var state = {
    status: IDLE,
    engine: null,
    engineId: '',
    allEngines: {},
    engineUsable: {},

    currentText: '',
    wordStart: -1,
    wordEnd: -1,
    blockIdx: -1,

    rate: 1.0,
    pitch: 1.0,
    preset: '',
    voiceId: '',

    lastError: null,
    lastDiag: null,
    fallbackInfo: {
      used: false,
      from: '',
      to: '',
      reason: null,
      at: 0,
    },
    selectionReason: '',

    onStateChange: null,
    onProgress: null,
    onNeedAdvance: null,
    hostFn: null,
    viewEngineFn: null,
    format: '',
    ttsHlStyle: 'highlight',
    ttsHlColor: 'grey',

    _pauseStartedAt: 0,
    _pauseNeedsRespeak: false,

    initDone: false,
    initPromise: null,
  };

  // TTS_REWRITE: foliate-js bridge state
  var _fol = {
    tts: null,          // foliate TTS class instance (per section)
    overlayer: null,     // current section's Overlayer ref
    renderer: null,      // foliate renderer ref
    marks: [],           // current block's [{name, offset}] from parseSSML
    blockRange: null,    // current block's DOM Range (for sentence highlight)
  };

  // TTS_REWRITE: TXT legacy state (only used for format === 'txt')
  var _txt = {
    blocks: [],
    segments: [],
    segIdx: -1,
    activeEl: null,
  };

  // GAP5: TTS highlight color presets
  var TTS_HL_COLORS = {
    grey:   { sentence: 'rgba(140,140,155,0.35)', word: 'rgba(130,130,145,0.6)',  line: '#9a9aa8' },
    blue:   { sentence: 'rgba(100,160,255,0.25)', word: 'rgba(90,150,255,0.55)', line: '#5a96ff' },
    yellow: { sentence: 'rgba(255,230,100,0.3)',  word: 'rgba(255,220,50,0.5)',  line: '#e6c800' },
    green:  { sentence: 'rgba(100,200,120,0.25)', word: 'rgba(80,180,100,0.5)',  line: '#50b464' },
    pink:   { sentence: 'rgba(255,130,170,0.25)', word: 'rgba(255,110,150,0.5)', line: '#ff6e96' },
    orange: { sentence: 'rgba(255,180,80,0.25)',  word: 'rgba(255,160,50,0.5)',  line: '#ffa032' },
  };

  // Pause debounce
  var _lastToggleAt = 0;
  var TOGGLE_COOLDOWN = 200;

  // GAP2: Screen Wake Lock
  var _wakeLock = null;
  async function acquireWakeLock() {
    if (_wakeLock) return;
    try {
      if (navigator && navigator.wakeLock) {
        _wakeLock = await navigator.wakeLock.request('screen');
        _wakeLock.addEventListener('release', function () { _wakeLock = null; });
      }
    } catch (e) { _wakeLock = null; }
  }
  function releaseWakeLock() {
    if (_wakeLock) { try { _wakeLock.release(); } catch {} _wakeLock = null; }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && state.status === PLAYING) acquireWakeLock();
  });

  // ── Utility ──────────────────────────────────────────────────

  function normalizeErr(err, fallbackCode) {
    if (!err) return { error: String(fallbackCode || 'unknown') };
    if (typeof err === 'string') return { error: String(err) };
    if (typeof err === 'object') {
      var out = {};
      var keys = Object.keys(err);
      for (var i = 0; i < keys.length; i++) out[keys[i]] = err[keys[i]];
      if (!out.error) out.error = String(fallbackCode || 'unknown');
      return out;
    }
    return { error: String(fallbackCode || 'unknown'), reason: String(err) };
  }

  function fire() {
    if (typeof state.onStateChange === 'function') {
      try { state.onStateChange(state.status, snippetInfo()); } catch {}
    }
  }

  function fireProgress() {
    if (typeof state.onProgress === 'function') {
      try { state.onProgress(snippetInfo()); } catch {}
    }
  }

  function snippetInfo() {
    return {
      status: state.status,
      text: state.currentText,
      wordStart: state.wordStart,
      wordEnd: state.wordEnd,
      blockIdx: state.blockIdx,
      blockCount: 0,
      segIdx: state.format === 'txt' ? _txt.segIdx : state.blockIdx,
      segCount: state.format === 'txt' ? _txt.segments.length : 0,
      rate: state.rate,
      pitch: state.pitch,
      preset: state.preset,
      engineId: state.engineId,
      selectionReason: state.selectionReason,
      lastError: state.lastError,
      lastDiag: state.lastDiag,
      fallbackInfo: state.fallbackInfo,
    };
  }

  // ── SSML Parser ──────────────────────────────────────────────
  // Strips XML tags from foliate-js SSML output, records <mark name="N"/> positions
  // as character offsets into the resulting plain text.

  function parseSSML(ssmlString) {
    var plain = '';
    var marks = [];
    if (!ssmlString) return { plainText: plain, marks: marks };

    var s = String(ssmlString);
    var i = 0;
    var len = s.length;
    while (i < len) {
      if (s[i] === '<') {
        // Check for <mark name="..." or <mark name='...'
        var tagEnd = s.indexOf('>', i);
        if (tagEnd < 0) break;
        var tagContent = s.substring(i + 1, tagEnd);
        // Detect <mark .../>  or <mark ...>
        var markMatch = tagContent.match(/^mark\s+name\s*=\s*["']([^"']*)["']/i);
        if (markMatch) {
          marks.push({ name: markMatch[1], offset: plain.length });
        }
        i = tagEnd + 1;
      } else if (s[i] === '&') {
        // Basic XML entity decode
        var semi = s.indexOf(';', i);
        if (semi > i && semi - i < 10) {
          var ent = s.substring(i + 1, semi);
          if (ent === 'amp') { plain += '&'; }
          else if (ent === 'lt') { plain += '<'; }
          else if (ent === 'gt') { plain += '>'; }
          else if (ent === 'apos') { plain += "'"; }
          else if (ent === 'quot') { plain += '"'; }
          else { plain += s.substring(i, semi + 1); }
          i = semi + 1;
        } else {
          plain += s[i];
          i++;
        }
      } else {
        plain += s[i];
        i++;
      }
    }
    return { plainText: plain, marks: marks };
  }

  // Find the nearest mark whose offset <= charIndex
  function findNearestMark(marks, charIndex) {
    if (!marks || !marks.length) return null;
    var best = null;
    for (var i = 0; i < marks.length; i++) {
      if (marks[i].offset <= charIndex) {
        best = marks[i].name;
      } else {
        break;
      }
    }
    return best;
  }

  // ── Overlayer Highlighting ───────────────────────────────────

  function getDrawFn() {
    var style = state.ttsHlStyle || 'highlight';
    // Overlayer is imported from foliate vendor; get static methods via prototype
    // We access it dynamically since it's an ES module class
    var Overlayer = null;
    try {
      if (_fol.overlayer && _fol.overlayer.constructor) {
        Overlayer = _fol.overlayer.constructor;
      }
    } catch {}
    if (!Overlayer) return null;
    if (style === 'underline') return Overlayer.underline;
    if (style === 'squiggly') return Overlayer.squiggly;
    if (style === 'strikethrough') return Overlayer.strikethrough;
    return Overlayer.highlight;
  }

  function getDrawOpts(colors, type) {
    var style = state.ttsHlStyle || 'highlight';
    if (style === 'highlight') {
      return { color: type === 'word' ? colors.word : colors.sentence };
    }
    if (style === 'underline') {
      return { color: colors.line, width: type === 'word' ? 3 : 2 };
    }
    if (style === 'squiggly') {
      return { color: colors.line };
    }
    if (style === 'strikethrough') {
      return { color: colors.line, width: type === 'word' ? 3 : 2 };
    }
    return { color: colors.sentence };
  }

  function clearTtsOverlays() {
    if (!_fol.overlayer) return;
    try { _fol.overlayer.remove('tts-word'); } catch {}
    try { _fol.overlayer.remove('tts-sentence'); } catch {}
  }

  // Highlight callback passed to view.initTTS() — called by tts.setMark(name)
  function highlightRange(range) {
    if (!_fol.overlayer || !range) return;
    try { _fol.overlayer.remove('tts-word'); } catch {}
    var drawFn = getDrawFn();
    if (!drawFn) return;
    var colors = TTS_HL_COLORS[state.ttsHlColor] || TTS_HL_COLORS.grey;
    try {
      _fol.overlayer.add('tts-word', range, drawFn, getDrawOpts(colors, 'word'));
    } catch {}
    // Paginator-aware scroll
    if (_fol.renderer) {
      try { _fol.renderer.scrollToAnchor(range, true); } catch {}
    }
  }

  // Highlight the entire block range (sentence-level)
  function highlightBlockRange(blockRange) {
    if (!_fol.overlayer) return;
    try { _fol.overlayer.remove('tts-sentence'); } catch {}
    try { _fol.overlayer.remove('tts-word'); } catch {}
    if (!blockRange) return;
    _fol.blockRange = blockRange;
    var drawFn = getDrawFn();
    if (!drawFn) return;
    var colors = TTS_HL_COLORS[state.ttsHlColor] || TTS_HL_COLORS.grey;
    try {
      _fol.overlayer.add('tts-sentence', blockRange, drawFn, getDrawOpts(colors, 'sentence'));
    } catch {}
    // Scroll to block start
    if (_fol.renderer) {
      try { _fol.renderer.scrollToAnchor(blockRange, true); } catch {}
    }
  }

  // ── foliate-js TTS init ──────────────────────────────────────

  // TTS_REWRITE: get the foliate view engine instance via callback from reader_tts_ui
  function _getViewEngine() {
    return (typeof state.viewEngineFn === 'function') ? state.viewEngineFn() : null;
  }

  async function _initFoliateTTS() {
    var eng = _getViewEngine();
    if (!eng) return false;
    var view = typeof eng.getFoliateView === 'function' ? eng.getFoliateView() : null;
    if (!view) return false;
    var renderer = typeof eng.getFoliateRenderer === 'function' ? eng.getFoliateRenderer() : null;
    if (!renderer) return false;

    try {
      await view.initTTS('word', highlightRange);
    } catch (e) {
      return false;
    }

    _fol.tts = view.tts || null;
    _fol.renderer = renderer;
    // Get overlayer from current section
    try {
      var contents = renderer.getContents();
      _fol.overlayer = (contents && contents[0]) ? contents[0].overlayer : null;
    } catch {
      _fol.overlayer = null;
    }
    return !!_fol.tts;
  }

  async function _reinitFoliateTTS() {
    var eng = _getViewEngine();
    if (!eng) return false;
    var view = typeof eng.getFoliateView === 'function' ? eng.getFoliateView() : null;
    if (!view) return false;

    // Force re-creation by clearing cached instance
    view.tts = null;
    return _initFoliateTTS();
  }

  // ── Block Playback (EPUB via foliate-js) ─────────────────────

  function speakCurrentBlock(ssml) {
    if (!ssml) {
      handleAllBlocksDone();
      return;
    }
    if (!state.engine) { stop(); return; }

    var parsed = parseSSML(ssml);
    _fol.marks = parsed.marks;
    state.currentText = parsed.plainText;
    state.wordStart = -1;
    state.wordEnd = -1;
    state.blockIdx++;

    // The foliate TTS class already called highlightRange for the block
    // when we called start()/next()/prev() if paused=true was passed.
    // For playing, we highlight the block range ourselves.
    // tts.start()/next() return the SSML but the block range is held internally.
    // We rely on setMark() for word-level and scrollToAnchor for view tracking.

    fireProgress();
    state.engine.speak(parsed.plainText);
    _preloadNextBlock();
  }

  function _preloadNextBlock() {
    if (!state.engine || typeof state.engine.preload !== 'function') return;
    if (!_fol.tts) return;
    // Peek next block's SSML for preloading
    // Unfortunately foliate TTS doesn't have a peek method, so we skip preload
    // for the first iteration. The engine cache from previous blocks helps.
  }

  function handleBlockEnd() {
    if (state.status !== PLAYING) return;

    // TXT legacy path
    if (state.format === 'txt') {
      _txtHandleBlockEnd();
      return;
    }

    if (!_fol.tts) { stop(); return; }
    var ssml = _fol.tts.next();
    if (ssml) {
      speakCurrentBlock(ssml);
    } else {
      handleAllBlocksDone();
    }
  }

  function handleAllBlocksDone() {
    if (typeof state.onNeedAdvance === 'function') {
      state.onNeedAdvance().then(function (advanced) {
        if (!advanced || state.status !== PLAYING) { stop(); return; }
        // After section advance, _reinitFoliateTTS is called by onNeedAdvance
        // then we start from the new section's first block
        if (!_fol.tts) { stop(); return; }
        var ssml = _fol.tts.start();
        if (ssml) {
          state.blockIdx = -1; // reset, speakCurrentBlock will increment
          speakCurrentBlock(ssml);
        } else {
          stop();
        }
      }).catch(function () { stop(); });
    } else {
      stop();
    }
  }

  function handleBoundary(charIndex, charLength, name) {
    if (name !== 'word' || state.status !== PLAYING) return;
    state.wordStart = charIndex;
    state.wordEnd = charIndex + Math.max(charLength, 1);
    if (charLength === 0 && state.currentText) {
      var rest = state.currentText.slice(charIndex);
      var m = rest.match(/^\S+/);
      if (m) state.wordEnd = charIndex + m[0].length;
    }
    // Map charIndex to nearest foliate mark, call setMark for Overlayer highlight
    if (_fol.tts && _fol.marks.length) {
      var markName = findNearestMark(_fol.marks, charIndex);
      if (markName) {
        try { _fol.tts.setMark(markName); } catch {}
      }
    }
    fireProgress();
  }

  function handleError(err) {
    state.lastError = normalizeErr(err, 'tts_error');
    stop();
  }

  // ── Engine Management (preserved from original) ──────────────

  function bindEngine(engine) {
    engine.onEnd = handleBlockEnd;
    engine.onError = handleErrorWithFallback;
    engine.onBoundary = handleBoundary;

    if ('onDiag' in engine) {
      engine.onDiag = function (d) {
        if (!d) return;
        state.lastDiag = {
          code: String(d.code || ''),
          detail: String(d.detail || ''),
          at: Date.now(),
        };
        fireProgress();
      };
    }

    if (state.rate) engine.setRate(state.rate);
    if (state.voiceId) engine.setVoice(state.voiceId);
    if (state.pitch !== 1.0 && typeof engine.setPitch === 'function') {
      engine.setPitch(state.pitch);
    }
  }

  function isEngineUsable(id) {
    return !!state.engineUsable[String(id || '')];
  }

  function switchEngine(id) {
    var eid = String(id || '');
    var inst = state.allEngines[eid];
    if (!inst) return false;
    if (!isEngineUsable(eid)) return false;
    if (state.engine && state.engine !== inst) {
      try { state.engine.cancel(); } catch {}
    }
    state.engine = inst;
    state.engineId = eid;
    bindEngine(inst);
    return true;
  }

  function promoteFallback(normalizedErr) {
    if (state.fallbackInfo.used) return false;
    var fromId = String(state.engineId || '');
    if (!fromId || fromId === 'webspeech') return false;
    if (!state.allEngines.webspeech || !isEngineUsable('webspeech')) return false;
    if (!switchEngine('webspeech')) return false;

    state.fallbackInfo = {
      used: true,
      from: fromId,
      to: 'webspeech',
      reason: normalizedErr,
      at: Date.now(),
    };
    state.selectionReason = 'runtime_fallback';
    state.lastError = {
      error: 'edge_fallback_to_webspeech',
      from: fromId,
      to: 'webspeech',
      cause: normalizedErr,
    };

    // Re-speak current block after fallback
    if (state.status === PLAYING && state.currentText) {
      state.engine.speak(state.currentText);
    }
    fire();
    fireProgress();
    return true;
  }

  function maybeMarkInitFallback(preferredId) {
    if (state.fallbackInfo.used) return;
    if (state.engineId !== 'webspeech') return;
    var edgePresent = !!state.allEngines.edge;
    var edgeUsable = !!state.engineUsable.edge;
    var webUsable = !!state.engineUsable.webspeech;
    if (!webUsable) return;
    if (!edgePresent || edgeUsable) return;

    var reason = {
      error: 'edge_unavailable_init',
      preferred: String(preferredId || ''),
    };
    if (state.lastDiag) {
      if (state.lastDiag.code) reason.diagCode = String(state.lastDiag.code);
      if (state.lastDiag.detail) reason.diagDetail = String(state.lastDiag.detail);
    }

    state.fallbackInfo = {
      used: true,
      from: 'edge',
      to: 'webspeech',
      reason: reason,
      at: Date.now(),
    };
    state.selectionReason = 'init_fallback';
    state.lastError = {
      error: 'edge_fallback_to_webspeech',
      from: 'edge',
      to: 'webspeech',
      cause: reason,
    };
  }

  function handleErrorWithFallback(err) {
    var normalized = normalizeErr(err, 'engine_error');
    state.lastError = normalized;
    if (!promoteFallback(normalized)) {
      handleError(normalized);
    }
  }

  async function probeEngine(eid, eng) {
    if (!eng) return false;
    if (typeof eng.probe === 'function') {
      try {
        var ok = !!(await eng.probe({ text: 'Edge probe', voice: 'en-US-AriaNeural', requireSynthesis: true }));
        if (!ok && typeof eng.getHealth === 'function') {
          try {
            var h = eng.getHealth();
            state.lastDiag = {
              code: 'edge_probe_fail',
              detail: String(h && h.reason || 'edge_probe_failed'),
              at: Date.now(),
            };
          } catch {}
        }
        return ok;
      } catch {
        if (String(eid || '') === 'edge') {
          state.lastDiag = {
            code: 'edge_probe_fail',
            detail: 'edge_probe_exception',
            at: Date.now(),
          };
        }
        return false;
      }
    }
    try {
      return !!(eng.isAvailable && eng.isAvailable());
    } catch {
      return false;
    }
  }

  async function init(opts) {
    if (state.initPromise) return state.initPromise;

    state.initPromise = (async function () {
      var o = (opts && typeof opts === 'object') ? opts : {};
      state.hostFn = o.getHost || null;
      state.viewEngineFn = o.getViewEngine || null;
      state.format = String(o.format || '').toLowerCase();
      state.onNeedAdvance = o.onNeedAdvance || null;
      state.fallbackInfo = { used: false, from: '', to: '', reason: null, at: 0 };
      state.lastError = null;
      state.lastDiag = null;
      state.selectionReason = '';
      state.initDone = false;

      var factories = window.booksTTSEngines || {};
      state.allEngines = {};
      state.engineUsable = {};
      state.engine = null;
      state.engineId = '';

      for (var i = 0; i < ENGINE_PRIORITY.length; i++) {
        var id = ENGINE_PRIORITY[i];
        if (!factories[id]) continue;
        try {
          var inst = factories[id].create();
          if (!inst) continue;
          state.allEngines[id] = inst;
          state.engineUsable[id] = false;
        } catch {}
      }

      for (var j = 0; j < ENGINE_PRIORITY.length; j++) {
        var eid = ENGINE_PRIORITY[j];
        var eng = state.allEngines[eid];
        if (!eng) continue;

        state.engineUsable[eid] = !!(await probeEngine(eid, eng));

        if (state.engineUsable[eid] && typeof eng.loadVoices === 'function') {
          try { await eng.loadVoices({ maxAgeMs: 0 }); } catch {}
        }
      }

      var preferredId = '';
      if (o.preferEngine) preferredId = String(o.preferEngine || '');

      var selected = false;
      if (preferredId && state.allEngines[preferredId] && isEngineUsable(preferredId)) {
        selected = switchEngine(preferredId);
      }
      if (!selected) {
        for (var p = 0; p < ENGINE_PRIORITY.length; p++) {
          var pid = ENGINE_PRIORITY[p];
          if (state.allEngines[pid] && isEngineUsable(pid)) {
            selected = switchEngine(pid);
            if (selected) break;
          }
        }
      }
      maybeMarkInitFallback(preferredId);

      if (!state.engine) {
        state.lastError = {
          error: 'tts_no_usable_engine',
          usable: state.engineUsable,
        };
      } else if (!state.selectionReason) {
        state.selectionReason = 'selected_' + String(state.engineId || 'unknown');
      }

      state.initDone = true;
      fireProgress();
    })();

    try {
      await state.initPromise;
    } finally {
      state.initPromise = null;
    }
  }

  // ── Play / Pause / Resume / Stop ─────────────────────────────

  async function play() {
    if (!state.engine) return;

    if (state.status === PAUSED) {
      resume();
      return;
    }

    // TXT legacy path
    if (state.format === 'txt') {
      _txtPlay();
      return;
    }

    // EPUB/PDF: initialize foliate-js TTS
    var ok = await _initFoliateTTS();
    if (!ok) {
      // Retry up to 3 times (content may still be loading)
      var retries = 0;
      var tryInit = async function () {
        retries++;
        ok = await _initFoliateTTS();
        if (ok && _fol.tts) {
          var ssml = _fol.tts.start();
          if (ssml) {
            state.blockIdx = -1;
            state.status = PLAYING;
            acquireWakeLock();
            fire();
            speakCurrentBlock(ssml);
          }
        } else if (retries < 3) {
          setTimeout(tryInit, 300 * retries);
        }
      };
      setTimeout(tryInit, 300);
      return;
    }

    var ssml = _fol.tts.start();
    if (!ssml) return;

    state.blockIdx = -1;
    state.status = PLAYING;
    acquireWakeLock();
    fire();
    speakCurrentBlock(ssml);
  }

  function pause() {
    if (!state.engine || state.status !== PLAYING) return;
    if (Date.now() - _lastToggleAt < TOGGLE_COOLDOWN) return;
    _lastToggleAt = Date.now();
    state._pauseStartedAt = Date.now();
    state.engine.pause();
    // TTS_REWRITE: verify engine actually paused — if it silently failed,
    // audio is still audible. Force cancel + mark as needing re-speak on resume.
    if (typeof state.engine.isSpeaking === 'function' && state.engine.isSpeaking()) {
      try { state.engine.cancel(); } catch {}
      state._pauseNeedsRespeak = true;
    }
    state.status = PAUSED;
    releaseWakeLock();
    fire();
  }

  function resume() {
    if (!state.engine || state.status !== PAUSED) return;
    if (Date.now() - _lastToggleAt < TOGGLE_COOLDOWN) return;
    _lastToggleAt = Date.now();

    // TTS_REWRITE: if pause had to force-cancel (engine didn't obey pause),
    // or WebSpeech was paused >10s (Chromium bug), re-speak from current position.
    var needsRespeak = !!state._pauseNeedsRespeak;
    if (!needsRespeak && state.engineId === 'webspeech') {
      var pauseDuration = Date.now() - (state._pauseStartedAt || 0);
      needsRespeak = pauseDuration > 10000;
    }

    if (needsRespeak) {
      try { state.engine.cancel(); } catch {}
      state.status = PLAYING;
      state._pauseStartedAt = 0;
      state._pauseNeedsRespeak = false;
      acquireWakeLock();
      if (state.format !== 'txt' && _fol.tts) {
        var ssml = _fol.tts.resume();
        if (ssml) { speakCurrentBlock(ssml); }
      } else if (state.currentText) {
        state.engine.speak(state.currentText);
      }
      fire();
      return;
    }

    state._pauseStartedAt = 0;
    state._pauseNeedsRespeak = false;
    state.engine.resume();
    state.status = PLAYING;
    acquireWakeLock();
    fire();
  }

  function stop() {
    if (state.engine) {
      try { state.engine.cancel(); } catch {}
    }
    clearTtsOverlays();
    // TXT cleanup
    if (_txt.activeEl) {
      try { _txt.activeEl.classList.remove('booksReaderTtsActive'); } catch {}
      _txt.activeEl = null;
    }
    state.blockIdx = -1;
    state.currentText = '';
    state.wordStart = -1;
    state.wordEnd = -1;
    state.status = IDLE;
    state._pauseStartedAt = 0;
    state._pauseNeedsRespeak = false;
    _fol.marks = [];
    _fol.blockRange = null;
    _txt.segIdx = -1;
    releaseWakeLock();
    fire();
  }

  // ── Navigation ───────────────────────────────────────────────

  function stepBlock(delta) {
    if (state.status !== PLAYING && state.status !== PAUSED) return;

    // TXT legacy
    if (state.format === 'txt') {
      _txtStepSegment(delta);
      return;
    }

    if (!_fol.tts) return;
    if (state.engine) { try { state.engine.cancel(); } catch {} }
    clearTtsOverlays();

    var isPaused = (state.status === PAUSED);
    var ssml = (delta > 0) ? _fol.tts.next(isPaused) : _fol.tts.prev(isPaused);
    if (!ssml) return;

    if (isPaused) {
      var parsed = parseSSML(ssml);
      _fol.marks = parsed.marks;
      state.currentText = parsed.plainText;
      state.wordStart = -1;
      state.wordEnd = -1;
      state.blockIdx++;
      fireProgress();
      fire();
    } else {
      speakCurrentBlock(ssml);
      fire();
    }
  }

  function jumpApproxMs(deltaMs) {
    if (state.status !== PLAYING && state.status !== PAUSED) return;

    // TXT legacy
    if (state.format === 'txt') {
      _txtJumpApproxMs(deltaMs);
      return;
    }

    if (!_fol.tts) return;
    // Estimate how many blocks to skip (~150 chars per block, ~15 chars/s at 1.0x)
    var cps = 15 * (state.rate || 1.0);
    var deltaChars = Math.abs(deltaMs / 1000) * cps;
    var blocksToSkip = Math.max(1, Math.round(deltaChars / 150));
    var dir = deltaMs > 0 ? 1 : -1;

    if (state.engine) { try { state.engine.cancel(); } catch {} }
    clearTtsOverlays();

    var isPaused = (state.status === PAUSED);
    var ssml = null;
    for (var i = 0; i < blocksToSkip; i++) {
      var next = (dir > 0) ? _fol.tts.next(isPaused) : _fol.tts.prev(isPaused);
      if (!next) break;
      ssml = next;
    }
    if (!ssml) return;

    if (isPaused) {
      var parsed = parseSSML(ssml);
      _fol.marks = parsed.marks;
      state.currentText = parsed.plainText;
      state.wordStart = -1;
      state.wordEnd = -1;
      fireProgress();
      fire();
    } else {
      speakCurrentBlock(ssml);
      fire();
    }
  }

  function playFromSelection(selectedText) {
    if (!state.engine) return false;

    // TXT legacy
    if (state.format === 'txt') {
      return _txtPlayFromSelection(selectedText);
    }

    if (!_fol.tts) return false;
    // Try to get selection Range from iframe
    var range = _getIframeSelectionRange();
    if (range) {
      var ssml = _fol.tts.from(range);
      if (ssml) {
        if (state.engine) { try { state.engine.cancel(); } catch {} }
        clearTtsOverlays();
        state.blockIdx = -1;
        state.status = PLAYING;
        acquireWakeLock();
        fire();
        speakCurrentBlock(ssml);
        return true;
      }
    }
    // Fallback: just start from beginning
    return false;
  }

  function playFromElement(el) {
    if (!el || !state.engine) return false;

    // TXT legacy
    if (state.format === 'txt') {
      return _txtPlayFromElement(el);
    }

    if (!_fol.tts) return false;
    // Create a collapsed Range at the element
    try {
      var doc = el.ownerDocument || document;
      var range = doc.createRange();
      range.selectNodeContents(el);
      range.collapse(true); // collapse to start
      var ssml = _fol.tts.from(range);
      if (ssml) {
        if (state.engine) { try { state.engine.cancel(); } catch {} }
        clearTtsOverlays();
        state.blockIdx = -1;
        state.status = PLAYING;
        acquireWakeLock();
        fire();
        speakCurrentBlock(ssml);
        return true;
      }
    } catch {}
    return false;
  }

  function _getIframeSelectionRange() {
    try {
      var eng = _getViewEngine();
      if (!eng || !eng.getFoliateRenderer) return null;
      var renderer = eng.getFoliateRenderer();
      if (!renderer) return null;
      var contents = renderer.getContents();
      if (!contents || !contents[0] || !contents[0].doc) return null;
      var doc = contents[0].doc;
      var sel = doc.getSelection ? doc.getSelection() : null;
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        return sel.getRangeAt(0);
      }
    } catch {}
    return null;
  }

  // ── Rate / Pitch / Voice / Preset / Highlight ────────────────

  var TTS_RATE_MIN = 0.5;
  var TTS_RATE_MAX = 3.0;

  function setRate(r) {
    state.rate = Math.max(TTS_RATE_MIN, Math.min(TTS_RATE_MAX, Number(r) || 1.0));
    if (state.engine) state.engine.setRate(state.rate);
  }

  function setPitch(p) {
    state.pitch = Math.max(0.5, Math.min(2.0, Number(p) || 1.0));
    if (state.engine && typeof state.engine.setPitch === 'function') {
      state.engine.setPitch(state.pitch);
    }
  }

  function setPreset(presetId) {
    var p = TTS_PRESETS[presetId];
    if (!p) return;
    state.preset = presetId;
    setRate(p.rate);
    setPitch(p.pitch);
  }

  function setHighlightStyle(style) {
    var valid = ['highlight', 'underline', 'squiggly', 'strikethrough'];
    if (valid.indexOf(style) < 0) return;
    state.ttsHlStyle = style;
    // Redraw active overlays with new style
    _redrawActiveOverlays();
  }

  function setHighlightColor(colorName) {
    if (!TTS_HL_COLORS[colorName]) return;
    state.ttsHlColor = colorName;
    _redrawActiveOverlays();
  }

  function _redrawActiveOverlays() {
    // If overlayer has active highlights, remove and re-add with new style
    if (!_fol.overlayer) return;
    if (_fol.blockRange) {
      highlightBlockRange(_fol.blockRange);
    }
  }

  function setVoice(voiceId) {
    state.voiceId = String(voiceId || '');
    var ids = Object.keys(state.allEngines);
    for (var i = 0; i < ids.length; i++) {
      var eid = ids[i];
      var eng = state.allEngines[eid];
      if (!eng) continue;
      if (!isEngineUsable(eid)) continue;
      var voices = [];
      try { voices = eng.getVoices ? eng.getVoices() : []; } catch { voices = []; }
      for (var v = 0; v < voices.length; v++) {
        if (String(voices[v].voiceURI || '') === state.voiceId) {
          if (eid !== state.engineId) switchEngine(eid);
          if (state.engine) state.engine.setVoice(state.voiceId);
          fire();
          return;
        }
      }
    }
    if (state.engine) state.engine.setVoice(state.voiceId);
  }

  function getVoices() {
    var all = [];
    for (var i = 0; i < ENGINE_PRIORITY.length; i++) {
      var eid = ENGINE_PRIORITY[i];
      var eng = state.allEngines[eid];
      if (!eng || !isEngineUsable(eid)) continue;
      var voices = [];
      try { voices = eng.getVoices ? eng.getVoices() : []; } catch { voices = []; }
      for (var v = 0; v < voices.length; v++) {
        var voice = voices[v];
        if (!voice.engine) voice.engine = eid;
        all.push(voice);
      }
    }
    return all;
  }

  // ── Destroy ──────────────────────────────────────────────────

  function destroy() {
    stop();
    var ids = Object.keys(state.allEngines);
    for (var i = 0; i < ids.length; i++) {
      try { state.allEngines[ids[i]].cancel(); } catch {}
      try { if (state.allEngines[ids[i]].clearPreloadCache) state.allEngines[ids[i]].clearPreloadCache(); } catch {}
    }
    state.engine = null;
    state.engineId = '';
    state.allEngines = {};
    state.engineUsable = {};
    _fol.tts = null;
    _fol.overlayer = null;
    _fol.renderer = null;
    _fol.marks = [];
    _fol.blockRange = null;
    _txt.blocks = [];
    _txt.segments = [];
    _txt.segIdx = -1;
    state.hostFn = null;
    state.viewEngineFn = null;
    state.onNeedAdvance = null;
    state.initDone = false;
    state.initPromise = null;
  }

  // ── TXT Legacy Path ──────────────────────────────────────────
  // For plain text files, there's no foliate view. Use simple block extraction.

  var BLOCK_TAGS = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'figcaption', 'pre', 'td', 'th', 'dt', 'dd'];

  function _txtIsBlockTag(tagName) {
    return BLOCK_TAGS.indexOf(String(tagName || '').toLowerCase()) >= 0;
  }

  function _txtExtractBlocks() {
    _txt.blocks = [];
    _txt.segments = [];
    var host = (typeof state.hostFn === 'function') ? state.hostFn() : null;
    if (!host) return;
    var txtDoc = host.querySelector('.booksReaderTextDoc');
    if (!txtDoc) return;
    var doc = txtDoc.ownerDocument || document;
    var NF = (doc.defaultView && doc.defaultView.NodeFilter) ? doc.defaultView.NodeFilter : NodeFilter;
    var walker = doc.createTreeWalker(txtDoc, NF.SHOW_ELEMENT);
    var node = walker.nextNode();
    while (node) {
      var tag = (node.tagName || '').toLowerCase();
      if (_txtIsBlockTag(tag)) {
        var text = (node.textContent || '').trim();
        if (text.length > 1) {
          _txt.blocks.push({ text: text, element: node });
          _txt.segments.push({ text: text, blockIdx: _txt.blocks.length - 1, element: node });
        }
      }
      node = walker.nextNode();
    }
  }

  function _txtPlay() {
    _txtExtractBlocks();
    if (!_txt.segments.length) return;
    _txt.segIdx = 0;
    state.status = PLAYING;
    acquireWakeLock();
    fire();
    _txtSpeakSegment();
  }

  function _txtSpeakSegment() {
    if (_txt.segIdx < 0 || _txt.segIdx >= _txt.segments.length) {
      handleAllBlocksDone();
      return;
    }
    if (!state.engine) { stop(); return; }
    var seg = _txt.segments[_txt.segIdx];
    state.currentText = seg.text;
    state.blockIdx = seg.blockIdx;
    state.wordStart = -1;
    state.wordEnd = -1;
    // Simple DOM highlight for TXT
    if (_txt.activeEl) {
      try { _txt.activeEl.classList.remove('booksReaderTtsActive'); } catch {}
    }
    try {
      seg.element.classList.add('booksReaderTtsActive');
      seg.element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch {}
    _txt.activeEl = seg.element;
    fireProgress();
    state.engine.speak(seg.text);
  }

  function _txtHandleBlockEnd() {
    if (state.status !== PLAYING) return;
    _txt.segIdx++;
    if (_txt.segIdx < _txt.segments.length) {
      _txtSpeakSegment();
    } else {
      handleAllBlocksDone();
    }
  }

  function _txtStepSegment(delta) {
    if (state.status !== PLAYING && state.status !== PAUSED) return;
    if (!_txt.segments.length) return;
    var target = _txt.segIdx + delta;
    target = Math.max(0, Math.min(_txt.segments.length - 1, target));
    if (target === _txt.segIdx) return;
    if (state.engine) { try { state.engine.cancel(); } catch {} }
    _txt.segIdx = target;
    if (state.status === PAUSED) {
      var seg = _txt.segments[_txt.segIdx];
      state.currentText = seg.text;
      state.blockIdx = seg.blockIdx;
      state.wordStart = -1;
      state.wordEnd = -1;
      fireProgress();
      fire();
    } else {
      _txtSpeakSegment();
      fire();
    }
  }

  function _txtJumpApproxMs(deltaMs) {
    var cps = 15 * (state.rate || 1.0);
    var deltaChars = Math.abs(deltaMs / 1000) * cps;
    var dir = deltaMs > 0 ? 1 : -1;
    var remaining = deltaChars;
    var idx = _txt.segIdx;
    while (remaining > 0 && idx >= 0 && idx < _txt.segments.length) {
      remaining -= (_txt.segments[idx].text || '').length;
      if (remaining > 0) idx += dir;
    }
    idx = Math.max(0, Math.min(_txt.segments.length - 1, idx));
    if (idx === _txt.segIdx) idx = Math.max(0, Math.min(_txt.segments.length - 1, _txt.segIdx + dir));
    if (idx === _txt.segIdx) return;
    if (state.engine) { try { state.engine.cancel(); } catch {} }
    _txt.segIdx = idx;
    if (state.status === PAUSED) {
      var seg = _txt.segments[_txt.segIdx];
      state.currentText = seg.text;
      state.blockIdx = seg.blockIdx;
      state.wordStart = -1;
      state.wordEnd = -1;
      fireProgress();
      fire();
    } else {
      _txtSpeakSegment();
      fire();
    }
  }

  function _txtPlayFromSelection(selectedText) {
    if (!selectedText || !selectedText.trim()) return false;
    _txtExtractBlocks();
    if (!_txt.segments.length) return false;
    var needle = selectedText.trim().toLowerCase();
    for (var i = 0; i < _txt.segments.length; i++) {
      if ((_txt.segments[i].text || '').toLowerCase().indexOf(needle) >= 0) {
        _txt.segIdx = i;
        state.status = PLAYING;
        acquireWakeLock();
        fire();
        _txtSpeakSegment();
        return true;
      }
    }
    return false;
  }

  function _txtPlayFromElement(el) {
    _txtExtractBlocks();
    if (!_txt.segments.length) return false;
    var target = el;
    for (var depth = 0; depth < 8 && target; depth++) {
      for (var i = 0; i < _txt.segments.length; i++) {
        if (_txt.segments[i].element === target) {
          if (state.engine) { try { state.engine.cancel(); } catch {} }
          _txt.segIdx = i;
          state.status = PLAYING;
          acquireWakeLock();
          fire();
          _txtSpeakSegment();
          return true;
        }
      }
      target = target.parentElement;
    }
    return false;
  }

  // ── Public API ───────────────────────────────────────────────

  window.booksTTS = {
    init: init,
    play: play,
    pause: pause,
    resume: resume,
    stop: stop,
    destroy: destroy,
    setRate: setRate,
    setVoice: setVoice,
    getVoices: getVoices,
    setPitch: setPitch,
    setPreset: setPreset,
    getPresets: function () { return TTS_PRESETS; },
    getPitch: function () { return state.pitch; },
    stepSegment: stepBlock,   // keep old name for UI compatibility
    playFromSelection: playFromSelection,
    playFromElement: playFromElement,
    jumpApproxMs: jumpApproxMs,
    getRateLimits: function () { return { min: TTS_RATE_MIN, max: TTS_RATE_MAX }; },
    getState: function () { return state.status; },
    getSnippet: function () { return snippetInfo(); },
    getRate: function () { return state.rate; },
    isAvailable: function () { return !!(state.engine && isEngineUsable(state.engineId)); },
    getEngineId: function () { return state.engineId; },
    getAvailableEngines: function () { return Object.keys(state.allEngines).filter(isEngineUsable); },
    getEngineUsableMap: function () { return { ...state.engineUsable }; },
    getFallbackInfo: function () { return { ...state.fallbackInfo }; },
    getLastDiag: function () { return state.lastDiag ? { ...state.lastDiag } : null; },
    switchEngine: switchEngine,
    setHighlightStyle: setHighlightStyle,
    setHighlightColor: setHighlightColor,
    getHighlightStyles: function () { return ['highlight', 'underline', 'squiggly', 'strikethrough']; },
    getHighlightColors: function () { return Object.keys(TTS_HL_COLORS); },
    getHighlightStyle: function () { return state.ttsHlStyle; },
    getHighlightColor: function () { return state.ttsHlColor; },
    // TTS_REWRITE: expose _reinitFoliateTTS for section transitions
    _reinitFoliateTTS: _reinitFoliateTTS,
    set onStateChange(fn) { state.onStateChange = typeof fn === 'function' ? fn : null; },
    set onProgress(fn) { state.onProgress = typeof fn === 'function' ? fn : null; },
  };
})();
