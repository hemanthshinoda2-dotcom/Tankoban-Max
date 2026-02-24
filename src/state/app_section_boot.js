// Standalone section boot router.
// Reads ?appSection=... and activates the requested section after base boot.
(function appSectionBoot() {
  'use strict';

  const SECTION_ALIASES = {
    comics: 'comic',
    'comic-reader': 'comic',
    reader: 'comic',
    books: 'book',
    'book-reader': 'book',
    audiobooks: 'audiobook',
    'audiobook-reader': 'audiobook',
    videos: 'video',
    'video-player': 'video',
    web: 'browser',
    'web-browser': 'browser',
  };

  function normalizeSection(raw) {
    const key = String(raw || '').trim().toLowerCase();
    if (!key) return '';
    const mapped = SECTION_ALIASES[key] || key;
    if (
      mapped === 'shell' ||
      mapped === 'library' ||
      mapped === 'comic' ||
      mapped === 'book' ||
      mapped === 'audiobook' ||
      mapped === 'video' ||
      mapped === 'browser' ||
      mapped === 'torrent'
    ) return mapped;
    return '';
  }

  function readSectionFromQuery() {
    try {
      const params = new URLSearchParams((window.location && window.location.search) || '');
      return normalizeSection(params.get('appSection') || params.get('app') || params.get('section'));
    } catch (_err) {
      return '';
    }
  }

  function getModeRouter() {
    try {
      return window.Tanko && window.Tanko.modeRouter ? window.Tanko.modeRouter : null;
    } catch (_err) {
      return null;
    }
  }

  async function setMode(mode) {
    const router = getModeRouter();
    if (router && typeof router.setMode === 'function') {
      await router.setMode(mode);
      return;
    }
    if (typeof window.setMode === 'function') {
      window.setMode(mode);
    }
  }

  async function ensureVideoModulesLoaded() {
    const d = window.Tanko && window.Tanko.deferred;
    if (d && typeof d.ensureVideoModulesLoaded === 'function') {
      await d.ensureVideoModulesLoaded();
    }
  }

  async function ensureBooksModulesLoaded() {
    const d = window.Tanko && window.Tanko.deferred;
    if (d && typeof d.ensureBooksModulesLoaded === 'function') {
      await d.ensureBooksModulesLoaded();
    }
  }

  async function ensureWebModulesLoaded() {
    const d = window.Tanko && window.Tanko.deferred;
    if (d && typeof d.ensureWebModulesLoaded === 'function') {
      await d.ensureWebModulesLoaded();
    }
  }

  async function openBrowserWorkspace(opts) {
    const options = (opts && typeof opts === 'object') ? opts : {};
    await setMode('comics');
    await ensureWebModulesLoaded();

    const web = window.Tanko && window.Tanko.web;
    if (!web) return;

    if (options.openTorrentWorkspace && typeof web.openTorrentWorkspace === 'function') {
      web.openTorrentWorkspace();
      return;
    }

    if (typeof web.openDefault === 'function') {
      web.openDefault();
      return;
    }

    if (typeof web.openHome === 'function') {
      web.openHome();
      return;
    }

    if (typeof web.openBrowser === 'function') {
      web.openBrowser(null);
    }
  }

  async function applySectionBoot(section) {
    switch (section) {
      case 'library':
      case 'comic':
        await setMode('comics');
        return;
      case 'book':
        await ensureBooksModulesLoaded();
        await setMode('books');
        return;
      case 'audiobook':
        await ensureBooksModulesLoaded();
        await setMode('books');
        try {
          if (window.booksApp && typeof window.booksApp.refreshAudiobookState === 'function') {
            await window.booksApp.refreshAudiobookState();
          }
        } catch (_err) {}
        return;
      case 'video':
        await ensureVideoModulesLoaded();
        await setMode('videos');
        return;
      case 'browser':
        await openBrowserWorkspace({ openTorrentWorkspace: false });
        return;
      case 'torrent':
        await openBrowserWorkspace({ openTorrentWorkspace: true });
        return;
      default:
        await setMode('comics');
    }
  }

  const appSection = readSectionFromQuery();
  if (!appSection || appSection === 'shell') return;

  window.Tanko = window.Tanko || {};
  window.Tanko.appSection = appSection;
  window.Tanko.isStandaloneSectionBoot = true;

  function boot() {
    setTimeout(function () {
      applySectionBoot(appSection).catch(function (err) {
        try { console.error('[app_section_boot] failed:', err); } catch (_err) {}
      });
    }, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

