/*
TankobanPlus — Files Domain (Build 78D, Phase 4 Checkpoint D)

Lifted from Build 78C IPC registry with ZERO behavior changes.
*/

const fs = require('fs');
const path = require('path');

async function read(ctx, _evt, filePath) {
  const buf = await fs.promises.readFile(filePath);
  // Transferable ArrayBuffer (renderer-side)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const VIDEO_EXTS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.ts', '.m2ts',
  '.flv', '.wmv', '.mpg', '.mpeg', '.ogv', '.3gp',
]);

async function listFolderVideos(ctx, _evt, folderPath) {
  try {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (entry.isFile() && VIDEO_EXTS.has(path.extname(entry.name).toLowerCase())) {
        files.push(path.join(folderPath, entry.name));
      }
    }
    return files;
  } catch {
    return [];
  }
}

module.exports = { read, listFolderVideos };
