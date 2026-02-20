// BUILD_WEB: Web Sources domain — manages curated download source sites
// and routes downloaded files to the correct library folder.

const path = require('path');
const fs = require('fs');
const { app, session } = require('electron');

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

function readDownloads(ctx) {
  var p = ctx.storage.dataPath(DOWNLOAD_HISTORY_FILE);
  var data = ctx.storage.readJSON(p, null);
  if (data && Array.isArray(data.downloads)) return data;
  return { downloads: [], updatedAt: 0 };
}

function writeDownloads(ctx, data) {
  var p = ctx.storage.dataPath(DOWNLOAD_HISTORY_FILE);
  ctx.storage.writeJSON(p, data);
}

function ensureDownloadsCache(ctx) {
  if (!downloadsCache) downloadsCache = readDownloads(ctx);
  if (!Array.isArray(downloadsCache.downloads)) downloadsCache.downloads = [];
  return downloadsCache;
}

function capDownloads(cfg) {
  if (!cfg || !Array.isArray(cfg.downloads)) return;
  if (cfg.downloads.length > 200) cfg.downloads.length = 200;
}

function emitDownloadsUpdated(ctx) {
  try {
    var ipc = require('../../../shared/ipc');
    ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOADS_UPDATED, {
      downloads: (ensureDownloadsCache(ctx).downloads || []),
    });
  } catch {}
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

function routeDownloadSync(ctx, filename) {
  var ext = path.extname(String(filename || '')).toLowerCase();
  var library = null;
  var destFolder = null;

  if (BOOK_EXTS.indexOf(ext) !== -1) {
    library = 'books';
    try {
      var booksConfig = ctx.storage.readJSON(ctx.storage.dataPath('books_library_state.json'), {});
      destFolder = (Array.isArray(booksConfig.bookRootFolders) && booksConfig.bookRootFolders[0]) || null;
    } catch {}
  } else if (COMIC_EXTS.indexOf(ext) !== -1) {
    library = 'comics';
    try {
      var libConfig = ctx.storage.readJSON(ctx.storage.dataPath('library_state.json'), {});
      destFolder = (Array.isArray(libConfig.rootFolders) && libConfig.rootFolders[0]) || null;
    } catch {}
  }

  if (!library) return { ok: false, error: 'Unsupported file type: ' + ext };
  if (!destFolder) return { ok: false, error: 'No ' + library + ' root folder configured. Add one in ' + library + ' mode first.' };

  var destPath = path.join(destFolder, filename);
  var base = path.basename(filename, ext);
  var counter = 1;
  while (fs.existsSync(destPath)) {
    destPath = path.join(destFolder, base + ' (' + counter + ')' + ext);
    counter++;
  }

  return { ok: true, destination: destPath, destFolder: destFolder, library: library };
}

async function routeDownload(ctx, _evt, payload) {
  var filename = String((payload && payload.suggestedFilename) || '');
  if (!filename) return { ok: false, error: 'No filename' };
  return routeDownloadSync(ctx, filename);
}

async function getDestinations(ctx) {
  var books = null;
  var comics = null;
  try {
    var booksConfig = ctx.storage.readJSON(ctx.storage.dataPath('books_library_state.json'), {});
    books = (Array.isArray(booksConfig.bookRootFolders) && booksConfig.bookRootFolders[0]) || null;
  } catch {}
  try {
    var libConfig = ctx.storage.readJSON(ctx.storage.dataPath('library_state.json'), {});
    comics = (Array.isArray(libConfig.rootFolders) && libConfig.rootFolders[0]) || null;
  } catch {}
  return { ok: true, books: books, comics: comics };
}

// ---- Download history (persisted) ----

async function getDownloadHistory(ctx) {
  var cfg = ensureDownloadsCache(ctx);
  return { ok: true, downloads: cfg.downloads || [] };
}

async function clearDownloadHistory(ctx) {
  var cfg = ensureDownloadsCache(ctx);
  // Keep active downloads. Clearing should not hide in-progress work.
  cfg.downloads = (cfg.downloads || []).filter(function (d) { return d && d.state === 'downloading'; });
  cfg.updatedAt = Date.now();
  capDownloads(cfg);
  writeDownloads(ctx, cfg);
  emitDownloadsUpdated(ctx);
  return { ok: true };
}

