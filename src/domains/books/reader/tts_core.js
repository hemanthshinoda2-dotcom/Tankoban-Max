// Books reader TTS core: state machine, foliate-js TTS integration, engine fallback
// TTS_REWRITE: uses foliate-js TTS class for text extraction, Overlayer for highlighting,
// renderer.scrollToAnchor for paginator-aware view tracking.
(function () {
  'use strict';

  var IDLE = 'idle';
  var PLAYING = 'playing';
  var PAUSED = 'paused';
  var SECTION_TRANSITION = 'section_transition'; // FIX-TTS05: between sections

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
    onSectionEnd: null,    // FIX-TTS05: fired when section playback exhausted
    onSectionStart: null,  // FIX-TTS05: fired when new section begins
    onDocumentEnd: null,   // FIX-TTS05: fired when entire document is done
    hostFn: null,
    viewEngineFn: null,
    format: '',
    ttsHlStyle: 'highlight',
    ttsHlColor: 'grey',
    ttsHlGranularity: 'sentence', // FIX-TTS05: 'sentence' (default) or 'word'
    ttsWordHlStyle: 'highlight',  // FIX-TTS05: independent word highlight style
    ttsWordHlColor: 'blue',       // FIX-TTS05: independent word highlight color

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
    _lastBlockEl: null,  // last block-level element highlighted (for sentence tracking)
    _preloadTimer: null, // setTimeout id for delayed queue fill
    _preloadedSSML: null,// legacy compat — kept for backward compat during transition
    _preloadActive: false,// true after iterator advance — setMark unreliable for current block
    _savedRanges: null,  // FIX-TTS04: snapshot of current block's mark→Range map before preload advance
    _queue: [],          // FIX-TTS05: multi-chunk lookahead [{ssml, plainText, marks, savedRanges}]
    _queueFilling: false,// FIX-TTS05: true while fill is in progress
  };

  var LOOKAHEAD_DEPTH = 4; // FIX-TTS05: blocks to pre-synthesize ahead (matches Readest)

  // FIX-TTS04: CSS Custom Highlight API state for word-level highlighting
  var _cssHl = { word: null, doc: null, styleEl: null };

  // TTS_REWRITE: TXT legacy state (only used for format === 'txt')
  var _txt = {
    blocks: [],
    segments: [],
    segIdx: -1,
    activeEl: null,
  };

  // GAP5: TTS highlight color presets
  // Use solid colors — Overlayer.highlight applies its own 0.3 opacity via CSS variable.
  // Using rgba here would double-fade (alpha * 0.3 = nearly invisible).
  // FIX-TTS03: softened palette — word is a brighter shade over sentence for karaoke effect
  var TTS_HL_COLORS = {
    grey:   { sentence: '#8c8c9b', word: '#9a9aa8',  line: '#9a9aa8' },
    blue:   { sentence: '#64a0ff', word: '#7ab0ff',  line: '#5a96ff' },
    yellow: { sentence: '#ffe664', word: '#fff090',  line: '#e6c800' },
    green:  { sentence: '#64c878', word: '#7ad890',  line: '#50b464' },
    pink:   { sentence: '#ff82aa', word: '#ff9abe',  line: '#ff6e96' },
    orange: { sentence: '#ffb450', word: '#ffc878',  line: '#ffa032' },
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

  // FIX-TTS05: split long blocks into sentence-sized chunks for faster start latency.
  // Inspired by Thorium's splitSentences flag and Readest's per-sentence synthesis.
  // Short blocks (<=200 chars) are returned as-is. Sub-chunks share the parent block's
  // savedRanges so sentence-level Overlayer highlight still covers the whole paragraph.
  function _splitBlock(ssml, plainText, marks) {
    var single = [{ ssml: ssml, plainText: plainText, marks: marks }];
    if (!plainText || plainText.length <= 200) return single;

    // Find sentence boundaries: period/exclamation/question followed by whitespace
    var boundaries = [];
    var re = /([.!?])\s+/g;
    var match;
    while ((match = re.exec(plainText)) !== null) {
      // Position right after the whitespace = start of next sentence
      var splitPos = match.index + match[0].length;
      // Ensure minimum chunk size of 30 chars from previous boundary
      var prevPos = boundaries.length > 0 ? boundaries[boundaries.length - 1] : 0;
      if (splitPos - prevPos >= 30 && plainText.length - splitPos >= 30) {
        boundaries.push(splitPos);
      }
    }

    if (boundaries.length === 0) return single;

    // Build sub-chunks
    var chunks = [];
    var starts = [0].concat(boundaries);
    for (var i = 0; i < starts.length; i++) {
      var chunkStart = starts[i];
      var chunkEnd = (i + 1 < starts.length) ? starts[i + 1] : plainText.length;
      var chunkText = plainText.substring(chunkStart, chunkEnd);

      // Filter and adjust marks for this chunk
      var chunkMarks = [];
      for (var m = 0; m < marks.length; m++) {
        if (marks[m].offset >= chunkStart && marks[m].offset < chunkEnd) {
          chunkMarks.push({ name: marks[m].name, offset: marks[m].offset - chunkStart });
        }
      }

      chunks.push({
        ssml: null, // sub-chunks use plainText directly, not SSML
        plainText: chunkText,
        marks: chunkMarks,
        isSubChunk: true,
      });
    }

    return chunks.length > 0 ? chunks : single;
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
    // FIX-TTS04: if charIndex is before first mark, use first mark
    if (best === null && marks.length > 0) {
      best = marks[0].name;
    }
    return best;
  }

  // ── Block parent detection (for sentence-level highlight) ────

  var _blockTags = new Set([
    'article', 'aside', 'blockquote', 'div', 'dl', 'dt', 'dd',
    'figure', 'figcaption', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'header', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'tr',
  ]);

  function _findBlockParent(node) {
    var el = (node && node.nodeType === 3) ? node.parentElement : node;
    while (el && el !== el.ownerDocument.body) {
      if (_blockTags.has((el.tagName || '').toLowerCase())) return el;
      el = el.parentElement;
    }
    return null;
  }

  // ── Overlayer Highlighting ───────────────────────────────────

  function _getOverlayerClass() {
    try {
      if (_fol.overlayer && _fol.overlayer.constructor) {
        return _fol.overlayer.constructor;
      }
    } catch {}
    return null;
  }

  // FIX-TTS04: sentence-only draw functions — word highlighting moved to CSS Highlight API
  function getSentenceDrawFn() {
    var style = state.ttsHlStyle || 'highlight';
    var Overlayer = _getOverlayerClass();
    if (!Overlayer) return null;
    if (style === 'underline') return Overlayer.underline;
    if (style === 'squiggly') return Overlayer.squiggly;
    if (style === 'strikethrough') return Overlayer.strikethrough;
    return Overlayer.highlight;
  }

  function getSentenceDrawOpts(colors) {
    var style = state.ttsHlStyle || 'highlight';
    if (style === 'highlight') return { color: colors.sentence };
    if (style === 'underline') return { color: colors.line, width: 2 };
    if (style === 'squiggly') return { color: colors.line, width: 2 };
    if (style === 'strikethrough') return { color: colors.line, width: 2 };
    return { color: colors.sentence };
  }

  // FIX-TTS04: CSS Custom Highlight API for word-level highlighting
  // Uses native browser Highlight objects — zero DOM mutation, GPU-composited.
  function _ensureCssHighlights(iframeDoc) {
    if (!iframeDoc) return false;
    try {
      var win = iframeDoc.defaultView || window;
      if (!win.CSS || !win.CSS.highlights) return false;

      // Already initialized for this document?
      if (_cssHl.doc === iframeDoc && _cssHl.word) return true;

      // Clean up previous highlights
      _clearCssHighlights();

      _cssHl.doc = iframeDoc;
      _cssHl.word = new win.Highlight();
      win.CSS.highlights.set('tts-word', _cssHl.word);

      // Inject ::highlight(tts-word) stylesheet into the iframe
      // FIX-TTS05: use independent word highlight color
      var colors = TTS_HL_COLORS[state.ttsWordHlColor] || TTS_HL_COLORS.blue;
      var style = iframeDoc.createElement('style');
      style.setAttribute('data-tts-hl', '1');
      style.textContent = '::highlight(tts-word) { background-color: ' + _hexToRgba(colors.word, 0.35) + '; }';
      iframeDoc.head.appendChild(style);
      _cssHl.styleEl = style;

      return true;
    } catch {}
    return false;
  }

  function _clearCssHighlights() {
    if (_cssHl.word) { try { _cssHl.word.clear(); } catch {} }
    if (_cssHl.styleEl) { try { _cssHl.styleEl.remove(); } catch {} }
    if (_cssHl.doc) {
      try {
        var win = _cssHl.doc.defaultView;
        if (win && win.CSS && win.CSS.highlights) {
          win.CSS.highlights.delete('tts-word');
        }
      } catch {}
    }
    _cssHl.word = null;
    _cssHl.doc = null;
    _cssHl.styleEl = null;
  }

  function _updateCssHighlightColor() {
    if (!_cssHl.styleEl || !_cssHl.doc) return;
    // FIX-TTS05: use independent word highlight color
    var colors = TTS_HL_COLORS[state.ttsWordHlColor] || TTS_HL_COLORS.blue;
    try {
      _cssHl.styleEl.textContent = '::highlight(tts-word) { background-color: ' + _hexToRgba(colors.word, 0.35) + '; }';
    } catch {}
  }

  function _hexToRgba(hex, alpha) {
    var h = String(hex || '#999').replace('#', '');
    var r = parseInt(h.substring(0, 2), 16) || 0;
    var g = parseInt(h.substring(2, 4), 16) || 0;
    var b = parseInt(h.substring(4, 6), 16) || 0;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function clearTtsOverlays() {
    if (_fol.overlayer) {
      try { _fol.overlayer.remove('tts-word'); } catch {}
      try { _fol.overlayer.remove('tts-sentence'); } catch {}
    }
    // FIX-TTS04: clear CSS Highlight API word highlight
    if (_cssHl.word) { try { _cssHl.word.clear(); } catch {} }
    _fol._lastBlockEl = null;
  }

  // Highlight callback passed to view.initTTS() — called by tts.setMark(name)
  function highlightRange(range) {
    if (!range) return;
    var colors = TTS_HL_COLORS[state.ttsHlColor] || TTS_HL_COLORS.grey;

    // FIX-TTS04: detect stale _lastBlockEl (disconnected from DOM after section nav)
    if (_fol._lastBlockEl && !_fol._lastBlockEl.isConnected) {
      _fol._lastBlockEl = null;
    }

    // Sentence-level highlight via overlayer: detect parent block element,
    // highlight it only when the block changes (avoids redundant redraws)
    if (_fol.overlayer) {
      try {
        var blockEl = _findBlockParent(range.startContainer);
        if (blockEl && blockEl !== _fol._lastBlockEl) {
          _fol._lastBlockEl = blockEl;
          try { _fol.overlayer.remove('tts-sentence'); } catch {}
          var sentenceDrawFn = getSentenceDrawFn();
          if (sentenceDrawFn) {
            var doc = blockEl.ownerDocument || document;
            var blockRange = doc.createRange();
            blockRange.selectNodeContents(blockEl);
            _fol.blockRange = blockRange;
            _fol.overlayer.add('tts-sentence', blockRange, sentenceDrawFn, getSentenceDrawOpts(colors));
          }
        }
      } catch {}
    }

    // FIX-TTS04: Word-level highlight via CSS Custom Highlight API
    try {
      var wordDoc = range.startContainer.ownerDocument || document;
      if (_ensureCssHighlights(wordDoc) && _cssHl.word) {
        _cssHl.word.clear();
        _cssHl.word.add(range);
      }
    } catch {}

    // FIX-TTS03: Paginator-aware scroll — centered in scrolled mode
    if (_fol.renderer) {
      try {
        if (typeof _fol.renderer.scrollToAnchorCentered === 'function') {
          _fol.renderer.scrollToAnchorCentered(range);
        } else {
          _fol.renderer.scrollToAnchor(range, true);
        }
      } catch {}
    }
  }

  // Highlight the entire block range (sentence-level) — used by _redrawActiveOverlays
  function highlightBlockRange(blockRange) {
    if (_fol.overlayer) {
      try { _fol.overlayer.remove('tts-sentence'); } catch {}
    }
    // FIX-TTS04: clear word highlight too
    if (_cssHl.word) { try { _cssHl.word.clear(); } catch {} }
    _fol._lastBlockEl = null;
    if (!blockRange || !_fol.overlayer) return;
    _fol.blockRange = blockRange;
    var drawFn = getSentenceDrawFn();
    if (!drawFn) return;
    var colors = TTS_HL_COLORS[state.ttsHlColor] || TTS_HL_COLORS.grey;
    try {
      _fol.overlayer.add('tts-sentence', blockRange, drawFn, getSentenceDrawOpts(colors));
    } catch {}
    // FIX-TTS03: scroll centered in scrolled mode
    if (_fol.renderer) {
      try {
        if (typeof _fol.renderer.scrollToAnchorCentered === 'function') {
          _fol.renderer.scrollToAnchorCentered(blockRange);
        } else {
          _fol.renderer.scrollToAnchor(blockRange, true);
        }
      } catch {}
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

    // FIX-TTS04: reset sentence tracking for new block — forces redraw
    _fol._lastBlockEl = null;

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
    _scheduleQueueFill(); // FIX-TTS05: fill lookahead queue instead of single preload
  }

  // FIX-TTS05: multi-chunk lookahead queue (replaces single-preload system)
  function _clearQueue() {
    if (_fol._preloadTimer) { clearTimeout(_fol._preloadTimer); _fol._preloadTimer = null; }
    _fol._queue = [];
    _fol._queueFilling = false;
    _fol._preloadedSSML = null;
    _fol._preloadActive = false;
    _fol._savedRanges = null;
  }

  function _fillQueue() {
    if (_fol._queueFilling) return;
    if (!state.engine || typeof state.engine.preload !== 'function') return;
    if (!_fol.tts || state.format === 'txt') return;
    if (state.status !== PLAYING) return;

    _fol._queueFilling = true;

    try {
      while (_fol._queue.length < LOOKAHEAD_DEPTH) {
        // FIX-TTS04/05: snapshot ranges BEFORE advancing iterator
        var savedRanges = null;
        if (typeof _fol.tts.snapshotRanges === 'function') {
          savedRanges = _fol.tts.snapshotRanges();
        }

        var nextSSML = _fol.tts.next();
        if (!nextSSML) break; // end of section

        var parsed = parseSSML(nextSSML);

        // FIX-TTS05: split long blocks into sentence-sized chunks
        var subChunks = _splitBlock(nextSSML, parsed.plainText, parsed.marks);

        for (var ci = 0; ci < subChunks.length; ci++) {
          _fol._queue.push({
            ssml: subChunks[ci].ssml || nextSSML,
            plainText: subChunks[ci].plainText,
            marks: subChunks[ci].marks,
            savedRanges: savedRanges,
            isSubChunk: subChunks.length > 1,
          });
          // Fire engine preload for each chunk (parallel synthesis like Readest)
          if (subChunks[ci].plainText) {
            try { state.engine.preload(subChunks[ci].plainText); } catch {}
          }
        }
      }
    } catch {}

    _fol._queueFilling = false;

    // FIX-TTS05: update legacy compat pointers for handleBoundary
    if (_fol._queue.length > 0) {
      _fol._preloadActive = true;
      _fol._savedRanges = _fol._queue[0].savedRanges;
    }
  }

  function _scheduleQueueFill() {
    if (_fol._preloadTimer) return;
    if (!state.engine || !_fol.tts || state.format === 'txt') return;
    if (_fol._queue.length >= LOOKAHEAD_DEPTH) return;

    var textLen = (state.currentText || '').length;
    if (textLen < 10) {
      _fillQueue();
      return;
    }
    // FIX-TTS04: start filling at ~40% through current block
    var cps = Math.max(5, 15 * (state.rate || 1.0));
    var delayMs = Math.max(50, (textLen / cps) * 400);

    _fol._preloadTimer = setTimeout(function () {
      _fol._preloadTimer = null;
      if (state.status !== PLAYING) return;
      _fillQueue();
    }, delayMs);
  }

  function handleBlockEnd() {
    if (state.status !== PLAYING) return;

    // TXT legacy path
    if (state.format === 'txt') {
      _txtHandleBlockEnd();
      return;
    }

    if (!_fol.tts) { stop(); return; }

    // FIX-TTS05: cancel pending fill timer but keep already-queued results
    if (_fol._preloadTimer) { clearTimeout(_fol._preloadTimer); _fol._preloadTimer = null; }

    // FIX-TTS05: consume from multi-chunk lookahead queue
    if (_fol._queue.length > 0) {
      var entry = _fol._queue.shift();
      // Update legacy compat pointers for boundary handling
      _fol._preloadActive = (_fol._queue.length > 0);
      _fol._savedRanges = entry.savedRanges;
      // Speak the dequeued chunk (marks are already parsed)
      _fol.marks = entry.marks;
      state.currentText = entry.plainText;
      state.wordStart = -1;
      state.wordEnd = -1;
      _fol._lastBlockEl = null;
      state.blockIdx++;
      fireProgress();
      state.engine.speak(entry.plainText);
      _scheduleQueueFill(); // refill queue to maintain depth
    } else {
      // Queue empty — try direct advance as fallback
      var ssml = _fol.tts.next();
      if (ssml) {
        _fol._preloadActive = false;
        _fol._savedRanges = null;
        speakCurrentBlock(ssml);
      } else {
        handleAllBlocksDone();
      }
    }
  }

  function handleAllBlocksDone() {
    // FIX-TTS05: explicit section/document transition contract (inspired by Thorium's
    // R2_EVENT_TTS_DOC_END pattern — fire lifecycle events so UI can react deterministically)
    var info = { blockIdx: state.blockIdx, engineId: state.engineId };

    // Fire section-end callback
    if (typeof state.onSectionEnd === 'function') {
      try { state.onSectionEnd(info); } catch {}
    }

    if (typeof state.onNeedAdvance === 'function') {
      // Enter transition state — prevents pause() during nav, matches Thorium's r2_cancel guard
      state.status = SECTION_TRANSITION;
      fire();
      _clearQueue();

      state.onNeedAdvance().then(function (advanced) {
        if (!advanced || (state.status !== SECTION_TRANSITION && state.status !== PLAYING)) {
          // FIX-TTS05: 400ms delay before doc-end (like Thorium) to allow highlight cleanup
          setTimeout(function () {
            if (typeof state.onDocumentEnd === 'function') {
              try { state.onDocumentEnd(info); } catch {}
            }
            stop();
          }, 400);
          return;
        }
        // After section advance, _reinitFoliateTTS is called by onNeedAdvance
        // then we start from the new section's first block
        if (!_fol.tts) { stop(); return; }
        var ssml = _fol.tts.start();
        if (ssml) {
          state.blockIdx = -1; // reset, speakCurrentBlock will increment
          if (typeof state.onSectionStart === 'function') {
            try { state.onSectionStart(info); } catch {}
          }
          state.status = PLAYING;
          fire();
          speakCurrentBlock(ssml);
        } else {
          // Section had no content — treat as doc-end
          if (typeof state.onDocumentEnd === 'function') {
            try { state.onDocumentEnd(info); } catch {}
          }
          stop();
        }
      }).catch(function () {
        if (typeof state.onDocumentEnd === 'function') {
          try { state.onDocumentEnd(info); } catch {}
        }
        stop();
      });
    } else {
      if (typeof state.onDocumentEnd === 'function') {
        try { state.onDocumentEnd(info); } catch {}
      }
      stop();
    }
  }

  function handleBoundary(charIndex, charLength, name, driftFallback) {
    if (name !== 'word' || state.status !== PLAYING) return;
    state.wordStart = charIndex;
    state.wordEnd = charIndex + Math.max(charLength, 1);
    if (charLength === 0 && state.currentText) {
      var rest = state.currentText.slice(charIndex);
      var m = rest.match(/^\S+/);
      if (m) state.wordEnd = charIndex + m[0].length;
    }

    // FIX-TTS05: skip word-level highlighting when granularity is sentence-only
    // or when engine reports chronic boundary drift for this block
    var skipWordHl = (state.ttsHlGranularity !== 'word') || !!driftFallback;

    // FIX-TTS04: Map charIndex to nearest foliate mark for highlighting.
    // If preload has advanced the iterator, use saved ranges instead of setMark
    // (which would look up in the NEW block's ranges and fail silently).
    if (!skipWordHl && _fol.tts && _fol.marks.length) {
      var markName = findNearestMark(_fol.marks, charIndex);
      if (markName) {
        if (_fol._preloadActive && _fol._savedRanges) {
          var savedRange = _fol._savedRanges.get(markName);
          if (savedRange) {
            try { highlightRange(savedRange.cloneRange()); } catch {}
          }
        } else {
          try { _fol.tts.setMark(markName); } catch {}
        }
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

      // FIX-TTS04: pre-warm Edge TTS WebSocket for faster first playback
      if (state.engineUsable.edge) {
        try {
          var ttsApi = window.Tanko && window.Tanko.api && window.Tanko.api.booksTtsEdge;
          if (ttsApi && typeof ttsApi.warmup === 'function') {
            ttsApi.warmup({ voice: state.voiceId || 'en-US-AriaNeural' }).catch(function () {});
          }
        } catch {}
      }

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
    // FIX-TTS05: can't pause during section transition (matches Thorium's r2_cancel guard)
    if (!state.engine || (state.status !== PLAYING && state.status !== SECTION_TRANSITION)) return;
    if (state.status === SECTION_TRANSITION) return;
    if (Date.now() - _lastToggleAt < TOGGLE_COOLDOWN) return;
    _lastToggleAt = Date.now();
    _clearQueue();
    state._pauseStartedAt = Date.now();
    state._pauseNeedsRespeak = false;
    state.engine.pause();
    // FIX-TTS02: Edge now uses HTMLAudioElement where pause() is synchronous and reliable.
    // Only check for respeak need on webspeech (Chromium pause bug, engine may not support pause).
    if (state.engineId === 'webspeech') {
      var pauseWorked = false;
      if (typeof state.engine.isPaused === 'function') {
        pauseWorked = state.engine.isPaused();
      }
      if (!pauseWorked && typeof state.engine.isSpeaking === 'function' && state.engine.isSpeaking()) {
        try { state.engine.cancel(); } catch {}
        state._pauseNeedsRespeak = true;
      }
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
    _clearQueue();
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
    _clearQueue();
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
    _clearQueue();
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

  // FIX-TTS03: Re-speak current block — keep old audio until new is ready (gapless)
  function _respeakCurrentBlock() {
    if (state.status !== PLAYING || !state.engine) return;
    _clearQueue();
    if (!state.currentText) return;
    // FIX-TTS03: signal UI to show "switching" state
    state.wordStart = -1;
    state.wordEnd = -1;
    fireProgress();
    // If engine supports speakGapless, use it to keep old audio playing until new audio arrives.
    // Otherwise fall back to cancel+speak (audible gap).
    if (typeof state.engine.speakGapless === 'function') {
      state.engine.speakGapless(state.currentText);
    } else {
      try { state.engine.cancel(); } catch {}
      state.engine.speak(state.currentText);
    }
    _scheduleQueueFill();
  }

  var TTS_RATE_MIN = 0.5;
  var TTS_RATE_MAX = 3.0;

  function setRate(r) {
    state.rate = Math.max(TTS_RATE_MIN, Math.min(TTS_RATE_MAX, Number(r) || 1.0));
    if (state.engine) state.engine.setRate(state.rate);
    _respeakCurrentBlock();
  }

  function setPitch(p) {
    state.pitch = Math.max(0.5, Math.min(2.0, Number(p) || 1.0));
    if (state.engine && typeof state.engine.setPitch === 'function') {
      state.engine.setPitch(state.pitch);
    }
    _respeakCurrentBlock();
  }

  function setPreset(presetId) {
    var p = TTS_PRESETS[presetId];
    if (!p) return;
    state.preset = presetId;
    // Set both without re-speaking twice — setRate/setPitch would each re-speak
    state.rate = Math.max(TTS_RATE_MIN, Math.min(TTS_RATE_MAX, Number(p.rate) || 1.0));
    if (state.engine) state.engine.setRate(state.rate);
    state.pitch = Math.max(0.5, Math.min(2.0, Number(p.pitch) || 1.0));
    if (state.engine && typeof state.engine.setPitch === 'function') {
      state.engine.setPitch(state.pitch);
    }
    _respeakCurrentBlock();
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

  // FIX-TTS05: highlight granularity — sentence (default) or word
  function setHighlightGranularity(g) {
    var valid = ['sentence', 'word'];
    if (valid.indexOf(g) < 0) return;
    state.ttsHlGranularity = g;
    if (g !== 'word' && _cssHl.word) {
      try { _cssHl.word.clear(); } catch {}
    }
  }

  // FIX-TTS05: independent word highlight style/color
  function setWordHighlightStyle(style) {
    var valid = ['highlight', 'underline', 'squiggly', 'strikethrough'];
    if (valid.indexOf(style) < 0) return;
    state.ttsWordHlStyle = style;
  }

  function setWordHighlightColor(colorName) {
    if (!TTS_HL_COLORS[colorName]) return;
    state.ttsWordHlColor = colorName;
    _updateCssHighlightColor();
  }

  function _redrawActiveOverlays() {
    // If overlayer has active highlights, remove and re-add with new style
    // FIX-TTS04: also update CSS highlight color
    _updateCssHighlightColor();
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
          _respeakCurrentBlock();
          fire();
          return;
        }
      }
    }
    if (state.engine) state.engine.setVoice(state.voiceId);
    _respeakCurrentBlock();
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
    _fol._lastBlockEl = null;
    _fol._preloadTimer = null;
    _fol._preloadedSSML = null;
    _fol._preloadActive = false;
    _fol._savedRanges = null;
    _fol._queue = [];           // FIX-TTS05: clear lookahead queue
    _fol._queueFilling = false;
    _clearCssHighlights(); // FIX-TTS04
    _txt.blocks = [];
    _txt.segments = [];
    _txt.segIdx = -1;
    state.hostFn = null;
    state.viewEngineFn = null;
    state.onNeedAdvance = null;
    state.onSectionEnd = null;    // FIX-TTS05
    state.onSectionStart = null;  // FIX-TTS05
    state.onDocumentEnd = null;   // FIX-TTS05
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
    // FIX-TTS05: granularity + independent word highlight controls
    setHighlightGranularity: setHighlightGranularity,
    getHighlightGranularity: function () { return state.ttsHlGranularity; },
    setWordHighlightStyle: setWordHighlightStyle,
    setWordHighlightColor: setWordHighlightColor,
    getWordHighlightStyle: function () { return state.ttsWordHlStyle; },
    getWordHighlightColor: function () { return state.ttsWordHlColor; },
    // TTS_REWRITE: expose _reinitFoliateTTS for section transitions
    _reinitFoliateTTS: _reinitFoliateTTS,
    // FIX-TTS05: section/document lifecycle events
    set onSectionEnd(fn) { state.onSectionEnd = typeof fn === 'function' ? fn : null; },
    set onSectionStart(fn) { state.onSectionStart = typeof fn === 'function' ? fn : null; },
    set onDocumentEnd(fn) { state.onDocumentEnd = typeof fn === 'function' ? fn : null; },
    set onStateChange(fn) { state.onStateChange = typeof fn === 'function' ? fn : null; },
    set onProgress(fn) { state.onProgress = typeof fn === 'function' ? fn : null; },
  };
})();
