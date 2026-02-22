/*
Tankoban Max - Audiobook Progress Domain (FEAT-AUDIOBOOK)
CRUD for audiobook_progress.json, keyed by audiobook ID.
Same pattern as booksProgress/index.js.
*/

let progressMem = null;

function getProgressMem(ctx) {
  if (progressMem) return progressMem;
  progressMem = ctx.storage.readJSON(ctx.storage.dataPath('audiobook_progress.json'), {});
  return progressMem;
}

async function getAll(ctx) {
  const all = getProgressMem(ctx);
  return { ...all };
}

async function get(ctx, _evt, abId) {
  const id = String(abId || '');
  if (!id) return null;
  const all = getProgressMem(ctx);
  return all[id] || null;
}

async function save(ctx, _evt, abId, progress) {
  const id = String(abId || '');
  if (!id) return { ok: false, error: 'invalid_id' };

  const p = ctx.storage.dataPath('audiobook_progress.json');
  const all = getProgressMem(ctx);
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
  const all = getProgressMem(ctx);
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
