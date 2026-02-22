// BUILD_WEB: Web Sources domain — manages curated download source sites
// and routes downloaded files to the correct library folder.

const path = require('path');
const fs = require('fs');
const { session } = require('electron');

const CONFIG_FILE = 'web_sources.json';
const DOWNLOAD_HISTORY_FILE = 'web_download_history.json';

const DEFAULT_SOURCES = [
  { id: 'annasarchive', name: "Anna's Archive", url: 'https://annas-archive.org', color: '#e74c3c', builtIn: true },
  { id: 'oceanofpdf', name: 'OceanofPDF', url: 'https://oceanofpdf.com', color: '#3498db', builtIn: true },
  { id: 'getcomics', name: 'GetComics', url: 'https://getcomics.org', color: '#2ecc71', builtIn: true },
  { id: 'zlibrary', name: 'Z-Library', url: 'https://z-lib.is', color: '#f39c12', builtIn: true },
];

var sourcesCache = null;

// Persisted download history cache
var downloadsCache = null; // { downloads: [], updatedAt }
var activeDownloadItems = new Map(); // id -> DownloadItem
var activeSpeed = new Map(); // id -> { lastAt, lastBytes, bytesPerSec }
var activePersist = new Map(); // id -> lastWriteAt (ms)
var downloadsWriteQueue = Promise.resolve();
var TERMINAL_DOWNLOAD_STATES = {
  completed: true,
  cancelled: true,
  failed: true,
  interrupted: true,
};

function readDownloads(ctx) {
  var p = ctx.storage.dataPath(DOWNLOAD_HISTORY_FILE);
  var data = ctx.storage.readJSON(p, null);
  if (data && Array.isArray(data.downloads)) return data;
  return { downloads: [], updatedAt: 0 };
}

function writeDownloads(ctx, data) {
  var p = ctx.storage.dataPath(DOWNLOAD_HISTORY_FILE);
  return ctx.storage.writeJSON(p, data);
}

function ensureDownloadsCache(ctx) {
  if (!downloadsCache) downloadsCache = readDownloads(ctx);
  if (!Array.isArray(downloadsCache.downloads)) downloadsCache.downloads = [];
  return downloadsCache;
}

function capDownloads(cfg) {
  if (!cfg || !Array.isArray(cfg.downloads)) return;
  if (cfg.downloads.length > 1000) cfg.downloads.length = 1000;
}

function emitDownloadsUpdated(ctx) {
  try {
    var ipc = require('../../../shared/ipc');
    ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOADS_UPDATED, {
      downloads: (ensureDownloadsCache(ctx).downloads || []),
    });
  } catch {}
}

function isTerminalDownloadState(state) {
  return !!TERMINAL_DOWNLOAD_STATES[String(state || '')];
}

function withDownloadsWriteQueue(task) {
  var next = downloadsWriteQueue.then(function () {
    return Promise.resolve().then(task);
  });
  downloadsWriteQueue = next.catch(function () {});
  return next;
}

function updateDownloadEntry(record, patch) {
  if (!record || !patch) return;
  var incomingState = patch.state != null ? String(patch.state) : '';
  var currentTerminal = isTerminalDownloadState(record.state);
  var incomingTerminal = isTerminalDownloadState(incomingState);
  if (currentTerminal && !incomingTerminal) return;
  if (currentTerminal && incomingTerminal && String(record.state) === 'completed' && incomingState !== 'completed') return;

  var keys = Object.keys(patch);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key === 'state') continue;
    record[key] = patch[key];
  }

  if (patch.state != null) {
    if (incomingState === 'completed') record.state = 'completed';
    else if (!currentTerminal || incomingTerminal) record.state = incomingState;
  }
}

function mutateDownloads(ctx, mutator) {
  return withDownloadsWriteQueue(async function () {
    var cfg = ensureDownloadsCache(ctx);
    var shouldPersist = true;
    if (typeof mutator === 'function') shouldPersist = mutator(cfg) !== false;
    if (!shouldPersist) return cfg;
    cfg.updatedAt = Date.now();
    capDownloads(cfg);
    await writeDownloads(ctx, cfg);
    emitDownloadsUpdated(ctx);
    return cfg;
  });
}

function readConfig(ctx) {
  var p = ctx.storage.dataPath(CONFIG_FILE);
  var data = ctx.storage.readJSON(p, null);
  if (data && Array.isArray(data.sources)) return data;
  return { sources: DEFAULT_SOURCES.slice(), updatedAt: 0 };
}

function writeConfig(ctx, data) {
  var p = ctx.storage.dataPath(CONFIG_FILE);
  ctx.storage.writeJSON(p, data);
}

function ensureCache(ctx) {
  if (!sourcesCache) sourcesCache = readConfig(ctx);
  return sourcesCache;
}

// ---- Handlers ----

async function get(ctx) {
  var cfg = ensureCache(ctx);
  return { ok: true, sources: cfg.sources || [] };
}

async function add(ctx, _evt, payload) {
  var name = String((payload && payload.name) || '').trim();
  var url = String((payload && payload.url) || '').trim();
  var color = String((payload && payload.color) || '#888888').trim();
  if (!name || !url) return { ok: false, error: 'Name and URL are required' };

  var cfg = ensureCache(ctx);
  var id = 'src_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  var source = { id: id, name: name, url: url, color: color, builtIn: false };
  cfg.sources.push(source);
  cfg.updatedAt = Date.now();
  writeConfig(ctx, cfg);
  try { ctx.win && ctx.win.webContents && ctx.win.webContents.send(require('../../../shared/ipc').EVENT.WEB_SOURCES_UPDATED, { sources: cfg.sources }); } catch {}
  return { ok: true, source: source };
}

