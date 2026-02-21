// Preload namespaces: player, build14, mpv, libmpv
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
        const channel = EVENT.mpvPlayerEvent(pid);
        const fn = (_evt, payload) => {
          try { handler(payload); } catch {}
        };
        ipcRenderer.on(channel, fn);
        return () => {
          try { ipcRenderer.removeListener(channel, fn); } catch {}
        };
      },

      probe: async (filePath) => invoke(CHANNEL.MPV_PROBE, String(filePath || '')),
    },

    libmpv: {
      probe: async () => invoke(CHANNEL.LIBMPV_PROBE),
      create: async () => invoke(CHANNEL.LIBMPV_CREATE),
      createRenderless: async () => invoke(CHANNEL.LIBMPV_CREATE_RENDERLESS),
      destroy: async (handleId) => invoke(CHANNEL.LIBMPV_DESTROY, String(handleId || '')),
      command: async (handleId, args) => invoke(CHANNEL.LIBMPV_COMMAND, String(handleId || ''), args || []),
      setPropertyString: async (handleId, name, value) => invoke(CHANNEL.LIBMPV_SET_PROPERTY_STRING, String(handleId || ''), String(name || ''), String(value || '')),
      getPropertyString: async (handleId, name) => invoke(CHANNEL.LIBMPV_GET_PROPERTY_STRING, String(handleId || ''), String(name || '')),
      renderCreateContext: async (handleId) => invoke(CHANNEL.LIBMPV_RENDER_CREATE_CONTEXT, String(handleId || '')),
      renderFreeContext: async (handleId) => invoke(CHANNEL.LIBMPV_RENDER_FREE_CONTEXT, String(handleId || '')),
      renderFrameRGBA: async (handleId, width, height) => invoke(CHANNEL.LIBMPV_RENDER_FRAME_RGBA, String(handleId || ''), Number(width || 0), Number(height || 0)),
      renderAttachSharedBuffer: async (handleId, sharedBuffer, width, height) => invoke(CHANNEL.LIBMPV_RENDER_ATTACH_SHARED_BUFFER, String(handleId || ''), sharedBuffer, Number(width || 0), Number(height || 0)),

      renderDetachSharedBuffer: async (handleId) => {
        try {
          const res = await ipcRenderer.invoke(CHANNEL.LIBMPV_RENDER_DETACH_SHARED_BUFFER, String(handleId || ''));
          return (res && typeof res === 'object') ? res : { ok: true };
        } catch (e) {
          return { ok: false, error: String(e && e.message ? e.message : e) };
        }
      },

      renderToSharedBuffer: async (handleId) => invoke(CHANNEL.LIBMPV_RENDER_TO_SHARED_BUFFER, String(handleId || '')),
      renderEnableUpdateEvents: async (handleId) => invoke(CHANNEL.LIBMPV_RENDER_ENABLE_UPDATE_EVENTS, String(handleId || '')),
      renderDisableUpdateEvents: async (handleId) => invoke(CHANNEL.LIBMPV_RENDER_DISABLE_UPDATE_EVENTS, String(handleId || '')),

      onRenderUpdate: (handleId, handler) => {
        if (typeof handler !== 'function') return () => {};
        const hid = String(handleId || '');
        const channel = EVENT.libmpvRenderUpdate(hid);
        const fn = (_evt, payload) => {
          try { handler(payload); } catch {}
        };
        ipcRenderer.on(channel, fn);
        return () => {
          try { ipcRenderer.removeListener(channel, fn); } catch {}
        };
      },

      createEmbedded: async (bounds) => invoke(CHANNEL.LIBMPV_CREATE_EMBEDDED, bounds || {}),
      setBounds: async (handleId, bounds) => invoke(CHANNEL.LIBMPV_SET_BOUNDS, String(handleId || ''), bounds || {}),
      setVisible: async (handleId, visible) => invoke(CHANNEL.LIBMPV_SET_VISIBLE, String(handleId || ''), !!visible),
    },
  };
};
