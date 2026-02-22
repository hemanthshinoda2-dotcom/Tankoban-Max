/*
Tankoban Max - Audiobook Library Domain (FEAT-AUDIOBOOK)
Config persistence, scan lifecycle, state snapshots.
Mirrors the pattern from main/domains/books/index.js.
*/

const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { dialog, BrowserWindow } = require('electron');
const { pathToFileURL } = require('url');

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

let audiobookCache = {
  idx: { audiobooks: [] },
  scanning: false,
  scanWorker: null,
  idxLoaded: false,
  lastScanAt: 0,
  error: null,
  scanId: 0,
  lastScanKey: '',
  scanQueuedCfg: null,
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

function readAudiobookConfig(ctx) {
  const p = ctx.storage.dataPath('audiobook_config.json');
  const state = ctx.storage.readJSON(p, {
    audiobookRootFolders: [],
  });
  state.audiobookRootFolders = uniq(state.audiobookRootFolders);
  return state;
}

async function writeAudiobookConfig(ctx, state) {
  const p = ctx.storage.dataPath('audiobook_config.json');
  await ctx.storage.writeJSON(p, {
    audiobookRootFolders: uniq(state && state.audiobookRootFolders),
  });
}

function ensureAudiobookIndexLoaded(ctx) {
  if (audiobookCache.idxLoaded) return;
  audiobookCache.idxLoaded = true;

  const idx = ctx.storage.readJSON(ctx.storage.dataPath('audiobook_index.json'), null);
  if (idx && Array.isArray(idx.audiobooks)) {
    audiobookCache.idx = { audiobooks: idx.audiobooks };
    return;
  }
  audiobookCache.idx = { audiobooks: [] };
}

function makeAudiobookStateSnapshot(ctx, state) {
  const s = state || readAudiobookConfig(ctx);
  return {
    audiobookRootFolders: uniq(s.audiobookRootFolders),
    audiobooks: Array.isArray(audiobookCache.idx.audiobooks) ? audiobookCache.idx.audiobooks : [],
    scanning: !!audiobookCache.scanning,
    lastScanAt: audiobookCache.lastScanAt || 0,
    error: audiobookCache.error || null,
  };
}

function emitAudiobooksUpdated(ctx) {
  try {
    ctx.win?.webContents?.send(ctx.EVENT.AUDIOBOOK_UPDATED, makeAudiobookStateSnapshot(ctx));
  } catch {}
}

function scanKeyFromConfig(cfg) {
  const c = cfg || {};
  return JSON.stringify({
    audiobookRootFolders: uniq(c.audiobookRootFolders),
  });
}

// Collect all roots: audiobook-specific roots + books root folders (shared)
function collectAllRoots(ctx, cfg) {
  const abRoots = uniq((cfg || {}).audiobookRootFolders);
  // Also scan books root folders so audiobooks inside book roots are auto-discovered
  let booksRoots = [];
  try {
    const booksConfig = ctx.storage.readJSON(ctx.storage.dataPath('books_library_state.json'), {});
    booksRoots = Array.isArray(booksConfig.bookRootFolders) ? booksConfig.bookRootFolders : [];
  } catch {}
  return uniq([...abRoots, ...booksRoots]);
}

function startAudiobookScan(ctx, cfg, opts = null) {
  ensureAudiobookIndexLoaded(ctx);

  const c = cfg || readAudiobookConfig(ctx);
  const allRoots = collectAllRoots(ctx, c);
  const key = JSON.stringify({ audiobookRootFolders: allRoots });

  if (audiobookCache.scanning) {
    audiobookCache.scanQueuedCfg = {
      audiobookRootFolders: uniq(c.audiobookRootFolders),
    };
    return;
  }

  const options = (opts && typeof opts === 'object') ? opts : {};
  const force = !!options.force;
  if (!force && audiobookCache.lastScanAt > 0 && audiobookCache.lastScanKey === key) return;

  audiobookCache.lastScanKey = key;
  audiobookCache.scanning = true;
  audiobookCache.error = null;
  const myScanId = ++audiobookCache.scanId;

  const totalFolders = allRoots.length;

  try {
    ctx.win?.webContents?.send(ctx.EVENT.AUDIOBOOK_SCAN_STATUS, {
      scanning: true,
      progress: {
        foldersDone: 0,
        foldersTotal: totalFolders,
        currentFolder: '',
      },
    });
  } catch {}

  const workerURL = pathToFileURL(path.join(ctx.APP_ROOT, 'audiobook_scan_worker.js'));
  const indexPath = ctx.storage.dataPath('audiobook_index.json');

  const w = new Worker(workerURL, {
    workerData: {
      audiobookRootFolders: allRoots,
      indexPath,
      ignore: {
        dirNames: DEFAULT_SCAN_IGNORE_DIRNAMES,
      },
    },
  });

  audiobookCache.scanWorker = w;

  const finish = (ok) => {
    if (myScanId !== audiobookCache.scanId) return;

    audiobookCache.scanWorker = null;
    audiobookCache.scanning = false;
    if (ok) audiobookCache.lastScanAt = Date.now();

    const queued = audiobookCache.scanQueuedCfg;
    audiobookCache.scanQueuedCfg = null;

    if (queued && scanKeyFromConfig(queued) !== audiobookCache.lastScanKey) {
      startAudiobookScan(ctx, queued, { force: true });
      return;
    }

    try {
      ctx.win?.webContents?.send(ctx.EVENT.AUDIOBOOK_SCAN_STATUS, {
        scanning: false,
        progress: null,
      });
    } catch {}
  };

  w.on('message', (msg) => {
    if (myScanId !== audiobookCache.scanId) return;

    if (msg && msg.type === 'progress') {
      try {
        ctx.win?.webContents?.send(ctx.EVENT.AUDIOBOOK_SCAN_STATUS, {
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
      const idx = msg.idx || { audiobooks: [] };
      audiobookCache.idx = {
        audiobooks: Array.isArray(idx.audiobooks) ? idx.audiobooks : [],
      };

      emitAudiobooksUpdated(ctx);
      finish(true);
    }
  });

  w.on('error', (err) => {
    if (myScanId !== audiobookCache.scanId) return;
    audiobookCache.error = String(err && err.message ? err.message : err);
    emitAudiobooksUpdated(ctx);
    finish(false);
  });

  w.on('exit', (code) => {
    if (myScanId !== audiobookCache.scanId) return;
    if (code !== 0) {
      audiobookCache.error = `Audiobook scan worker exited ${code}`;
      emitAudiobooksUpdated(ctx);
      finish(false);
    }
  });
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

// ── IPC Handlers ──────────────────────────────────────────────

async function getState(ctx) {
  ensureAudiobookIndexLoaded(ctx);
  const state = readAudiobookConfig(ctx);
  const snap = makeAudiobookStateSnapshot(ctx, state);
  startAudiobookScan(ctx, state);
  return snap;
}

async function scan(ctx) {
  const state = readAudiobookConfig(ctx);
  startAudiobookScan(ctx, state, { force: true });
  return { ok: true };
}

async function addRootFolder(ctx, evt, folderPath) {
  let folder;
  if (typeof folderPath === 'string' && folderPath.trim()) {
    // Called programmatically with a path (e.g. from unified "Add root..." button)
    folder = folderPath.trim();
  } else {
    const parent = getDialogParent(evt);
    const res = await dialog.showOpenDialog(parent, {
      title: 'Add audiobook root folder',
      properties: ['openDirectory'],
    });
    if (res.canceled || !res.filePaths || !res.filePaths.length) return { ok: false };
    folder = String(res.filePaths[0] || '');
  }
  if (!folder) return { ok: false };

  const state = readAudiobookConfig(ctx);
  state.audiobookRootFolders = uniq([folder, ...(state.audiobookRootFolders || [])]);
  await writeAudiobookConfig(ctx, state);

  const snap = makeAudiobookStateSnapshot(ctx, state);
  startAudiobookScan(ctx, state, { force: true });
  return { ok: true, state: snap };
}

async function addFolder(ctx, evt) {
  const parent = getDialogParent(evt);
  const res = await dialog.showOpenDialog(parent, {
    title: 'Add audiobook folder',
    properties: ['openDirectory'],
  });
  if (res.canceled || !res.filePaths || !res.filePaths.length) return { ok: false };

  const folder = String(res.filePaths[0] || '');
  if (!folder) return { ok: false };

  // The selected folder IS the audiobook — add its parent as a root so the scanner picks it up
  const parentDir = path.dirname(folder);
  const state = readAudiobookConfig(ctx);
  state.audiobookRootFolders = uniq([parentDir, ...(state.audiobookRootFolders || [])]);
  await writeAudiobookConfig(ctx, state);

  const snap = makeAudiobookStateSnapshot(ctx, state);
  startAudiobookScan(ctx, state, { force: true });
  return { ok: true, state: snap };
}

async function removeRootFolder(ctx, _evt, rootPath) {
  const target = String(rootPath || '');
  if (!target) return { ok: false };

  const state = readAudiobookConfig(ctx);
  state.audiobookRootFolders = (state.audiobookRootFolders || []).filter((p) => pathKey(p) !== pathKey(target));
  await writeAudiobookConfig(ctx, state);

  const snap = makeAudiobookStateSnapshot(ctx, state);
  startAudiobookScan(ctx, state, { force: true });
  return { ok: true, state: snap };
}

module.exports = {
  getState,
  scan,
  addRootFolder,
  addFolder,
  removeRootFolder,
};
