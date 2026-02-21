/*
Tankoban Max - Books scan worker (FIX-R09)
Builds books_library_index.json from root folders, explicit series folders, and explicit files.
Includes hierarchical folders metadata for renderer tree navigation.
*/

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { statSafe } = require('./shared/fs_safe');
const { makeIgnoreConfig, shouldIgnorePath } = require('./shared/ignore');
const { seriesIdForFolder, bookIdForPath } = require('./shared/ids');

const BOOK_EXT_RE = /\.(epub|pdf|txt|mobi|fb2)$/i;

function extToFormat(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (ext === '.epub') return 'epub';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.mobi') return 'mobi';
  if (ext === '.fb2') return 'fb2';
  return 'txt';
}

function fileTitle(filePath) {
  return path.basename(String(filePath || '')).replace(BOOK_EXT_RE, '');
}

function normalizePath(filePath) {
  try {
    return path.resolve(String(filePath || '')).replace(/\\/g, '/').toLowerCase();
  } catch {
    return String(filePath || '').replace(/\\/g, '/').toLowerCase();
  }
}

function pathKey(filePath) {
  return normalizePath(filePath);
}

function uniqPaths(list) {
  const out = [];
  const seen = new Set();
  for (const p of (Array.isArray(list) ? list : [])) {
    const s = String(p || '').trim();
    if (!s) continue;
    const k = pathKey(s);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function isBookFileName(name) {
  return BOOK_EXT_RE.test(String(name || ''));
}

function toRelPath(rootPath, fullPath) {
  try {
    const rel = path.relative(String(rootPath || ''), String(fullPath || ''));
    if (!rel || rel === '.') return '';
    return String(rel).replace(/\\/g, '/');
  } catch {
    return '';
  }
}

function dirnameRel(relPath) {
  const rp = String(relPath || '').replace(/\\/g, '/');
  if (!rp) return '';
  const i = rp.lastIndexOf('/');
  if (i <= 0) return '';
  return rp.slice(0, i);
}

function folderKey(rootId, relPath) {
  return `${String(rootId || '')}:${String(relPath || '') || '.'}`;
}

function rootIdForRootPath(rootPath) {
  return `root:${seriesIdForFolder(String(rootPath || ''))}`;
}

function rootIdForExplicitSeries(folderPath) {
  return `series:${seriesIdForFolder(String(folderPath || ''))}`;
}

function makeBookRecord(filePath, st, opts) {
  const o = (opts && typeof opts === 'object') ? opts : {};
  const seriesId = String(o.seriesId || '');
  const seriesName = String(o.seriesName || '');
  const sourceKind = String(o.sourceKind || (seriesId ? 'series' : 'single'));
  const id = bookIdForPath(filePath, st);

  return {
    id,
    title: fileTitle(filePath),
    path: filePath,
    size: st.size,
    mtimeMs: st.mtimeMs,
    format: extToFormat(filePath),
    mediaType: 'book',
    sourceKind,
    seriesId: seriesId || null,
    series: seriesName || null,
    seriesPath: o.seriesPath || null,
    rootPath: o.rootPath || null,
    rootId: o.rootId || null, // FIX-R09
    folderRelPath: o.folderRelPath || '', // FIX-R09
    folderKey: o.folderKey || null, // FIX-R09
  };
}

function startsWithPath(childPath, parentPath) {
  const c = normalizePath(childPath);
  const p = normalizePath(parentPath);
  if (!c || !p) return false;
  return c === p || c.startsWith(`${p}/`);
}

function listEntries(dirPath, ignoreCfg) {
  const out = { dirs: [], files: [] };
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const e of entries) {
    const name = String(e && e.name || '');
    const full = path.join(dirPath, name);
    let isDir = false;
    let isFile = false;
    try {
      if (e.isDirectory && e.isDirectory()) isDir = true;
      else if (e.isFile && e.isFile()) isFile = true;
      else if (e.isSymbolicLink && e.isSymbolicLink()) {
        const st = statSafe(full);
        if (st && st.isDirectory()) isDir = true;
        else if (st && st.isFile()) isFile = true;
      }
    } catch {}

    if (shouldIgnorePath(full, name, isDir, ignoreCfg)) continue;

    if (isDir) out.dirs.push(full);
    else if (isFile && isBookFileName(name)) out.files.push(full);
  }

  return out;
}

function locateBestTargetForFile(filePath, targets) {
  const fp = normalizePath(filePath);
  let best = null;
  let bestLen = -1;
  for (const t of targets) {
    const rp = normalizePath(t.rootPath);
    if (!rp) continue;
    if (fp === rp || fp.startsWith(`${rp}/`)) {
      if (rp.length > bestLen) {
        best = t;
        bestLen = rp.length;
      }
    }
  }
  return best;
}

function pushProgress(done, total, currentFolder) {
  try {
    parentPort.postMessage({
      type: 'progress',
      foldersDone: Number(done || 0),
      foldersTotal: Number(total || 0),
      currentFolder: String(currentFolder || ''),
    });
  } catch {}
}

function scanTreeTarget(target, ctx) {
  const rootPath = target.rootPath;
  const rootId = target.rootId;
  const ignoreCfg = ctx.ignoreCfg;

  const stack = [rootPath];
  const seenRealDirs = new Set();
  const folderSeen = ctx.folderSeen;

  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;

    try {
      const rp = fs.realpathSync(dir);
      const rk = normalizePath(rp);
      if (rk && seenRealDirs.has(rk)) continue;
      if (rk) seenRealDirs.add(rk);
    } catch {}

    const stDir = statSafe(dir);
    if (!stDir || !stDir.isDirectory()) continue;

    const relPath = toRelPath(rootPath, dir);
    const parentRelPath = dirnameRel(relPath);
    const fKey = folderKey(rootId, relPath);

    const listing = listEntries(dir, ignoreCfg);
    const childDirs = listing.dirs.slice();
    const directBookFiles = listing.files.slice();

    childDirs.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));

    let directBookCount = 0;
    let newestMtimeMs = 0;
    const includedBookFiles = [];

    for (const fp of directBookFiles) {
      const pk = pathKey(fp);
      if (!pk) continue;
      if (ctx.forcedSingles.has(pk)) continue; // explicit singles override series classification
      if (ctx.bookPathSeen.has(pk)) continue;
      const stFile = statSafe(fp);
      if (!stFile || !stFile.isFile()) continue;
      includedBookFiles.push({ path: fp, st: stFile, key: pk });
      directBookCount += 1;
      newestMtimeMs = Math.max(newestMtimeMs, Number(stFile.mtimeMs || 0));
    }

    // ROOT-TILES: detect whether we're scanning the root folder itself.
    const isRoot = !relPath;

    if (!folderSeen.has(fKey)) {
      folderSeen.add(fKey);
      ctx.folders.push({
        rootId,
        rootPath,
        relPath: relPath || '',
        parentRelPath: relPath ? parentRelPath : null,
        name: relPath ? (path.basename(dir) || relPath) : (target.name || path.basename(rootPath) || rootPath),
        folderKey: fKey,
        childFolderCount: childDirs.length,
        // ROOT-TILES: at root level each book is its own series
        seriesCount: isRoot ? includedBookFiles.length : (includedBookFiles.length > 0 ? 1 : 0),
        bookCount: directBookCount,
        newestMtimeMs,
      });
    }

    // FIX-R09: any folder with direct book files is a series (one-file folders included).
    if (includedBookFiles.length > 0) {
      if (isRoot) {
        // ROOT-TILES: each root-level file becomes its own series (1 tile per file).
        for (const item of includedBookFiles) {
          ctx.bookPathSeen.add(item.key);
          const sid = seriesIdForFolder(item.path);
          const seriesName = fileTitle(item.path);
          const rec = makeBookRecord(item.path, item.st, {
            seriesId: sid,
            seriesName,
            seriesPath: dir,
            rootPath,
            rootId,
            folderRelPath: relPath || '',
            folderKey: fKey,
            sourceKind: 'series',
          });
          ctx.books.push(rec);
          ctx.series.push({
            id: sid,
            name: seriesName,
            path: dir,
            mediaType: 'bookSeries',
            rootPath: rootPath || null,
            rootId: rootId || null,
            folderRelPath: relPath || '',
            folderKey: fKey,
            count: 1,
            newestMtimeMs: Number(rec.mtimeMs || 0),
          });
        }
      } else {
        // Original behavior: all books in subfolder grouped as one series.
        const sid = seriesIdForFolder(dir);
        const seriesName = path.basename(dir) || dir;

        let seriesCount = 0;
        let seriesNewest = 0;
        for (const item of includedBookFiles) {
          ctx.bookPathSeen.add(item.key);
          const rec = makeBookRecord(item.path, item.st, {
            seriesId: sid,
            seriesName,
            seriesPath: dir,
            rootPath,
            rootId,
            folderRelPath: relPath || '',
            folderKey: fKey,
            sourceKind: 'series',
          });
          ctx.books.push(rec);
          seriesCount += 1;
          seriesNewest = Math.max(seriesNewest, Number(rec.mtimeMs || 0));
        }

        ctx.series.push({
          id: sid,
          name: seriesName,
          path: dir,
          mediaType: 'bookSeries',
          rootPath: rootPath || null,
          rootId: rootId || null,
          folderRelPath: relPath || '',
          folderKey: fKey,
          count: seriesCount,
          newestMtimeMs: seriesNewest,
        });
      }
    }

    for (let i = childDirs.length - 1; i >= 0; i -= 1) {
      stack.push(childDirs[i]);
    }
  }
}

