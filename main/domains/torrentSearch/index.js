const { URL } = require('url');

const WEB_SETTINGS_FILE = 'web_browser_settings.json';
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

function readSettings(ctx) {
  try {
    const raw = ctx.storage.readJSON(ctx.storage.dataPath(WEB_SETTINGS_FILE), {});
    return (raw && raw.settings && typeof raw.settings === 'object') ? raw.settings : (raw || {});
  } catch (_e) {
    return {};
  }
}

function getJackettConfig(ctx) {
  const s = readSettings(ctx);
  const jackett = (s && s.jackett && typeof s.jackett === 'object') ? s.jackett : {};
  const baseUrl = String(jackett.baseUrl || '').trim().replace(/\/+$/, '');
  const apiKey = String(jackett.apiKey || '').trim();
  const indexer = String(jackett.indexer || 'all').trim() || 'all';
  const timeoutMs = Number(jackett.timeoutMs || 30000);
  const idxMap = (jackett.indexersByCategory && typeof jackett.indexersByCategory === 'object')
    ? jackett.indexersByCategory
    : {};
  return {
    baseUrl: baseUrl,
    apiKey: apiKey,
    indexer: indexer,
    indexersByCategory: {
      all: String(idxMap.all || 'all').trim() || 'all',
      comics: String(idxMap.comics || idxMap.anime || idxMap.manga || 'all').trim() || 'all',
      books: String(idxMap.books || idxMap.audiobooks || 'all').trim() || 'all',
      tv: String(idxMap.tv || idxMap.movies || 'all').trim() || 'all'
    },
    timeoutMs: (isFinite(timeoutMs) && timeoutMs > 0) ? timeoutMs : 30000
  };
}

function decodeXml(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function textBetween(xml, tag) {
  const re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
  const m = String(xml || '').match(re);
  return m ? decodeXml(m[1].trim()) : '';
}

function attrFromItem(xml, name) {
  const re = new RegExp('<torznab:attr[^>]*name="' + name + '"[^>]*value="([^"]*)"', 'i');
  const m = String(xml || '').match(re);
  return m ? decodeXml(m[1].trim()) : '';
}

function toNumber(v, fallback) {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

function getCategoryCats(category) {
  const key = String(category || 'all').trim().toLowerCase();
  if (key === 'all') return '7030,7020,7000,5000,5030,5040';
  if (key === 'comics') return '7030,7020';
  if (key === 'books') return '7000';
  if (key === 'tv') return '5000,5030,5040';
  return '';
}

function buildSearchUrl(cfg, payload, indexerOverride) {
  const q = String(payload && payload.query || '').trim();
  const category = String(payload && payload.category || 'all').trim().toLowerCase();
  const limitRaw = Number(payload && payload.limit);
  const pageRaw = Number(payload && payload.page);
  const baseLimit = Math.max(1, Math.min(MAX_LIMIT, isFinite(limitRaw) && limitRaw > 0 ? limitRaw : DEFAULT_LIMIT));
  const limit = (category === 'all') ? Math.min(baseLimit, 20) : baseLimit;
  const page = Math.max(0, isFinite(pageRaw) && pageRaw >= 0 ? pageRaw : 0);
  const offset = page * limit;

  const categoryIndexer = (
    cfg &&
    cfg.indexersByCategory &&
    cfg.indexersByCategory[category] &&
    String(cfg.indexersByCategory[category]).trim()
  ) ? String(cfg.indexersByCategory[category]).trim() : '';
  const indexerForCategory = String(indexerOverride || categoryIndexer || cfg.indexer || 'all').trim() || 'all';
  const u = new URL(cfg.baseUrl + '/api/v2.0/indexers/' + encodeURIComponent(indexerForCategory) + '/results/torznab/api');
  u.searchParams.set('apikey', cfg.apiKey);
  u.searchParams.set('t', 'search');
  if (q) u.searchParams.set('q', q);
  const cats = getCategoryCats(category);
  if (cats) u.searchParams.set('cat', cats);
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('offset', String(offset));
  return u.toString();
}

function parseIndexerSpec(cfg, category) {
  const key = String(category || 'all').trim().toLowerCase();
  const spec = String(
    (cfg && cfg.indexersByCategory && cfg.indexersByCategory[key]) ||
    (cfg && cfg.indexer) ||
    'all'
  ).trim();
  if (key === 'all' && spec.toLowerCase() === 'all') {
    const union = [];
    const seen = new Set();
    ['comics', 'books', 'tv'].forEach(function (k) {
      const raw = String((cfg && cfg.indexersByCategory && cfg.indexersByCategory[k]) || '').trim();
      if (!raw || raw.toLowerCase() === 'all') return;
      raw.split(',').forEach(function (part) {
        const token = String(part || '').trim();
        if (!token) return;
        const low = token.toLowerCase();
        if (seen.has(low)) return;
        seen.add(low);
        union.push(token);
      });
    });
    if (union.length) return union;
  }
  if (!spec) return ['all'];
  if (spec.toLowerCase() === 'all') return ['all'];
  const out = [];
  const seen = new Set();
  String(spec).split(',').forEach(function (part) {
    const token = String(part || '').trim();
    if (!token) return;
    const k = token.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(token);
  });
  return out.length ? out : ['all'];
}

async function fetchItemsForIndexer(cfg, payload, indexerName) {
  const url = buildSearchUrl(cfg, payload || {}, indexerName);
  const controller = new AbortController();
  const t = setTimeout(function () { controller.abort(); }, Math.max(4000, Number(cfg.timeoutMs) || 30000));
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'accept': 'application/xml,text/xml,*/*' } });
    clearTimeout(t);
    if (!res || !res.ok) {
      return { ok: false, status: Number(res && res.status || 0), items: [], error: 'HTTP ' + Number(res && res.status || 0), indexer: indexerName };
    }
    const xml = await res.text();
    return { ok: true, items: parseItems(xml), indexer: indexerName };
  } catch (err) {
    clearTimeout(t);
    return { ok: false, status: 0, items: [], error: String((err && err.message) || err || 'Search failed'), indexer: indexerName };
  }
}

