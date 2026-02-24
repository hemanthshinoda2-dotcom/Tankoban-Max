// Web bookmarks persistence.

const BOOKMARKS_FILE = 'web_bookmarks.json';
const MAX_BOOKMARKS = 5000;

var cache = null;

function sanitizeBookmark(input) {
  var src = (input && typeof input === 'object') ? input : {};
  var url = String(src.url || '').trim();
  if (!url) return null;
  return {
    id: String(src.id || ('wbm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8))),
    url: url,
    title: String(src.title || '').trim(),
    favicon: String(src.favicon || '').trim(),
    folder: String(src.folder || '').trim(),
    createdAt: Number(src.createdAt || Date.now()) || Date.now(),
    updatedAt: Number(src.updatedAt || Date.now()) || Date.now(),
  };
}

function ensureCache(ctx) {
  if (cache) return cache;
  var p = ctx.storage.dataPath(BOOKMARKS_FILE);
  var raw = ctx.storage.readJSON(p, null);
  if (raw && Array.isArray(raw.bookmarks)) {
    cache = { bookmarks: raw.bookmarks, updatedAt: Number(raw.updatedAt || Date.now()) || Date.now() };
  } else {
    cache = { bookmarks: [], updatedAt: Date.now() };
  }
  return cache;
}

function write(ctx) {
  var p = ctx.storage.dataPath(BOOKMARKS_FILE);
  var c = ensureCache(ctx);
  if (!Array.isArray(c.bookmarks)) c.bookmarks = [];
  if (c.bookmarks.length > MAX_BOOKMARKS) c.bookmarks.length = MAX_BOOKMARKS;
  ctx.storage.writeJSONDebounced(p, c);
}

function emitUpdated(ctx) {
  try {
    var ipc = require('../../../shared/ipc');
    var c = ensureCache(ctx);
    ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_BOOKMARKS_UPDATED, {
      bookmarks: c.bookmarks || [],
      updatedAt: c.updatedAt,
    });
  } catch {}
}

function findByUrl(bookmarks, url) {
  var target = String(url || '').trim();
  if (!target) return null;
  for (var i = 0; i < bookmarks.length; i++) {
    var b = bookmarks[i];
    if (b && String(b.url || '').trim() === target) return b;
  }
  return null;
}

async function list(ctx) {
  var c = ensureCache(ctx);
  return { ok: true, bookmarks: c.bookmarks || [] };
}

async function add(ctx, _evt, payload) {
  var c = ensureCache(ctx);
  var b = sanitizeBookmark(payload);
  if (!b) return { ok: false, error: 'Missing URL' };
  var existing = findByUrl(c.bookmarks, b.url);
  if (existing) return { ok: true, bookmark: existing, existed: true };
  c.bookmarks.unshift(b);
  if (c.bookmarks.length > MAX_BOOKMARKS) c.bookmarks.length = MAX_BOOKMARKS;
  c.updatedAt = Date.now();
  write(ctx);
  emitUpdated(ctx);
  return { ok: true, bookmark: b, existed: false };
}

async function update(ctx, _evt, payload) {
  var c = ensureCache(ctx);
  var id = payload && payload.id ? String(payload.id) : '';
  if (!id) return { ok: false, error: 'Missing id' };
  var target = null;
  for (var i = 0; i < c.bookmarks.length; i++) {
    var b = c.bookmarks[i];
    if (b && String(b.id) === id) { target = b; break; }
  }
  if (!target) return { ok: false, error: 'Not found' };

  var nextUrl = payload && payload.url != null ? String(payload.url).trim() : target.url;
  if (!nextUrl) return { ok: false, error: 'Missing URL' };
  target.url = nextUrl;
  if (payload && payload.title != null) target.title = String(payload.title || '').trim();
  if (payload && payload.folder != null) target.folder = String(payload.folder || '').trim();
  target.updatedAt = Date.now();
  c.updatedAt = target.updatedAt;
  write(ctx);
  emitUpdated(ctx);
  return { ok: true, bookmark: target };
}

async function remove(ctx, _evt, payload) {
  var c = ensureCache(ctx);
  var id = payload && payload.id ? String(payload.id) : '';
  if (!id) return { ok: false, error: 'Missing id' };
  var before = c.bookmarks.length;
  c.bookmarks = c.bookmarks.filter(function (b) { return !(b && String(b.id) === id); });
  if (c.bookmarks.length === before) return { ok: false, error: 'Not found' };
  c.updatedAt = Date.now();
  write(ctx);
  emitUpdated(ctx);
  return { ok: true };
}

async function toggle(ctx, _evt, payload) {
  var c = ensureCache(ctx);
  var url = payload && payload.url ? String(payload.url).trim() : '';
  if (!url) return { ok: false, error: 'Missing URL' };
  var existing = findByUrl(c.bookmarks, url);
  if (existing) {
    c.bookmarks = c.bookmarks.filter(function (b) { return b && String(b.id) !== String(existing.id); });
    c.updatedAt = Date.now();
    write(ctx);
    emitUpdated(ctx);
    return { ok: true, added: false, bookmark: existing };
  }
  var created = sanitizeBookmark({
    url: url,
    title: payload && payload.title ? payload.title : '',
    favicon: payload && payload.favicon ? payload.favicon : '',
    folder: payload && payload.folder ? payload.folder : '',
  });
  if (!created) return { ok: false, error: 'Missing URL' };
  c.bookmarks.unshift(created);
  c.updatedAt = Date.now();
  write(ctx);
  emitUpdated(ctx);
  return { ok: true, added: true, bookmark: created };
}

module.exports = {
  list,
  add,
  update,
  remove,
  toggle,
};
