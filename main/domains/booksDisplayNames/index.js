/*
Tankoban Max - Books Display Names Domain (RENAME-BOOK)
Stores custom display names in books_display_names.json keyed by bookId.
Shape: { [bookId]: "Custom Name" }
*/

var displayNamesMem = null;

function getMem(ctx) {
  if (displayNamesMem) return displayNamesMem;
  var p = ctx.storage.dataPath('books_display_names.json');
  var raw = ctx.storage.readJSON(p, {});
  displayNamesMem = (raw && typeof raw === 'object') ? raw : {};
  return displayNamesMem;
}

function persist(ctx) {
  var p = ctx.storage.dataPath('books_display_names.json');
  ctx.storage.writeJSONDebounced(p, displayNamesMem || {});
}

async function getAll(ctx) {
  return getMem(ctx);
}

async function save(ctx, _evt, bookId, displayName) {
  var id = String(bookId || '');
  if (!id) return { ok: false };
  var name = String(displayName || '').trim();
  if (!name) return clear(ctx, _evt, bookId);
  var mem = getMem(ctx);
  mem[id] = name;
  persist(ctx);
  return { ok: true };
}

async function clear(ctx, _evt, bookId) {
  var id = String(bookId || '');
  if (!id) return { ok: false };
  var mem = getMem(ctx);
  delete mem[id];
  persist(ctx);
  return { ok: true };
}

module.exports = {
  getAll,
  save,
  clear,
};
