// Preload namespace: progress
module.exports = function({ ipcRenderer, CHANNEL, EVENT }) {
  return {
    progress: {
      getAll: () => ipcRenderer.invoke(CHANNEL.PROGRESS_GET_ALL),
      get: (bookId) => ipcRenderer.invoke(CHANNEL.PROGRESS_GET, bookId),
      save: (bookId, progress) => ipcRenderer.invoke(CHANNEL.PROGRESS_SAVE, bookId, progress),
      clear: (bookId) => ipcRenderer.invoke(CHANNEL.PROGRESS_CLEAR, bookId),
      clearAll: () => ipcRenderer.invoke(CHANNEL.PROGRESS_CLEAR_ALL),
    },
  };
};
