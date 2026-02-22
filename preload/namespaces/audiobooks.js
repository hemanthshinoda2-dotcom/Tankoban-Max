// Preload namespace: audiobooks, audiobookProgress, audiobookPairing (FEAT-AUDIOBOOK)
module.exports = function({ ipcRenderer, CHANNEL, EVENT }) {
  return {
    audiobooks: {
      getState: () => ipcRenderer.invoke(CHANNEL.AUDIOBOOK_GET_STATE),

      onUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.AUDIOBOOK_UPDATED, (_evt, state) => cb(state));
      },

      onScanStatus: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.AUDIOBOOK_SCAN_STATUS, (_evt, s) => cb(s));
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
