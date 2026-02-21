// LISTEN_P1/P2: Books sub-mode shell — Reading / Listening mode toggle
// LISTEN_P2 REWORK: listen mode reuses the reading library view (1:1 replica).
// Book opens are intercepted via booksApp.setListenMode(true) → routes to TTS player.
// Continue shelf is replaced with TTS progress when in listen mode.
(function () {
  'use strict';

  if (window.__booksListeningShellBound) return;
  window.__booksListeningShellBound = true;

  var STORAGE_KEY = 'books_sub_mode';
  var MODE_READ = 'reading';
  var MODE_LISTEN = 'listening';

  var currentMode = MODE_READ;
  var pendingListenBook = null; // LISTEN_P3: book queued to open in TTS player

  function qs(id) {
    try { return document.getElementById(id); } catch { return null; }
  }

  // ── Mode toggle ──────────────────────────────────────────────────────────────

  function applyMode(mode) {
    // FIX-LISTEN-STAB2: close the listening player when switching away from listen mode.
    // Without this, TTS keeps playing in the background with no UI to control it.
    // skipModeRestore prevents closePlayer from re-applying listen mode after back().
    if (mode !== MODE_LISTEN) {
      var player = window.booksListenPlayer;
      if (player && typeof player.isOpen === 'function' && player.isOpen()) {
        try { player.close({ skipModeRestore: true }); } catch {}
      }
    }

    currentMode = mode;
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}

    var readBtn = qs('booksModeReadBtn');
    var listenBtn = qs('booksModeListenBtn');
    if (!readBtn || !listenBtn) return;

    var isListen = mode === MODE_LISTEN;

    readBtn.classList.toggle('active', !isListen);
    readBtn.setAttribute('aria-pressed', String(!isListen));
    listenBtn.classList.toggle('active', isListen);
    listenBtn.setAttribute('aria-pressed', String(isListen));

    // LISTEN_P2: update continue shelf title
    var titleEl = qs('booksContinueTitle');
    if (titleEl) titleEl.textContent = isListen ? 'Continue Listening...' : 'Continue Reading...';

    // LISTEN_P2: tell library.js to route book opens to TTS player
    var booksApp = window.booksApp;
    if (booksApp && typeof booksApp.setListenMode === 'function') {
      booksApp.setListenMode(isListen);
    }
  }

  // ── LISTEN_P4: Continue Listening shelf (renders into reading library's continue panel) ──

  function makeContinueCard(book, entry) {
    var booksApp = window.booksApp;
    // Use the same .contTile structure as the reading library for visual consistency
    var tile = document.createElement('div');
    tile.className = 'contTile';

    var cover = document.createElement('div');
    cover.className = 'contCover';

    var img = document.createElement('img');
    img.className = 'thumb contCoverImg';
    img.alt = '';
    var title = (book && book.title) || entry.title || 'Untitled';
    if (book && booksApp && typeof booksApp.attachThumb === 'function') {
      try { booksApp.attachThumb(img, book); } catch {}
    }
    cover.appendChild(img);

    // Remove button
    var remove = document.createElement('button');
    remove.className = 'contRemove';
    remove.title = 'Clear from Continue Listening';
    remove.textContent = 'X';
    remove.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      var api = window.Tanko && window.Tanko.api;
      if (api && typeof api.clearBooksTtsProgress === 'function') {
        api.clearBooksTtsProgress(entry.bookId).then(function () {
          // Re-render the shelf after clearing
          var app = window.booksApp;
          if (app && typeof app.setListenMode === 'function') app.setListenMode(true);
        }).catch(function () {});
      }
    };
    cover.appendChild(remove);

    // TTS progress bar overlay (replaces reading % badge)
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
      cover.appendChild(bar);
    }

    tile.appendChild(cover);

    var titleWrap = document.createElement('div');
    titleWrap.className = 'contTitleWrap';
    var titleEl = document.createElement('div');
    titleEl.className = 'contTileTitle u-clamp2';
    titleEl.title = title;
    titleEl.textContent = title;
    titleWrap.appendChild(titleEl);
    tile.appendChild(titleWrap);

    tile.onclick = function () {
      var target = book || { id: entry.bookId, path: entry.bookPath || entry.bookId || '', title: entry.title, format: entry.format };
      openListenBook(target);
    };

    return tile;
  }

  function renderListenContinue() {
    // LISTEN_P4: populate reading library's continue panel with TTS progress
    var continuePanel = qs('booksContinuePanel');
    var continueEmpty = qs('booksContinueEmpty');
    if (!continuePanel) return;

    var api = window.Tanko && window.Tanko.api;
    if (!api || typeof api.getAllBooksTtsProgress !== 'function') {
      continuePanel.classList.add('hidden');
      if (continueEmpty) continueEmpty.classList.remove('hidden');
      return;
    }

    api.getAllBooksTtsProgress().then(function (result) {
      var byBook = (result && typeof result.byBook === 'object') ? result.byBook : {};
      var entries = [];
      for (var bookId in byBook) {
        if (!Object.prototype.hasOwnProperty.call(byBook, bookId)) continue;
        var e = byBook[bookId];
        if (!e || typeof e !== 'object') continue;
        if (!(e.blockIdx >= 0)) continue;
        entries.push({ bookId: bookId, blockIdx: e.blockIdx, blockCount: e.blockCount || 0,
          title: e.title || '', format: e.format || '', updatedAt: e.updatedAt || 0 });
      }
      entries.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
      entries = entries.slice(0, 10);

      continuePanel.innerHTML = '';
      if (!entries.length) {
        continuePanel.classList.add('hidden');
        if (continueEmpty) continueEmpty.classList.remove('hidden');
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
      continuePanel.appendChild(frag);
      continuePanel.classList.remove('hidden');
      if (continueEmpty) continueEmpty.classList.add('hidden');
    }).catch(function (e) {
      // FIX-LISTEN-STAB: log errors instead of silently swallowing them
      try { console.error('[listen-shell] getAllBooksTtsProgress failed:', e); } catch {}
      if (continuePanel) continuePanel.classList.add('hidden');
      if (continueEmpty) continueEmpty.classList.remove('hidden');
    });
  }

  // ── Open listen book (LISTEN_P3: wired to TTS player) ───────────────────────

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
    renderListenContinue: renderListenContinue,
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