function parseItems(xml) {
  const src = String(xml || '');
  const out = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/ig;
  let m;
  let i = 0;
  while ((m = itemRe.exec(src))) {
    const item = m[0];
    const title = textBetween(item, 'title');
    const link = textBetween(item, 'link');
    const enclosureMagnetMatch = item.match(/<enclosure[^>]*url="(magnet:[^"]+)"/i);
    const magnetUri = enclosureMagnetMatch ? decodeXml(enclosureMagnetMatch[1]) : (/^magnet:/i.test(link) ? link : '');
    if (!title || !magnetUri) continue;

    const sizeBytes = toNumber(textBetween(item, 'size') || attrFromItem(item, 'size'), 0);
    const seeders = toNumber(attrFromItem(item, 'seeders'), 0);
    const fileCount = toNumber(attrFromItem(item, 'files'), 0);
    const sourceName = attrFromItem(item, 'indexer') || attrFromItem(item, 'tracker') || '';
    const sourceUrl = textBetween(item, 'comments') || '';
    const publishedAt = textBetween(item, 'pubDate') || '';

    out.push({
      id: 'jackett_' + (++i) + '_' + Math.abs((title + magnetUri).split('').reduce(function (acc, c) { return ((acc << 5) - acc) + c.charCodeAt(0); }, 0)),
      title: title,
      sizeBytes: sizeBytes > 0 ? sizeBytes : null,
      fileCount: fileCount > 0 ? fileCount : null,
      seeders: seeders > 0 ? seeders : 0,
      magnetUri: magnetUri,
      sourceName: sourceName || 'Indexer',
      sourceUrl: sourceUrl || null,
      publishedAt: publishedAt || null
    });
  }
  return out;
}

