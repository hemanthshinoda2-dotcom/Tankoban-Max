/*
Tankoban Max - Books Library Domain
*/

const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { dialog, BrowserWindow } = require('electron');
const { pathToFileURL } = require('url');

const SUPPORTED_EXT_RE = /\.(epub|pdf|txt)$/i;

const DEFAULT_SCAN_IGNORE_DIRNAMES = [
  '__macosx',
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '@eadir',
  '$recycle.bin',
  'system volume information',
];

let booksCache = {
  idx: { series: [], books: [], folders: [] }, // FIX-R09
  scanning: false,
  scanWorker: null,
  idxLoaded: false,
  lastScanAt: 0,
  error: null,
  scanId: 0,
  lastScanKey: '',
  scanQueuedCfg: null,
  pendingPruneProgress: false,
  pendingPrunePrevBookIds: null,
  needsFolderBackfill: false, // FIX-R09
};

function pathKey(filePath) {
  try { return path.resolve(String(filePath || '')).toLowerCase(); } catch { return String(filePath || '').toLowerCase(); }
}

function uniq(list) {
  const out = [];
  const seen = new Set();
  for (const v of (Array.isArray(list) ? list : [])) {
    const s = String(v || '').trim();
    if (!s) continue;
    const k = pathKey(s);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function sanitizeIgnore(patterns) {
  const out = [];
  const seen = new Set();
  for (const p of (Array.isArray(patterns) ? patterns : [])) {
    const s = String(p || '').trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= 200) break;
  }
  return out;
}

function isSupportedBookPath(filePath) {
  return SUPPORTED_EXT_RE.test(String(filePath || ''));
}

function listImmediateSubdirs(rootFolder) {
  let entries;
  try { entries = fs.readdirSync(rootFolder, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    if (!e || !e.name) continue;
    const full = path.join(rootFolder, e.name);
    let isDir = false;
    try {
      if (e.isDirectory && e.isDirectory()) isDir = true;
      else if (e.isSymbolicLink && e.isSymbolicLink()) {
        const st = fs.statSync(full);
        if (st && st.isDirectory()) isDir = true;
      }
    } catch {}
    if (!isDir) continue;
    if (String(e.name).startsWith('.')) continue;
    out.push(full);
  }
  return out;
}

function readBooksConfig(ctx) {
  const p = ctx.storage.dataPath('books_library_state.json');
  const state = ctx.storage.readJSON(p, {
    bookRootFolders: [],
    bookSeriesFolders: [],
    bookSingleFiles: [],
    scanIgnore: [],
  });

  state.bookRootFolders = uniq(state.bookRootFolders);
  state.bookSeriesFolders = uniq(state.bookSeriesFolders);
  state.bookSingleFiles = uniq(state.bookSingleFiles);
  state.scanIgnore = sanitizeIgnore(state.scanIgnore);

  return state;
}

async function writeBooksConfig(ctx, state) {
  const p = ctx.storage.dataPath('books_library_state.json');
  await ctx.storage.writeJSON(p, {
    bookRootFolders: uniq(state && state.bookRootFolders),
    bookSeriesFolders: uniq(state && state.bookSeriesFolders),
    bookSingleFiles: uniq(state && state.bookSingleFiles),
    scanIgnore: sanitizeIgnore(state && state.scanIgnore),
  });
}

function ensureBooksIndexLoaded(ctx) {
  if (booksCache.idxLoaded) return;
  booksCache.idxLoaded = true;

  const idx = ctx.storage.readJSON(ctx.storage.dataPath('books_library_index.json'), null);
  if (idx && Array.isArray(idx.series) && Array.isArray(idx.books)) {
    booksCache.idx = {
      series: idx.series,
      books: idx.books,
      folders: Array.isArray(idx.folders) ? idx.folders : [],
    };
    booksCache.needsFolderBackfill = !Array.isArray(idx.folders);
    return;
  }

  booksCache.idx = { series: [], books: [], folders: [] };
  booksCache.needsFolderBackfill = false;
}

function makeBooksStateSnapshot(ctx, state) {
  const s = state || readBooksConfig(ctx);
  return {
    bookRootFolders: uniq(s.bookRootFolders),
    bookSeriesFolders: uniq(s.bookSeriesFolders),
    bookSingleFiles: uniq(s.bookSingleFiles),
    scanIgnore: sanitizeIgnore(s.scanIgnore),
    series: Array.isArray(booksCache.idx.series) ? booksCache.idx.series : [],
    books: Array.isArray(booksCache.idx.books) ? booksCache.idx.books : [],
    folders: Array.isArray(booksCache.idx.folders) ? booksCache.idx.folders : [], // FIX-R09
    scanning: !!booksCache.scanning,
    lastScanAt: booksCache.lastScanAt || 0,
    error: booksCache.error || null,
  };
}

function emitBooksUpdated(ctx) {
  try {
    ctx.win?.webContents?.send(ctx.EVENT.BOOKS_UPDATED, makeBooksStateSnapshot(ctx));
  } catch {}
}

function pruneBooksProgressByRemovedBookIds(ctx, removedIds) {
  try {
    if (!removedIds || !removedIds.length) return;
    const booksProgress = require('../booksProgress');
    const all = booksProgress._getBooksProgressMem ? booksProgress._getBooksProgressMem(ctx) : {};
    let changed = false;
    for (const id of removedIds) {
      const k = String(id || '');
      if (!k) continue;
      if (Object.prototype.hasOwnProperty.call(all, k)) {
        delete all[k];
        changed = true;
      }
    }
    if (changed) {
      ctx.storage.writeJSONDebounced(ctx.storage.dataPath('books_progress.json'), all, 50);
    }
  } catch {}
}

function scanKeyFromConfig(cfg) {
  const c = cfg || {};
  return JSON.stringify({
    bookRootFolders: uniq(c.bookRootFolders),
    bookSeriesFolders: uniq(c.bookSeriesFolders),
    bookSingleFiles: uniq(c.bookSingleFiles),
    scanIgnore: sanitizeIgnore(c.scanIgnore),
  });
}

function startBooksScan(ctx, cfg, opts = null) {
  ensureBooksIndexLoaded(ctx);

  const c = cfg || readBooksConfig(ctx);
  const key = scanKeyFromConfig(c);

  if (booksCache.scanning) {
    booksCache.scanQueuedCfg = {
      bookRootFolders: uniq(c.bookRootFolders),
      bookSeriesFolders: uniq(c.bookSeriesFolders),
      bookSingleFiles: uniq(c.bookSingleFiles),
      scanIgnore: sanitizeIgnore(c.scanIgnore),
    };
    return;
  }

  const options = (opts && typeof opts === 'object') ? opts : {};
  const force = !!options.force;
  if (!force && booksCache.lastScanAt > 0 && booksCache.lastScanKey === key) return;

  booksCache.lastScanKey = key;
  booksCache.scanning = true;
  booksCache.error = null;
  const myScanId = ++booksCache.scanId;

  const totalFolders = uniq(c.bookRootFolders).length + uniq(c.bookSeriesFolders).length;

  try {
    ctx.win?.webContents?.send(ctx.EVENT.BOOKS_SCAN_STATUS, {
      scanning: true,
      progress: {
        foldersDone: 0,
        foldersTotal: totalFolders,
        currentFolder: '',
      },
    });
  } catch {}

  const workerURL = pathToFileURL(path.join(ctx.APP_ROOT, 'books_scan_worker.js'));
  const indexPath = ctx.storage.dataPath('books_library_index.json');

  const w = new Worker(workerURL, {
    workerData: {
      bookRootFolders: uniq(c.bookRootFolders),
      bookSeriesFolders: uniq(c.bookSeriesFolders),
      bookSingleFiles: uniq(c.bookSingleFiles),
      indexPath,
      ignore: {
        dirNames: DEFAULT_SCAN_IGNORE_DIRNAMES,
        substrings: sanitizeIgnore(c.scanIgnore),
      },
    },
  });

  booksCache.scanWorker = w;

  const finish = (ok) => {
    if (myScanId !== booksCache.scanId) return;

    booksCache.scanWorker = null;
    booksCache.scanning = false;
    if (ok) booksCache.lastScanAt = Date.now();

    const queued = booksCache.scanQueuedCfg;
    booksCache.scanQueuedCfg = null;

    if (queued && scanKeyFromConfig(queued) !== booksCache.lastScanKey) {
      startBooksScan(ctx, queued, { force: true });
      return;
    }

    try {
      ctx.win?.webContents?.send(ctx.EVENT.BOOKS_SCAN_STATUS, {
        scanning: false,
        progress: null,
      });
    } catch {}
  };

  w.on('message', (msg) => {
    if (myScanId !== booksCache.scanId) return;

    if (msg && msg.type === 'progress') {
      try {
        ctx.win?.webContents?.send(ctx.EVENT.BOOKS_SCAN_STATUS, {
          scanning: true,
          progress: {
            foldersDone: Number(msg.foldersDone || 0),
            foldersTotal: Number(msg.foldersTotal || totalFolders),
            currentFolder: String(msg.currentFolder || ''),
          },
        });
      } catch {}
      return;
    }

    if (msg && msg.type === 'done') {
      const idx = msg.idx || { series: [], books: [], folders: [] };
      booksCache.idx = {
        series: Array.isArray(idx.series) ? idx.series : [],
        books: Array.isArray(idx.books) ? idx.books : [],
        folders: Array.isArray(idx.folders) ? idx.folders : [],
      };
      booksCache.needsFolderBackfill = false;

      if (booksCache.pendingPruneProgress) {
        booksCache.pendingPruneProgress = false;
        const prevArr = Array.isArray(booksCache.pendingPrunePrevBookIds) ? booksCache.pendingPrunePrevBookIds : [];
        booksCache.pendingPrunePrevBookIds = null;

        const prev = new Set(prevArr.map((x) => String(x || '')).filter(Boolean));
        const cur = new Set((booksCache.idx.books || []).map((b) => String(b && b.id || '')).filter(Boolean));

        const removed = [];
        for (const id of prev) {
          if (!cur.has(id)) removed.push(id);
        }

        pruneBooksProgressByRemovedBookIds(ctx, removed);
      }

      emitBooksUpdated(ctx);
      finish(true);
    }
  });

  w.on('error', (err) => {
    if (myScanId !== booksCache.scanId) return;
    booksCache.error = String(err && err.message ? err.message : err);
    emitBooksUpdated(ctx);
    finish(false);
  });

  w.on('exit', (code) => {
    if (myScanId !== booksCache.scanId) return;
    if (code !== 0) {
      booksCache.error = `Books scan worker exited ${code}`;
      emitBooksUpdated(ctx);
      finish(false);
    }
  });
}

async function getState(ctx) {
  ensureBooksIndexLoaded(ctx);
  const state = readBooksConfig(ctx);
  const snap = makeBooksStateSnapshot(ctx, state);
  startBooksScan(ctx, state, { force: !!booksCache.needsFolderBackfill }); // FIX-R09
  return snap;
}

async function scan(ctx, _evt, opts) {
  const state = readBooksConfig(ctx);
  startBooksScan(ctx, state, { force: true, opts });
  return { ok: true };
}

async function cancelScan(ctx) {
  if (!booksCache.scanning || !booksCache.scanWorker) return { ok: false };

  const w = booksCache.scanWorker;
  booksCache.scanWorker = null;
  booksCache.scanId += 1;
  booksCache.scanning = false;
  booksCache.error = null;
  booksCache.scanQueuedCfg = null;

  try { await w.terminate(); } catch {}

  try {
    ctx.win?.webContents?.send(ctx.EVENT.BOOKS_SCAN_STATUS, {
      scanning: false,
      progress: null,
      canceled: true,
    });
  } catch {}
  emitBooksUpdated(ctx);
  return { ok: true };
}

async function setScanIgnore(ctx, _evt, patterns) {
  const state = readBooksConfig(ctx);
  state.scanIgnore = sanitizeIgnore(patterns);
  await writeBooksConfig(ctx, state);

  const snap = makeBooksStateSnapshot(ctx, state);
  startBooksScan(ctx, state, { force: true });
  emitBooksUpdated(ctx);

  return { ok: true, state: snap };
}

function getDialogParent(evt) {
  try {
    const w = BrowserWindow.fromWebContents(evt && evt.sender);
    if (w && !w.isDestroyed()) return w;
  } catch {}
  try {
    return BrowserWindow.getFocusedWindow();
  } catch {
    return null;
  }
}

async function addRootFolder(ctx, evt) {
  const parent = getDialogParent(evt);
  const res = await dialog.showOpenDialog(parent, {
    title: 'Add root books folder',
    properties: ['openDirectory'],
  });
  if (res.canceled || !res.filePaths || !res.filePaths.length) return { ok: false };

  const folder = String(res.filePaths[0] || '');
  if (!folder) return { ok: false };

  const state = readBooksConfig(ctx);
  state.bookRootFolders = uniq([folder, ...(state.bookRootFolders || [])]);
  await writeBooksConfig(ctx, state);

  const snap = makeBooksStateSnapshot(ctx, state);
  startBooksScan(ctx, state, { force: true });
  return { ok: true, state: snap };
}

async function removeRootFolder(ctx, _evt, rootPath) {
  const target = String(rootPath || '');
  if (!target) return { ok: false };

  ensureBooksIndexLoaded(ctx);
  try { booksCache.pendingPrunePrevBookIds = (booksCache.idx.books || []).map((b) => b && b.id).filter(Boolean); } catch {}

  const state = readBooksConfig(ctx);
  state.bookRootFolders = (state.bookRootFolders || []).filter((p) => pathKey(p) !== pathKey(target));
  await writeBooksConfig(ctx, state);

  booksCache.pendingPruneProgress = true;

  const snap = makeBooksStateSnapshot(ctx, state);
  startBooksScan(ctx, state, { force: true });
  return { ok: true, state: snap };
}

async function addSeriesFolder(ctx, evt) {
  const parent = getDialogParent(evt);
  const res = await dialog.showOpenDialog(parent, {
    title: 'Add books series folder',
    properties: ['openDirectory'],
  });
  if (res.canceled || !res.filePaths || !res.filePaths.length) return { ok: false };

  const folder = String(res.filePaths[0] || '');
  if (!folder) return { ok: false };

  const state = readBooksConfig(ctx);
  state.bookSeriesFolders = uniq([folder, ...(state.bookSeriesFolders || [])]);
  await writeBooksConfig(ctx, state);

  const snap = makeBooksStateSnapshot(ctx, state);
  startBooksScan(ctx, state, { force: true });
  return { ok: true, state: snap };
}

async function removeSeriesFolder(ctx, _evt, folderPath) {
  const target = String(folderPath || '');
  if (!target) return { ok: false };

  ensureBooksIndexLoaded(ctx);
  try { booksCache.pendingPrunePrevBookIds = (booksCache.idx.books || []).map((b) => b && b.id).filter(Boolean); } catch {}

  const state = readBooksConfig(ctx);
  state.bookSeriesFolders = (state.bookSeriesFolders || []).filter((p) => pathKey(p) !== pathKey(target));
  await writeBooksConfig(ctx, state);

  booksCache.pendingPruneProgress = true;

  const snap = makeBooksStateSnapshot(ctx, state);
  startBooksScan(ctx, state, { force: true });
  return { ok: true, state: snap };
}

async function addFiles(ctx, evt) {
  const parent = getDialogParent(evt);
  const res = await dialog.showOpenDialog(parent, {
    title: 'Add books files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Books', extensions: ['epub', 'pdf', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (res.canceled || !res.filePaths || !res.filePaths.length) return { ok: false };

  const picks = [];
  for (const fp of res.filePaths) {
    const s = String(fp || '');
    if (!s) continue;
    if (!isSupportedBookPath(s)) continue;
    picks.push(s);
  }
  if (!picks.length) return { ok: false };

  const state = readBooksConfig(ctx);
  state.bookSingleFiles = uniq([...(state.bookSingleFiles || []), ...picks]);
  await writeBooksConfig(ctx, state);

  const snap = makeBooksStateSnapshot(ctx, state);
  startBooksScan(ctx, state, { force: true });
  return { ok: true, state: snap };
}

async function removeFile(ctx, _evt, filePath) {
  const target = String(filePath || '');
  if (!target) return { ok: false };

  ensureBooksIndexLoaded(ctx);
  try { booksCache.pendingPrunePrevBookIds = (booksCache.idx.books || []).map((b) => b && b.id).filter(Boolean); } catch {}

  const state = readBooksConfig(ctx);
  state.bookSingleFiles = (state.bookSingleFiles || []).filter((p) => pathKey(p) !== pathKey(target));
  await writeBooksConfig(ctx, state);

  booksCache.pendingPruneProgress = true;

  const snap = makeBooksStateSnapshot(ctx, state);
  startBooksScan(ctx, state, { force: true });
  return { ok: true, state: snap };
}

async function openFileDialog(ctx, evt) {
  const parent = getDialogParent(evt);
  const res = await dialog.showOpenDialog(parent, {
    title: 'Open book file',
    properties: ['openFile'],
    filters: [
      { name: 'Books', extensions: ['epub', 'pdf', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (res.canceled || !res.filePaths || !res.filePaths.length) return { ok: false };

  return bookFromPath(ctx, evt, res.filePaths[0]);
}

function classifyBookPathFromConfig(cfg, filePath) {
  const fp = String(filePath || '');
  const parent = path.dirname(fp);

  const explicitSeries = uniq(cfg && cfg.bookSeriesFolders);
  for (const sf of explicitSeries) {
    const base = pathKey(sf);
    const pk = pathKey(parent);
    if (pk === base || pk.startsWith(base + path.sep.toLowerCase())) {
      return {
        sourceKind: 'series',
        seriesPath: sf,
        seriesId: Buffer.from(sf).toString('base64url'),
        seriesName: path.basename(sf) || sf,
      };
    }
  }

  const roots = uniq(cfg && cfg.bookRootFolders);
  for (const root of roots) {
    const rootDirs = listImmediateSubdirs(root);
    for (const sf of rootDirs) {
      const base = pathKey(sf);
      const pk = pathKey(parent);
      if (pk === base || pk.startsWith(base + path.sep.toLowerCase())) {
        return {
          sourceKind: 'series',
          seriesPath: sf,
          seriesId: Buffer.from(sf).toString('base64url'),
          seriesName: path.basename(sf) || sf,
        };
      }
    }
  }

  return {
    sourceKind: 'single',
    seriesPath: null,
    seriesId: null,
    seriesName: null,
  };
}

async function bookFromPath(ctx, _evt, filePath) {
  try {
    const fp = String(filePath || '');
    if (!fp || !isSupportedBookPath(fp)) return { ok: false };

    const st = await fs.promises.stat(fp);
    if (!st || !st.isFile()) return { ok: false };

    const cfg = readBooksConfig(ctx);
    const cls = classifyBookPathFromConfig(cfg, fp);

    const ext = path.extname(fp).toLowerCase();
    const format = (ext === '.epub') ? 'epub' : (ext === '.pdf') ? 'pdf' : 'txt';
    const id = Buffer.from(`${fp}::${st.size}::${st.mtimeMs}`).toString('base64url');
    const title = path.basename(fp).replace(SUPPORTED_EXT_RE, '');

    const book = {
      id,
      title,
      path: fp,
      size: st.size,
      mtimeMs: st.mtimeMs,
      format,
      mediaType: 'book',
      sourceKind: cls.sourceKind,
      seriesId: cls.seriesId,
      series: cls.seriesName,
      seriesPath: cls.seriesPath,
      rootPath: null,
    };

    return { ok: true, book };
  } catch {
    return { ok: false };
  }
}

module.exports = {
  getState,
  scan,
  cancelScan,
  setScanIgnore,
  addRootFolder,
  removeRootFolder,
  addSeriesFolder,
  removeSeriesFolder,
  addFiles,
  removeFile,
  openFileDialog,
  bookFromPath,
};
