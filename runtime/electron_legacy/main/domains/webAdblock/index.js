// Built-in ad blocker (network blocklist driven).

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const CFG_FILE = 'web_adblock.json';
const LISTS_FILE = 'web_adblock_lists.json';
const DEFAULT_LIST_URLS = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
];

var cfgCache = null;
var listCache = null;
var listDomainSet = null;
var listUpdatePromise = null;

function cfgPath() {
  return path.join(app.getPath('userData'), CFG_FILE);
}

function listPath() {
  return path.join(app.getPath('userData'), LISTS_FILE);
}

function ensureCfg() {
  if (cfgCache) return cfgCache;
  try {
    var raw = JSON.parse(fs.readFileSync(cfgPath(), 'utf8'));
    cfgCache = {
      enabled: raw && raw.enabled === false ? false : true,
      siteAllowlist: Array.isArray(raw && raw.siteAllowlist) ? raw.siteAllowlist : [],
      updatedAt: Number(raw && raw.updatedAt || Date.now()) || Date.now(),
      blockedCount: Number(raw && raw.blockedCount || 0) || 0,
      lastListUpdateAt: Number(raw && raw.lastListUpdateAt || 0) || 0,
      listUrls: Array.isArray(raw && raw.listUrls) && raw.listUrls.length ? raw.listUrls : DEFAULT_LIST_URLS.slice(0),
    };
  } catch {
    cfgCache = {
      enabled: true,
      siteAllowlist: [],
      updatedAt: Date.now(),
      blockedCount: 0,
      lastListUpdateAt: 0,
      listUrls: DEFAULT_LIST_URLS.slice(0),
    };
  }
  return cfgCache;
}

function ensureLists() {
  if (listCache) return listCache;
  try {
    var raw = JSON.parse(fs.readFileSync(listPath(), 'utf8'));
    listCache = {
      domains: Array.isArray(raw && raw.domains) ? raw.domains : [],
      updatedAt: Number(raw && raw.updatedAt || 0) || 0,
      sourceCount: Number(raw && raw.sourceCount || 0) || 0,
    };
  } catch {
    listCache = { domains: [], updatedAt: 0, sourceCount: 0 };
  }
  listDomainSet = new Set(Array.isArray(listCache.domains) ? listCache.domains : []);
  return listCache;
}

function writeCfg() {
  try {
    fs.mkdirSync(path.dirname(cfgPath()), { recursive: true });
    fs.writeFileSync(cfgPath(), JSON.stringify(ensureCfg(), null, 2), 'utf8');
  } catch {}
}

function writeLists() {
  try {
    fs.mkdirSync(path.dirname(listPath()), { recursive: true });
    fs.writeFileSync(listPath(), JSON.stringify(ensureLists(), null, 2), 'utf8');
  } catch {}
  try {
    var lists = ensureLists();
    listDomainSet = new Set(Array.isArray(lists.domains) ? lists.domains : []);
  } catch {}
}

function normalizeHost(raw) {
  var host = String(raw || '').trim().toLowerCase();
  if (!host) return '';
  host = host.replace(/^\.+/, '').replace(/\.+$/, '');
  if (!host) return '';
  if (!/^[a-z0-9.-]+$/.test(host)) return '';
  return host;
}

function parseDomainsFromListText(text) {
  var set = new Set();
  var lines = String(text || '').split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = String(lines[i] || '').trim();
    if (!line || line[0] === '!' || line[0] === '[') continue;
    if (line.indexOf('##') !== -1 || line.indexOf('#@#') !== -1) continue;
    if (line.indexOf('||') !== 0) continue;
    var rule = line.slice(2);
    var stop = rule.search(/[\^\/$*]/);
    if (stop >= 0) rule = rule.slice(0, stop);
    if (!rule) continue;
    var host = normalizeHost(rule);
    if (!host) continue;
    set.add(host);
  }
  return set;
}

function emitUpdated(ctx) {
  try {
    var ipc = require('../../../shared/ipc');
    var cfg = ensureCfg();
    var lists = ensureLists();
    ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_ADBLOCK_UPDATED, {
      enabled: !!cfg.enabled,
      blockedCount: Number(cfg.blockedCount || 0),
      siteAllowlist: cfg.siteAllowlist || [],
      listUpdatedAt: Number(lists.updatedAt || 0),
      domainCount: Array.isArray(lists.domains) ? lists.domains.length : 0,
    });
  } catch {}
}

function getTopHost(urlLike) {
  try {
    var u = new URL(String(urlLike || ''));
    return normalizeHost(u.hostname || '');
  } catch {
    return '';
  }
}

function isSiteAllowlisted(firstPartyUrl) {
  var cfg = ensureCfg();
  var top = getTopHost(firstPartyUrl);
  if (!top) return false;
  for (var i = 0; i < cfg.siteAllowlist.length; i++) {
    var a = normalizeHost(cfg.siteAllowlist[i]);
    if (!a) continue;
    if (top === a || top.endsWith('.' + a)) return true;
  }
  return false;
}

