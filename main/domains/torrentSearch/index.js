const { URL } = require('url');
const { EVENT } = require('../../../packages/core-ipc-contracts');

const WEB_SETTINGS_FILE = 'web_browser_settings.json';
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const CATEGORY_CODE_TYPE_MAP = {
  7030: { key: 'comics', label: 'Comics' },
  7020: { key: 'comics', label: 'Comics' },
  7000: { key: 'books', label: 'Books' },
  5040: { key: 'movies', label: 'Movies' },
  5030: { key: 'tv', label: 'TV' },
  5070: { key: 'anime', label: 'Anime' },
};

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

function attrsFromItem(xml) {
  const out = Object.create(null);
  const src = String(xml || '');
  const re = /<torznab:attr\b[^>]*name="([^"]+)"[^>]*value="([^"]*)"[^>]*\/?>/ig;
  let m;
  while ((m = re.exec(src))) {
    const name = String((m[1] || '')).trim().toLowerCase();
    const value = decodeXml(String(m[2] || '').trim());
    if (!name || !value) continue;
    if (!Array.isArray(out[name])) out[name] = [];
    out[name].push(value);
  }
  return out;
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
  const noCategoryFilter = !!(payload && payload.noCategoryFilter);
  const limitRaw = Number(payload && payload.limit);
  const pageRaw = Number(payload && payload.page);
  const baseLimit = Math.max(1, Math.min(MAX_LIMIT, isFinite(limitRaw) && limitRaw > 0 ? limitRaw : DEFAULT_LIMIT));
  const limit = baseLimit;
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
  if (!noCategoryFilter) {
    const cats = getCategoryCats(category);
    if (cats) u.searchParams.set('cat', cats);
  }
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
    return { ok: true, items: parseItems(xml, indexerName), indexer: indexerName };
  } catch (err) {
    clearTimeout(t);
    return { ok: false, status: 0, items: [], error: String((err && err.message) || err || 'Search failed'), indexer: indexerName };
  }
}

function hashString(value) {
  const s = String(value || '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizeSourceKey(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'indexer';
}

function titleCaseWords(input) {
  return String(input || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); })
    .join(' ');
}

function addTypeFacet(typeMap, key, label) {
  const k = String(key || '').trim().toLowerCase();
  if (!k) return;
  if (!typeMap.has(k)) typeMap.set(k, String(label || key || '').trim() || k);
}

function mapCategoryCodeToType(code) {
  const n = Number(code);
  if (!isFinite(n) || n <= 0) return null;
  if (CATEGORY_CODE_TYPE_MAP[n]) return CATEGORY_CODE_TYPE_MAP[n];
  if (n >= 7000 && n < 8000) return { key: 'books', label: 'Books' };
  if (n >= 5000 && n < 6000) return { key: 'videos', label: 'Videos' };
  return null;
}

function splitTypeCandidates(value) {
  return String(value || '')
    .split(/[\/>|,]/g)
    .map(function (s) { return String(s || '').trim(); })
    .filter(Boolean);
}

function typeFromLabel(raw) {
  const label = String(raw || '').trim();
  if (!label) return null;
  if (/^\d+$/.test(label)) return null;
  const low = label.toLowerCase();
  if (/anime/.test(low)) return { key: 'anime', label: 'Anime' };
  if (/tv|series|show|episode/.test(low)) return { key: 'tv', label: 'TV' };
  if (/movie|film/.test(low)) return { key: 'movies', label: 'Movies' };
  if (/comic|manga|manhwa|graphic/.test(low)) return { key: 'comics', label: 'Comics' };
  if (/book|ebook|novel|audiobook|literature/.test(low)) return { key: 'books', label: 'Books' };
  if (/video/.test(low)) return { key: 'videos', label: 'Videos' };
  if (/music/.test(low)) return { key: 'music', label: 'Music' };
  if (/game/.test(low)) return { key: 'games', label: 'Games' };
  const key = low.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!key) return null;
  return { key: key, label: titleCaseWords(label) || key };
}

function parseCategoryCodes(attrs, item) {
  const codes = [];
  const seen = new Set();
  const allVals = [];
  const attrVals = attrs && Array.isArray(attrs.category) ? attrs.category : [];
  for (let i = 0; i < attrVals.length; i++) allVals.push(attrVals[i]);

  const catValRe = /<category\b[^>]*value="([^"]+)"[^>]*>/ig;
  let m;
  const src = String(item || '');
  while ((m = catValRe.exec(src))) allVals.push(decodeXml(String(m[1] || '').trim()));

  for (let i = 0; i < allVals.length; i++) {
    const parts = String(allVals[i] || '').split(/[,\s]+/g);
    for (let j = 0; j < parts.length; j++) {
      const n = Number(parts[j]);
      if (!isFinite(n) || n <= 0) continue;
      if (seen.has(n)) continue;
      seen.add(n);
      codes.push(n);
    }
  }
  return codes;
}

