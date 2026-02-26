// WebTorrent domain: magnet/.torrent downloads saved under a user-selected destination root.

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { session, dialog, shell } = require('electron');
const IPC = require('../../../packages/core-ipc-contracts');
const libraryBridge = require('../../../packages/core-main/library_bridge');

const HISTORY_FILE = 'web_torrent_history.json';
const MAX_HISTORY = 1000;

// Diagnostic logger — writes to temp file (main process console is unreliable)
var _wtLogPath = path.join(os.tmpdir(), 'tankoban_webtorrent.log');
function wtLog(msg) {
  try { fs.appendFileSync(_wtLogPath, '[' + new Date().toISOString() + '] ' + msg + '\n'); } catch {}
}

var WebTorrentCtor = null;
var webTorrentCtorPromise = null;
var client = null;
var activeById = new Map(); // id -> { torrent, entry, interval? }
var pendingById = new Map(); // resolveId -> { torrent, torrentBuf, info }
var historyCache = null;

function findActiveBySource(opts) {
  var o = opts || {};
  var magnet = String(o.magnetUri || '').trim();
  var url = String(o.sourceUrl || '').trim();
  if (!magnet && !url) return null;
  var vals = Array.from(activeById.values());
  for (var i = 0; i < vals.length; i++) {
    var rec = vals[i];
    if (!rec || !rec.entry) continue;
    if (magnet) {
      var em = String(rec.entry.magnetUri || '').trim();
      if (em && em === magnet) return rec;
    }
    if (url) {
      var eu = String(rec.entry.sourceUrl || '').trim();
      if (eu && eu === url) return rec;
    }
  }
  return null;
}

function getIpc() {
  try { return IPC; } catch { return null; }
}

async function ensureClient() {
  if (client) { wtLog('ensureClient: reusing existing client'); return client; }
  wtLog('ensureClient: creating new client...');
  if (!WebTorrentCtor) {
    if (!webTorrentCtorPromise) {
      webTorrentCtorPromise = (async function loadCtor() {
        wtLog('ensureClient: loading webtorrent module...');
        try {
          var mod = await import('webtorrent');
          wtLog('ensureClient: import() succeeded');
          return (mod && (mod.default || mod.WebTorrent)) || mod;
        } catch (_e) {
          wtLog('ensureClient: import() failed (' + (_e && _e.message || _e) + '), trying require()');
          var legacy = require('webtorrent');
          return (legacy && (legacy.default || legacy.WebTorrent)) || legacy;
        }
      })();
    }
    WebTorrentCtor = await webTorrentCtorPromise;
    wtLog('ensureClient: constructor loaded, type=' + typeof WebTorrentCtor);
  }
  // Disable UTP (native addon) to avoid segfaults with Electron 40's Node v24.
  // natUpnp/natPmp: false prevents NatAPI from blocking the event loop during port mapping.
  wtLog('ensureClient: calling new WebTorrent({ utp: false, natUpnp: false, natPmp: false })...');
  client = new WebTorrentCtor({ utp: false, natUpnp: false, natPmp: false });
  wtLog('ensureClient: client created OK');
  client.on('error', function (err) {
    wtLog('CLIENT ERROR: ' + (err && err.message || err));
  });
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
  try {
    if (rec.http && rec.http.server) rec.http.server.close();
  } catch {}
  rec.http = null;
  activeById.delete(id);
  return rec;
}

// Tolerant id extraction — accepts both { id: "xxx" } objects and raw "xxx" strings.
// Defense-in-depth: works regardless of whether the bridge wraps the payload correctly.
function extractId(payload) {
  if (payload && typeof payload === 'object' && payload.id) return String(payload.id);
  if (typeof payload === 'string' && payload.length > 0) return payload;
  return '';
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
  libraryBridge.triggerLibraryRescan(ctx, library);
}

function createEntry(partial) {
  return Object.assign({
    id: 'wtr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    infoHash: '',
    name: '',
    state: 'downloading',
    progress: 0,
    downloadRate: 0,
    uploadSpeed: 0,
    uploaded: 0,
    downloaded: 0,
    totalSize: 0,
    numPeers: 0,
    startedAt: Date.now(),
    finishedAt: null,
    error: '',
    magnetUri: '',
    sourceUrl: '',
    origin: '',
    destinationRoot: '',
    savePath: '',
    directWrite: false,
    sequential: true,
    filePriorities: {},
    files: null,
    metadataReady: false,
    routedFiles: 0,
    ignoredFiles: 0,
    failedFiles: 0,
  }, partial || {});
}

function buildFileList(torrent) {
  if (!torrent || !torrent.files || !torrent.files.length) return [];
  return torrent.files.map(function (f, i) {
    return {
      index: i,
      path: String(f.path || f.name || ''),
      name: String(f.name || ''),
      length: Number(f.length || 0),
      progress: Number(f.progress || 0),
      selected: true,
      priority: 'normal',
    };
  });
}

function updateFileProgress(entry, torrent) {
  if (!entry.files || !torrent || !torrent.files) return;
  for (var i = 0; i < entry.files.length && i < torrent.files.length; i++) {
    entry.files[i].progress = Number(torrent.files[i].progress || 0);
  }
}

async function routeCompletedFiles(ctx, rec) {
  var torrent = rec.torrent;
  var entry = rec.entry;
  var root = String(entry.destinationRoot || '').trim();
  if (!root) return;

  var routedLibraries = new Set();
  var routed = 0;
  var ignored = 0;
  var failed = 0;

  for (var i = 0; i < torrent.files.length; i++) {
    // Skip files the user deselected
    if (entry.files && entry.files[i] && !entry.files[i].selected) {
      ignored += 1;
      continue;
    }
    var f = torrent.files[i];
    var relPath = String(f.path || f.name || '').trim();
    if (!relPath) relPath = String(f.name || 'file_' + i);
    relPath = relPath.replace(/^[\\/]+/, '');
    var destination = path.join(root, relPath);
    try {
      // For video library torrents, skip files already streamed to destination
      if (entry.videoLibrary) {
        try {
          var stat = fs.statSync(destination);
          if (stat && stat.size >= f.length) { routed += 1; detectLibrariesForPath(ctx, destination).forEach(function (lib) { routedLibraries.add(lib); }); continue; }
        } catch {}
      }
      ensureDir(path.dirname(destination));
      await copyTorrentFile(f, destination);
      routed += 1;
      detectLibrariesForPath(ctx, destination).forEach(function (lib) { routedLibraries.add(lib); });
    } catch {
      failed += 1;
    }
  }

  entry.routedFiles = routed;
  entry.ignoredFiles = ignored;
  entry.failedFiles = failed;
  // Always trigger video rescan for video library torrents (show folder may not be under a video root)
  if (entry.videoLibrary) routedLibraries.add('videos');
  routedLibraries.forEach(function (lib) { triggerLibraryRescan(ctx, lib); });
}

