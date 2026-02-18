// Deferred domain loader: keeps initial parse/compile footprint small.
(function () {
  'use strict';

  window.Tanko = window.Tanko || {};
  const tanko = window.Tanko;
  const perf = (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') ? performance : { now: () => Date.now() };

  if (!tanko.bootTiming) {
    tanko.bootTiming = {
      initialStartMs: perf.now(),
      initialBootDoneMs: null,
      videoFirstActivationMs: null,
      readerFirstActivationMs: null,
      booksFirstActivationMs: null,
      videoLoadMs: null,
      readerLoadMs: null,
      booksLoadMs: null,
    };
  }

  const scriptPromises = new Map();
  const loadedScripts = new Set();

  function loadScriptOnce(path) {
    if (loadedScripts.has(path)) return Promise.resolve();
    if (scriptPromises.has(path)) return scriptPromises.get(path);

    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = path;
      s.async = false;
      s.onload = () => {
        loadedScripts.add(path);
        resolve();
      };
      s.onerror = () => reject(new Error(`Failed to load script: ${path}`));
      document.body.appendChild(s);
    });

    scriptPromises.set(path, p);
    return p;
  }

  async function loadScriptChain(paths) {
    for (const path of paths) {
      await loadScriptOnce(path);
    }
  }

  // BUILD_PERF: parallel group loader — scripts in the same group have no
  // cross-dependencies, so they can download & execute concurrently.
  function loadScriptGroup(paths) {
    return Promise.all(paths.map(function (path) {
      if (loadedScripts.has(path)) return Promise.resolve();
      if (scriptPromises.has(path)) return scriptPromises.get(path);
      const p = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = path;
        // async defaults to true for dynamic scripts — parallel download+execute
        s.onload = () => { loadedScripts.add(path); resolve(); };
        s.onerror = () => reject(new Error(`Failed to load script: ${path}`));
        document.body.appendChild(s);
      });
      scriptPromises.set(path, p);
      return p;
    }));
  }

  let videoModulesPromise = null;
  async function ensureVideoModulesLoaded() {
    if (window.__tankoVideoModulesLoaded) return;
    if (!videoModulesPromise) {
      videoModulesPromise = (async () => {
        const activationStart = perf.now();
        await loadScriptChain([
          './domains/video/video_utils.js',
          './domains/video/build14_state.js',
          './domains/video/video.js',
        ]);
        window.__tankoVideoModulesLoaded = true;

        const elapsed = Math.round(perf.now() - activationStart);
        tanko.bootTiming.videoLoadMs = elapsed;
        if (tanko.bootTiming.videoFirstActivationMs == null) {
          tanko.bootTiming.videoFirstActivationMs = Math.round(perf.now() - tanko.bootTiming.initialStartMs);
          console.log(`[boot-timing] first video activation at ${tanko.bootTiming.videoFirstActivationMs}ms (domain load ${elapsed}ms)`);
        }
      })();
    }
    return videoModulesPromise;
  }

  let readerModulesPromise = null;
  async function ensureReaderModulesLoaded() {
    if (window.__tankoReaderModulesLoaded) return;
    if (!readerModulesPromise) {
      readerModulesPromise = (async () => {
        const activationStart = perf.now();
        await loadScriptChain([
          './domains/reader/open.js',
          './domains/reader/bitmaps.js',
          './domains/reader/render_portrait.js',
          './domains/reader/render_two_page.js',
          './domains/reader/render_core.js',
          './domains/reader/state_machine.js',
          './domains/reader/hud_core.js',
          './domains/reader/mega_settings.js',
          './domains/reader/volume_nav_overlay.js',
          './domains/reader/input_pointer.js',
          './domains/reader/input_keyboard.js',
          './domains/reader/boot.js',
        ]);
        window.__tankoReaderModulesLoaded = true;

        const elapsed = Math.round(perf.now() - activationStart);
        tanko.bootTiming.readerLoadMs = elapsed;
        if (tanko.bootTiming.readerFirstActivationMs == null) {
          tanko.bootTiming.readerFirstActivationMs = Math.round(perf.now() - tanko.bootTiming.initialStartMs);
          console.log(`[boot-timing] first reader activation at ${tanko.bootTiming.readerFirstActivationMs}ms (domain load ${elapsed}ms)`);
        }
      })();
    }
    return readerModulesPromise;
  }

  let booksModulesPromise = null;
  async function ensureBooksModulesLoaded() {
    if (window.__tankoBooksModulesLoaded) return;
    if (!booksModulesPromise) {
      booksModulesPromise = (async () => {
        const activationStart = perf.now();

        // BUILD_PERF: parallel loading groups — modules within each group
        // have no cross-deps, so they download+execute concurrently.
        // Group 1: engines + TTS engine + event bus (all independent)
        // FIX-TTS05: webspeech removed — Edge or nothing
        await loadScriptGroup([
          './domains/books/reader/engine_epub.js',
          './domains/books/reader/engine_pdf.js',
          './domains/books/reader/engine_foliate.js',
          './domains/books/reader/engine_txt.js',
          './domains/books/reader/tts_engine_edge.js',
          './domains/books/reader/reader_bus.js',
        ]);
        // Group 2: state + TTS core (need bus + engine registrations)
        await loadScriptGroup([
          './domains/books/reader/reader_state.js',
          './domains/books/reader/tts_core.js',
        ]);
        // Group 3: all reader modules (need state + bus, no cross-deps)
        await loadScriptGroup([
          './domains/books/reader/reader_appearance.js',
          './domains/books/reader/reader_dict.js',
          './domains/books/reader/reader_search.js',
          './domains/books/reader/reader_bookmarks.js',
          './domains/books/reader/reader_annotations.js',
          './domains/books/reader/reader_toc.js',
          './domains/books/reader/reader_nav.js',
          './domains/books/reader/reader_sidebar.js',
          './domains/books/reader/reader_overlays.js',
          './domains/books/reader/reader_tts_ui.js',
          './domains/books/reader/reader_keyboard.js',
        ]);
        // Group 4-5: orchestrator then library (sequential, order matters)
        await loadScriptOnce('./domains/books/reader/reader_core.js');
        await loadScriptOnce('./domains/books/library.js');

        window.__tankoBooksModulesLoaded = true;

        const elapsed = Math.round(perf.now() - activationStart);
        tanko.bootTiming.booksLoadMs = elapsed;
        if (tanko.bootTiming.booksFirstActivationMs == null) {
          tanko.bootTiming.booksFirstActivationMs = Math.round(perf.now() - tanko.bootTiming.initialStartMs);
          console.log(`[boot-timing] first books activation at ${tanko.bootTiming.booksFirstActivationMs}ms (domain load ${elapsed}ms)`);
        }
      })();
    }
    return booksModulesPromise;
  }

  tanko.deferred = tanko.deferred || {};
  tanko.deferred.ensureVideoModulesLoaded = ensureVideoModulesLoaded;
  tanko.deferred.ensureReaderModulesLoaded = ensureReaderModulesLoaded;
  tanko.deferred.ensureBooksModulesLoaded = ensureBooksModulesLoaded;

  // Reader open entry point wrapper. After reader modules load, open.js replaces window.openBook.
  if (!window.__tankoOpenBookDeferredBound) {
    window.__tankoOpenBookDeferredBound = true;
    window.openBook = async function deferredOpenBook(book) {
      const before = window.openBook;
      await ensureReaderModulesLoaded();
      const impl = window.openBook;
      if (typeof impl === 'function' && impl !== before) return impl(book);
      throw new Error('Reader module did not register openBook');
    };
  }

  function bindDeferredModeButtons() {
    if (window.__tankoDeferredModeButtonsBound) return;
    window.__tankoDeferredModeButtonsBound = true;

    const comicsBtn = document.getElementById('modeComicsBtn');
    const booksBtn = document.getElementById('modeBooksBtn');
    const videosBtn = document.getElementById('modeVideosBtn');

    videosBtn?.addEventListener('click', async (e) => {
      try {
        e.preventDefault();
        e.stopImmediatePropagation();
      } catch {}
      await ensureVideoModulesLoaded();
      if (typeof window.setMode === 'function') window.setMode('videos');
    });

    comicsBtn?.addEventListener('click', async (e) => {
      try {
        e.preventDefault();
        e.stopImmediatePropagation();
      } catch {}
      if (typeof window.setMode === 'function') window.setMode('comics');
    });

    booksBtn?.addEventListener('click', async (e) => {
      try {
        e.preventDefault();
        e.stopImmediatePropagation();
      } catch {}
      await ensureBooksModulesLoaded();
      if (typeof window.setMode === 'function') window.setMode('books');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindDeferredModeButtons, { once: true });
  } else {
    bindDeferredModeButtons();
  }
})();