async function remove(ctx, _evt, id) {
  var cfg = ensureCache(ctx);
  var before = cfg.sources.length;
  cfg.sources = cfg.sources.filter(function (s) { return s.id !== id; });
  if (cfg.sources.length === before) return { ok: false, error: 'Source not found' };
  cfg.updatedAt = Date.now();
  writeConfig(ctx, cfg);
  try { ctx.win && ctx.win.webContents && ctx.win.webContents.send(require('../../../shared/ipc').EVENT.WEB_SOURCES_UPDATED, { sources: cfg.sources }); } catch {}
  return { ok: true };
}

async function update(ctx, _evt, payload) {
  if (!payload || !payload.id) return { ok: false, error: 'Missing id' };
  var cfg = ensureCache(ctx);
  var found = null;
  for (var i = 0; i < cfg.sources.length; i++) {
    if (cfg.sources[i].id === payload.id) { found = cfg.sources[i]; break; }
  }
  if (!found) return { ok: false, error: 'Source not found' };
  if (payload.name != null) found.name = String(payload.name).trim();
  if (payload.url != null) found.url = String(payload.url).trim();
  if (payload.color != null) found.color = String(payload.color).trim();
  cfg.updatedAt = Date.now();
  writeConfig(ctx, cfg);
  try { ctx.win && ctx.win.webContents && ctx.win.webContents.send(require('../../../shared/ipc').EVENT.WEB_SOURCES_UPDATED, { sources: cfg.sources }); } catch {}
  return { ok: true };
}

// ---- Download routing ----

var BOOK_EXTS = ['.epub', '.txt', '.mobi', '.azw3'];
var COMIC_EXTS = ['.cbz', '.cbr', '.pdf'];
var VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.webm', '.ts', '.m2ts', '.wmv', '.flv', '.mpeg', '.mpg', '.3gp'];

var pickerPendingRequests = new Map(); // requestId -> { resolve, timer }
var PICKER_TIMEOUT_MS = 5 * 60 * 1000;

function getLibraryRoots(ctx) {
  var books = [];
  var comics = [];
  var videos = [];
  try {
    var booksConfig = ctx.storage.readJSON(ctx.storage.dataPath('books_library_state.json'), {});
    books = Array.isArray(booksConfig.bookRootFolders) ? booksConfig.bookRootFolders.filter(Boolean) : [];
  } catch {}
  try {
    var libConfig = ctx.storage.readJSON(ctx.storage.dataPath('library_state.json'), {});
    comics = Array.isArray(libConfig.rootFolders) ? libConfig.rootFolders.filter(Boolean) : [];
    videos = Array.isArray(libConfig.videoFolders) ? libConfig.videoFolders.filter(Boolean) : [];
  } catch {}
  return { books: books, comics: comics, videos: videos };
}

function pickFirst(arr) {
  return (Array.isArray(arr) && arr.length) ? String(arr[0] || '') : '';
}

function normalizePickerMode(mode) {
  var m = String(mode || '').trim().toLowerCase();
  if (m === 'books' || m === 'comics' || m === 'videos') return m;
  return '';
}

function getRootsByMode(ctx, mode) {
  var roots = getLibraryRoots(ctx);
  if (mode === 'books') return roots.books || [];
  if (mode === 'comics') return roots.comics || [];
  if (mode === 'videos') return roots.videos || [];
  return [];
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

function detectLibraryByDestination(ctx, destinationPath) {
  var roots = getLibraryRoots(ctx);
  var target = String(destinationPath || '');
  for (var i = 0; i < roots.books.length; i++) {
    if (isPathWithin(roots.books[i], target)) return 'books';
  }
  for (var j = 0; j < roots.comics.length; j++) {
    if (isPathWithin(roots.comics[j], target)) return 'comics';
  }
  for (var k = 0; k < roots.videos.length; k++) {
    if (isPathWithin(roots.videos[k], target)) return 'videos';
  }
  return '';
}

function detectModeHintByFilename(filename) {
  var ext = path.extname(String(filename || '')).toLowerCase();
  if (BOOK_EXTS.indexOf(ext) !== -1) return 'books';
  if (COMIC_EXTS.indexOf(ext) !== -1) return 'comics';
  if (VIDEO_EXTS.indexOf(ext) !== -1) return 'videos';
  return '';
}

function emitPickerRequest(ctx, payload) {
  try {
    var ipc = require('../../../shared/ipc');
    var wc = ctx && ctx.win && ctx.win.webContents ? ctx.win.webContents : null;
    if (!wc || wc.isDestroyed()) return false;
    wc.send(ipc.EVENT.WEB_DOWNLOAD_PICKER_REQUEST, payload || {});
    return true;
  } catch {
    return false;
  }
}

function clearPendingPickerRequest(requestId) {
  var rec = pickerPendingRequests.get(requestId);
  if (!rec) return;
  try { if (rec.timer) clearTimeout(rec.timer); } catch {}
  pickerPendingRequests.delete(requestId);
}

async function requestDestinationFolder(ctx, payload, senderWebContents) {
  var req = (payload && typeof payload === 'object') ? payload : {};
  var modeHint = normalizePickerMode(req.modeHint) || detectModeHintByFilename(req.suggestedFilename || '');
  var roots = getLibraryRoots(ctx);
  var requestId = 'wdpick_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

  var sent = emitPickerRequest(ctx, {
    requestId: requestId,
    kind: String(req.kind || 'direct'),
    suggestedFilename: String(req.suggestedFilename || ''),
    modeHint: modeHint,
    roots: {
      books: roots.books || [],
      comics: roots.comics || [],
      videos: roots.videos || [],
    },
    senderWebContentsId: senderWebContents && senderWebContents.id ? Number(senderWebContents.id) : null,
  });
  if (!sent) return { ok: false, error: 'Destination picker unavailable' };

  var raw = await new Promise(function (resolve) {
    var timer = setTimeout(function () {
      clearPendingPickerRequest(requestId);
      resolve({ ok: false, cancelled: true, error: 'Destination picker timed out' });
    }, PICKER_TIMEOUT_MS);
    pickerPendingRequests.set(requestId, { resolve: resolve, timer: timer });
  });

  if (!raw || raw.cancelled || raw.ok === false) {
    return {
      ok: false,
      cancelled: !!(raw && raw.cancelled),
      error: String((raw && raw.error) || 'Cancelled'),
    };
  }

  var selectedMode = normalizePickerMode(raw.mode) || modeHint;
  var folderPath = '';
  try { folderPath = path.resolve(String(raw.folderPath || '')); } catch {}
  if (!folderPath) return { ok: false, error: 'Invalid destination folder' };

  var allowedRoots = getRootsByMode(ctx, selectedMode);
  var allowed = false;
  for (var i = 0; i < allowedRoots.length; i++) {
    if (isPathWithin(allowedRoots[i], folderPath)) { allowed = true; break; }
  }
  if (!allowed) return { ok: false, error: 'Destination outside allowed library folders' };

  try { fs.mkdirSync(folderPath, { recursive: true }); } catch {}
  return {
    ok: true,
    folderPath: folderPath,
    mode: selectedMode,
    library: detectLibraryByDestination(ctx, folderPath),
  };
}

function listDirectoriesAt(absPath) {
  var entries = [];
  try { entries = fs.readdirSync(absPath, { withFileTypes: true }); } catch { entries = []; }
  var out = [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (!e || !e.isDirectory || !e.isDirectory()) continue;
    var name = String(e.name || '').trim();
    if (!name) continue;
    out.push({
      name: name,
      path: path.join(absPath, name),
    });
  }
  out.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }); });
  return out;
}

