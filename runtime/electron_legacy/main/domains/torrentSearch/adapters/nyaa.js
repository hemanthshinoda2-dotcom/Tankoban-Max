'use strict';

const {
  fetchText,
  normalizeResult,
  parseIntSafe,
  parseSizeToBytes
} = require('./common');

const BASE = 'https://nyaa.si';

function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function createNyaaAdapter() {
  return {
    id: 'nyaa',
    name: 'Nyaa',
    capabilities: { search: true, sort: ['seeders_desc'], categories: ['all', 'anime', 'tv', 'books', 'comics', 'videos'] },

    async health(ctx) {
      var timeoutMs = Number(ctx && ctx.timeoutMs) || 12000;
      var res = await fetchText(BASE + '/?f=0&c=0_0&q=test&s=seeders&o=desc', { timeoutMs: timeoutMs });
      return { ok: !!(res && res.ok), error: res && !res.ok ? String(res.error || 'Nyaa probe failed') : '' };
    },

    async search(ctx, query, options) {
      var opts = (options && typeof options === 'object') ? options : {};
      var limit = Math.max(1, Math.min(100, Number(opts.limit) || 40));
      var timeoutMs = Number(ctx && ctx.timeoutMs) || 12000;
      var url = BASE + '/?f=0&c=0_0&q=' + encodeURIComponent(String(query || '').trim()) + '&s=seeders&o=desc';
      var res = await fetchText(url, { timeoutMs: timeoutMs });
      if (!res || !res.ok) return { ok: false, items: [], error: String(res && res.error || 'Nyaa request failed') };
      var html = String(res.body || '');
      var rowRe = /<tr\b[\s\S]*?<\/tr>/ig;
      var out = [];
      var rowMatch;
      while ((rowMatch = rowRe.exec(html)) && out.length < limit) {
        var rowHtml = rowMatch[0];
        var magnetM = rowHtml.match(/href="(magnet:[^"]+)"/i);
        if (!magnetM) continue;
        var titleM = rowHtml.match(/<a[^>]*class="[^"]*?((?!comments)[^"])*"[^>]*title="([^"]+)"/i);
        var title = titleM ? String(titleM[2] || '').trim() : '';
        if (!title) {
          var titleFallbackM = rowHtml.match(/<a[^>]*href="\/view\/\d+"[^>]*>([\s\S]*?)<\/a>/i);
          title = titleFallbackM ? stripTags(titleFallbackM[1]) : '';
        }
        if (!title) continue;

        var tdRe = /<td[^>]*>([\s\S]*?)<\/td>/ig;
        var cols = [];
        var tdM;
        while ((tdM = tdRe.exec(rowHtml))) cols.push(tdM[1]);
        var sizeText = cols[3] ? stripTags(cols[3]) : '';
        var seedersText = cols[5] ? stripTags(cols[5]) : '0';

        var norm = normalizeResult({
          title: title,
          magnetUri: magnetM[1],
          sizeBytes: parseSizeToBytes(sizeText),
          seeders: Math.max(0, parseIntSafe(seedersText, 0)),
          sourceName: 'Nyaa',
          sourceKey: 'nyaa'
        }, 'Nyaa');
        if (norm) out.push(norm);
      }
      return { ok: true, items: out };
    }
  };
}

module.exports = { createNyaaAdapter };