async function removeDownloadHistory(ctx, _evt, payload) {
  var id = payload && payload.id ? String(payload.id) : '';
  if (!id) return { ok: false, error: 'Missing id' };
  var cfg = ensureDownloadsCache(ctx);
  var before = (cfg.downloads || []).length;
  cfg.downloads = (cfg.downloads || []).filter(function (d) {
    if (!d) return false;
    if (String(d.id) !== id) return true;
    // Do not allow removing active downloads.
    return d.state === 'downloading';
  });
  if ((cfg.downloads || []).length === before) return { ok: false, error: 'Not found' };
  cfg.updatedAt = Date.now();
  capDownloads(cfg);
  writeDownloads(ctx, cfg);
  emitDownloadsUpdated(ctx);
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
    try {
      var cfgBoot = ensureDownloadsCache(ctx);
      var changed = false;
      for (var i = 0; i < (cfgBoot.downloads || []).length; i++) {
        var d = cfgBoot.downloads[i];
        if (d && d.state === 'downloading') {
          d.state = 'interrupted';
          d.error = d.error || 'Interrupted (app closed)';
          d.finishedAt = d.finishedAt || Date.now();
          changed = true;
        }
      }
      if (changed) {
        cfgBoot.updatedAt = Date.now();
        capDownloads(cfgBoot);
        writeDownloads(ctx, cfgBoot);
        emitDownloadsUpdated(ctx);
      }
    } catch {}

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

      // Only handle book/comic files
      if (BOOK_EXTS.indexOf(ext) === -1 && COMIC_EXTS.indexOf(ext) === -1) {
        // Let non-library downloads proceed with default behavior
        return;
      }

      var route = routeDownloadSync(ctx, filename);
      if (!route.ok) {
        item.cancel();

        // Persist the failure so it shows up in Downloads.
        try {
          var failId = newDlId();
          var cfgFail = ensureDownloadsCache(ctx);
          cfgFail.downloads.unshift({
            id: failId,
            filename: filename,
            destination: '',
            library: '',
            state: 'failed',
            startedAt: Date.now(),
            finishedAt: Date.now(),
            error: route.error,
            pageUrl: pageUrl,
            downloadUrl: downloadUrl,
            totalBytes: 0,
          });
          cfgFail.updatedAt = Date.now();
          capDownloads(cfgFail);
          writeDownloads(ctx, cfgFail);
          emitDownloadsUpdated(ctx);
        } catch {}

        try {
          ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_COMPLETED, {
            id: null,
            filename: filename,
            error: route.error,
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
      try {
        var cfgStart = ensureDownloadsCache(ctx);
        cfgStart.downloads.unshift({
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
        });
        cfgStart.updatedAt = Date.now();
        capDownloads(cfgStart);
        writeDownloads(ctx, cfgStart);
        emitDownloadsUpdated(ctx);
      } catch {}

      activeDownloadItems.set(dlId, item);
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
        });
      } catch {}

      item.on('updated', function (_e, stateStr) {
        try {
          var st = String(stateStr || '');
          var received = 0;
          var total = 0;
          try { received = item.getReceivedBytes ? Number(item.getReceivedBytes() || 0) : 0; } catch {}
          try { total = item.getTotalBytes ? Number(item.getTotalBytes() || 0) : 0; } catch {}

          var pct = null;
          if (total > 0) pct = Math.max(0, Math.min(1, received / total));

          var sp = activeSpeed.get(dlId);
          if (sp) {
            var now = Date.now();
            var dt = Math.max(1, now - sp.lastAt);
            if (dt >= 500) {
              var db = Math.max(0, received - sp.lastBytes);
              sp.bytesPerSec = Math.round((db * 1000) / dt);
              sp.lastAt = now;
              sp.lastBytes = received;
              activeSpeed.set(dlId, sp);
            }
          }

          ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_PROGRESS, {
            id: dlId,
            filename: filename,
            destination: route.destination,
            library: route.library,
            state: st,
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

        // Update persisted history entry.
        try {
          var cfgDone = ensureDownloadsCache(ctx);
          var found = null;
          for (var i = 0; i < (cfgDone.downloads || []).length; i++) {
            var d = cfgDone.downloads[i];
            if (d && String(d.id) === String(dlId)) { found = d; break; }
          }
          if (found) {
            found.state = (doneState === 'completed') ? 'completed' : (doneState === 'interrupted' ? 'interrupted' : 'failed');
            found.finishedAt = Date.now();
            if (doneState !== 'completed') found.error = found.error || ('Download ' + doneState);
          }
          cfgDone.updatedAt = Date.now();
          capDownloads(cfgDone);
          writeDownloads(ctx, cfgDone);
          emitDownloadsUpdated(ctx);
        } catch {}

        if (doneState === 'completed') {
          // Trigger library rescan
          try {
            if (route.library === 'books') {
              var booksDomain = require('../books');
              booksDomain.scan(ctx, null, {}).catch(function () {});
            } else if (route.library === 'comics') {
              var libraryDomain = require('../library');
              libraryDomain.scan(ctx, null, {}).catch(function () {});
            }
          } catch {}

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
              error: 'Download ' + doneState,
            });
          } catch {}
        }
      });
    });
    // BUILD_WCV: popup handling moved to webTabs domain (per-view setWindowOpenHandler)
  } catch (err) {
    console.error('[BUILD_WEB] Failed to set up download handler:', err);
  }
}

module.exports = {
  get,
  add,
  remove,
  update,
  routeDownload,
  getDestinations,
  getDownloadHistory,
  clearDownloadHistory,
  removeDownloadHistory,
  setupDownloadHandler,
};
