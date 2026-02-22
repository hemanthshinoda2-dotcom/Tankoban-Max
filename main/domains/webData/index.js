// Web browsing data management for webmode partition.

const { session } = require('electron');
const path = require('path');
const fs = require('fs');

const HISTORY_FILE = 'web_browsing_history.json';
const DOWNLOADS_FILE = 'web_download_history.json';
const TORRENT_FILE = 'web_torrent_history.json';
const SESSION_FILE = 'web_session_state.json';

function fileSizeSafe(p) {
  try {
    var st = fs.statSync(p);
    if (st && st.isFile()) return Number(st.size || 0);
  } catch {}
  return 0;
}

function usageSnapshot(ctx) {
  var out = {
    historyBytes: fileSizeSafe(ctx.storage.dataPath(HISTORY_FILE)),
    downloadsBytes: fileSizeSafe(ctx.storage.dataPath(DOWNLOADS_FILE)),
    torrentsBytes: fileSizeSafe(ctx.storage.dataPath(TORRENT_FILE)),
    sessionBytes: fileSizeSafe(ctx.storage.dataPath(SESSION_FILE)),
  };
  out.totalBytes = out.historyBytes + out.downloadsBytes + out.torrentsBytes + out.sessionBytes;
  return out;
}

function normalizeKinds(payload) {
  var k = (payload && Array.isArray(payload.kinds)) ? payload.kinds : [];
  var out = new Set();
  for (var i = 0; i < k.length; i++) {
    var x = String(k[i] || '').trim().toLowerCase();
    if (!x) continue;
    out.add(x);
  }
  if (!out.size) {
    out.add('history');
    out.add('downloads');
    out.add('torrents');
    out.add('cookies');
    out.add('cache');
    out.add('siteData');
  }
  return out;
}

async function usage(ctx) {
  return { ok: true, usage: usageSnapshot(ctx) };
}

async function clear(ctx, _evt, payload) {
  var kinds = normalizeKinds(payload);
  var from = Number(payload && payload.from || 0) || 0;
  var to = Number(payload && payload.to || Date.now()) || Date.now();
  var cleared = {};

  if (kinds.has('history')) {
    try {
      var webHistoryDomain = require('../webHistory');
      await webHistoryDomain.clear(ctx, null, { from: from, to: to });
      cleared.history = true;
    } catch {
      cleared.history = false;
    }
  }

  if (kinds.has('downloads')) {
    try {
      var webSourcesDomain = require('../webSources');
      await webSourcesDomain.clearDownloadHistory(ctx, null);
      cleared.downloads = true;
    } catch {
      cleared.downloads = false;
    }
  }

  if (kinds.has('torrents')) {
    try {
      var webTorrentDomain = require('../webTorrent');
      await webTorrentDomain.clearHistory(ctx, null);
      cleared.torrents = true;
    } catch {
      cleared.torrents = false;
    }
  }

  var ses = null;
  try { ses = session.fromPartition('persist:webmode'); } catch {}
  if (ses) {
    try {
      if (kinds.has('cache')) {
        await ses.clearCache();
        cleared.cache = true;
      }
    } catch {
      cleared.cache = false;
    }

    try {
      if (kinds.has('cookies') || kinds.has('siteData')) {
        await ses.clearStorageData({
          storages: ['cookies', 'localstorage', 'indexeddb', 'serviceworkers', 'filesystem'],
          quotas: ['temporary', 'persistent', 'syncable'],
          origin: '',
        });
        cleared.siteData = true;
      }
    } catch {
      cleared.siteData = false;
    }
  }

  return { ok: true, cleared: cleared, usage: usageSnapshot(ctx) };
}

module.exports = {
  usage,
  clear,
};
