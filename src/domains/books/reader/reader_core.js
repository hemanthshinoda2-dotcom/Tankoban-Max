// BUILD_OVERHAUL: Core orchestrator — open/close lifecycle, module wiring
(function () {
  'use strict';

  var RS = window.booksReaderState;
  var bus = window.booksReaderBus;
  var hudHideTimer = null;
  var isReadingAction = false;   // TASK2: suppress HUD during scroll/page-turn
  var REVEAL_ZONE = 48; // FIX_HUD: top/bottom edge zone in px that triggers HUD

  // ── Module registry ──────────────────────────────────────────

  var modules = [
    window.booksReaderOverlays,
    window.booksReaderAppearance,
    window.booksReaderDict,
    window.booksReaderSearch,
    window.booksReaderBookmarks,
    window.booksReaderAnnotations,
    window.booksReaderToc,
    window.booksReaderNav,
    window.booksReaderSidebar,
    window.booksReaderTtsUI,
    window.booksReaderKeyboard,
  ];

  // ── Show / hide reader view ──────────────────────────────────

  function showReader(show) {
    var els = RS.ensureEls();
    if (!els.readerView) return;
    els.readerView.classList.toggle('hidden', !show);
    document.body.classList.toggle('inBooksReader', !!show);
    if (!show && els.readerView) {
      els.readerView.classList.remove('br-hud-hidden');
    }
  }

  // ── HUD auto-hide ────────────────────────────────────────────

  function shouldKeepHudVisible() {
    var els = RS.ensureEls();
    var OV = window.booksReaderOverlays;
    if (OV && OV.isOpen && OV.isOpen()) return true;
    if (els.gotoOverlay && !els.gotoOverlay.classList.contains('hidden')) return true;
    if (els.chapterTransition && !els.chapterTransition.classList.contains('hidden')) return true;
    if (els.annotPopup && !els.annotPopup.classList.contains('hidden')) return true;
    if (els.dictPopup && !els.dictPopup.classList.contains('hidden')) return true;
    if (els.ttsDiag && !els.ttsDiag.classList.contains('hidden')) return true;
    if (els.ttsMega && !els.ttsMega.classList.contains('hidden')) return true;
    return false;
  }

  function setHudVisible(visible) {
    var els = RS.ensureEls();
    if (!els.readerView) return;
    // FIX_HUD: don't show toolbar/footer while sidebar is open — it overlaps sidebar tabs
    if (visible && RS.state.sidebarOpen) return;
    els.readerView.classList.toggle('br-hud-hidden', !visible);
  }

  function scheduleHudAutoHide() {
    if (hudHideTimer) clearTimeout(hudHideTimer);
    if (!RS.state.open) return;
    hudHideTimer = setTimeout(function () {
      if (!RS.state.open) return;
      if (shouldKeepHudVisible()) {
        scheduleHudAutoHide();
        return;
      }
      // FIX_AUDIT: hide HUD automatically after 3 seconds of inactivity.
      setHudVisible(false);
    }, 3000);
  }

  function onAnyUserActivity() {
    if (!RS.state.open) return;
    setHudVisible(true);
    scheduleHudAutoHide();
    bus.emit('reader:user-activity');
  }

  // TASK2: reading actions (scroll, page-turn) hide the HUD instead of showing it
  function onReadingAction() {
    if (!RS.state.open) return;
    if (shouldKeepHudVisible()) return;
    isReadingAction = true;
    setHudVisible(false);
    if (hudHideTimer) { clearTimeout(hudHideTimer); hudHideTimer = null; }
  }

  function _activityClientY(e) {
    if (!e) return NaN;
    var y = Number.NaN;
    try {
      if (Number.isFinite(Number(e.clientY))) {
        y = Number(e.clientY);
      } else if (e.touches && e.touches[0] && Number.isFinite(Number(e.touches[0].clientY))) {
        y = Number(e.touches[0].clientY);
      } else if (e.changedTouches && e.changedTouches[0] && Number.isFinite(Number(e.changedTouches[0].clientY))) {
        y = Number(e.changedTouches[0].clientY);
      }
    } catch (err) {}
    if (!Number.isFinite(y)) return Number.NaN;
    try {
      var v = e.view || (e.target && e.target.ownerDocument && e.target.ownerDocument.defaultView) || null;
      var frame = v && v.frameElement;
      if (frame && typeof frame.getBoundingClientRect === 'function') {
        var fr = frame.getBoundingClientRect();
        y = fr.top + y;
      }
    } catch (err2) {}
    return y;
  }

  function _activityClientX(e) {
    if (!e) return Number.NaN;
    var x = Number.NaN;
    try {
      if (Number.isFinite(Number(e.clientX))) {
        x = Number(e.clientX);
      } else if (e.touches && e.touches[0] && Number.isFinite(Number(e.touches[0].clientX))) {
        x = Number(e.touches[0].clientX);
      } else if (e.changedTouches && e.changedTouches[0] && Number.isFinite(Number(e.changedTouches[0].clientX))) {
        x = Number(e.changedTouches[0].clientX);
      }
    } catch (err) {}
    if (!Number.isFinite(x)) return Number.NaN;
    try {
      var v = e.view || (e.target && e.target.ownerDocument && e.target.ownerDocument.defaultView) || null;
      var frame = v && v.frameElement;
      if (frame && typeof frame.getBoundingClientRect === 'function') {
        var fr = frame.getBoundingClientRect();
        x = fr.left + x;
      }
    } catch (err2) {}
    return x;
  }

  function _isRevealZonePoint(clientX, clientY) {
    var els = RS.ensureEls();
    if (!els.readerView || !Number.isFinite(Number(clientY))) return false;
    var rect = els.readerView.getBoundingClientRect();
    if (Number.isFinite(Number(clientX))) {
      if (Number(clientX) < rect.left || Number(clientX) > rect.right) return false;
    }
    if (Number(clientY) < rect.top || Number(clientY) > rect.bottom) return false;
    var localY = Number(clientY) - rect.top;
    var inTopZone = localY < REVEAL_ZONE;
    var inBottomZone = localY > (rect.height - REVEAL_ZONE);
    // Don't trigger HUD from bottom zone when TTS bar is visible
    if (inBottomZone && els.ttsBar && !els.ttsBar.classList.contains('hidden')) {
      return false;
    }
    return !!(inTopZone || inBottomZone);
  }

  function onEngineUserActivity(e) {
    if (!RS.state.open) return;
    // FIX_HUD: click/tap inside reading content closes sidebar
    if (RS.state.sidebarOpen && e && e.type === 'pointerdown') {
      bus.emit('sidebar:close');
      return;
    }
    var els = RS.ensureEls();
    if (!els.readerView) return;
    var hidden = els.readerView.classList.contains('br-hud-hidden');
    if (!hidden) {
      // While HUD is visible, any activity should reset inactivity timer.
      onAnyUserActivity();
      return;
    }
    // When hidden, only edge-zone motion reveals HUD.
    var x = _activityClientX(e);
    var y = _activityClientY(e);
    if (_isRevealZonePoint(x, y)) onAnyUserActivity();
    else bus.emit('reader:user-activity');
  }

  // FIX_HUD: show HUD only on top/bottom edge when hidden; otherwise keep-alive on movement
  function onMouseActivity(e) {
    if (!RS.state.open) return;
    if (isReadingAction) { isReadingAction = false; }
    var els = RS.ensureEls();
    if (!els.readerView) return;
    var hidden = els.readerView.classList.contains('br-hud-hidden');
    if (!hidden) {
      onAnyUserActivity();
      return;
    }
    if (_isRevealZonePoint(e && e.clientX, e && e.clientY)) onAnyUserActivity();
    else bus.emit('reader:user-activity');
  }

  // ── Fullscreen ───────────────────────────────────────────────

  async function toggleReaderFullscreen() {
    try { await Tanko.api.window.toggleFullscreen(); } catch (e) {}
  }

  // ── Destroy engine ───────────────────────────────────────────

  async function destroyCurrentEngine() {
    var state = RS.state;
    if (!state.engine) return;
    try {
      if (typeof state.engine.destroy === 'function') await state.engine.destroy();
    } catch (e) {}
    state.engine = null;
  }

  // ── Close ────────────────────────────────────────────────────

  async function close(opts) {
    var options = (opts && typeof opts === 'object') ? opts : {};
    var save = options.save !== false;
    var state = RS.state;
    var wasActive = !!state.open || !!state.opening || !!state.engine;

    if (!wasActive) {
      showReader(false);
      bus.emit('appearance:sync');
      return false;
    }

    // Notify modules before cleanup
    for (var i = 0; i < modules.length; i++) {
      if (modules[i] && typeof modules[i].onClose === 'function') {
        try { modules[i].onClose(); } catch (e) {}
      }
    }

    if (save && state.open) {
      try { await RS.saveProgress(); } catch (e) {}
    }

    await destroyCurrentEngine();

    state.open = false;
    state.opening = false;
    state.book = null;
    state.hudDragProgress = false;
    state.searchHits = [];
    state.searchActiveIndex = -1;
    state.tocItems = [];
    state.bookmarks = [];
    state.annotations = [];
    if (hudHideTimer) { clearTimeout(hudHideTimer); hudHideTimer = null; }

    var els = RS.ensureEls();
    if (els.host) els.host.innerHTML = '';
    RS.hideErrorBanner();
    RS.setStatus('');
    showReader(false);
    bus.emit('appearance:sync');
    // BUILD_OVERHAUL: clear cached DOM refs between sessions
    state.els = null;

    try {
      if (options.silent !== true) {
        window.dispatchEvent(new CustomEvent('books-reader-closed'));
      }
    } catch (e) {}
    return true;
  }

  // ── Open ─────────────────────────────────────────────────────

  async function open(bookInput) {
    var book = RS.normalizeBookInput(bookInput);
    if (!book) throw new Error('invalid_book');

    var engines = window.booksReaderEngines || {};
    var candidates = RS.getEngineCandidates(book.format, engines);
    if (!candidates.length) {
      throw new Error('unsupported_format_' + book.format);
    }

    var els = RS.ensureEls();
    var state = RS.state;
    if (!els.host) throw new Error('reader_host_missing');

    await RS.loadSettings();
    await close({ save: false, silent: true });

    state.book = book;
    state.opening = true;
    state.lastError = '';
    state.lastBookInput = bookInput;
    RS.hideErrorBanner();
    state.engine = null;

    var progress = null;
    try { progress = await Tanko.api.booksProgress.get(book.id); } catch (e) {}

    if (els.title) {
      var fallbackTitle = String(book.path || '').split(/[\\/]/).pop() || 'Book';
      els.title.textContent = book.title || fallbackTitle;
    }
    RS.setStatus('Opening ' + book.format.toUpperCase() + '...', true);

    // Restore shortcuts
    try {
      var uiRes = await Tanko.api.booksUi.get();
      if (uiRes && uiRes.ui && uiRes.ui.shortcuts && typeof uiRes.ui.shortcuts === 'object') {
        Object.assign(state.shortcuts, uiRes.ui.shortcuts);
      }
    } catch (e) {}

    showReader(true);
    bus.emit('appearance:sync');

    try {
      var usedEngineId = '';
      var openErrors = [];
      var handleDictLookup = function (selectedText, ev) {
        var text = String(selectedText || '').trim();
        if (!text) {
          try {
            if (state.engine && typeof state.engine.getSelectedText === 'function') {
              text = String(state.engine.getSelectedText() || '').trim();
            }
          } catch (e2) {}
        }
        if (text) state._dictPendingWord = text;
        var Dict = window.booksReaderDict;
        if (Dict && typeof Dict.triggerDictLookupFromText === 'function') {
          try { Dict.triggerDictLookupFromText(text, ev); return; } catch (e3) {}
        }
        bus.emit('dict:lookup');
      };
      for (var i = 0; i < candidates.length; i++) {
        var candidate = candidates[i];
        try {
          state.engine = candidate.factory.create({
            filesRead: function (filePath) { return Tanko.api.files.read(filePath); },
            // Engine activity now feeds HUD keep-alive/edge-reveal logic.
            onUserActivity: function (ev) { onEngineUserActivity(ev); },
            onReadingAction: function () { onReadingAction(); }, // TASK2
            onDictLookup: function (selectedText, ev) { handleDictLookup(selectedText, ev); },
          });

          await state.engine.open({
            book: book,
            host: els.host,
            locator: progress && progress.locator ? progress.locator : null,
            settings: Object.assign({}, state.settings),
          });
          usedEngineId = String(candidate.id || '');
          break;
        } catch (errOpen) {
          openErrors.push({ engineId: String(candidate.id || ''), err: errOpen });
          try { await destroyCurrentEngine(); } catch (e) {}
          state.engine = null;
        }
      }
      if (!state.engine) {
        var last = openErrors.length ? openErrors[openErrors.length - 1] : null;
        if (last && last.err) throw last.err;
        throw new Error('open_failed_' + book.format);
      }

      state.open = true;
      state.opening = false;
      setHudVisible(true);
      scheduleHudAutoHide();

      // Apply column mode on open
      var Appearance = window.booksReaderAppearance;
      if (Appearance) {
        Appearance.applySettings();
      }
      if (state.engine && typeof state.engine.setColumnMode === 'function') {
        state.engine.setColumnMode(state.settings.columnMode || 'auto');
      }

      // BUILD_OVERHAUL: wire iframe callbacks (annotation first, dictionary fallback)
      try {
        // FIX_DICT: text is captured at the iframe event source for reliable access
        state.engine.onDblClick = function (selectedText, ev) { handleDictLookup(selectedText, ev); };
        state.engine.onContextMenu = function (ev, selectedText) {
          if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
          handleDictLookup(selectedText, ev);
        };
      } catch (e) {}

      // Notify modules
      for (var m = 0; m < modules.length; m++) {
        if (modules[m] && typeof modules[m].onOpen === 'function') {
          try { modules[m].onOpen(); } catch (e) {}
        }
      }

      if (usedEngineId === 'epub_legacy' || usedEngineId === 'pdf_legacy') {
        RS.setStatus('Compatibility engine active', false);
      } else {
        RS.setStatus('');
      }

      try {
        window.dispatchEvent(new CustomEvent('books-reader-opened', { detail: { bookId: book.id } }));
      } catch (e) {}
      return true;
    } catch (err) {
      var msg = RS.cleanErrMessage(err, 'Failed to open ' + book.format.toUpperCase());
      state.lastError = msg;
      try { console.error('[books-reader] open failed:', err); } catch (e) {}

      await destroyCurrentEngine();
      state.open = false;
      state.opening = false;
      state.book = null;

      var fileName = String(bookInput && bookInput.path || '').split(/[\\/]/).pop() || '';
      RS.showErrorBanner('Unable to open book', fileName ? (msg + ' \u2014 ' + fileName) : msg);
      RS.setStatus('');
      bus.emit('appearance:sync');

      try {
        window.dispatchEvent(new CustomEvent('books-reader-error', {
          detail: { bookId: book.id, format: book.format, message: msg },
        }));
      } catch (e) {}
      throw new Error(msg);
    }
  }

  // ── Bind ─────────────────────────────────────────────────────

  function bind() {
    var els = RS.ensureEls();

    // Back / close buttons
    els.backBtn && els.backBtn.addEventListener('click', function () { close().catch(function () {}); });
    els.closeBtn && els.closeBtn.addEventListener('click', function () { close().catch(function () {}); });

    // Error banner actions
    els.errorRetry && els.errorRetry.addEventListener('click', function () {
      var state = RS.state;
      if (state.lastBookInput) open(state.lastBookInput).catch(function () {});
    });
    els.errorClose && els.errorClose.addEventListener('click', function () {
      RS.hideErrorBanner();
      close().catch(function () {});
    });

    // Fullscreen button
    els.fsBtn && els.fsBtn.addEventListener('click', function () { toggleReaderFullscreen().catch(function () {}); });
    // BUILD_OVERHAUL: host-level dict/annot handlers live in dedicated modules

    // Bus events
    bus.on('reader:close', function () { close().catch(function () {}); });
    bus.on('reader:fullscreen', function () { toggleReaderFullscreen().catch(function () {}); });
    bus.on('reader:relocated', function () { onReadingAction(); }); // TASK2
    bus.on('reader:tts-state', function (status) {
      if (status === 'playing') scheduleHudAutoHide();
    });
    // FIX_HUD: hide toolbar when sidebar opens, restore when it closes
    bus.on('sidebar:toggled', function (isOpen) {
      if (isOpen) {
        setHudVisible(false);
        if (hudHideTimer) { clearTimeout(hudHideTimer); hudHideTimer = null; }
      } else {
        setHudVisible(true);
        scheduleHudAutoHide();
      }
    });

    if (els.readerView) {
      // FIX_HUD: only significant mouse movement triggers HUD show.
      // pointerdown / keydown / wheel / touchstart / scroll do NOT show HUD —
      // after auto-hide, reading actions keep HUD hidden until the user moves the mouse.
      els.readerView.addEventListener('mousemove', onMouseActivity, { passive: true });
      // Mouse movement inside reader iframes may not bubble to readerView; capture at document level too.
      document.addEventListener('mousemove', onMouseActivity, { passive: true, capture: true });
    }

    // Bind all sub-modules
    for (var i = 0; i < modules.length; i++) {
      if (modules[i] && typeof modules[i].bind === 'function') {
        try { modules[i].bind(); } catch (e) {}
      }
    }
  }

  // ── Initialize ───────────────────────────────────────────────

  bind();

  // ── Export (backwards-compatible API) ────────────────────────

  window.booksReaderController = {
    open: open,
    close: close,
    isOpen: function () { return !!RS.state.open; },
    isBusy: function () { return !!RS.state.opening; },
    getLastError: function () { return String(RS.state.lastError || ''); },
    saveProgress: RS.saveProgress,
    renderToc: function () {
      var Toc = window.booksReaderToc;
      if (Toc && typeof Toc.renderToc === 'function') return Toc.renderToc();
    },
  };
})();
