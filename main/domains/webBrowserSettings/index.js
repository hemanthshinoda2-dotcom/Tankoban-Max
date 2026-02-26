// Web browser settings persistence.

const SETTINGS_FILE = 'web_browser_settings.json';
const ALLOWED_SEARCH_ENGINES = new Set(['yandex', 'google', 'duckduckgo', 'bing', 'brave']);
const ALLOWED_STARTUP_MODES = new Set(['continue', 'new_tab', 'custom_url']);
const ALLOWED_NEW_TAB_BEHAVIORS = new Set(['tankoban_home', 'browser_home', 'blank']);
const ALLOWED_DOWNLOAD_BEHAVIORS = new Set(['ask', 'auto']);
const DEFAULT_SETTINGS = {
  defaultSearchEngine: 'yandex',
  parityV1Enabled: true,
  adblockEnabled: true,
  restoreLastSession: true,
  startup: {
    mode: 'continue',
    customUrl: ''
  },
  home: {
    homeUrl: '',
    newTabBehavior: 'tankoban_home'
  },
  downloads: {
    behavior: 'ask',
    folderModeHint: true
  },
  sourcesMinimalTorrentV1: false,
  sourcesLastDestinationByCategory: {
    comics: '',
    books: '',
    videos: ''
  },
  privacy: {
    doNotTrack: false,
    clearOnExit: {
      history: false,
      downloads: false,
      cookies: false,
      cache: false
    }
  },
  jackett: {
    baseUrl: '',
    apiKey: '',
    indexer: 'all',
    timeoutMs: 30000,
    indexersByCategory: {
      all: 'all',
      comics: 'all',
      books: 'all',
      tv: 'all'
    }
  }
};

var cache = null;

function normalizeSearchEngine(value) {
  var key = String(value || '').trim().toLowerCase();
  if (!ALLOWED_SEARCH_ENGINES.has(key)) return DEFAULT_SETTINGS.defaultSearchEngine;
  return key;
}

function normalizeStartupMode(value) {
  var key = String(value || '').trim().toLowerCase();
  if (!ALLOWED_STARTUP_MODES.has(key)) return DEFAULT_SETTINGS.startup.mode;
  return key;
}

function normalizeNewTabBehavior(value) {
  var key = String(value || '').trim().toLowerCase();
  if (!ALLOWED_NEW_TAB_BEHAVIORS.has(key)) return DEFAULT_SETTINGS.home.newTabBehavior;
  return key;
}

function normalizeDownloadBehavior(value) {
  var key = String(value || '').trim().toLowerCase();
  if (!ALLOWED_DOWNLOAD_BEHAVIORS.has(key)) return DEFAULT_SETTINGS.downloads.behavior;
  return key;
}

function normalizeUrl(value) {
  return String(value || '').trim();
}

function normalizeTimeout(value, fallback) {
  var n = Number(value);
  if (!isFinite(n) || n <= 0) return fallback;
  if (n < 2000) return 2000;
  if (n > 60000) return 60000;
  return Math.round(n);
}

function normalizeIndexerMap(input) {
  var src = (input && typeof input === 'object') ? input : {};
  return {
    all: String(src.all || 'all').trim() || 'all',
    comics: String(src.comics || src.manga || src.anime || 'all').trim() || 'all',
    books: String(src.books || src.audiobooks || 'all').trim() || 'all',
    tv: String(src.tv || src.movies || 'all').trim() || 'all'
  };
}

