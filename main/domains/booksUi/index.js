/*
Tankoban Max - Books UI State Domain
*/

let booksUiStateMem = null;

function normalizeBooksUiState(raw) {
  if (raw && typeof raw === 'object') {
    if (raw.ui && typeof raw.ui === 'object') return raw;
    return { ui: { ...raw }, updatedAt: Date.now() };
  }
  return { ui: {}, updatedAt: 0 };
}

function getBooksUiStateMem(ctx) {
  if (booksUiStateMem) return booksUiStateMem;
  const p = ctx.storage.dataPath('books_ui_state.json');
  booksUiStateMem = normalizeBooksUiState(ctx.storage.readJSON(p, {}));
  return booksUiStateMem;
}

async function get(ctx) {
  const v = getBooksUiStateMem(ctx);
  return { ui: { ...(v.ui || {}) }, updatedAt: v.updatedAt || 0 };
}

async function save(ctx, _evt, ui) {
  const p = ctx.storage.dataPath('books_ui_state.json');
  const v = getBooksUiStateMem(ctx);
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
