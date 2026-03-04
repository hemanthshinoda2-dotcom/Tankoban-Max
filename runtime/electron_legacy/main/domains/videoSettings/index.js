/*
TankobanPlus — Video Settings Domain (Build 78A, Phase 4 Checkpoint A)

Handles video player settings persistence.
Extracted from Build 77 IPC registry lines 2288-2443 with ZERO behavior changes.
Includes Build 5.4D legacy migration logic.
*/

const fs = require('fs');

// ========== MODULE STATE ==========

/**
 * Tankoban Plus Build 1: video settings cache.
 * Lifted from Build 77 index.js line 2288.
 */
let videoSettingsMem = null;
let videoSettingsLoading = null;

/**
 * Normalize video settings structure.
 * Lifted from Build 77 index.js lines 2302-2308.
 */
function normalizeVideoSettings(raw) {
  if (raw && typeof raw === 'object') {
    if (raw.settings && typeof raw.settings === 'object') return raw;
    return { settings: { ...raw }, updatedAt: Date.now() };
  }
  return { settings: {}, updatedAt: 0 };
}

/**
 * Get cached video settings data, loading from disk if needed.
 * Includes Build 5.4D migration from legacy video_settings.json to video_prefs.json.
 * Lifted from Build 77 index.js lines 2310-2328.
 * BUILD 88 FIX 2: async to avoid blocking main process.
 */
async function getVideoSettingsMem(ctx) {
  if (videoSettingsMem) return videoSettingsMem;
  if (videoSettingsLoading) return videoSettingsLoading;
  videoSettingsLoading = (async () => {
    // Build 5.4D (mpv-only): migrate legacy video_settings.json -> video_prefs.json once, then remove the old file.
    const legacyPath = ctx.storage.dataPath('video_settings.json');
    const prefsPath = ctx.storage.dataPath('video_prefs.json');
    try {
      let prefsExists = false;
      try { await fs.promises.access(prefsPath); prefsExists = true; } catch {}
      if (!prefsExists) {
        let legacyExists = false;
        try { await fs.promises.access(legacyPath); legacyExists = true; } catch {}
        if (legacyExists) {
          const legacy = normalizeVideoSettings(await ctx.storage.readJSONAsync(legacyPath, {}));
          try { await ctx.storage.writeJSON(prefsPath, legacy); } catch {}
          try { await fs.promises.unlink(legacyPath); } catch {}
          videoSettingsMem = legacy;
          videoSettingsLoading = null;
          return videoSettingsMem;
        }
      }
    } catch {}

    videoSettingsMem = normalizeVideoSettings(await ctx.storage.readJSONAsync(prefsPath, {}));
    videoSettingsLoading = null;
    return videoSettingsMem;
  })();
  return videoSettingsLoading;
}

// ========== DOMAIN HANDLERS ==========

/**
 * Get video settings.
 * Lifted from Build 77 index.js lines 2423-2426.
 */
async function get(ctx) {
  const v = await getVideoSettingsMem(ctx);
  return { settings: { ...(v.settings || {}) }, updatedAt: v.updatedAt || 0 };
}

/**
 * Save video settings with merge.
 * Lifted from Build 77 index.js lines 2428-2436.
 */
async function save(ctx, _evt, settings) {
  const p = ctx.storage.dataPath('video_prefs.json');
  const v = await getVideoSettingsMem(ctx);
  const next = (settings && typeof settings === 'object') ? settings : {};
  v.settings = { ...(v.settings || {}), ...next };
  v.updatedAt = Date.now();
  await ctx.storage.writeJSON(p, v);
  return { ok: true, value: { settings: { ...(v.settings || {}) }, updatedAt: v.updatedAt } };
}

/**
 * Clear all video settings.
 * Lifted from Build 77 index.js lines 2438-2443.
 */
async function clear(ctx) {
  const p = ctx.storage.dataPath('video_prefs.json');
  videoSettingsMem = { settings: {}, updatedAt: Date.now() };
  await ctx.storage.writeJSON(p, videoSettingsMem);
  return { ok: true };
}

module.exports = {
  get,
  save,
  clear,
};