function ensureUniqueDestination(folderPath, filename) {
  var safeName = sanitizeFilename(filename || 'download');
  var ext = path.extname(safeName || '');
  var base = ext ? safeName.slice(0, -ext.length) : safeName;
  var destPath = path.join(folderPath, safeName);
  var counter = 1;
  while (fs.existsSync(destPath)) {
    destPath = path.join(folderPath, base + ' (' + counter + ')' + ext);
    counter += 1;
  }
  return destPath;
}

async function routeDownloadWithPicker(ctx, filename, opts) {
  var options = (opts && typeof opts === 'object') ? opts : {};
  var safeName = sanitizeFilename(filename || 'download');
  var picked = await requestDestinationFolder(ctx, {
    kind: 'direct',
    suggestedFilename: safeName,
    modeHint: options.modeHint || detectModeHintByFilename(safeName),
  }, options.webContents || null);
  if (!picked.ok) return picked;
  var destination = ensureUniqueDestination(picked.folderPath, safeName);
  return { ok: true, destination: destination, destFolder: picked.folderPath, library: picked.library, mode: picked.mode };
}

async function pickDestinationFolder(ctx, evt, payload) {
  var sender = evt && evt.sender ? evt.sender : null;
  return requestDestinationFolder(ctx, payload, sender);
}

async function listDestinationFolders(ctx, _evt, payload) {
  var req = (payload && typeof payload === 'object') ? payload : {};
  var mode = normalizePickerMode(req.mode);
  if (!mode) return { ok: false, error: 'Invalid mode' };

  var roots = getRootsByMode(ctx, mode).filter(Boolean);
  if (!roots.length) return { ok: true, mode: mode, folders: [] };

  var rawPath = String(req.path || '').trim();
  if (!rawPath) {
    var rootRows = [];
    for (var r = 0; r < roots.length; r++) {
      var absRoot = path.resolve(String(roots[r]));
      rootRows.push({ name: path.basename(absRoot) || absRoot, path: absRoot });
    }
    return { ok: true, mode: mode, folders: rootRows };
  }

  var abs = '';
  try { abs = path.resolve(rawPath); } catch {}
  if (!abs) return { ok: false, error: 'Invalid path' };

  var allowed = false;
  for (var i = 0; i < roots.length; i++) {
    if (isPathWithin(roots[i], abs)) { allowed = true; break; }
  }
  if (!allowed) return { ok: false, error: 'Path outside allowed roots' };
  if (!fs.existsSync(abs)) return { ok: false, error: 'Folder not found' };

  return { ok: true, mode: mode, folders: listDirectoriesAt(abs) };
}

async function resolveDestinationPicker(_ctx, _evt, payload) {
  var requestId = payload && payload.requestId ? String(payload.requestId) : '';
  if (!requestId) return { ok: false, error: 'Missing requestId' };
  var rec = pickerPendingRequests.get(requestId);
  if (!rec) return { ok: false, error: 'Unknown requestId' };
  clearPendingPickerRequest(requestId);
  try { rec.resolve(payload || {}); } catch {}
  return { ok: true };
}

async function routeDownload(ctx, evt, payload) {
  var filename = String((payload && payload.suggestedFilename) || '');
  if (!filename) return { ok: false, error: 'No filename' };
  return routeDownloadWithPicker(ctx, filename, { webContents: evt && evt.sender ? evt.sender : null });
}

async function getDestinations(ctx) {
  var roots = getLibraryRoots(ctx);
  return {
    ok: true,
    books: pickFirst(roots.books) || null,
    comics: pickFirst(roots.comics) || null,
    videos: pickFirst(roots.videos) || null,
    allBooks: roots.books,
    allComics: roots.comics,
    allVideos: roots.videos,
  };
}

