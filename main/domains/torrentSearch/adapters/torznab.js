'use strict';

const {
  fetchText,
  parseTorznabItems,
  normalizeBaseUrl
} = require('./common');

function getCategoryCats(category) {
  var key = String(category || 'all').trim().toLowerCase();
  if (key === 'all') return '7030,7020,7000,5000,5030,5040';
  if (key === 'comics') return '7030,7020';
  if (key === 'books') return '7000';
  if (key === 'tv' || key === 'videos' || key === 'anime') return '5000,5030,5040,5070';
  return '';
}

function buildTorznabUrl(baseUrl, endpointPath, query, options) {
  var opts = (options && typeof options === 'object') ? options : {};
  var srcBase = normalizeBaseUrl(baseUrl);
  var path = String(endpointPath || '/api').trim() || '/api';
  if (!path.startsWith('/')) path = '/' + path;
  var url = srcBase + path;
  var qs = new URLSearchParams();
  qs.set('t', 'search');
  if (query) qs.set('q', String(query));
  if (opts.apiKey) qs.set('apikey', String(opts.apiKey));
  var cats = getCategoryCats(opts.category);
  if (cats) qs.set('cat', cats);
  if (Number(opts.limit) > 0) qs.set('limit', String(Math.max(1, Math.min(100, Number(opts.limit)))));
  if (Number(opts.offset) > 0) qs.set('offset', String(Math.max(0, Number(opts.offset))));
  return url + '?' + qs.toString();
}

function createTorznabAdapter(indexer) {
  var cfg = (indexer && typeof indexer === 'object') ? indexer : {};
  var id = String(cfg.id || '').trim();
  var name = String(cfg.name || id || 'Indexer').trim() || 'Indexer';
  var baseUrl = normalizeBaseUrl(cfg.baseUrl);
  var endpointPath = String(cfg.endpointPath || '/api').trim() || '/api';
  var apiKey = String(cfg.apiKey || '').trim();

  return {
    id: id,
    name: name,
    capabilities: { search: true, sort: ['seeders_desc'], categories: ['all', 'comics', 'books', 'tv', 'anime', 'videos'] },

    async health(ctx) {
      if (!baseUrl) return { ok: false, error: 'missing_base_url' };
      var timeoutMs = Number(ctx && ctx.timeoutMs) || 12000;
      var capsUrl = buildTorznabUrl(baseUrl, endpointPath, '', { apiKey: apiKey, category: 'all', limit: 1, offset: 0 }).replace('t=search', 't=caps');
      var res = await fetchText(capsUrl, { timeoutMs: timeoutMs, headers: { accept: 'application/xml,text/xml,*/*' } });
      return { ok: !!(res && res.ok), error: res && !res.ok ? String(res.error || 'torznab_probe_failed') : '' };
    },

    async search(ctx, query, options) {
      if (!baseUrl) return { ok: false, items: [], error: 'missing_base_url' };
      var opts = (options && typeof options === 'object') ? options : {};
      var timeoutMs = Number(ctx && ctx.timeoutMs) || 12000;
      var url = buildTorznabUrl(baseUrl, endpointPath, query, {
        apiKey: apiKey,
        category: opts.category || 'all',
        limit: opts.limit || 40,
        offset: opts.offset || 0
      });
      var res = await fetchText(url, { timeoutMs: timeoutMs, headers: { accept: 'application/xml,text/xml,*/*' } });
      if (!res || !res.ok) return { ok: false, items: [], error: String(res && res.error || 'torznab_search_failed') };
      var items = parseTorznabItems(res.body, name, id, 'tankorent');
      return { ok: true, items: items };
    }
  };
}

module.exports = { createTorznabAdapter };

