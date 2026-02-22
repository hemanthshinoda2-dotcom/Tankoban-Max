// WebTorrent domain: magnet/.torrent downloads saved under a user-selected destination root.

const fs = require('fs');
const path = require('path');
const { session } = require('electron');

const HISTORY_FILE = 'web_torrent_history.json';
const MAX_HISTORY = 1000;

var WebTorrentCtor = null;
var webTorrentCtorPromise = null;
var client = null;
var activeById = new Map(); // id -> { torrent, entry, interval? }
var historyCache = null;

function getIpc() {
  try { return require('../../../shared/ipc'); } catch { return null; }
}

async function ensureClient() {
  if (client) return client;
  if (!WebTorrentCtor) {
    if (!webTorrentCtorPromise) {
      webTorrentCtorPromise = (async function loadCtor() {
        try {
          var mod = await import('webtorrent');
          return (mod && (mod.default || mod.WebTorrent)) || mod;
        } catch (_e) {
          var legacy = require('webtorrent');
          return (legacy && (legacy.default || legacy.WebTorrent)) || legacy;
        }
      })();
    }
    WebTorrentCtor = await webTorrentCtorPromise;
  }
  client = new WebTorrentCtor();
  return client;
}

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

function readHistory(ctx) {
  var p = ctx.storage.dataPath(HISTORY_FILE);
  var data = ctx.storage.readJSON(p, null);
  if (data && Array.isArray(data.torrents)) return data;
  return { torrents: [], updatedAt: Date.now() };
}

function ensureHistory(ctx) {
  if (!historyCache) historyCache = readHistory(ctx);
  if (!Array.isArray(historyCache.torrents)) historyCache.torrents = [];
  return historyCache;
}

function writeHistory(ctx) {
  var c = ensureHistory(ctx);
  if (c.torrents.length > MAX_HISTORY) c.torrents.length = MAX_HISTORY;
  var p = ctx.storage.dataPath(HISTORY_FILE);
  ctx.storage.writeJSONDebounced(p, c, 120);
}

function emit(ctx, eventName, payload) {
  var ipc = getIpc();
  if (!ipc || !eventName) return;
  try { ctx.win && ctx.win.webContents && ctx.win.webContents.send(eventName, payload || {}); } catch {}
}

function emitUpdated(ctx) {
  var ipc = getIpc();
  if (!ipc) return;
  emit(ctx, ipc.EVENT.WEB_TORRENTS_UPDATED, { torrents: listActiveEntries(), history: ensureHistory(ctx).torrents });
}

function listActiveEntries() {
  var out = [];
  activeById.forEach(function (rec) {
    if (rec && rec.entry) out.push(rec.entry);
  });
  out.sort(function (a, b) { return Number(b.startedAt || 0) - Number(a.startedAt || 0); });
  return out;
}

function upsertHistory(ctx, entry) {
  var c = ensureHistory(ctx);
  var id = String(entry && entry.id || '');
  if (!id) return;
  var found = null;
  for (var i = 0; i < c.torrents.length; i++) {
    if (c.torrents[i] && String(c.torrents[i].id) === id) { found = c.torrents[i]; break; }
  }
  if (!found) {
    found = {};
    c.torrents.unshift(found);
  }
  Object.assign(found, entry);
  c.updatedAt = Date.now();
  if (c.torrents.length > MAX_HISTORY) c.torrents.length = MAX_HISTORY;
  writeHistory(ctx);
}

function removeActive(id) {
  var rec = activeById.get(id);
  if (!rec) return null;
  if (rec.interval) {
    try { clearInterval(rec.interval); } catch {}
  }
  activeById.delete(id);
  return rec;
}

function getLibraryRoots(ctx) {
  var books = [];
  var comics = [];
  var videos = [];
  try {
    var b = ctx.storage.readJSON(ctx.storage.dataPath('books_library_state.json'), {});
    books = Array.isArray(b.bookRootFolders) ? b.bookRootFolders.filter(Boolean) : [];
  } catch {}
  try {
    var l = ctx.storage.readJSON(ctx.storage.dataPath('library_state.json'), {});
    comics = Array.isArray(l.rootFolders) ? l.rootFolders.filter(Boolean) : [];
    videos = Array.isArray(l.videoFolders) ? l.videoFolders.filter(Boolean) : [];
  } catch {}
  return { books: books, comics: comics, videos: videos };
}