// ---- Download history (persisted) ----

async function getDownloadHistory(ctx) {
  var cfg = ensureDownloadsCache(ctx);
  return { ok: true, downloads: cfg.downloads || [] };
}

async function clearDownloadHistory(ctx) {
  await mutateDownloads(ctx, function (cfg) {
    // Keep active downloads. Clearing should not hide in-progress work.
    cfg.downloads = (cfg.downloads || []).filter(function (d) { return d && (d.state === 'downloading' || d.state === 'paused'); });
  });
  return { ok: true };
}

async function removeDownloadHistory(ctx, _evt, payload) {
  var id = payload && payload.id ? String(payload.id) : '';
  if (!id) return { ok: false, error: 'Missing id' };
  var removed = false;
  await mutateDownloads(ctx, function (cfg) {
    var before = (cfg.downloads || []).length;
    cfg.downloads = (cfg.downloads || []).filter(function (d) {
      if (!d) return false;
      if (String(d.id) !== id) return true;
      // Do not allow removing active downloads.
      return d.state === 'downloading' || d.state === 'paused';
    });
    removed = (cfg.downloads || []).length !== before;
    return removed;
  });
  if (!removed) return { ok: false, error: 'Not found' };
  return { ok: true };
}

// ---- Download handler for webview partition ----

var downloadHandlerBound = false;

