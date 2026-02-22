// FEAT-AUDIOBOOK: In-reader audiobook playback module
// Registered in reader_core.js module array. Shares HTMLAudioElement with the
// standalone overlay (audiobook_player_overlay.js) — only one plays at a time.
// Provides transport bar inside the reading area + TTS mutual exclusion.
(function () {
  'use strict';

  if (window.__booksReaderAudiobookBound) return;
  window.__booksReaderAudiobookBound = true;

  var RS = window.booksReaderState;
  var bus = window.booksReaderBus;
  var api = window.Tanko && window.Tanko.api;

  // ── State ──────────────────────────────────────────────────────────────────
  var _audiobook = null;
  var _chapterIndex = 0;
  var _playing = false;
  var _audio = null;
  var _playbackRate = 1.0;
  var _volume = 1.0;
  var _loaded = false;       // true once an audiobook is loaded in the reader session
  var _seekDragging = false;
  var _saveTimer = null;
  var _lastSavedPos = -1;

  // Auto-hide state
  var _barHideTimer = null;
  var _barHoverBar = false;
  var _barHoverBottom = false;
  var _barVisible = false;
  var BAR_AUTO_HIDE_MS = 3000;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  var el = {};
  function qs(id) { return document.getElementById(id); }

  function ensureEls() {
    el.bar         = qs('abPlayerBar');
    el.chLabel     = qs('abChapterLabel');
    el.prevCh      = qs('abPrevCh');
    el.rew15       = qs('abRew15');
    el.playPause   = qs('abPlayPause');
    el.fwd15       = qs('abFwd15');
    el.nextCh      = qs('abNextCh');
    el.time        = qs('abTime');
    el.slower      = qs('abSlower');
    el.speed       = qs('abSpeed');
    el.faster      = qs('abFaster');
    el.volume      = qs('abVolume');
    el.close       = qs('abClose');
  }

  // ── SVG icons ──────────────────────────────────────────────────────────────
  var SVG_PLAY = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  var SVG_PAUSE = '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/></svg>';

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function fmt(secs) {
    if (!secs || !isFinite(secs)) return '0:00';
    var s = Math.round(secs);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    return m + ':' + String(sec).padStart(2, '0');
  }

  // ── TTS mutual exclusion ───────────────────────────────────────────────────
  function stopTTS() {
    var tts = window.booksTTS;
    if (!tts) return;
    try { if (typeof tts.stop === 'function') tts.stop(); } catch (_) {}
    try { if (typeof tts.destroy === 'function') tts.destroy(); } catch (_) {}
  }

  function isTTSActive() {
    try {
      var tts = window.booksTTS;
      if (!tts || typeof tts.getState !== 'function') return false;
      var s = String(tts.getState() || '');
      return s === 'playing' || s === 'paused' || /-paused$/.test(s);
    } catch (_) { return false; }
  }

  // ── Audio engine ───────────────────────────────────────────────────────────
  function ensureAudio() {
    if (_audio) return;
    _audio = new Audio();
    _audio.addEventListener('timeupdate', onTimeUpdate);
    _audio.addEventListener('ended', onChapterEnded);
    _audio.addEventListener('loadedmetadata', onMetaLoaded);
    _audio.addEventListener('error', onAudioError);
    _audio.addEventListener('play', function () { _playing = true; updatePlayBtn(); updateMediaSession(); showBar(); startAutoHide(); });
    _audio.addEventListener('pause', function () { _playing = false; updatePlayBtn(); showBar(); clearAutoHide(); });
  }

  function loadChapter(index) {
    if (!_audiobook || index < 0 || index >= _audiobook.chapters.length) return;
    _chapterIndex = index;
    var ch = _audiobook.chapters[index];
    ensureAudio();
    _audio.src = 'file://' + ch.path.replace(/\\/g, '/').replace(/#/g, '%23');
    _audio.playbackRate = _playbackRate;
    _audio.volume = _volume;
    updateChapterLabel();
    updateTimeDisplay(0, 0);
    bus.emit('audiobook:chapter-changed', { index: index, title: ch.title, total: _audiobook.chapters.length });
  }

  function play() {
    if (!_audio || !_audio.src) return;
    // Mutual exclusion: stop TTS before playing audiobook
    if (isTTSActive()) stopTTS();
    _audio.play().catch(function (e) { console.warn('[AB Reader] play error:', e); });
  }

  function pause() {
    if (_audio) _audio.pause();
  }

  function togglePlayPause() {
    if (_playing) pause();
    else play();
  }

  function seekRelative(delta) {
    if (!_audio || !isFinite(_audio.duration)) return;
    var t = Math.max(0, Math.min(_audio.duration, _audio.currentTime + delta));
    _audio.currentTime = t;
  }

  function nextChapter() {
    if (!_audiobook) return;
    if (_chapterIndex + 1 < _audiobook.chapters.length) {
      saveProgress();
      loadChapter(_chapterIndex + 1);
      play();
    }
  }

  function prevChapter() {
    if (!_audiobook) return;
    if (_audio && _audio.currentTime > 3) {
      _audio.currentTime = 0;
      return;
    }
    if (_chapterIndex > 0) {
      saveProgress();
      loadChapter(_chapterIndex - 1);
      play();
    }
  }

  function setRate(rate) {
    _playbackRate = Math.max(0.5, Math.min(3.0, Math.round(rate * 10) / 10));
    if (_audio) _audio.playbackRate = _playbackRate;
    if (el.speed) el.speed.textContent = _playbackRate.toFixed(1) + '\u00d7';
  }

  function setVolume(vol) {
    _volume = Math.max(0, Math.min(1, vol));
    if (_audio) _audio.volume = _volume;
    if (el.volume) el.volume.value = _volume;
  }

  // ── Audio event handlers ───────────────────────────────────────────────────
  function onTimeUpdate() {
    if (_seekDragging || !_audio) return;
    var cur = _audio.currentTime || 0;
    var dur = _audio.duration || 0;
    updateTimeDisplay(cur, dur);
    bus.emit('audiobook:progress', {
      chapterIndex: _chapterIndex,
      position: cur,
      duration: dur,
      chapterTitle: _audiobook ? _audiobook.chapters[_chapterIndex].title : ''
    });
    if (Math.abs(cur - _lastSavedPos) > 30) scheduleSave();
  }

  function onMetaLoaded() {
    if (!_audio) return;
    updateTimeDisplay(_audio.currentTime || 0, _audio.duration || 0);
    updateMediaSession();
  }

  function onChapterEnded() {
    saveProgress();
    if (_audiobook && _chapterIndex + 1 < _audiobook.chapters.length) {
      loadChapter(_chapterIndex + 1);
      play();
    } else {
      _playing = false;
      updatePlayBtn();
      saveProgress(true);
      bus.emit('audiobook:state', 'idle');
    }
  }

  function onAudioError(e) {
    console.error('[AB Reader] Audio error:', e);
    _playing = false;
    updatePlayBtn();
    bus.emit('audiobook:state', 'error');
  }

  // ── MediaSession ───────────────────────────────────────────────────────────
  function updateMediaSession() {
    if (!navigator.mediaSession || !_audiobook) return;
    var ch = _audiobook.chapters[_chapterIndex];
    var artwork = [];
    if (_audiobook.coverPath) {
      var cover = 'file://' + _audiobook.coverPath.replace(/\\/g, '/').replace(/#/g, '%23');
      artwork.push({ src: cover, sizes: '512x512' });
    }
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: ch ? ch.title : '',
        artist: _audiobook.title || '',
        artwork: artwork
      });
    } catch (_) {}
    try {
      navigator.mediaSession.setActionHandler('play', play);
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.setActionHandler('previoustrack', prevChapter);
      navigator.mediaSession.setActionHandler('nexttrack', nextChapter);
      navigator.mediaSession.setActionHandler('seekbackward', function () { seekRelative(-15); });
      navigator.mediaSession.setActionHandler('seekforward', function () { seekRelative(15); });
    } catch (_) {}
  }

  // ── Progress ───────────────────────────────────────────────────────────────
  function scheduleSave() {
    _lastSavedPos = _audio ? _audio.currentTime : 0;
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () { saveProgress(); }, 2000);
  }

  function saveProgress(finished) {
    if (!_audiobook || !api) return;
    var pos = _audio ? _audio.currentTime : 0;
    _lastSavedPos = pos;
    var data = {
      chapterIndex: _chapterIndex,
      position: pos,
      totalChapters: _audiobook.chapters.length,
      finished: !!finished,
      updatedAt: Date.now(),
      audiobookMeta: { path: _audiobook.path, title: _audiobook.title }
    };
    try { api.audiobooks.saveProgress(_audiobook.id, data); } catch (_) {}
  }

  // ── UI updates ─────────────────────────────────────────────────────────────
  function updatePlayBtn() {
    if (el.playPause) el.playPause.innerHTML = _playing ? SVG_PAUSE : SVG_PLAY;
  }

  function updateChapterLabel() {
    if (!el.chLabel || !_audiobook) return;
    var ch = _audiobook.chapters[_chapterIndex];
    var label = 'Ch.' + (_chapterIndex + 1);
    if (ch && ch.title) label = ch.title;
    el.chLabel.textContent = label;
    el.chLabel.title = label;
  }

  function updateTimeDisplay(cur, dur) {
    if (el.time) el.time.textContent = fmt(cur) + ' / ' + fmt(dur);
  }

  // ── Bar visibility / auto-hide ─────────────────────────────────────────────
  function showBar() {
    if (!el.bar || !_loaded) return;
    el.bar.classList.remove('hidden');
    el.bar.classList.remove('ab-bar-autohide');
    _barVisible = true;
  }

  function hideBar() {
    if (!el.bar) return;
    el.bar.classList.add('ab-bar-autohide');
    _barVisible = false;
  }

  function startAutoHide() {
    clearAutoHide();
    if (!_playing) return;
    _barHideTimer = setTimeout(function () {
      if (_playing && !_barHoverBar && !_barHoverBottom) hideBar();
    }, BAR_AUTO_HIDE_MS);
  }

  function clearAutoHide() {
    if (_barHideTimer) { clearTimeout(_barHideTimer); _barHideTimer = null; }
  }

  function resetAutoHide() {
    showBar();
    startAutoHide();
  }

  // ── Public API: loadAudiobook ──────────────────────────────────────────────
  function loadAudiobook(audiobook, resumeOpts) {
    if (!audiobook || !audiobook.chapters || !audiobook.chapters.length) return;
    ensureEls();

    // Mutual exclusion: stop TTS
    if (isTTSActive()) stopTTS();

    _audiobook = audiobook;
    _loaded = true;
    var startIdx = (resumeOpts && resumeOpts.chapterIndex) || 0;
    var startPos = (resumeOpts && resumeOpts.position) || 0;

    loadChapter(startIdx);
    showBar();

    if (startPos > 0) {
      var onMeta = function () {
        _audio.removeEventListener('loadedmetadata', onMeta);
        _audio.currentTime = startPos;
        play();
      };
      _audio.addEventListener('loadedmetadata', onMeta);
    } else {
      play();
    }

    bus.emit('audiobook:state', 'playing');
  }

  function closeAudiobook() {
    if (_audio) {
      _audio.pause();
      saveProgress();
    }
    _playing = false;
    _audiobook = null;
    _loaded = false;
    if (el.bar) { el.bar.classList.add('hidden'); el.bar.classList.remove('ab-bar-autohide'); }
    if (navigator.mediaSession) {
      try { navigator.mediaSession.metadata = null; } catch (_) {}
    }
    bus.emit('audiobook:state', 'idle');
  }

  // ── Module lifecycle (reader_core.js integration) ──────────────────────────

  function bind() {
    ensureEls();
    if (!el.bar) return;

    // Transport controls
    if (el.playPause) el.playPause.addEventListener('click', togglePlayPause);
    if (el.prevCh) el.prevCh.addEventListener('click', prevChapter);
    if (el.nextCh) el.nextCh.addEventListener('click', nextChapter);
    if (el.rew15) el.rew15.addEventListener('click', function () { seekRelative(-15); });
    if (el.fwd15) el.fwd15.addEventListener('click', function () { seekRelative(15); });
    if (el.slower) el.slower.addEventListener('click', function () { setRate(_playbackRate - 0.1); });
    if (el.faster) el.faster.addEventListener('click', function () { setRate(_playbackRate + 0.1); });
    if (el.close) el.close.addEventListener('click', closeAudiobook);

    // Volume slider
    if (el.volume) {
      el.volume.addEventListener('input', function () { setVolume(parseFloat(el.volume.value)); });
    }

    // Auto-hide: hover detection on bar
    el.bar.addEventListener('mouseenter', function () { _barHoverBar = true; showBar(); clearAutoHide(); });
    el.bar.addEventListener('mouseleave', function () { _barHoverBar = false; startAutoHide(); });

    // Auto-hide: bottom-zone hover detection on reading area
    var readingArea = el.bar.parentElement;
    if (readingArea) {
      readingArea.addEventListener('mousemove', function (e) {
        if (!_loaded || !_playing) return;
        var rect = readingArea.getBoundingClientRect();
        var inBottomZone = (e.clientY > rect.bottom - 80);
        if (inBottomZone && !_barVisible) {
          _barHoverBottom = true;
          showBar();
        } else if (!inBottomZone && _barHoverBottom) {
          _barHoverBottom = false;
          startAutoHide();
        }
      }, { passive: true });
    }

    // Listen for TTS starting — close audiobook
    if (bus) {
      bus.on('reader:tts-state', function (status) {
        if (status === 'playing' && _loaded) {
          closeAudiobook();
        }
      });
    }
  }

  function onOpen() {
    // When a book opens, check if it has a paired audiobook and auto-load it
    // (Phase 4 will implement pairing — for now, just ensure bar state is clean)
    ensureEls();
  }

  function onClose() {
    // Reader closing — save progress and clean up
    if (_loaded) {
      if (_audio) { _audio.pause(); saveProgress(); }
      _playing = false;
      _audiobook = null;
      _loaded = false;
    }
    if (el.bar) { el.bar.classList.add('hidden'); el.bar.classList.remove('ab-bar-autohide'); }
  }

  // beforeunload save
  window.addEventListener('beforeunload', function () {
    if (_audiobook && _audio) saveProgress();
  });

  // ── Export ──────────────────────────────────────────────────────────────────
  window.booksReaderAudiobook = {
    bind: bind,
    onOpen: onOpen,
    onClose: onClose,
    loadAudiobook: loadAudiobook,
    closeAudiobook: closeAudiobook,
    isLoaded: function () { return _loaded; },
    isPlaying: function () { return _playing; },
    getAudiobook: function () { return _audiobook; },
    getProgress: function () {
      return {
        chapterIndex: _chapterIndex,
        position: _audio ? _audio.currentTime : 0,
        duration: _audio ? _audio.duration : 0,
        totalChapters: _audiobook ? _audiobook.chapters.length : 0,
        chapterTitle: _audiobook ? _audiobook.chapters[_chapterIndex].title : ''
      };
    },
    play: play,
    pause: pause,
    togglePlayPause: togglePlayPause,
    seekRelative: seekRelative,
    nextChapter: nextChapter,
    prevChapter: prevChapter,
    setRate: setRate,
    setVolume: setVolume,
  };

})();
