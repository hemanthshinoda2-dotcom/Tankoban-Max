// Preload namespace: holyGrail

let __frameHandler = null;
let __sharedTextureReceiverBound = false;

function bindSharedTextureReceiver() {
  if (__sharedTextureReceiverBound) return;
  __sharedTextureReceiverBound = true;

  try {
    const { sharedTexture } = require('electron');
    if (!sharedTexture || typeof sharedTexture.setSharedTextureReceiver !== 'function') return;

    sharedTexture.setSharedTextureReceiver(({ importedSharedTexture }) => {
      let videoFrame = null;
      try {
        videoFrame = importedSharedTexture.getVideoFrame();
      } catch {}

      try {
        if (videoFrame && typeof __frameHandler === 'function') __frameHandler(videoFrame);
        else if (videoFrame && typeof videoFrame.close === 'function') videoFrame.close();
      } catch {
        try { if (videoFrame && typeof videoFrame.close === 'function') videoFrame.close(); } catch {}
      } finally {
        try { importedSharedTexture.release(); } catch {}
      }
    });
  } catch {}
}

module.exports = function({ ipcRenderer, CHANNEL, EVENT }) {
  bindSharedTextureReceiver();

  const invoke = async (channel, ...args) => {
    try {
      const res = await ipcRenderer.invoke(channel, ...args);
      return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  };

  const onEvent = (channel, handler) => {
    if (typeof handler !== 'function') return () => {};
    const fn = (_evt, payload) => {
      try { handler(payload); } catch {}
    };
    ipcRenderer.on(channel, fn);
    return () => {
      try { ipcRenderer.removeListener(channel, fn); } catch {}
    };
  };

  return {
    holyGrail: {
      probe: () => invoke(CHANNEL.HG_PROBE),
      initGpu: (opts) => invoke(CHANNEL.HG_INIT, (opts && typeof opts === 'object') ? opts : {}),
      resizeSurface: (opts) => invoke(CHANNEL.HG_RESIZE, (opts && typeof opts === 'object') ? opts : {}),
      loadFile: (filePath) => invoke(CHANNEL.HG_LOAD, String(filePath || '')),
      startFrameLoop: () => invoke(CHANNEL.HG_START_FRAME_LOOP),
      stopFrameLoop: () => invoke(CHANNEL.HG_STOP_FRAME_LOOP),
      command: (args) => invoke(CHANNEL.HG_COMMAND, Array.isArray(args) ? args : []),
      getProperty: (name) => invoke(CHANNEL.HG_GET_PROPERTY, String(name || '')),
      setProperty: (name, value) => invoke(CHANNEL.HG_SET_PROPERTY, String(name || ''), value),
      getState: () => invoke(CHANNEL.HG_GET_STATE),
      getTrackList: () => invoke(CHANNEL.HG_GET_TRACK_LIST),
      observeProperty: (name) => invoke(CHANNEL.HG_OBSERVE_PROPERTY, String(name || '')),
      destroy: () => invoke(CHANNEL.HG_DESTROY),
      setPresentationActive: (active) => invoke(CHANNEL.HG_SET_PRESENTATION_ACTIVE, !!active),
      getDiagnostics: () => invoke(CHANNEL.HG_GET_DIAGNOSTICS),
      setDiagnosticsEnabled: (enabled) => invoke(CHANNEL.HG_SET_DIAGNOSTICS_ENABLED, !!enabled),
      resetDiagnostics: () => invoke(CHANNEL.HG_RESET_DIAGNOSTICS),

      onPropertyChange: (handler) => onEvent(EVENT.HG_PROPERTY_CHANGE, handler),
      onEof: (handler) => onEvent(EVENT.HG_EOF, handler),
      onFileLoaded: (handler) => onEvent(EVENT.HG_FILE_LOADED, handler),
      onDiagnostics: (handler) => onEvent(EVENT.HG_DIAGNOSTICS, handler),

      onVideoFrame: (handler) => {
        __frameHandler = (typeof handler === 'function') ? handler : null;
        return () => {
          if (__frameHandler === handler) __frameHandler = null;
        };
      },
    },
  };
};

