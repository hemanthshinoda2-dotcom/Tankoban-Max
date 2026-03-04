// Built-in web userscripts manager (extension-lite).
// Stores simple per-site scripts and injects them into webview pages.

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const CFG_FILE = 'web_userscripts.json';

var cache = null;

function cfgPath() {
  return path.join(app.getPath('userData'), CFG_FILE);
}

function normalizeId(id) {
  var s = String(id || '').trim();
  return s ? s : '';
}

function makeId() {
  return 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function normalizeMatchPattern(match) {
  var s = String(match || '').trim();
  if (!s) return '';
  if (s.length > 1000) s = s.slice(0, 1000);
  return s;
}

function normalizeRunAt(runAt) {
  var v = String(runAt || '').trim().toLowerCase();
  if (v === 'dom-ready') return 'dom-ready';
  return 'did-finish-load';
}

function normalizeCode(code) {
  var s = String(code || '');
  if (!s.trim()) return '';
  if (s.length > 100000) s = s.slice(0, 100000);
  return s;
}

function normalizeRule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var code = normalizeCode(raw.code);
  var match = normalizeMatchPattern(raw.match);
  if (!code || !match) return null;
  var id = normalizeId(raw.id) || makeId();
  return {
    id: id,
    title: String(raw.title || '').trim() || 'Custom script',
    enabled: raw.enabled === false ? false : true,
    match: match,
    runAt: normalizeRunAt(raw.runAt),
    code: code,
    createdAt: Number(raw.createdAt || 0) || Date.now(),
    updatedAt: Number(raw.updatedAt || 0) || Date.now(),
    lastInjectedAt: Number(raw.lastInjectedAt || 0) || 0,
    injectCount: Number(raw.injectCount || 0) || 0,
  };
}

function normalizeCfg(raw) {
  var src = (raw && typeof raw === 'object') ? raw : {};
  var out = {
    enabled: src.enabled === false ? false : true,
    updatedAt: Number(src.updatedAt || 0) || Date.now(),
    rules: [],
  };
  var rules = Array.isArray(src.rules) ? src.rules : [];
  for (var i = 0; i < rules.length; i++) {
    var rr = normalizeRule(rules[i]);
    if (rr) out.rules.push(rr);
  }
  return out;
}

function ensureCfg() {
  if (cache) return cache;
  try {
    var raw = JSON.parse(fs.readFileSync(cfgPath(), 'utf8'));
    cache = normalizeCfg(raw);
  } catch {
    cache = normalizeCfg(null);
  }
  return cache;
}

function writeCfg() {
  try {
    fs.mkdirSync(path.dirname(cfgPath()), { recursive: true });
    fs.writeFileSync(cfgPath(), JSON.stringify(ensureCfg(), null, 2), 'utf8');
  } catch {}
}

function stripRuleForRenderer(r) {
  return {
    id: r.id,
    title: r.title,
    enabled: !!r.enabled,
    match: r.match,
    runAt: r.runAt,
    code: r.code,
    createdAt: Number(r.createdAt || 0) || 0,
    updatedAt: Number(r.updatedAt || 0) || 0,
    lastInjectedAt: Number(r.lastInjectedAt || 0) || 0,
    injectCount: Number(r.injectCount || 0) || 0,
  };
}

function emitUpdated(ctx) {
  try {
    var ipc = require('../../../shared/ipc');
    var cfg = ensureCfg();
    if (ctx && ctx.win && ctx.win.webContents) {
      ctx.win.webContents.send(ipc.EVENT.WEB_USERSCRIPTS_UPDATED, {
        enabled: !!cfg.enabled,
        updatedAt: Number(cfg.updatedAt || 0) || 0,
        rules: cfg.rules.map(stripRuleForRenderer),
      });
    }
  } catch {}
}

function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardMatch(pattern, value) {
  var p = String(pattern || '').trim();
  var v = String(value || '');
  if (!p || !v) return false;
  if (p === '*' || p === '<all_urls>') return true;
  try {
    var re = new RegExp('^' + escapeRegex(p).replace(/\\\*/g, '.*') + '$', 'i');
    return re.test(v);
  } catch {
    return false;
  }
}

function ruleMatchesUrl(rule, url) {
  if (!rule || !rule.enabled) return false;
  var u = String(url || '');
  if (!/^https?:/i.test(u)) return false;
  if (wildcardMatch(rule.match, u)) return true;
  var m = String(rule.match || '').trim();
  if (m && m.indexOf('://') < 0 && m.indexOf('*') < 0 && m.indexOf('/') < 0) {
    try {
      var host = String(new URL(u).hostname || '').toLowerCase();
      var want = m.toLowerCase();
      return host === want || host.endsWith('.' + want);
    } catch {}
  }
  return false;
}

function list() {
  var cfg = ensureCfg();
  return {
    ok: true,
    enabled: !!cfg.enabled,
    updatedAt: Number(cfg.updatedAt || 0) || 0,
    rules: cfg.rules.map(stripRuleForRenderer),
  };
}

