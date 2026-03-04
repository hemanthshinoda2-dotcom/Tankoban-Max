/*
Tankoban Max - Audiobook Chapter Pairing Domain (FEAT-AUDIOBOOK)
CRUD for audiobook_pairings.json, keyed by bookId.
Stores manual chapter mappings between book chapters and audiobook chapter files.
*/

let pairingsMem = null;
let pairingsLoading = null;

async function getPairingsMem(ctx) {
  if (pairingsMem) return pairingsMem;
  if (pairingsLoading) return pairingsLoading;
  pairingsLoading = (async () => {
    pairingsMem = await ctx.storage.readJSONAsync(ctx.storage.dataPath('audiobook_pairings.json'), {});
    pairingsLoading = null;
    return pairingsMem;
  })();
  return pairingsLoading;
}

async function getAll(ctx) {
  const all = await getPairingsMem(ctx);
  return { ...all };
}

async function get(ctx, _evt, bookId) {
  const id = String(bookId || '');
  if (!id) return null;
  const all = await getPairingsMem(ctx);
  return all[id] || null;
}

async function save(ctx, _evt, bookId, pairing) {
  const id = String(bookId || '');
  if (!id) return { ok: false, error: 'invalid_book_id' };

  const p = ctx.storage.dataPath('audiobook_pairings.json');
  const all = await getPairingsMem(ctx);
  const data = (pairing && typeof pairing === 'object') ? pairing : {};
  all[id] = { ...data, updatedAt: Date.now() };
  ctx.storage.writeJSONDebounced(p, all);
  return { ok: true };
}

async function remove(ctx, _evt, bookId) {
  const id = String(bookId || '');
  if (!id) return { ok: false, error: 'invalid_book_id' };

  const p = ctx.storage.dataPath('audiobook_pairings.json');
  const all = await getPairingsMem(ctx);
  delete all[id];
  ctx.storage.writeJSONDebounced(p, all);
  return { ok: true };
}

module.exports = {
  getAll,
  get,
  save,
  remove,
};
