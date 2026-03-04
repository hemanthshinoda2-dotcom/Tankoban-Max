/*
Tankoban Max - Audiobook Progress Domain (FEAT-AUDIOBOOK)
CRUD for audiobook_progress.json, keyed by audiobook ID.
Same pattern as booksProgress/index.js.
*/

let progressMem = null;
let progressLoading = null;

async function getProgressMem(ctx) {
  if (progressMem) return progressMem;
  if (progressLoading) return progressLoading;
  progressLoading = (async () => {
    progressMem = await ctx.storage.readJSONAsync(ctx.storage.dataPath('audiobook_progress.json'), {});
    progressLoading = null;
    return progressMem;
  })();
  return progressLoading;
}

async function getAll(ctx) {
  const all = await getProgressMem(ctx);
  return { ...all };
}

async function get(ctx, _evt, abId) {
  const id = String(abId || '');
  if (!id) return null;
  const all = await getProgressMem(ctx);
  return all[id] || null;
}

async function save(ctx, _evt, abId, progress) {
  const id = String(abId || '');
  if (!id) return { ok: false, error: 'invalid_id' };

  const p = ctx.storage.dataPath('audiobook_progress.json');
  const all = await getProgressMem(ctx);
  const prev = (all[id] && typeof all[id] === 'object') ? all[id] : {};
  const next = (progress && typeof progress === 'object') ? progress : {};
  all[id] = { ...prev, ...next, updatedAt: Date.now() };
  ctx.storage.writeJSONDebounced(p, all);
  return { ok: true };
}

async function clear(ctx, _evt, abId) {
  const id = String(abId || '');
  if (!id) return { ok: false, error: 'invalid_id' };

  const p = ctx.storage.dataPath('audiobook_progress.json');
  const all = await getProgressMem(ctx);
  delete all[id];
  ctx.storage.writeJSONDebounced(p, all);
  return { ok: true };
}

module.exports = {
  getAll,
  get,
  save,
  clear,
};
