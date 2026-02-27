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

async function readSettings(ctx) {
  try {
    const raw = await ctx.storage.readJSONAsync(ctx.storage.dataPath(WEB_SETTINGS_FILE), {});
    return (raw && raw.settings && typeof raw.settings === 'object') ? raw.settings : (raw || {});
  } catch (_e) {
    return {};
  }
}

function normalizeProvider(value) {
  const key = String(value || '').trim().toLowerCase();
  return key === 'prowlarr' ? 'prowlarr' : 'jackett';
}

function normalizeCommonProviderConfig(src) {
  const inObj = (src && typeof src === 'object') ? src : {};
  const timeoutMs = Number(inObj.timeoutMs || 30000);
  const idxMap = (inObj.indexersByCategory && typeof inObj.indexersByCategory === 'object')
    ? inObj.indexersByCategory
    : {};
  return {
    baseUrl: String(inObj.baseUrl || '').trim().replace(/\/+$/, ''),
    apiKey: String(inObj.apiKey || '').trim(),
    indexer: String(inObj.indexer || 'all').trim() || 'all',
    timeoutMs: (isFinite(timeoutMs) && timeoutMs > 0) ? timeoutMs : 30000,
    indexersByCategory: {
      all: String(idxMap.all || 'all').trim() || 'all',
      comics: String(idxMap.comics || idxMap.anime || idxMap.manga || 'all').trim() || 'all',
      books: String(idxMap.books || idxMap.audiobooks || 'all').trim() || 'all',
      tv: String(idxMap.tv || idxMap.movies || 'all').trim() || 'all'
    }
  };
}