async function onTorrentDone(ctx, rec) {
  if (!rec || !rec.torrent || !rec.entry) return;
  var entry = rec.entry;
  var ipc = getIpc();

  entry.progress = 1;
  entry.downloadRate = 0;
  entry.uploadSpeed = 0;
  updateFileProgress(entry, rec.torrent);

  var root = String(entry.destinationRoot || '').trim();
  if (!root) {
    // No destination set yet — hold files in temp, wait for user to set destination.
    entry.state = 'completed_pending';
    upsertHistory(ctx, entry);
    if (ipc) emit(ctx, ipc.EVENT.WEB_TORRENT_COMPLETED, entry);
    emitUpdated(ctx);
    return;
  }

  if (entry.directWrite) {
    detectLibrariesForPath(ctx, root).forEach(function (lib) { triggerLibraryRescan(ctx, lib); });
    entry.state = 'completed';
    entry.finishedAt = Date.now();
    upsertHistory(ctx, entry);
    removeActive(entry.id);
    if (ipc) emit(ctx, ipc.EVENT.WEB_TORRENT_COMPLETED, entry);
    emitUpdated(ctx);
    return;
  }

  await routeCompletedFiles(ctx, rec);

  entry.state = entry.failedFiles > 0 ? 'completed_with_errors' : 'completed';
  entry.finishedAt = Date.now();
  upsertHistory(ctx, entry);
  removeActive(entry.id);

  if (ipc) emit(ctx, ipc.EVENT.WEB_TORRENT_COMPLETED, entry);
  emitUpdated(ctx);
}

function onMetadataReady(ctx, torrent, entry, rec) {
  var ipc = getIpc();
  entry.infoHash = String(torrent.infoHash || entry.infoHash || '');
  entry.name = String(torrent.name || entry.name || entry.infoHash || 'Torrent');
  entry.totalSize = Number(torrent.length || 0);
  entry.numPeers = Number(torrent.numPeers || 0);
  entry.files = buildFileList(torrent);
  if (!entry.filePriorities || typeof entry.filePriorities !== 'object') entry.filePriorities = {};
  entry.metadataReady = true;

  // If no destination was set upfront, deselect all files so data doesn't download
  // until the user picks files + destination in the torrent tab UI.
  if (!entry.destinationRoot) {
    entry.state = 'metadata_ready';
    for (var i = 0; i < torrent.files.length; i++) {
      try { torrent.files[i].deselect(); } catch {}
      if (entry.files[i]) entry.files[i].selected = false;
    }
  }

  upsertHistory(ctx, entry);
  if (ipc) emit(ctx, ipc.EVENT.WEB_TORRENT_METADATA, entry);
  emitUpdated(ctx);
}