function isPathWithin(parent, target) {
  var p = String(parent || '').trim();
  var t = String(target || '').trim();
  if (!p || !t) return false;
  try {
    var pAbs = path.resolve(p);
    var tAbs = path.resolve(t);
    var rel = path.relative(pAbs, tAbs);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  } catch {
    return false;
  }
}

function detectLibrariesForPath(ctx, destination) {
  var libs = new Set();
  var roots = getLibraryRoots(ctx);
  for (var i = 0; i < roots.books.length; i++) if (isPathWithin(roots.books[i], destination)) libs.add('books');
  for (var j = 0; j < roots.comics.length; j++) if (isPathWithin(roots.comics[j], destination)) libs.add('comics');
  for (var k = 0; k < roots.videos.length; k++) if (isPathWithin(roots.videos[k], destination)) libs.add('videos');
  return libs;
}

function copyTorrentFile(fileObj, destination) {
  return new Promise(function (resolve, reject) {
    var rs = null;
    var ws = null;
    try {
      rs = fileObj.createReadStream();
      ws = fs.createWriteStream(destination);
    } catch (err) {
      reject(err);
      return;
    }
    rs.on('error', reject);
    ws.on('error', reject);
    ws.on('finish', resolve);
    rs.pipe(ws);
  });
}

function triggerLibraryRescan(ctx, library) {
  try {
    if (library === 'books') {
      var booksDomain = require('../books');
      booksDomain.scan(ctx, null, {}).catch(function () {});
    } else if (library === 'comics') {
      var libraryDomain = require('../library');
      libraryDomain.scan(ctx, null, {}).catch(function () {});
    } else if (library === 'videos') {
      var videoDomain = require('../video');
      videoDomain.scan(ctx, null, {}).catch(function () {});
    }
  } catch {}
}

function createEntry(partial) {
  return Object.assign({
    id: 'wtr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    infoHash: '',
    name: '',
    state: 'downloading',
    progress: 0,
    downloadRate: 0,
    uploaded: 0,
    downloaded: 0,
    startedAt: Date.now(),
    finishedAt: null,
    error: '',
    magnetUri: '',
    sourceUrl: '',
    destinationRoot: '',
    routedFiles: 0,
    ignoredFiles: 0,
    failedFiles: 0,
  }, partial || {});
}

async function onTorrentDone(ctx, rec) {
  if (!rec || !rec.torrent || !rec.entry) return;
  var torrent = rec.torrent;
  var entry = rec.entry;
  var routedLibraries = new Set();
  var routed = 0;
  var ignored = 0;
  var failed = 0;
  var root = String(entry.destinationRoot || '').trim();
  if (!root) {
    entry.state = 'failed';
    entry.error = 'Missing destination folder';
    entry.finishedAt = Date.now();
    upsertHistory(ctx, entry);
    removeActive(entry.id);
    var ipc0 = getIpc();
    if (ipc0) emit(ctx, ipc0.EVENT.WEB_TORRENT_COMPLETED, entry);
    emitUpdated(ctx);
    return;
  }

  for (var i = 0; i < torrent.files.length; i++) {
    var f = torrent.files[i];
    var relPath = String(f.path || f.name || '').trim();
    if (!relPath) relPath = String(f.name || 'file_' + i);
    relPath = relPath.replace(/^[\\/]+/, '');
    var destination = path.join(root, relPath);
    try {
      ensureDir(path.dirname(destination));
      await copyTorrentFile(f, destination);
      routed += 1;
      detectLibrariesForPath(ctx, destination).forEach(function (lib) { routedLibraries.add(lib); });
    } catch {
      failed += 1;
    }
  }

  entry.state = failed > 0 ? 'completed_with_errors' : 'completed';
  entry.progress = 1;
  entry.downloadRate = 0;
  entry.finishedAt = Date.now();
  entry.routedFiles = routed;
  entry.ignoredFiles = ignored;
  entry.failedFiles = failed;
  upsertHistory(ctx, entry);
  removeActive(entry.id);

  routedLibraries.forEach(function (lib) { triggerLibraryRescan(ctx, lib); });

  var ipc = getIpc();
  if (ipc) emit(ctx, ipc.EVENT.WEB_TORRENT_COMPLETED, entry);
  emitUpdated(ctx);
}