function extractTypeFacets(item, attrs) {
  const typeMap = new Map();
  const addTypeFromValue = function (value) {
    const candidates = splitTypeCandidates(value);
    for (let i = 0; i < candidates.length; i++) {
      const meta = typeFromLabel(candidates[i]);
      if (!meta) continue;
      addTypeFacet(typeMap, meta.key, meta.label);
    }
  };

  const attrNames = ['categorydesc', 'type', 'genre'];
  for (let i = 0; i < attrNames.length; i++) {
    const name = attrNames[i];
    const values = attrs && Array.isArray(attrs[name]) ? attrs[name] : [];
    for (let j = 0; j < values.length; j++) addTypeFromValue(values[j]);
  }

  const catTextRe = /<category\b[^>]*>([\s\S]*?)<\/category>/ig;
  let m;
  const src = String(item || '');
  while ((m = catTextRe.exec(src))) addTypeFromValue(decodeXml(String(m[1] || '').trim()));

  const catValRe = /<category\b[^>]*value="([^"]+)"[^>]*>/ig;
  while ((m = catValRe.exec(src))) addTypeFromValue(decodeXml(String(m[1] || '').trim()));

  const codes = parseCategoryCodes(attrs, item);
  for (let i = 0; i < codes.length; i++) {
    const meta = mapCategoryCodeToType(codes[i]);
    if (!meta) continue;
    addTypeFacet(typeMap, meta.key, meta.label);
  }

  const entries = Array.from(typeMap.entries());
  return {
    typeKeys: entries.map(function (e) { return e[0]; }),
    typeLabels: entries.map(function (e) { return e[1]; }),
  };
}

function parseItems(xml, indexerName) {
  const src = String(xml || '');
  const out = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/ig;
  let m;
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
    const attrs = attrsFromItem(item);
    const sourceName = attrFromItem(item, 'indexer') || attrFromItem(item, 'tracker') || '';
    const sourceUrl = textBetween(item, 'comments') || '';
    const publishedAt = textBetween(item, 'pubDate') || '';
    const sourceLabel = sourceName || String(indexerName || 'Indexer');
    const sourceKey = normalizeSourceKey(sourceLabel);
    const facets = extractTypeFacets(item, attrs);
    const stableId = 'jackett_' + hashString([title, magnetUri, sourceKey].join('::'));

    out.push({
      id: stableId,
      title: title,
      sizeBytes: sizeBytes > 0 ? sizeBytes : null,
      fileCount: fileCount > 0 ? fileCount : null,
      seeders: seeders > 0 ? seeders : 0,
      magnetUri: magnetUri,
      sourceName: sourceLabel,
      sourceKey: sourceKey,
      sourceUrl: sourceUrl || null,
      publishedAt: publishedAt || null,
      typeKeys: facets.typeKeys,
      typeLabels: facets.typeLabels,
    });
  }
  return out;
}

function splitIndexerSpec(value) {
  const out = [];
  const seen = new Set();
  String(value || '').split(',').forEach(function (part) {
    const token = String(part || '').trim();
    if (!token || token.toLowerCase() === 'all') return;
    const k = token.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(token);
  });
  return out;
}

function canonicalIndexerToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function humanizeIndexerName(id) {
  const raw = String(id || '').trim();
  if (!raw) return '';
  if (/nyaa/i.test(raw)) return 'Nyaa';
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); })
    .join(' ');
}

function sortIndexers(list) {
  return (Array.isArray(list) ? list.slice() : []).sort(function (a, b) {
    const aNyaa = /nyaa/i.test(String(a && (a.name || a.id) || ''));
    const bNyaa = /nyaa/i.test(String(b && (b.name || b.id) || ''));
    if (aNyaa !== bNyaa) return aNyaa ? -1 : 1;
    return String(a && a.name || a && a.id || '').localeCompare(String(b && b.name || b && b.id || ''), undefined, { sensitivity: 'base' });
  });
}

function deriveIndexerFallback(cfg) {
  const out = [];
  const seen = new Set();
  const pushOne = function (token) {
    const id = String(token || '').trim();
    if (!id || id.toLowerCase() === 'all') return;
    const k = id.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ id: id, name: humanizeIndexerName(id) || id });
  };

  splitIndexerSpec(cfg && cfg.indexer).forEach(pushOne);
  const byCat = (cfg && cfg.indexersByCategory && typeof cfg.indexersByCategory === 'object') ? cfg.indexersByCategory : {};
  Object.keys(byCat).forEach(function (key) {
    splitIndexerSpec(byCat[key]).forEach(pushOne);
  });
  return sortIndexers(out);
}

