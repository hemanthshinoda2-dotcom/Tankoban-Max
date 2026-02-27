// Web browsing history persistence.

const HISTORY_FILE = 'web_browsing_history.json';
const MAX_HISTORY = 10000;
const SCOPE_SOURCES_BROWSER = 'sources_browser';
const SCOPE_LEGACY_BROWSER = 'legacy_browser';
const MIGRATION_KEY = 'sourcesHistoryScopedV1';

var cache = null;
var cacheLoading = null;

function normalizeScope(raw) {
  var s = String(raw || '').trim();
  if (s === SCOPE_SOURCES_BROWSER || s === SCOPE_LEGACY_BROWSER) return s;
  return '';
}

function runMigrations(c) {
  if (!c || typeof c !== 'object') return;
  if (!c.migrations || typeof c.migrations !== 'object') c.migrations = {};
  if (c.migrations[MIGRATION_KEY]) return;
  var src = Array.isArray(c.entries) ? c.entries : [];
  c.entries = src.filter(function (e) {
    return e && e.scope === SCOPE_SOURCES_BROWSER;
  });
  c.updatedAt = Date.now();
  c.migrations[MIGRATION_KEY] = true;
}

async function ensureCache(ctx) {
  if (cache) return cache;
  if (cacheLoading) return cacheLoading;
  cacheLoading = (async () => {
    var p = ctx.storage.dataPath(HISTORY_FILE);
    var data = await ctx.storage.readJSONAsync(p, null);
    if (data && Array.isArray(data.entries)) {
      cache = {
        entries: data.entries,
        updatedAt: data.updatedAt || Date.now(),
        migrations: (data.migrations && typeof data.migrations === 'object') ? data.migrations : {},
      };
    } else {
      cache = { entries: [], updatedAt: Date.now(), migrations: {} };
    }
    runMigrations(cache);
    cacheLoading = null;
    return cache;
  })();
  return cacheLoading;
}

async function write(ctx) {
  var p = ctx.storage.dataPath(HISTORY_FILE);
  var c = await ensureCache(ctx);
  if (c.entries.length > MAX_HISTORY) c.entries = c.entries.slice(0, MAX_HISTORY);
  ctx.storage.writeJSONDebounced(p, c, 120);
}

async function emitUpdated(ctx) {
  try {
    var ipc = require('../../../shared/ipc');
    var c = await ensureCache(ctx);
    ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_HISTORY_UPDATED, {
      total: c.entries.length,
      updatedAt: c.updatedAt,
    });
  } catch {}
}

function normalizeEntry(payload) {
  var src = (payload && typeof payload === 'object') ? payload : {};
  var url = String(src.url || '').trim();
  if (!url) return null;
  return {
    id: 'wh_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    url: url,
    title: String(src.title || '').trim(),
    favicon: String(src.favicon || '').trim(),
    visitedAt: Number(src.visitedAt || src.timestamp || Date.now()),
    sourceTabId: src.sourceTabId != null ? String(src.sourceTabId) : '',
    scope: normalizeScope(src.scope),
  };
}

function applyFilters(entries, payload) {
  var opts = (payload && typeof payload === 'object') ? payload : {};
  var query = String(opts.query || '').trim().toLowerCase();
  var from = Number(opts.from || 0) || 0;
  var to = Number(opts.to || 0) || 0;
  var scope = normalizeScope(opts.scope);
  var out = [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (!e) continue;
    if (scope && normalizeScope(e.scope) !== scope) continue;
    var at = Number(e.visitedAt || 0) || 0;
    if (from && at < from) continue;
    if (to && at > to) continue;
    if (query) {
      var inTitle = String(e.title || '').toLowerCase().indexOf(query) !== -1;
      var inUrl = String(e.url || '').toLowerCase().indexOf(query) !== -1;
      if (!inTitle && !inUrl) continue;
    }
    out.push(e);
  }
  return out;
}

async function list(ctx, _evt, payload) {
  var c = await ensureCache(ctx);
  var filtered = applyFilters(c.entries || [], payload);
  var opts = (payload && typeof payload === 'object') ? payload : {};
  var limit = Number(opts.limit || 200);
  var offset = Number(opts.offset || 0);
  if (!isFinite(limit) || limit <= 0) limit = 200;
  if (limit > 1000) limit = 1000;
  if (!isFinite(offset) || offset < 0) offset = 0;
  var slice = filtered.slice(offset, offset + limit);
  return { ok: true, entries: slice, total: filtered.length };
}

async function add(ctx, _evt, payload) {
  var entry = normalizeEntry(payload);
  if (!entry) return { ok: false, error: 'Missing URL' };
  var c = await ensureCache(ctx);
  c.entries.unshift(entry);
  if (c.entries.length > MAX_HISTORY) c.entries.length = MAX_HISTORY;
  c.updatedAt = Date.now();
  await write(ctx);
  await emitUpdated(ctx);
  return { ok: true, entry: entry };
}

async function clear(ctx, _evt, payload) {
  var c = await ensureCache(ctx);
  var opts = (payload && typeof payload === 'object') ? payload : {};
  var from = Number(opts.from || 0) || 0;
  var to = Number(opts.to || 0) || 0;
  var scope = normalizeScope(opts.scope);
  if (!from && !to && !scope) {
    c.entries = [];
  } else {
    c.entries = (c.entries || []).filter(function (e) {
      if (!e) return false;
      var eScope = normalizeScope(e.scope);
      if (scope && eScope !== scope) return true;
      var at = Number(e && e.visitedAt || 0) || 0;
      if (from && at < from) return true;
      if (to && at > to) return true;
      return false;
    });
  }
  c.updatedAt = Date.now();
  await write(ctx);
  await emitUpdated(ctx);
  return { ok: true };
}

async function remove(ctx, _evt, payload) {
  var id = payload && payload.id ? String(payload.id) : '';
  if (!id) return { ok: false, error: 'Missing id' };
  var c = await ensureCache(ctx);
  var before = c.entries.length;
  c.entries = c.entries.filter(function (e) { return !(e && String(e.id) === id); });
  if (c.entries.length === before) return { ok: false, error: 'Not found' };
  c.updatedAt = Date.now();
  await write(ctx);
  await emitUpdated(ctx);
  return { ok: true };
}

module.exports = { list, add, clear, remove };