function bindTorrent(ctx, torrent, entry) {
  var ipc = getIpc();
  entry.infoHash = String(torrent.infoHash || entry.infoHash || '');
  entry.name = String(torrent.name || entry.name || entry.infoHash || 'Torrent');
  entry.state = 'downloading';
  upsertHistory(ctx, entry);

  var rec = { torrent: torrent, entry: entry, interval: null };
  activeById.set(entry.id, rec);

  rec.interval = setInterval(function () {
    if (!activeById.has(entry.id)) return;
    entry.progress = Number(torrent.progress || 0);
    entry.downloadRate = Number(torrent.downloadSpeed || 0);
    entry.uploaded = Number(torrent.uploaded || 0);
    entry.downloaded = Number(torrent.downloaded || 0);
    entry.name = String(torrent.name || entry.name || '');
    upsertHistory(ctx, entry);
    if (ipc) emit(ctx, ipc.EVENT.WEB_TORRENT_PROGRESS, entry);
    emitUpdated(ctx);
  }, 800);

  torrent.on('error', function (err) {
    entry.state = 'failed';
    entry.error = String((err && err.message) || err || 'Torrent error');
    entry.finishedAt = Date.now();
    upsertHistory(ctx, entry);
    removeActive(entry.id);
    if (ipc) emit(ctx, ipc.EVENT.WEB_TORRENT_COMPLETED, entry);
    emitUpdated(ctx);
  });

  torrent.on('done', function () {
    onTorrentDone(ctx, rec).catch(function (err) {
      entry.state = 'failed';
      entry.error = String((err && err.message) || err || 'Failed to finalize torrent');
      entry.finishedAt = Date.now();
      upsertHistory(ctx, entry);
      removeActive(entry.id);
      if (ipc) emit(ctx, ipc.EVENT.WEB_TORRENT_COMPLETED, entry);
      emitUpdated(ctx);
    });
  });

  if (ipc) emit(ctx, ipc.EVENT.WEB_TORRENT_STARTED, entry);
  emitUpdated(ctx);
}

function buildTorrentTmpPath(ctx, id) {
  var dir = ctx.storage.dataPath(path.join('web_torrent_tmp', id));
  ensureDir(dir);
  return dir;
}

function resolveDestinationRoot(payload) {
  var destinationRoot = String(payload && payload.destinationRoot || '').trim();
  if (!destinationRoot) return { ok: false, error: 'Destination folder required', absRoot: '' };
  var absRoot = '';
  try { absRoot = path.resolve(destinationRoot); } catch {}
  if (!absRoot) return { ok: false, error: 'Invalid destination folder', absRoot: '' };
  try { fs.mkdirSync(absRoot, { recursive: true }); } catch {}
  return { ok: true, absRoot: absRoot };
}

async function addTorrentInput(ctx, entry, input) {
  var cl = await ensureClient();
  try {
    var torrent = cl.add(input, { path: buildTorrentTmpPath(ctx, entry.id) });
    bindTorrent(ctx, torrent, entry);
    return { ok: true, id: entry.id };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

async function fetchTorrentBuffer(url, referer) {
  var headers = { 'user-agent': 'Tankoban-Max/1.0' };
  var ref = String(referer || '').trim();
  if (ref) headers.referer = ref;
  var res = null;
  var ses = null;
  try { ses = session.fromPartition('persist:webmode'); } catch {}
  if (ses && typeof ses.fetch === 'function') {
    res = await ses.fetch(url, { redirect: 'follow', headers: headers });
  } else {
    res = await fetch(url, { redirect: 'follow', headers: headers });
  }
  if (!res || !res.ok) {
    var status = Number(res && res.status || 0);
    return { ok: false, error: status ? ('HTTP ' + status) : 'Failed to fetch torrent' };
  }
  var ab = await res.arrayBuffer();
  var buf = Buffer.from(ab);
  if (!buf || !buf.length) return { ok: false, error: 'Empty torrent file' };
  return { ok: true, buffer: buf };
}

async function startMagnet(ctx, evt, payload) {
  var magnetUri = String(payload && payload.magnetUri || '').trim();
  if (!magnetUri || magnetUri.indexOf('magnet:') !== 0) return { ok: false, error: 'Invalid magnet URI' };
  var root = resolveDestinationRoot(payload);
  if (!root.ok) return { ok: false, error: root.error };
  var entry = createEntry({
    magnetUri: magnetUri,
    sourceUrl: String(payload && payload.referer || ''),
    destinationRoot: root.absRoot
  });
  return addTorrentInput(ctx, entry, magnetUri);
}

async function startTorrentUrl(ctx, evt, payload) {
  var url = String(payload && payload.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'Invalid torrent URL' };
  var root = resolveDestinationRoot(payload);
  if (!root.ok) return { ok: false, error: root.error };
  var fetched = null;
  try {
    fetched = await fetchTorrentBuffer(url, payload && payload.referer);
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err || 'Failed to fetch torrent URL') };
  }
  if (!fetched || !fetched.ok) return { ok: false, error: String((fetched && fetched.error) || 'Failed to fetch torrent URL') };

  var entry = createEntry({ sourceUrl: url, destinationRoot: root.absRoot });
  return addTorrentInput(ctx, entry, fetched.buffer);
}