async function fetchConfiguredIndexers(cfg) {
  if (!cfg || !cfg.baseUrl || !cfg.apiKey || typeof fetch !== 'function') return [];
  const controller = new AbortController();
  const t = setTimeout(function () { controller.abort(); }, Math.max(3000, Number(cfg.timeoutMs) || 30000));
  try {
    const u = new URL(cfg.baseUrl + '/api/v2.0/indexers');
    u.searchParams.set('apikey', cfg.apiKey);
    u.searchParams.set('configured', 'true');
    const res = await fetch(u.toString(), { signal: controller.signal, headers: { accept: 'application/json,*/*' } });
    clearTimeout(t);
    if (!res || !res.ok) return [];
    const body = await res.json();
    const rows = Array.isArray(body)
      ? body
      : (Array.isArray(body && body.indexers) ? body.indexers : (Array.isArray(body && body.Indexers) ? body.Indexers : []));
    if (!Array.isArray(rows) || !rows.length) return [];

    const out = [];
    const seen = new Set();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const id = String(row.id || row.ID || row.identifier || row.indexer || row.name || '').trim();
      if (!id) continue;
      const k = id.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const name = String(row.title || row.name || row.displayName || '').trim() || humanizeIndexerName(id) || id;
      out.push({ id: id, name: name });
    }
    return sortIndexers(out);
  } catch (_err) {
    clearTimeout(t);
    return [];
  }
}

function emitStatus(ctx, payload) {
  try {
    ctx.win && ctx.win.webContents && ctx.win.webContents.send(EVENT.TORRENT_SEARCH_STATUS_CHANGED, payload || {});
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
  const page = Math.max(0, Number(payload && payload.page) || 0);
  const limitRaw = Number(payload && payload.limit);
  const limit = Math.max(1, Math.min(MAX_LIMIT, isFinite(limitRaw) && limitRaw > 0 ? limitRaw : DEFAULT_LIMIT));
  if (!queryText) return { ok: true, items: [], page: page, limit: limit, returned: 0 };

  const category = String(payload && payload.category || 'all').trim().toLowerCase();
  const sourceFilter = String(payload && (payload.source || payload.indexer) || '').trim();
  const forceSingleSource = sourceFilter && sourceFilter.toLowerCase() !== 'all';
  let resolvedSingleSource = sourceFilter;
  if (forceSingleSource) {
    const live = await fetchConfiguredIndexers(cfg);
    const fallback = live.length ? [] : deriveIndexerFallback(cfg);
    const all = live.length ? live : fallback;
    const srcCanon = canonicalIndexerToken(sourceFilter);
    const hit = all.find(function (row) {
      const id = String(row && row.id || '').trim();
      const name = String(row && row.name || '').trim();
      if (!id && !name) return false;
      if (sourceFilter === id || sourceFilter === name) return true;
      const idCanon = canonicalIndexerToken(id);
      const nameCanon = canonicalIndexerToken(name);
      if (idCanon === srcCanon || nameCanon === srcCanon) return true;
      if (srcCanon.length >= 4 && (idCanon.includes(srcCanon) || srcCanon.includes(idCanon))) return true;
      if (srcCanon.length >= 4 && (nameCanon.includes(srcCanon) || srcCanon.includes(nameCanon))) return true;
      return false;
    });
    if (hit && hit.id) resolvedSingleSource = String(hit.id);
    if ((!resolvedSingleSource || resolvedSingleSource === sourceFilter) && /nyaa/i.test(sourceFilter)) {
      resolvedSingleSource = 'nyaasi';
    }
  }

  const indexers = forceSingleSource ? [resolvedSingleSource] : parseIndexerSpec(cfg, category);
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
    return { ok: true, items: merged, page: page, limit: limit, returned: merged.length };
  }

  if (forceSingleSource) {
    const retryPayload = { ...(payload || {}), noCategoryFilter: true };
    const retried = await fetchItemsForIndexer(cfg, retryPayload, resolvedSingleSource);
    if (retried && retried.ok) {
      const retryItems = Array.isArray(retried.items) ? retried.items : [];
      return { ok: true, items: retryItems, page: page, limit: limit, returned: retryItems.length };
    }
  }

  // If category-specific indexers fail (often due invalid alias/id), retry with Jackett 'all'.
  if (!forceSingleSource && (indexers.length > 1 || (indexers[0] && String(indexers[0]).toLowerCase() !== 'all'))) {
    const fallback = await fetchItemsForIndexer(cfg, payload || {}, 'all');
    if (fallback && fallback.ok) {
      const fallbackItems = Array.isArray(fallback.items) ? fallback.items : [];
      return { ok: true, items: fallbackItems, page: page, limit: limit, returned: fallbackItems.length };
    }
  }

  const firstErr = results.find(function (r) { return r && !r.ok; }) || {};
  const msg = String(firstErr.error || 'Search failed');
  if (/aborted/i.test(msg)) return { ok: false, items: [], error: 'Search timed out. Try a narrower filter or increase Jackett timeout.', page: page, limit: limit, returned: 0 };
  if (firstErr.status) return { ok: false, items: [], error: 'Search failed (HTTP ' + Number(firstErr.status || 0) + ')', page: page, limit: limit, returned: 0 };
  return { ok: false, items: [], error: msg, page: page, limit: limit, returned: 0 };
}

async function indexers(ctx) {
  const cfg = getJackettConfig(ctx);
  const live = await fetchConfiguredIndexers(cfg);
  if (live.length) return { ok: true, indexers: live, source: 'jackett' };
  const fallback = deriveIndexerFallback(cfg);
  return { ok: true, indexers: fallback, source: 'settings' };
}

module.exports = {
  health,
  query,
  indexers,
};
