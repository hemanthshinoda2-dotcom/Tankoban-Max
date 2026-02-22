// Web browser settings persistence.

const SETTINGS_FILE = 'web_browser_settings.json';
const ALLOWED_SEARCH_ENGINES = new Set(['yandex', 'google', 'duckduckgo', 'bing', 'brave']);
const DEFAULT_SETTINGS = {
  defaultSearchEngine: 'yandex',
};

var cache = null;

function normalizeSearchEngine(value) {
  var key = String(value || '').trim().toLowerCase();
  if (!ALLOWED_SEARCH_ENGINES.has(key)) return DEFAULT_SETTINGS.defaultSearchEngine;
  return key;
}

function normalizeSettings(input) {
  var src = (input && typeof input === 'object') ? input : {};
  var out = {
    defaultSearchEngine: normalizeSearchEngine(src.defaultSearchEngine || DEFAULT_SETTINGS.defaultSearchEngine),
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
  ctx.storage.writeJSON(p, cache || { settings: DEFAULT_SETTINGS, updatedAt: Date.now() });
}

async function get(ctx) {
  var c = ensureCache(ctx);
  return { ok: true, settings: c.settings };
}

async function save(ctx, _evt, payload) {
  var c = ensureCache(ctx);
  var next = Object.assign({}, c.settings, (payload && typeof payload === 'object') ? payload : {});
  c.settings = normalizeSettings(next);
  c.updatedAt = Date.now();
  write(ctx);
  return { ok: true, settings: c.settings };
}

module.exports = { get, save };