function emitStatus(ctx, payload) {
  try {
    const ipc = require('../../../shared/ipc');
    ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.TORRENT_SEARCH_STATUS_CHANGED, payload || {});
  } catch (_e) {}
}

async function health(ctx) {
  const cfg = getJackettConfig(ctx);
  if (!cfg.baseUrl || !cfg.apiKey) {
    const out = { ok: true, ready: false, error: 'Configure Jackett base URL + API key', details: { configured: false } };
    emitStatus(ctx, out);
    return out;
  }
  if (typeof fetch !== 'function') {
    const out = { ok: false, ready: false, error: 'Fetch API unavailable in main process', details: { configured: true } };
    emitStatus(ctx, out);
    return out;
  }
  const controller = new AbortController();
  const t = setTimeout(function () { controller.abort(); }, Math.max(2000, cfg.timeoutMs));
  try {
    const testUrl = cfg.baseUrl + '/api/v2.0/indexers/all/results/torznab/api?t=caps&apikey=' + encodeURIComponent(cfg.apiKey);
    const res = await fetch(testUrl, { signal: controller.signal, headers: { 'accept': 'application/xml,text/xml,*/*' } });
    clearTimeout(t);
    if (!res || !res.ok) {
      const out = { ok: true, ready: false, error: 'Jackett unreachable (HTTP ' + Number(res && res.status || 0) + ')', details: { configured: true } };
      emitStatus(ctx, out);
      return out;
    }
    const out = { ok: true, ready: true, details: { configured: true, indexer: cfg.indexer } };
    emitStatus(ctx, out);
    return out;
  } catch (err) {
    clearTimeout(t);
    const msg = String((err && err.message) || err || 'Jackett request failed');
    const out = { ok: true, ready: false, error: msg, details: { configured: true } };
    emitStatus(ctx, out);
    return out;
  }
}

async function query(ctx, _evt, payload) {
  const cfg = getJackettConfig(ctx);
  if (!cfg.baseUrl || !cfg.apiKey) {
    return { ok: false, items: [], error: 'Jackett is not configured' };
  }
  if (typeof fetch !== 'function') {
    return { ok: false, items: [], error: 'Fetch API unavailable in main process' };
  }
  const queryText = String(payload && payload.query || '').trim();
  if (!queryText) return { ok: true, items: [] };

  const category = String(payload && payload.category || 'all').trim().toLowerCase();
  const indexers = parseIndexerSpec(cfg, category);
  const results = await Promise.all(indexers.map(function (idx) {
    return fetchItemsForIndexer(cfg, payload || {}, idx);
  }));

  let merged = [];
  const okAny = results.some(function (r) { return !!(r && r.ok); });
  if (okAny) {
    const seen = new Set();
    results.forEach(function (r) {
      if (!r || !r.ok || !Array.isArray(r.items)) return;
      r.items.forEach(function (it) {
        const key = String(it && (it.magnetUri || it.id || it.title) || '').trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        merged.push(it);
      });
    });
    return { ok: true, items: merged };
  }

  // If category-specific indexers fail (often due invalid alias/id), retry with Jackett 'all'.
  if (indexers.length > 1 || (indexers[0] && String(indexers[0]).toLowerCase() !== 'all')) {
    const fallback = await fetchItemsForIndexer(cfg, payload || {}, 'all');
    if (fallback && fallback.ok) return { ok: true, items: fallback.items || [] };
  }

  const firstErr = results.find(function (r) { return r && !r.ok; }) || {};
  const msg = String(firstErr.error || 'Search failed');
  if (/aborted/i.test(msg)) return { ok: false, items: [], error: 'Search timed out. Try a narrower filter or increase Jackett timeout.' };
  if (firstErr.status) return { ok: false, items: [], error: 'Search failed (HTTP ' + Number(firstErr.status || 0) + ')' };
  return { ok: false, items: [], error: msg };
}

module.exports = {
  health,
  query
};
