/*
TankobanPlus — Progress Domain (Build 78A, Phase 4 Checkpoint A)

Handles comic book reading progress persistence.
Extracted from Build 77 IPC registry lines 2284-2386 with ZERO behavior changes.
*/

// ========== MODULE STATE ==========

/**
 * BUILD16B_MEM_CACHE: Avoid sync disk reads + JSON parse on every progress IPC call.
 * Lifted from Build 77 index.js line 2284.
 */
let progressMem = null;
let progressLoading = null;

/**
 * Get cached progress data, loading from disk if needed.
 * Lifted from Build 77 index.js lines 2290-2294.
 * BUILD 88 FIX 2: async to avoid blocking main process.
 */
async function getProgressMem(ctx) {
  if (progressMem) return progressMem;
  if (progressLoading) return progressLoading;
  progressLoading = (async () => {
    progressMem = await ctx.storage.readJSONAsync(ctx.storage.dataPath('progress.json'), {});
    progressLoading = null;
    return progressMem;
  })();
  return progressLoading;
}

// ========== DOMAIN HANDLERS ==========

/**
 * Get all comic progress.
 * Lifted from Build 77 index.js lines 2353-2356.
 */
async function getAll(ctx) {
  const all = await getProgressMem(ctx);
  return { ...all }; // defensive copy
}

/**
 * Get progress for a specific book.
 * Lifted from Build 77 index.js lines 2358-2361.
 */
async function get(ctx, _evt, bookId) {
  const all = await getProgressMem(ctx);
  return all[bookId] || null;
}

/**
 * Save progress for a book.
 * Lifted from Build 77 index.js lines 2363-2369.
 */
async function save(ctx, _evt, bookId, progress) {
  const p = ctx.storage.dataPath('progress.json');
  const all = await getProgressMem(ctx);
  all[bookId] = { ...progress, updatedAt: Date.now() };
  ctx.storage.writeJSONDebounced(p, all);
  return { ok: true };
}

/**
 * Clear progress for a book.
 * Lifted from Build 77 index.js lines 2371-2377.
 */
async function clear(ctx, _evt, bookId) {
  const p = ctx.storage.dataPath('progress.json');
  const all = await getProgressMem(ctx);
  delete all[bookId];
  ctx.storage.writeJSONDebounced(p, all);
  return { ok: true };
}

/**
 * Clear all comic progress.
 * Lifted from Build 77 index.js lines 2379-2385.
 */
async function clearAll(ctx) {
  const p = ctx.storage.dataPath('progress.json');
  const all = await getProgressMem(ctx);
  for (const k of Object.keys(all)) delete all[k];
  ctx.storage.writeJSONDebounced(p, all);
  return { ok: true };
}

module.exports = {
  getAll,
  get,
  save,
  clear,
  clearAll,
  // Internal accessor for library domain's progress pruning
  _getProgressMem: getProgressMem,
};