function setupDownloadHandler(ctx) {
  if (downloadHandlerBound) return;
  downloadHandlerBound = true;
  try {
    var ses = session.fromPartition('persist:webmode');
    var ipc = require('../../../shared/ipc');

    // Reconcile persisted history: any lingering "downloading" entries become interrupted.
    mutateDownloads(ctx, function (cfgBoot) {
      var changed = false;
      for (var i = 0; i < (cfgBoot.downloads || []).length; i++) {
        var d = cfgBoot.downloads[i];
        if (d && (d.state === 'downloading' || d.state === 'paused')) {
          updateDownloadEntry(d, {
            state: 'interrupted',
            error: d.error || 'Interrupted (app closed)',
            finishedAt: d.finishedAt || Date.now(),
          });
          changed = true;
        }
      }
      return changed;
    }).catch(function () {});

    ses.on('will-download', function (_event, item, _webContents) {
      var filename = item.getFilename();
      var ext = path.extname(filename).toLowerCase();

      var pageUrl = '';
      var downloadUrl = '';
      try { pageUrl = (_webContents && _webContents.getURL) ? String(_webContents.getURL() || '') : ''; } catch {}
      try { downloadUrl = item.getURL ? String(item.getURL() || '') : ''; } catch {}

      function newDlId() {
        return 'wdl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      }

      function persistRouteFailure(route) {
        pushFailedDownload(ctx, {
          id: newDlId(),
          filename: filename,
          destination: '',
          library: '',
          state: route.cancelled ? 'cancelled' : 'failed',
          error: route.cancelled ? 'Cancelled' : route.error,
          pageUrl: pageUrl,
          downloadUrl: downloadUrl,
        }).catch(function () {});
      }

      if (ext === '.torrent') {
        item.cancel();
        requestDestinationFolder(ctx, { kind: 'torrent', suggestedFilename: filename, modeHint: 'videos' }, _webContents).then(function (picked) {
          if (!picked || !picked.ok) return;
          try {
            var webTorrentDomain = require('../webTorrent');
            webTorrentDomain.startTorrentUrl(ctx, null, {
              url: downloadUrl,
              referer: pageUrl,
              destinationRoot: picked.folderPath,
            }).catch(function () {});
          } catch {}
        }).catch(function () {});
        return;
      }

      try { if (item.pause) item.pause(); } catch {}
      routeDownloadWithPicker(ctx, filename, { webContents: _webContents }).then(function (route) {
        if (!route.ok) {
          item.cancel();
          persistRouteFailure(route);
          try {
            ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_COMPLETED, {
              id: null,
              filename: filename,
              error: route.cancelled ? 'Cancelled' : route.error,
            });
          } catch {}
          return;
        }

        item.setSavePath(route.destination);

        var dlId = newDlId();
        var startedAt = Date.now();
        var totalBytes = 0;
        try { totalBytes = item.getTotalBytes ? Number(item.getTotalBytes() || 0) : 0; } catch {}

        // Persist a new history entry immediately.
        persistDownloadUpdate(ctx, dlId, function (d) {
          updateDownloadEntry(d, {
            state: 'downloading',
            filename: filename,
            destination: route.destination,
            library: route.library,
            startedAt: startedAt,
            finishedAt: null,
            error: '',
            pageUrl: pageUrl,
            downloadUrl: downloadUrl,
            totalBytes: totalBytes,
            receivedBytes: 0,
          });
        }, function () {
          return {
            id: dlId,
            filename: filename,
            destination: route.destination,
            library: route.library,
            state: 'downloading',
            startedAt: startedAt,
            finishedAt: null,
            error: '',
            pageUrl: pageUrl,
            downloadUrl: downloadUrl,
            totalBytes: totalBytes,
            receivedBytes: 0,
            transport: 'electron-item',
            canPause: true,
            canResume: true,
            canCancel: true,
          });
          cfgStart.updatedAt = Date.now();
          capDownloads(cfgStart);
          writeDownloads(ctx, cfgStart);
          emitDownloadsUpdated(ctx);
        } catch {}

        activeDownloadItems.set(dlId, {
          transport: 'electron-item',
          canPause: true,
          canResume: true,
          canCancel: true,
          item: item,
          pause: function () { if (item.pause) item.pause(); },
          resume: function () { if (item.resume) item.resume(); },
          cancel: function () { if (item.cancel) item.cancel(); },
          isPaused: function () { return !!(item.isPaused && item.isPaused()); },
        });
        activeSpeed.set(dlId, { lastAt: Date.now(), lastBytes: 0, bytesPerSec: 0 });

        // BUILD_WEB_PARITY
        try {
          ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_STARTED, {
            id: dlId,
            filename: filename,
            destination: route.destination,
            library: route.library,
            state: 'downloading',
            pageUrl: pageUrl,
            downloadUrl: downloadUrl,
            totalBytes: totalBytes,
            transport: 'electron-item',
            canPause: true,
            canResume: true,
            canCancel: true,
          });
        } catch {}

        item.on('updated', function (_e, stateStr) {
          try {
            var electronState = '';
            try { electronState = item.getState ? String(item.getState() || '') : String(stateStr || ''); } catch { electronState = String(stateStr || ''); }
            var paused = false;
            try { paused = !!(item.isPaused && item.isPaused()); } catch {}

            var received = 0;
            var total = 0;
            try { received = item.getReceivedBytes ? Number(item.getReceivedBytes() || 0) : 0; } catch {}
            try { total = item.getTotalBytes ? Number(item.getTotalBytes() || 0) : 0; } catch {}

            var pct = null;
            if (total > 0) pct = Math.max(0, Math.min(1, received / total));

            var appState = 'downloading';
            if (electronState === 'progressing') appState = paused ? 'paused' : 'downloading';
            else if (electronState === 'interrupted') appState = 'interrupted';
            else if (electronState === 'cancelled') appState = 'cancelled';

            var sp = activeSpeed.get(dlId);
            if (sp) {
              var now = Date.now();
              var dt = Math.max(1, now - sp.lastAt);
              if (dt >= 500) {
                var db = Math.max(0, received - sp.lastBytes);
                sp.bytesPerSec = paused ? 0 : Math.round((db * 1000) / dt);
                sp.lastAt = now;
                sp.lastBytes = received;
                activeSpeed.set(dlId, sp);
              }
            }

            // Throttled persist so history survives renderer reload mid-download
            try {
              var lastW = activePersist.get(dlId) || 0;
              var nowW = Date.now();
              if (nowW - lastW >= 1000) {
                activePersist.set(dlId, nowW);
                var cfgUp = ensureDownloadsCache(ctx);
                var found = null;
                for (var i = 0; i < (cfgUp.downloads || []).length; i++) {
                  var dd = cfgUp.downloads[i];
                  if (dd && String(dd.id) === String(dlId)) { found = dd; break; }
                }
                if (found) {
                  found.state = appState;
                  found.receivedBytes = received;
                  found.totalBytes = total;
                  found.progress = pct;
                  found.bytesPerSec = (sp && sp.bytesPerSec) ? sp.bytesPerSec : 0;
                  found.updatedAt = nowW;
                  found.transport = 'electron-item';
                  found.canPause = true;
                  found.canResume = true;
                  found.canCancel = true;
                  capDownloads(cfgUp);
                  writeDownloads(ctx, cfgUp);
                }
              }
            } catch {}

            ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_PROGRESS, {
              id: dlId,
              filename: filename,
              destination: route.destination,
              library: route.library,
              state: appState,
              receivedBytes: received,
              totalBytes: total,
              progress: pct,
              bytesPerSec: (sp && sp.bytesPerSec) ? sp.bytesPerSec : 0,
            });
          } catch {}
        });

        item.on('done', function (_e, doneState) {
          activeDownloadItems.delete(dlId);
          activeSpeed.delete(dlId);
          activePersist.delete(dlId);

          // Update persisted history entry.
          persistDownloadUpdate(ctx, dlId, function (found) {
            updateDownloadEntry(found, {
              state: (doneState === 'completed') ? 'completed' : (doneState === 'cancelled' ? 'cancelled' : (doneState === 'interrupted' ? 'interrupted' : 'failed')),
              finishedAt: Date.now(),
              error: (doneState === 'cancelled') ? '' : ((doneState !== 'completed' && doneState !== 'cancelled') ? (found.error || ('Download ' + doneState)) : found.error),
            });
          }).catch(function () {});

          if (doneState === 'completed') {
            if (route.library) triggerLibraryRescan(ctx, route.library);

            try {
              ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_COMPLETED, {
                ok: true,
                id: dlId,
                filename: filename,
                destination: route.destination,
                library: route.library,
              });
            } catch {}
          } else {
            try {
              ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_COMPLETED, {
                id: dlId,
                filename: filename,
                error: (doneState === 'cancelled') ? 'Cancelled' : ('Download ' + doneState),
              });
            } catch {}
          }
        });

        try { if (item.resume) item.resume(); } catch {}
      }).catch(function (err) {
        item.cancel();
        var msg = String((err && err.message) || err || 'Failed to pick destination');
        persistRouteFailure({ cancelled: false, error: msg });
        try {
          ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_COMPLETED, {
            id: null,
            filename: filename,
            error: msg,
          });
        } catch {}
      });
    });
    // BUILD_WCV: popup handling moved to webTabs domain (per-view setWindowOpenHandler)
  } catch (err) {
    console.error('[BUILD_WEB] Failed to set up download handler:', err);
  }
}


