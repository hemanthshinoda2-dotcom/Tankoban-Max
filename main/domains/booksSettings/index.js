/*
Tankoban Max - Books Reader Settings Domain
*/

let booksSettingsMem = null;
let booksSettingsLoading = null;

function normalizeBooksSettings(raw) {
  if (raw && typeof raw === 'object') {
    if (raw.settings && typeof raw.settings === 'object') return raw;
    return { settings: { ...raw }, updatedAt: Date.now() };
  }
  return { settings: {}, updatedAt: 0 };
}

async function getBooksSettingsMem(ctx) {
  if (booksSettingsMem) return booksSettingsMem;
  if (booksSettingsLoading) return booksSettingsLoading;
  booksSettingsLoading = (async () => {
    const p = ctx.storage.dataPath('books_reader_settings.json');
    booksSettingsMem = normalizeBooksSettings(await ctx.storage.readJSONAsync(p, {}));
    booksSettingsLoading = null;
    return booksSettingsMem;
  })();
  return booksSettingsLoading;
}

async function get(ctx) {
  const v = await getBooksSettingsMem(ctx);
  return { settings: { ...(v.settings || {}) }, updatedAt: v.updatedAt || 0 };
}

async function save(ctx, _evt, settings) {
  const p = ctx.storage.dataPath('books_reader_settings.json');
  const v = await getBooksSettingsMem(ctx);
  const next = (settings && typeof settings === 'object') ? settings : {};
  v.settings = { ...(v.settings || {}), ...next };
  v.updatedAt = Date.now();
  ctx.storage.writeJSONDebounced(p, v);
  return { ok: true, value: { settings: { ...(v.settings || {}) }, updatedAt: v.updatedAt } };
}

async function clear(ctx) {
  const p = ctx.storage.dataPath('books_reader_settings.json');
  booksSettingsMem = { settings: {}, updatedAt: Date.now() };
  ctx.storage.writeJSONDebounced(p, booksSettingsMem);
  return { ok: true };
}

module.exports = {
  get,
  save,
  clear,
};
