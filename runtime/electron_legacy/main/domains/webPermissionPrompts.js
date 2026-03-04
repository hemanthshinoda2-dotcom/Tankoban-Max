'use strict';

var BrowserWindow = null;
try {
  BrowserWindow = require('electron').BrowserWindow;
} catch (_) {}

var __seq = 0;
var __pending = new Map();
var __TIMEOUT_MS = 20000;

function now() { return Date.now(); }
function asString(v) { return String(v == null ? '' : v).trim(); }

function sanitizeDetails(details) {
  var d = details || {};
  var out = {};
  try { if (d.requestingUrl) out.requestingUrl = String(d.requestingUrl); } catch (_) {}
  try { if (d.isMainFrame != null) out.isMainFrame = !!d.isMainFrame; } catch (_) {}
  try { if (Array.isArray(d.mediaTypes)) out.mediaTypes = d.mediaTypes.map(function (x) { return String(x); }); } catch (_) {}
  try { if (d.externalURL) out.externalURL = String(d.externalURL); } catch (_) {}
  return out;
}

function resolveWinFromArgs(args) {
  if (args && args.win) {
    try {
      if (!args.win.isDestroyed || !args.win.isDestroyed()) return args.win;
    } catch (_) {}
  }
  try {
    if (args && args.wc && BrowserWindow && typeof BrowserWindow.fromWebContents === 'function') {
      return BrowserWindow.fromWebContents(args.wc) || null;
    }
  } catch (_) {}
  return null;
}

function request(args) {
  return new Promise(function (resolve) {
    var permission = asString(args && args.permission);
    var origin = asString(args && args.origin);
    var wc = args && args.wc ? args.wc : null;
    var win = resolveWinFromArgs(args);
    if (!permission || !origin || !wc || !win || (win.isDestroyed && win.isDestroyed())) {
      resolve(false);
      return;
    }

    var requestId = 'permreq_' + now() + '_' + (++__seq);
    var settled = false;
    var timeout = setTimeout(function () {
      if (settled) return;
      settled = true;
      __pending.delete(requestId);
      resolve(false);
    }, __TIMEOUT_MS);

    __pending.set(requestId, {
      id: requestId,
      createdAt: now(),
      permission: permission,
      origin: origin,
      wcId: Number(wc.id || 0) || 0,
      resolve: function (allow) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        __pending.delete(requestId);
        resolve(!!allow);
      }
    });

    try {
      if (!win.webContents || (win.webContents.isDestroyed && win.webContents.isDestroyed())) {
        var rec = __pending.get(requestId);
        if (rec) rec.resolve(false);
        return;
      }
      win.webContents.send(String(args && args.eventName || 'webPermissions:prompt'), {
        requestId: requestId,
        permission: permission,
        origin: origin,
        webContentsId: Number(wc.id || 0) || 0,
        requestedAt: now(),
        details: sanitizeDetails(args && args.details)
      });
    } catch (_) {
      var pending = __pending.get(requestId);
      if (pending) pending.resolve(false);
    }
  });
}

function resolvePrompt(payload) {
  var requestId = asString(payload && payload.requestId);
  var decision = asString(payload && payload.decision).toLowerCase();
  var rec = requestId ? __pending.get(requestId) : null;
  if (!rec) return { ok: false, error: 'not_found' };
  rec.resolve(decision === 'allow' || decision === 'granted' || decision === 'true');
  return { ok: true };
}

function rejectAll(reason) {
  __pending.forEach(function (rec) {
    try { rec.resolve(false); } catch (_) {}
  });
  __pending.clear();
  return { ok: true, reason: asString(reason) || 'cleared' };
}

module.exports = {
  request: request,
  resolvePrompt: resolvePrompt,
  rejectAll: rejectAll,
};