function bindTorrent(ctx, torrent, entry) {
  var ipc = getIpc();
  entry.infoHash = String(torrent.infoHash || entry.infoHash || '');
  entry.name = String(torrent.name || entry.name || entry.infoHash || 'Torrent');
  if (!entry.savePath && entry.destinationRoot) entry.savePath = entry.destinationRoot;
  entry.state = entry.destinationRoot ? 'downloading' : 'resolving_metadata';
  upsertHistory(ctx, entry);

  var rec = { torrent: torrent, entry: entry, interval: null, streams: {}, http: null };
  activeById.set(entry.id, rec);

  // Handle metadata: for .torrent files, metadata is available immediately.
  // For magnet links, we need to wait for the 'ready' event.
  if (torrent.files && torrent.files.length > 0) {
    onMetadataReady(ctx, torrent, entry, rec);
  } else {
    torrent.on('ready', function () {
      onMetadataReady(ctx, torrent, entry, rec);
    });
  }

  rec.interval = setInterval(function () {
    if (!activeById.has(entry.id)) return;
    entry.progress = Number(torrent.progress || 0);
    entry.downloadRate = Number(torrent.downloadSpeed || 0);
    entry.uploadSpeed = Number(torrent.uploadSpeed || 0);
    entry.uploaded = Number(torrent.uploaded || 0);
    entry.downloaded = Number(torrent.downloaded || 0);
    entry.numPeers = Number(torrent.numPeers || 0);
    entry.name = String(torrent.name || entry.name || '');
    updateFileProgress(entry, torrent);
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

function resolveDestinationRoot(payload, required) {
  var destinationRoot = String(payload && payload.destinationRoot || '').trim();
  if (!destinationRoot) {
    if (required) return { ok: false, error: 'Destination folder required', absRoot: '' };
    return { ok: true, absRoot: '' };
  }
  var absRoot = '';
  try { absRoot = path.resolve(destinationRoot); } catch {}
  if (!absRoot) return { ok: false, error: 'Invalid destination folder', absRoot: '' };
  try { fs.mkdirSync(absRoot, { recursive: true }); } catch {}
  return { ok: true, absRoot: absRoot };
}

async function addTorrentInput(ctx, entry, input) {
  var cl = await ensureClient();
  try {
    var destinationRoot = String(entry && entry.destinationRoot || '').trim();
    var addPath = destinationRoot ? destinationRoot : buildTorrentTmpPath(ctx, entry.id);
    var torrent = cl.add(input, { path: addPath });
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

// FEAT-TOR: Check if Tor proxy is active (cart mode — queue without downloading)
function isTorActive() {
  try {
    var torProxy = require('../torProxy');
    return torProxy.isActive();
  } catch { return false; }
}

async function startMagnet(ctx, evt, payload) {
  var magnetUri = String(payload && payload.magnetUri || '').trim();
  var origin = String(payload && payload.origin || '').trim().toLowerCase();
  if (!magnetUri || magnetUri.indexOf('magnet:') !== 0) return { ok: false, error: 'Invalid magnet URI' };
  var root = resolveDestinationRoot(payload, false);
  if (!root.ok) return { ok: false, error: root.error };
  // Reuse existing torrent if same magnet is already active
  var existing = findActiveBySource({ magnetUri: magnetUri });
  if (existing && existing.entry) return { ok: true, id: existing.entry.id, reused: true };
  // FEAT-TOR: Force empty destination when Tor is on → queues in metadata_ready state
  var destRoot = isTorActive() ? '' : root.absRoot;
  var entry = createEntry({
    magnetUri: magnetUri,
    origin: origin,
    sourceUrl: String(payload && payload.referer || ''),
    destinationRoot: destRoot,
    savePath: destRoot || '',
    directWrite: !!destRoot
  });
  return addTorrentInput(ctx, entry, magnetUri);
}

async function startTorrentUrl(ctx, evt, payload) {
  var url = String(payload && payload.url || '').trim();
  var origin = String(payload && payload.origin || '').trim().toLowerCase();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'Invalid torrent URL' };
  var root = resolveDestinationRoot(payload, false);
  if (!root.ok) return { ok: false, error: root.error };
  // Reuse existing torrent if same URL is already active
  var existing = findActiveBySource({ sourceUrl: url });
  if (existing && existing.entry) return { ok: true, id: existing.entry.id, reused: true };
  var fetched = null;
  try {
    fetched = await fetchTorrentBuffer(url, payload && payload.referer);
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err || 'Failed to fetch torrent URL') };
  }
  if (!fetched || !fetched.ok) return { ok: false, error: String((fetched && fetched.error) || 'Failed to fetch torrent URL') };

  // FEAT-TOR: Force empty destination when Tor is on
  var destRoot = isTorActive() ? '' : root.absRoot;
  var entry = createEntry({ sourceUrl: url, origin: origin, destinationRoot: destRoot, savePath: destRoot || '', directWrite: !!destRoot });
  return addTorrentInput(ctx, entry, fetched.buffer);
}

async function startTorrentBuffer(ctx, evt, payload) {
  var origin = String(payload && payload.origin || '').trim().toLowerCase();
  var root = resolveDestinationRoot(payload, false);
  if (!root.ok) return { ok: false, error: root.error };
  var input = payload && payload.buffer;
  if (!Buffer.isBuffer(input) || !input.length) return { ok: false, error: 'Invalid torrent file' };
  // Reuse existing torrent if same source URL is already active
  var sourceUrl = String(payload && (payload.sourceUrl || payload.referer) || '').trim();
  var existing = findActiveBySource({ sourceUrl: sourceUrl });
  if (existing && existing.entry) return { ok: true, id: existing.entry.id, reused: true };
  // FEAT-TOR: Force empty destination when Tor is on
  var destRoot = isTorActive() ? '' : root.absRoot;
  var entry = createEntry({
    sourceUrl: sourceUrl,
    origin: origin,
    destinationRoot: destRoot,
    savePath: destRoot || '',
    directWrite: !!destRoot
  });
  return addTorrentInput(ctx, entry, input);
}

async function pause(ctx, _evt, payload) {
  var id = extractId(payload);
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
  var id = extractId(payload);
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
  var id = extractId(payload);
  // Stop progress interval FIRST — prevents upsertHistory re-insertion during destroy
  var rec = removeActive(id);
  if (!rec || !rec.torrent) return { ok: false, error: 'Torrent not active' };
  rec.entry.state = 'cancelled';
  rec.entry.finishedAt = Date.now();
  try {
    await new Promise(function (resolve) {
      rec.torrent.destroy({ destroyStore: true }, function () { resolve(); });
    });
  } catch {}
  upsertHistory(ctx, rec.entry);
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
  var activeStates = { downloading: 1, paused: 1, resolving_metadata: 1, metadata_ready: 1, completed_pending: 1 };
  c.torrents = (c.torrents || []).filter(function (t) {
    return t && activeStates[String(t.state)];
  });
  c.updatedAt = Date.now();
  writeHistory(ctx);
  emitUpdated(ctx);
  return { ok: true };
}

async function removeHistory(ctx, _evt, payload) {
  var id = extractId(payload);
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

async function selectFiles(ctx, _evt, payload) {
  var id = extractId(payload);
  var rec = activeById.get(id);
  if (!rec || !rec.torrent) return { ok: false, error: 'Torrent not active' };
  var torrent = rec.torrent;
  var entry = rec.entry;

  var selectedIndices = payload && Array.isArray(payload.selectedIndices) ? payload.selectedIndices : [];
  var selectedSet = new Set(selectedIndices.map(Number));
  var inPriorities = (payload && payload.priorities && typeof payload.priorities === 'object') ? payload.priorities : {};

  if (isTorActive() && selectedSet.size > 0) {
    return { ok: false, error: 'Disable Tor to start torrent downloads' };
  }

  var dest = String(payload && payload.destinationRoot || '').trim();
  if (dest) {
    var absRoot = '';
    try { absRoot = path.resolve(dest); } catch {}
    if (absRoot) {
      try { fs.mkdirSync(absRoot, { recursive: true }); } catch {}
      entry.destinationRoot = absRoot;
      entry.savePath = absRoot;
      entry.directWrite = true;
    }
  }

  var sequential = (payload && Object.prototype.hasOwnProperty.call(payload, 'sequential'))
    ? !!payload.sequential
    : (entry.sequential !== false);
  entry.sequential = sequential;
  if (!entry.filePriorities || typeof entry.filePriorities !== 'object') entry.filePriorities = {};

  if (!torrent.files || !torrent.files.length) {
    upsertHistory(ctx, entry);
    emitUpdated(ctx);
    return { ok: true, pending: true };
  }

  var selectedFiles = [];
  for (var i = 0; i < torrent.files.length; i++) {
    if (selectedSet.has(i)) {
      selectedFiles.push(i);
      if (entry.files && entry.files[i]) {
        entry.files[i].selected = true;
        var pRaw = String(inPriorities[i] || entry.filePriorities[i] || entry.files[i].priority || 'normal').toLowerCase();
        var pval = (pRaw === 'high' || pRaw === 'low') ? pRaw : 'normal';
        entry.files[i].priority = pval;
        entry.filePriorities[i] = pval;
      }
    } else {
      try { torrent.files[i].deselect(); } catch {}
      if (entry.files && entry.files[i]) entry.files[i].selected = false;
    }
  }

  function priorityWeight(priority) {
    if (priority === 'high') return 9;
    if (priority === 'low') return 1;
    return 5;
  }

  for (var si = 0; si < selectedFiles.length; si++) {
    var fileIdx = selectedFiles[si];
    try {
      var filePriority = String((entry.filePriorities && entry.filePriorities[fileIdx]) || 'normal').toLowerCase();
      var basePr = priorityWeight(filePriority);
      var wirePr = sequential ? (basePr + Math.max(0, selectedFiles.length - si)) : basePr;
      torrent.files[fileIdx].select(wirePr);
    } catch {}
  }

  if (entry.state === 'metadata_ready' || entry.state === 'completed_pending') {
    if (entry.destinationRoot && selectedSet.size > 0) {
      entry.state = 'downloading';
    }
  }

  upsertHistory(ctx, entry);
  emitUpdated(ctx);
  return { ok: true };
}

async function setDestination(ctx, _evt, payload) {
  var id = extractId(payload);
  var rec = activeById.get(id);
  if (!rec || !rec.entry) return { ok: false, error: 'Torrent not active' };
  var entry = rec.entry;

  var dest = String(payload && payload.destinationRoot || '').trim();
  if (!dest) return { ok: false, error: 'Destination folder required' };
  var absRoot = '';
  try { absRoot = path.resolve(dest); } catch {}
  if (!absRoot) return { ok: false, error: 'Invalid destination folder' };
  try { fs.mkdirSync(absRoot, { recursive: true }); } catch {}

  entry.destinationRoot = absRoot;
  entry.savePath = absRoot;
  entry.directWrite = true;

  // If torrent already completed but was waiting for destination, route files now
  if (entry.state === 'completed_pending' && rec.torrent) {
    await routeCompletedFiles(ctx, rec);
    entry.state = entry.failedFiles > 0 ? 'completed_with_errors' : 'completed';
    entry.finishedAt = Date.now();
    upsertHistory(ctx, entry);
    removeActive(entry.id);
    var ipc = getIpc();
    if (ipc) emit(ctx, ipc.EVENT.WEB_TORRENT_COMPLETED, entry);
    emitUpdated(ctx);
    return { ok: true };
  }

  upsertHistory(ctx, entry);
  emitUpdated(ctx);
  return { ok: true };
}

function sanitizeFileName(name, fallback) {
  var raw = String(name || '').trim();
  var clean = raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim();
  return clean || String(fallback || 'file');
}

function streamCachePathFor(ctx, entry, torrent, fileIndex, fileObj) {
  var id = String(entry && entry.id || '');
  var torrentName = sanitizeFileName(String((torrent && torrent.name) || (entry && entry.name) || 'torrent'), 'torrent');
  var fileName = sanitizeFileName(String((fileObj && (fileObj.name || path.basename(fileObj.path || ''))) || ('file_' + fileIndex)), 'file_' + fileIndex);
  var cacheDir = ctx.storage.dataPath(path.join('web_torrent_stream_cache', id, torrentName));
  ensureDir(cacheDir);
  return path.join(cacheDir, String(fileIndex) + '__' + fileName);
}

function markStreamReady(ctx, ipc, rec, streamKey, payload) {
  try {
    var s = rec && rec.streams ? rec.streams[streamKey] : null;
    if (!s || s.ready) return;
    s.ready = true;
    if (Array.isArray(s.waiters) && s.waiters.length) {
      var waiters = s.waiters.slice();
      s.waiters.length = 0;
      waiters.forEach(function (fn) { try { fn(); } catch {} });
    }
  } catch {}
  if (ipc) emit(ctx, ipc.EVENT.WEB_TORRENT_STREAM_READY, payload);
}

function failStreamWaiters(rec, streamKey) {
  try {
    var s = rec && rec.streams ? rec.streams[streamKey] : null;
    if (!s || !Array.isArray(s.waiters) || !s.waiters.length) return;
    var waiters = s.waiters.slice();
    s.waiters.length = 0;
    waiters.forEach(function (fn) { try { fn(new Error('stream_failed')); } catch {} });
  } catch {}
}

function waitForStreamReady(rec, streamKey, timeoutMs) {
  return new Promise(function (resolve) {
    var s = rec && rec.streams ? rec.streams[streamKey] : null;
    if (!s) return resolve(false);
    if (s.ready) return resolve(true);
    if (!Array.isArray(s.waiters)) s.waiters = [];
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      resolve(false);
    }, Math.max(1000, Number(timeoutMs) || 15000));
    s.waiters.push(function (err) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(!err);
    });
  });
}