function hostMatchesBlocked(hostname) {
  var host = normalizeHost(hostname);
  if (!host) return false;
  ensureLists();
  if (!listDomainSet) listDomainSet = new Set();
  var set = listDomainSet;
  var probe = host;
  while (probe) {
    if (set.has(probe)) return true;
    var dot = probe.indexOf('.');
    if (dot < 0) break;
    probe = probe.slice(dot + 1);
  }
  return false;
}

function shouldBlockRequest(url, firstPartyUrl) {
  var cfg = ensureCfg();
  if (!cfg.enabled) return false;
  if (isSiteAllowlisted(firstPartyUrl)) return false;
  try {
    var u = new URL(String(url || ''));
    var protocol = String(u.protocol || '').toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (!hostMatchesBlocked(u.hostname || '')) return false;
    cfg.blockedCount = Number(cfg.blockedCount || 0) + 1;
    cfg.updatedAt = Date.now();
    // Keep disk writes infrequent while preserving counters across restarts.
    if ((cfg.blockedCount % 25) === 0) writeCfg();
    return true;
  } catch {
    return false;
  }
}

async function fetchListText(url) {
  var res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + Number(res.status || 0));
  return await res.text();
}

async function updateLists(ctx) {
  if (listUpdatePromise) return listUpdatePromise;
  listUpdatePromise = (async function () {
    var cfg = ensureCfg();
    var urls = Array.isArray(cfg.listUrls) && cfg.listUrls.length ? cfg.listUrls : DEFAULT_LIST_URLS;
    var combined = new Set();
    var sourceCount = 0;
    for (var i = 0; i < urls.length; i++) {
      var target = String(urls[i] || '').trim();
      if (!/^https?:\/\//i.test(target)) continue;
      try {
        var txt = await fetchListText(target);
        var parsed = parseDomainsFromListText(txt);
        parsed.forEach(function (d) { combined.add(d); });
        sourceCount += 1;
      } catch {}
    }
    if (combined.size > 0) {
      var lists = ensureLists();
      lists.domains = Array.from(combined);
      lists.updatedAt = Date.now();
      lists.sourceCount = sourceCount;
      listDomainSet = new Set(lists.domains);
      writeLists();
      cfg.lastListUpdateAt = lists.updatedAt;
      cfg.updatedAt = Date.now();
      writeCfg();
      if (ctx) emitUpdated(ctx);
      return { ok: true, updatedAt: lists.updatedAt, domains: lists.domains.length, sources: sourceCount };
    }
    return { ok: false, error: 'No lists loaded' };
  })();
  try {
    return await listUpdatePromise;
  } finally {
    listUpdatePromise = null;
  }
}

async function get(ctx) {
  var cfg = ensureCfg();
  var lists = ensureLists();
  return {
    ok: true,
    enabled: !!cfg.enabled,
    siteAllowlist: cfg.siteAllowlist || [],
    blockedCount: Number(cfg.blockedCount || 0),
    listUpdatedAt: Number(lists.updatedAt || 0),
    domainCount: Array.isArray(lists.domains) ? lists.domains.length : 0,
  };
}

async function setEnabled(ctx, _evt, payload) {
  var cfg = ensureCfg();
  cfg.enabled = !!(payload && payload.enabled);
  cfg.updatedAt = Date.now();
  writeCfg();
  emitUpdated(ctx);
  return { ok: true, enabled: cfg.enabled };
}

async function stats(_ctx) {
  var cfg = ensureCfg();
  var lists = ensureLists();
  return {
    ok: true,
    stats: {
      enabled: !!cfg.enabled,
      blockedCount: Number(cfg.blockedCount || 0),
      domainCount: Array.isArray(lists.domains) ? lists.domains.length : 0,
      listUpdatedAt: Number(lists.updatedAt || 0),
      sourceCount: Number(lists.sourceCount || 0),
      siteAllowlistCount: Array.isArray(cfg.siteAllowlist) ? cfg.siteAllowlist.length : 0,
    },
  };
}

async function toggleSiteAllow(ctx, _evt, payload) {
  var cfg = ensureCfg();
  var host = normalizeHost(payload && payload.host);
  if (!host) return { ok: false, error: 'Invalid host' };
  var next = [];
  var exists = false;
  for (var i = 0; i < cfg.siteAllowlist.length; i++) {
    var h = normalizeHost(cfg.siteAllowlist[i]);
    if (!h) continue;
    if (h === host) { exists = true; continue; }
    next.push(h);
  }
  if (!exists) next.push(host);
  cfg.siteAllowlist = next;
  cfg.updatedAt = Date.now();
  writeCfg();
  emitUpdated(ctx);
  return { ok: true, allowlisted: !exists, host: host };
}

function ensureInitialLists() {
  var lists = ensureLists();
  if (Array.isArray(lists.domains) && lists.domains.length) return;
  // Best-effort defaults so adblock works offline before first update.
  lists.domains = [
    'doubleclick.net',
    'googlesyndication.com',
    'adservice.google.com',
    'ads.yahoo.com',
    'taboola.com',
    'outbrain.com',
  ];
  lists.updatedAt = Date.now();
  lists.sourceCount = 0;
  listDomainSet = new Set(lists.domains);
  writeLists();
}

module.exports = {
  get,
  setEnabled,
  updateLists,
  stats,
  toggleSiteAllow,
  shouldBlockRequest,
  ensureInitialLists,
};