function newDlId() {
  return 'wdl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function sanitizeFilename(filename) {
  var s = String(filename || '').trim();
  s = s.replace(/[\\/:*?"<>|]+/g, '_');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) s = 'download';
  if (s.length > 180) s = s.slice(0, 180).trim();
  return s;
}

function extFromMime(type) {
  var t = String(type || '').toLowerCase();
  if (!t) return '';
  if (t.indexOf(';') !== -1) t = t.split(';')[0].trim();
  if (t === 'application/epub+zip') return '.epub';
  if (t === 'application/pdf') return '.pdf';
  if (t === 'application/x-cbr' || t === 'application/vnd.comicbook-rar') return '.cbr';
  if (t === 'application/vnd.comicbook+zip' || t === 'application/x-cbz' || t === 'application/zip') return '.cbz';
  if (t === 'text/plain') return '.txt';
  if (t === 'application/x-mobipocket-ebook') return '.mobi';
  return '';
}

function filenameFromContentDisposition(v) {
  var s = String(v || '');
  if (!s) return '';
  var m = s.match(/filename\*=UTF-8''([^;]+)/i);
  if (m && m[1]) {
    try { return sanitizeFilename(decodeURIComponent(m[1])); } catch {}
    return sanitizeFilename(m[1]);
  }
  m = s.match(/filename="([^"]+)"/i);
  if (m && m[1]) return sanitizeFilename(m[1]);
  m = s.match(/filename=([^;]+)/i);
  if (m && m[1]) return sanitizeFilename(m[1].trim());
  return '';
}

function filenameFromUrl(u) {
  try {
    var x = new URL(String(u || ''));
    var base = path.basename(decodeURIComponent(x.pathname || ''));
    return sanitizeFilename(base || '');
  } catch {
    return '';
  }
}

function buildSuggestedFilename(payload, res) {
  var explicit = sanitizeFilename((payload && payload.suggestedFilename) || '');
  var byHeader = filenameFromContentDisposition(res && res.headers && res.headers.get && res.headers.get('content-disposition'));
  var byUrl = filenameFromUrl(res && res.url);
  var byReqUrl = filenameFromUrl(payload && payload.url);
  var base = explicit || byHeader || byUrl || byReqUrl || sanitizeFilename((payload && payload.title) || '') || 'download';
  var ext = path.extname(base || '').toLowerCase();
  if (!ext) {
    var inferred = extFromMime(res && res.headers && res.headers.get && res.headers.get('content-type'));
    if (inferred) base += inferred;
  }
  return sanitizeFilename(base);
}

async function persistDownloadUpdate(ctx, dlId, mutator, createEntry) {
  try {
    await mutateDownloads(ctx, function (cfg) {
      var found = null;
      for (var i = 0; i < (cfg.downloads || []).length; i++) {
        var d = cfg.downloads[i];
        if (d && String(d.id) === String(dlId)) { found = d; break; }
      }
      if (!found && typeof createEntry === 'function') {
        found = createEntry(cfg) || null;
        if (found) cfg.downloads.unshift(found);
      }
      if (found && typeof mutator === 'function') mutator(found, cfg);
    });
  } catch {}
}

async function pushFailedDownload(ctx, info) {
  try {
    var cfg = ensureDownloadsCache(ctx);
    cfg.downloads.unshift({
      id: info.id || newDlId(),
      filename: String(info.filename || 'download'),
      destination: String(info.destination || ''),
      library: String(info.library || ''),
      state: String(info.state || 'failed'),
      startedAt: Date.now(),
      finishedAt: Date.now(),
      error: String(info.error || (String(info.state || 'failed') === 'cancelled' ? 'Cancelled' : 'Download failed')),
      pageUrl: String(info.pageUrl || ''),
      downloadUrl: String(info.downloadUrl || ''),
      totalBytes: 0,
      receivedBytes: 0,
      transport: String(info.transport || 'direct'),
      canPause: !!info.canPause,
      canResume: !!info.canResume,
      canCancel: (info.canCancel == null) ? true : !!info.canCancel,
    });
  } catch {}
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

async function runDirectDownload(ctx, dlId, payload, evt) {
  var ipc = require('../../../shared/ipc');
  var url = String((payload && payload.url) || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    await pushFailedDownload(ctx, { id: dlId, filename: String((payload && payload.suggestedFilename) || 'download'), error: 'Invalid URL', downloadUrl: url });
    try {
      ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_COMPLETED, { id: dlId, filename: String((payload && payload.suggestedFilename) || 'download'), error: 'Invalid URL' });
    } catch {}
    return;
  }

  var ac = null;
  try { ac = new AbortController(); } catch {}
  if (ac) {
    activeDownloadItems.set(dlId, {
      transport: 'direct',
      canPause: false,
      canResume: false,
      canCancel: true,
      cancel: function () { try { ac.abort(); } catch {} },
    });
  }

  var res;
  try {
    var headers = { 'user-agent': 'Tankoban-Max/OPDS (+Electron)' };
    if (payload && payload.referer) headers.referer = String(payload.referer);
    res = await fetch(url, { redirect: 'follow', headers: headers, signal: ac ? ac.signal : undefined });
  } catch (err) {
    activeDownloadItems.delete(dlId);
    await pushFailedDownload(ctx, { id: dlId, filename: String((payload && payload.suggestedFilename) || 'download'), error: String((err && err.message) || err || 'Network error'), downloadUrl: url });
    try {
      ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_COMPLETED, { id: dlId, filename: String((payload && payload.suggestedFilename) || 'download'), error: String((err && err.message) || err || 'Network error') });
    } catch {}
    return;
  }

  var filename = buildSuggestedFilename(payload, res);
  var route = await routeDownloadWithPicker(ctx, filename, {
    webContents: (evt && evt.sender) ? evt.sender : (ctx.win && ctx.win.webContents ? ctx.win.webContents : null),
  });
  if (!route.ok) {
    activeDownloadItems.delete(dlId);
    await pushFailedDownload(ctx, {
      id: dlId,
      filename: filename,
      state: route.cancelled ? 'cancelled' : 'failed',
      error: route.cancelled ? 'Cancelled' : route.error,
      downloadUrl: String(res.url || url)
    });
    try {
      ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_COMPLETED, {
        id: dlId,
        filename: filename,
        error: route.cancelled ? 'Cancelled' : route.error
      });
    } catch {}
    return;
  }

  if (!res.ok) {
    activeDownloadItems.delete(dlId);
    var httpErr = 'HTTP ' + Number(res.status || 0) + (res.statusText ? (' ' + String(res.statusText)) : '');
    await pushFailedDownload(ctx, { id: dlId, filename: filename, destination: route.destination, library: route.library, error: httpErr, downloadUrl: String(res.url || url) });
    try {
      ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_COMPLETED, { id: dlId, filename: filename, error: httpErr });
    } catch {}
    return;
  }

  var totalBytes = 0;
  try { totalBytes = Number((res.headers && res.headers.get && res.headers.get('content-length')) || 0) || 0; } catch {}
  var startedAt = Date.now();

  await persistDownloadUpdate(ctx, dlId, function (d) {
    updateDownloadEntry(d, {
      state: 'downloading',
      filename: filename,
      destination: route.destination,
      library: route.library,
      startedAt: startedAt,
      finishedAt: null,
      error: '',
      pageUrl: String((payload && payload.referer) || ''),
      downloadUrl: String(res.url || url),
      totalBytes: totalBytes,
      receivedBytes: 0,
      progress: null,
    });
  }, function () {
    return {
      id: dlId,
      filename: filename,
      destination: route.destination,
      library: route.library,
      state: 'downloading',
      startedAt: startedAt,
      finishedAt: null,
      error: '',
      pageUrl: String((payload && payload.referer) || ''),
      downloadUrl: String(res.url || url),
      totalBytes: totalBytes,
      receivedBytes: 0,
      progress: null,
      transport: 'direct',
      canPause: false,
      canResume: false,
      canCancel: true,
    });
    cfgStart.updatedAt = Date.now();
    capDownloads(cfgStart);
    await writeDownloads(ctx, cfgStart);
    emitDownloadsUpdated(ctx);
  } catch {}

  activeSpeed.set(dlId, { lastAt: Date.now(), lastBytes: 0, bytesPerSec: 0 });

  try {
    ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_STARTED, {
      id: dlId,
      filename: filename,
      destination: route.destination,
      library: route.library,
      state: 'downloading',
      pageUrl: String((payload && payload.referer) || ''),
      downloadUrl: String(res.url || url),
      totalBytes: totalBytes,
      transport: 'direct',
      canPause: false,
      canResume: false,
      canCancel: true,
    });
  } catch {}

  var tmpPath = route.destination + '.part';
  var ws = fs.createWriteStream(tmpPath);
  var reader = null;
  var received = 0;
  var lastPersistAt = 0;
  var done = false;

  function emitProgressNow(force) {
    var now = Date.now();
    var sp = activeSpeed.get(dlId);
    if (sp) {
      var dt = Math.max(1, now - sp.lastAt);
      if (force || dt >= 500) {
        var db = Math.max(0, received - sp.lastBytes);
        sp.bytesPerSec = Math.round((db * 1000) / dt);
        sp.lastAt = now;
        sp.lastBytes = received;
        activeSpeed.set(dlId, sp);
      }
    }
    var pct = totalBytes > 0 ? Math.max(0, Math.min(1, received / totalBytes)) : null;
    try {
      ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_PROGRESS, {
        id: dlId,
        filename: filename,
        destination: route.destination,
        library: route.library,
        state: 'downloading',
        receivedBytes: received,
        totalBytes: totalBytes,
        progress: pct,
        bytesPerSec: (sp && sp.bytesPerSec) ? sp.bytesPerSec : 0,
      });
    } catch {}
    if (force || (now - lastPersistAt >= 1000)) {
      lastPersistAt = now;
      persistDownloadUpdate(ctx, dlId, function (d) {
        d.state = 'downloading';
        d.receivedBytes = received;
        d.totalBytes = totalBytes;
        d.progress = pct;
        d.bytesPerSec = (sp && sp.bytesPerSec) ? sp.bytesPerSec : 0;
        d.updatedAt = now;
        d.transport = 'direct';
        d.canPause = false;
        d.canResume = false;
        d.canCancel = true;
      });
    }
  }

  function finalizeError(errMsg, stateName) {
    if (done) return;
    done = true;
    try { ws.destroy(); } catch {}
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
    activeDownloadItems.delete(dlId);
    activeSpeed.delete(dlId);
    persistDownloadUpdate(ctx, dlId, function (d) {
      d.state = stateName || 'failed';
      d.error = String(errMsg || 'Download failed');
      d.finishedAt = Date.now();
      d.receivedBytes = received;
      d.totalBytes = totalBytes;
      d.progress = totalBytes > 0 ? Math.max(0, Math.min(1, received / totalBytes)) : null;
      d.updatedAt = Date.now();
      d.transport = 'direct';
      d.canPause = false;
      d.canResume = false;
      d.canCancel = true;
    });
    try {
      ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_COMPLETED, {
        id: dlId,
        filename: filename,
        error: String(errMsg || 'Download failed'),
      });
    } catch {}
  }

  function finalizeSuccess() {
    if (done) return;
    done = true;
    try { if (fs.existsSync(route.destination)) fs.unlinkSync(route.destination); } catch {}
    try { fs.renameSync(tmpPath, route.destination); }
    catch (err) { finalizeError(String((err && err.message) || err || 'Failed to finalize file'), 'failed'); return; }

    activeDownloadItems.delete(dlId);
    activeSpeed.delete(dlId);
    persistDownloadUpdate(ctx, dlId, function (d) {
      d.state = 'completed';
      d.error = '';
      d.finishedAt = Date.now();
      d.receivedBytes = received;
      d.totalBytes = totalBytes;
      d.progress = totalBytes > 0 ? 1 : d.progress;
      d.updatedAt = Date.now();
      d.transport = 'direct';
      d.canPause = false;
      d.canResume = false;
      d.canCancel = true;
    });
    triggerLibraryRescan(ctx, route.library);
    try {
      ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_COMPLETED, {
        ok: true,
        id: dlId,
        filename: filename,
        destination: route.destination,
        library: route.library,
      });
    } catch {}
  }

  ws.on('error', function (err) {
    finalizeError(String((err && err.message) || err || 'Write failed'), 'failed');
  });

  try {
    if (!res.body) {
      var ab = await res.arrayBuffer();
      var buf = Buffer.from(ab);
      received = buf.length;
      await new Promise(function (resolve, reject) {
        ws.write(buf, function (e) { if (e) reject(e); else resolve(); });
      });
      await new Promise(function (resolve, reject) { ws.end(function (e) { if (e) reject(e); else resolve(); }); });
      emitProgressNow(true);
      finalizeSuccess();
      return;
    }

    reader = res.body.getReader ? res.body.getReader() : null;
    if (!reader) {
      var ab2 = await res.arrayBuffer();
      var buf2 = Buffer.from(ab2);
      received = buf2.length;
      await new Promise(function (resolve, reject) {
        ws.write(buf2, function (e) { if (e) reject(e); else resolve(); });
      });
      await new Promise(function (resolve, reject) { ws.end(function (e) { if (e) reject(e); else resolve(); }); });
      emitProgressNow(true);
      finalizeSuccess();
      return;
    }

    while (true) {
      var step = await reader.read();
      if (!step || step.done) break;
      var chunk = Buffer.from(step.value);
      received += chunk.length;
      await new Promise(function (resolve, reject) {
        if (!ws.write(chunk)) ws.once('drain', resolve);
        else resolve();
      }).catch(function (err) { throw err; });
      emitProgressNow(false);
    }
    await new Promise(function (resolve, reject) { ws.end(function (e) { if (e) reject(e); else resolve(); }); });
    emitProgressNow(true);
    finalizeSuccess();
  } catch (err) {
    var msg = String((err && err.message) || err || 'Download failed');
    var stateName = /abort/i.test(msg) ? 'cancelled' : 'failed';
    finalizeError(msg, stateName);
  }
}

