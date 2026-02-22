/*
Tankoban Max - Books Annotations Domain (BUILD_ANNOT)
Stores annotations in books_annotations.json keyed by bookId.
Shape: { id, bookId, cfi, color, style, note, selectedText, chapter, createdAt, updatedAt }
*/

let annotationsMem = null;

function getAnnotationsMem(ctx) {
  if (annotationsMem) return annotationsMem;
  const p = ctx.storage.dataPath('books_annotations.json');
  const raw = ctx.storage.readJSON(p, {});
  annotationsMem = (raw && typeof raw === 'object') ? raw : {};
  return annotationsMem;
}

function persist(ctx) {
  const p = ctx.storage.dataPath('books_annotations.json');
  ctx.storage.writeJSONDebounced(p, annotationsMem || {});
}

async function get(ctx, _evt, bookId) {
  const id = String(bookId || '');
  if (!id) return [];
  const mem = getAnnotationsMem(ctx);
  const arr = Array.isArray(mem[id]) ? mem[id] : [];
  return arr;
}

async function save(ctx, _evt, bookId, annotation) {
  const id = String(bookId || '');
  if (!id) return { ok: false };
  const ann = (annotation && typeof annotation === 'object') ? annotation : {};
  if (!ann.id) ann.id = `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  ann.bookId = id;
  ann.updatedAt = Date.now();
  if (!ann.createdAt) ann.createdAt = ann.updatedAt;

  const mem = getAnnotationsMem(ctx);
  if (!Array.isArray(mem[id])) mem[id] = [];

  const idx = mem[id].findIndex(x => x && x.id === ann.id);
  if (idx >= 0) {
    mem[id][idx] = { ...mem[id][idx], ...ann };
  } else {
    mem[id].push(ann);
  }

  persist(ctx);
  return { ok: true, annotation: ann };
}

async function del(ctx, _evt, bookId, annotationId) {
  const id = String(bookId || '');
  const annId = String(annotationId || '');
  if (!id || !annId) return { ok: false };

  const mem = getAnnotationsMem(ctx);
  if (!Array.isArray(mem[id])) return { ok: true };

  mem[id] = mem[id].filter(x => x && x.id !== annId);
  if (!mem[id].length) delete mem[id];

  persist(ctx);
  return { ok: true };
}

async function clear(ctx, _evt, bookId) {
  const id = String(bookId || '');
  if (!id) return { ok: false };

  const mem = getAnnotationsMem(ctx);
  delete mem[id];
  persist(ctx);
  return { ok: true };
}

function pruneByRemovedIds(ctx, removedIds) {
  if (!Array.isArray(removedIds) || !removedIds.length) return;
  const mem = getAnnotationsMem(ctx);
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
