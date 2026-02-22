// Web browsing history persistence.

const HISTORY_FILE = 'web_browsing_history.json';
const MAX_HISTORY = 10000;

var cache = null;

function ensureCache(ctx) {
  if (cache) return cache;
  var p = ctx.storage.dataPath(HISTORY_FILE);
  var data = ctx.storage.readJSON(p, null);
  if (data && Array.isArray(data.entries)) {
    cache = { entries: data.entries, updatedAt: data.updatedAt || Date.now() };
  } else {
    cache = { entries: [], updatedAt: Date.now() };
  }
  return cache;
}

function write(ctx) {
  var p = ctx.storage.dataPath(HISTORY_FILE);
  var c = ensureCache(ctx);
  if (c.entries.length > MAX_HISTORY) c.entries = c.entries.slice(0, MAX_HISTORY);
  ctx.storage.writeJSON(p, c);
}

function emitUpdated(ctx) {
  try {
    var ipc = require('../../../shared/ipc');
    var c = ensureCache(ctx);
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
    visitedAt: Number(src.visitedAt || Date.now()),
    sourceTabId: src.sourceTabId != null ? String(src.sourceTabId) : '',
  };
}

function applyFilters(entries, payload) {
  var opts = (payload && typeof payload === 'object') ? payload : {};
  var query = String(opts.query || '').trim().toLowerCase();
  var from = Number(opts.from || 0) || 0;
  var to = Number(opts.to || 0) || 0;
  var out = [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (!e) continue;
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
  var c = ensureCache(ctx);
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
  var c = ensureCache(ctx);
  c.entries.unshift(entry);
  if (c.entries.length > MAX_HISTORY) c.entries.length = MAX_HISTORY;
  c.updatedAt = Date.now();
  write(ctx);
  emitUpdated(ctx);
  return { ok: true, entry: entry };
}

async function clear(ctx, _evt, payload) {
  var c = ensureCache(ctx);
  var opts = (payload && typeof payload === 'object') ? payload : {};
  var from = Number(opts.from || 0) || 0;
  var to = Number(opts.to || 0) || 0;
  if (!from && !to) {
    c.entries = [];
  } else {
    c.entries = (c.entries || []).filter(function (e) {
      var at = Number(e && e.visitedAt || 0) || 0;
      if (from && at < from) return true;
      if (to && at > to) return true;
      return false;
    });
  }
  c.updatedAt = Date.now();
  write(ctx);
  emitUpdated(ctx);
  return { ok: true };
}

async function remove(ctx, _evt, payload) {
  var id = payload && payload.id ? String(payload.id) : '';
  if (!id) return { ok: false, error: 'Missing id' };
  var c = ensureCache(ctx);
  var before = c.entries.length;
  c.entries = c.entries.filter(function (e) { return !(e && String(e.id) === id); });
  if (c.entries.length === before) return { ok: false, error: 'Not found' };
  c.updatedAt = Date.now();
  write(ctx);
  emitUpdated(ctx);
  return { ok: true };
}

module.exports = { list, add, clear, remove };
