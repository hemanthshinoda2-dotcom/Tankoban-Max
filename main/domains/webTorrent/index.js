// WebTorrent domain: magnet/.torrent downloads saved under a user-selected destination root.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { session } = require('electron');

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
var historyCache = null;

function getIpc() {
  try { return require('../../../shared/ipc'); } catch { return null; }
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
  wtLog('ensureClient: calling new WebTorrent({ utp: false })...');
  client = new WebTorrentCtor({ utp: false });
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
    destinationRoot: '',
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
  entry.state = entry.destinationRoot ? 'downloading' : 'resolving_metadata';
  upsertHistory(ctx, entry);

  var rec = { torrent: torrent, entry: entry, interval: null, streams: {} };
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

// FEAT-TOR: Check if Tor proxy is active (cart mode — queue without downloading)
function isTorActive() {
  try {
    var torProxy = require('../torProxy');
    return torProxy.isActive();
  } catch { return false; }
}

async function startMagnet(ctx, evt, payload) {
  var magnetUri = String(payload && payload.magnetUri || '').trim();
  if (!magnetUri || magnetUri.indexOf('magnet:') !== 0) return { ok: false, error: 'Invalid magnet URI' };
  var root = resolveDestinationRoot(payload, false);
  if (!root.ok) return { ok: false, error: root.error };
  // FEAT-TOR: Force empty destination when Tor is on → queues in metadata_ready state
  var destRoot = isTorActive() ? '' : root.absRoot;
  var entry = createEntry({
    magnetUri: magnetUri,
    sourceUrl: String(payload && payload.referer || ''),
    destinationRoot: destRoot
  });
  return addTorrentInput(ctx, entry, magnetUri);
}

async function startTorrentUrl(ctx, evt, payload) {
  var url = String(payload && payload.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'Invalid torrent URL' };
  var root = resolveDestinationRoot(payload, false);
  if (!root.ok) return { ok: false, error: root.error };
  var fetched = null;
  try {
    fetched = await fetchTorrentBuffer(url, payload && payload.referer);
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err || 'Failed to fetch torrent URL') };
  }
  if (!fetched || !fetched.ok) return { ok: false, error: String((fetched && fetched.error) || 'Failed to fetch torrent URL') };

  // FEAT-TOR: Force empty destination when Tor is on
  var destRoot = isTorActive() ? '' : root.absRoot;
  var entry = createEntry({ sourceUrl: url, destinationRoot: destRoot });
  return addTorrentInput(ctx, entry, fetched.buffer);
}

async function startTorrentBuffer(ctx, evt, payload) {
  var root = resolveDestinationRoot(payload, false);
  if (!root.ok) return { ok: false, error: root.error };
  var input = payload && payload.buffer;
  if (!Buffer.isBuffer(input) || !input.length) return { ok: false, error: 'Invalid torrent file' };
  // FEAT-TOR: Force empty destination when Tor is on
  var destRoot = isTorActive() ? '' : root.absRoot;
  var entry = createEntry({
    sourceUrl: String(payload && (payload.sourceUrl || payload.referer) || ''),
    destinationRoot: destRoot
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

async function selectFiles(ctx, _evt, payload) {
  var id = payload && payload.id ? String(payload.id) : '';
  var rec = activeById.get(id);
  if (!rec || !rec.torrent) return { ok: false, error: 'Torrent not active' };
  var torrent = rec.torrent;
  var entry = rec.entry;

  var selectedIndices = payload && Array.isArray(payload.selectedIndices) ? payload.selectedIndices : [];
  var selectedSet = new Set(selectedIndices.map(Number));

  // FEAT-TOR: keep torrent downloads in cart mode while Tor is active.
  // WebTorrent traffic itself is not routed through Tor, so we block transition
  // into active downloading/streaming until Tor is disconnected.
  if (isTorActive() && selectedSet.size > 0) {
    return { ok: false, error: 'Disable Tor to start torrent downloads' };
  }

  // Optionally set destination root at the same time
  var dest = String(payload && payload.destinationRoot || '').trim();
  if (dest) {
    var absRoot = '';
    try { absRoot = path.resolve(dest); } catch {}
    if (absRoot) {
      try { fs.mkdirSync(absRoot, { recursive: true }); } catch {}
      entry.destinationRoot = absRoot;
    }
  }

  if (!torrent.files || !torrent.files.length) return { ok: false, error: 'No files in torrent' };

  var sequential = !!(payload && payload.sequential);
  entry.sequential = sequential;

  // Build priority-ordered list of selected file indices
  var selectedFiles = [];
  for (var i = 0; i < torrent.files.length; i++) {
    if (selectedSet.has(i)) {
      selectedFiles.push(i);
      if (entry.files && entry.files[i]) entry.files[i].selected = true;
    } else {
      try { torrent.files[i].deselect(); } catch {}
      if (entry.files && entry.files[i]) entry.files[i].selected = false;
    }
  }

  // Select files — if sequential, assign descending priority so first file downloads first
  for (var si = 0; si < selectedFiles.length; si++) {
    var fileIdx = selectedFiles[si];
    try {
      if (sequential) {
        torrent.files[fileIdx].select(selectedFiles.length - si);
      } else {
        torrent.files[fileIdx].select();
      }
    } catch {}
  }

  // If we were in metadata_ready state and now have a destination + files, start downloading
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
  var id = payload && payload.id ? String(payload.id) : '';
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

async function streamFile(ctx, _evt, payload) {
  if (isTorActive()) {
    return { ok: false, error: 'Disable Tor to stream torrent files' };
  }

  var id = payload && payload.id ? String(payload.id) : '';
  var rec = activeById.get(id);
  if (!rec || !rec.torrent) return { ok: false, error: 'Torrent not active' };
  var torrent = rec.torrent;

  var fileIndex = Number(payload && payload.fileIndex);
  if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= torrent.files.length) {
    return { ok: false, error: 'Invalid file index' };
  }

  var destPath = String(payload && payload.destinationPath || '').trim();
  if (!destPath) return { ok: false, error: 'Destination path required' };

  var absPath = '';
  try { absPath = path.resolve(destPath); } catch {}
  if (!absPath) return { ok: false, error: 'Invalid destination path' };

  // Ensure the file is selected for download
  try { torrent.files[fileIndex].select(); } catch {}
  if (rec.entry.files && rec.entry.files[fileIndex]) rec.entry.files[fileIndex].selected = true;

  try { ensureDir(path.dirname(absPath)); } catch {}

  var file = torrent.files[fileIndex];
  var ipc = getIpc();
  var streamKey = id + ':' + fileIndex;

  // Avoid duplicate streams for the same file
  if (rec.streams && rec.streams[streamKey]) {
    return { ok: true, path: absPath, alreadyStreaming: true };
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
        if (ipc) emit(ctx, ipc.EVENT.WEB_TORRENT_STREAM_READY, {
          id: id, fileIndex: fileIndex, path: absPath, bytesWritten: written
        });
      }
    });

    rs.on('error', function (err) {
      try { ws.end(); } catch {}
      delete rec.streams[streamKey];
    });

    ws.on('error', function (err) {
      try { rs.destroy(); } catch {}
      delete rec.streams[streamKey];
    });

    ws.on('finish', function () {
      delete rec.streams[streamKey];
      // If stream wasn't ready yet (small file), fire ready now
      if (!readyFired && ipc) {
        emit(ctx, ipc.EVENT.WEB_TORRENT_STREAM_READY, {
          id: id, fileIndex: fileIndex, path: absPath, bytesWritten: written
        });
      }
    });

    rs.pipe(ws);
    rec.streams[streamKey] = { rs: rs, ws: ws };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }

  return { ok: true, path: absPath };
}

