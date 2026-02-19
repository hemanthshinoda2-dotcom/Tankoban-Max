// LISTEN_P4: Books TTS Progress domain — per-book listening position persistence
// Data file: books_tts_progress.json
// Schema: { byBook: { [bookId]: { blockIdx, blockCount, title, format, updatedAt } } }

let _mem = null; // in-memory cache


function normPath(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase();
}

function canonId(bookId) {
  const raw = String(bookId || '');
  const canon = normPath(raw);
  return { raw, canon };
}

function getEntryByEither(mem, raw, canon) {
  const byBook = (mem && typeof mem.byBook === 'object') ? mem.byBook : {};
  if (raw && byBook[raw]) return { key: raw, value: byBook[raw] };
  if (canon && byBook[canon]) return { key: canon, value: byBook[canon] };
  return null;
}

function migrateKeyIfNeeded(ctx, mem, raw, canon) {
  try {
    if (!raw || !canon || raw === canon) return;
    if (mem.byBook && mem.byBook[raw] && !mem.byBook[canon]) {
      mem.byBook[canon] = mem.byBook[raw];
      delete mem.byBook[raw];
      ctx.storage.writeJSONDebounced(dataPath(ctx), { byBook: mem.byBook });
    }
  } catch {}
}

function dataPath(ctx) {
  return ctx.storage.dataPath('books_tts_progress.json');
}

function getMem(ctx) {
  if (_mem) return _mem;
  const raw = ctx.storage.readJSON(dataPath(ctx), { byBook: {} });
  _mem = (raw && typeof raw.byBook === 'object') ? raw : { byBook: {} };
  // FIX-TTS-PROG-NORM: one-time canonicalize keys for lookup + continue shelf
  try {
    var byBook = _mem.byBook || {};
    for (var k in byBook) {
      if (!Object.prototype.hasOwnProperty.call(byBook, k)) continue;
      var canon = normPath(k);
      if (canon && canon !== k && !byBook[canon]) {
        byBook[canon] = byBook[k];
        delete byBook[k];
      }
    }
  } catch {}
  // FIX-TTS-PROG-NORM

  if (!_mem.byBook || typeof _mem.byBook !== 'object') _mem.byBook = {};
  return _mem;
}

function flush(ctx) {
  ctx.storage.writeJSONDebounced(dataPath(ctx), _mem);
}

async function getAll(ctx) {
  const mem = getMem(ctx);
  return { byBook: { ...mem.byBook } };
}

async function get(ctx, _evt, bookId) {
  const ids = canonId(bookId);
  const id = ids.canon || ids.raw;
  if (!id) return null;
  const mem = getMem(ctx);
  migrateKeyIfNeeded(ctx, mem, ids.raw, ids.canon);
  const rec = getEntryByEither(mem, ids.raw, ids.canon);
  return rec ? { ...rec.value } : null;
}

async function save(ctx, _evt, bookId, entry) {
  const ids = canonId(bookId);
  const id = ids.canon || ids.raw;
  if (!id) return { ok: false, error: 'invalid_book_id' };
  const e = (entry && typeof entry === 'object') ? entry : {};
  const mem = getMem(ctx);
  migrateKeyIfNeeded(ctx, mem, ids.raw, ids.canon);
  const prev = (mem.byBook[id] && typeof mem.byBook[id] === 'object') ? mem.byBook[id] : {};
  mem.byBook[id] = { ...prev, ...e, updatedAt: Date.now() };
  flush(ctx);
  return { ok: true };
}

async function clear(ctx, _evt, bookId) {
  const ids = canonId(bookId);
  const id = ids.canon || ids.raw;
  if (!id) return { ok: false, error: 'invalid_book_id' };
  const mem = getMem(ctx);
  migrateKeyIfNeeded(ctx, mem, ids.raw, ids.canon);
  delete mem.byBook[id];
  flush(ctx);
  return { ok: true };
}

module.exports = { getAll, get, save, clear };