function streamContentType(fileName) {
  var ext = path.extname(String(fileName || '')).toLowerCase();
  if (ext === '.mp4' || ext === '.m4v') return 'video/mp4';
  if (ext === '.mkv') return 'video/x-matroska';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.avi') return 'video/x-msvideo';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.ts' || ext === '.m2ts') return 'video/mp2t';
  return 'application/octet-stream';
}

function parseHttpRangeHeader(rangeHeader, totalLength) {
  var raw = String(rangeHeader || '').trim();
  var total = Number(totalLength || 0);
  if (!raw || total <= 0) return null;
  var m = /^bytes=(\d*)-(\d*)$/i.exec(raw);
  if (!m) return null;

  var start = 0;
  var end = total - 1;
  var a = m[1];
  var b = m[2];

  if (!a && !b) return null;
  if (!a) {
    var suffix = Number(b);
    if (!Number.isFinite(suffix) || suffix <= 0) return { invalid: true };
    start = Math.max(0, total - suffix);
  } else {
    start = Number(a);
    if (!Number.isFinite(start) || start < 0) return { invalid: true };
    if (b) {
      end = Number(b);
      if (!Number.isFinite(end) || end < start) return { invalid: true };
    }
  }

  if (start >= total) return { invalid: true };
  if (end >= total) end = total - 1;
  return { start: start, end: end };
}

function prioritizeTorrentFile(rec, fileIndex) {
  var torrent = rec && rec.torrent;
  var entry = rec && rec.entry;
  if (!torrent || !torrent.files || !torrent.files.length) return;
  for (var i = 0; i < torrent.files.length; i++) {
    try {
      if (i === fileIndex) torrent.files[i].select(9999);
      else torrent.files[i].deselect();
    } catch {}
    if (entry && Array.isArray(entry.files) && entry.files[i]) {
      entry.files[i].selected = (i === fileIndex);
      entry.files[i].priority = (i === fileIndex) ? 'high' : 'low';
    }
    if (entry && entry.filePriorities && typeof entry.filePriorities === 'object') {
      entry.filePriorities[i] = (i === fileIndex) ? 'high' : 'low';
    }
  }
}

function waitForFirstStreamChunk(fileObj, timeoutMs) {
  return new Promise(function (resolve) {
    if (!fileObj || Number(fileObj.length || 0) <= 0) return resolve(false);
    var maxBytes = Math.min(Number(fileObj.length || 0) - 1, (1024 * 1024) - 1);
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      try { if (rs) rs.destroy(); } catch {}
      resolve(false);
    }, Math.max(1000, Number(timeoutMs) || 15000));
    var rs = null;
    try {
      rs = fileObj.createReadStream({ start: 0, end: Math.max(0, maxBytes) });
    } catch {
      clearTimeout(timer);
      return resolve(false);
    }
    rs.once('data', function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { rs.destroy(); } catch {}
      resolve(true);
    });
    rs.once('error', function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(false);
    });
    rs.once('end', function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function ensureHttpStreamServer(rec) {
  if (rec && rec.http && rec.http.server && rec.http.port > 0) return rec.http;
  var torrent = rec && rec.torrent;
  if (!torrent) throw new Error('torrent_missing');

  var server = http.createServer(function (req, res) {
    (async function handle() {
      var reqUrl = String((req && req.url) || '/');
      var m = /^\/file\/(\d+)$/.exec(reqUrl.split('?')[0] || '');
      if (!m) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      var fileIndex = Number(m[1]);
      if (!Number.isFinite(fileIndex) || fileIndex < 0) {
        res.writeHead(400);
        res.end('Invalid file index');
        return;
      }

      var readyOk = await waitForTorrentMetadata(torrent, 15000);
      if (!readyOk || !torrent.files || fileIndex >= torrent.files.length) {
        res.writeHead(404);
        res.end('File not ready');
        return;
      }

      var fileObj = torrent.files[fileIndex];
      var total = Number(fileObj && fileObj.length || 0);
      if (!Number.isFinite(total) || total <= 0) {
        res.writeHead(404);
        res.end('Invalid file');
        return;
      }

      try { fileObj.select(9999); } catch {}
      var range = parseHttpRangeHeader(req && req.headers && req.headers.range, total);
      if (range && range.invalid) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + total });
        res.end();
        return;
      }

      var start = range ? range.start : 0;
      var end = range ? range.end : (total - 1);
      var chunkLength = (end - start) + 1;
      var headers = {
        'Accept-Ranges': 'bytes',
        'Content-Type': streamContentType(fileObj && fileObj.name),
        'Content-Length': String(chunkLength),
        'Cache-Control': 'no-store',
      };
      if (range) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + total;
      res.writeHead(range ? 206 : 200, headers);

      var rs = null;
      try {
        rs = fileObj.createReadStream({ start: start, end: end });
      } catch (err) {
        try { res.writeHead(500); } catch {}
        try { res.end('Stream error'); } catch {}
        return;
      }

      var closed = false;
      var cleanup = function () {
        if (closed) return;
        closed = true;
        try { if (rs) rs.destroy(); } catch {}
      };
      req.on('close', cleanup);
      res.on('close', cleanup);
      rs.on('error', function () {
        try { if (!res.headersSent) res.writeHead(500); } catch {}
        try { res.end(); } catch {}
      });
      rs.pipe(res);
    })().catch(function () {
      try { res.writeHead(500); } catch {}
      try { res.end('Internal error'); } catch {}
    });
  });

  await new Promise(function (resolve, reject) {
    var done = false;
    server.once('error', function (err) {
      if (done) return;
      done = true;
      reject(err || new Error('http_server_error'));
    });
    server.listen(0, '127.0.0.1', function () {
      if (done) return;
      done = true;
      resolve();
    });
  });

  var addr = server.address();
  var port = Number(addr && addr.port || 0);
  if (!port) {
    try { server.close(); } catch {}
    throw new Error('http_server_port_missing');
  }

  rec.http = { server: server, port: port };
  return rec.http;
}

function writePlaybackPlaylist(ctx, id, fileIndex, fileObj, streamUrl) {
  try {
    var fileName = sanitizeFileName(String(fileObj && fileObj.name || ('stream_' + fileIndex)), 'stream_' + fileIndex);
    var dir = ctx.storage.dataPath(path.join('web_torrent_stream_playlists', id));
    ensureDir(dir);
    var out = path.join(dir, String(fileIndex) + '__' + fileName + '.m3u8');
    var txt = '#EXTM3U\n#EXTINF:-1,' + fileName + '\n' + String(streamUrl || '') + '\n';
    fs.writeFileSync(out, txt, 'utf-8');
    return out;
  } catch {
    return '';
  }
}

