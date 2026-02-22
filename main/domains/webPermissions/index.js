// Per-origin web permission overrides.

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const PERMISSIONS_FILE = 'web_permissions.json';
const VALID_DECISIONS = new Set(['allow', 'deny', 'ask']);

var cache = null;

function dataPath() {
  return path.join(app.getPath('userData'), PERMISSIONS_FILE);
}

function normalizeOrigin(value) {
  var raw = String(value || '').trim();
  if (!raw) return '';
  try {
    var u = new URL(raw);
    if (!/^https?:$/i.test(String(u.protocol || ''))) return '';
    return (u.origin || '').toLowerCase();
  } catch {
    return '';
  }
}

function decisionFromValue(value) {
  var d = String(value || '').trim().toLowerCase();
  if (!VALID_DECISIONS.has(d)) return 'ask';
  return d;
}

function ensureCache() {
  if (cache) return cache;
  var p = dataPath();
  try {
    var raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (raw && Array.isArray(raw.rules)) {
      cache = {
        rules: raw.rules,
        updatedAt: Number(raw.updatedAt || Date.now()) || Date.now(),
      };
      return cache;
    }
  } catch {}
  cache = { rules: [], updatedAt: Date.now() };
  return cache;
}

function write() {
  var p = dataPath();
  var c = ensureCache();
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(c, null, 2), 'utf8');
  } catch {}
}

function emitUpdated(ctx) {
  try {
    var ipc = require('../../../shared/ipc');
    var c = ensureCache();
    ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_PERMISSIONS_UPDATED, {
      rules: c.rules || [],
      updatedAt: c.updatedAt,
    });
  } catch {}
}

function findRule(origin, permission) {
  var c = ensureCache();
  var o = normalizeOrigin(origin);
  var p = String(permission || '').trim();
  if (!o || !p) return null;
  for (var i = 0; i < c.rules.length; i++) {
    var r = c.rules[i];
    if (!r) continue;
    if (String(r.origin || '') === o && String(r.permission || '') === p) return r;
  }
  return null;
}

function getDecision(origin, permission) {
  var rule = findRule(origin, permission);
  if (!rule) return 'ask';
  return decisionFromValue(rule.decision);
}

function shouldAllow(origin, permission) {
  var d = getDecision(origin, permission);
  if (d === 'allow') return true;
  if (d === 'deny') return false;
  return false;
}

function safeOriginFromDetails(webContents, details) {
  try {
    if (details && details.requestingUrl) {
      var o = normalizeOrigin(details.requestingUrl);
      if (o) return o;
    }
  } catch {}
  try {
    if (webContents && webContents.getURL) {
      var o2 = normalizeOrigin(webContents.getURL());
      if (o2) return o2;
    }
  } catch {}
  return '';
}

async function list(ctx) {
  var c = ensureCache();
  return { ok: true, rules: c.rules || [], updatedAt: c.updatedAt };
}

async function set(ctx, _evt, payload) {
  var c = ensureCache();
  var origin = normalizeOrigin(payload && payload.origin);
  var permission = String(payload && payload.permission || '').trim();
  var decision = decisionFromValue(payload && payload.decision);
  if (!origin) return { ok: false, error: 'Invalid origin' };
  if (!permission) return { ok: false, error: 'Missing permission' };
  var found = findRule(origin, permission);
  if (!found) {
    found = { origin: origin, permission: permission, decision: decision, updatedAt: Date.now() };
    c.rules.push(found);
  } else {
    found.decision = decision;
    found.updatedAt = Date.now();
  }
  c.updatedAt = Date.now();
  write();
  emitUpdated(ctx);
  return { ok: true, rule: found };
}

async function reset(ctx, _evt, payload) {
  var c = ensureCache();
  var origin = normalizeOrigin(payload && payload.origin);
  var permission = String(payload && payload.permission || '').trim();
  if (!origin && !permission) {
    c.rules = [];
  } else {
    c.rules = c.rules.filter(function (r) {
      if (!r) return false;
      if (origin && String(r.origin || '') !== origin) return true;
      if (permission && String(r.permission || '') !== permission) return true;
      return false;
    });
  }
  c.updatedAt = Date.now();
  write();
  emitUpdated(ctx);
  return { ok: true };
}

module.exports = {
  list,
  set,
  reset,
  getDecision,
  shouldAllow,
  safeOriginFromDetails,
};