async function getProviderConfig(ctx) {
  const s = await readSettings(ctx);
  const torrentSearch = (s && s.torrentSearch && typeof s.torrentSearch === 'object') ? s.torrentSearch : {};
  const provider = normalizeProvider(torrentSearch.provider || s.torrentSearchProvider || 'jackett');
  const jackett = normalizeCommonProviderConfig((s && s.jackett && typeof s.jackett === 'object') ? s.jackett : {
    baseUrl: s.jackettBaseUrl,
    apiKey: s.jackettApiKey,
    indexer: s.jackettIndexer,
    timeoutMs: s.jackettTimeoutMs,
    indexersByCategory: s.jackettIndexersByCategory,
  });
  const prowlarr = normalizeCommonProviderConfig((s && s.prowlarr && typeof s.prowlarr === 'object') ? s.prowlarr : {
    baseUrl: s.prowlarrBaseUrl,
    apiKey: s.prowlarrApiKey,
    indexer: s.prowlarrIndexer,
    timeoutMs: s.prowlarrTimeoutMs,
    indexersByCategory: s.prowlarrIndexersByCategory,
  });
  return {
    provider,
    current: provider === 'prowlarr' ? prowlarr : jackett,
    jackett,
    prowlarr,
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

function parseItems(xml, indexerName, idPrefix) {
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
    const stableId = (idPrefix || 'jackett') + '_' + hashString([title, magnetUri, sourceKey].join('::'));

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

function defaultResultEnvelope(payload) {
  const page = Math.max(0, Number(payload && payload.page) || 0);
  const limitRaw = Number(payload && payload.limit);
  const limit = Math.max(1, Math.min(MAX_LIMIT, isFinite(limitRaw) && limitRaw > 0 ? limitRaw : DEFAULT_LIMIT));
  return { page: page, limit: limit };
}

async function fetchText(url, cfg, extraHeaders) {
  const controller = new AbortController();
  const t = setTimeout(function () { controller.abort(); }, Math.max(4000, Number(cfg.timeoutMs) || 30000));
  try {
    const headers = Object.assign({ accept: 'application/xml,text/xml,*/*' }, extraHeaders || {});
    const res = await fetch(url, { signal: controller.signal, headers: headers });
    clearTimeout(t);
    if (!res || !res.ok) return { ok: false, status: Number(res && res.status || 0), body: '', error: 'HTTP ' + Number(res && res.status || 0) };
    const body = await res.text();
    return { ok: true, status: Number(res.status || 200), body: body };
  } catch (err) {
    clearTimeout(t);
    return { ok: false, status: 0, body: '', error: String((err && err.message) || err || 'Request failed') };
  }
}

async function fetchJson(url, cfg, extraHeaders) {
  const controller = new AbortController();
  const t = setTimeout(function () { controller.abort(); }, Math.max(4000, Number(cfg.timeoutMs) || 30000));
  try {
    const headers = Object.assign({ accept: 'application/json,*/*' }, extraHeaders || {});
    const res = await fetch(url, { signal: controller.signal, headers: headers });
    clearTimeout(t);
    if (!res || !res.ok) return { ok: false, status: Number(res && res.status || 0), body: null, error: 'HTTP ' + Number(res && res.status || 0) };
    const body = await res.json();
    return { ok: true, status: Number(res.status || 200), body: body };
  } catch (err) {
    clearTimeout(t);
    return { ok: false, status: 0, body: null, error: String((err && err.message) || err || 'Request failed') };
  }
}

const providers = {
  jackett: {
    name: 'Jackett',
    healthMessage: 'Configure Jackett base URL + API key',
    headers: function () { return {}; },

    buildSearchUrl: function (cfg, payload, indexerOverride) {
      const q = String(payload && payload.query || '').trim();
      const category = String(payload && payload.category || 'all').trim().toLowerCase();
      const noCategoryFilter = !!(payload && payload.noCategoryFilter);
      const envelope = defaultResultEnvelope(payload);
      const offset = envelope.page * envelope.limit;
      const categoryIndexer = (
        cfg && cfg.indexersByCategory && cfg.indexersByCategory[category] && String(cfg.indexersByCategory[category]).trim()
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
      u.searchParams.set('limit', String(envelope.limit));
      u.searchParams.set('offset', String(offset));
      return u.toString();
    },

    fetchConfiguredIndexers: async function (cfg) {
      if (!cfg || !cfg.baseUrl || !cfg.apiKey || typeof fetch !== 'function') return [];
      const u = new URL(cfg.baseUrl + '/api/v2.0/indexers');
      u.searchParams.set('apikey', cfg.apiKey);
      u.searchParams.set('configured', 'true');
      const res = await fetchJson(u.toString(), cfg);
      if (!res.ok) return [];
      const body = res.body;
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
    },

    health: async function (cfg) {
      const testUrl = cfg.baseUrl + '/api/v2.0/indexers/all/results/torznab/api?t=caps&apikey=' + encodeURIComponent(cfg.apiKey);
      const res = await fetchText(testUrl, cfg);
      if (!res.ok) return { ok: true, ready: false, error: 'Jackett unreachable (HTTP ' + Number(res.status || 0) + ')', details: { configured: true } };
      return { ok: true, ready: true, details: { configured: true, indexer: cfg.indexer } };
    },

    searchOne: async function (cfg, payload, indexerName) {
      const url = providers.jackett.buildSearchUrl(cfg, payload || {}, indexerName);
      const res = await fetchText(url, cfg);
      if (!res.ok) return { ok: false, status: res.status, items: [], error: res.error, indexer: indexerName };
      return { ok: true, status: 200, items: parseItems(res.body, indexerName, 'jackett'), indexer: indexerName };
    }
  },

  prowlarr: {
    name: 'Prowlarr',
    healthMessage: 'Configure Prowlarr base URL + API key',
    headers: function (cfg) {
      return cfg && cfg.apiKey ? { 'X-Api-Key': cfg.apiKey } : {};
    },

    buildSearchUrlJson: function (cfg, payload, indexerIds) {
      const q = String(payload && payload.query || '').trim();
      const envelope = defaultResultEnvelope(payload);
      const u = new URL(cfg.baseUrl + '/api/v1/search');
      u.searchParams.set('query', q);
      u.searchParams.set('type', 'search');
      u.searchParams.set('limit', String(envelope.limit));
      u.searchParams.set('offset', String(envelope.page * envelope.limit));
      const ids = Array.isArray(indexerIds) ? indexerIds.filter(Boolean) : [];
      if (ids.length) u.searchParams.set('indexerIds', ids.join(','));
      return u.toString();
    },

    buildSearchUrlTorznab: function (cfg, payload, indexerId) {
      const q = String(payload && payload.query || '').trim();
      const category = String(payload && payload.category || 'all').trim().toLowerCase();
      const noCategoryFilter = !!(payload && payload.noCategoryFilter);
      const envelope = defaultResultEnvelope(payload);
      const offset = envelope.page * envelope.limit;
      const u = new URL(cfg.baseUrl + '/api/v1/indexer/' + encodeURIComponent(String(indexerId || 'all')) + '/newznab/api');
      u.searchParams.set('t', 'search');
      if (q) u.searchParams.set('q', q);
      if (!noCategoryFilter) {
        const cats = getCategoryCats(category);
        if (cats) u.searchParams.set('cat', cats);
      }
      u.searchParams.set('limit', String(envelope.limit));
      u.searchParams.set('offset', String(offset));
      u.searchParams.set('apikey', cfg.apiKey);
      return u.toString();
    },

    normalizeIndexerRow: function (row) {
      const idRaw = row && (row.id != null ? row.id : (row.indexerId != null ? row.indexerId : row.indexer));
      const id = String(idRaw != null ? idRaw : '').trim();
      if (!id) return null;
      const name = String(row && (row.name || row.title || row.appProfileName) || '').trim() || humanizeIndexerName(id);
      return { id: id, name: name || id };
    },

    fetchConfiguredIndexers: async function (cfg) {
      if (!cfg || !cfg.baseUrl || !cfg.apiKey || typeof fetch !== 'function') return [];
      const u = new URL(cfg.baseUrl + '/api/v1/indexer');
      const res = await fetchJson(u.toString(), cfg, providers.prowlarr.headers(cfg));
      if (!res.ok) return [];
      const rows = Array.isArray(res.body) ? res.body : [];
      if (!rows.length) return [];
      const out = [];
      const seen = new Set();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || {};
        const enabled = row.enable !== false && row.enabled !== false;
        if (!enabled) continue;
        const proto = String(row.protocol || '').toLowerCase();
        if (proto && proto !== 'torrent') continue;
        const norm = providers.prowlarr.normalizeIndexerRow(row);
        if (!norm) continue;
        const key = norm.id.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(norm);
      }
      return sortIndexers(out);
    },

    health: async function (cfg) {
      const u = new URL(cfg.baseUrl + '/api/v1/health');
      const ping = await fetchJson(u.toString(), cfg, providers.prowlarr.headers(cfg));
      if (ping.ok) return { ok: true, ready: true, details: { configured: true, indexer: cfg.indexer } };
      const u2 = new URL(cfg.baseUrl + '/api/v1/system/status');
      const ping2 = await fetchJson(u2.toString(), cfg, providers.prowlarr.headers(cfg));
      if (ping2.ok) return { ok: true, ready: true, details: { configured: true, indexer: cfg.indexer } };
      return { ok: true, ready: false, error: 'Prowlarr unreachable (HTTP ' + Number((ping.status || ping2.status || 0)) + ')', details: { configured: true } };
    },

    parseItemsFromJson: function (rows) {
      const out = [];
      const seen = new Set();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || {};
        const title = String(row.title || row.releaseTitle || '').trim();
        const magnetUri = String(row.magnetUrl || row.downloadUrl || row.magnet || '').trim();
        if (!title || !/^magnet:/i.test(magnetUri)) continue;
        const sourceName = String(row.indexer || row.indexerName || row.site || '').trim() || 'Indexer';
        const sourceKey = normalizeSourceKey(sourceName);

        const typeMap = new Map();
        const categories = Array.isArray(row.categories) ? row.categories : [];
        for (let j = 0; j < categories.length; j++) {
          const c = categories[j] || {};
          const catLabel = String(c.name || c.label || '').trim();
          const catId = Number(c.id);
          if (catLabel) {
            const parsed = typeFromLabel(catLabel);
            if (parsed) addTypeFacet(typeMap, parsed.key, parsed.label);
          }
          if (isFinite(catId)) {
            const mapped = mapCategoryCodeToType(catId);
            if (mapped) addTypeFacet(typeMap, mapped.key, mapped.label);
          }
        }
        const entries = Array.from(typeMap.entries());
        const stableId = 'prowlarr_' + hashString([title, magnetUri, sourceKey].join('::'));

        const dedupeKey = magnetUri.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        out.push({
          id: stableId,
          title: title,
          sizeBytes: toNumber(row.size || row.sizeBytes, 0) || null,
          fileCount: toNumber(row.files || row.fileCount, 0) || null,
          seeders: Math.max(0, toNumber(row.seeders, 0) || 0),
          magnetUri: magnetUri,
          sourceName: sourceName,
          sourceKey: sourceKey,
          sourceUrl: String(row.infoUrl || row.guid || '').trim() || null,
          publishedAt: String(row.publishDate || row.pubDate || '').trim() || null,
          typeKeys: entries.map(function (e) { return e[0]; }),
          typeLabels: entries.map(function (e) { return e[1]; }),
        });
      }
      return out;
    },

    searchOne: async function (cfg, payload, indexerNameOrId) {
      const jsonUrl = providers.prowlarr.buildSearchUrlJson(cfg, payload, indexerNameOrId && String(indexerNameOrId).toLowerCase() !== 'all' ? [String(indexerNameOrId)] : []);
      const jsonRes = await fetchJson(jsonUrl, cfg, providers.prowlarr.headers(cfg));
      if (jsonRes.ok) {
        const rows = Array.isArray(jsonRes.body) ? jsonRes.body : [];
        return { ok: true, status: 200, items: providers.prowlarr.parseItemsFromJson(rows), indexer: indexerNameOrId };
      }

      const torzUrl = providers.prowlarr.buildSearchUrlTorznab(cfg, payload, indexerNameOrId || 'all');
      const torzRes = await fetchText(torzUrl, cfg, providers.prowlarr.headers(cfg));
      if (!torzRes.ok) {
        return { ok: false, status: torzRes.status, items: [], error: torzRes.error, indexer: indexerNameOrId };
      }
      return { ok: true, status: 200, items: parseItems(torzRes.body, indexerNameOrId, 'prowlarr'), indexer: indexerNameOrId };
    }
  }
};

function emitStatus(ctx, payload) {
  try {
    ctx.win && ctx.win.webContents && ctx.win.webContents.send(EVENT.TORRENT_SEARCH_STATUS_CHANGED, payload || {});
  } catch (_e) {}
}

async function resolveSourceFilter(providerImpl, cfg, sourceFilter) {
  if (!sourceFilter || sourceFilter.toLowerCase() === 'all') return sourceFilter;
  const live = await providerImpl.fetchConfiguredIndexers(cfg);
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
  if (hit && hit.id) return String(hit.id);
  if (/nyaa/i.test(sourceFilter)) return providerImpl === providers.jackett ? 'nyaasi' : sourceFilter;
  return sourceFilter;
}

function mergeProviderResults(results) {
  const merged = [];
  const seen = new Set();
  results.forEach(function (r) {
    if (!r || !r.ok || !Array.isArray(r.items)) return;
    r.items.forEach(function (it) {
      const key = String(it && (it.magnetUri || it.id || it.title) || '').trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(it);
    });
  });
  return merged;
}

async function health(ctx) {
  const cfgSet = await getProviderConfig(ctx);
  const providerKey = cfgSet.provider;
  const providerImpl = providers[providerKey] || providers.jackett;
  const cfg = cfgSet.current;

  if (!cfg.baseUrl || !cfg.apiKey) {
    const out = { ok: true, ready: false, error: providerImpl.healthMessage, details: { configured: false, provider: providerKey } };
    emitStatus(ctx, out);
    return out;
  }
  if (typeof fetch !== 'function') {
    const out = { ok: false, ready: false, error: 'Fetch API unavailable in main process', details: { configured: true, provider: providerKey } };
    emitStatus(ctx, out);
    return out;
  }

  try {
    const out = await providerImpl.health(cfg);
    out.details = Object.assign({}, out.details || {}, { provider: providerKey });
    emitStatus(ctx, out);
    return out;
  } catch (err) {
    const msg = String((err && err.message) || err || (providerImpl.name + ' request failed'));
    const out = { ok: true, ready: false, error: msg, details: { configured: true, provider: providerKey } };
    emitStatus(ctx, out);
    return out;
  }
}

async function query(ctx, _evt, payload) {
  const cfgSet = await getProviderConfig(ctx);
  const providerKey = cfgSet.provider;
  const providerImpl = providers[providerKey] || providers.jackett;
  const cfg = cfgSet.current;
  const envelope = defaultResultEnvelope(payload);

  if (!cfg.baseUrl || !cfg.apiKey) {
    return { ok: false, items: [], error: providerImpl.name + ' is not configured', page: envelope.page, limit: envelope.limit, returned: 0, provider: providerKey };
  }
  if (typeof fetch !== 'function') {
    return { ok: false, items: [], error: 'Fetch API unavailable in main process', page: envelope.page, limit: envelope.limit, returned: 0, provider: providerKey };
  }

  const queryText = String(payload && payload.query || '').trim();
  if (!queryText) return { ok: true, items: [], page: envelope.page, limit: envelope.limit, returned: 0, provider: providerKey };

  const category = String(payload && payload.category || 'all').trim().toLowerCase();
  const sourceFilter = String(payload && (payload.source || payload.indexer) || '').trim();
  const forceSingleSource = sourceFilter && sourceFilter.toLowerCase() !== 'all';
  let resolvedSingleSource = sourceFilter;
  if (forceSingleSource) resolvedSingleSource = await resolveSourceFilter(providerImpl, cfg, sourceFilter);

  const indexers = forceSingleSource ? [resolvedSingleSource] : parseIndexerSpec(cfg, category);
  const results = await Promise.all(indexers.map(function (idx) {
    return providerImpl.searchOne(cfg, payload || {}, idx);
  }));

  const okAny = results.some(function (r) { return !!(r && r.ok); });
  if (okAny) {
    const merged = mergeProviderResults(results);
    return { ok: true, items: merged, page: envelope.page, limit: envelope.limit, returned: merged.length, provider: providerKey };
  }

  if (forceSingleSource) {
    const retryPayload = { ...(payload || {}), noCategoryFilter: true };
    const retried = await providerImpl.searchOne(cfg, retryPayload, resolvedSingleSource);
    if (retried && retried.ok) {
      const retryItems = Array.isArray(retried.items) ? retried.items : [];
      return { ok: true, items: retryItems, page: envelope.page, limit: envelope.limit, returned: retryItems.length, provider: providerKey };
    }
  }

  if (!forceSingleSource && (indexers.length > 1 || (indexers[0] && String(indexers[0]).toLowerCase() !== 'all'))) {
    const fallback = await providerImpl.searchOne(cfg, payload || {}, 'all');
    if (fallback && fallback.ok) {
      const fallbackItems = Array.isArray(fallback.items) ? fallback.items : [];
      return { ok: true, items: fallbackItems, page: envelope.page, limit: envelope.limit, returned: fallbackItems.length, provider: providerKey };
    }
  }

  const firstErr = results.find(function (r) { return r && !r.ok; }) || {};
  const msg = String(firstErr.error || 'Search failed');
  if (/aborted/i.test(msg)) return { ok: false, items: [], error: 'Search timed out. Try a narrower filter or increase timeout.', page: envelope.page, limit: envelope.limit, returned: 0, provider: providerKey };
  if (firstErr.status) return { ok: false, items: [], error: 'Search failed (HTTP ' + Number(firstErr.status || 0) + ')', page: envelope.page, limit: envelope.limit, returned: 0, provider: providerKey };
  return { ok: false, items: [], error: msg, page: envelope.page, limit: envelope.limit, returned: 0, provider: providerKey };
}

async function indexers(ctx) {
  const cfgSet = await getProviderConfig(ctx);
  const providerKey = cfgSet.provider;
  const providerImpl = providers[providerKey] || providers.jackett;
  const cfg = cfgSet.current;
  const live = await providerImpl.fetchConfiguredIndexers(cfg);
  if (live.length) return { ok: true, indexers: live, source: providerKey, provider: providerKey };
  const fallback = deriveIndexerFallback(cfg);
  return { ok: true, indexers: fallback, source: 'settings', provider: providerKey };
}

module.exports = {
  health,
  query,
  indexers,
};
