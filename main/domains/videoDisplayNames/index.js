/*
Tankoban Max - Video Display Names Domain (RENAME-VIDEO)
Stores custom display names in video_display_names.json keyed by showId.
Shape: { [showId]: "Custom Name" }
*/

var displayNamesMem = null;

function getMem(ctx) {
  if (displayNamesMem) return displayNamesMem;
  var p = ctx.storage.dataPath('video_display_names.json');
  var raw = ctx.storage.readJSON(p, {});
  displayNamesMem = (raw && typeof raw === 'object') ? raw : {};
  return displayNamesMem;
}

function persist(ctx) {
  var p = ctx.storage.dataPath('video_display_names.json');
  ctx.storage.writeJSONDebounced(p, displayNamesMem || {});
}

async function getAll(ctx) {
  return getMem(ctx);
}

async function save(ctx, _evt, showId, displayName) {
  var id = String(showId || '');
  if (!id) return { ok: false };
  var name = String(displayName || '').trim();
  if (!name) return clear(ctx, _evt, showId);
  var mem = getMem(ctx);
  mem[id] = name;
  persist(ctx);
  return { ok: true };
}

async function clear(ctx, _evt, showId) {
  var id = String(showId || '');
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
