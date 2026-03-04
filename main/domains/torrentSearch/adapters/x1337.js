'use strict';

const {
  fetchText,
  normalizeResult,
  parseIntSafe,
  parseSizeToBytes,
  boundedParallel
} = require('./common');

const BASE = 'https://1337x.to';

function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchMagnetForDetailPath(path, timeoutMs) {
  var detail = await fetchText(BASE + path, { timeoutMs: timeoutMs });
  if (!detail || !detail.ok) return '';
  var magnetM = String(detail.body || '').match(/href="(magnet:[^"]+)"/i);
  return magnetM ? String(magnetM[1] || '').trim() : '';
}

function createX1337Adapter() {
  return {
    id: '1337x',
    name: '1337x',
    capabilities: { search: true, sort: ['seeders_desc'], categories: ['all', 'movies', 'tv', 'anime', 'books', 'comics', 'videos'] },

    async health(ctx) {
      var timeoutMs = Number(ctx && ctx.timeoutMs) || 12000;
      var res = await fetchText(BASE + '/search/test/1/', { timeoutMs: timeoutMs });
      return { ok: !!(res && res.ok), error: res && !res.ok ? String(res.error || '1337x probe failed') : '' };
    },

    async search(ctx, query, options) {
      var opts = (options && typeof options === 'object') ? options : {};
      var limit = Math.max(1, Math.min(80, Number(opts.limit) || 30));
      var timeoutMs = Number(ctx && ctx.timeoutMs) || 12000;
      var url = BASE + '/search/' + encodeURIComponent(String(query || '').trim()) + '/1/';
      var res = await fetchText(url, { timeoutMs: timeoutMs });
      if (!res || !res.ok) return { ok: false, items: [], error: String(res && res.error || '1337x request failed') };
      var html = String(res.body || '');
      var rowRe = /<tr\b[\s\S]*?<\/tr>/ig;
      var rows = [];
      var m;
      while ((m = rowRe.exec(html)) && rows.length < limit) {
        var rowHtml = m[0];
        var linkM = rowHtml.match(/href="(\/torrent\/[^"]+)"/i);
        if (!linkM) continue;
        var titleM = rowHtml.match(/<a[^>]*href="\/torrent\/[^"]+"[^>]*>([\s\S]*?)<\/a>/i);
        var title = titleM ? stripTags(titleM[1]) : '';
        if (!title) continue;
        var tdRe = /<td[^>]*>([\s\S]*?)<\/td>/ig;
        var cols = [];
        var tdM;
        while ((tdM = tdRe.exec(rowHtml))) cols.push(tdM[1]);
        rows.push({
          detailPath: linkM[1],
          title: title,
          seedersText: cols[1] ? stripTags(cols[1]) : '0',
          sizeText: cols[4] ? stripTags(cols[4]) : (cols[3] ? stripTags(cols[3]) : '')
        });
      }
      if (!rows.length) return { ok: true, items: [] };

      var magnetRows = await boundedParallel(rows, 5, async function (row) {
        var magnet = await fetchMagnetForDetailPath(row.detailPath, timeoutMs);
        return Object.assign({}, row, { magnet: magnet });
      });

      var out = [];
      for (var i = 0; i < magnetRows.length; i++) {
        var row = magnetRows[i] || {};
        if (!row.magnet || !/^magnet:/i.test(row.magnet)) continue;
        var norm = normalizeResult({
          title: row.title,
          magnetUri: row.magnet,
          sizeBytes: parseSizeToBytes(row.sizeText),
          seeders: Math.max(0, parseIntSafe(row.seedersText, 0)),
          sourceName: '1337x',
          sourceKey: '1337x'
        }, '1337x');
        if (norm) out.push(norm);
      }
      return { ok: true, items: out };
    }
  };
}

module.exports = { createX1337Adapter };