async function downloadFromUrl(ctx, evt, payload) {
  var dlId = newDlId();
  runDirectDownload(ctx, dlId, payload || {}, evt || null).catch(function () {});
  return { ok: true, id: dlId, queued: true };
}

async function pauseDownload(ctx, _evt, payload) {
  var id = payload && payload.id ? String(payload.id) : '';
  if (!id) return { ok: false, error: 'Missing id' };
  var item = activeDownloadItems.get(id);
  if (!item) return { ok: false, error: 'Download not active' };
  var canPause = !!(item && item.canPause);
  var pauseFn = item && (item.pause || (item.item && item.item.pause));
  var isPausedFn = item && (item.isPaused || (item.item && item.item.isPaused));
  if (!canPause || typeof pauseFn !== 'function') {
    return { ok: false, error: 'Pause not supported for direct downloads' };
  }
  try {
    if (isPausedFn && isPausedFn.call(item.item || item)) return { ok: true };
    pauseFn.call(item.item || item);
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
  persistDownloadUpdate(ctx, id, function (d) {
    updateDownloadEntry(d, { state: 'paused', updatedAt: Date.now() });
  }).catch(function () {});
  return { ok: true };
}

async function resumeDownload(ctx, _evt, payload) {
  var id = payload && payload.id ? String(payload.id) : '';
  if (!id) return { ok: false, error: 'Missing id' };
  var item = activeDownloadItems.get(id);
  if (!item) return { ok: false, error: 'Download not active' };
  var canResume = !!(item && item.canResume);
  var resumeFn = item && (item.resume || (item.item && item.item.resume));
  if (!canResume || typeof resumeFn !== 'function') {
    return { ok: false, error: 'Pause not supported for direct downloads' };
  }
  try { resumeFn.call(item.item || item); }
  catch (err) { return { ok: false, error: String(err?.message || err) }; }
  persistDownloadUpdate(ctx, id, function (d) {
    updateDownloadEntry(d, { state: 'downloading', updatedAt: Date.now() });
  }).catch(function () {});
  return { ok: true };
}

async function cancelDownload(ctx, _evt, payload) {
  var id = payload && payload.id ? String(payload.id) : '';
  if (!id) return { ok: false, error: 'Missing id' };
  var item = activeDownloadItems.get(id);
  if (!item) return { ok: false, error: 'Download not active' };
  var cancelFn = item && (item.cancel || (item.item && item.item.cancel));
  try { if (cancelFn) cancelFn.call(item.item || item); }
  catch (err) { return { ok: false, error: String(err?.message || err) }; }
  // Quick mark; done handler finalizes.
  persistDownloadUpdate(ctx, id, function (d) {
    updateDownloadEntry(d, {
      state: 'cancelled',
      finishedAt: Date.now(),
      error: '',
      updatedAt: Date.now(),
    });
  }).catch(function () {});
  return { ok: true };
}

module.exports = {
  get,
  add,
  remove,
  update,
  routeDownload,
  pickDestinationFolder,
  listDestinationFolders,
  resolveDestinationPicker,
  getDestinations,
  downloadFromUrl,
  getDownloadHistory,
  clearDownloadHistory,
  removeDownloadHistory,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  setupDownloadHandler,
};
