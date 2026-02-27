/*
Tankoban Max - Video Display Names Domain (RENAME-VIDEO)
Stores custom display names in video_display_names.json keyed by showId.
Shape: { [showId]: "Custom Name" }
*/

var displayNamesMem = null;
var displayNamesLoading = null;

async function getMem(ctx) {
  if (displayNamesMem) return displayNamesMem;
  if (displayNamesLoading) return displayNamesLoading;
  displayNamesLoading = (async () => {
    var p = ctx.storage.dataPath('video_display_names.json');
    var raw = await ctx.storage.readJSONAsync(p, {});
    displayNamesMem = (raw && typeof raw === 'object') ? raw : {};
    displayNamesLoading = null;
    return displayNamesMem;
  })();
  return displayNamesLoading;
}

function persist(ctx) {
  var p = ctx.storage.dataPath('video_display_names.json');
  ctx.storage.writeJSONDebounced(p, displayNamesMem || {});
}

async function getAll(ctx) {
  return await getMem(ctx);
}

async function save(ctx, _evt, showId, displayName) {
  var id = String(showId || '');
  if (!id) return { ok: false };
  var name = String(displayName || '').trim();
  if (!name) return clear(ctx, _evt, showId);
  var mem = await getMem(ctx);
  mem[id] = name;
  persist(ctx);
  return { ok: true };
}

async function clear(ctx, _evt, showId) {
  var id = String(showId || '');
  if (!id) return { ok: false };
  var mem = await getMem(ctx);
  delete mem[id];
  persist(ctx);
  return { ok: true };
}

module.exports = {
  getAll,
  save,
  clear,
};