async function startTorrentBuffer(ctx, evt, payload) {
  var root = resolveDestinationRoot(payload);
  if (!root.ok) return { ok: false, error: root.error };
  var input = payload && payload.buffer;
  if (!Buffer.isBuffer(input) || !input.length) return { ok: false, error: 'Invalid torrent file' };
  var entry = createEntry({
    sourceUrl: String(payload && (payload.sourceUrl || payload.referer) || ''),
    destinationRoot: root.absRoot
  });
  return addTorrentInput(ctx, entry, input);
}

async function pause(ctx, _evt, payload) {
  var id = payload && payload.id ? String(payload.id) : '';
  var rec = activeById.get(id);
  if (!rec || !rec.torrent) return { ok: false, error: 'Torrent not active' };
  if (typeof rec.torrent.pause !== 'function') return { ok: false, error: 'Pause unsupported' };
  try { rec.torrent.pause(); } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
  rec.entry.state = 'paused';
  upsertHistory(ctx, rec.entry);
  emitUpdated(ctx);
  return { ok: true };
}

async function resume(ctx, _evt, payload) {
  var id = payload && payload.id ? String(payload.id) : '';
  var rec = activeById.get(id);
  if (!rec || !rec.torrent) return { ok: false, error: 'Torrent not active' };
  if (typeof rec.torrent.resume !== 'function') return { ok: false, error: 'Resume unsupported' };
  try { rec.torrent.resume(); } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
  rec.entry.state = 'downloading';
  upsertHistory(ctx, rec.entry);
  emitUpdated(ctx);
  return { ok: true };
}

async function cancel(ctx, _evt, payload) {
  var id = payload && payload.id ? String(payload.id) : '';
  var rec = activeById.get(id);
  if (!rec || !rec.torrent) return { ok: false, error: 'Torrent not active' };
  rec.entry.state = 'cancelled';
  rec.entry.finishedAt = Date.now();
  try {
    await new Promise(function (resolve) {
      rec.torrent.destroy({ destroyStore: true }, function () { resolve(); });
    });
  } catch {}
  upsertHistory(ctx, rec.entry);
  removeActive(id);
  emitUpdated(ctx);
  return { ok: true };
}

async function getActive(ctx) {
  return { ok: true, torrents: listActiveEntries() };
}

async function getHistory(ctx) {
  var c = ensureHistory(ctx);
  return { ok: true, torrents: c.torrents || [] };
}

async function clearHistory(ctx) {
  var c = ensureHistory(ctx);
  c.torrents = (c.torrents || []).filter(function (t) {
    return t && (String(t.state) === 'downloading' || String(t.state) === 'paused');
  });
  c.updatedAt = Date.now();
  writeHistory(ctx);
  emitUpdated(ctx);
  return { ok: true };
}

async function removeHistory(ctx, _evt, payload) {
  var id = payload && payload.id ? String(payload.id) : '';
  if (!id) return { ok: false, error: 'Missing id' };
  if (activeById.has(id)) return { ok: false, error: 'Torrent active' };
  var c = ensureHistory(ctx);
  var before = c.torrents.length;
  c.torrents = c.torrents.filter(function (t) { return !(t && String(t.id) === id); });
  if (c.torrents.length === before) return { ok: false, error: 'Not found' };
  c.updatedAt = Date.now();
  writeHistory(ctx);
  emitUpdated(ctx);
  return { ok: true };
}

module.exports = {
  startMagnet,
  startTorrentUrl,
  startTorrentBuffer,
  pause,
  resume,
  cancel,
  getActive,
  getHistory,
  clearHistory,
  removeHistory,
};
