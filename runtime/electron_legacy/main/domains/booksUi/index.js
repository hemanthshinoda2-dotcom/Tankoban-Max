/*
Tankoban Max - Books UI State Domain
*/

let booksUiStateMem = null;
let booksUiStateLoading = null;

function normalizeBooksUiState(raw) {
  if (raw && typeof raw === 'object') {
    if (raw.ui && typeof raw.ui === 'object') return raw;
    return { ui: { ...raw }, updatedAt: Date.now() };
  }
  return { ui: {}, updatedAt: 0 };
}

async function getBooksUiStateMem(ctx) {
  if (booksUiStateMem) return booksUiStateMem;
  if (booksUiStateLoading) return booksUiStateLoading;
  booksUiStateLoading = (async () => {
    const p = ctx.storage.dataPath('books_ui_state.json');
    booksUiStateMem = normalizeBooksUiState(await ctx.storage.readJSONAsync(p, {}));
    booksUiStateLoading = null;
    return booksUiStateMem;
  })();
  return booksUiStateLoading;
}

async function get(ctx) {
  const v = await getBooksUiStateMem(ctx);
  return { ui: { ...(v.ui || {}) }, updatedAt: v.updatedAt || 0 };
}

async function save(ctx, _evt, ui) {
  const p = ctx.storage.dataPath('books_ui_state.json');
  const v = await getBooksUiStateMem(ctx);
  const next = (ui && typeof ui === 'object') ? ui : {};
  v.ui = { ...(v.ui || {}), ...next };
  v.updatedAt = Date.now();
  ctx.storage.writeJSONDebounced(p, v);
  return { ok: true, value: { ui: { ...(v.ui || {}) }, updatedAt: v.updatedAt } };
}

async function clear(ctx) {
  const p = ctx.storage.dataPath('books_ui_state.json');
  booksUiStateMem = { ui: {}, updatedAt: Date.now() };
  ctx.storage.writeJSONDebounced(p, booksUiStateMem);
  return { ok: true };
}

module.exports = {
  get,
  save,
  clear,
};
