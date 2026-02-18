// LISTEN_P4: Books TTS Progress domain — per-book listening position persistence
// Data file: books_tts_progress.json
// Schema: { byBook: { [bookId]: { blockIdx, blockCount, title, format, updatedAt } } }

let _mem = null; // in-memory cache

function dataPath(ctx) {
  return ctx.storage.dataPath('books_tts_progress.json');
}

function getMem(ctx) {
  if (_mem) return _mem;
  const raw = ctx.storage.readJSON(dataPath(ctx), { byBook: {} });
  _mem = (raw && typeof raw.byBook === 'object') ? raw : { byBook: {} };
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
  const id = String(bookId || '');
  if (!id) return null;
  const mem = getMem(ctx);
  return mem.byBook[id] ? { ...mem.byBook[id] } : null;
}

async function save(ctx, _evt, bookId, entry) {
  const id = String(bookId || '');
  if (!id) return { ok: false, error: 'invalid_book_id' };
  const e = (entry && typeof entry === 'object') ? entry : {};
  const mem = getMem(ctx);
  const prev = (mem.byBook[id] && typeof mem.byBook[id] === 'object') ? mem.byBook[id] : {};
  mem.byBook[id] = { ...prev, ...e, updatedAt: Date.now() };
  flush(ctx);
  return { ok: true };
}

async function clear(ctx, _evt, bookId) {
  const id = String(bookId || '');
  if (!id) return { ok: false, error: 'invalid_book_id' };
  const mem = getMem(ctx);
  delete mem.byBook[id];
  flush(ctx);
  return { ok: true };
}

module.exports = { getAll, get, save, clear };
