'use strict';

const { URL } = require('url');

const DEFAULT_TIMEOUT_MS = 12000;

function clampTimeoutMs(value, fallback) {
  var n = Number(value);
  if (!isFinite(n) || n <= 0) return fallback || DEFAULT_TIMEOUT_MS;
  if (n < 3000) return 3000;
  if (n > 45000) return 45000;
  return Math.round(n);
}

function hashString(value) {
  var s = String(value || '');
  var h = 0;
  for (var i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
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

function decodeXml(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseSizeToBytes(raw) {
  var text = String(raw || '').trim().toUpperCase().replace(/,/g, '');
  if (!text) return 0;
  var units = {
    B: 1,
    KB: 1024, KIB: 1024,
    MB: 1024 * 1024, MIB: 1024 * 1024,
    GB: 1024 * 1024 * 1024, GIB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024, TIB: 1024 * 1024 * 1024 * 1024
  };
  var keys = Object.keys(units).sort(function (a, b) { return b.length - a.length; });
  for (var i = 0; i < keys.length; i++) {
    var unit = keys[i];
    if (!text.endsWith(unit)) continue;
    var n = Number(text.slice(0, -unit.length).trim());
    if (!isFinite(n) || n < 0) return 0;
    return Math.round(n * units[unit]);
  }
  var v = Number(text);
  return (isFinite(v) && v > 0) ? Math.round(v) : 0;
}

function parseIntSafe(v, fallback) {
  var n = Number(v);
  if (!isFinite(n)) return fallback || 0;
  return Math.round(n);
}

function extractInfoHashFromMagnet(magnet) {
  var src = String(magnet || '').trim();
  if (!src) return '';
  var m = src.match(/btih:([a-fA-F0-9]{40})/i);
  if (m) return String(m[1] || '').toLowerCase();
  var b32 = src.match(/btih:([a-zA-Z2-7]{32})/i);
  if (b32) return String(b32[1] || '').toLowerCase();
  return '';
}

function normalizeResult(row, fallbackSource) {
  var r = (row && typeof row === 'object') ? row : {};
  var title = String(r.title || '').trim();
  var magnet = String(r.magnetUri || r.magnet || '').trim();
  if (!title || !/^magnet:/i.test(magnet)) return null;
  var sourceName = String(r.sourceName || fallbackSource || 'Indexer').trim() || 'Indexer';
  var sourceKey = normalizeSourceKey(r.sourceKey || sourceName);
  var stable = String(r.id || (sourceKey + '_' + hashString([title, magnet, sourceKey].join('::'))));
  var sizeBytes = parseIntSafe(r.sizeBytes, 0);
  var fileCount = parseIntSafe(r.fileCount, 0);
  var seeders = parseIntSafe(r.seeders, 0);
  var typeKeys = Array.isArray(r.typeKeys) ? r.typeKeys.map(function (x) { return String(x || '').trim().toLowerCase(); }).filter(Boolean) : [];
  var typeLabels = Array.isArray(r.typeLabels) ? r.typeLabels.map(function (x) { return String(x || '').trim(); }).filter(Boolean) : [];
  return {
    id: stable,
    title: title,
    magnetUri: magnet,
    sizeBytes: sizeBytes > 0 ? sizeBytes : null,
    files: fileCount > 0 ? fileCount : null,
    fileCount: fileCount > 0 ? fileCount : null,
    seeders: seeders > 0 ? seeders : 0,
    sourceName: sourceName,
    sourceKey: sourceKey,
    sourceUrl: String(r.sourceUrl || '').trim() || null,
    publishedAt: String(r.publishedAt || '').trim() || null,
    typeKeys: typeKeys,
    typeLabels: typeLabels
  };
}

async function fetchText(url, options) {
  var opts = (options && typeof options === 'object') ? options : {};
  var timeoutMs = clampTimeoutMs(opts.timeoutMs, DEFAULT_TIMEOUT_MS);
  var headers = Object.assign({ accept: '*/*', 'user-agent': opts.userAgent || 'Tankorent/1.0' }, opts.headers || {});
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
  try {
    var res = await fetch(url, { method: 'GET', signal: controller.signal, headers: headers });
    var text = await res.text();
    return { ok: !!(res && res.ok), status: Number(res && res.status || 0), body: String(text || ''), error: res && !res.ok ? ('HTTP ' + Number(res.status || 0)) : '' };
  } catch (err) {
    return { ok: false, status: 0, body: '', error: String((err && err.message) || err || 'request_failed') };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, options) {
  var textRes = await fetchText(url, options);
  if (!textRes.ok) return { ok: false, status: textRes.status, body: null, error: textRes.error };
  try {
    return { ok: true, status: textRes.status || 200, body: JSON.parse(textRes.body || 'null'), error: '' };
  } catch (err) {
    return { ok: false, status: textRes.status || 200, body: null, error: String((err && err.message) || err || 'invalid_json') };
  }
}

function parseTorznabItems(xml, sourceName, sourceKeyOverride, idPrefix) {
  var src = String(xml || '');
  var out = [];
  var itemRe = /<item\b[\s\S]*?<\/item>/ig;
  var m;
  while ((m = itemRe.exec(src))) {
    var item = m[0];
    var titleM = item.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    var title = titleM ? decodeXml(String(titleM[1] || '').trim()) : '';
    var linkM = item.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    var link = linkM ? decodeXml(String(linkM[1] || '').trim()) : '';
    var encM = item.match(/<enclosure[^>]*url="(magnet:[^"]+)"/i);
    var magnet = encM ? decodeXml(encM[1]) : (/^magnet:/i.test(link) ? link : '');
    if (!title || !magnet) continue;

    var sourceAttr = item.match(/<torznab:attr[^>]*name="(?:indexer|tracker)"[^>]*value="([^"]*)"/i);
    var sourceNameResolved = sourceAttr ? decodeXml(String(sourceAttr[1] || '').trim()) : String(sourceName || 'Indexer');
    var sourceKey = normalizeSourceKey(sourceKeyOverride || sourceNameResolved);
    var seedersM = item.match(/<torznab:attr[^>]*name="seeders"[^>]*value="([^"]*)"/i);
    var filesM = item.match(/<torznab:attr[^>]*name="files"[^>]*value="([^"]*)"/i);
    var sizeM = item.match(/<(?:size|torrent:size)[^>]*>([\s\S]*?)<\/(?:size|torrent:size)>/i);
    var sizeAttrM = item.match(/<torznab:attr[^>]*name="size"[^>]*value="([^"]*)"/i);
    var sizeBytes = parseSizeToBytes(sizeM ? decodeXml(sizeM[1]) : (sizeAttrM ? decodeXml(sizeAttrM[1]) : '0'));
    var commentsM = item.match(/<comments[^>]*>([\s\S]*?)<\/comments>/i);
    var pubM = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);

    var row = normalizeResult({
      id: (idPrefix || sourceKey || 'indexer') + '_' + hashString([title, magnet, sourceKey].join('::')),
      title: title,
      magnetUri: magnet,
      sizeBytes: sizeBytes,
      fileCount: parseIntSafe(filesM ? decodeXml(filesM[1]) : 0, 0),
      seeders: parseIntSafe(seedersM ? decodeXml(seedersM[1]) : 0, 0),
      sourceName: sourceNameResolved,
      sourceKey: sourceKey,
      sourceUrl: commentsM ? decodeXml(String(commentsM[1] || '').trim()) : '',
      publishedAt: pubM ? decodeXml(String(pubM[1] || '').trim()) : ''
    }, sourceNameResolved);
    if (row) out.push(row);
  }
  return out;
}

