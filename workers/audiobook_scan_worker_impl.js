/*
Tankoban Max - Audiobook scan worker (FEAT-AUDIOBOOK)
Walks audiobook root folders, finds directories containing audio files,
builds audiobook records with chapter lists and duration metadata.
*/

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { statSafe } = require('./shared/fs_safe');
const { makeIgnoreConfig, shouldIgnorePath } = require('./shared/ignore');
const { base64Url } = require('./shared/ids');

const AUDIO_EXT_RE = /\.(mp3|m4a|m4b|ogg|opus|flac|wav|aac|wma)$/i;
const COVER_NAMES = ['cover.jpg', 'cover.png', 'folder.jpg', 'front.jpg'];
const IMAGE_EXT_RE = /\.(jpg|jpeg|png)$/i;

// Natural sort comparator for chapter file ordering
function naturalCompare(a, b) {
  const ax = String(a || '');
  const bx = String(b || '');
  return ax.localeCompare(bx, undefined, { numeric: true, sensitivity: 'base' });
}

function isAudioFile(name) {
  return AUDIO_EXT_RE.test(String(name || ''));
}

function chapterTitleFromFile(fileName) {
  // Strip extension, replace underscores/dashes with spaces for display
  return path.basename(String(fileName || '')).replace(AUDIO_EXT_RE, '').trim();
}

function findCover(folderPath, entries) {
  // Priority 1: known cover filenames
  for (const name of COVER_NAMES) {
    const match = entries.find(e => e.name.toLowerCase() === name);
    if (match) return path.join(folderPath, match.name);
  }
  // Priority 2: first image file in folder
  for (const e of entries) {
    if (IMAGE_EXT_RE.test(e.name)) return path.join(folderPath, e.name);
  }
  return null;
}

function audiobookIdForFolder(folderPath, audioFiles) {
  // ID based on folder path + total file size + latest mtime (same pattern as books)
  let totalSize = 0;
  let latestMtime = 0;
  for (const af of audioFiles) {
    totalSize += af.size || 0;
    if (af.mtimeMs > latestMtime) latestMtime = af.mtimeMs;
  }
  return base64Url(`${folderPath}::${totalSize}::${latestMtime}`);
}

function rootIdForPath(rootPath) {
  return 'abroot:' + base64Url(rootPath);
}

// Extract duration using music-metadata (lazy-loaded)
let mm = null;
async function getDuration(filePath) {
  try {
    if (!mm) mm = require('music-metadata');
    const metadata = await mm.parseFile(filePath, { duration: true, skipCovers: true });
    return metadata && metadata.format && metadata.format.duration
      ? Math.round(metadata.format.duration * 100) / 100
      : 0;
  } catch {
    return 0;
  }
}

// Scan a single directory for audio files (non-recursive — one folder = one audiobook)
function scanFolder(folderPath) {
  let entries;
  try { entries = fs.readdirSync(folderPath, { withFileTypes: true }); } catch { return null; }

  const audioFiles = [];
  const allEntries = [];

  for (const e of entries) {
    if (!e || !e.name) continue;
    allEntries.push(e);
    if (e.isFile && e.isFile() && isAudioFile(e.name)) {
      const fullPath = path.join(folderPath, e.name);
      const st = statSafe(fullPath);
      if (st) {
        audioFiles.push({
          name: e.name,
          path: fullPath,
          size: st.size,
          mtimeMs: st.mtimeMs,
        });
      }
    }
  }

  if (audioFiles.length === 0) return null;

  // Natural sort by filename for correct chapter order
  audioFiles.sort((a, b) => naturalCompare(a.name, b.name));

  const coverPath = findCover(folderPath, allEntries);

  return { audioFiles, coverPath, allEntries };
}

// Walk a root folder recursively, finding all audiobook directories
function walkForAudiobooks(rootPath, rootId, ignoreCfg) {
  const results = [];
  const queue = [rootPath];

  while (queue.length > 0) {
    const dir = queue.shift();

    let dirEntries;
    try { dirEntries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }

    let hasAudioFiles = false;
    const subdirs = [];

    for (const e of dirEntries) {
      if (!e || !e.name) continue;
      const fullPath = path.join(dir, e.name);

      let isDir = false;
      try {
        if (e.isDirectory && e.isDirectory()) isDir = true;
        else if (e.isSymbolicLink && e.isSymbolicLink()) {
          const st = statSafe(fullPath);
          if (st && st.isDirectory()) isDir = true;
        }
      } catch {}

      if (isDir) {
        if (!shouldIgnorePath(fullPath, e.name, true, ignoreCfg)) {
          subdirs.push(fullPath);
        }
      } else if (e.isFile && e.isFile() && isAudioFile(e.name)) {
        hasAudioFiles = true;
      }
    }

    if (hasAudioFiles) {
      // This directory contains audio files — treat it as an audiobook
      results.push({ folderPath: dir, rootPath, rootId });
    }

    // Always recurse into subdirectories (even if this dir had audio files,
    // subdirs might contain other audiobooks)
    for (const sd of subdirs) {
      queue.push(sd);
    }
  }

  return results;
}

// Main scan pipeline
async function buildAudiobooksIndex() {
  const {
    audiobookRootFolders = [],
    indexPath,
    ignore = {},
  } = workerData || {};

  const ignoreCfg = makeIgnoreConfig(ignore);
  const roots = Array.isArray(audiobookRootFolders) ? audiobookRootFolders : [];

  // Phase 1: Discover all audiobook directories
  const candidates = [];
  for (let ri = 0; ri < roots.length; ri++) {
    const rootPath = roots[ri];
    const rootId = rootIdForPath(rootPath);

    parentPort.postMessage({
      type: 'progress',
      foldersDone: ri,
      foldersTotal: roots.length,
      currentFolder: path.basename(rootPath),
    });

    const found = walkForAudiobooks(rootPath, rootId, ignoreCfg);
    for (const c of found) candidates.push(c);
  }

  // Phase 2: Build audiobook records (with duration extraction)
  const audiobooks = [];

  for (let ci = 0; ci < candidates.length; ci++) {
    const { folderPath, rootPath, rootId } = candidates[ci];
    const scanned = scanFolder(folderPath);
    if (!scanned) continue;

    const { audioFiles, coverPath } = scanned;
    const id = audiobookIdForFolder(folderPath, audioFiles);
    const title = path.basename(folderPath) || folderPath;

    // Build chapter list with durations
    const chapters = [];
    let totalDuration = 0;

    for (const af of audioFiles) {
      const duration = await getDuration(af.path);
      totalDuration += duration;
      chapters.push({
        file: af.name,
        title: chapterTitleFromFile(af.name),
        path: af.path,
        size: af.size,
        duration: duration,
      });
    }

    totalDuration = Math.round(totalDuration * 100) / 100;

    audiobooks.push({
      id,
      title,
      path: folderPath,
      chapters,
      totalDuration,
      coverPath,
      rootPath,
      rootId,
    });
  }

  // Phase 3: Write index to disk
  const idx = { audiobooks };
  try {
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, JSON.stringify(idx, null, 2), 'utf-8');
  } catch {}

  parentPort.postMessage({ type: 'done', idx });
}

buildAudiobooksIndex().catch((err) => {
  try { parentPort.postMessage({ type: 'error', error: String(err && err.message || err) }); } catch {}
  process.exit(1);
});