function normalizeSettings(input) {
  var src = (input && typeof input === 'object') ? input : {};
  var startupInput = (src.startup && typeof src.startup === 'object') ? src.startup : {};
  var homeInput = (src.home && typeof src.home === 'object') ? src.home : {};
  var downloadsInput = (src.downloads && typeof src.downloads === 'object') ? src.downloads : {};
  var privacyInput = (src.privacy && typeof src.privacy === 'object') ? src.privacy : {};
  var clearOnExitInput = (privacyInput.clearOnExit && typeof privacyInput.clearOnExit === 'object') ? privacyInput.clearOnExit : {};
  var jackettInput = (src.jackett && typeof src.jackett === 'object') ? src.jackett : {};

  var startupMode = normalizeStartupMode(startupInput.mode || src.startupMode);
  if (src.restoreLastSession === false && !startupInput.mode && !src.startupMode) {
    startupMode = 'new_tab';
  }

  var out = {
    defaultSearchEngine: normalizeSearchEngine(src.defaultSearchEngine || DEFAULT_SETTINGS.defaultSearchEngine),
    parityV1Enabled: src.parityV1Enabled !== false,
    adblockEnabled: src.adblockEnabled !== false,
    restoreLastSession: src.restoreLastSession !== false,
    startup: {
      mode: startupMode,
      customUrl: normalizeUrl(startupInput.customUrl || src.startupCustomUrl)
    },
    home: {
      homeUrl: normalizeUrl(homeInput.homeUrl || src.homeUrl),
      newTabBehavior: normalizeNewTabBehavior(homeInput.newTabBehavior || src.newTabBehavior)
    },
    downloads: {
      behavior: normalizeDownloadBehavior(downloadsInput.behavior || src.downloadBehavior),
      folderModeHint: downloadsInput.folderModeHint !== false
    },
    sourcesMinimalTorrentV1: !!src.sourcesMinimalTorrentV1,
    sourcesLastDestinationByCategory: {
      comics: String(src.sourcesLastDestinationByCategory && src.sourcesLastDestinationByCategory.comics || '').trim(),
      books: String(src.sourcesLastDestinationByCategory && src.sourcesLastDestinationByCategory.books || '').trim(),
      videos: String(src.sourcesLastDestinationByCategory && src.sourcesLastDestinationByCategory.videos || '').trim()
    },
    privacy: {
      doNotTrack: !!(privacyInput.doNotTrack || src.doNotTrack),
      clearOnExit: {
        history: !!(clearOnExitInput.history || src.clearHistoryOnExit),
        downloads: !!(clearOnExitInput.downloads || src.clearDownloadsOnExit),
        cookies: !!(clearOnExitInput.cookies || src.clearCookiesOnExit),
        cache: !!(clearOnExitInput.cache || src.clearCacheOnExit)
      }
    },
    jackett: {
      baseUrl: normalizeUrl(jackettInput.baseUrl || src.jackettBaseUrl),
      apiKey: String(jackettInput.apiKey || src.jackettApiKey || '').trim(),
      indexer: String(jackettInput.indexer || src.jackettIndexer || 'all').trim() || 'all',
      timeoutMs: normalizeTimeout(jackettInput.timeoutMs || src.jackettTimeoutMs, DEFAULT_SETTINGS.jackett.timeoutMs),
      indexersByCategory: normalizeIndexerMap(jackettInput.indexersByCategory || src.jackettIndexersByCategory)
    }
  };
  return out;
}

function ensureCache(ctx) {
  if (cache) return cache;
  var p = ctx.storage.dataPath(SETTINGS_FILE);
  var data = ctx.storage.readJSON(p, null);
  var settings = normalizeSettings(data && data.settings ? data.settings : data);
  cache = { settings: settings, updatedAt: Date.now() };
  return cache;
}

function write(ctx) {
  var p = ctx.storage.dataPath(SETTINGS_FILE);
  ctx.storage.writeJSONDebounced(p, cache || { settings: DEFAULT_SETTINGS, updatedAt: Date.now() }, 120);
}

function mergeSettings(base, patch) {
  var out = Object.assign({}, base || {});
  var src = (patch && typeof patch === 'object') ? patch : {};
  var key;
  for (key in src) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    if (src[key] && typeof src[key] === 'object' && !Array.isArray(src[key])) {
      var current = (out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) ? out[key] : {};
      out[key] = mergeSettings(current, src[key]);
    } else {
      out[key] = src[key];
    }
  }
  return out;
}

async function get(ctx) {
  var c = ensureCache(ctx);
  return { ok: true, settings: c.settings };
}

async function save(ctx, _evt, payload) {
  var c = ensureCache(ctx);
  var next = mergeSettings(c.settings, payload);
  c.settings = normalizeSettings(next);
  c.updatedAt = Date.now();
  write(ctx);
  return { ok: true, settings: c.settings };
}

module.exports = { get, save };