function normalizeInfoHash(raw) {
  var v = String(raw || '').trim();
  if (!v) return '';
  return v.replace(/^[^A-Za-z0-9]*btih:/i, '').trim();
}

function magnetFromInfoHash(infoHash) {
  var h = normalizeInfoHash(infoHash);
  if (!h) return '';
  return 'magnet:?xt=urn:btih:' + h;
}

function waitForTorrentMetadata(torrent, timeoutMs) {
  return new Promise(function (resolve) {
    if (torrent && torrent.files && torrent.files.length > 0) return resolve(true);
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      resolve(false);
    }, Math.max(1000, Number(timeoutMs) || 15000));
    var finish = function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(true);
    };
    try { torrent.once('ready', finish); } catch {}
    try { torrent.once('metadata', finish); } catch {}
  });
}

function historyEntryById(ctx, id) {
  if (!id) return null;
  try {
    var c = ensureHistory(ctx);
    var list = Array.isArray(c && c.torrents) ? c.torrents : [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (row && String(row.id) === String(id)) return row;
    }
  } catch {}
  return null;
}

function streamActivationSource(payload, fallbackEntry) {
  var pMagnet = String(payload && payload.magnetUri || '').trim();
  if (pMagnet) return { input: pMagnet, source: 'payload_magnet' };
  var pInfoHash = normalizeInfoHash(payload && payload.infoHash);
  if (pInfoHash) return { input: magnetFromInfoHash(pInfoHash), source: 'payload_infohash' };

  var eMagnet = String(fallbackEntry && fallbackEntry.magnetUri || '').trim();
  if (eMagnet) return { input: eMagnet, source: 'history_magnet' };
  var eInfoHash = normalizeInfoHash(fallbackEntry && fallbackEntry.infoHash);
  if (eInfoHash) return { input: magnetFromInfoHash(eInfoHash), source: 'history_infohash' };
  var eUrl = String(fallbackEntry && fallbackEntry.sourceUrl || '').trim();
  if (eUrl) return { input: eUrl, source: 'history_torrent_url' };
  return { input: '', source: 'none' };
}

async function activateForStream(ctx, id, payload) {
  var existing = activeById.get(id);
  if (existing && existing.torrent) {
    return { ok: true, rec: existing, autoActivated: false, activationSource: 'already_active' };
  }

  var historyEntry = historyEntryById(ctx, id);
  var src = streamActivationSource(payload, historyEntry);
  if (!src.input) {
    return { ok: false, error: 'Torrent not active and no source to auto-activate', autoActivated: false, activationSource: src.source };
  }

  var entry = createEntry(historyEntry || {});
  entry.id = String(id);
  entry.destinationRoot = '';
  entry.savePath = '';
  entry.directWrite = false;
  entry.videoLibrary = true;
  if (!entry.magnetUri && typeof src.input === 'string' && src.input.indexOf('magnet:') === 0) entry.magnetUri = src.input;
  if (!entry.infoHash) {
    var infoHash = normalizeInfoHash(payload && payload.infoHash) || normalizeInfoHash(historyEntry && historyEntry.infoHash);
    if (infoHash) entry.infoHash = infoHash;
  }
  var addRes = await addTorrentInput(ctx, entry, src.input);
  if (!addRes || !addRes.ok) {
    return { ok: false, error: String((addRes && addRes.error) || 'Failed to auto-activate torrent'), autoActivated: false, activationSource: src.source };
  }
  var rec = activeById.get(id);
  if (!rec || !rec.torrent) {
    return { ok: false, error: 'Torrent auto-activation did not produce an active session', autoActivated: false, activationSource: src.source };
  }
  return { ok: true, rec: rec, autoActivated: true, activationSource: src.source };
}

