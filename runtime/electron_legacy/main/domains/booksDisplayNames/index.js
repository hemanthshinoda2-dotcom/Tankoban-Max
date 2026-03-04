/*
Tankoban Max - Books Display Names Domain (RENAME-BOOK)
Stores custom display names in books_display_names.json keyed by bookId.
Shape: { [bookId]: "Custom Name" }
*/

var displayNamesMem = null;
var displayNamesLoading = null;

async function getMem(ctx) {
  if (displayNamesMem) return displayNamesMem;
  if (displayNamesLoading) return displayNamesLoading;
  displayNamesLoading = (async () => {
    var p = ctx.storage.dataPath('books_display_names.json');
    var raw = await ctx.storage.readJSONAsync(p, {});
    displayNamesMem = (raw && typeof raw === 'object') ? raw : {};
    displayNamesLoading = null;
    return displayNamesMem;
  })();
  return displayNamesLoading;
}

function persist(ctx) {
  var p = ctx.storage.dataPath('books_display_names.json');
  ctx.storage.writeJSONDebounced(p, displayNamesMem || {});
}

async function getAll(ctx) {
  return await getMem(ctx);
}

async function save(ctx, _evt, bookId, displayName) {
  var id = String(bookId || '');
  if (!id) return { ok: false };
  var name = String(displayName || '').trim();
  if (!name) return clear(ctx, _evt, bookId);
  var mem = await getMem(ctx);
  mem[id] = name;
  persist(ctx);
  return { ok: true };
}

async function clear(ctx, _evt, bookId) {
  var id = String(bookId || '');
  if (!id) return { ok: false };
  var mem = await getMem(ctx);
  delete mem[id];
  persist(ctx);
  return { ok: true };
}

async function pruneByRemovedIds(ctx, removedIds) {
  if (!Array.isArray(removedIds) || !removedIds.length) return;
  var mem = await getMem(ctx);
  var changed = false;
  for (var i = 0; i < removedIds.length; i++) {
    var k = String(removedIds[i] || '');
    if (k && Object.prototype.hasOwnProperty.call(mem, k)) {
      delete mem[k];
      changed = true;
    }
  }
  if (changed) persist(ctx);
}

module.exports = {
  getAll,
  save,
  clear,
  pruneByRemovedIds,
};
