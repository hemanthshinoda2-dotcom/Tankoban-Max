// LISTEN-HUD: TTS Listening player - replica of pre-listening-mode TTS HUD bar
// Ports the full reader_tts_ui.js feature set into the listening player overlay:
// voices (grouped by locale, friendly names), presets, speed ±0.1, highlight
// styles/colors, word tracking, enlarge scale, diagnostics, -10s/+10s jump,
// read-from-selection, voice preview.
(function () {
  'use strict';

  if (window.__booksListenPlayerBound) return;
  window.__booksListenPlayerBound = true;

  var _book = null;
  var _open = false;
  var _interactionWired = false; // PATCH2
  var _ttsStarted = false;
  var _lastSavedBlockIdx = -1;
  var _saveTimer = null;
  var _tocPanelOpen = false;
  var _navigating = false;
  var _activeTocHref = '';

  var _pausedAtMs = 0;
  var _autoRewindEnabled = false;
  // FIX-TTS-B6 #11: Cache active segment index to avoid full DOM rebuild on every word
  var _cardActiveIdx = -1;
  var _cardSegCount = 0;
  // FIX-TTS-B6 #20: Cache voice list count to skip rebuild when unchanged
  var _voiceCacheCount = -1;
  var AUTO_REWIND_MS = 5000;
  var AUTO_REWIND_AFTER_PAUSE_MS = 20000;

  // OPT1: Sleep timer state
  var _sleepTimerId = null;
  var _sleepEndMs = 0;
  var _sleepMode = 'off';
  var _sleepCountdownId = null;
  var _preMuteVolume = -1; // OPT1: for mute toggle keyboard shortcut

  // TTS bar auto-hide (Prompt 3)
  var _ttsBarHideTimer = null;
  var _ttsBarLastStatus = 'idle';
  var _ttsBarHoverBar = false;
  var _ttsBarHoverBottomZone = false;
  var _ttsBarAutoHideUiWired = false;
  var _ttsBarHasPlayed = false;
  var TTS_BAR_AUTO_HIDE_MS = 5000;
  var TTS_BAR_FADE_MS = 300;


  // ── SVG icons ───────────────────────────────────────────────────────────────
  var SVG_PLAY = '<svg viewBox="0 0 16 18" xmlns="http://www.w3.org/2000/svg"><path d="M14.3195 7.73218L3.06328 0.847019C2.82722 0.703112 2.55721 0.624413 2.2808 0.618957C2.00439 0.6135 1.73148 0.681481 1.48992 0.81596C1.24837 0.950439 1.04682 1.1466 0.905848 1.38442C0.764877 1.62225 0.689531 1.89322 0.6875 2.16968V15.94C0.689531 16.2164 0.764877 16.4874 0.905848 16.7252C1.04682 16.9631 1.24837 17.1592 1.48992 17.2937C1.73148 17.4282 2.00439 17.4962 2.2808 17.4907C2.55721 17.4853 2.82722 17.4066 3.06328 17.2626L14.3195 10.3775C14.5465 10.2393 14.7341 10.0451 14.8643 9.81344C14.9945 9.58179 15.0628 9.32055 15.0628 9.05483C15.0628 8.78912 14.9945 8.52787 14.8643 8.29623C14.7341 8.06458 14.5465 7.87034 14.3195 7.73218ZM2.5625 15.3712V2.73843L12.8875 9.05483L2.5625 15.3712Z" fill="currentColor"/></svg>';
  var SVG_PAUSE = '<svg viewBox="0 0 16 18" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="0.87" width="4" height="16.37" rx="0.75" fill="currentColor"/><rect x="10" y="0.87" width="4" height="16.37" rx="0.75" fill="currentColor"/></svg>';

  // ── Voice display names (FIX-TTS09 replica) ─────────────────────────────────
  var VOICE_DISPLAY = {
    'AnaNeural':           { label: 'Ana',           g: 'F', desc: 'Child' },
    'AndrewNeural':        { label: 'Andrew',        g: 'M', desc: 'Warm, storyteller' },
    'AndrewMultilingualNeural': { label: 'Andrew ML', g: 'M', desc: 'Warm, multilingual' },
    'AriaNeural':          { label: 'Aria',          g: 'F', desc: 'Expressive, versatile' },
    'AvaNeural':           { label: 'Ava',           g: 'F', desc: 'Bright, engaging' },
    'AvaMultilingualNeural': { label: 'Ava ML',      g: 'F', desc: 'Bright, multilingual' },
    'BrianNeural':         { label: 'Brian',         g: 'M', desc: 'Youthful, cheerful' },
    'BrianMultilingualNeural': { label: 'Brian ML',  g: 'M', desc: 'Youthful, multilingual' },
    'ChristopherNeural':   { label: 'Christopher',   g: 'M', desc: 'Authoritative' },
    'EmmaNeural':          { label: 'Emma',          g: 'F', desc: 'Friendly, educational' },
    'EmmaMultilingualNeural': { label: 'Emma ML',    g: 'F', desc: 'Friendly, multilingual' },
    'EricNeural':          { label: 'Eric',          g: 'M', desc: 'Neutral' },
    'GuyNeural':           { label: 'Guy',           g: 'M', desc: 'Professional, mature' },
    'JennyNeural':         { label: 'Jenny',         g: 'F', desc: 'Warm, assistant' },
    'JennyMultilingualNeural': { label: 'Jenny ML',  g: 'F', desc: 'Warm, multilingual' },
    'MichelleNeural':      { label: 'Michelle',      g: 'F', desc: 'Clear, professional' },
    'RogerNeural':         { label: 'Roger',         g: 'M', desc: 'Mature, narrator' },
    'SteffanNeural':       { label: 'Steffan',       g: 'M', desc: 'Smooth' },
    'DavisNeural':         { label: 'Davis',         g: 'M', desc: 'Conversational' },
    'JaneNeural':          { label: 'Jane',          g: 'F', desc: 'Clear, expressive' },
    'JasonNeural':         { label: 'Jason',         g: 'M', desc: 'Steady, articulate' },
    'NancyNeural':         { label: 'Nancy',         g: 'F', desc: 'Warm, approachable' },
    'TonyNeural':          { label: 'Tony',          g: 'M', desc: 'Strong, confident' },
    'SaraNeural':          { label: 'Sara',          g: 'F', desc: 'Soft, gentle' },
    'AmberNeural':         { label: 'Amber',         g: 'F', desc: 'Smooth' },
    'AshleyNeural':        { label: 'Ashley',        g: 'F', desc: 'Friendly' },
    'BrandonNeural':       { label: 'Brandon',       g: 'M', desc: 'Confident' },
    'CoraNeural':          { label: 'Cora',          g: 'F', desc: 'Calm' },
    'ElizabethNeural':     { label: 'Elizabeth',     g: 'F', desc: 'Polished' },
    'JacobNeural':         { label: 'Jacob',         g: 'M', desc: 'Casual' },
    'MonicaNeural':        { label: 'Monica',        g: 'F', desc: 'Warm' },
    'SoniaNeural':         { label: 'Sonia',         g: 'F', desc: 'Polished' },
    'RyanNeural':          { label: 'Ryan',          g: 'M', desc: 'Warm' },
    'LibbyNeural':         { label: 'Libby',         g: 'F', desc: 'Natural' },
    'AbbiNeural':          { label: 'Abbi',          g: 'F', desc: 'Soft' },
    'AlfieNeural':         { label: 'Alfie',         g: 'M', desc: 'Youthful' },
    'BellaNeural':         { label: 'Bella',         g: 'F', desc: 'Bright' },
    'ElliotNeural':        { label: 'Elliot',        g: 'M', desc: 'Calm' },
    'EthanNeural':         { label: 'Ethan',         g: 'M', desc: 'Clear' },
    'HollieNeural':        { label: 'Hollie',        g: 'F', desc: 'Cheerful' },
    'MaisieNeural':        { label: 'Maisie',        g: 'F', desc: 'Child' },
    'NoahNeural':          { label: 'Noah',          g: 'M', desc: 'Neutral' },
    'OliverNeural':        { label: 'Oliver',        g: 'M', desc: 'Professional' },
    'OliviaNeural':        { label: 'Olivia',        g: 'F', desc: 'Elegant' },
    'ThomasNeural':        { label: 'Thomas',        g: 'M', desc: 'Mature' },
    'NatashaNeural':       { label: 'Natasha',       g: 'F', desc: 'Clear' },
    'WilliamNeural':       { label: 'William',       g: 'M', desc: 'Warm' },
    'NeerjaNeural':        { label: 'Neerja',        g: 'F', desc: 'Clear' },
    'PrabhatNeural':       { label: 'Prabhat',       g: 'M', desc: 'Professional' },
  };
  var LOCALE_LABELS = {
    'en-US': 'US', 'en-GB': 'British', 'en-AU': 'Australian', 'en-IN': 'Indian',
    'en-IE': 'Irish', 'en-CA': 'Canadian', 'en-NZ': 'New Zealand', 'en-ZA': 'South African',
    'en-SG': 'Singaporean', 'en-PH': 'Filipino', 'en-HK': 'Hong Kong',
    'en-KE': 'Kenyan', 'en-NG': 'Nigerian', 'en-TZ': 'Tanzanian',
  };

  function _voiceDisplayName(v) {
    var uri = String(v.voiceURI || v.name || '');
    var parts = uri.split('-');
    var locale = '';
    var shortName = '';
    if (parts.length >= 3) {
      locale = parts[0] + '-' + parts[1];
      shortName = parts.slice(2).join('');
    } else {
      shortName = uri.replace(/Neural$/i, '') + 'Neural';
    }
    var entry = VOICE_DISPLAY[shortName];
    var localeTag = LOCALE_LABELS[locale] || locale || '';
    var gender = (entry && entry.g) || (v.gender === 'Female' ? 'F' : v.gender === 'Male' ? 'M' : '');
    var genderStr = gender === 'F' ? '\u2640' : gender === 'M' ? '\u2642' : '';
    var desc = (entry && entry.desc) || '';
    var baseName = (entry && entry.label) || shortName.replace(/Neural$/i, '').replace(/Multilingual$/i, ' ML');
    var result = baseName;
    if (genderStr) result += ' ' + genderStr;
    if (desc) result += ' \u00b7 ' + desc;
    if (localeTag && localeTag !== 'US') result += ' \u00b7 ' + localeTag;
    return result;
  }

  // ── Presets (replica from tts_core.js) ──────────────────────────────────────
  var TTS_PRESETS = {
    natural: { rate: 1.0, pitch: 1.0 },
    clear:   { rate: 0.9, pitch: 1.05 },
    fast:    { rate: 1.4, pitch: 1.0 },
    slow:    { rate: 0.7, pitch: 0.95 },
  };

  // LP-FONT: card font family map — standard stacks matching ReadiumCSS
  var LP_FONT_MAP = {
    oldStyleTf:   '"Iowan Old Style", "Sitka Text", Palatino, "Book Antiqua", serif',
    modernTf:     'Athelas, Constantia, Georgia, serif',
    sansTf:       'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    humanistTf:   'Seravek, Calibri, Roboto, Arial, sans-serif',
    monospaceTf:  '"Andale Mono", Consolas, monospace',
  };

  // ── Persisted settings (PATCH3: per-book with global fallback) ─────────────
  var _settings = {
    ttsVoice: '',
    ttsRate: 1.0,
    ttsPitch: 1.0,
    ttsPreset: '',
    ttsHlStyle: 'highlight',
    ttsHlColor: 'grey',
    ttsHlGranularity: 'sentence',
    ttsWordHlStyle: 'highlight',
    ttsWordHlColor: 'blue',
    ttsEnlargeScale: 1.35,
    ttsFont: 'default',
    ttsVolume: 1.0, // TTS-QOL4
  };

  function _bookPrefKey() {
    try {
      var raw = _book && (_book.id || _book.path) ? String(_book.id || _book.path) : '';
      if (!raw) return '';
      return 'bk:' + encodeURIComponent(raw).slice(0, 180);
    } catch { return ''; }
  }

  function _lsGet(name) {
    try {
      var bk = _bookPrefKey();
      if (bk) {
        var v = localStorage.getItem('booksListen.' + bk + '.' + name);
        if (v !== null && v !== undefined && v !== '') return v;
      }
      return localStorage.getItem('booksListen.' + name);
    } catch { return null; }
  }

  function _lsSet(name, val) {
    try {
      var s = String(val);
      localStorage.setItem('booksListen.' + name, s);
      var bk = _bookPrefKey();
      if (bk) localStorage.setItem('booksListen.' + bk + '.' + name, s);
    } catch {}
  }

  function _loadPrefs() {
    try {
      var sv;
      _settings.ttsFont = _lsGet('Font') || 'default';
      sv = _lsGet('Voice');     if (sv) _settings.ttsVoice = sv;
      sv = _lsGet('Rate');      if (sv) _settings.ttsRate = parseFloat(sv) || 1.0;
      sv = _lsGet('Pitch');     if (sv) _settings.ttsPitch = parseFloat(sv) || 1.0;
      sv = _lsGet('Preset');    if (sv) _settings.ttsPreset = sv;
      sv = _lsGet('HlStyle');   if (sv) _settings.ttsHlStyle = sv;
      sv = _lsGet('HlColor');   if (sv) _settings.ttsHlColor = sv;
      sv = _lsGet('HlGran');    if (sv) _settings.ttsHlGranularity = sv;
      sv = _lsGet('WordStyle'); if (sv) _settings.ttsWordHlStyle = sv;
      sv = _lsGet('WordColor'); if (sv) _settings.ttsWordHlColor = sv;
      sv = _lsGet('Enlarge');   if (sv) _settings.ttsEnlargeScale = parseFloat(sv) || 1.35;
      sv = _lsGet('Volume');    if (sv) _settings.ttsVolume = parseFloat(sv) || 1.0;
    } catch {}
  }

  // Load global defaults immediately (before a book is opened).
  _loadPrefs();

  function _applyCardFont(key) {
    var shell = document.getElementById('booksListenPlayerOverlay');
    if (!shell) return;
    if (!key || key === 'default') { shell.style.removeProperty('--lp-card-font-family'); return; }
    var stack = LP_FONT_MAP[key];
    if (stack) shell.style.setProperty('--lp-card-font-family', stack);
  }

  function qs(id) {
    try {
      return document.getElementById(id);
    } catch {
      return null;
    }
  }


  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function toast(msg) {
    try { if (typeof window.toast === 'function') { window.toast(String(msg)); return; } } catch {}
    try { console.log('[listen]', msg); } catch {}
  }

  // ── Overlay visibility ──────────────────────────────────────────────────────
  function showOverlay(show) {
    var el = qs('booksListenPlayerOverlay');
    if (el) el.classList.toggle('hidden', !show);
  }

  function _ensureTtsBarAutoHideStyles() {
    var bar = qs('lpTtsBar');
    if (!bar) return null;
    if (!bar.dataset.lpAutohideInit) {
      bar.dataset.lpAutohideInit = '1';
      bar.style.transition = 'opacity ' + TTS_BAR_FADE_MS + 'ms ease';
      if (!bar.classList.contains('hidden')) {
        bar.style.opacity = '1';
        bar.style.pointerEvents = 'auto';
      }
    }
    return bar;
  }

  function _clearTtsBarHideTimer() {
    if (_ttsBarHideTimer) {
      clearTimeout(_ttsBarHideTimer);
      _ttsBarHideTimer = null;
    }
  }

  function _isTtsMegaOpen() {
    var mega = qs('lpTtsMega');
    return !!(mega && !mega.classList.contains('hidden'));
  }

  function _isTtsBarAutoHideAllowed() {
    if (!_open || !_ttsStarted) return false;
    if (_isTtsMegaOpen()) return false;
    if (_ttsBarHoverBar || _ttsBarHoverBottomZone) return false;
    if (_ttsBarLastStatus === 'paused') return false;
    return (_ttsBarLastStatus === 'playing' || _ttsBarLastStatus === 'section_transition');
  }

  function _setTtsBarVisible(visible, opts) {
    var bar = _ensureTtsBarAutoHideStyles();
    if (!bar) return;
    var hard = !!(opts && opts.hard);
    if (visible) {
      bar.classList.remove('hidden');
      bar.style.opacity = '1';
      bar.style.pointerEvents = 'auto';
      return;
    }
    if (hard) {
      bar.style.opacity = '0';
      bar.style.pointerEvents = 'none';
      bar.classList.add('hidden');
      return;
    }
    if (bar.classList.contains('hidden')) bar.classList.remove('hidden');
    bar.style.opacity = '0';
    bar.style.pointerEvents = 'none';
  }

  function _refreshTtsBarAutoHide(forceShow) {
    if (!_open) {
      _clearTtsBarHideTimer();
      return;
    }
    if (forceShow) _setTtsBarVisible(true);
    if (_isTtsMegaOpen() || _ttsBarLastStatus === 'paused' || _ttsBarHoverBar || _ttsBarHoverBottomZone) {
      _clearTtsBarHideTimer();
      _setTtsBarVisible(true);
      return;
    }
    _clearTtsBarHideTimer();
    if (!_isTtsBarAutoHideAllowed()) return;
    _setTtsBarVisible(true);
    _ttsBarHideTimer = setTimeout(function () {
      _ttsBarHideTimer = null;
      if (_isTtsBarAutoHideAllowed()) _setTtsBarVisible(false);
    }, TTS_BAR_AUTO_HIDE_MS);
  }

  function _wireTtsBarAutoHideUi() {
    if (_ttsBarAutoHideUiWired) return;
    var bar = qs('lpTtsBar');
    var overlay = qs('booksListenPlayerOverlay');
    var readingArea = overlay ? overlay.querySelector('.br-reading-area') : document.querySelector('.br-reading-area');
    if (!bar || !readingArea) return;
    _ttsBarAutoHideUiWired = true;
    _ensureTtsBarAutoHideStyles();

    function onBarEnterOrMove() {
      if (!_open || !_ttsStarted) return;
      if (!_ttsBarHoverBar) _ttsBarHoverBar = true;
      _refreshTtsBarAutoHide(true);
    }
    function onBarLeave() {
      if (!_ttsBarHoverBar) return;
      _ttsBarHoverBar = false;
      _refreshTtsBarAutoHide(false);
    }
    function setBottomZoneHover(next) {
      next = !!next;
      if (_ttsBarHoverBottomZone === next) return;
      _ttsBarHoverBottomZone = next;
      _refreshTtsBarAutoHide(next);
    }

    bar.addEventListener('mousemove', onBarEnterOrMove);
    bar.addEventListener('mouseenter', onBarEnterOrMove);
    bar.addEventListener('mouseleave', onBarLeave);
    bar.addEventListener('click', function (ev) {
      if (!_open || !_ttsStarted) return;
      var btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
      if (!btn) return;
      _refreshTtsBarAutoHide(true);
    }, true);

    readingArea.addEventListener('mousemove', function (ev) {
      if (!_open || !_ttsStarted) return;
      var rect = readingArea.getBoundingClientRect();
      if (!rect || rect.height <= 0) return;
      var y = ev.clientY;
      var within = (y >= rect.top && y <= rect.bottom);
      var inBottom = within && ((rect.bottom - y) <= 80);
      setBottomZoneHover(inBottom);
    });
    readingArea.addEventListener('mouseleave', function () { setBottomZoneHover(false); });
  }

  // ── Sync play/pause icon ────────────────────────────────────────────────────
  function syncPlayPause(status) {
    var btn = qs('lpTtsPlayPause');
    if (!btn) return;
    var showPause = (status === 'playing' || status === 'section_transition');
    btn.innerHTML = showPause ? SVG_PAUSE : SVG_PLAY;
    btn.title = showPause ? 'Pause' : 'Play';
  }

  // ── Speed display sync ──────────────────────────────────────────────────────
  function syncSpeed() {
    var tts = window.booksTTS;
    var rate = (tts && tts.getRate) ? tts.getRate() : 1.0;
    var el = qs('lpTtsSpeed');
    if (el) el.textContent = rate.toFixed(1) + '\u00d7';
  }

  function _applyTtsSetting(fnName, value) {
    var tts = window.booksTTS;
    if (!tts || !tts[fnName]) return;
    try {
      var ret = tts[fnName](value);
      if (ret && typeof ret.then === 'function') {
        ret.catch(function (err) {
          try { console.warn('[listen] throttled TTS setting update failed:', fnName, err); } catch {}
        });
      }
    } catch (err) {
      try { console.warn('[listen] throttled TTS setting update failed:', fnName, err); } catch {}
    }
  }

  // ── Engine badge ────────────────────────────────────────────────────────────
  function syncEngine() {
    var tts = window.booksTTS;
    var el = qs('lpTtsEngine');
    if (!el) return;
    var eid = tts ? tts.getEngineId() : '';
    el.textContent = eid === 'edge' ? 'Edge Neural' : '';
    el.title = eid ? ('TTS engine: ' + eid) : '';
  }

  // ── HTML-escape ─────────────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Reading card update ─────────────────────────────────────────────────────
  
function updateCard(info) {
    if (!info) return;

    var outer = qs('lpCardText');
    var inner = qs('lpCardInner');

    // Fallback: if the new stage container isn't present for some reason,
    // keep the old behavior (single snippet).
    if (!outer || !inner) {
      var card = outer;
      if (card) {
        var text = String(info.text || '');
        var wStart = info.wordStart;
        var wEnd = info.wordEnd;
        var html;
        if (text && wStart >= 0 && wEnd > wStart && wEnd <= text.length) {
          html = escHtml(text.slice(0, wStart))
            + '<mark class="lp-word-active">' + escHtml(text.slice(wStart, wEnd)) + '</mark>'
            + escHtml(text.slice(wEnd));
        } else {
          html = escHtml(text);
        }
        card.innerHTML = html;
      }
    } else {
      // Render a small window around the current segment to create a scrolling prose stage.
      var win = null;
      try {
        if (window.booksTTS && typeof window.booksTTS.getSegmentWindow === 'function') {
          win = window.booksTTS.getSegmentWindow(3, 3);
        }
      } catch (e) {}

      if (!win || !win.segments || !win.segments.length) {
        // If the engine can't provide a window yet, render just the current text.
        var t = String(info.text || '');
        // Keep word highlight even in fallback mode so prose still tracks.
        var wS0 = info.wordStart;
        var wE0 = info.wordEnd;
        if (t && wS0 >= 0 && wE0 > wS0 && wE0 <= t.length) {
          inner.innerHTML = '<div class="lp-seg is-active">'
            + escHtml(t.slice(0, wS0))
            + '<mark class="lp-word-active">' + escHtml(t.slice(wS0, wE0)) + '</mark>'
            + escHtml(t.slice(wE0))
            + '</div>';
        } else {
          inner.innerHTML = '<div class="lp-seg is-active">' + escHtml(t) + '</div>';
        }
        inner.style.transform = 'translateY(0px)';
        _cardActiveIdx = -1;
        _cardSegCount = 0;
      } else {
        var activeIdx = win.activeIdx;

        // FIX-TTS-B6 #11: If same block, only update word highlight in the active segment
        // instead of rebuilding all 7 segment divs (avoids innerHTML 10-20x/sec)
        var needFullRebuild = (activeIdx !== _cardActiveIdx || win.segments.length !== _cardSegCount);

        if (!needFullRebuild) {
          var activeDivEl = inner.querySelector('.lp-seg.is-active');
          if (activeDivEl) {
            var txt0 = String(info.text || '');
            var wSI = info.wordStart;
            var wEI = info.wordEnd;
            if (txt0 && wSI >= 0 && wEI > wSI && wEI <= txt0.length) {
              activeDivEl.innerHTML = escHtml(txt0.slice(0, wSI))
                + '<mark class="lp-word-active">' + escHtml(txt0.slice(wSI, wEI)) + '</mark>'
                + escHtml(txt0.slice(wEI));
            }
          }
        } else {
          _cardActiveIdx = activeIdx;
          _cardSegCount = win.segments.length;
          var html2 = '';
          for (var i = 0; i < win.segments.length; i++) {
            var seg = win.segments[i];
            var txt = String(seg.text || '');
            var cls = 'lp-seg';
            if (seg.idx === activeIdx) cls += ' is-active';
            else if (Math.abs(seg.idx - activeIdx) === 1) cls += ' is-near';

            if (seg.idx === activeIdx) {
              var wS = info.wordStart;
              var wE = info.wordEnd;
              if (txt && wS >= 0 && wE > wS && wE <= txt.length) {
                html2 += '<div class="' + cls + '" data-idx="' + String(seg.idx) + '">'
                  + escHtml(txt.slice(0, wS))
                  + '<mark class="lp-word-active">' + escHtml(txt.slice(wS, wE)) + '</mark>'
                  + escHtml(txt.slice(wE))
                  + '</div>';
              } else {
                html2 += '<div class="' + cls + '" data-idx="' + String(seg.idx) + '">' + escHtml(txt) + '</div>';
              }
            } else {
              html2 += '<div class="' + cls + '" data-idx="' + String(seg.idx) + '">' + escHtml(txt) + '</div>';
            }
          }
          inner.innerHTML = html2;
        }

        // FIX-LP-SCROLL: Auto-scroll to keep the narrated word visible in the
        // 4:3 prose stage. Targets the <mark> word highlight when present (so
        // long paragraphs scroll within themselves), falling back to the active
        // segment div for block-level tracking.
        requestAnimationFrame(function () {
          try {
            var activeEl = inner.querySelector('.lp-seg.is-active');
            if (!activeEl) return;

            var stageH = outer.clientHeight || 0;
            var innerH = inner.scrollHeight || 0;
            if (!stageH || !innerH) return;

            // FIX-LP-SCROLL: prefer the word-level <mark> for scroll target so
            // the view follows each word, not just each paragraph.
            var target = activeEl.querySelector('mark.lp-word-active') || activeEl;
            var focusY = Math.round(stageH * 0.48);
            var targetCenter = target.offsetTop + (target.offsetHeight / 2);
            var translate = focusY - targetCenter;

            var minTranslate = stageH - innerH;
            if (minTranslate > 0) minTranslate = 0;

            if (translate > 0) translate = 0;
            if (translate < minTranslate) translate = minTranslate;

            inner.style.transform = 'translateY(' + String(Math.round(translate)) + 'px)';
          } catch (e) {}
        });
      }
    }

    var idxEl = qs('lpBlockIdx');
    var cntEl = qs('lpBlockCount');
    var idx = (info.blockIdx >= 0) ? info.blockIdx + 1 : 0;
    var cnt = info.blockCount || 0;
    if (idxEl) idxEl.textContent = String(idx);
    if (cntEl) cntEl.textContent = String(cnt);
    // QOL: seek bar sync
    var seek = qs('lpSeekBar');
    if (seek) {
      var max = Math.max(0, (cnt || 0) - 1);
      seek.max = String(max);
      seek.value = String(clamp(((info.blockIdx >= 0) ? info.blockIdx : 0), 0, max));
      var prev = qs('lpSeekPreview');
      if (prev) prev.textContent = '';
    }

    syncSpeed();

    // OPT1: update time estimate
    var timeEl = qs('lpTimeEstimate');
    if (timeEl) timeEl.textContent = _estimateTimeRemaining(info);

    // Progress save on block change
    var blockIdx = (info.blockIdx >= 0) ? info.blockIdx : -1;
    if (blockIdx >= 0 && blockIdx !== _lastSavedBlockIdx) {
      _lastSavedBlockIdx = blockIdx;
      saveProgress(info, false);
    }
  }

  // ── Progress persistence (LISTEN_P4) ────────────────────────────────────────
  function saveProgress(info, immediate) {
    if (!_book || !_book.id) return;
    var primaryId = String(_book.id || '');
    var fallbackId = String(_book.path || '');
    var entry = {
      blockIdx:   info ? info.blockIdx   : (_lastSavedBlockIdx >= 0 ? _lastSavedBlockIdx : 0),
      blockCount: info ? info.blockCount : 0,
      title:  _book.title  || '',
      format: _book.format || '',
    };
    if (immediate) {
      if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
      try {
        var api = window.Tanko && window.Tanko.api;
        if (api && typeof api.saveBooksTtsProgress === 'function') {
          // FIX-LISTEN-CONT: return promise so closePlayer can await before re-render
          var p = api.saveBooksTtsProgress(primaryId, entry).catch(function () {});
          if (fallbackId && fallbackId !== primaryId) {
            try { api.saveBooksTtsProgress(fallbackId, entry).catch(function () {}); } catch {}
          }
          return p;
        }
      } catch {}
    } else {
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(function () {
        _saveTimer = null;
        try {
          var api = window.Tanko && window.Tanko.api;
          if (api && typeof api.saveBooksTtsProgress === 'function') {
            api.saveBooksTtsProgress(primaryId, entry).catch(function () {});
            if (fallbackId && fallbackId !== primaryId) {
              try { api.saveBooksTtsProgress(fallbackId, entry).catch(function () {}); } catch {}
            }
          }
        } catch {}
      }, 2000);
    }
  }

  // ── Voice selector (locale-grouped, friendly names) ─────────────────────────
  function populateVoices() {
    var sel = qs('lpTtsVoice');
    if (!sel) return;
    var tts = window.booksTTS;
    if (!tts || typeof tts.getVoices !== 'function') return;
    var voices = [];
    try { voices = tts.getVoices(); } catch {}
    // FIX-TTS-B6 #20: Skip rebuild if voice count unchanged (voices don't change mid-session)
    if (_voiceCacheCount === voices.length && sel.options.length > 0) {
      if (_settings.ttsVoice) sel.value = _settings.ttsVoice;
      return;
    }
    _voiceCacheCount = voices.length;
    var enVoices = voices.filter(function (v) { return /^en[-_]/i.test(v.lang || ''); });
    sel.innerHTML = '';
    if (!enVoices.length) {
      var opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No English voices available \u2014 check TTS diagnostics';
      opt.disabled = true;
      sel.appendChild(opt);
      return;
    }
    var localeGroups = {};
    for (var i = 0; i < enVoices.length; i++) {
      var v = enVoices[i];
      var uri = String(v.voiceURI || v.name || '');
      var parts = uri.split('-');
      var locale = (parts.length >= 2) ? (parts[0] + '-' + parts[1]) : 'en-US';
      if (!localeGroups[locale]) localeGroups[locale] = [];
      localeGroups[locale].push(v);
    }
    var localeOrder = ['en-US', 'en-GB', 'en-AU', 'en-IN'];
    var allLocales = Object.keys(localeGroups);
    for (var li = 0; li < allLocales.length; li++) {
      if (localeOrder.indexOf(allLocales[li]) < 0) localeOrder.push(allLocales[li]);
    }
    for (var gi = 0; gi < localeOrder.length; gi++) {
      var loc = localeOrder[gi];
      var group = localeGroups[loc];
      if (!group || !group.length) continue;
      var groupLabel = LOCALE_LABELS[loc] || loc;
      var optGroup = document.createElement('optgroup');
      optGroup.label = groupLabel + ' (' + group.length + ')';
      for (var vi = 0; vi < group.length; vi++) {
        var voice = group[vi];
        var o = document.createElement('option');
        o.value = voice.voiceURI || voice.name || '';
        o.textContent = _voiceDisplayName(voice);
        optGroup.appendChild(o);
      }
      sel.appendChild(optGroup);
    }
    if (_settings.ttsVoice) sel.value = _settings.ttsVoice;
  }

  // ── Highlight controls ──────────────────────────────────────────────────────
  var HL_SWATCHES = { grey: '#9a9aa8', blue: '#5a96ff', yellow: '#e6c800', green: '#50b464', pink: '#ff6e96', orange: '#ffa032' };

  function populateHlControls() {
    var tts = window.booksTTS;
    if (!tts) return;
    // Style selector
    var hlStyleSel = qs('lpTtsHlStyle');
    if (hlStyleSel) {
      var styles = typeof tts.getHighlightStyles === 'function' ? tts.getHighlightStyles() : [];
      var labels = { highlight: 'Highlight', underline: 'Underline', squiggly: 'Squiggly', strikethrough: 'Strikethrough', enlarge: 'Enlarge' };
      if (hlStyleSel.options.length === 0) {
        for (var i = 0; i < styles.length; i++) {
          var o = document.createElement('option');
          o.value = styles[i];
          o.textContent = labels[styles[i]] || styles[i];
          hlStyleSel.appendChild(o);
        }
      }
      var curStyle = typeof tts.getHighlightStyle === 'function' ? tts.getHighlightStyle() : 'highlight';
      hlStyleSel.value = curStyle;
    }
    // Color swatches
    _populateColorSwatches('lpTtsHlColors', tts, 'getHighlightColor');
    // Word tracking checkbox
    var wt = qs('lpTtsWordTracking');
    if (wt) {
      var gran = typeof tts.getHighlightGranularity === 'function' ? tts.getHighlightGranularity() : 'sentence';
      wt.checked = (gran === 'word');
    }
    // Word hl row visibility
    var wordHlRow = qs('lpWordHlRow');
    var wordGran = typeof tts.getHighlightGranularity === 'function' ? tts.getHighlightGranularity() : 'sentence';
    if (wordHlRow) wordHlRow.style.display = (wordGran === 'word') ? '' : 'none';
    // Word style selector
    var wStyleSel = qs('lpTtsWordHlStyle');
    if (wStyleSel) {
      var wStyles = typeof tts.getHighlightStyles === 'function' ? tts.getHighlightStyles() : [];
      var wLabels = { highlight: 'Highlight', underline: 'Underline', squiggly: 'Squiggly', strikethrough: 'Strikethrough', enlarge: 'Enlarge' };
      if (wStyleSel.options.length === 0) {
        for (var wi = 0; wi < wStyles.length; wi++) {
          var wo = document.createElement('option');
          wo.value = wStyles[wi];
          wo.textContent = wLabels[wStyles[wi]] || wStyles[wi];
          wStyleSel.appendChild(wo);
        }
      }
      var curWStyle = typeof tts.getWordHighlightStyle === 'function' ? tts.getWordHighlightStyle() : 'highlight';
      wStyleSel.value = curWStyle;
    }
    // Word color swatches
    _populateColorSwatches('lpTtsWordHlColors', tts, 'getWordHighlightColor');
    // Enlarge row
    var curHlStyle = typeof tts.getHighlightStyle === 'function' ? tts.getHighlightStyle() : 'highlight';
    var enlargeRow = qs('lpEnlargeRow');
    if (enlargeRow) enlargeRow.style.display = (curHlStyle === 'enlarge') ? '' : 'none';
    var scaleSlider = qs('lpTtsEnlargeScale');
    if (scaleSlider) {
      var scale = typeof tts.getEnlargeScale === 'function' ? tts.getEnlargeScale() : 1.35;
      scaleSlider.value = scale;
    }
    var scaleVal = qs('lpTtsEnlargeVal');
    if (scaleVal) {
      var sv = typeof tts.getEnlargeScale === 'function' ? tts.getEnlargeScale() : 1.35;
      scaleVal.textContent = sv.toFixed(2) + 'x';
    }
  }

  function _populateColorSwatches(containerId, tts, getterName) {
    var container = qs(containerId);
    if (!container) return;
    var colors = typeof tts.getHighlightColors === 'function' ? tts.getHighlightColors() : [];
    var curColor = (typeof tts[getterName] === 'function') ? tts[getterName]() : 'blue';
    if (!container.children.length) {
      for (var j = 0; j < colors.length; j++) {
        var btn = document.createElement('button');
        btn.className = 'ttsColorSwatch';
        btn.dataset.color = colors[j];
        btn.style.background = HL_SWATCHES[colors[j]] || '#888';
        var colorName = colors[j].charAt(0).toUpperCase() + colors[j].slice(1);
        btn.title = colorName;
        // FIX-TTS-B8 #18: Screen reader accessible label
        btn.setAttribute('aria-label', colorName + ' highlight color');
        container.appendChild(btn);
      }
    }
    var btns = container.querySelectorAll('.ttsColorSwatch');
    for (var k = 0; k < btns.length; k++) {
      btns[k].classList.toggle('active', btns[k].dataset.color === curColor);
    }
  }

  // ── Diagnostics ─────────────────────────────────────────────────────────────
  function updateDiag() {
    var body = qs('lpTtsDiagBody');
    if (!body) return;
    var tts = window.booksTTS;
    if (!tts) { body.textContent = 'TTS not initialized'; return; }
    var info = tts.getSnippet();
    var usableMap = (typeof tts.getEngineUsableMap === 'function') ? tts.getEngineUsableMap() : {};
    var lines = [
      'Engine: ' + (info.engineId || 'none'),
      'Selection: ' + (info.selectionReason || '(none)'),
      'Available: [' + tts.getAvailableEngines().join(', ') + ']',
      'Usable map: ' + JSON.stringify(usableMap || {}),
      'Status: ' + (info.status || 'idle'),
      'Rate: ' + (info.rate || 1.0).toFixed(1),
      'Pitch: ' + (info.pitch || 1.0).toFixed(2),
      'Preset: ' + (info.preset || 'custom'),
      'Voice: ' + (_settings.ttsVoice || '(default)'),
      'Block: ' + (info.blockIdx >= 0 ? (info.blockIdx + 1) + '/' + (info.blockCount || '?') : '-'),
    ];
    if (info.lastDiag) {
      lines.push('Last diag: ' + String(info.lastDiag.code || '') + ' ' + String(info.lastDiag.detail || '').trim());
    }
    if (info.lastError) {
      var errStr = typeof info.lastError === 'object'
        ? (info.lastError.error || info.lastError.message || JSON.stringify(info.lastError))
        : String(info.lastError);
      lines.push('Last error: ' + errStr);
    }
    body.textContent = lines.join('\n');
  }

  // ── TTS actions ─────────────────────────────────────────────────────────────
  function ttsToggle() {
    _refreshTtsBarAutoHide(true);
    var tts = window.booksTTS;
    if (!tts) return;
    var st = tts.getState();
    if (st === 'section_transition') return;
    if (st === 'idle') tts.play();
    else if (st === 'playing') tts.pause();
    else if (st === 'paused') {
      if (_autoRewindEnabled && _pausedAtMs && (Date.now() - _pausedAtMs) > AUTO_REWIND_AFTER_PAUSE_MS) {
        try { tts.jumpApproxMs(-AUTO_REWIND_MS); } catch {}
      }
      tts.resume();
    }
  }

  function ttsStop() {
    _clearTtsBarHideTimer();
    var tts = window.booksTTS;
    if (tts) tts.stop();
    _setTtsBarVisible(false, { hard: true });
  }

  function ttsAdjustSpeed(delta) {
    _refreshTtsBarAutoHide(true);
    var tts = window.booksTTS;
    if (!tts) return;
    var current = tts.getRate();
    var limits = (typeof tts.getRateLimits === 'function') ? tts.getRateLimits() : { min: 0.5, max: 3.0 };
    var next = Math.max(limits.min, Math.min(limits.max, Math.round((current + delta) * 10) / 10));
    _applyTtsSetting('setRate', next);
    _settings.ttsRate = next;
    _lsSet('Rate', String(next));
    syncSpeed();
  }

  function ttsJump(deltaMs) {
    _refreshTtsBarAutoHide(true);
    var tts = window.booksTTS;
    if (!tts) return;
    tts.jumpApproxMs(deltaMs);
  }

  function ttsPlayFromSelection() {
    var tts = window.booksTTS;
    if (!tts) return;
    var RS = window.booksReaderState;
    var selectedText = '';
    if (RS && RS.state && RS.state.engine && typeof RS.state.engine.getSelectedText === 'function') {
      var sel = RS.state.engine.getSelectedText();
      if (sel && typeof sel === 'object') selectedText = String(sel.text || '');
      else selectedText = String(sel || '');
    }
    if (!selectedText.trim()) return;
    tts.playFromSelection(selectedText);
  }

  // ── TOC panel ───────────────────────────────────────────────────────────────
  function normalizeTocHref(href) {
    var h = String(href || '').replace(/^\.\//, '');
    var hi = h.indexOf('#');
    if (hi >= 0) h = h.substring(0, hi);
    try { h = decodeURIComponent(h); } catch {}
    return h.toLowerCase().trim();
  }

  function showTocPanel(show) {
    _tocPanelOpen = show;
    var panel = qs('lpTocPanel');
    if (panel) panel.classList.toggle('hidden', !show);
    var btn = qs('lpTocBtn');
    if (btn) btn.setAttribute('aria-expanded', String(show));
  }

  function renderTocPanel() {
    var list = qs('lpTocList');
    var empty = qs('lpTocEmpty');
    if (!list) return;
    list.innerHTML = '';
    var RS = window.booksReaderState;
    var items = (RS && RS.state && Array.isArray(RS.state.tocItems)) ? RS.state.tocItems : [];
    if (!items.length) {
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    var activeNorm = normalizeTocHref(_activeTocHref);
    var frag = document.createDocumentFragment();
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var label = String(item.label || item.title || 'Chapter ' + (i + 1));
      var depth = Number(item.depth || item.level || 0);
      var href  = String(item.href || '');
      var btn = document.createElement('button');
      btn.className = 'lp-toc-item';
      btn.type = 'button';
      btn.title = label;
      btn.dataset.href = href;
      btn.dataset.idx  = String(i);
      if (depth > 0) btn.style.paddingLeft = (14 + depth * 14) + 'px';
      if (activeNorm && normalizeTocHref(href) === activeNorm) btn.classList.add('active');
      var labelSpan = document.createElement('span');
      labelSpan.textContent = label;
      btn.appendChild(labelSpan);
      btn.addEventListener('click', (function (h, idx) {
        return function () { navigateToChapter(h, idx); };
      })(href, i));
      frag.appendChild(btn);
    }
    list.appendChild(frag);
  }

  function updateTocActive(href) {
    if (!href) return;
    _activeTocHref = href;
    var norm = normalizeTocHref(href);
    var list = qs('lpTocList');
    if (!list) return;
    var items = list.querySelectorAll('.lp-toc-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('active', normalizeTocHref(items[i].dataset.href || '') === norm);
    }
  }

  // OPT1: Sleep timer — pause TTS after user-configured duration
  function _clearSleepTimer() {
    if (_sleepTimerId) { clearInterval(_sleepTimerId); _sleepTimerId = null; }
    if (_sleepCountdownId) { clearInterval(_sleepCountdownId); _sleepCountdownId = null; }
    _sleepEndMs = 0;
    _sleepMode = 'off';
    var el = qs('lpSleepCountdown');
    if (el) el.textContent = '';
    var sel = qs('lpSleepTimer');
    if (sel) sel.value = 'off';
  }

  function _updateSleepCountdown() {
    var el = qs('lpSleepCountdown');
    if (!el) return;
    if (_sleepMode === 'off') { el.textContent = ''; return; }
    if (_sleepMode === 'chapter') { el.textContent = '(end of chapter)'; return; }
    var remaining = Math.max(0, _sleepEndMs - Date.now());
    if (remaining <= 0) { el.textContent = ''; return; }
    // FIX-TTS-B7 #15: Show seconds under 1 minute for responsive countdown feel
    if (remaining < 60000) {
      var secs = Math.ceil(remaining / 1000);
      el.textContent = secs + 's left';
    } else {
      var mins = Math.ceil(remaining / 60000);
      el.textContent = mins + 'm left';
    }
  }

  function setSleepTimer(mode) {
    _clearSleepTimer();
    if (!mode || mode === 'off') return;
    _sleepMode = mode;
    if (mode === 'chapter') {
      _updateSleepCountdown();
      return;
    }
    var minutes = parseInt(mode, 10);
    if (!minutes || minutes <= 0) return;
    _sleepEndMs = Date.now() + minutes * 60000;
    _sleepTimerId = setInterval(function () {
      if (Date.now() >= _sleepEndMs) {
        var tts = window.booksTTS;
        if (tts && tts.getState() === 'playing') tts.pause();
        _clearSleepTimer();
      }
    }, 1000);
    // FIX-TTS-B7 #15: Update every 1s instead of 10s for responsive countdown
    _sleepCountdownId = setInterval(_updateSleepCountdown, 1000);
    _updateSleepCountdown();
  }

  // OPT1: Reading time estimate
  function _estimateTimeRemaining(info) {
    if (!info || info.blockCount <= 0 || info.blockIdx < 0) return '';
    var remaining = info.blockCount - info.blockIdx - 1;
    if (remaining <= 0) return '';
    var avgWords = 25;
    var wpm = 150 * (_settings.ttsRate || 1.0);
    var mins = Math.round((remaining * avgWords) / wpm);
    if (mins < 1) return '<1m';
    if (mins >= 60) {
      var h = Math.floor(mins / 60);
      var m = mins % 60;
      return '~' + h + 'h ' + m + 'm';
    }
    return '~' + mins + 'm';
  }

  function navigateToChapter(href, idx) {
    if (!href) return;
    var tts = window.booksTTS;
    if (tts) try { tts.stop(); } catch {}
    _navigating = true;
    showTocPanel(false);
    var bus = window.booksReaderBus;
    var emitted = false;
    if (bus) try { bus.emit('toc:navigate', href, idx); emitted = true; } catch {}
    if (!emitted) { _navigating = false; return; }
    // PATCH2: resume handled by reader relocation event
    // FIX-TTS-B7 #10: Timeout fallback — if relocated event never fires, resume after 5s
    setTimeout(function () {
      if (!_navigating || !_open) return;
      _navigating = false;
      var t = window.booksTTS;
      if (t) try { t.play(); } catch {}
    }, 5000);
  }

  // ── TTS wiring ──────────────────────────────────────────────────────────────
  function wireTts() {
    var tts = window.booksTTS;
    if (!tts) return;
    tts.onStateChange = function (status, info) {
      if (status === 'paused') _pausedAtMs = Date.now();
      if (status === 'playing') _pausedAtMs = 0;
      _ttsBarLastStatus = status || 'idle';
      if (status === 'playing' || status === 'section_transition') _ttsBarHasPlayed = true;

      syncPlayPause(status);
      syncSpeed();
      syncEngine();
      if (info) updateCard(info);
      var diagEl = qs('lpTtsDiag');
      if (diagEl && !diagEl.classList.contains('hidden')) updateDiag();
      if (status === 'idle') {
        _clearTtsBarHideTimer();
        if (_ttsBarHasPlayed) _setTtsBarVisible(false, { hard: true });
      } else {
        _refreshTtsBarAutoHide(true);
      }
      // FIX-TTS-B4 #7: Notify user when TTS stopped due to repeated errors
      if (status === 'idle' && info && info.lastError) {
        var code = info.lastError.error || info.lastError.code || '';
        if (code === 'max_errors_reached') {
          toast('Listening stopped \u2014 too many errors. Try again or switch voice.');
        }
      }
    };
    tts.onProgress = function (info) {
      updateCard(info);
      var diagEl = qs('lpTtsDiag');
      if (diagEl && !diagEl.classList.contains('hidden')) updateDiag();
    };
    tts.onDocumentEnd = function (info) {
      saveProgress(info, true);
    };
  }

  function unwireTts() {
    var tts = window.booksTTS;
    if (!tts) return;
    tts.onStateChange = null;
    tts.onProgress = null;
    tts.onDocumentEnd = null;
  }

  function _buildTtsInitOpts() {
    var RS = window.booksReaderState;
    var fmt = (_book && _book.format) ? String(_book.format).toLowerCase() : 'epub';
    return {
      format: fmt,
      getHost: function () { return RS && RS.state ? RS.state.host : null; },
      getViewEngine: function () { return RS && RS.state ? RS.state.engine : null; },
      onNeedAdvance: function () {
        // OPT1: sleep timer "end of chapter" — pause instead of advancing
        if (_sleepMode === 'chapter') {
          var tts = window.booksTTS;
          if (tts) try { tts.pause(); } catch {}
          _clearSleepTimer();
          return Promise.resolve(false);
        }
        var eng = RS && RS.state ? RS.state.engine : null;
        if (!eng || typeof eng.advanceSection !== 'function') return Promise.resolve(false);
        return eng.advanceSection(1).then(function () { return true; }).catch(function () { return false; });
      },
    };
  }

  function startTts() {
    if (_ttsStarted) return;
    _ttsStarted = true;
    wireTts();
    renderTocPanel();
    var tts = window.booksTTS;
    if (!tts) return;
    syncPlayPause('idle');
    if (typeof tts.init !== 'function') return;
    var opts = _buildTtsInitOpts();
    tts.init(opts).then(function () {
      if (!_open || !_ttsStarted) return;
      // Apply saved settings
      if (_settings.ttsVoice) try { tts.setVoice(_settings.ttsVoice); } catch {}
      if (_settings.ttsPreset) try { tts.setPreset(_settings.ttsPreset); } catch {}
      tts.setRate(_settings.ttsRate || 1.0);
      if (typeof tts.setPitch === 'function') {
        try { tts.setPitch(_settings.ttsPitch || 1.0); } catch {}
      }
      if (_settings.ttsHlStyle && typeof tts.setHighlightStyle === 'function') tts.setHighlightStyle(_settings.ttsHlStyle);
      if (_settings.ttsHlColor && typeof tts.setHighlightColor === 'function') tts.setHighlightColor(_settings.ttsHlColor);
      if (_settings.ttsHlGranularity && typeof tts.setHighlightGranularity === 'function') tts.setHighlightGranularity(_settings.ttsHlGranularity);
      if (_settings.ttsWordHlStyle && typeof tts.setWordHighlightStyle === 'function') tts.setWordHighlightStyle(_settings.ttsWordHlStyle);
      if (_settings.ttsWordHlColor && typeof tts.setWordHighlightColor === 'function') tts.setWordHighlightColor(_settings.ttsWordHlColor);
      if (_settings.ttsEnlargeScale && typeof tts.setEnlargeScale === 'function') tts.setEnlargeScale(_settings.ttsEnlargeScale);
      // TTS-QOL4: apply saved volume
      if (typeof tts.setVolume === 'function') tts.setVolume(_settings.ttsVolume || 1.0);

      populateVoices();
      populateHlControls();
      syncSpeed();
      syncEngine();
      var presetSel = qs('lpTtsPresetSel');
      if (presetSel && _settings.ttsPreset) presetSel.value = _settings.ttsPreset;
      // TTS-QOL4: sync enlarge slider + volume slider to saved values
      var enlargeSlider = qs('lpTtsEnlargeScale');
      if (enlargeSlider) { enlargeSlider.value = String(_settings.ttsEnlargeScale || 1.35); var ev2 = qs('lpTtsEnlargeVal'); if (ev2) ev2.textContent = (_settings.ttsEnlargeScale || 1.35).toFixed(2) + 'x'; }
      var volS = qs('lpVolume');
      if (volS) volS.value = String(_settings.ttsVolume || 1.0);

      try {
        var snap = tts.getSnippet ? tts.getSnippet() : null;
        if (snap) updateCard(snap);
        syncPlayPause(tts.getState ? tts.getState() : 'idle');
      } catch {}

      // Resume from saved progress (FIX-LISTEN-PROG): handle id/path normalization + update UI immediately
      var resumeIdx = 0;
      var api = window.Tanko && window.Tanko.api;
      var bookId = _book && (_book.id || _book.path);
      function applyEntry(entry) {
        if (!_open || !_ttsStarted) return;
        if (entry && typeof entry.blockIdx === 'number' && entry.blockIdx >= 0) resumeIdx = entry.blockIdx;
        // Update UI immediately (labels) even before the first snippet render
        try {
          var idxEl = qs('lpBlockIdx');
          var cntEl = qs('lpBlockCount');
          var cnt = entry && typeof entry.blockCount === 'number' ? entry.blockCount : 0;
          if (idxEl) idxEl.textContent = String((resumeIdx >= 0 ? resumeIdx + 1 : 0));
          if (cntEl && cnt) cntEl.textContent = String(cnt);
        } catch {}
        try { tts.play(resumeIdx > 0 ? resumeIdx : 0); } catch (e) {
          try { console.error('[listen-player] tts.play() failed:', e); } catch {}
        }
      }
      function fetchEntry(primaryId, fallbackId) {
        if (!api || typeof api.getBooksTtsProgress !== 'function' || !primaryId) return Promise.resolve(null);
        return api.getBooksTtsProgress(primaryId).then(function (e) {
          if (e) return e;
          if (fallbackId && fallbackId !== primaryId) return api.getBooksTtsProgress(fallbackId).catch(function () { return null; });
          return null;
        }).catch(function () {
          if (fallbackId && fallbackId !== primaryId) return api.getBooksTtsProgress(fallbackId).catch(function () { return null; });
          return null;
        });
      }
      if (api && typeof api.getBooksTtsProgress === 'function' && bookId) {
        var primary = _book && _book.id ? _book.id : null;
        var fallback = _book && _book.path ? _book.path : null;
        fetchEntry(primary || bookId, fallback).then(function (entry) {
          applyEntry(entry);
        });
      } else {
        try { tts.play(0); } catch {}
      }
    }).catch(function (e) {
      try { console.error('[listen-player] tts.init() failed:', e); } catch {}
    });
  }

  // ── Open / close ────────────────────────────────────────────────────────────
  function open(book) {
    if (!book) return;
    if (_open) {
      try { var tts = window.booksTTS; if (tts) tts.stop(); } catch {}
      unwireTts();
      _clearTtsBarHideTimer();
      _setTtsBarVisible(false, { hard: true });
      showOverlay(false);
      _open = false;
      _ttsStarted = false;
    }
    _book = book;

    // PATCH3: reload preferences for this specific book.
    _loadPrefs();

    _open = true;
    _ttsStarted = false;
    _ttsBarLastStatus = 'idle';
    _ttsBarHasPlayed = false;
    _ttsBarHoverBar = false;
    _ttsBarHoverBottomZone = false;
    _clearTtsBarHideTimer();
    _lastSavedBlockIdx = -1;
    _tocPanelOpen = false;
    _navigating = false;
    _activeTocHref = '';
    var titleEl = qs('lpBookTitle');
    if (titleEl) titleEl.textContent = book.title || '';
    var card = qs('lpCardText');
    if (card) card.innerHTML = '<span class="lp-loading-msg">Preparing TTS\u2026</span>'; // OPT2: loading feedback
    var idxEl = qs('lpBlockIdx');
    var cntEl = qs('lpBlockCount');
    if (idxEl) idxEl.textContent = '0';
    if (cntEl) cntEl.textContent = '0';
    syncPlayPause('idle');
    // Show TTS bar immediately
    var bar = qs('lpTtsBar');
    if (bar) bar.classList.remove('hidden');
    _setTtsBarVisible(true, { hard: true });
    _refreshTtsBarAutoHide(false);

    showOverlay(true);
    _applyCardFont(_settings.ttsFont);

    // LISTEN_PATCH1: prevent listening from writing into reading progress.
    try {
      var RSx = window.booksReaderState;
      if (RSx && typeof RSx.setSuspendProgressSave === 'function') {
        RSx.setSuspendProgressSave(true, 'listening_mode');
      } else if (RSx && RSx.state) {
        RSx.state.suspendProgressSave = true;
        RSx.state.suspendProgressSaveReason = 'listening_mode';
      }
    } catch {}

    // PATCH2: user interaction should pause TTS auto-scroll briefly
    if (!_interactionWired) {
      _interactionWired = true;
      var notify = function () {
        try {
          var tts = window.booksTTS;
          if (tts && typeof tts.notifyUserInteraction === 'function') tts.notifyUserInteraction(2500);
        } catch {}
      };
      window.addEventListener('wheel', notify, { passive: true, capture: true });
      window.addEventListener('touchmove', notify, { passive: true, capture: true });
      window.addEventListener('pointerdown', notify, { passive: true, capture: true });
      document.addEventListener('selectionchange', notify, { capture: true });
    }

    // STRIP-LISTEN-MODE: skip re-opening if reader already has this book
    var ctl = window.booksReaderController;
    var RS = window.booksReaderState;
    var alreadyOpen = ctl && typeof ctl.isOpen === 'function' && ctl.isOpen()
      && RS && RS.state && RS.state.book
      && String(RS.state.book.id || '') === String(book.id || '');
    if (alreadyOpen) {
      startTts();
      return;
    }

    var booksApp = window.booksApp;
    if (!booksApp || typeof booksApp.openBookInReader !== 'function') return;
    booksApp.openBookInReader(book).catch(function (e) {
      try { console.error('[listen-player] openBookInReader failed:', e); } catch {}
      _open = false;
    });
  }

  function closePlayer() {
    if (!_open) return;
    _open = false;
    _ttsStarted = false;
    _clearSleepTimer(); // OPT1
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    // Save final progress
    try {
      var tts2 = window.booksTTS;
      var snap = tts2 && tts2.getSnippet ? tts2.getSnippet() : null;
      saveProgress(snap, true);
    } catch {}
    // TTS-RESUME-HL: Before destroy, scroll reader to last spoken block and highlight it
    try {
      var ttsR = window.booksTTS;
      if (ttsR && typeof ttsR.getLastBlockInfo === 'function') {
        var blockInfo = ttsR.getLastBlockInfo();
        if (blockInfo && blockInfo.range) {
          // Scroll reader viewport to the last spoken block
          var renderer = blockInfo.renderer;
          if (renderer && typeof renderer.scrollToAnchorCentered === 'function') {
            try { renderer.scrollToAnchorCentered(blockInfo.range); } catch {}
          }
          // Apply persistent highlight on the sentence
          var RS = window.booksReaderState;
          var eng = RS && RS.state && RS.state.engine;
          if (eng && typeof eng.showResumeHighlight === 'function') {
            eng.showResumeHighlight(blockInfo.blockRange || blockInfo.range);
          }
        }
      }
    } catch {}

    // LISTEN_PATCH1: resume normal reader progress persistence.
    try {
      var RSr = window.booksReaderState;
      if (RSr && typeof RSr.setSuspendProgressSave === 'function') {
        RSr.setSuspendProgressSave(false);
      } else if (RSr && RSr.state) {
        RSr.state.suspendProgressSave = false;
        RSr.state.suspendProgressSaveReason = '';
      }
    } catch {}
    _lastSavedBlockIdx = -1;
    _tocPanelOpen = false;
    _navigating = false;
    showTocPanel(false);
    // Destroy TTS
    var tts = window.booksTTS;
    if (tts) { try { tts.destroy(); } catch {} }
    unwireTts();
    // Hide sub-panels
    var mega = qs('lpTtsMega');
    if (mega) mega.classList.add('hidden');
    var diag = qs('lpTtsDiag');
    if (diag) diag.classList.add('hidden');
    // STRIP-LISTEN-MODE: just hide overlay — reader stays open underneath
    _clearTtsBarHideTimer();
    _setTtsBarVisible(false, { hard: true });
    showOverlay(false);
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  function onPlayerKeyDown(e) {
    if (!_open) return;
    var tts = window.booksTTS;
    if (!tts) return;
    switch (e.key) {
      case ' ':
        e.preventDefault(); e.stopPropagation();
        ttsToggle();
        break;
      case 'ArrowLeft':
        e.preventDefault(); e.stopPropagation();
        try { tts.stepSegment(-1); } catch {}
        break;
      case 'ArrowRight':
        e.preventDefault(); e.stopPropagation();
        try { tts.stepSegment(1); } catch {}
        break;
      case 'c': case 'C':
        e.preventDefault(); e.stopPropagation();
        showTocPanel(!_tocPanelOpen);
        break;
      case 'Escape':
        e.preventDefault(); e.stopPropagation();
        if (_tocPanelOpen) { showTocPanel(false); break; }
        var mega = qs('lpTtsMega');
        if (mega && !mega.classList.contains('hidden')) { mega.classList.add('hidden'); _refreshTtsBarAutoHide(false); break; }
        var diag = qs('lpTtsDiag');
        if (diag && !diag.classList.contains('hidden')) { diag.classList.add('hidden'); break; }
        // FIX-TTS-B8 #16: Don't close player on Escape when no panel is open —
        // pause TTS instead, so rapid Escape presses don't accidentally exit
        if (tts && tts.getState() === 'playing') { tts.pause(); }
        break;
      // OPT1: additional keyboard shortcuts
      case 'm': case 'M':
        e.preventDefault(); e.stopPropagation();
        if (typeof tts.setVolume === 'function' && typeof tts.getVolume === 'function') {
          var curVol = tts.getVolume();
          if (curVol > 0) { _preMuteVolume = curVol; tts.setVolume(0); }
          else { tts.setVolume(_preMuteVolume > 0 ? _preMuteVolume : 1.0); _preMuteVolume = -1; }
          var volS = qs('lpVolume'); if (volS) volS.value = String(tts.getVolume());
        }
        break;
      case 's': case 'S':
        e.preventDefault(); e.stopPropagation();
        ttsStop();
        break;
      case '+': case '=':
        e.preventDefault(); e.stopPropagation();
        ttsAdjustSpeed(0.1);
        break;
      case '-':
        e.preventDefault(); e.stopPropagation();
        ttsAdjustSpeed(-0.1);
        break;
      // FIX-TTS-B8 #17: Additional shortcuts — ±10s jump, settings, diagnostics
      case 'j': case 'J':
        e.preventDefault(); e.stopPropagation();
        ttsJump(-10000);
        break;
      case 'l': case 'L':
        e.preventDefault(); e.stopPropagation();
        ttsJump(10000);
        break;
      case 'v': case 'V':
        e.preventDefault(); e.stopPropagation();
        var megaV = qs('lpTtsMega');
        if (megaV) { megaV.classList.toggle('hidden'); _refreshTtsBarAutoHide(true); }
        break;
      case 'd': case 'D':
        e.preventDefault(); e.stopPropagation();
        var diagD = qs('lpTtsDiag');
        if (diagD) {
          diagD.classList.toggle('hidden');
          if (!diagD.classList.contains('hidden')) updateDiag();
        }
        break;
    }
  }

  // ── Bind DOM events ─────────────────────────────────────────────────────────
  function bind() {
    console.log('[TTS-BAR] listening_player.js bind() called');
    _wireTtsBarAutoHideUi();
    window.addEventListener('books-reader-opened', function () {
      if (!_open) return;
      showOverlay(true);
      startTts();
    });
    window.addEventListener('books-reader-closed', function () {
      if (!_open) return;
      if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
      try {
        var tts3 = window.booksTTS;
        var snap3 = tts3 && tts3.getSnippet ? tts3.getSnippet() : null;
        saveProgress(snap3, true);
      } catch {}
      _lastSavedBlockIdx = -1;
      _clearTtsBarHideTimer();
      _setTtsBarVisible(false, { hard: true });
      showOverlay(false);
      _open = false;
      _ttsStarted = false;
      var ttsCleanup = window.booksTTS;
      if (ttsCleanup) { try { ttsCleanup.destroy(); } catch {} }
      unwireTts();
    });

    // Back button
    var backBtn = qs('lpBackBtn');
    if (backBtn) backBtn.addEventListener('click', closePlayer);

    // ── TTS bar buttons ──
    console.log('[TTS-BAR] wiring transport buttons');
    var ppBtn = qs('lpTtsPlayPause');
    if (ppBtn) ppBtn.addEventListener('click', function () { ttsToggle(); });

    var stopBtn = qs('lpTtsStop');
    if (stopBtn) stopBtn.addEventListener('click', function () { ttsStop(); });

    var rewindBtn = qs('lpTtsRewind');
    if (rewindBtn) rewindBtn.addEventListener('click', function () {
      var tts = window.booksTTS;
      if (tts && typeof tts.stepSegment === 'function') try { tts.stepSegment(-1); } catch {}
    });

    var fwdBtn = qs('lpTtsForward');
    if (fwdBtn) fwdBtn.addEventListener('click', function () {
      var tts = window.booksTTS;
      if (tts && typeof tts.stepSegment === 'function') try { tts.stepSegment(1); } catch {}
    });

    var back10 = qs('lpTtsBack10');
    if (back10) back10.addEventListener('click', function () { ttsJump(-10000); });

    var fwd10 = qs('lpTtsFwd10');
    if (fwd10) fwd10.addEventListener('click', function () { ttsJump(10000); });

    var slower = qs('lpTtsSlower');
    if (slower) slower.addEventListener('click', function () { ttsAdjustSpeed(-0.1); });

    var faster = qs('lpTtsFaster');
    if (faster) faster.addEventListener('click', function () { ttsAdjustSpeed(0.1); });

    // LISTEN_THEME: cycle reader theme from LP HUD
    var themeBtn = qs('lpThemeBtn');
    if (themeBtn) themeBtn.addEventListener('click', function () {
      if (window.booksReaderAppearance && typeof window.booksReaderAppearance.cycleTheme === 'function') {
        window.booksReaderAppearance.cycleTheme();
      }
    });

    // ── Mega settings panel ──
    var settingsBtn = qs('lpTtsSettingsBtn');
    console.log('[TTS-BAR] bind settingsBtn=' + !!settingsBtn);
    if (settingsBtn) settingsBtn.addEventListener('click', function () {
      var mega = qs('lpTtsMega');
      if (!mega) return;
      mega.classList.toggle('hidden');
      console.log('[TTS-BAR] settings click → mega hidden=' + mega.classList.contains('hidden'));
      if (!mega.classList.contains('hidden')) {
        console.log('[TTS-BAR] populating voices + highlights');
        populateVoices();
        populateHlControls();
        syncSpeed();
        syncEngine();
      }
      var diag = qs('lpTtsDiag');
      if (diag && !mega.classList.contains('hidden')) diag.classList.add('hidden');
      _refreshTtsBarAutoHide(true);
    });
    var megaClose = qs('lpTtsMegaClose');
    if (megaClose) megaClose.addEventListener('click', function () {
      var mega = qs('lpTtsMega');
      if (mega) mega.classList.add('hidden');
      _refreshTtsBarAutoHide(false);
    });

    // Voice picker
    var voiceSel = qs('lpTtsVoice');
    if (voiceSel) voiceSel.addEventListener('change', function () {
      var tts = window.booksTTS;
      if (!tts) return;
      var voiceId = voiceSel.value;
      _applyTtsSetting('setVoice', voiceId);
      _settings.ttsVoice = voiceId;
      _lsSet('Voice', voiceId);
    });

    // Voice preview
    var previewBtn = qs('lpTtsPreview');
    if (previewBtn) previewBtn.addEventListener('click', function () {
      var tts = window.booksTTS;
      if (!tts) return;
      var voiceId = qs('lpTtsVoice') ? qs('lpTtsVoice').value : '';
      if (!voiceId) return;
      _applyTtsSetting('setVoice', voiceId);
      _settings.ttsVoice = voiceId;
      _lsSet('Voice', voiceId);
      // Quick preview via engine probe (simplified - no separate engine instance)
    });

    // Preset selector
    var presetSel = qs('lpTtsPresetSel');
    if (presetSel) presetSel.addEventListener('change', function () {
      var tts = window.booksTTS;
      if (!tts) return;
      var pid = presetSel.value;
      if (pid) {
        tts.setPreset(pid);
        _settings.ttsPreset = pid;
        _settings.ttsRate = tts.getRate();
        try { _settings.ttsPitch = (typeof tts.getPitch === 'function') ? tts.getPitch() : _settings.ttsPitch; } catch {}
        _lsSet('Preset', pid);
        _lsSet('Rate', String(_settings.ttsRate));
        _lsSet('Pitch', String(_settings.ttsPitch));
      }
      syncSpeed();
    });

    // LP-FONT: card font family selector
    var fontSel = qs('lpTtsFont');
    if (fontSel) {
      fontSel.value = _settings.ttsFont || 'default';
      fontSel.addEventListener('change', function () {
        _settings.ttsFont = fontSel.value;
        _applyCardFont(fontSel.value);
        _lsSet('Font', fontSel.value);
      });
    }

    // Highlight style
    var hlStyleSel = qs('lpTtsHlStyle');
    if (hlStyleSel) hlStyleSel.addEventListener('change', function () {
      var tts = window.booksTTS;
      if (!tts || typeof tts.setHighlightStyle !== 'function') return;
      tts.setHighlightStyle(hlStyleSel.value);
      _settings.ttsHlStyle = hlStyleSel.value;
      _lsSet('HlStyle', hlStyleSel.value);
      var enlargeRow = qs('lpEnlargeRow');
      if (enlargeRow) enlargeRow.style.display = (hlStyleSel.value === 'enlarge') ? '' : 'none';
    });

    // Highlight color swatches
    var hlColors = qs('lpTtsHlColors');
    if (hlColors) hlColors.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.ttsColorSwatch');
      if (!btn || !btn.dataset.color) return;
      var tts = window.booksTTS;
      if (!tts || typeof tts.setHighlightColor !== 'function') return;
      tts.setHighlightColor(btn.dataset.color);
      _settings.ttsHlColor = btn.dataset.color;
      _lsSet('HlColor', btn.dataset.color);
      populateHlControls();
    });

    // Word tracking checkbox
    var wt = qs('lpTtsWordTracking');
    if (wt) wt.addEventListener('change', function () {
      var tts = window.booksTTS;
      if (!tts || typeof tts.setHighlightGranularity !== 'function') return;
      var val = wt.checked ? 'word' : 'sentence';
      tts.setHighlightGranularity(val);
      _settings.ttsHlGranularity = val;
      _lsSet('HlGran', val);
      populateHlControls();
    });

    // Word highlight style
    var wStyleSel = qs('lpTtsWordHlStyle');
    if (wStyleSel) wStyleSel.addEventListener('change', function () {
      var tts = window.booksTTS;
      if (!tts || typeof tts.setWordHighlightStyle !== 'function') return;
      tts.setWordHighlightStyle(wStyleSel.value);
      _settings.ttsWordHlStyle = wStyleSel.value;
      _lsSet('WordStyle', wStyleSel.value);
    });

    // Word highlight color swatches
    var whlColors = qs('lpTtsWordHlColors');
    if (whlColors) whlColors.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.ttsColorSwatch');
      if (!btn || !btn.dataset.color) return;
      var tts = window.booksTTS;
      if (!tts || typeof tts.setWordHighlightColor !== 'function') return;
      tts.setWordHighlightColor(btn.dataset.color);
      _settings.ttsWordHlColor = btn.dataset.color;
      _lsSet('WordColor', btn.dataset.color);
      populateHlControls();
    });

    // Enlarge scale slider
    var scaleSlider = qs('lpTtsEnlargeScale');
    if (scaleSlider) scaleSlider.addEventListener('input', function () {
      var val = parseFloat(scaleSlider.value) || 1.35;
      var tts = window.booksTTS;
      if (tts && typeof tts.setEnlargeScale === 'function') tts.setEnlargeScale(val);
      _settings.ttsEnlargeScale = val;
      _lsSet('Enlarge', String(val));
      var valEl = qs('lpTtsEnlargeVal');
      if (valEl) valEl.textContent = val.toFixed(2) + 'x';
    });

    // LISTEN_THEME: card size slider — scales both card width and text size
    var cardSizeSlider = qs('lpCardSize');
    var cardSizeVal = qs('lpCardSizeVal');
    var _savedCardW = 480;
    var _cardBaseW = 480;
    var _cardBaseFontRem = 1.15;
    try { _savedCardW = parseInt(localStorage.getItem('booksListenCardWidth'), 10) || 480; } catch {}
    var shell = document.getElementById('booksListenPlayerOverlay');
    function _applyCardSize(w) {
      if (!shell) return;
      shell.style.setProperty('--lp-card-width', w + 'px');
      var fontRem = (_cardBaseFontRem * w / _cardBaseW).toFixed(3);
      shell.style.setProperty('--lp-card-font', fontRem + 'rem');
    }
    _applyCardSize(_savedCardW);
    if (cardSizeSlider) {
      cardSizeSlider.value = _savedCardW;
      if (cardSizeVal) cardSizeVal.textContent = _savedCardW;
      cardSizeSlider.addEventListener('input', function () {
        var w = parseInt(cardSizeSlider.value, 10) || 480;
        _applyCardSize(w);
        if (cardSizeVal) cardSizeVal.textContent = w;
        try { localStorage.setItem('booksListenCardWidth', String(w)); } catch {}
      });
    }

    // OPT1: Sleep timer
    var sleepSel = qs('lpSleepTimer');
    if (sleepSel) sleepSel.addEventListener('change', function () {
      setSleepTimer(sleepSel.value);
    });

    // Read from selection
    var fromSel = qs('lpTtsFromSel');
    if (fromSel) fromSel.addEventListener('click', function () { ttsPlayFromSelection(); });

    // Diagnostics
    var diagBtn = qs('lpTtsDiagBtn');
    if (diagBtn) diagBtn.addEventListener('click', function () {
      var diag = qs('lpTtsDiag');
      if (!diag) return;
      var isOpen = !diag.classList.contains('hidden');
      diag.classList.toggle('hidden', isOpen);
      if (!isOpen) updateDiag();
    });
    var diagClose = qs('lpTtsDiagClose');
    if (diagClose) diagClose.addEventListener('click', function () {
      var diag = qs('lpTtsDiag');
      if (diag) diag.classList.add('hidden');
    });
    // FIX-TTS-B8 #21: copy diagnostics to clipboard
    var diagCopy = qs('lpTtsDiagCopy');
    if (diagCopy) diagCopy.addEventListener('click', function () {
      var body = qs('lpTtsDiagBody');
      if (!body) return;
      navigator.clipboard.writeText(body.textContent).then(function () {
        diagCopy.title = 'Copied!';
        setTimeout(function () { diagCopy.title = 'Copy diagnostics'; }, 1500);
      });
    });

    // QOL: auto rewind + sleep timer prefs
    try { _autoRewindEnabled = (localStorage.getItem('booksListenAutoRewind') === '1'); } catch {}
    var ar = qs('lpAutoRewind');
    if (ar) {
      ar.checked = !!_autoRewindEnabled;
      ar.addEventListener('change', function () {
        _autoRewindEnabled = !!ar.checked;
        try { localStorage.setItem('booksListenAutoRewind', _autoRewindEnabled ? '1' : '0'); } catch {}
      });
    }

    // TTS-QOL4: volume slider
    var volSlider = qs('lpVolume');
    if (volSlider) {
      var savedVol = 1;
    try { savedVol = parseFloat(_lsGet('Volume')) || 1; } catch {}
      _settings.ttsVolume = savedVol;
      volSlider.value = String(savedVol);
      volSlider.addEventListener('input', function () {
        var v = parseFloat(volSlider.value) || 1;
        _settings.ttsVolume = v;
        var tts = window.booksTTS;
        if (tts && typeof tts.setVolume === 'function') tts.setVolume(v);
        _lsSet('Volume', String(v));
      });
    }

    // QOL: seek bar
    var seek = qs('lpSeekBar');
    var prev = qs('lpSeekPreview');
    function _seekPreview(idx) {
      if (!prev) return;
      var t = '';
      try { if (window.booksTTS && typeof window.booksTTS.getSegmentText === 'function') t = window.booksTTS.getSegmentText(idx) || ''; } catch {}
      t = String(t || '').trim().replace(/\s+/g, ' ');
      if (t.length > 90) t = t.slice(0, 90) + '…';
      prev.textContent = t ? t : '';
    }
    if (seek) {
      seek.addEventListener('input', function () {
        var idx = parseInt(seek.value || '0', 10) || 0;
        _seekPreview(idx);
      });
      seek.addEventListener('change', function () {
        var idx = parseInt(seek.value || '0', 10) || 0;
        var tts = window.booksTTS;
        if (!tts || typeof tts.seekSegment !== 'function') return;
        var st = tts.getState ? tts.getState() : 'idle';
        var playing = (st === 'playing');
        try { tts.seekSegment(idx, playing); } catch {}
      });
    }


    // TOC
    var tocBtn = qs('lpTocBtn');
    if (tocBtn) tocBtn.addEventListener('click', function () { showTocPanel(!_tocPanelOpen); });
    var tocClose = qs('lpTocClose');
    if (tocClose) tocClose.addEventListener('click', function () { showTocPanel(false); });

    var bus = window.booksReaderBus;
    if (bus) {
      bus.on('toc:updated', function () { if (_open) renderTocPanel(); });
      bus.on('reader:relocated', function (detail) {
        if (!_open) return;
        var href = detail && detail.tocItem && detail.tocItem.href ? detail.tocItem.href : '';
        if (href) updateTocActive(href);
        if (_navigating) {
          _navigating = false;
          setTimeout(function () {
            if (!_open) return;
            var tts = window.booksTTS;
            if (tts) try { tts.play(); } catch {}
          }, 150);
        }
      });
    }

    // FIX-TTS-B8 #19: Arrow key navigation in TOC list
    var tocListEl = qs('lpTocList');
    if (tocListEl) {
      tocListEl.addEventListener('keydown', function (ev) {
        if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
        ev.preventDefault();
        var items = tocListEl.querySelectorAll('.lp-toc-item');
        if (!items.length) return;
        var cur = tocListEl.querySelector('.lp-toc-item:focus');
        var idx = -1;
        for (var ti = 0; ti < items.length; ti++) { if (items[ti] === cur) { idx = ti; break; } }
        var next = ev.key === 'ArrowDown' ? idx + 1 : idx - 1;
        if (next < 0) next = items.length - 1;
        if (next >= items.length) next = 0;
        items[next].focus();
      });
    }

    document.addEventListener('keydown', onPlayerKeyDown, { capture: true });
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  window.booksListenPlayer = {
    open: open,
    close: closePlayer,
    isOpen: function () { return _open; },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();
