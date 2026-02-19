// BUILD_WEB: Web Sources domain — manages curated download source sites
// and routes downloaded files to the correct library folder.

const path = require('path');
const fs = require('fs');
const { app, session } = require('electron');

const CONFIG_FILE = 'web_sources.json';

const DEFAULT_SOURCES = [
  { id: 'annasarchive', name: "Anna's Archive", url: 'https://annas-archive.org', color: '#e74c3c', builtIn: true },
  { id: 'oceanofpdf', name: 'OceanofPDF', url: 'https://oceanofpdf.com', color: '#3498db', builtIn: true },
  { id: 'getcomics', name: 'GetComics', url: 'https://getcomics.org', color: '#2ecc71', builtIn: true },
  { id: 'zlibrary', name: 'Z-Library', url: 'https://z-lib.is', color: '#f39c12', builtIn: true },
];

var sourcesCache = null;

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

// ---- Download handler for webview partition ----

var downloadHandlerBound = false;

function setupDownloadHandler(ctx) {
  if (downloadHandlerBound) return;
  downloadHandlerBound = true;

  try {
    var ses = session.fromPartition('persist:webmode');
    var ipc = require('../../../shared/ipc');

    ses.on('will-download', function (_event, item, _webContents) {
      var filename = item.getFilename();
      var ext = path.extname(filename).toLowerCase();

      // Only handle book/comic files
      if (BOOK_EXTS.indexOf(ext) === -1 && COMIC_EXTS.indexOf(ext) === -1) {
        // Let non-library downloads proceed with default behavior
        return;
      }

      var route = routeDownloadSync(ctx, filename);
      if (!route.ok) {
        item.cancel();
        try {
          ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_COMPLETED, {
            filename: filename,
            error: route.error,
          });
        } catch {}
        return;
      }

      item.setSavePath(route.destination);

      // BUILD_WEB_PARITY
      try {
        ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_STARTED, {
          filename: filename,
          destination: route.destination,
          library: route.library,
        });
      } catch {}

      item.on('done', function (_e, doneState) {
        if (doneState === 'completed') {
          // Trigger library rescan
          try {
            if (route.library === 'books') {
              var booksDomain = require('../books');
              booksDomain.scan(ctx, null, {}).catch(function () {});
            } else if (route.library === 'comics') {
              // Comics scan is triggered via IPC inline in main/ipc/index.js
              // We emit a library scan request indirectly
              try { ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.LIBRARY_UPDATED, {}); } catch {}
            }
          } catch {}

          try {
            ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_COMPLETED, {
              ok: true,
              filename: filename,
              destination: route.destination,
              library: route.library,
            });
          } catch {}
        } else {
          try {
            ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_DOWNLOAD_COMPLETED, {
              filename: filename,
              error: 'Download ' + doneState,
            });
          } catch {}
        }
      });
    });
    // FIX-WEB-POPUP: intercept popups from webmode webviews
    app.on('web-contents-created', function (_evt2, contents) {
      if (contents.getType() !== 'webview') return;
      try {
        if (contents.session !== ses) return;
      } catch (e) { return; }
      contents.setWindowOpenHandler(function (details) {
        try {
          ctx.win && ctx.win.webContents && ctx.win.webContents.send(ipc.EVENT.WEB_POPUP_OPEN, {
            url: details && details.url ? details.url : '',
            disposition: details && details.disposition ? details.disposition : '',
            sourceWebContentsId: contents && contents.id ? contents.id : null,
          });
        } catch (e) {}
        return { action: 'deny' };
      });
    });
  } catch (err) {
    console.error('[BUILD_WEB] Failed to set up download handler:', err);
  }
}

module.exports = { get, add, remove, update, routeDownload, getDestinations, setupDownloadHandler };
