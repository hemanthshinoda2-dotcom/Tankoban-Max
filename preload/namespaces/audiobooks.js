// Preload namespace: audiobooks, audiobookProgress, audiobookPairing (FEAT-AUDIOBOOK)
module.exports = function({ ipcRenderer, CHANNEL, EVENT }) {
  return {
    audiobooks: {
      getState: () => ipcRenderer.invoke(CHANNEL.AUDIOBOOK_GET_STATE),

      onUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        const handler = (_evt, state) => {
          try {
            if (cb.length >= 2) cb(_evt, state);
            else cb(state);
          } catch (_) {}
        };
        ipcRenderer.on(EVENT.AUDIOBOOK_UPDATED, handler);
        return () => {
          try { ipcRenderer.removeListener(EVENT.AUDIOBOOK_UPDATED, handler); } catch (_) {}
        };
      },

      onScanStatus: (cb) => {
        if (typeof cb !== 'function') return;
        const handler = (_evt, s) => {
          try {
            if (cb.length >= 2) cb(_evt, s);
            else cb(s);
          } catch (_) {}
        };
        ipcRenderer.on(EVENT.AUDIOBOOK_SCAN_STATUS, handler);
        return () => {
          try { ipcRenderer.removeListener(EVENT.AUDIOBOOK_SCAN_STATUS, handler); } catch (_) {}
        };
      },

      scan: () => ipcRenderer.invoke(CHANNEL.AUDIOBOOK_SCAN),
      addRootFolder: () => ipcRenderer.invoke(CHANNEL.AUDIOBOOK_ADD_ROOT_FOLDER),
      removeRootFolder: (rootPath) => ipcRenderer.invoke(CHANNEL.AUDIOBOOK_REMOVE_ROOT_FOLDER, rootPath),

      // Progress
      getProgressAll: () => ipcRenderer.invoke(CHANNEL.AUDIOBOOK_PROGRESS_GET_ALL),
      getProgress: (abId) => ipcRenderer.invoke(CHANNEL.AUDIOBOOK_PROGRESS_GET, abId),
      saveProgress: (abId, progress) => ipcRenderer.invoke(CHANNEL.AUDIOBOOK_PROGRESS_SAVE, abId, progress),
      clearProgress: (abId) => ipcRenderer.invoke(CHANNEL.AUDIOBOOK_PROGRESS_CLEAR, abId),

      // Chapter pairing
      getPairing: (bookId) => ipcRenderer.invoke(CHANNEL.AUDIOBOOK_PAIRING_GET, bookId),
      savePairing: (bookId, pairing) => ipcRenderer.invoke(CHANNEL.AUDIOBOOK_PAIRING_SAVE, bookId, pairing),
      deletePairing: (bookId) => ipcRenderer.invoke(CHANNEL.AUDIOBOOK_PAIRING_DELETE, bookId),
      getPairingAll: () => ipcRenderer.invoke(CHANNEL.AUDIOBOOK_PAIRING_GET_ALL),
    },
  };
};
