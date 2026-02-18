// LISTEN_P1: Books sub-mode shell — manages Reading / Listening mode toggle
(function () {
  'use strict';

  if (window.__booksListeningShellBound) return;
  window.__booksListeningShellBound = true;

  var STORAGE_KEY = 'books_sub_mode';
  var MODE_READ = 'reading';
  var MODE_LISTEN = 'listening';

  var currentMode = MODE_READ;

  function qs(id) {
    try { return document.getElementById(id); } catch { return null; }
  }

  function applyMode(mode) {
    currentMode = mode;
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}

    var readBtn = qs('booksModeReadBtn');
    var listenBtn = qs('booksModeListenBtn');
    var readingContent = qs('booksReadingContent');
    var listenView = qs('booksListenView');

    if (!readBtn || !listenBtn) return;

    var isListen = mode === MODE_LISTEN;

    readBtn.classList.toggle('active', !isListen);
    readBtn.setAttribute('aria-pressed', String(!isListen));
    listenBtn.classList.toggle('active', isListen);
    listenBtn.setAttribute('aria-pressed', String(isListen));

    if (readingContent) readingContent.classList.toggle('hidden', isListen);
    if (listenView) listenView.classList.toggle('hidden', !isListen);
  }

  function bind() {
    var readBtn = qs('booksModeReadBtn');
    var listenBtn = qs('booksModeListenBtn');
    if (!readBtn || !listenBtn) return;

    readBtn.addEventListener('click', function () { applyMode(MODE_READ); });
    listenBtn.addEventListener('click', function () { applyMode(MODE_LISTEN); });

    // Restore persisted mode
    var saved = '';
    try { saved = localStorage.getItem(STORAGE_KEY) || ''; } catch {}
    applyMode(saved === MODE_LISTEN ? MODE_LISTEN : MODE_READ);
  }

  window.booksListeningShell = {
    bind: bind,
    getMode: function () { return currentMode; },
    setMode: applyMode,
    MODE_READ: MODE_READ,
    MODE_LISTEN: MODE_LISTEN,
  };

  // Auto-bind after DOMContentLoaded (library.js loads before us; DOM is ready)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();