// ── Video library integration ──

var VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.webm', '.mov', '.wmv', '.flv', '.m4v', '.ts', '.m2ts'];

function isVideoFile(fileName) {
  var ext = path.extname(String(fileName || '')).toLowerCase();
  return VIDEO_EXTS.indexOf(ext) !== -1;
}

async function addToVideoLibrary(ctx, evt, payload) {
  if (isTorActive()) {
    return { ok: false, error: 'Disable Tor to stream torrents into Video Library' };
  }

  var id = payload && payload.id ? String(payload.id) : '';
  var rec = activeById.get(id);
  if (!rec || !rec.torrent || !rec.entry) return { ok: false, error: 'Torrent not active' };

  var entry = rec.entry;
  var torrent = rec.torrent;

  if (entry.state !== 'metadata_ready') {
    return { ok: false, error: 'Torrent must be in metadata_ready state (got ' + entry.state + ')' };
  }

  var dest = String(payload && payload.destinationRoot || '').trim();
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

  // Select video files with sequential mode via internal selectFiles call
  await selectFiles(ctx, evt, {
    id: id,
    selectedIndices: videoIndices,
    destinationRoot: absRoot,
    sequential: true
  });

  // Mark as video library torrent
  entry.videoLibrary = true;
  entry.showFolderPath = showPath;

  // Stream each video file to the show folder
  for (var si = 0; si < videoIndices.length; si++) {
    var fileIdx = videoIndices[si];
    var tFile = torrent.files[fileIdx];
    if (!tFile) continue;

    // Build destination path: showPath + relative path within torrent
    var relPath = String(tFile.path || tFile.name || '').trim();
    // Strip leading torrent name prefix if present (WebTorrent includes it in file.path)
    if (relPath.indexOf(torrentName + '/') === 0 || relPath.indexOf(torrentName + '\\') === 0) {
      relPath = relPath.substring(torrentName.length + 1);
    }
    var fileDest = path.join(showPath, relPath);

    await streamFile(ctx, evt, {
      id: id,
      fileIndex: fileIdx,
      destinationPath: fileDest
    });
  }

  // Register the show folder in the video library
  try {
    var videoDomain = require('../video');
    await videoDomain.addShowFolderPath(ctx, null, showPath);
  } catch (err) {
    wtLog('addToVideoLibrary: video domain error: ' + String(err && err.message || err));
  }

  upsertHistory(ctx, entry);
  emitUpdated(ctx);
  wtLog('addToVideoLibrary: success, showPath=' + showPath + ', videoFiles=' + videoIndices.length);
  return { ok: true, showPath: showPath };
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
};