function sortResults(rows) {
  return (Array.isArray(rows) ? rows.slice() : []).sort(function (a, b) {
    var sa = parseIntSafe(a && a.seeders, 0);
    var sb = parseIntSafe(b && b.seeders, 0);
    if (sb !== sa) return sb - sa;
    var ta = Date.parse(String(a && a.publishedAt || '')) || 0;
    var tb = Date.parse(String(b && b.publishedAt || '')) || 0;
    if (tb !== ta) return tb - ta;
    return String(a && a.title || '').localeCompare(String(b && b.title || ''), undefined, { sensitivity: 'base' });
  });
}

function dedupeResults(rows) {
  var out = [];
  var seen = new Set();
  var src = Array.isArray(rows) ? rows : [];
  for (var i = 0; i < src.length; i++) {
    var row = src[i];
    var infoHash = extractInfoHashFromMagnet(row && row.magnetUri);
    var key = infoHash || String(row && (row.magnetUri || row.id || row.title) || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function normalizeBaseUrl(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  try {
    var u = new URL(s);
    if (!u.host) return '';
    if (!/^https?:$/i.test(u.protocol)) return '';
    return u.protocol.toLowerCase() + '//' + u.host;
  } catch (_e) {
    return '';
  }
}

function boundedParallel(items, limit, worker) {
  var list = asArray(items);
  var max = Math.max(1, Number(limit) || 1);
  return new Promise(function (resolve) {
    var results = new Array(list.length);
    var index = 0;
    var active = 0;
    function launchNext() {
      if (index >= list.length && active === 0) {
        resolve(results);
        return;
      }
      while (active < max && index < list.length) {
        (function (slot, item) {
          active += 1;
          Promise.resolve().then(function () {
            return worker(item, slot);
          }).then(function (res) {
            results[slot] = res;
          }).catch(function (err) {
            results[slot] = { ok: false, error: String((err && err.message) || err || 'worker_failed') };
          }).finally(function () {
            active -= 1;
            launchNext();
          });
        })(index, list[index]);
        index += 1;
      }
    }
    launchNext();
  });
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  clampTimeoutMs,
  hashString,
  normalizeSourceKey,
  titleCaseWords,
  decodeXml,
  parseSizeToBytes,
  parseIntSafe,
  extractInfoHashFromMagnet,
  normalizeResult,
  fetchText,
  fetchJson,
  parseTorznabItems,
  sortResults,
  dedupeResults,
  normalizeBaseUrl,
  boundedParallel
};

