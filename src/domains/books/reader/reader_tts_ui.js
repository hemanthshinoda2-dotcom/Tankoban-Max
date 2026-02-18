// BUILD_OVERHAUL: TTS UI controls — voices, presets, mini bar, sleep timer, diagnostics
(function () {
  'use strict';

  var RS = window.booksReaderState;
  var bus = window.booksReaderBus;

  // SVG icons for play/pause (monochrome, matches other TTS bar icons)
  var SVG_PLAY = '<svg viewBox="0 0 16 18" xmlns="http://www.w3.org/2000/svg"><path d="M14.3195 7.73218L3.06328 0.847019C2.82722 0.703112 2.55721 0.624413 2.2808 0.618957C2.00439 0.6135 1.73148 0.681481 1.48992 0.81596C1.24837 0.950439 1.04682 1.1466 0.905848 1.38442C0.764877 1.62225 0.689531 1.89322 0.6875 2.16968V15.94C0.689531 16.2164 0.764877 16.4874 0.905848 16.7252C1.04682 16.9631 1.24837 17.1592 1.48992 17.2937C1.73148 17.4282 2.00439 17.4962 2.2808 17.4907C2.55721 17.4853 2.82722 17.4066 3.06328 17.2626L14.3195 10.3775C14.5465 10.2393 14.7341 10.0451 14.8643 9.81344C14.9945 9.58179 15.0628 9.32055 15.0628 9.05483C15.0628 8.78912 14.9945 8.52787 14.8643 8.29623C14.7341 8.06458 14.5465 7.87034 14.3195 7.73218ZM2.5625 15.3712V2.73843L12.8875 9.05483L2.5625 15.3712Z" fill="currentColor"/></svg>';
  var SVG_PAUSE = '<svg viewBox="0 0 16 18" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="0.87" width="4" height="16.37" rx="0.75" fill="currentColor"/><rect x="10" y="0.87" width="4" height="16.37" rx="0.75" fill="currentColor"/></svg>';
  var SVG_SPEAKER = '<svg viewBox="0 0 18 16" xmlns="http://www.w3.org/2000/svg"><path d="M9.38 0.29C9.19 0.1 8.93 0 8.67 0c-0.13 0-0.26 0.03-0.38 0.08L3.05 2.67H1C0.45 2.67 0 3.11 0 3.67v8.67c0 0.55 0.45 1 1 1h2.05l5.24 2.58c0.12 0.05 0.25 0.08 0.38 0.08 0.26 0 0.52-0.1 0.71-0.29 0.19-0.19 0.29-0.44 0.29-0.71V1c0-0.27-0.1-0.52-0.29-0.71zM7.67 13.46L3.67 11.49V4.51l4-1.97v10.92zM13.54 3.46c-0.39-0.39-1.02-0.39-1.41 0-0.39 0.39-0.39 1.02 0 1.41C13 5.75 13.5 7.12 13.5 8.5s-0.5 2.75-1.37 3.63c-0.39 0.39-0.39 1.02 0 1.41 0.2 0.2 0.45 0.29 0.71 0.29s0.51-0.1 0.71-0.29C14.82 12.27 15.5 10.44 15.5 8.5S14.82 4.73 13.54 3.46z" fill="currentColor"/></svg>';

  function ttsAllowed() {
    return RS.isEpubOrTxtOpen();
  }

  function ttsRuntimeReady() {
    var tts = window.booksTTS;
    return !!(tts && typeof tts.isAvailable === 'function' && tts.isAvailable());
  }

  function setTtsControlsEnabled(enabled) {
    var els = RS.ensureEls();
    var on = !!enabled;
    var ids = [
      'ttsLaunch', 'ttsPlayPause', 'ttsStop', 'ttsSlower', 'ttsFaster', 'ttsVoice', 'ttsPreview', 'ttsPresetSel',
      'ttsRewind', 'ttsForward', 'ttsDiagBtn', 'ttsBack10', 'ttsFwd10', 'ttsFromSel', 'ttsHlStyle',
    ];
    for (var i = 0; i < ids.length; i++) {
      var el = els[ids[i]];
      if (el && 'disabled' in el) el.disabled = !on;
    }
  }

  // ── Init TTS ─────────────────────────────────────────────────

  async function initTTS() {
    var tts = window.booksTTS;
    if (!tts) return;
    if (!ttsAllowed()) {
      destroyTTS();
      return;
    }
    var els = RS.ensureEls();
    var state = RS.state;

    await tts.init({
      getHost: function () { return els.host; },
      getViewEngine: function () { return state.engine || null; },
      format: state.book ? state.book.format : '',
      onNeedAdvance: function () {
        if (!state.engine) return Promise.resolve(false);
        // TTS_REWRITE: wait for actual relocate event instead of blind 400ms delay
        return new Promise(function (resolve) {
          var eng = state.engine;
          var foliateView = (eng && typeof eng.getFoliateView === 'function') ? eng.getFoliateView() : null;
          if (!foliateView || typeof state.engine.nextSection !== 'function') {
            // Fallback for non-foliate engines
            if (typeof state.engine.next === 'function') {
              state.engine.next().then(function () {
                RS.saveProgress();
                setTimeout(function () { resolve(true); }, 400);
              }).catch(function () { resolve(false); });
            } else {
              resolve(false);
            }
            return;
          }
          var timeout = setTimeout(function () {
            try { foliateView.removeEventListener('relocate', handler); } catch {}
            resolve(false);
          }, 5000);
          var handler = function () {
            clearTimeout(timeout);
            try { foliateView.removeEventListener('relocate', handler); } catch {}
            RS.saveProgress();
            // FIX-TTS05: Re-init foliate TTS + regenerate queue for new section
            var tts = window.booksTTS;
            if (tts && typeof tts._reinitFoliateTTS === 'function') {
              tts._reinitFoliateTTS().then(function () {
                if (tts && typeof tts._regenerateQueue === 'function') {
                  tts._regenerateQueue();
                }
                resolve(true);
              }).catch(function () { resolve(false); });
            } else {
              resolve(true);
            }
          };
          foliateView.addEventListener('relocate', handler, { once: true });
          state.engine.nextSection();
        });
      },
    });

    if (!tts.isAvailable()) {
      RS.setStatus('TTS unavailable for this session');
      syncTtsUI(tts.getState(), tts.getSnippet());
      return;
    }

    if (state.settings.ttsVoice) {
      try {
        var currentEngine = String(tts.getEngineId ? tts.getEngineId() : '');
        var voices = Array.isArray(tts.getVoices ? tts.getVoices() : []) ? tts.getVoices() : [];
        var canApply = voices.some(function (v) {
          if (!v) return false;
          var id = String(v.voiceURI || '');
          var eng = String(v.engine || currentEngine);
          return id === String(state.settings.ttsVoice) && eng === currentEngine;
        });
        if (canApply) tts.setVoice(state.settings.ttsVoice);
      } catch (e) {}
    }

    // FIX_RATE_INIT: apply preset FIRST (it sets its own rate), then override with saved rate
    if (state.settings.ttsPreset) {
      tts.setPreset(state.settings.ttsPreset);
      if (els.ttsPresetSel) els.ttsPresetSel.value = state.settings.ttsPreset;
    }
    tts.setRate(state.settings.ttsRate || 1.0);

    // GAP5: restore highlight style/color
    if (state.settings.ttsHlStyle && typeof tts.setHighlightStyle === 'function') {
      tts.setHighlightStyle(state.settings.ttsHlStyle);
    }
    if (state.settings.ttsHlColor && typeof tts.setHighlightColor === 'function') {
      tts.setHighlightColor(state.settings.ttsHlColor);
    }
    // FIX-TTS05: restore granularity + word highlight settings
    if (state.settings.ttsHlGranularity && typeof tts.setHighlightGranularity === 'function') {
      tts.setHighlightGranularity(state.settings.ttsHlGranularity);
    }
    if (state.settings.ttsWordHlStyle && typeof tts.setWordHighlightStyle === 'function') {
      tts.setWordHighlightStyle(state.settings.ttsWordHlStyle);
    }
    if (state.settings.ttsWordHlColor && typeof tts.setWordHighlightColor === 'function') {
      tts.setWordHighlightColor(state.settings.ttsWordHlColor);
    }
    populateHlControls();

    tts.onStateChange = function (status, info) {
      syncTtsUI(status, info);
    };
    // FIX-TTS05: lifecycle events for section/document transitions
    tts.onDocumentEnd = function () { RS.showToast('End of book'); };

    tts.onProgress = function (info) {
      updateTtsSnippet(info);
      syncTtsUI(tts.getState(), info);
      var diagEl = RS.ensureEls().ttsDiag;
      if (diagEl && !diagEl.classList.contains('hidden')) updateTtsDiag();
    };

    populateTtsVoices();
    setTimeout(function () { populateTtsVoices(); }, 250);
    syncTtsUI(tts.getState(), tts.getSnippet());
  }

  // ── Sync TTS UI ──────────────────────────────────────────────

  function syncTtsUI(status, infoMaybe) {
    var els = RS.ensureEls();
    var state = RS.state;
    // FIX-TTS05: treat section_transition as playing for UI purposes
    var isActive = status === 'playing' || status === 'paused' || status === 'section_transition';
    var tts = window.booksTTS;
    var info = infoMaybe || (tts && typeof tts.getSnippet === 'function' ? tts.getSnippet() : null);
    var usableMap = (tts && typeof tts.getEngineUsableMap === 'function') ? tts.getEngineUsableMap() : {};

    if (!ttsAllowed()) {
      if (els.ttsBar) els.ttsBar.classList.add('hidden');
      if (els.ttsMega) els.ttsMega.classList.add('hidden');
      setTtsControlsEnabled(false);
      if (els.ttsLaunch) {
        els.ttsLaunch.innerHTML = SVG_SPEAKER;
        els.ttsLaunch.title = 'Read aloud (T)';
        els.ttsLaunch.classList.remove('ttsActive');
      }
      showReturnToTts();
      return;
    }

    setTtsControlsEnabled(!!ttsRuntimeReady());

    if (els.ttsBar) els.ttsBar.classList.toggle('hidden', !isActive);
    // Close mega panel when TTS stops
    if (!isActive && els.ttsMega) els.ttsMega.classList.add('hidden');
    // FIX-TTS05: section_transition shows as playing (pause icon)
    var showPause = (status === 'playing' || status === 'section_transition');
    if (els.playBtn) {
      els.playBtn.classList.toggle('ttsActive', isActive);
      els.playBtn.innerHTML = showPause ? SVG_PAUSE : SVG_PLAY;
      els.playBtn.title = showPause ? 'Pause (T)' : 'Read aloud (T)';
    }

    if (els.ttsPlayPause) {
      els.ttsPlayPause.innerHTML = showPause ? SVG_PAUSE : SVG_PLAY;
      els.ttsPlayPause.title = showPause ? 'Pause' : 'Play';
    }

    if (els.ttsSpeed) {
      var rate = (tts && tts.getRate && tts.getRate()) || 1.0;
      els.ttsSpeed.textContent = rate.toFixed(1) + '\u00d7';
    }

    // FIX-TTS05: Engine name — Edge only, no fallback state
    if (els.ttsEngine) {
      var eid = tts ? tts.getEngineId() : '';
      var label = eid === 'edge' ? 'Edge Neural' : '';
      els.ttsEngine.textContent = label;
      els.ttsEngine.title = eid ? ('TTS engine: ' + eid) : '';
      els.ttsEngine.classList.remove('ttsFallback');
    }

    // Diagnostics refresh
    if (info && info.lastDiag && info.lastDiag.code && String(info.lastDiag.code).indexOf('fail') >= 0) {
      if (els.ttsDiag && !els.ttsDiag.classList.contains('hidden')) updateTtsDiag();
    }
    if (els.ttsDiag && !els.ttsDiag.classList.contains('hidden')) {
      updateTtsDiag();
    }

    // TTS launch button (toolbar)
    if (els.ttsLaunch) {
      if (status === 'playing' || status === 'section_transition') {
        els.ttsLaunch.innerHTML = SVG_PAUSE;
        els.ttsLaunch.title = 'Pause TTS (T)';
        els.ttsLaunch.classList.add('ttsActive');
      } else if (status === 'paused') {
        els.ttsLaunch.innerHTML = SVG_PLAY;
        els.ttsLaunch.title = 'Resume TTS (T)';
        els.ttsLaunch.classList.add('ttsActive');
      } else {
        els.ttsLaunch.innerHTML = SVG_SPEAKER;
        els.ttsLaunch.title = 'Read aloud (T)';
        els.ttsLaunch.classList.remove('ttsActive');
      }
    }

    // Stash TTS location for return-to feature
    if (status === 'playing' && state.engine && typeof state.engine.getLocator === 'function') {
      state.engine.getLocator().then(function (loc) { if (loc) state.ttsLastLocation = loc; }).catch(function () {});
    }
    showReturnToTts();
    updateMediaSession(status, info); // GAP1
    bus.emit('reader:tts-state', status);
  }

  // ── Populate voices ──────────────────────────────────────────

  function populateTtsVoices() {
    var els = RS.ensureEls();
    if (!els.ttsVoice) return;
    var tts = window.booksTTS;
    if (!tts) return;
    var state = RS.state;

    var voices = tts.getVoices();
    // Only show English voices
    var enVoices = voices.filter(function (v) { return /^en[-_]/i.test(v.lang || ''); });
    els.ttsVoice.innerHTML = '';

    if (!enVoices.length) {
      var opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No English voices available \u2014 check TTS diagnostics';
      opt.disabled = true;
      els.ttsVoice.appendChild(opt);
      return;
    }

    var enGroup = document.createElement('optgroup');
    enGroup.label = 'English (' + enVoices.length + ')';
    for (var i = 0; i < enVoices.length; i++) {
      var v = enVoices[i];
      var o = document.createElement('option');
      o.value = v.voiceURI || v.name || '';
      var dn = (v.name || v.voiceURI || '').replace(/Microsoft Server Speech Text to Speech Voice \(/, '').replace(/\)$/, '');
      o.textContent = dn + (v.engine === 'edge' ? ' \u2605' : '');
      enGroup.appendChild(o);
    }
    els.ttsVoice.appendChild(enGroup);

    var saved = state.settings.ttsVoice;
    if (saved) els.ttsVoice.value = saved;

  }

  // ── TTS actions ──────────────────────────────────────────────

  async function ttsToggle() {
    // BUILD_TTS_FIX4: give clear feedback when TTS isn't available
    if (!ttsAllowed()) {
      if (RS.isPdfOpen()) RS.showToast('TTS is not available for PDF files');
      else RS.showToast('TTS is not available for this format');
      return;
    }
    var tts = window.booksTTS;
    if (!tts || !ttsRuntimeReady()) {
      // FIX-TTS06: auto-retry — destroy stale engine, reset main-process WS, and re-probe
      if (tts) tts.destroy();
      RS.showToast('Retrying TTS...');
      try {
        // FIX-TTS06: Reset the main-process Edge TTS WebSocket before re-probing.
        // The msedge-tts instance may have a dead WS from a previous error.
        var ttsApi = window.Tanko && window.Tanko.api && window.Tanko.api.booksTtsEdge;
        if (ttsApi && typeof ttsApi.resetInstance === 'function') {
          await ttsApi.resetInstance().catch(function () {});
        }
        await initTTS();
        tts = window.booksTTS;
        if (tts && ttsRuntimeReady()) {
          tts.play();
          return;
        }
      } catch {}
      setTtsControlsEnabled(false);
      RS.showToast('TTS is unavailable right now');
      return;
    }
    var st = tts.getState();
    if (st === 'section_transition') return; // FIX-TTS05: no toggle during transition
    if (st === 'idle') tts.play();
    else if (st === 'playing') tts.pause();
    else if (st === 'paused') tts.resume();
  }

  function ttsStop() {
    var tts = window.booksTTS;
    if (tts) tts.stop();
  }

  function ttsAdjustSpeed(delta) {
    if (!ttsAllowed()) return;
    var tts = window.booksTTS;
    if (!tts) return;
    var state = RS.state;
    var current = tts.getRate();
    // BUILD_TTS_FIX1: use core rate limits for consistency
    var limits = (typeof tts.getRateLimits === 'function') ? tts.getRateLimits() : { min: 0.5, max: 3.0 };
    var next = Math.max(limits.min, Math.min(limits.max, Math.round((current + delta) * 10) / 10));
    tts.setRate(next);
    state.settings.ttsRate = next;
    RS.persistSettings().catch(function () {});
    syncTtsUI(tts.getState());
  }

  function ttsStepSegment(delta) {
    if (!ttsAllowed()) return;
    var tts = window.booksTTS;
    if (!tts) return;
    tts.stepSegment(delta);
  }

  function ttsApplyPreset(presetId) {
    if (!ttsAllowed()) return;
    var tts = window.booksTTS;
    if (!tts) return;
    var state = RS.state;
    if (presetId) {
      tts.setPreset(presetId);
      state.settings.ttsPreset = presetId;
      state.settings.ttsRate = tts.getRate();
    }
    RS.persistSettings().catch(function () {});
    syncTtsUI(tts.getState());
  }

  function cycleVoice(delta) {
    if (!ttsAllowed()) return;
    var tts = window.booksTTS;
    if (!tts) return;
    var state = RS.state;
    var voices = tts.getVoices();
    var enVoices = voices.filter(function (v) { return /^en[-_]/i.test(v.lang || ''); });
    if (!enVoices.length) { RS.showToast('No English voices available'); return; }
    var curId = state.settings.ttsVoice || '';
    var idx = -1;
    for (var i = 0; i < enVoices.length; i++) {
      if ((enVoices[i].voiceURI || '') === curId) { idx = i; break; }
    }
    idx = (idx + delta + enVoices.length) % enVoices.length;
    var next = enVoices[idx];
    tts.setVoice(next.voiceURI);
    state.settings.ttsVoice = next.voiceURI;
    RS.persistSettings().catch(function () {});
    populateTtsVoices();
    syncTtsUI(tts.getState());
    var displayName = (next.name || next.voiceURI || '').replace(/Microsoft Server Speech Text to Speech Voice \(/, '').replace(/\)$/, '');
    RS.showToast(displayName + ' (' + (next.engine === 'edge' ? 'Edge Neural' : 'System') + ')');
  }

  // ── Preview voice ────────────────────────────────────────────

  // BUILD_TTS_FIX8: save/restore playback state around preview
  async function ttsPreviewVoice() {
    if (!ttsAllowed()) return;
    var tts = window.booksTTS;
    if (!tts) return;
    var els = RS.ensureEls();
    var state = RS.state;
    var voiceId = els.ttsVoice ? els.ttsVoice.value : '';
    if (!voiceId) return;

    var wasPlaying = tts.getState() === 'playing';
    if (wasPlaying) tts.pause();
    tts.setVoice(voiceId);

    var voices = tts.getVoices();
    var voice = null;
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].voiceURI === voiceId) { voice = voices[i]; break; }
    }
    var previewText = 'The quick brown fox jumps over the lazy dog.';

    var engines = window.booksTTSEngines || {};
    var eng = voice && voice.engine && engines[voice.engine] ? engines[voice.engine].create() : null;
    var canPreview = false;
    if (eng) {
      if (typeof eng.probe === 'function') {
        try { canPreview = !!(await eng.probe({ text: previewText, voice: voiceId })); } catch (e) { canPreview = false; }
      } else {
        try { canPreview = !!(eng.isAvailable && eng.isAvailable()); } catch (e) { canPreview = false; }
      }
    }
    if (eng && canPreview) {
      eng.setVoice(voiceId);
      eng.setRate(tts.getRate());
      eng.onEnd = function () {
        try { eng.cancel(); } catch (e) {}
        // Restore previous playback state
        if (wasPlaying && tts.getState() === 'paused') tts.resume();
      };
      setTimeout(function () {
        try { eng.cancel(); } catch (e) {}
        if (wasPlaying && tts.getState() === 'paused') tts.resume();
      }, 3500);
      eng.speak(previewText);
    } else {
      RS.setStatus('Preview unavailable for selected voice');
      // Restore if we paused
      if (wasPlaying && tts.getState() === 'paused') tts.resume();
    }

    state.settings.ttsVoice = voiceId;
    RS.persistSettings().catch(function () {});
    syncTtsUI(tts.getState());
  }

  function destroyTTS() {
    var tts = window.booksTTS;
    if (tts) tts.destroy();
    var els = RS.ensureEls();
    // FIX_AUDIT: keep all TTS entry points in a consistent disabled state after teardown.
    setTtsControlsEnabled(false);
    if (els.ttsBar) els.ttsBar.classList.add('hidden');
    if (els.ttsMega) els.ttsMega.classList.add('hidden');
    if (els.playBtn) els.playBtn.classList.remove('ttsActive');
    if (els.ttsLaunch) {
      els.ttsLaunch.classList.remove('ttsActive');
      els.ttsLaunch.innerHTML = SVG_SPEAKER;
    }
    if (els.ttsDiag) els.ttsDiag.classList.add('hidden');
    clearMediaSession(); // GAP1
  }

  // ── Snippet update (bar snippet removed, kept for media session) ──

  function updateTtsSnippet(info) {
    // Snippet display removed from TTS bar — info still used by media session
  }

  // ── Diagnostics ──────────────────────────────────────────────

  function updateTtsDiag() {
    var els = RS.ensureEls();
    if (!els.ttsDiagBody) return;
    var tts = window.booksTTS;
    var state = RS.state;
    if (!tts) { els.ttsDiagBody.textContent = 'TTS not initialized'; return; }

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
      'Voice: ' + (state.settings.ttsVoice || '(default)'),
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
    els.ttsDiagBody.textContent = lines.join('\n');
  }

  function toggleTtsMega() {
    var els = RS.ensureEls();
    if (!els.ttsMega) return;
    els.ttsMega.classList.toggle('hidden');
    // Close diag panel when mega opens
    if (els.ttsDiag && !els.ttsMega.classList.contains('hidden')) {
      els.ttsDiag.classList.add('hidden');
    }
  }

  function toggleTtsDiag() {
    var els = RS.ensureEls();
    if (!els.ttsDiag) return;
    var isOpen = !els.ttsDiag.classList.contains('hidden');
    els.ttsDiag.classList.toggle('hidden', isOpen);
    if (!isOpen) updateTtsDiag();
  }

  // ── Return to TTS ────────────────────────────────────────────

  function showReturnToTts() {
    var btn = document.getElementById('booksReaderReturnTts');
    if (!btn) return;
    if (!ttsAllowed()) {
      btn.classList.add('hidden');
      return;
    }
    var state = RS.state;
    var tts = window.booksTTS;
    var st = tts ? tts.getState() : 'idle';
    var isActive = (st === 'playing' || st === 'paused' || st === 'section_transition');
    btn.classList.toggle('hidden', !isActive || !state.ttsLastLocation);
  }

  async function returnToTtsLocation() {
    var state = RS.state;
    if (!state.ttsLastLocation || !state.engine) return;
    try {
      await state.engine.goTo(state.ttsLastLocation);
      state.ttsLastLocation = null;
      showReturnToTts();
    } catch (e) {}
  }

  // ── Read from selection ──────────────────────────────────
  // BUILD_TTS_SEL: start TTS from user's text selection

  function ttsPlayFromSelection() {
    if (!ttsAllowed()) return;
    var tts = window.booksTTS;
    if (!tts) return;
    var state = RS.state;
    var selectedText = '';

    // Get selected text from the engine
    if (state.engine && typeof state.engine.getSelectedText === 'function') {
      var sel = state.engine.getSelectedText();
      if (sel && typeof sel === 'object') selectedText = String(sel.text || '');
      else selectedText = String(sel || '');
    }

    if (!selectedText.trim()) {
      RS.showToast('Select text first, then use "Read from selection"');
      return;
    }

    var ok = tts.playFromSelection(selectedText);
    if (ok) {
      RS.showToast('Reading from selection');
    } else {
      RS.showToast('Could not find selection in text');
    }
  }

  // ── Time-based jump ───────────────────────────────────────
  // BUILD_TTS_JUMP: -10s / +10s approximate transport

  function ttsJump(deltaMs) {
    if (!ttsAllowed()) return;
    var tts = window.booksTTS;
    if (!tts) return;
    tts.jumpApproxMs(deltaMs);
  }

  // ── GAP5: Highlight style/color controls ─────────────────────

  function populateHlControls() {
    var els = RS.ensureEls();
    var tts = window.booksTTS;
    if (!tts) return;

    // Populate style selector
    if (els.ttsHlStyle) {
      var styles = typeof tts.getHighlightStyles === 'function' ? tts.getHighlightStyles() : [];
      if (els.ttsHlStyle.options.length === 0) {
        var labels = { highlight: 'Highlight', underline: 'Underline', squiggly: 'Squiggly', strikethrough: 'Strikethrough', enlarge: 'Enlarge' };
        for (var i = 0; i < styles.length; i++) {
          var o = document.createElement('option');
          o.value = styles[i];
          o.textContent = labels[styles[i]] || styles[i];
          els.ttsHlStyle.appendChild(o);
        }
      }
      var curStyle = typeof tts.getHighlightStyle === 'function' ? tts.getHighlightStyle() : 'highlight';
      els.ttsHlStyle.value = curStyle;
    }

    // Populate color buttons
    if (els.ttsHlColors) {
      var colors = typeof tts.getHighlightColors === 'function' ? tts.getHighlightColors() : [];
      var curColor = typeof tts.getHighlightColor === 'function' ? tts.getHighlightColor() : 'blue';
      if (!els.ttsHlColors.children.length) {
        var swatches = { grey: '#9a9aa8', blue: '#5a96ff', yellow: '#e6c800', green: '#50b464', pink: '#ff6e96', orange: '#ffa032' };
        for (var j = 0; j < colors.length; j++) {
          var btn = document.createElement('button');
          btn.className = 'ttsColorSwatch';
          btn.dataset.color = colors[j];
          btn.style.background = swatches[colors[j]] || '#888';
          btn.title = colors[j].charAt(0).toUpperCase() + colors[j].slice(1);
          els.ttsHlColors.appendChild(btn);
        }
      }
      // Mark active
      var btns = els.ttsHlColors.querySelectorAll('.ttsColorSwatch');
      for (var k = 0; k < btns.length; k++) {
        btns[k].classList.toggle('active', btns[k].dataset.color === curColor);
      }
    }

    // FIX-TTS05: word tracking checkbox
    if (els.ttsWordTracking) {
      var gran = typeof tts.getHighlightGranularity === 'function' ? tts.getHighlightGranularity() : 'sentence';
      els.ttsWordTracking.checked = (gran === 'word');
    }

    // FIX-TTS05: word highlight style selector
    var wordHlRow = document.getElementById('booksReaderWordHlRow');
    var wordGran = typeof tts.getHighlightGranularity === 'function' ? tts.getHighlightGranularity() : 'sentence';
    if (wordHlRow) wordHlRow.style.display = (wordGran === 'word') ? '' : 'none';

    if (els.ttsWordHlStyle) {
      var wStyles = typeof tts.getHighlightStyles === 'function' ? tts.getHighlightStyles() : [];
      if (els.ttsWordHlStyle.options.length === 0) {
        var wLabels = { highlight: 'Highlight', underline: 'Underline', squiggly: 'Squiggly', strikethrough: 'Strikethrough', enlarge: 'Enlarge' };
        for (var wi = 0; wi < wStyles.length; wi++) {
          var wo = document.createElement('option');
          wo.value = wStyles[wi];
          wo.textContent = wLabels[wStyles[wi]] || wStyles[wi];
          els.ttsWordHlStyle.appendChild(wo);
        }
      }
      var curWStyle = typeof tts.getWordHighlightStyle === 'function' ? tts.getWordHighlightStyle() : 'highlight';
      els.ttsWordHlStyle.value = curWStyle;
    }

    // FIX-TTS05: word highlight color swatches
    if (els.ttsWordHlColors) {
      var wColors = typeof tts.getHighlightColors === 'function' ? tts.getHighlightColors() : [];
      var curWColor = typeof tts.getWordHighlightColor === 'function' ? tts.getWordHighlightColor() : 'blue';
      if (!els.ttsWordHlColors.children.length) {
        var wSwatches = { grey: '#9a9aa8', blue: '#5a96ff', yellow: '#e6c800', green: '#50b464', pink: '#ff6e96', orange: '#ffa032' };
        for (var wj = 0; wj < wColors.length; wj++) {
          var wbtn = document.createElement('button');
          wbtn.className = 'ttsColorSwatch';
          wbtn.dataset.color = wColors[wj];
          wbtn.style.background = wSwatches[wColors[wj]] || '#888';
          wbtn.title = wColors[wj].charAt(0).toUpperCase() + wColors[wj].slice(1);
          els.ttsWordHlColors.appendChild(wbtn);
        }
      }
      var wbtns = els.ttsWordHlColors.querySelectorAll('.ttsColorSwatch');
      for (var wk = 0; wk < wbtns.length; wk++) {
        wbtns[wk].classList.toggle('active', wbtns[wk].dataset.color === curWColor);
      }
    }
  }

  function onHlStyleChange(style) {
    var tts = window.booksTTS;
    if (!tts || typeof tts.setHighlightStyle !== 'function') return;
    tts.setHighlightStyle(style);
    RS.state.settings.ttsHlStyle = style;
    RS.persistSettings().catch(function () {});
  }

  function onHlColorChange(colorName) {
    var tts = window.booksTTS;
    if (!tts || typeof tts.setHighlightColor !== 'function') return;
    tts.setHighlightColor(colorName);
    RS.state.settings.ttsHlColor = colorName;
    RS.persistSettings().catch(function () {});
    populateHlControls(); // update active swatch
  }

  // ── Bind ─────────────────────────────────────────────────────

  function bind() {
    var els = RS.ensureEls();

    // TTS launch button (toolbar)
    els.ttsLaunch && els.ttsLaunch.addEventListener('click', function () { ttsToggle(); });

    // TTS bar controls (inside host)
    els.playBtn && els.playBtn.addEventListener('click', function () { ttsToggle(); });
    els.ttsPlayPause && els.ttsPlayPause.addEventListener('click', function () { ttsToggle(); });
    els.ttsStop && els.ttsStop.addEventListener('click', function () { ttsStop(); });
    els.ttsSlower && els.ttsSlower.addEventListener('click', function () { ttsAdjustSpeed(-0.1); });
    els.ttsFaster && els.ttsFaster.addEventListener('click', function () { ttsAdjustSpeed(0.1); });

    // Voice picker
    els.ttsVoice && els.ttsVoice.addEventListener('change', function () {
      var tts = window.booksTTS;
      if (!tts) return;
      var voiceId = els.ttsVoice.value;
      tts.setVoice(voiceId);
      RS.state.settings.ttsVoice = voiceId;
      RS.persistSettings().catch(function () {});
      syncTtsUI(tts.getState());
    });
    els.ttsPreview && els.ttsPreview.addEventListener('click', function () { ttsPreviewVoice().catch(function () {}); });

    // Preset selector
    els.ttsPresetSel && els.ttsPresetSel.addEventListener('change', function () {
      ttsApplyPreset(els.ttsPresetSel.value);
    });

    // GAP5: Highlight style/color
    els.ttsHlStyle && els.ttsHlStyle.addEventListener('change', function () {
      onHlStyleChange(els.ttsHlStyle.value);
    });
    if (els.ttsHlColors) {
      els.ttsHlColors.addEventListener('click', function (ev) {
        var btn = ev.target.closest('.ttsColorSwatch');
        if (btn && btn.dataset.color) onHlColorChange(btn.dataset.color);
      });
    }

    // FIX-TTS05: word tracking checkbox
    els.ttsWordTracking && els.ttsWordTracking.addEventListener('change', function () {
      var tts = window.booksTTS;
      if (!tts || typeof tts.setHighlightGranularity !== 'function') return;
      var val = els.ttsWordTracking.checked ? 'word' : 'sentence';
      tts.setHighlightGranularity(val);
      RS.state.settings.ttsHlGranularity = val;
      RS.persistSettings().catch(function () {});
      populateHlControls();
    });

    // FIX-TTS05: word highlight style
    els.ttsWordHlStyle && els.ttsWordHlStyle.addEventListener('change', function () {
      var tts = window.booksTTS;
      if (!tts || typeof tts.setWordHighlightStyle !== 'function') return;
      tts.setWordHighlightStyle(els.ttsWordHlStyle.value);
      RS.state.settings.ttsWordHlStyle = els.ttsWordHlStyle.value;
      RS.persistSettings().catch(function () {});
    });

    // FIX-TTS05: word highlight color
    if (els.ttsWordHlColors) {
      els.ttsWordHlColors.addEventListener('click', function (ev) {
        var btn = ev.target.closest('.ttsColorSwatch');
        if (!btn || !btn.dataset.color) return;
        var tts = window.booksTTS;
        if (!tts || typeof tts.setWordHighlightColor !== 'function') return;
        tts.setWordHighlightColor(btn.dataset.color);
        RS.state.settings.ttsWordHlColor = btn.dataset.color;
        RS.persistSettings().catch(function () {});
        populateHlControls();
      });
    }

    // Rewind/forward
    els.ttsRewind && els.ttsRewind.addEventListener('click', function () { ttsStepSegment(-1); });
    els.ttsForward && els.ttsForward.addEventListener('click', function () { ttsStepSegment(1); });

    // Diagnostics
    els.ttsDiagBtn && els.ttsDiagBtn.addEventListener('click', function () { toggleTtsDiag(); });
    els.ttsDiagClose && els.ttsDiagClose.addEventListener('click', function () {
      if (els.ttsDiag) els.ttsDiag.classList.add('hidden');
    });

    // Mega settings panel toggle
    els.ttsMegaBtn && els.ttsMegaBtn.addEventListener('click', function () { toggleTtsMega(); });
    els.ttsMegaClose && els.ttsMegaClose.addEventListener('click', function () {
      if (els.ttsMega) els.ttsMega.classList.add('hidden');
    });

    // Return to TTS location
    els.returnTts && els.returnTts.addEventListener('click', function () { returnToTtsLocation().catch(function () {}); });

    // BUILD_TTS_JUMP: -10s/+10s buttons
    els.ttsBack10 && els.ttsBack10.addEventListener('click', function () { ttsJump(-10000); });
    els.ttsFwd10 && els.ttsFwd10.addEventListener('click', function () { ttsJump(10000); });
    // BUILD_TTS_SEL: read from selection button
    els.ttsFromSel && els.ttsFromSel.addEventListener('click', function () { ttsPlayFromSelection(); });

    // Bus events
    bus.on('tts:toggle', function () { ttsToggle(); });
    bus.on('tts:stop', function () { ttsStop(); });
    bus.on('tts:speed', function (delta) { ttsAdjustSpeed(delta); });
    bus.on('tts:step', function (delta) { ttsStepSegment(delta); });
    bus.on('tts:jump', function (deltaMs) { ttsJump(deltaMs); });
    bus.on('tts:play-from-selection', function () { ttsPlayFromSelection(); });
    bus.on('tts:cycle-voice', function (delta) { cycleVoice(delta); });
    bus.on('tts:show-return', function () { showReturnToTts(); });
    bus.on('tts:voice-changed', function () { populateTtsVoices(); });
    bus.on('overlay:opened', function () {
      // FIX_AUDIT: keep TTS controls synchronized whenever settings overlays are opened.
      var tts = window.booksTTS;
      syncTtsUI(tts ? tts.getState() : 'idle', tts && tts.getSnippet ? tts.getSnippet() : null);
    });
  }

  // ── GAP1: Media Session API ─────────────────────────────────
  var _mediaSessionBound = false;
  function updateMediaSession(status, snippet) {
    if (!navigator.mediaSession) return;
    var tts = window.booksTTS;
    if (!_mediaSessionBound && tts) {
      _mediaSessionBound = true;
      var actions = {
        play: function () { ttsToggle(); },
        pause: function () { ttsToggle(); },
        stop: function () { ttsStop(); },
        previoustrack: function () { if (tts.stepSegment) tts.stepSegment(-1); },
        nexttrack: function () { if (tts.stepSegment) tts.stepSegment(1); },
      };
      var keys = Object.keys(actions);
      for (var i = 0; i < keys.length; i++) {
        try { navigator.mediaSession.setActionHandler(keys[i], actions[keys[i]]); } catch (e) {}
      }
    }
    navigator.mediaSession.playbackState = (status === 'playing' || status === 'section_transition') ? 'playing'
      : status === 'paused' ? 'paused' : 'none';
    var book = RS.state.book;
    var title = (book && book.title) || 'TTS';
    var artist = (snippet && snippet.text) ? snippet.text.slice(0, 80) : '';
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title,
        artist: artist,
      });
    } catch (e) {}
  }
  function clearMediaSession() {
    if (!navigator.mediaSession) return;
    navigator.mediaSession.playbackState = 'none';
    try { navigator.mediaSession.metadata = null; } catch (e) {}
  }

  // ── Lifecycle ────────────────────────────────────────────────

  function onOpen() {
    if (!ttsAllowed()) {
      destroyTTS();
      syncTtsUI('idle', null);
      return;
    }
    initTTS().catch(function () {
      // FIX_AUDIT: avoid stale/dead controls if TTS init fails unexpectedly.
      setTtsControlsEnabled(false);
      syncTtsUI('idle', null);
    });
  }

  function onClose() {
    destroyTTS();
    RS.state.ttsLastLocation = null;
  }

  // ── Export ────────────────────────────────────────────────────

  window.booksReaderTtsUI = {
    bind: bind,
    onOpen: onOpen,
    onClose: onClose,
    ttsToggle: ttsToggle,
    ttsStop: ttsStop,
    ttsAdjustSpeed: ttsAdjustSpeed,
    ttsJump: ttsJump,
    ttsPlayFromSelection: ttsPlayFromSelection,
    cycleVoice: cycleVoice,
    syncTtsUI: syncTtsUI,
    populateTtsVoices: populateTtsVoices,
    showReturnToTts: showReturnToTts,
    destroyTTS: destroyTTS,
  };
})();
