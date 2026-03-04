'use strict';

const {
  fetchJson,
  normalizeResult,
  parseIntSafe
} = require('./common');

const API_BASE = 'https://apibay.org';

function buildMagnet(infoHash, title) {
  var ih = String(infoHash || '').trim();
  if (!ih) return '';
  var dn = encodeURIComponent(String(title || '').trim());
  return 'magnet:?xt=urn:btih:' + ih
    + '&dn=' + dn
    + '&tr=udp://tracker.opentrackr.org:1337/announce'
    + '&tr=udp://open.stealth.si:80/announce'
    + '&tr=udp://tracker.torrent.eu.org:451/announce'
    + '&tr=udp://tracker.openbittorrent.com:6969/announce';
}

function createPirateBayAdapter() {
  return {
    id: 'piratebay',
    name: 'PirateBay',
    capabilities: { search: true, sort: ['seeders_desc'], categories: ['all', 'comics', 'books', 'tv', 'anime', 'videos'] },

    async health(ctx) {
      var timeoutMs = Number(ctx && ctx.timeoutMs) || 12000;
      var res = await fetchJson(API_BASE + '/q.php?q=test', { timeoutMs: timeoutMs });
      return {
        ok: !!(res && res.ok),
        error: res && !res.ok ? String(res.error || 'PirateBay probe failed') : ''
      };
    },

    async search(ctx, query, options) {
      var opts = (options && typeof options === 'object') ? options : {};
      var limit = Math.max(1, Math.min(100, Number(opts.limit) || 40));
      var timeoutMs = Number(ctx && ctx.timeoutMs) || 12000;
      var url = API_BASE + '/q.php?q=' + encodeURIComponent(String(query || '').trim());
      var res = await fetchJson(url, { timeoutMs: timeoutMs });
      if (!res || !res.ok || !Array.isArray(res.body)) {
        return { ok: false, items: [], error: String(res && res.error || 'PirateBay request failed') };
      }
      var out = [];
      for (var i = 0; i < res.body.length && out.length < limit; i++) {
        var row = res.body[i] || {};
        var title = String(row.name || '').trim();
        var magnet = buildMagnet(row.info_hash, title);
        if (!title || !magnet) continue;
        var norm = normalizeResult({
          title: title,
          magnetUri: magnet,
          sizeBytes: parseIntSafe(row.size, 0),
          seeders: Math.max(0, parseIntSafe(row.seeders, 0)),
          fileCount: null,
          sourceName: 'PirateBay',
          sourceKey: 'piratebay'
        }, 'PirateBay');
        if (norm) out.push(norm);
      }
      return { ok: true, items: out };
    }
  };
}

module.exports = { createPirateBayAdapter };