function get(ctx, e) { return list(ctx, e); }

function setEnabled(ctx, _e, payload) {
  var cfg = ensureCfg();
  cfg.enabled = !!(payload && payload.enabled);
  cfg.updatedAt = Date.now();
  writeCfg();
  emitUpdated(ctx);
  return { ok: true, enabled: !!cfg.enabled };
}

function upsert(ctx, _e, payload) {
  var cfg = ensureCfg();
  var incoming = payload && typeof payload === 'object' ? payload : {};
  var requestedId = normalizeId(incoming.id);
  var draft = normalizeRule({
    id: requestedId || undefined,
    title: incoming.title,
    enabled: incoming.enabled,
    match: incoming.match,
    runAt: incoming.runAt,
    code: incoming.code,
    createdAt: incoming.createdAt,
    updatedAt: Date.now()
  });
  if (!draft) return { ok: false, error: 'Invalid rule' };

  var idx = -1;
  if (requestedId) {
    for (var i = 0; i < cfg.rules.length; i++) {
      if (String(cfg.rules[i] && cfg.rules[i].id || '') === requestedId) { idx = i; break; }
    }
  } else {
    for (var j = 0; j < cfg.rules.length; j++) {
      if (String(cfg.rules[j] && cfg.rules[j].id || '') === draft.id) { idx = j; break; }
    }
  }

  if (idx >= 0) {
    var prev = cfg.rules[idx];
    draft.id = prev.id;
    draft.createdAt = Number(prev.createdAt || draft.createdAt || Date.now()) || Date.now();
    draft.lastInjectedAt = Number(prev.lastInjectedAt || 0) || 0;
    draft.injectCount = Number(prev.injectCount || 0) || 0;
    cfg.rules[idx] = draft;
  } else {
    cfg.rules.push(draft);
  }

  cfg.updatedAt = Date.now();
  writeCfg();
  emitUpdated(ctx);
  return { ok: true, rule: stripRuleForRenderer(draft) };
}

function remove(ctx, _e, payload) {
  var cfg = ensureCfg();
  var id = normalizeId(payload && payload.id);
  if (!id) return { ok: false, error: 'Missing id' };
  var next = [];
  var removed = false;
  for (var i = 0; i < cfg.rules.length; i++) {
    var rr = cfg.rules[i];
    if (!removed && String(rr && rr.id || '') === id) { removed = true; continue; }
    next.push(rr);
  }
  cfg.rules = next;
  cfg.updatedAt = Date.now();
  writeCfg();
  emitUpdated(ctx);
  return { ok: true, removed: removed };
}

function setRuleEnabled(ctx, _e, payload) {
  var cfg = ensureCfg();
  var id = normalizeId(payload && payload.id);
  if (!id) return { ok: false, error: 'Missing id' };
  for (var i = 0; i < cfg.rules.length; i++) {
    var rr = cfg.rules[i];
    if (String(rr && rr.id || '') !== id) continue;
    rr.enabled = !!(payload && payload.enabled);
    rr.updatedAt = Date.now();
    cfg.updatedAt = Date.now();
    writeCfg();
    emitUpdated(ctx);
    return { ok: true, enabled: !!rr.enabled };
  }
  return { ok: false, error: 'Rule not found' };
}

function touchInjected(ruleId) {
  var id = normalizeId(ruleId);
  if (!id) return;
  var cfg = ensureCfg();
  for (var i = 0; i < cfg.rules.length; i++) {
    var rr = cfg.rules[i];
    if (String(rr && rr.id || '') !== id) continue;
    rr.lastInjectedAt = Date.now();
    rr.injectCount = Number(rr.injectCount || 0) + 1;
    cfg.updatedAt = Date.now();
    if ((rr.injectCount % 5) === 0) writeCfg();
    return;
  }
}

function getMatchingScripts(payload) {
  var cfg = ensureCfg();
  if (!cfg.enabled) return { ok: true, enabled: false, scripts: [] };
  var p = payload && typeof payload === 'object' ? payload : {};
  var url = String(p.url || '').trim();
  var runAt = normalizeRunAt(p.runAt);
  var scripts = [];
  for (var i = 0; i < cfg.rules.length; i++) {
    var rr = cfg.rules[i];
    if (!rr || !rr.enabled) continue;
    if (normalizeRunAt(rr.runAt) !== runAt) continue;
    if (!ruleMatchesUrl(rr, url)) continue;
    scripts.push({
      id: rr.id,
      title: rr.title,
      match: rr.match,
      runAt: rr.runAt,
      code: rr.code,
    });
  }
  return { ok: true, enabled: true, scripts: scripts };
}

module.exports = {
  get,
  list,
  setEnabled,
  upsert,
  remove,
  setRuleEnabled,
  getMatchingScripts,
  touchInjected,
  emitUpdated,
};