function ensureSingleBucketFolders(ctx, rootId) {
  const baseKey = folderKey(rootId, '');
  if (ctx.folderSeen.has(baseKey)) return;
  ctx.folderSeen.add(baseKey);
  ctx.folders.push({
    rootId,
    rootPath: null,
    relPath: '',
    parentRelPath: null,
    name: 'Single files',
    folderKey: baseKey,
    childFolderCount: 0,
    seriesCount: 0,
    bookCount: 0,
    newestMtimeMs: 0,
  });
}

async function buildBooksIndex() {
  const rootFolders = uniqPaths(workerData && workerData.bookRootFolders);
  const explicitSeriesFolders = uniqPaths(workerData && workerData.bookSeriesFolders);
  const explicitSingleFiles = uniqPaths(workerData && workerData.bookSingleFiles);
  const ignoreCfg = makeIgnoreConfig(workerData && workerData.ignore || null);

  const forcedSingles = new Set();
  for (const fp of explicitSingleFiles) {
    const st = statSafe(fp);
    if (!st || !st.isFile()) continue;
    if (!isBookFileName(fp)) continue;
    forcedSingles.add(pathKey(fp));
  }

  const scanTargets = [];
  for (const root of rootFolders) {
    const st = statSafe(root);
    if (!st || !st.isDirectory()) continue;
    scanTargets.push({
      rootId: rootIdForRootPath(root),
      rootPath: root,
      name: path.basename(root) || root,
      kind: 'root',
    });
  }

  // Explicit series folders outside any root are scanned as pseudo roots.
  for (const sf of explicitSeriesFolders) {
    const st = statSafe(sf);
    if (!st || !st.isDirectory()) continue;
    const underRoot = scanTargets.some((t) => startsWithPath(sf, t.rootPath));
    if (underRoot) continue;
    scanTargets.push({
      rootId: rootIdForExplicitSeries(sf),
      rootPath: sf,
      name: path.basename(sf) || sf,
      kind: 'explicitSeriesRoot',
    });
  }

  const ctx = {
    ignoreCfg,
    forcedSingles,
    series: [],
    books: [],
    folders: [],
    bookPathSeen: new Set(),
    folderSeen: new Set(),
  };

  const total = scanTargets.length;
  pushProgress(0, total, '');

  let done = 0;
  for (const target of scanTargets) {
    scanTreeTarget(target, ctx);
    done += 1;
    pushProgress(done, total, target.name || target.rootPath);
    await new Promise((resolve) => setImmediate(resolve));
  }

  // Explicit single files (outside or inside roots) remain accessible as single items.
  for (const fp of explicitSingleFiles) {
    const filePath = String(fp || '');
    if (!filePath || !isBookFileName(filePath)) continue;
    const st = statSafe(filePath);
    if (!st || !st.isFile()) continue;
    const pk = pathKey(filePath);
    if (!pk || ctx.bookPathSeen.has(pk)) continue;

    const owner = locateBestTargetForFile(filePath, scanTargets);
    const rootId = owner ? owner.rootId : 'single-files';
    const rootPath = owner ? owner.rootPath : null;
    const dir = path.dirname(filePath);
    const relPath = owner ? toRelPath(owner.rootPath, dir) : '';
    const fKey = folderKey(rootId, relPath);

    if (!owner) ensureSingleBucketFolders(ctx, rootId);

    if (!ctx.folderSeen.has(fKey)) {
      ctx.folderSeen.add(fKey);
      ctx.folders.push({
        rootId,
        rootPath,
        relPath: relPath || '',
        parentRelPath: relPath ? dirnameRel(relPath) : null,
        name: relPath ? (path.basename(dir) || relPath) : (owner ? (owner.name || path.basename(owner.rootPath) || owner.rootPath) : 'Single files'),
        folderKey: fKey,
        childFolderCount: 0,
        seriesCount: 0,
        bookCount: 1,
        newestMtimeMs: Number(st.mtimeMs || 0),
      });
    }

    const rec = makeBookRecord(filePath, st, {
      sourceKind: 'single',
      rootPath,
      rootId,
      folderRelPath: relPath || '',
      folderKey: fKey,
      seriesId: null,
      seriesName: null,
      seriesPath: null,
    });
    ctx.bookPathSeen.add(pk);
    ctx.books.push(rec);
  }

  ctx.series.sort((a, b) =>
    (Number(b.newestMtimeMs || 0) - Number(a.newestMtimeMs || 0))
    || String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' }));
  ctx.books.sort((a, b) =>
    (Number(b.mtimeMs || 0) - Number(a.mtimeMs || 0))
    || String(a.title || '').localeCompare(String(b.title || ''), undefined, { numeric: true, sensitivity: 'base' }));
  ctx.folders.sort((a, b) =>
    String(a.rootId || '').localeCompare(String(b.rootId || ''), undefined, { numeric: true, sensitivity: 'base' })
    || String(a.relPath || '').localeCompare(String(b.relPath || ''), undefined, { numeric: true, sensitivity: 'base' }));

  return { series: ctx.series, books: ctx.books, folders: ctx.folders };
}

(async () => {
  try {
    const idx = await buildBooksIndex();

    const indexPath = String(workerData && workerData.indexPath || '');
    if (indexPath) {
      try {
        fs.mkdirSync(path.dirname(indexPath), { recursive: true });
        fs.writeFileSync(indexPath, JSON.stringify(idx, null, 2), 'utf-8');
      } catch {}
    }

    parentPort.postMessage({ type: 'done', idx });
  } catch (err) {
    parentPort.postMessage({
      type: 'done',
      idx: { series: [], books: [], folders: [] },
      error: String(err && err.message ? err.message : err),
    });
  }
})();