async function streamFile(ctx, _evt, payload) {
  if (isTorActive()) {
    return { ok: false, error: 'Disable Tor to stream torrent files' };
  }

  var id = extractId(payload);
  var autoActivate = !(payload && Object.prototype.hasOwnProperty.call(payload, 'autoActivate')) || !!payload.autoActivate;
  var rec = activeById.get(id);
  var autoActivated = false;
  var activationSource = 'already_active';
  if ((!rec || !rec.torrent) && autoActivate) {
    var activated = await activateForStream(ctx, id, payload || {});
    if (!activated || !activated.ok) {
      return {
        ok: false,
        error: String((activated && activated.error) || 'Torrent not active'),
        autoActivated: false,
        activationSource: String((activated && activated.activationSource) || 'none'),
      };
    }
    rec = activated.rec;
    autoActivated = !!activated.autoActivated;
    activationSource = String(activated.activationSource || 'auto');
  }
  if (!rec || !rec.torrent) {
    return { ok: false, error: 'Torrent not active', autoActivated: false, activationSource: 'none' };
  }
  var torrent = rec.torrent;

  var readyOk = await waitForTorrentMetadata(torrent, Number(payload && payload.readyTimeoutMs) || 15000);
  if (!readyOk) {
    return { ok: false, error: 'Timed out waiting for torrent metadata', autoActivated: autoActivated, activationSource: activationSource };
  }

  var fileIndex = Number(payload && payload.fileIndex);
  if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= torrent.files.length) {
    return { ok: false, error: 'Invalid file index', autoActivated: autoActivated, activationSource: activationSource };
  }

  var forPlaybackCache = !!(payload && payload.forPlaybackCache);
  var awaitReady = !!(payload && payload.awaitReady);
  var preferHttp = !!(forPlaybackCache && (!(payload && Object.prototype.hasOwnProperty.call(payload, 'preferHttp')) || !!payload.preferHttp));

  if (preferHttp) {
    prioritizeTorrentFile(rec, fileIndex);
    var fileObj = torrent.files[fileIndex];
    if (!fileObj) return { ok: false, error: 'Invalid file', autoActivated: autoActivated, activationSource: activationSource };

    var httpInfo = null;
    try {
      httpInfo = await ensureHttpStreamServer(rec);
    } catch (err) {
      return {
        ok: false,
        error: 'Failed to start HTTP stream server: ' + String((err && err.message) || err || 'unknown'),
        autoActivated: autoActivated,
        activationSource: activationSource,
      };
    }

    var streamUrl = 'http://127.0.0.1:' + String(httpInfo.port) + '/file/' + String(fileIndex);
    var playlistPath = writePlaybackPlaylist(ctx, id, fileIndex, fileObj, streamUrl);
    if (!playlistPath) {
      return { ok: false, error: 'Failed to create stream playlist', autoActivated: autoActivated, activationSource: activationSource };
    }

    if (awaitReady) {
      var firstChunkOk = await waitForFirstStreamChunk(fileObj, Number(payload && payload.readyTimeoutMs) || 15000);
      if (!firstChunkOk) {
        return { ok: false, error: 'Timed out waiting for initial torrent data', path: playlistPath, url: streamUrl, autoActivated: autoActivated, activationSource: activationSource };
      }
    }

    return {
      ok: true,
      path: playlistPath,
      url: streamUrl,
      transport: 'http_playlist',
      autoActivated: autoActivated,
      activationSource: activationSource,
    };
  }

  var destPath = String(payload && payload.destinationPath || '').trim();
  if (!destPath && forPlaybackCache) {
    try {
      destPath = streamCachePathFor(ctx, rec.entry, torrent, fileIndex, torrent.files[fileIndex]);
    } catch {}
  }
  if (!destPath) return { ok: false, error: 'Destination path required', autoActivated: autoActivated, activationSource: activationSource };

  var absPath = '';
  try { absPath = path.resolve(destPath); } catch {}
  if (!absPath) return { ok: false, error: 'Invalid destination path', autoActivated: autoActivated, activationSource: activationSource };

  // Ensure the target file gets priority during playback-oriented streaming.
  if (forPlaybackCache) prioritizeTorrentFile(rec, fileIndex);
  else {
    try { torrent.files[fileIndex].select(); } catch {}
    if (rec.entry.files && rec.entry.files[fileIndex]) rec.entry.files[fileIndex].selected = true;
  }

  try { ensureDir(path.dirname(absPath)); } catch {}

  var file = torrent.files[fileIndex];
  var ipc = getIpc();
  var streamKey = id + ':' + fileIndex;

  // Avoid duplicate streams for the same file
  if (rec.streams && rec.streams[streamKey]) {
    if (awaitReady) {
      var readyExisting = await waitForStreamReady(rec, streamKey, Number(payload && payload.readyTimeoutMs) || 15000);
      if (!readyExisting) return { ok: false, error: 'Timed out waiting for stream readiness', path: absPath, alreadyStreaming: true, autoActivated: autoActivated, activationSource: activationSource };
    }
    return { ok: true, path: absPath, alreadyStreaming: true, autoActivated: autoActivated, activationSource: activationSource };
  }

  try {
    var rs = file.createReadStream();
    var ws = fs.createWriteStream(absPath);
    var written = 0;
    var readyFired = false;
    var READY_THRESHOLD = Math.min(5 * 1024 * 1024, Math.floor(file.length * 0.02)); // 5MB or 2%
    if (READY_THRESHOLD < 512 * 1024) READY_THRESHOLD = Math.min(512 * 1024, file.length); // at least 512KB

    rs.on('data', function (chunk) {
      written += chunk.length;
      if (!readyFired && written >= READY_THRESHOLD) {
        readyFired = true;
        markStreamReady(ctx, ipc, rec, streamKey, {
          id: id, fileIndex: fileIndex, path: absPath, bytesWritten: written
        });
      }
    });

    rs.on('error', function (err) {
      try { ws.end(); } catch {}
      failStreamWaiters(rec, streamKey);
      delete rec.streams[streamKey];
    });

    ws.on('error', function (err) {
      try { rs.destroy(); } catch {}
      failStreamWaiters(rec, streamKey);
      delete rec.streams[streamKey];
    });

    ws.on('finish', function () {
      // If stream wasn't ready yet (small file), fire ready now
      if (!readyFired) {
        markStreamReady(ctx, ipc, rec, streamKey, {
          id: id, fileIndex: fileIndex, path: absPath, bytesWritten: written
        });
      }
      delete rec.streams[streamKey];
    });

    rs.pipe(ws);
    rec.streams[streamKey] = { rs: rs, ws: ws, path: absPath, ready: false, waiters: [] };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err), autoActivated: autoActivated, activationSource: activationSource };
  }

  if (awaitReady) {
    var ready = await waitForStreamReady(rec, streamKey, Number(payload && payload.readyTimeoutMs) || 15000);
    if (!ready) return { ok: false, error: 'Timed out waiting for stream readiness', path: absPath, autoActivated: autoActivated, activationSource: activationSource };
  }

  return { ok: true, path: absPath, autoActivated: autoActivated, activationSource: activationSource };
}

// ── Video library integration ──

var VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.webm', '.mov', '.wmv', '.flv', '.m4v', '.ts', '.m2ts'];
var STREAMABLE_MANIFEST_FILE = '.tanko_torrent_stream.json';

function isVideoFile(fileName) {
  var ext = path.extname(String(fileName || '')).toLowerCase();
  return VIDEO_EXTS.indexOf(ext) !== -1;
}

function normalizeVideoRelativePath(filePath, torrentName) {
  var relPath = String(filePath || '').trim().replace(/\\/g, '/');
  var tName = String(torrentName || '').trim().replace(/\\/g, '/');
  if (!relPath) return '';
  if (tName && relPath.indexOf(tName + '/') === 0) relPath = relPath.slice(tName.length + 1);
  return relPath.replace(/^\/+/, '');
}

function ensurePlaceholderFile(filePath) {
  try {
    ensureDir(path.dirname(filePath));
    if (fs.existsSync(filePath)) return true;
    fs.closeSync(fs.openSync(filePath, 'w'));
    return true;
  } catch {
    return false;
  }
}

function writeStreamableManifest(showPath, manifest) {
  try {
    ensureDir(showPath);
    var manifestPath = path.join(showPath, STREAMABLE_MANIFEST_FILE);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    return { ok: true, path: manifestPath };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err || 'Failed writing stream manifest') };
  }
}

async function addToVideoLibrary(ctx, evt, payload) {
  if (isTorActive()) {
    return { ok: false, error: 'Disable Tor to stream torrents into Video Library' };
  }

  var id = extractId(payload);
  var rec = activeById.get(id);
  if (!rec || !rec.torrent || !rec.entry) return { ok: false, error: 'Torrent not active' };

  var entry = rec.entry;
  var torrent = rec.torrent;

  if (entry.state !== 'metadata_ready') {
    return { ok: false, error: 'Torrent must be in metadata_ready state (got ' + entry.state + ')' };
  }

  var dest = String(payload && payload.destinationRoot || '').trim();
  if (!dest) {
    try { dest = require('electron').app.getPath('downloads'); } catch {}
  }
  if (!dest) return { ok: false, error: 'Destination folder required' };
  var absRoot = '';
  try { absRoot = path.resolve(dest); } catch {}
  if (!absRoot) return { ok: false, error: 'Invalid destination folder' };
  try { fs.mkdirSync(absRoot, { recursive: true }); } catch {}

  // Compute the show folder path (destination + torrent name)
  var torrentName = String(torrent.name || entry.name || 'Torrent');
  var showPath = path.join(absRoot, torrentName);

  // Identify video file indices
  var videoIndices = [];
  var files = entry.files || [];
  for (var i = 0; i < files.length; i++) {
    if (isVideoFile(files[i].name || files[i].path || '')) {
      videoIndices.push(files[i].index != null ? files[i].index : i);
    }
  }

  if (!videoIndices.length) return { ok: false, error: 'No video files found in torrent' };

  var streamable = !!(payload && payload.streamable);

  // Mark as video library torrent
  entry.videoLibrary = true;
  entry.showFolderPath = showPath;
  entry.videoLibraryStreamable = streamable;

  if (streamable) {
    var manifest = {
      version: 1,
      streamable: true,
      createdAt: Date.now(),
      torrentId: String(entry.id || id),
      infoHash: String(entry.infoHash || torrent.infoHash || ''),
      magnetUri: String(entry.magnetUri || torrent.magnetURI || ''),
      torrentName: torrentName,
      files: [],
    };

    for (var sm = 0; sm < videoIndices.length; sm++) {
      var smIdx = videoIndices[sm];
      var smFile = torrent.files[smIdx];
      if (!smFile) continue;
      var relStreamPath = normalizeVideoRelativePath(smFile.path || smFile.name || '', torrentName);
      if (!relStreamPath) continue;

      // Create a tiny placeholder so the existing video scanner indexes this episode.
      var placeholderPath = path.join(showPath, relStreamPath);
      ensurePlaceholderFile(placeholderPath);

      manifest.files.push({
        fileIndex: smIdx,
        relativePath: relStreamPath,
        length: Number(smFile.length || 0),
        name: String(smFile.name || ''),
      });
    }

    var mw = writeStreamableManifest(showPath, manifest);
    if (!mw.ok) return { ok: false, error: mw.error || 'Failed to create streamable manifest' };
  } else {
    // Select video files with sequential mode via internal selectFiles call.
    var selectRes = await selectFiles(ctx, evt, {
      id: id,
      selectedIndices: videoIndices,
      destinationRoot: absRoot,
      sequential: true
    });
    if (!selectRes || !selectRes.ok) return selectRes || { ok: false, error: 'Failed to prepare torrent files' };

    // Stream each video file to the show folder.
    for (var si = 0; si < videoIndices.length; si++) {
      var fileIdx = videoIndices[si];
      var tFile = torrent.files[fileIdx];
      if (!tFile) continue;

      var relPath = normalizeVideoRelativePath(tFile.path || tFile.name || '', torrentName);
      if (!relPath) continue;
      var fileDest = path.join(showPath, relPath);

      await streamFile(ctx, evt, {
        id: id,
        fileIndex: fileIdx,
        destinationPath: fileDest
      });
    }
  }

  // Register the show folder in the video library
  var addRes = await libraryBridge.addVideoShowFolderPath(ctx, showPath);
  if (!addRes || addRes.ok === false) {
    wtLog('addToVideoLibrary: video domain error: ' + String((addRes && addRes.error) || 'addShowFolderPath failed'));
  }

  upsertHistory(ctx, entry);
  emitUpdated(ctx);
  wtLog('addToVideoLibrary: success, showPath=' + showPath + ', videoFiles=' + videoIndices.length + ', streamable=' + (streamable ? '1' : '0'));
  return { ok: true, showPath: showPath, streamable: streamable };
}

