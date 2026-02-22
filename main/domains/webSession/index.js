// Web session persistence for browser tabs and restore behavior.

const SESSION_FILE = 'web_session_state.json';
const MAX_TABS = 32;
const MAX_CLOSED = 30;

var cache = null;

function sanitizeTab(tab) {
  var t = (tab && typeof tab === 'object') ? tab : {};
  var url = String(t.url || '').trim();
  if (!url) return null;
  return {
    id: String(t.id || ''),
    sourceId: t.sourceId != null ? String(t.sourceId) : '',
    sourceName: String(t.sourceName || '').trim(),
    title: String(t.title || '').trim(),
    url: url,
    homeUrl: String(t.homeUrl || url).trim() || url,
    pinned: !!t.pinned,
  };
}

function normalizeState(input) {
  var src = (input && typeof input === 'object') ? input : {};
  var tabsIn = Array.isArray(src.tabs) ? src.tabs : [];
  var tabs = [];
  for (var i = 0; i < tabsIn.length; i++) {
    var t = sanitizeTab(tabsIn[i]);
    if (!t) continue;
    tabs.push(t);
    if (tabs.length >= MAX_TABS) break;
  }

  var closedIn = Array.isArray(src.closedTabs) ? src.closedTabs : [];
  var closedTabs = [];
  for (var j = 0; j < closedIn.length; j++) {
    var c = sanitizeTab(closedIn[j]);
    if (!c) continue;
    closedTabs.push(c);
    if (closedTabs.length >= MAX_CLOSED) break;
  }

  var activeTabId = src.activeTabId != null ? String(src.activeTabId) : '';
  var restoreLastSession = src.restoreLastSession !== false;
  return {
    tabs: tabs,
    activeTabId: activeTabId,
    closedTabs: closedTabs,
    restoreLastSession: restoreLastSession,
    updatedAt: Number(src.updatedAt || Date.now()) || Date.now(),
  };
}

function ensureCache(ctx) {
  if (cache) return cache;
  var p = ctx.storage.dataPath(SESSION_FILE);
  var raw = ctx.storage.readJSON(p, null);
  if (raw && typeof raw === 'object') cache = normalizeState(raw);
  else cache = normalizeState({});
  return cache;
}

function write(ctx) {
  var p = ctx.storage.dataPath(SESSION_FILE);
  var c = ensureCache(ctx);
  ctx.storage.writeJSONDebounced(p, c);
}

function emitUpdated(ctx) {
  try {
    var ipc = require('../../../shared/ipc');
    var c = ensureCache(ctx);
    ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_SESSION_UPDATED, {
      state: c,
    });
  } catch {}
}

async function get(ctx) {
  return { ok: true, state: ensureCache(ctx) };
}

async function save(ctx, _evt, payload) {
  var incoming = (payload && payload.state && typeof payload.state === 'object') ? payload.state : payload;
  var next = normalizeState(incoming);
  cache = next;
  write(ctx);
  emitUpdated(ctx);
  return { ok: true, state: next };
}

async function clear(ctx) {
  cache = normalizeState({ tabs: [], activeTabId: '', closedTabs: [], restoreLastSession: true });
  write(ctx);
  emitUpdated(ctx);
  return { ok: true };
}

module.exports = {
  get,
  save,
  clear,
};
