// FEAT-AUDIOBOOK: Standalone audiobook player overlay
// Shows full-screen player when clicking an audiobook tile from the library.
// Uses its own HTMLAudioElement for playback and closes the in-reader audiobook bar on open. Manages chapter list, seek, speed, volume.
(function () {
  'use strict';

  if (window.__booksAudiobookOverlayBound) return;
  window.__booksAudiobookOverlayBound = true;

  var api = window.Tanko && window.Tanko.api;

  // ── State ──────────────────────────────────────────────────────────────────
  var _audiobook = null;    // current audiobook record
  var _chapterIndex = 0;    // current chapter (0-based)
  var _playing = false;
  var _audio = null;        // HTMLAudioElement
  var _playbackRate = 1.0;
  var _volume = 1.0;
  var _open = false;
  var _seekDragging = false;
  var _saveTimer = null;
  var _lastSavedPos = -1;
  var _chaptersExpanded = false;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  var el = {};
  function qs(id) { return document.getElementById(id); }

  function ensureEls() {
    el.overlay      = qs('audiobookPlayerOverlay');
    el.back         = qs('abOverlayBack');
    el.title        = qs('abOverlayTitle');
    el.cover        = qs('abOverlayCover');
    el.chTitle      = qs('abOverlayChTitle');
    el.chCount      = qs('abOverlayChCount');
    el.timeLeft     = qs('abOverlayTimeLeft');
    el.seek         = qs('abOverlaySeek');
    el.timeRight    = qs('abOverlayTimeRight');
    el.prevCh       = qs('abOverlayPrevCh');
    el.rew15        = qs('abOverlayRew15');
    el.playPause    = qs('abOverlayPlayPause');
    el.fwd15        = qs('abOverlayFwd15');
    el.nextCh       = qs('abOverlayNextCh');
    el.slower       = qs('abOverlaySlower');
    el.speed        = qs('abOverlaySpeed');
    el.faster       = qs('abOverlayFaster');
    el.volume       = qs('abOverlayVolume');
    el.chToggle     = qs('abOverlayChToggle');
    el.chList       = qs('abOverlayChList');
  }

  // ── SVG icons ──────────────────────────────────────────────────────────────
  var SVG_PLAY = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  var SVG_PAUSE = '<svg viewBox="0 0 24 24" width="28" height="28"><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/></svg>';

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

  function coverUrl(ab) {
    if (ab && ab.coverPath) return 'file://' + ab.coverPath.replace(/\\/g, '/').replace(/#/g, '%23');
    return '';
  }

  // ── Audio engine ───────────────────────────────────────────────────────────
  function ensureAudio() {
    if (_audio) return;
    _audio = new Audio();
    _audio.addEventListener('timeupdate', onTimeUpdate);
    _audio.addEventListener('ended', onChapterEnded);
    _audio.addEventListener('loadedmetadata', onMetaLoaded);
    _audio.addEventListener('error', onAudioError);
    _audio.addEventListener('play', function () { _playing = true; updatePlayBtn(); updateMediaSession(); });
    _audio.addEventListener('pause', function () { _playing = false; updatePlayBtn(); });
  }

  function loadChapter(index) {
    if (!_audiobook || index < 0 || index >= _audiobook.chapters.length) return;
    _chapterIndex = index;
    var ch = _audiobook.chapters[index];
    ensureAudio();
    _audio.src = 'file://' + ch.path.replace(/\\/g, '/').replace(/#/g, '%23');
    _audio.playbackRate = _playbackRate;
    _audio.volume = _volume;
    updateChapterDisplay();
    renderChapterList();
    // Reset seek bar
    if (el.seek) { el.seek.value = 0; el.seek.max = 100; }
    if (el.timeLeft) el.timeLeft.textContent = '0:00';
    if (el.timeRight) el.timeRight.textContent = '0:00';
  }

  function play() {
    if (!_audio || !_audio.src) return;
    _audio.play().catch(function (e) { console.warn('[AB Overlay] play error:', e); });
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
    // If more than 3 seconds in, restart current chapter
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
    if (el.timeLeft) el.timeLeft.textContent = fmt(cur);
    if (el.timeRight) el.timeRight.textContent = fmt(dur);
    if (el.seek && dur > 0) {
      el.seek.max = dur;
      el.seek.value = cur;
    }
    // Auto-save every 30s
    if (Math.abs(cur - _lastSavedPos) > 30) {
      scheduleSave();
    }
  }

  function onMetaLoaded() {
    if (!_audio) return;
    var dur = _audio.duration || 0;
    if (el.timeRight) el.timeRight.textContent = fmt(dur);
    if (el.seek) el.seek.max = dur;
    updateMediaSession();
  }

  function onChapterEnded() {
    saveProgress();
    if (_audiobook && _chapterIndex + 1 < _audiobook.chapters.length) {
      loadChapter(_chapterIndex + 1);
      play();
    } else {
      // Last chapter finished
      _playing = false;
      updatePlayBtn();
      saveProgress(true); // mark finished
    }
  }

  function onAudioError(e) {
    console.error('[AB Overlay] Audio error:', e);
    _playing = false;
    updatePlayBtn();
  }

  // ── MediaSession ───────────────────────────────────────────────────────────
  function updateMediaSession() {
    if (!navigator.mediaSession || !_audiobook) return;
    var ch = _audiobook.chapters[_chapterIndex];
    var artwork = [];
    var cover = coverUrl(_audiobook);
    if (cover) artwork.push({ src: cover, sizes: '512x512' });
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

  // ── Progress save ──────────────────────────────────────────────────────────
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
    try {
      api.audiobooks.saveProgress(_audiobook.id, data);
    } catch (e) {
      console.warn('[AB Overlay] saveProgress error:', e);
    }
  }

  // ── UI updates ─────────────────────────────────────────────────────────────
  function updatePlayBtn() {
    if (el.playPause) el.playPause.innerHTML = _playing ? SVG_PAUSE : SVG_PLAY;
  }

  function updateChapterDisplay() {
    if (!_audiobook) return;
    var ch = _audiobook.chapters[_chapterIndex];
    if (el.chTitle) el.chTitle.textContent = ch ? ch.title : '';
    if (el.chCount) {
      el.chCount.textContent = 'Chapter ' + (_chapterIndex + 1) + ' of ' + _audiobook.chapters.length;
    }
  }

  function renderChapterList() {
    if (!el.chList || !_audiobook) return;
    el.chList.innerHTML = '';
    _audiobook.chapters.forEach(function (ch, i) {
      var btn = document.createElement('button');
      btn.className = 'ab-chapter-item' + (i === _chapterIndex ? ' active' : '');
      var label = document.createElement('span');
      label.className = 'ab-chapter-item-title';
      label.textContent = (i + 1) + '. ' + ch.title;
      btn.appendChild(label);
      if (ch.duration) {
        var dur = document.createElement('span');
        dur.className = 'ab-chapter-item-dur muted tiny';
        dur.textContent = fmt(ch.duration);
        btn.appendChild(dur);
      }
      btn.addEventListener('click', function () {
        if (i !== _chapterIndex) {
          saveProgress();
          loadChapter(i);
          play();
        }
      });
      el.chList.appendChild(btn);
    });
  }

  function updateOverlayInfo() {
    if (!_audiobook) return;
    if (el.title) el.title.textContent = _audiobook.title || '';
    var cover = coverUrl(_audiobook);
    if (el.cover) {
      if (cover) {
        el.cover.src = cover;
        el.cover.style.display = '';
      } else {
        el.cover.style.display = 'none';
      }
    }
    updateChapterDisplay();
    if (el.speed) el.speed.textContent = _playbackRate.toFixed(1) + '\u00d7';
    if (el.volume) el.volume.value = _volume;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function open(audiobook) {
    if (!audiobook || !audiobook.chapters || !audiobook.chapters.length) {
      console.warn('[AB Overlay] No chapters in audiobook');
      return;
    }
    ensureEls();
    // Mutual exclusion: close in-reader audiobook player before standalone overlay starts
    try {
      if (window.booksReaderAudiobook && window.booksReaderAudiobook.isLoaded && window.booksReaderAudiobook.isLoaded()) {
        window.booksReaderAudiobook.closeAudiobook();
      }
    } catch (_) {}
    _audiobook = audiobook;
    _open = true;

    updateOverlayInfo();
    if (el.overlay) el.overlay.classList.remove('hidden');

    // Check for saved progress
    var resumeIndex = 0;
    var resumePos = 0;
    if (api) {
      api.audiobooks.getProgress(audiobook.id).then(function (prog) {
        if (prog && prog.chapterIndex != null) {
          resumeIndex = prog.chapterIndex;
          resumePos = prog.position || 0;
        }
        loadChapter(resumeIndex);
        if (resumePos > 0) {
          // Wait for metadata then seek
          var onMeta = function () {
            _audio.removeEventListener('loadedmetadata', onMeta);
            _audio.currentTime = resumePos;
            play();
          };
          _audio.addEventListener('loadedmetadata', onMeta);
        } else {
          play();
        }
      }).catch(function () {
        loadChapter(0);
        play();
      });
    } else {
      loadChapter(0);
      play();
    }
  }

  function close() {
    _open = false;
    if (_audio) {
      _audio.pause();
      saveProgress();
    }
    _playing = false;
    _audiobook = null;
    if (el.overlay) el.overlay.classList.add('hidden');
    if (el.chList) { el.chList.innerHTML = ''; _chaptersExpanded = false; }
    if (el.chList) el.chList.classList.add('hidden');
    // Clear MediaSession
    if (navigator.mediaSession) {
      try { navigator.mediaSession.metadata = null; } catch (_) {}
    }
  }

  // ── Bind events ────────────────────────────────────────────────────────────
  function bind() {
    ensureEls();
    if (!el.overlay) return;

    if (el.back) el.back.addEventListener('click', close);
    if (el.playPause) el.playPause.addEventListener('click', togglePlayPause);
    if (el.prevCh) el.prevCh.addEventListener('click', prevChapter);
    if (el.nextCh) el.nextCh.addEventListener('click', nextChapter);
    if (el.rew15) el.rew15.addEventListener('click', function () { seekRelative(-15); });
    if (el.fwd15) el.fwd15.addEventListener('click', function () { seekRelative(15); });
    if (el.slower) el.slower.addEventListener('click', function () { setRate(_playbackRate - 0.1); });
    if (el.faster) el.faster.addEventListener('click', function () { setRate(_playbackRate + 0.1); });

    // Volume slider
    if (el.volume) {
      el.volume.addEventListener('input', function () { setVolume(parseFloat(el.volume.value)); });
    }

    // Seek slider
    if (el.seek) {
      el.seek.addEventListener('mousedown', function () { _seekDragging = true; });
      el.seek.addEventListener('touchstart', function () { _seekDragging = true; }, { passive: true });
      el.seek.addEventListener('input', function () {
        if (el.timeLeft) el.timeLeft.textContent = fmt(parseFloat(el.seek.value));
      });
      el.seek.addEventListener('change', function () {
        _seekDragging = false;
        if (_audio) _audio.currentTime = parseFloat(el.seek.value);
      });
      el.seek.addEventListener('mouseup', function () { _seekDragging = false; });
      el.seek.addEventListener('touchend', function () { _seekDragging = false; });
    }

    // Chapter list toggle
    if (el.chToggle) {
      el.chToggle.addEventListener('click', function () {
        _chaptersExpanded = !_chaptersExpanded;
        if (el.chList) el.chList.classList.toggle('hidden', !_chaptersExpanded);
        el.chToggle.textContent = _chaptersExpanded ? 'Chapters \u25b2' : 'Chapters \u25bc';
      });
    }

    // Keyboard shortcuts when overlay is open
    document.addEventListener('keydown', function (e) {
      if (!_open) return;
      // Don't capture if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'j': case 'J':
          seekRelative(-15);
          break;
        case 'l': case 'L':
          seekRelative(15);
          break;
        case ',':
          prevChapter();
          break;
        case '.':
          nextChapter();
          break;
        case '+': case '=':
          setRate(_playbackRate + 0.1);
          break;
        case '-':
          setRate(_playbackRate - 0.1);
          break;
        case 'm': case 'M':
          if (_volume > 0) { _volume = 0; setVolume(0); }
          else setVolume(1);
          break;
        case 'Escape':
          close();
          break;
      }
    });
  }

  // ── beforeunload save ──────────────────────────────────────────────────────
  window.addEventListener('beforeunload', function () {
    if (_audiobook && _audio) saveProgress();
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  // Bind immediately — DOM is loaded by the time this script runs (deferred)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  window.booksAudiobookOverlay = {
    open: open,
    close: close,
    isOpen: function () { return _open; },
    getAudiobook: function () { return _audiobook; },
  };

})();