// ── FEAT-BROWSER: New capabilities from Aspect browser ──

function getPeerList(torrent) {
  var peers = [];
  try {
    var wires = torrent.wires || [];
    for (var i = 0; i < wires.length; i++) {
      var w = wires[i];
      if (!w) continue;
      peers.push({
        ip: String(w.remoteAddress || '?'),
        client: String(w.peerExtendedHandshake && w.peerExtendedHandshake.v || 'Unknown'),
        progress: Number(w.peerPieces ? (w.peerPieces.buffer ? w.peerPieces.count / (torrent.pieces ? torrent.pieces.length : 1) : 0) : 0),
        dlSpeed: Number(w.downloadSpeed ? w.downloadSpeed() : 0),
        ulSpeed: Number(w.uploadSpeed ? w.uploadSpeed() : 0),
      });
    }
  } catch {}
  return peers;
}

function buildTrackerList(torrent) {
  if (!torrent) return [];
  var trackers = [];
  try {
    var announces = torrent.announce || [];
    for (var i = 0; i < announces.length; i++) {
      trackers.push({ url: String(announces[i]), status: 'working', peers: 0 });
    }
  } catch {}
  return trackers;
}

function tryDeleteTorrentData(entry) {
  var root = String(entry && (entry.destinationRoot || entry.savePath) || '').trim();
  if (!root) return;
  var name = String(entry && entry.name || '').trim();
  var candidates = [];
  if (name) candidates.push(path.join(root, name));
  if (entry && Array.isArray(entry.files) && entry.files.length) {
    for (var i = 0; i < entry.files.length; i++) {
      var f = entry.files[i];
      if (!f || f.selected === false) continue;
      var rel = String(f.path || f.name || '').replace(/^[\/]+/, '');
      if (!rel) continue;
      if (name && (rel.indexOf(name + '/') === 0 || rel.indexOf(name + '\\') === 0)) rel = rel.slice(name.length + 1);
      candidates.push(path.join(root, rel));
    }
  }
  for (var c = 0; c < candidates.length; c++) {
    try { fs.rmSync(candidates[c], { recursive: true, force: true }); } catch {}
  }
}

function tryDeleteDir(targetPath) {
  var p = String(targetPath || '').trim();
  if (!p) return;
  try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
}

async function remove(ctx, _evt, payload) {
  var id = extractId(payload);
  if (!id) return { ok: false, error: 'Missing id' };
  var removeFiles = !!(payload && payload.removeFiles);
  var removeFromLibrary = !!(payload && payload.removeFromLibrary);
  var rec = removeActive(id);
  var entry = rec && rec.entry ? rec.entry : null;
  if (rec && rec.torrent) {
    try {
      await new Promise(function (resolve) {
        rec.torrent.destroy({ destroyStore: !!removeFiles }, function () { resolve(); });
      });
    } catch {}
  }
  if (!entry) {
    var c0 = ensureHistory(ctx);
    for (var k = 0; k < c0.torrents.length; k++) {
      var t0 = c0.torrents[k];
      if (t0 && String(t0.id) === id) { entry = t0; break; }
    }
  }
  if (removeFiles) {
    tryDeleteDir(ctx.storage.dataPath(path.join('web_torrent_stream_cache', id)));
    tryDeleteDir(ctx.storage.dataPath(path.join('web_torrent_tmp', id)));
    tryDeleteDir(ctx.storage.dataPath(path.join('web_torrent_stream_playlists', id)));
  }
  if (removeFiles && entry) {
    tryDeleteTorrentData(entry);
    if (entry.showFolderPath) tryDeleteDir(entry.showFolderPath);
  }
  if (removeFromLibrary && entry) {
    var root = String(entry.destinationRoot || entry.savePath || '').trim();
    if (root) detectLibrariesForPath(ctx, root).forEach(function (lib) { triggerLibraryRescan(ctx, lib); });
  }
  var c = ensureHistory(ctx);
  c.torrents = c.torrents.filter(function (t) { return !(t && String(t.id) === id); });
  c.updatedAt = Date.now();
  writeHistory(ctx);
  emitUpdated(ctx);
  return { ok: true };
}

async function pauseAll(ctx) {
  activeById.forEach(function (rec) {
    if (rec.entry.state === 'downloading' || rec.entry.state === 'seeding') {
      try { rec.torrent.pause(); } catch {}
      rec.entry.state = 'paused';
      upsertHistory(ctx, rec.entry);
    }
  });
  emitUpdated(ctx);
  return { ok: true };
}

async function resumeAll(ctx) {
  activeById.forEach(function (rec) {
    if (rec.entry.state === 'paused') {
      try { rec.torrent.resume(); } catch {}
      rec.entry.state = rec.entry.progress >= 1 ? 'seeding' : 'downloading';
      upsertHistory(ctx, rec.entry);
    }
  });
  emitUpdated(ctx);
  return { ok: true };
}

async function getPeers(ctx, _evt, payload) {
  var id = extractId(payload);
  var rec = activeById.get(id);
  if (!rec || !rec.torrent) return { ok: true, peers: [] };
  return { ok: true, peers: getPeerList(rec.torrent) };
}

async function getDhtNodes(ctx) {
  if (!client) return 0;
  try {
    return client.dht ? (client.dht.nodes ? client.dht.nodes.count || client.dht.nodes.length || 0 : 0) : 0;
  } catch { return 0; }
}

