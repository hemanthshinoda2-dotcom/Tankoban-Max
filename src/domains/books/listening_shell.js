// LISTEN_P1/P2: Books sub-mode shell — Reading / Listening mode toggle + Listening library view
(function () {
  'use strict';

  if (window.__booksListeningShellBound) return;
  window.__booksListeningShellBound = true;

  var STORAGE_KEY = 'books_sub_mode';
  var MODE_READ = 'reading';
  var MODE_LISTEN = 'listening';

  var currentMode = MODE_READ;
  var listenViewDirty = true; // re-render on next activation
  var pendingListenBook = null; // LISTEN_P3: book queued to open in TTS player

  function qs(id) {
    try { return document.getElementById(id); } catch { return null; }
  }

  // ── Placeholder thumbnail ────────────────────────────────────────────────────

  function placeholderThumb(label) {
    var glyph = (String(label || '?').slice(0, 1).toUpperCase() || '?');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="460">'
      + '<defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0%" stop-color="#2a3d5c"/><stop offset="100%" stop-color="#4a2f3e"/>'
      + '</linearGradient></defs>'
      + '<rect width="300" height="460" fill="url(#lg)"/>'
      + '<text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" '
      + 'font-family="Segoe UI,sans-serif" font-size="148" fill="rgba(255,255,255,.82)">'
      + glyph + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // ── Mode toggle ──────────────────────────────────────────────────────────────

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

    if (isListen && listenViewDirty) renderListenView();
  }

  // ── Listening library rendering ──────────────────────────────────────────────

  function makeListenBookCard(book) {
    var booksApp = window.booksApp;
    var card = document.createElement('div');
    card.className = 'seriesCard listen-book-card';
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.title = book.title || 'Untitled';

    var coverWrap = document.createElement('div');
    coverWrap.className = 'seriesCoverWrap';
    var thumbWrap = document.createElement('div');
    thumbWrap.className = 'thumbWrap';
    var img = document.createElement('img');
    img.className = 'thumb';
    img.alt = '';
    img.src = placeholderThumb(book.title || '?');
    if (booksApp && typeof booksApp.attachThumb === 'function') {
      try { booksApp.attachThumb(img, book); } catch {}
    }
    thumbWrap.appendChild(img);

    // Listen badge overlay
    var badge = document.createElement('div');
    badge.className = 'listen-card-badge';
    badge.setAttribute('aria-hidden', 'true');
    // Play icon SVG
    badge.innerHTML = '<svg viewBox="0 0 16 18" xmlns="http://www.w3.org/2000/svg" width="12" height="12"><path d="M14.3 7.73L3.06.85A2.25 2.25 0 0 0 .69 2.17V15.94a2.25 2.25 0 0 0 3.43 1.92l11.26-6.87a2.25 2.25 0 0 0-.08-3.26z" fill="currentColor"/></svg>';
    thumbWrap.appendChild(badge);

    coverWrap.appendChild(thumbWrap);

    var name = document.createElement('div');
    name.className = 'seriesName';
    name.textContent = book.title || 'Untitled';

    var info = document.createElement('div');
    info.className = 'seriesInfo';
    var meta = document.createElement('div');
    meta.className = 'seriesMeta';
    var s1 = document.createElement('span');
    s1.textContent = String(book.format || '').toUpperCase() || 'BOOK';
    meta.appendChild(s1);
    info.appendChild(meta);

    card.appendChild(coverWrap);
    card.appendChild(name);
    card.appendChild(info);

    function launchListen() { openListenBook(book); }
    card.onclick = launchListen;
    card.onkeydown = function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launchListen(); }
    };

    card.addEventListener('contextmenu', function (e) {
      try {
        if (typeof window.showContextMenu === 'function') {
          window.showContextMenu({
            x: e.clientX,
            y: e.clientY,
            items: [
              { label: 'Listen to book', onClick: function () { openListenBook(book); } },
              { separator: true },
              { label: 'Open in Reading mode', onClick: function () {
                applyMode(MODE_READ);
                if (window.booksApp && typeof window.booksApp.openBook === 'function') {
                  window.booksApp.openBook(book).catch(function () {});
                }
              }},
            ],
          });
        }
      } catch {}
    });

    return card;
  }

  function renderListenGrid(books) {
    var grid = qs('booksListenGrid');
    var empty = qs('booksListenGridEmpty');
    if (!grid) return;
    grid.textContent = '';

    if (!books || !books.length) {
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    var CHUNK = 60;
    renderListenGrid._token = (renderListenGrid._token || 0) + 1;
    var t = renderListenGrid._token;

    function appendChunk(start) {
      if (t !== renderListenGrid._token) return;
      var frag = document.createDocumentFragment();
      var end = Math.min(start + CHUNK, books.length);
      for (var i = start; i < end; i++) frag.appendChild(makeListenBookCard(books[i]));
      grid.appendChild(frag);
      if (end >= books.length) return;
      if (typeof requestIdleCallback !== 'undefined') requestIdleCallback(function () { appendChunk(end); }, { timeout: 120 });
      else requestAnimationFrame(function () { appendChunk(end); });
    }
    appendChunk(0);
  }

  // ── LISTEN_P4: Continue Listening shelf ──────────────────────────────────────

  function makeContinueCard(book, entry) {
    var booksApp = window.booksApp;
    var card = document.createElement('div');
    card.className = 'seriesCard listen-book-card listen-continue-card';
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.title = (book && book.title) || entry.title || 'Untitled';

    // Cover thumbnail
    var coverWrap = document.createElement('div');
    coverWrap.className = 'seriesCoverWrap';
    var thumbWrap = document.createElement('div');
    thumbWrap.className = 'thumbWrap';
    var img = document.createElement('img');
    img.className = 'thumb';
    img.alt = '';
    img.src = placeholderThumb((book && book.title) || entry.title || '?');
    if (book && booksApp && typeof booksApp.attachThumb === 'function') {
      try { booksApp.attachThumb(img, book); } catch {}
    }
    thumbWrap.appendChild(img);

    // Play badge
    var badge = document.createElement('div');
    badge.className = 'listen-card-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.innerHTML = '<svg viewBox="0 0 16 18" xmlns="http://www.w3.org/2000/svg" width="12" height="12"><path d="M14.3 7.73L3.06.85A2.25 2.25 0 0 0 .69 2.17V15.94a2.25 2.25 0 0 0 3.43 1.92l11.26-6.87a2.25 2.25 0 0 0-.08-3.26z" fill="currentColor"/></svg>';
    thumbWrap.appendChild(badge);

    // Progress bar overlay at bottom of thumb
    var blockIdx   = Number(entry.blockIdx || 0);
    var blockCount = Number(entry.blockCount || 0);
    if (blockCount > 0) {
      var pct = Math.min(100, Math.round((blockIdx / blockCount) * 100));
      var bar = document.createElement('div');
      bar.className = 'listen-continue-bar';
      bar.setAttribute('aria-hidden', 'true');
      var fill = document.createElement('div');
      fill.className = 'listen-continue-bar-fill';
      fill.style.width = pct + '%';
      bar.appendChild(fill);
      thumbWrap.appendChild(bar);
    }

    coverWrap.appendChild(thumbWrap);

    var name = document.createElement('div');
    name.className = 'seriesName';
    name.textContent = (book && book.title) || entry.title || 'Untitled';

    var info = document.createElement('div');
    info.className = 'seriesInfo';
    var meta = document.createElement('div');
    meta.className = 'seriesMeta';
    var s1 = document.createElement('span');
    s1.textContent = String((book && book.format) || entry.format || '').toUpperCase() || 'BOOK';
    meta.appendChild(s1);
    if (blockCount > 0) {
      var pctEl = document.createElement('span');
      pctEl.className = 'listen-continue-pct';
      pctEl.textContent = Math.round((blockIdx / blockCount) * 100) + '%';
      meta.appendChild(pctEl);
    }
    info.appendChild(meta);

    card.appendChild(coverWrap);
    card.appendChild(name);
    card.appendChild(info);

    function launchListen() {
      var target = book || { id: entry.bookId, title: entry.title, format: entry.format };
      openListenBook(target);
    }
    card.onclick = launchListen;
    card.onkeydown = function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launchListen(); }
    };
    return card;
  }

  function renderListenContinue() {
    // LISTEN_P4: populate from books_tts_progress data
    var row = qs('booksListenContinueRow');
    var empty = qs('booksListenContinueEmpty');
    if (!row || !empty) return;

    var api = window.Tanko && window.Tanko.api;
    if (!api || typeof api.getAllBooksTtsProgress !== 'function') return;

    api.getAllBooksTtsProgress().then(function (result) {
      var byBook = (result && typeof result.byBook === 'object') ? result.byBook : {};
      var entries = [];
      for (var bookId in byBook) {
        if (!Object.prototype.hasOwnProperty.call(byBook, bookId)) continue;
        var e = byBook[bookId];
        if (!e || typeof e !== 'object') continue;
        // Only include books where progress was actually made
        if (!(e.blockIdx >= 0)) continue;
        entries.push({ bookId: bookId, blockIdx: e.blockIdx, blockCount: e.blockCount || 0,
          title: e.title || '', format: e.format || '', updatedAt: e.updatedAt || 0 });
      }
      // Sort by most recently updated
      entries.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
      entries = entries.slice(0, 10); // cap at 10

      row.innerHTML = '';
      if (!entries.length) {
        row.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
      }

      var booksApp = window.booksApp;
      var frag = document.createDocumentFragment();
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var book = (booksApp && typeof booksApp.getBookById === 'function')
          ? booksApp.getBookById(entry.bookId) : null;
        frag.appendChild(makeContinueCard(book, entry));
      }
      row.appendChild(frag);
      empty.classList.add('hidden');
      row.classList.remove('hidden');
    }).catch(function () {});
  }

  function renderListenView() {
    listenViewDirty = false;
    var booksApp = window.booksApp;
    var books = (booksApp && typeof booksApp.getBooks === 'function') ? booksApp.getBooks() : [];
    books = books.slice().sort(function (a, b) {
      return String(a.title || '').localeCompare(String(b.title || ''), undefined, { numeric: true, sensitivity: 'base' });
    });
    renderListenGrid(books);
    renderListenContinue();
  }

  // ── Open listen book (LISTEN_P3 will wire to TTS player) ────────────────────

  function openListenBook(book) {
    if (!book) return;
    pendingListenBook = book;
    applyMode(MODE_LISTEN);
    // LISTEN_P3: delegate to TTS player
    var player = window.booksListenPlayer;
    if (player && typeof player.open === 'function') {
      player.open(book);
    } else {
      try { console.warn('[listen] booksListenPlayer not ready yet'); } catch {}
    }
  }

  function openListenShow(showId) {
    applyMode(MODE_LISTEN);
    // LISTEN_P3: open TTS player scoped to first book of show
    try { console.log('[listen] openListenShow:', showId); } catch {}
  }

  // ── Bind ─────────────────────────────────────────────────────────────────────

  function bind() {
    var readBtn = qs('booksModeReadBtn');
    var listenBtn = qs('booksModeListenBtn');
    if (!readBtn || !listenBtn) return;

    readBtn.addEventListener('click', function () { applyMode(MODE_READ); });
    listenBtn.addEventListener('click', function () { applyMode(MODE_LISTEN); });

    // Re-render listen view when library data changes
    var tankoApi = window.Tanko && window.Tanko.api ? window.Tanko.api : null;
    if (tankoApi && typeof tankoApi.onBooksUpdated === 'function') {
      try {
        tankoApi.onBooksUpdated(function () {
          listenViewDirty = true;
          if (currentMode === MODE_LISTEN) renderListenView();
        });
      } catch {}
    }

    // Restore persisted mode
    var saved = '';
    try { saved = localStorage.getItem(STORAGE_KEY) || ''; } catch {}
    applyMode(saved === MODE_LISTEN ? MODE_LISTEN : MODE_READ);
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  window.booksListeningShell = {
    bind: bind,
    getMode: function () { return currentMode; },
    setMode: applyMode,
    openListenBook: openListenBook,
    openListenShow: openListenShow,
    renderListenView: renderListenView,
    getPendingListenBook: function () { return pendingListenBook; },
    clearPendingListenBook: function () { pendingListenBook = null; },
    MODE_READ: MODE_READ,
    MODE_LISTEN: MODE_LISTEN,
  };

  // Auto-bind after DOM ready (library.js has already run before us)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();
