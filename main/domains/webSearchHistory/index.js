// FEAT-BROWSER: Web search history — omnibox autocomplete suggestions.
// Stores search queries and provides combined suggestions from search history,
// bookmarks, and browsing history.

const SEARCH_FILE = 'web_search_history.json';
const MAX_ENTRIES = 1000;
const MAX_SUGGESTIONS = 8;

var cache = null;

function ensureCache(ctx) {
  if (cache) return cache;
  var p = ctx.storage.dataPath(SEARCH_FILE);
  var data = ctx.storage.readJSON(p, null);
  if (data && Array.isArray(data.queries)) {
    cache = { queries: data.queries, updatedAt: data.updatedAt || Date.now() };
  } else {
    cache = { queries: [], updatedAt: Date.now() };
  }
  return cache;
}

function write(ctx) {
  var p = ctx.storage.dataPath(SEARCH_FILE);
  var c = ensureCache(ctx);
  if (c.queries.length > MAX_ENTRIES) c.queries.length = MAX_ENTRIES;
  ctx.storage.writeJSONDebounced(p, c, 120);
}

// Load bookmarks and history caches for cross-source suggestions
function getBookmarks(ctx) {
  try {
    var bookmarksDomain = require('../webBookmarks');
    // Read bookmarks from storage directly (avoid async)
    var p = ctx.storage.dataPath('web_bookmarks.json');
    var data = ctx.storage.readJSON(p, null);
    return (data && Array.isArray(data.bookmarks)) ? data.bookmarks : [];
  } catch { return []; }
}

function getHistory(ctx) {
  try {
    var p = ctx.storage.dataPath('web_browsing_history.json');
    var data = ctx.storage.readJSON(p, null);
    return (data && Array.isArray(data.entries)) ? data.entries : [];
  } catch { return []; }
}

async function suggest(ctx, _evt, input) {
  var q = String(input || '').toLowerCase().trim();
  if (!q) return [];

  var seen = new Set();
  var results = [];
  var c = ensureCache(ctx);

  // 1. Match search history (type: 'search')
  for (var i = 0; i < c.queries.length && results.length < MAX_SUGGESTIONS; i++) {
    var s = c.queries[i];
    if (s && s.query && s.query.toLowerCase().indexOf(q) !== -1) {
      var key = 'search:' + s.query;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ type: 'search', text: s.query, timestamp: s.timestamp });
      }
    }
  }

  // 2. Match bookmarks (type: 'bookmark')
  var bookmarks = getBookmarks(ctx);
  for (var bi = 0; bi < bookmarks.length && results.length < MAX_SUGGESTIONS; bi++) {
    var b = bookmarks[bi];
    if (!b) continue;
    var bMatch = (b.title && b.title.toLowerCase().indexOf(q) !== -1) ||
                 (b.url && b.url.toLowerCase().indexOf(q) !== -1);
    if (bMatch) {
      var bKey = 'url:' + b.url;
      if (!seen.has(bKey)) {
        seen.add(bKey);
        results.push({ type: 'bookmark', text: b.title || b.url, url: b.url, favicon: b.favicon || '' });
      }
    }
  }

  // 3. Match browsing history (type: 'history')
  var history = getHistory(ctx);
  for (var hi = 0; hi < history.length && results.length < MAX_SUGGESTIONS; hi++) {
    var h = history[hi];
    if (!h) continue;
    var hMatch = (h.title && h.title.toLowerCase().indexOf(q) !== -1) ||
                 (h.url && h.url.toLowerCase().indexOf(q) !== -1);
    if (hMatch) {
      var hKey = 'url:' + h.url;
      if (!seen.has(hKey)) {
        seen.add(hKey);
        results.push({ type: 'history', text: h.title || h.url, url: h.url, favicon: h.favicon || '' });
      }
    }
  }

  return results;
}

async function add(ctx, _evt, query) {
  if (!query || typeof query !== 'string') return;
  var q = query.trim();
  if (!q) return;
  var c = ensureCache(ctx);
  // Remove duplicate if exists (move to top)
  c.queries = c.queries.filter(function (s) { return !(s && s.query === q); });
  c.queries.unshift({ query: q, timestamp: Date.now() });
  if (c.queries.length > MAX_ENTRIES) c.queries.length = MAX_ENTRIES;
  c.updatedAt = Date.now();
  write(ctx);
}

module.exports = { suggest, add };