async function selectSaveFolder(ctx) {
  if (!ctx.win || ctx.win.isDestroyed()) return { ok: false, error: 'No window' };
  var result = await dialog.showOpenDialog(ctx.win, {
    title: 'Select save folder',
    defaultPath: require('electron').app.getPath('downloads'),
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths || !result.filePaths.length) {
    return { ok: false, cancelled: true };
  }
  return { ok: true, path: result.filePaths[0] };
}

async function resolveMetadata(ctx, _evt, payload) {
  var input = String(payload && payload.source || payload || '').trim();
  if (!input) return { ok: false, error: 'No source provided' };
  var preferredPath = String(payload && (payload.destinationRoot || payload.savePath || payload.path) || '').trim();
  var resolvePath = '';
  if (preferredPath) {
    try { resolvePath = path.resolve(preferredPath); } catch {}
    if (resolvePath) {
      try { fs.mkdirSync(resolvePath, { recursive: true }); } catch {}
    }
  }
  if (!resolvePath) {
    resolvePath = path.join(os.tmpdir(), 'tanko-resolve-' + Date.now());
    try { fs.mkdirSync(resolvePath, { recursive: true }); } catch {}
  }

  var cl = await ensureClient();
  var resolveId = 'res_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

  // If source is a file path (not a magnet URI), read the torrent file
  var addSource;
  if (input.indexOf('magnet:') === 0) {
    addSource = input;
  } else {
    try { addSource = await fs.promises.readFile(input); } catch (e) {
      return { ok: false, error: 'Cannot read torrent file: ' + (e.message || e) };
    }
  }

  return new Promise(function (resolve) {
    var resolved = false;
    var torrent;
    var pollTimer = null;
    var timeoutTimer = null;

    try {
      torrent = cl.add(addSource, {
        path: resolvePath
      });
    } catch (err) {
      return resolve({ ok: false, error: String(err && err.message || err) });
    }

    function finish() {
      if (resolved) return;
      resolved = true;
      if (pollTimer) { try { clearInterval(pollTimer); } catch {} pollTimer = null; }
      if (timeoutTimer) { try { clearTimeout(timeoutTimer); } catch {} timeoutTimer = null; }

      // Deselect all files to prevent data download
      if (torrent.files) {
        torrent.files.forEach(function (f) { try { f.deselect(); } catch {} });
      }

      var info = {
        name: String(torrent.name || ''),
        infoHash: String(torrent.infoHash || ''),
        totalSize: Number(torrent.length || 0),
        files: buildFileList(torrent),
        trackers: buildTrackerList(torrent),
        magnetUri: String(torrent.magnetURI || input)
      };

      pendingById.set(resolveId, {
        torrent: torrent,
        torrentBuf: torrent.torrentFile || null,
        info: info
      });

      wtLog('metadata resolved: ' + info.name + ' (' + info.files.length + ' files)');
      resolve({
        ok: true, resolveId: resolveId,
        name: info.name, infoHash: info.infoHash,
        totalSize: info.totalSize, files: info.files
      });
    }

    if (torrent.files && torrent.files.length > 0) {
      finish();
    } else {
      torrent.on('ready', finish);
      pollTimer = setInterval(function () {
        if (resolved) return;
        try {
          if (torrent.files && torrent.files.length > 0) finish();
        } catch {}
      }, 500);
    }

    torrent.on('error', function (err) {
      if (resolved) return;
      resolved = true;
      if (pollTimer) { try { clearInterval(pollTimer); } catch {} pollTimer = null; }
      if (timeoutTimer) { try { clearTimeout(timeoutTimer); } catch {} timeoutTimer = null; }
      try { torrent.destroy({ destroyStore: true }); } catch {}
      resolve({ ok: false, error: String(err && err.message || err) });
    });

    // Timeout after 180s
    timeoutTimer = setTimeout(function () {
      if (!resolved) {
        resolved = true;
        if (pollTimer) { try { clearInterval(pollTimer); } catch {} pollTimer = null; }
        timeoutTimer = null;
        try { torrent.destroy({ destroyStore: true }); } catch {}
        resolve({ ok: false, error: 'Metadata resolution timed out (180s)' });
      }
    }, 180000);
  });
}

async function startConfigured(ctx, _evt, payload) {
  var resolveId = payload && payload.resolveId ? String(payload.resolveId) : '';
  var origin = String(payload && payload.origin || '').trim().toLowerCase();
  var streamableOnly = !!(payload && payload.streamableOnly);
  var pending = pendingById.get(resolveId);
  if (!pending) return { ok: false, error: 'No pending resolve with that ID' };

  var savePath = streamableOnly
    ? ''
    : (String(payload && payload.savePath || '').trim() || require('electron').app.getPath('downloads'));
  var selectedFiles = payload && Array.isArray(payload.selectedFiles) ? payload.selectedFiles : null;

  // Save info before destroying the temp torrent
  var torrentBuf = pending.torrentBuf;
  var magnetUri = pending.info.magnetUri;
  var infoName = pending.info.name;
  var infoHash = pending.info.infoHash;
  var totalSize = pending.info.totalSize;

  // Destroy the metadata-only torrent
  try { pending.torrent.destroy({ destroyStore: true }); } catch {}
  pendingById.delete(resolveId);

  // Create entry and re-add in the requested mode.
  var entry = createEntry({
    destinationRoot: streamableOnly ? '' : savePath,
    savePath: streamableOnly ? '' : savePath,
    directWrite: streamableOnly ? false : true,
    origin: origin,
    magnetUri: magnetUri,
    name: infoName,
    infoHash: infoHash,
    totalSize: totalSize
  });

  var cl = await ensureClient();
  var source = torrentBuf || magnetUri;
  var torrent;
  var addPath = streamableOnly ? buildTorrentTmpPath(ctx, entry.id) : path.join(savePath, infoName || entry.id);

  try {
    torrent = cl.add(source, { path: addPath });
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }

  bindTorrent(ctx, torrent, entry);

  // If specific files were selected, apply selection after binding.
  if (!streamableOnly && selectedFiles && selectedFiles.length > 0) {
    // Wait for metadata to be ready before selecting files
    var waitForReady = torrent.files && torrent.files.length > 0
      ? Promise.resolve()
      : new Promise(function (resolve) { torrent.once('ready', resolve); });
    waitForReady.then(function () {
      selectFiles(ctx, _evt, { id: entry.id, selectedIndices: selectedFiles, destinationRoot: savePath });
    });
  }

  wtLog('startConfigured: ' + infoName + ' -> ' + (streamableOnly ? '(streamable-only)' : savePath));
  return { ok: true, id: entry.id };
}

async function cancelResolve(ctx, _evt, payload) {
  var resolveId = payload && payload.resolveId ? String(payload.resolveId) : '';
  var pending = pendingById.get(resolveId);
  if (!pending) return { ok: true };
  try { pending.torrent.destroy({ destroyStore: true }); } catch {}
  pendingById.delete(resolveId);
  wtLog('resolve cancelled: ' + resolveId);
  return { ok: true };
}

function openFolder(ctx, _evt, payload) {
  var savePath = String(payload && payload.savePath || payload || '').trim();
  if (savePath) shell.showItemInFolder(savePath);
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
  selectFiles,
  setDestination,
  streamFile,
  addToVideoLibrary,
  // FEAT-BROWSER: New capabilities
  remove,
  pauseAll,
  resumeAll,
  getPeers,
  getDhtNodes,
  selectSaveFolder,
  resolveMetadata,
  startConfigured,
  cancelResolve,
  openFolder,
};

