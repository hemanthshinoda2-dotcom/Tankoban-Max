// LISTEN_P3/P4/P5: TTS Listening player — overlay, word highlight, progress, chapter navigation
(function () {
  'use strict';

  if (window.__booksListenPlayerBound) return;
  window.__booksListenPlayerBound = true;

  var _book = null;            // currently queued / playing book
  var _open = false;           // player is active (reader open + overlay visible)
  var _ttsStarted = false;     // TTS.play() has been called this session
  var _lastSavedBlockIdx = -1; // LISTEN_P4: track block changes for progress saves
  var _saveTimer = null;       // LISTEN_P4: debounce timer for progress saves
  var _tocPanelOpen = false;   // LISTEN_P5: chapter panel visible
  var _navigating = false;     // LISTEN_P5: mid-chapter-jump, restart TTS on relocated
  var _activeTocHref = '';     // LISTEN_P5: href of currently active TOC item

  function qs(id) {
    try { return document.getElementById(id); } catch { return null; }
  }

  // ── Overlay visibility ────────────────────────────────────────────────────────

  function showOverlay(show) {
    var el = qs('booksListenPlayerOverlay');
    if (el) el.classList.toggle('hidden', !show);
  }

  // ── Play / pause icon sync ────────────────────────────────────────────────────

  function syncPlayPauseIcon(status) {
    var playIcon  = qs('lpPlayIcon');
    var pauseIcon = qs('lpPauseIcon');
    if (!playIcon || !pauseIcon) return;
    var isPlaying = (status === 'playing');
    playIcon.classList.toggle('hidden', isPlaying);
    pauseIcon.classList.toggle('hidden', !isPlaying);
  }

  // ── Reading card update ───────────────────────────────────────────────────────

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function updateCard(info) {
    if (!info) return;

    // Block text with active-word highlight
    var card = qs('lpCardText');
    if (card) {
      var text      = String(info.text || '');
      var wStart    = info.wordStart;
      var wEnd      = info.wordEnd;
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

    // Block counter
    var idxEl = qs('lpBlockIdx');
    var cntEl = qs('lpBlockCount');
    var idx   = (info.blockIdx >= 0) ? info.blockIdx + 1 : 0;
    var cnt   = info.blockCount || 0;
    if (idxEl) idxEl.textContent = String(idx);
    if (cntEl) cntEl.textContent = String(cnt);

    // Speed button active state
    syncSpeedActive(info.rate);

    // LISTEN_P4: debounced progress save on block change
    var blockIdx = (info.blockIdx >= 0) ? info.blockIdx : -1;
    if (blockIdx >= 0 && blockIdx !== _lastSavedBlockIdx) {
      _lastSavedBlockIdx = blockIdx;
      saveProgress(info, false);
    }
  }

  function syncSpeedActive(rate) {
    if (!rate) return;
    var btns = document.querySelectorAll('.lp-speed-btn');
    for (var i = 0; i < btns.length; i++) {
      var r = parseFloat(btns[i].dataset.rate);
      btns[i].classList.toggle('lp-speed-active', Math.abs(r - rate) < 0.01);
    }
  }

  // ── LISTEN_P4: TTS progress persistence ──────────────────────────────────────

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

  // ── Voice selector ────────────────────────────────────────────────────────────

  function populateVoiceSelect() {
    var sel = qs('lpVoiceSelect');
    if (!sel) return;
    var tts = window.booksTTS;
    if (!tts || typeof tts.getVoices !== 'function') return;
    var voices = [];
    try { voices = tts.getVoices(); } catch {}
    if (!voices.length) return;

    sel.innerHTML = '';
    for (var i = 0; i < voices.length; i++) {
      var v = voices[i];
      var opt = document.createElement('option');
      opt.value = v.voiceURI || v.name || '';
      opt.textContent = v.name || v.voiceURI || '(unknown)';
      sel.appendChild(opt);
    }
  }

  // ── LISTEN_P5: Chapter list panel ────────────────────────────────────────────

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
      var isActive = normalizeTocHref(items[i].dataset.href || '') === norm;
      items[i].classList.toggle('active', isActive);
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
    // FIX-LISTEN-STAB: timeout fallback — if reader:relocated never fires, reset _navigating
    // and restart TTS so the player doesn't get stuck in a dead state
    if (!emitted) {
      _navigating = false;
      try { console.warn('[listen-player] toc:navigate not emitted — bus unavailable'); } catch {}
      return;
    }
    setTimeout(function () {
      if (!_navigating || !_open) return;
      _navigating = false;
      try { console.warn('[listen-player] toc:navigate timeout — reader:relocated not received'); } catch {}
      var tts2 = window.booksTTS;
      if (tts2) try { tts2.play(); } catch {}
    }, 5000);
  }

  // ── TTS wiring ────────────────────────────────────────────────────────────────

  function wireTts() {
    var tts = window.booksTTS;
    if (!tts) return;

    tts.onStateChange = function (status, info) {
      syncPlayPauseIcon(status);
      if (info) updateCard(info);
    };

    tts.onProgress = function (info) {
      updateCard(info);
    };
  }

  function unwireTts() {
    var tts = window.booksTTS;
    if (!tts) return;
    tts.onStateChange = null;
    tts.onProgress = null;
  }

  function startTts() {
    if (_ttsStarted) return;
    _ttsStarted = true;
    wireTts();
    populateVoiceSelect();
    renderTocPanel(); // LISTEN_P5: populate chapter list

    var tts = window.booksTTS;
    if (!tts) return;
    // Show current state if already loaded
    try {
      var snap = tts.getSnippet ? tts.getSnippet() : null;
      if (snap) updateCard(snap);
      syncPlayPauseIcon(tts.getState ? tts.getState() : 'idle');
    } catch {}

    try { tts.play(); } catch (e) {
      try { console.error('[listen-player] tts.play() failed:', e); } catch {}
    }
  }

  // ── Open / close ──────────────────────────────────────────────────────────────

  function open(book) {
    if (!book) return;
    // FIX-LISTEN-STAB: guard against rapid double-open — close previous session first
    if (_open) {
      try {
        var tts = window.booksTTS;
        if (tts) tts.stop();
      } catch {}
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

    // Update header title
    var titleEl = qs('lpBookTitle');
    if (titleEl) titleEl.textContent = book.title || '';

    // Reset card
    var card = qs('lpCardText');
    if (card) card.innerHTML = '';
    var idxEl = qs('lpBlockIdx');
    var cntEl = qs('lpBlockCount');
    if (idxEl) idxEl.textContent = '0';
    if (cntEl) cntEl.textContent = '0';
    syncPlayPauseIcon('idle');

    // Open the book in the reader (books-reader-opened event will fire when ready)
    // LISTEN_P7: use openBookInReader to bypass _listenMode routing and avoid infinite loop
    var booksApp = window.booksApp;
    if (!booksApp || typeof booksApp.openBookInReader !== 'function') {
      try { console.warn('[listen-player] booksApp.openBookInReader not available'); } catch {}
      return;
    }

    booksApp.openBookInReader(book).catch(function (e) {
      try { console.error('[listen-player] openBookInReader failed:', e); } catch {}
      _open = false;
    });
  }

  function closePlayer() {
    if (!_open) return;
    _open = false;
    _ttsStarted = false;

    // LISTEN_P4: flush progress immediately before stopping
    try {
      var tts2 = window.booksTTS;
      var snap = tts2 && tts2.getSnippet ? tts2.getSnippet() : null;
      saveProgress(snap, true);
    } catch {}
    _lastSavedBlockIdx = -1;
    _tocPanelOpen = false;
    _navigating = false;
    showTocPanel(false);

    // Stop TTS and clear callbacks
    var tts = window.booksTTS;
    if (tts) try { tts.stop(); } catch {}
    unwireTts();

    // Hide overlay
    showOverlay(false);

    // Close reader and return to listening library
    // booksApp.back() closes the reader and resets library nav state
    var shell = window.booksListeningShell;
    var booksApp = window.booksApp;
    if (booksApp && typeof booksApp.back === 'function') {
      booksApp.back().then(function () {
        // back() renders reading home — re-apply listen mode on top
        if (shell && typeof shell.setMode === 'function') {
          shell.setMode(shell.MODE_LISTEN);
        }
      }).catch(function () {
        if (shell && typeof shell.setMode === 'function') {
          shell.setMode(shell.MODE_LISTEN);
        }
      });
    } else if (shell && typeof shell.setMode === 'function') {
      shell.setMode(shell.MODE_LISTEN);
    }
  }

  // ── Keyboard shortcut handling inside player ──────────────────────────────────

  function onPlayerKeyDown(e) {
    if (!_open) return;
    var tts = window.booksTTS;
    if (!tts) return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        e.stopPropagation();
        // FIX-LISTEN-STAB: handle idle state (resume only works from paused)
        var st = tts.getState();
        if (st === 'playing') tts.pause();
        else if (st === 'paused') tts.resume();
        else try { tts.play(); } catch {}
        break;
      case 'ArrowLeft':
        e.preventDefault();
        e.stopPropagation();
        try { tts.stepSegment(-1); } catch {}
        break;
      case 'ArrowRight':
        e.preventDefault();
        e.stopPropagation();
        try { tts.stepSegment(1); } catch {}
        break;
      case 'c':
      case 'C':
        e.preventDefault();
        e.stopPropagation();
        showTocPanel(!_tocPanelOpen);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        if (_tocPanelOpen) { showTocPanel(false); break; }
        closePlayer();
        break;
    }
  }

  // ── Bind DOM events ───────────────────────────────────────────────────────────

  function bind() {
    // Reader lifecycle events (fired by reader_core.js)
    window.addEventListener('books-reader-opened', function () {
      if (!_open) return;
      showOverlay(true);
      startTts();
    });

    window.addEventListener('books-reader-closed', function () {
      // Reader closed externally (e.g., Esc in reader) — sync player state
      if (!_open) return;
      // LISTEN_P4: flush progress on external close
      try {
        var tts3 = window.booksTTS;
        var snap3 = tts3 && tts3.getSnippet ? tts3.getSnippet() : null;
        saveProgress(snap3, true);
      } catch {}
      _lastSavedBlockIdx = -1;
      showOverlay(false);
      _open = false;
      _ttsStarted = false;
      unwireTts();
      var shell = window.booksListeningShell;
      if (shell && typeof shell.setMode === 'function') {
        shell.setMode(shell.MODE_LISTEN);
      }
    });

    // Back button
    var backBtn = qs('lpBackBtn');
    if (backBtn) backBtn.addEventListener('click', closePlayer);

    // Play / Pause — FIX-LISTEN-STAB: handle idle state (resume only works from paused)
    var ppBtn = qs('lpPlayPauseBtn');
    if (ppBtn) ppBtn.addEventListener('click', function () {
      var tts = window.booksTTS;
      if (!tts) return;
      var st = tts.getState();
      if (st === 'playing') tts.pause();
      else if (st === 'paused') tts.resume();
      else try { tts.play(); } catch {}
    });

    // Prev / Next block
    var prevBtn = qs('lpPrevBtn');
    if (prevBtn) prevBtn.addEventListener('click', function () {
      var tts = window.booksTTS;
      if (tts && typeof tts.stepSegment === 'function') try { tts.stepSegment(-1); } catch {}
    });

    var nextBtn = qs('lpNextBtn');
    if (nextBtn) nextBtn.addEventListener('click', function () {
      var tts = window.booksTTS;
      if (tts && typeof tts.stepSegment === 'function') try { tts.stepSegment(1); } catch {}
    });

    // Speed preset buttons
    var speedBtns = document.querySelectorAll('.lp-speed-btn');
    for (var i = 0; i < speedBtns.length; i++) {
      speedBtns[i].addEventListener('click', (function (btn) {
        return function () {
          var rate = parseFloat(btn.dataset.rate);
          if (!isFinite(rate)) return;
          syncSpeedActive(rate);
          var tts = window.booksTTS;
          if (tts && typeof tts.setRate === 'function') try { tts.setRate(rate); } catch {}
        };
      })(speedBtns[i]));
    }

    // Voice selector
    var voiceSel = qs('lpVoiceSelect');
    if (voiceSel) voiceSel.addEventListener('change', function () {
      var voiceId = voiceSel.value;
      var tts = window.booksTTS;
      if (tts && typeof tts.setVoice === 'function') try { tts.setVoice(voiceId); } catch {}
    });

    // LISTEN_P5: TOC button
    var tocBtn = qs('lpTocBtn');
    if (tocBtn) tocBtn.addEventListener('click', function () {
      showTocPanel(!_tocPanelOpen);
    });

    var tocClose = qs('lpTocClose');
    if (tocClose) tocClose.addEventListener('click', function () { showTocPanel(false); });

    // LISTEN_P5: Bus subscriptions — wire to reader's TOC and relocation events
    var bus = window.booksReaderBus;
    if (bus) {
      // Re-render TOC list when reader loads/changes the TOC
      bus.on('toc:updated', function () {
        if (!_open) return;
        renderTocPanel();
      });

      // Update active chapter highlight on navigation; restart TTS after chapter jump
      bus.on('reader:relocated', function (detail) {
        if (!_open) return;
        var href = detail && detail.tocItem && detail.tocItem.href ? detail.tocItem.href : '';
        if (href) updateTocActive(href);
        if (_navigating) {
          _navigating = false;
          // Brief delay to let the engine settle before starting TTS
          setTimeout(function () {
            if (!_open) return;
            var tts = window.booksTTS;
            if (tts) try { tts.play(); } catch {}
          }, 150);
        }
      });
    }

    // Keyboard shortcuts when player overlay is visible
    document.addEventListener('keydown', onPlayerKeyDown, { capture: true });
  }

  // ── Export ────────────────────────────────────────────────────────────────────

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
