// Preload namespaces: player, build14, mpv
module.exports = function({ ipcRenderer, CHANNEL, EVENT }) {

  // Shared helper for async IPC with error wrapping
  const invoke = async (channel, ...args) => {
    try {
      const res = await ipcRenderer.invoke(channel, ...args);
      return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  };

  return {
    player: {
      start: async (mediaRef, opts) => invoke(CHANNEL.PLAYER_START, mediaRef || null, (opts && typeof opts === 'object') ? opts : null),
      play: async () => invoke(CHANNEL.PLAYER_PLAY),
      pause: async () => invoke(CHANNEL.PLAYER_PAUSE),
      seek: async (secondsOrMs) => invoke(CHANNEL.PLAYER_SEEK, secondsOrMs),
      stop: async (reason) => invoke(CHANNEL.PLAYER_STOP, reason == null ? '' : String(reason)),
      launchQt: async (args) => invoke(CHANNEL.PLAYER_LAUNCH_QT, (args && typeof args === 'object') ? args : null),
      getState: async () => invoke(CHANNEL.PLAYER_GET_STATE),
    },

    build14: {
      saveReturnState: async (stateData) => invoke(CHANNEL.BUILD14_SAVE_RETURN_STATE, stateData || null),
      getReturnState: async () => invoke(CHANNEL.BUILD14_GET_RETURN_STATE),
      clearReturnState: async () => invoke(CHANNEL.BUILD14_CLEAR_RETURN_STATE),
    },

    mpv: {
      isAvailable: async (opts) => {
        const detailed = !!(opts && typeof opts === 'object' && opts.detailed);
        try {
          const res = await ipcRenderer.invoke(CHANNEL.MPV_IS_AVAILABLE);
          if (detailed) {
            return (res && typeof res === 'object')
              ? res
              : { ok: true, available: false, error: 'Invalid response', path: null, source: null };
          }
          return !!(res && res.ok && res.available);
        } catch (e) {
          if (detailed) {
            return { ok: true, available: false, error: String(e && e.message ? e.message : e), path: null, source: null };
          }
          return false;
        }
      },

      create: async () => invoke(CHANNEL.MPV_CREATE),
      destroy: async (playerId) => invoke(CHANNEL.MPV_DESTROY, String(playerId || '')),
      load: async (playerId, filePath) => invoke(CHANNEL.MPV_LOAD, String(playerId || ''), String(filePath || '')),
      command: async (playerId, args) => invoke(CHANNEL.MPV_COMMAND, String(playerId || ''), args || []),
      setProperty: async (playerId, name, value) => invoke(CHANNEL.MPV_SET_PROPERTY, String(playerId || ''), String(name || ''), value),
      observeProperty: async (playerId, name) => invoke(CHANNEL.MPV_OBSERVE_PROPERTY, String(playerId || ''), String(name || '')),

      onEvent: (playerId, handler) => {
        if (typeof handler !== 'function') return () => {};
        const pid = String(playerId || '');
        const channel = EVENT.mpvEvent(pid);
        const fn = (_evt, payload) => {
          try { handler(payload); } catch {}
        };
        ipcRenderer.on(channel, fn);
        return () => {
          try { ipcRenderer.removeListener(channel, fn); } catch {}
        };
      },

      probe: async () => invoke(CHANNEL.MPV_IS_AVAILABLE),
    },
  };
};
