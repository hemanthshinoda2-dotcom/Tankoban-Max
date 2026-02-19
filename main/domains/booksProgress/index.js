/*
Tankoban Max - Books Progress Domain
*/

let booksProgressMem = null;

function normPath(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase();
}


function canonId(bookId) {
  const raw = String(bookId || '');
  const canon = normPath(raw);
  return { raw, canon };
}

function getRecordByEither(all, raw, canon) {
  if (!all || typeof all !== 'object') return null;
  if (raw && all[raw]) return { key: raw, value: all[raw] };
  if (canon && all[canon]) return { key: canon, value: all[canon] };
  return null;
}

function migrateKeyIfNeeded(ctx, all, raw, canon) {
  try {
    if (!raw || !canon || raw === canon) return;
    if (all[raw] && !all[canon]) {
      all[canon] = all[raw];
      delete all[raw];
      ctx.storage.writeJSONDebounced(ctx.storage.dataPath('books_progress.json'), all);
    }
  } catch {}
}

function getBooksProgressMem(ctx) {
  if (booksProgressMem) return booksProgressMem;
  booksProgressMem = ctx.storage.readJSON(ctx.storage.dataPath('books_progress.json'), {});
  // FIX-BOOK-PROG-NORM: one-time canonicalize keys
  try {
    const all = booksProgressMem;
    for (const k of Object.keys(all)) {
      const canon = normPath(k);
      if (canon && canon !== k && !all[canon]) {
        all[canon] = all[k];
        delete all[k];
      }
    }
  } catch {}
  // FIX-BOOK-PROG-NORM

  return booksProgressMem;
}

function mergeProgressRecords(a, b) {
  const pa = (a && typeof a === 'object') ? a : {};
  const pb = (b && typeof b === 'object') ? b : {};
  const keepB = Number(pb.updatedAt || 0) >= Number(pa.updatedAt || 0);
  const newer = keepB ? pb : pa;
  const older = keepB ? pa : pb;
  return {
    ...older,
    ...newer,
    bookMeta: {
      ...((older && older.bookMeta) || {}),
      ...((newer && newer.bookMeta) || {}),
    },
  };
}

function maybeMigrateByPath(ctx) {
  const stampPath = ctx.storage.dataPath('books_progress_migrations.json');
  const stamp = ctx.storage.readJSON(stampPath, {});
  if (stamp && stamp.booksProgressByPathV1) return;

  const idxPath = ctx.storage.dataPath('books_library_index.json');
  const idx = ctx.storage.readJSON(idxPath, { books: [] });
  const books = Array.isArray(idx && idx.books) ? idx.books : [];
  if (!books.length) return;

  const pathToId = new Map();
  for (const b of books) {
    const id = String(b && b.id || '').trim();
    const p = normPath(b && b.path);
    if (!id || !p) continue;
    pathToId.set(p, id);
  }
  if (!pathToId.size) return;

  const all = getBooksProgressMem(ctx);
  let changed = false;

  for (const [oldId, rec] of Object.entries({ ...all })) {
    const r = (rec && typeof rec === 'object') ? rec : null;
    const metaPath = normPath(r && r.bookMeta && r.bookMeta.path);
    if (!metaPath) continue;

    const targetId = pathToId.get(metaPath);
    if (!targetId || targetId === oldId) continue;

    const merged = mergeProgressRecords(all[targetId], r);
    all[targetId] = merged;
    delete all[oldId];
    changed = true;
  }

  if (changed) {
    ctx.storage.writeJSONDebounced(ctx.storage.dataPath('books_progress.json'), all, 30);
  }

  const nextStamp = {
    ...(stamp && typeof stamp === 'object' ? stamp : {}),
    booksProgressByPathV1: Date.now(),
  };
  ctx.storage.writeJSONDebounced(stampPath, nextStamp, 30);
}

async function getAll(ctx) {
  maybeMigrateByPath(ctx);
  const all = getBooksProgressMem(ctx);
  return { ...all };
}

async function get(ctx, _evt, bookId) {
  maybeMigrateByPath(ctx);
  const all = getBooksProgressMem(ctx);
  const ids = canonId(bookId);
  migrateKeyIfNeeded(ctx, all, ids.raw, ids.canon);
  const rec = getRecordByEither(all, ids.raw, ids.canon);
  return rec ? rec.value : null;
}

async function save(ctx, _evt, bookId, progress) {
  maybeMigrateByPath(ctx);
  const ids = canonId(bookId);
  const id = ids.canon || ids.raw;
  if (!id) return { ok: false, error: 'invalid_book_id' };

  const p = ctx.storage.dataPath('books_progress.json');
  const all = getBooksProgressMem(ctx);
  migrateKeyIfNeeded(ctx, all, ids.raw, ids.canon);
  const prev = (all[id] && typeof all[id] === 'object') ? all[id] : {};
  const next = (progress && typeof progress === 'object') ? progress : {};
  all[id] = { ...prev, ...next, updatedAt: Date.now() };
  ctx.storage.writeJSONDebounced(p, all);
  return { ok: true, value: all[id] };
}

async function clear(ctx, _evt, bookId) {
  maybeMigrateByPath(ctx);
  const ids = canonId(bookId);
  const id = ids.canon || ids.raw;
  if (!id) return { ok: false, error: 'invalid_book_id' };

  const p = ctx.storage.dataPath('books_progress.json');
  const all = getBooksProgressMem(ctx);
  migrateKeyIfNeeded(ctx, all, ids.raw, ids.canon);
  delete all[id];
  ctx.storage.writeJSONDebounced(p, all);
  return { ok: true };
}

async function clearAll(ctx) {
  maybeMigrateByPath(ctx);
  const p = ctx.storage.dataPath('books_progress.json');
  const all = getBooksProgressMem(ctx);
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
  _getBooksProgressMem: getBooksProgressMem,
};
