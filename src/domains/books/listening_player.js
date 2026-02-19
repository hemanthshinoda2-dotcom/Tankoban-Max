// LISTEN-HUD: TTS Listening player — replica of pre-listening-mode TTS HUD bar
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
  var _ttsStarted = false;
  var _lastSavedBlockIdx = -1;
  var _saveTimer = null;
  var _tocPanelOpen = false;
  var _navigating = false;
  var _activeTocHref = '';

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

  // ── Persisted settings (stored per-session in the player, not per-book) ─────
  var _settings = {
    ttsVoice: '',
    ttsRate: 1.0,
    ttsPreset: '',
    ttsHlStyle: 'highlight',
    ttsHlColor: 'grey',
    ttsHlGranularity: 'sentence',
    ttsWordHlStyle: 'highlight',
    ttsWordHlColor: 'blue',
    ttsEnlargeScale: 1.35,
  };

  function qs(id) {
    try { return document.getElementById(id); } catch { return null; }
  }

  // ── Overlay visibility ──────────────────────────────────────────────────────
  function showOverlay(show) {
    var el = qs('booksListenPlayerOverlay');
    if (el) el.classList.toggle('hidden', !show);
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
    var card = qs('lpCardText');
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
    var idxEl = qs('lpBlockIdx');
    var cntEl = qs('lpBlockCount');
    var idx = (info.blockIdx >= 0) ? info.blockIdx + 1 : 0;
    var cnt = info.blockCount || 0;
    if (idxEl) idxEl.textContent = String(idx);
    if (cntEl) cntEl.textContent = String(cnt);

    syncSpeed();

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
          api.saveBooksTtsProgress(_book.id, entry).catch(function () {});
        }
      } catch {}
    } else {
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(function () {
        _saveTimer = null;
        try {
          var api = window.Tanko && window.Tanko.api;
          if (api && typeof api.saveBooksTtsProgress === 'function') {
            api.saveBooksTtsProgress(_book.id, entry).catch(function () {});
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
        btn.title = colors[j].charAt(0).toUpperCase() + colors[j].slice(1);
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
    var tts = window.booksTTS;
    if (!tts) return;
    var st = tts.getState();
    if (st === 'section_transition') return;
    if (st === 'idle') tts.play();
    else if (st === 'playing') tts.pause();
    else if (st === 'paused') tts.resume();
  }

  function ttsStop() {
    var tts = window.booksTTS;
    if (tts) tts.stop();
  }

  function ttsAdjustSpeed(delta) {
    var tts = window.booksTTS;
    if (!tts) return;
    var current = tts.getRate();
    var limits = (typeof tts.getRateLimits === 'function') ? tts.getRateLimits() : { min: 0.5, max: 3.0 };
    var next = Math.max(limits.min, Math.min(limits.max, Math.round((current + delta) * 10) / 10));
    tts.setRate(next);
    _settings.ttsRate = next;
    syncSpeed();
  }

  function ttsJump(deltaMs) {
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
    setTimeout(function () {
      if (!_navigating || !_open) return;
      _navigating = false;
      var tts2 = window.booksTTS;
      if (tts2) try { tts2.play(); } catch {}
    }, 5000);
  }

  // ── TTS wiring ──────────────────────────────────────────────────────────────
  function wireTts() {
    var tts = window.booksTTS;
    if (!tts) return;
    tts.onStateChange = function (status, info) {
      syncPlayPause(status);
      syncSpeed();
      syncEngine();
      if (info) updateCard(info);
      var diagEl = qs('lpTtsDiag');
      if (diagEl && !diagEl.classList.contains('hidden')) updateDiag();
    };
    tts.onProgress = function (info) {
      updateCard(info);
      var diagEl = qs('lpTtsDiag');
      if (diagEl && !diagEl.classList.contains('hidden')) updateDiag();
    };
    tts.onDocumentEnd = function () {};
  }

  function unwireTts() {
    var tts = window.booksTTS;
    if (!tts) return;
    tts.onStateChange = null;
    tts.onProgress = null;
  }

  function _buildTtsInitOpts() {
    var RS = window.booksReaderState;
    var fmt = (_book && _book.format) ? String(_book.format).toLowerCase() : 'epub';
    return {
      format: fmt,
      getHost: function () { return RS && RS.state ? RS.state.host : null; },
      getViewEngine: function () { return RS && RS.state ? RS.state.engine : null; },
      onNeedAdvance: function () {
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
      if (_settings.ttsHlStyle && typeof tts.setHighlightStyle === 'function') tts.setHighlightStyle(_settings.ttsHlStyle);
      if (_settings.ttsHlColor && typeof tts.setHighlightColor === 'function') tts.setHighlightColor(_settings.ttsHlColor);
      if (_settings.ttsHlGranularity && typeof tts.setHighlightGranularity === 'function') tts.setHighlightGranularity(_settings.ttsHlGranularity);
      if (_settings.ttsWordHlStyle && typeof tts.setWordHighlightStyle === 'function') tts.setWordHighlightStyle(_settings.ttsWordHlStyle);
      if (_settings.ttsWordHlColor && typeof tts.setWordHighlightColor === 'function') tts.setWordHighlightColor(_settings.ttsWordHlColor);
      if (_settings.ttsEnlargeScale && typeof tts.setEnlargeScale === 'function') tts.setEnlargeScale(_settings.ttsEnlargeScale);

      populateVoices();
      populateHlControls();
      syncSpeed();
      syncEngine();
      var presetSel = qs('lpTtsPresetSel');
      if (presetSel && _settings.ttsPreset) presetSel.value = _settings.ttsPreset;

      try {
        var snap = tts.getSnippet ? tts.getSnippet() : null;
        if (snap) updateCard(snap);
        syncPlayPause(tts.getState ? tts.getState() : 'idle');
      } catch {}

      // Resume from saved progress
      var resumeIdx = 0;
      var api = window.Tanko && window.Tanko.api;
      var bookId = _book && _book.id;
      if (api && typeof api.getBooksTtsProgress === 'function' && bookId) {
        api.getBooksTtsProgress(bookId).then(function (entry) {
          if (!_open || !_ttsStarted) return;
          if (entry && entry.blockIdx > 0) resumeIdx = entry.blockIdx;
          try { tts.play(resumeIdx); } catch (e) {
            try { console.error('[listen-player] tts.play() failed:', e); } catch {}
          }
        }).catch(function () {
          if (!_open || !_ttsStarted) return;
          try { tts.play(0); } catch {}
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
      showOverlay(false);
      _open = false;
      _ttsStarted = false;
    }
    _book = book;
    _open = true;
    _ttsStarted = false;
    _lastSavedBlockIdx = -1;
    _tocPanelOpen = false;
    _navigating = false;
    _activeTocHref = '';
    var titleEl = qs('lpBookTitle');
    if (titleEl) titleEl.textContent = book.title || '';
    var card = qs('lpCardText');
    if (card) card.innerHTML = '';
    var idxEl = qs('lpBlockIdx');
    var cntEl = qs('lpBlockCount');
    if (idxEl) idxEl.textContent = '0';
    if (cntEl) cntEl.textContent = '0';
    syncPlayPause('idle');
    // Show TTS bar immediately
    var bar = qs('lpTtsBar');
    if (bar) bar.classList.remove('hidden');

    var booksApp = window.booksApp;
    if (!booksApp || typeof booksApp.openBookInReader !== 'function') return;
    booksApp.openBookInReader(book).catch(function (e) {
      try { console.error('[listen-player] openBookInReader failed:', e); } catch {}
      _open = false;
    });
  }

  function closePlayer(opts) {
    if (!_open) return;
    _open = false;
    _ttsStarted = false;
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    try {
      var tts2 = window.booksTTS;
      var snap = tts2 && tts2.getSnippet ? tts2.getSnippet() : null;
      saveProgress(snap, true);
    } catch {}
    _lastSavedBlockIdx = -1;
    _tocPanelOpen = false;
    _navigating = false;
    showTocPanel(false);
    var tts = window.booksTTS;
    if (tts) { try { tts.destroy(); } catch {} }
    unwireTts();
    showOverlay(false);
    // Hide mega/diag panels
    var mega = qs('lpTtsMega');
    if (mega) mega.classList.add('hidden');
    var diag = qs('lpTtsDiag');
    if (diag) diag.classList.add('hidden');

    var skipRestore = opts && opts.skipModeRestore;
    var shell = window.booksListeningShell;
    var booksApp = window.booksApp;
    if (booksApp && typeof booksApp.back === 'function') {
      booksApp.back().then(function () {
        if (!skipRestore && shell && typeof shell.setMode === 'function') shell.setMode(shell.MODE_LISTEN);
      }).catch(function () {
        if (!skipRestore && shell && typeof shell.setMode === 'function') shell.setMode(shell.MODE_LISTEN);
      });
    } else if (!skipRestore && shell && typeof shell.setMode === 'function') {
      shell.setMode(shell.MODE_LISTEN);
    }
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
        if (mega && !mega.classList.contains('hidden')) { mega.classList.add('hidden'); break; }
        var diag = qs('lpTtsDiag');
        if (diag && !diag.classList.contains('hidden')) { diag.classList.add('hidden'); break; }
        closePlayer();
        break;
    }
  }

  // ── Bind DOM events ─────────────────────────────────────────────────────────
  function bind() {
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
      showOverlay(false);
      _open = false;
      _ttsStarted = false;
      var ttsCleanup = window.booksTTS;
      if (ttsCleanup) { try { ttsCleanup.destroy(); } catch {} }
      unwireTts();
      var shell = window.booksListeningShell;
      if (shell && typeof shell.setMode === 'function') shell.setMode(shell.MODE_LISTEN);
    });

    // Back button
    var backBtn = qs('lpBackBtn');
    if (backBtn) backBtn.addEventListener('click', closePlayer);

    // ── TTS bar buttons ──
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

    // ── Mega settings panel ──
    var settingsBtn = qs('lpTtsSettingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', function () {
      var mega = qs('lpTtsMega');
      if (!mega) return;
      mega.classList.toggle('hidden');
      var diag = qs('lpTtsDiag');
      if (diag && !mega.classList.contains('hidden')) diag.classList.add('hidden');
    });
    var megaClose = qs('lpTtsMegaClose');
    if (megaClose) megaClose.addEventListener('click', function () {
      var mega = qs('lpTtsMega');
      if (mega) mega.classList.add('hidden');
    });

    // Voice picker
    var voiceSel = qs('lpTtsVoice');
    if (voiceSel) voiceSel.addEventListener('change', function () {
      var tts = window.booksTTS;
      if (!tts) return;
      var voiceId = voiceSel.value;
      tts.setVoice(voiceId);
      _settings.ttsVoice = voiceId;
    });

    // Voice preview
    var previewBtn = qs('lpTtsPreview');
    if (previewBtn) previewBtn.addEventListener('click', function () {
      var tts = window.booksTTS;
      if (!tts) return;
      var voiceId = qs('lpTtsVoice') ? qs('lpTtsVoice').value : '';
      if (!voiceId) return;
      tts.setVoice(voiceId);
      _settings.ttsVoice = voiceId;
      // Quick preview via engine probe (simplified — no separate engine instance)
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
      }
      syncSpeed();
    });

    // Highlight style
    var hlStyleSel = qs('lpTtsHlStyle');
    if (hlStyleSel) hlStyleSel.addEventListener('change', function () {
      var tts = window.booksTTS;
      if (!tts || typeof tts.setHighlightStyle !== 'function') return;
      tts.setHighlightStyle(hlStyleSel.value);
      _settings.ttsHlStyle = hlStyleSel.value;
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
      populateHlControls();
    });

    // Word highlight style
    var wStyleSel = qs('lpTtsWordHlStyle');
    if (wStyleSel) wStyleSel.addEventListener('change', function () {
      var tts = window.booksTTS;
      if (!tts || typeof tts.setWordHighlightStyle !== 'function') return;
      tts.setWordHighlightStyle(wStyleSel.value);
      _settings.ttsWordHlStyle = wStyleSel.value;
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
      populateHlControls();
    });

    // Enlarge scale slider
    var scaleSlider = qs('lpTtsEnlargeScale');
    if (scaleSlider) scaleSlider.addEventListener('input', function () {
      var val = parseFloat(scaleSlider.value) || 1.35;
      var tts = window.booksTTS;
      if (tts && typeof tts.setEnlargeScale === 'function') tts.setEnlargeScale(val);
      _settings.ttsEnlargeScale = val;
      var valEl = qs('lpTtsEnlargeVal');
      if (valEl) valEl.textContent = val.toFixed(2) + 'x';
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
