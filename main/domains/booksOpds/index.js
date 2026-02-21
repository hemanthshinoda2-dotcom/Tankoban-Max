// BOOKS_OPDS: OPDS feeds storage + fetch proxy for Books mode

const path = require('path');

const CONFIG_FILE = 'books_opds_feeds.json';
var feedsCache = null;

function readConfig(ctx) {
  var p = ctx.storage.dataPath(CONFIG_FILE);
  var data = ctx.storage.readJSON(p, null);
  if (data && Array.isArray(data.feeds)) return data;
  return { feeds: [], updatedAt: 0 };
}

function writeConfig(ctx, data) {
  var p = ctx.storage.dataPath(CONFIG_FILE);
  ctx.storage.writeJSON(p, data);
}

function ensureCache(ctx) {
  if (!feedsCache) feedsCache = readConfig(ctx);
  if (!Array.isArray(feedsCache.feeds)) feedsCache.feeds = [];
  return feedsCache;
}

function emitUpdated(ctx) {
  try {
    var ipc = require('../../../shared/ipc');
    ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.BOOKS_OPDS_FEEDS_UPDATED, {
      feeds: ensureCache(ctx).feeds || [],
    });
  } catch {}
}

function normUrl(u) {
  var s = String(u || '').trim();
  if (!s) return '';
  try {
    var x = new URL(s);
    if (x.protocol !== 'http:' && x.protocol !== 'https:') return '';
    return x.toString();
  } catch {
    return '';
  }
}

async function getFeeds(ctx) {
  var cfg = ensureCache(ctx);
  return { ok: true, feeds: cfg.feeds || [] };
}

async function addFeed(ctx, _evt, payload) {
  var url = normUrl(payload && payload.url);
  if (!url) return { ok: false, error: 'Invalid feed URL' };
  var name = String((payload && payload.name) || '').trim();
  var cfg = ensureCache(ctx);
  for (var i = 0; i < cfg.feeds.length; i++) {
    if (String(cfg.feeds[i].url || '') === url) return { ok: false, error: 'Feed already exists' };
  }
  var feed = {
    id: 'opds_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    url: url,
    name: name,
    createdAt: Date.now(),
  };
  cfg.feeds.unshift(feed);
  if (cfg.feeds.length > 100) cfg.feeds.length = 100;
  cfg.updatedAt = Date.now();
  writeConfig(ctx, cfg);
  emitUpdated(ctx);
  return { ok: true, feed: feed };
}

async function updateFeed(ctx, _evt, payload) {
  var id = payload && payload.id ? String(payload.id) : '';
  if (!id) return { ok: false, error: 'Missing id' };
  var cfg = ensureCache(ctx);
  var found = null;
  for (var i = 0; i < cfg.feeds.length; i++) {
    if (String(cfg.feeds[i].id) === id) { found = cfg.feeds[i]; break; }
  }
  if (!found) return { ok: false, error: 'Feed not found' };
  if (payload.url != null) {
    var nextUrl = normUrl(payload.url);
    if (!nextUrl) return { ok: false, error: 'Invalid feed URL' };
    found.url = nextUrl;
  }
  if (payload.name != null) found.name = String(payload.name || '').trim();
  found.updatedAt = Date.now();
  cfg.updatedAt = Date.now();
  writeConfig(ctx, cfg);
  emitUpdated(ctx);
  return { ok: true, feed: found };
}

async function removeFeed(ctx, _evt, payload) {
  var id = payload && payload.id ? String(payload.id) : '';
  if (!id) return { ok: false, error: 'Missing id' };
  var cfg = ensureCache(ctx);
  var before = cfg.feeds.length;
  cfg.feeds = cfg.feeds.filter(function (f) { return String(f && f.id || '') !== id; });
  if (cfg.feeds.length === before) return { ok: false, error: 'Feed not found' };
  cfg.updatedAt = Date.now();
  writeConfig(ctx, cfg);
  emitUpdated(ctx);
  return { ok: true };
}

async function fetchCatalog(_ctx, _evt, payload) {
  var url = normUrl(payload && payload.url);
  if (!url) return { ok: false, error: 'Invalid URL' };
  var accept = [
    'application/opds+json',
    'application/opds-publication+json',
    'application/atom+xml',
    'application/xml',
    'text/xml',
    'application/json',
    'text/html',
    '*/*'
  ].join(', ');

  try {
    var res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'accept': accept,
        'user-agent': 'Tankoban-Max/OPDS (+Electron)'
      }
    });

    var text = await res.text();
    return {
      ok: !!res.ok,
      status: Number(res.status || 0),
      statusText: String(res.statusText || ''),
      url: String(res.url || url),
      contentType: String((res.headers && res.headers.get && res.headers.get('content-type')) || ''),
      body: text,
      headers: {
        etag: String((res.headers && res.headers.get && res.headers.get('etag')) || ''),
        lastModified: String((res.headers && res.headers.get && res.headers.get('last-modified')) || ''),
      },
    };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err || 'Fetch failed') };
  }
}

module.exports = {
  getFeeds,
  addFeed,
  updateFeed,
  removeFeed,
  fetchCatalog,
};
