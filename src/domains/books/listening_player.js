// LISTEN_P3: TTS Listening player — overlay on #booksReaderView, word-level highlight card
(function () {
  'use strict';

  if (window.__booksListenPlayerBound) return;
  window.__booksListenPlayerBound = true;

  var _book = null;       // currently queued / playing book
  var _open = false;      // player is active (reader open + overlay visible)
  var _ttsStarted = false; // TTS.play() has been called this session

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
  }

  function syncSpeedActive(rate) {
    if (!rate) return;
    var btns = document.querySelectorAll('.lp-speed-btn');
    for (var i = 0; i < btns.length; i++) {
      var r = parseFloat(btns[i].dataset.rate);
      btns[i].classList.toggle('lp-speed-active', Math.abs(r - rate) < 0.01);
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

    var currentVoiceId = (typeof tts.getState === 'function') ? '' : '';
    try {
      var snap = tts.getSnippet ? tts.getSnippet() : null;
      // voice id not in snippet — use internal state indirectly
    } catch {}

    sel.innerHTML = '';
    for (var i = 0; i < voices.length; i++) {
      var v = voices[i];
      var opt = document.createElement('option');
      opt.value = v.voiceURI || v.name || '';
      opt.textContent = v.name || v.voiceURI || '(unknown)';
      sel.appendChild(opt);
    }
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
    _book = book;
    _open = true;
    _ttsStarted = false;

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
    var booksApp = window.booksApp;
    if (!booksApp || typeof booksApp.openBook !== 'function') {
      try { console.warn('[listen-player] booksApp.openBook not available'); } catch {}
      return;
    }

    booksApp.openBook(book).catch(function (e) {
      try { console.error('[listen-player] openBook failed:', e); } catch {}
      _open = false;
    });
  }

  function closePlayer() {
    if (!_open) return;
    _open = false;
    _ttsStarted = false;

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
        if (tts.getState() === 'playing') tts.pause();
        else tts.resume();
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
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
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

    // Play / Pause
    var ppBtn = qs('lpPlayPauseBtn');
    if (ppBtn) ppBtn.addEventListener('click', function () {
      var tts = window.booksTTS;
      if (!tts) return;
      if (tts.getState() === 'playing') tts.pause();
      else tts.resume();
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
