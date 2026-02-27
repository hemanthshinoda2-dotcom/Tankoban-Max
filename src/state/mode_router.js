// Central mode routing for comics/videos/books/sources.
(function () {
  'use strict';

  const MODES = new Set(['comics', 'videos', 'books', 'sources']);

  window.Tanko = window.Tanko || {};
  const tanko = window.Tanko;

  const routerState = {
    mode: 'comics',
    handlers: new Map(),
    delegate: null,
  };

  function normalizeMode(mode) {
    const m = String(mode || '').toLowerCase();
    return MODES.has(m) ? m : 'comics';
  }

  function qs(id) {
    try { return document.getElementById(id); } catch { return null; }
  }

  function syncButtons(mode) {
    const m = normalizeMode(mode || routerState.mode);
    const comics = qs('modeComicsBtn');
    const videos = qs('modeVideosBtn');
    const books = qs('modeBooksBtn');
    const sources = qs('modeSourcesBtn');
    if (comics) comics.classList.toggle('active', m === 'comics');
    if (videos) videos.classList.toggle('active', m === 'videos');
    if (books) books.classList.toggle('active', m === 'books');
    if (sources) sources.classList.toggle('active', m === 'sources');
  }

  function applyFallbackViewState(mode) {
    const m = normalizeMode(mode);
    const isComics = m === 'comics';
    const isVideos = m === 'videos';
    const isBooks = m === 'books';
    const isSources = m === 'sources';

    const libraryView = qs('libraryView');
    const playerView = qs('playerView');
    const videoLibraryView = qs('videoLibraryView');
    const videoPlayerView = qs('videoPlayerView');
    const booksLibraryView = qs('booksLibraryView');
    const webLibraryView = qs('webLibraryView');

    if (libraryView) libraryView.classList.toggle('hidden', !isComics);
    if (playerView) playerView.classList.add('hidden');
    if (videoLibraryView) videoLibraryView.classList.toggle('hidden', !isVideos);
    if (videoPlayerView) videoPlayerView.classList.add('hidden');
    if (booksLibraryView) booksLibraryView.classList.toggle('hidden', !isBooks);
    if (webLibraryView) webLibraryView.classList.toggle('hidden', !isSources);
    document.body.classList.toggle('inVideoMode', isVideos);
    document.body.classList.toggle('inBooksMode', isBooks);
    document.body.classList.toggle('inComicsMode', isComics);
    document.body.classList.toggle('inSourcesMode', isSources);
    document.body.classList.remove('inPlayer');
    document.body.classList.remove('inVideoPlayer');

    try {
      if (window.Tanko && window.Tanko.ui && typeof window.Tanko.ui.setModeTheme === 'function') {
        window.Tanko.ui.setModeTheme(m);
      }
    } catch {}
  }

  async function ensureModeModules(mode) {
    const d = tanko.deferred || {};
    if (mode === 'videos' && typeof d.ensureVideoModulesLoaded === 'function') {
      await d.ensureVideoModulesLoaded();
    }
    if (mode === 'books' && typeof d.ensureBooksModulesLoaded === 'function') {
      await d.ensureBooksModulesLoaded();
    }
    if (mode === 'sources') {
      if (typeof d.ensureWebModulesLoadedLegacy === 'function') {
        await d.ensureWebModulesLoadedLegacy();
      } else if (typeof d.ensureWebModulesLoaded === 'function') {
        await d.ensureWebModulesLoaded();
      }
    }
  }

  async function setMode(next, opts = null) {
    const options = (opts && typeof opts === 'object') ? opts : {};
    const mode = normalizeMode(next);

    await ensureModeModules(mode);

    if (mode === routerState.mode && !options.force) {
      syncButtons(mode);
      return { ok: true, mode };
    }

    const previousMode = routerState.mode;
    routerState.mode = mode;

    // Always ensure correct view visibility before running handlers.
    // Handlers/delegates may do additional mode-specific work but should
    // not be solely responsible for toggling views.
    applyFallbackViewState(mode);

    try {
      if (typeof routerState.delegate === 'function') {
        await routerState.delegate(mode, { previousMode });
      }
    } catch (err) {
      console.error('[mode_router] delegate setMode failed:', err);
    }

    const h = routerState.handlers.get(mode);
    if (h && typeof h.setMode === 'function') {
      try {
        await h.setMode(mode, { previousMode });
      } catch (err) {
        console.error('[mode_router] handler setMode failed:', err);
      }
    }

    syncButtons(mode);
    return { ok: true, mode };
  }

  function registerModeHandler(mode, handler) {
    const m = normalizeMode(mode);
    const h = (handler && typeof handler === 'object') ? handler : {};
    routerState.handlers.set(m, h);
  }

  function setDelegate(fn) {
    routerState.delegate = (typeof fn === 'function') ? fn : null;
  }

  async function dispatchRefresh() {
    const m = routerState.mode;

    const h = routerState.handlers.get(m);
    if (h && typeof h.refresh === 'function') {
      await h.refresh();
      return true;
    }

    if (m === 'videos' && window.videoApp && typeof window.videoApp.refresh === 'function') {
      await window.videoApp.refresh();
      return true;
    }

    if (m === 'books' && window.booksApp && typeof window.booksApp.refresh === 'function') {
      await window.booksApp.refresh();
      return true;
    }

    return false;
  }

  async function dispatchBack() {
    const m = routerState.mode;

    const h = routerState.handlers.get(m);
    if (h && typeof h.back === 'function') {
      await h.back();
      return true;
    }

    if (m === 'videos' && window.videoApp && typeof window.videoApp.back === 'function') {
      await window.videoApp.back();
      return true;
    }

    if (m === 'books' && window.booksApp && typeof window.booksApp.back === 'function') {
      await window.booksApp.back();
      return true;
    }

    return false;
  }

  function getMode() {
    return routerState.mode;
  }

  tanko.modeRouter = {
    setMode,
    getMode,
    registerModeHandler,
    setDelegate,
    dispatchRefresh,
    dispatchBack,
    syncButtons,
  };

  // Global bridge used by deferred loader and existing code.
  window.setMode = (mode) => {
    setMode(mode).catch((err) => console.error('[mode_router] setMode failed:', err));
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      syncButtons(routerState.mode);
      applyFallbackViewState(routerState.mode);
    }, { once: true });
  } else {
    syncButtons(routerState.mode);
    applyFallbackViewState(routerState.mode);
  }
})();
