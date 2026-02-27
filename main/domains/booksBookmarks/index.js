/*
Tankoban Max - Books Bookmarks Domain (WAVE3)
Stores bookmarks in books_bookmarks.json keyed by bookId.
*/

let bookmarksMem = null;
let bookmarksLoading = null;

async function getBookmarksMem(ctx) {
  if (bookmarksMem) return bookmarksMem;
  if (bookmarksLoading) return bookmarksLoading;
  bookmarksLoading = (async () => {
    const p = ctx.storage.dataPath('books_bookmarks.json');
    const raw = await ctx.storage.readJSONAsync(p, {});
    bookmarksMem = (raw && typeof raw === 'object') ? raw : {};
    bookmarksLoading = null;
    return bookmarksMem;
  })();
  return bookmarksLoading;
}

function persist(ctx) {
  const p = ctx.storage.dataPath('books_bookmarks.json');
  ctx.storage.writeJSONDebounced(p, bookmarksMem || {});
}

async function get(ctx, _evt, bookId) {
  const id = String(bookId || '');
  if (!id) return [];
  const mem = await getBookmarksMem(ctx);
  const arr = Array.isArray(mem[id]) ? mem[id] : [];
  return arr;
}

async function save(ctx, _evt, bookId, bookmark) {
  const id = String(bookId || '');
  if (!id) return { ok: false };
  const bm = (bookmark && typeof bookmark === 'object') ? bookmark : {};
  if (!bm.id) bm.id = `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  bm.bookId = id;
  bm.updatedAt = Date.now();
  if (!bm.createdAt) bm.createdAt = bm.updatedAt;

  const mem = await getBookmarksMem(ctx);
  if (!Array.isArray(mem[id])) mem[id] = [];

  const idx = mem[id].findIndex(x => x && x.id === bm.id);
  if (idx >= 0) {
    mem[id][idx] = { ...mem[id][idx], ...bm };
  } else {
    mem[id].push(bm);
  }

  persist(ctx);
  return { ok: true, bookmark: bm };
}

async function del(ctx, _evt, bookId, bookmarkId) {
  const id = String(bookId || '');
  const bmId = String(bookmarkId || '');
  if (!id || !bmId) return { ok: false };

  const mem = await getBookmarksMem(ctx);
  if (!Array.isArray(mem[id])) return { ok: true };

  mem[id] = mem[id].filter(x => x && x.id !== bmId);
  if (!mem[id].length) delete mem[id];

  persist(ctx);
  return { ok: true };
}

async function clear(ctx, _evt, bookId) {
  const id = String(bookId || '');
  if (!id) return { ok: false };

  const mem = await getBookmarksMem(ctx);
  delete mem[id];
  persist(ctx);
  return { ok: true };
}

async function pruneByRemovedIds(ctx, removedIds) {
  if (!Array.isArray(removedIds) || !removedIds.length) return;
  const mem = await getBookmarksMem(ctx);
  let changed = false;
  for (const id of removedIds) {
    const k = String(id || '');
    if (k && Object.prototype.hasOwnProperty.call(mem, k)) {
      delete mem[k];
      changed = true;
    }
  }
  if (changed) persist(ctx);
}

module.exports = {
  get,
  save,
  delete: del,
  clear,
  pruneByRemovedIds,
};
