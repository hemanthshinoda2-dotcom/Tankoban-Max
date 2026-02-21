// Preload namespace: library
module.exports = function({ ipcRenderer, CHANNEL, EVENT }) {
  return {
    library: {
      getState: () => ipcRenderer.invoke(CHANNEL.LIBRARY_GET_STATE),

      onUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.LIBRARY_UPDATED, (_evt, state) => cb(state));
      },

      onScanStatus: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.LIBRARY_SCAN_STATUS, (_evt, s) => cb(s));
      },

      scan: (opts) => ipcRenderer.invoke(CHANNEL.LIBRARY_SCAN, opts),
      cancelScan: () => ipcRenderer.invoke(CHANNEL.LIBRARY_CANCEL_SCAN),
      setScanIgnore: (patterns) => ipcRenderer.invoke(CHANNEL.LIBRARY_SET_SCAN_IGNORE, patterns),

      addRootFolder: () => ipcRenderer.invoke(CHANNEL.LIBRARY_ADD_ROOT_FOLDER),
      addSeriesFolder: () => ipcRenderer.invoke(CHANNEL.LIBRARY_ADD_SERIES_FOLDER),
      removeSeriesFolder: (folder) => ipcRenderer.invoke(CHANNEL.LIBRARY_REMOVE_SERIES_FOLDER, folder),
      removeRootFolder: (rootPath) => ipcRenderer.invoke(CHANNEL.LIBRARY_REMOVE_ROOT_FOLDER, rootPath),
      unignoreSeries: (folder) => ipcRenderer.invoke(CHANNEL.LIBRARY_UNIGNORE_SERIES, folder),
      clearIgnoredSeries: () => ipcRenderer.invoke(CHANNEL.LIBRARY_CLEAR_IGNORED_SERIES),

      openComicFileDialog: () => ipcRenderer.invoke(CHANNEL.COMIC_OPEN_FILE_DIALOG),
      bookFromPath: (filePath) => ipcRenderer.invoke(CHANNEL.COMIC_BOOK_FROM_PATH, filePath),

      onAppOpenFiles: (cb) => {
        if (typeof cb !== 'function') return () => {};
        const handler = (_evt, payload) => cb(payload);
        ipcRenderer.on(EVENT.APP_OPEN_FILES, handler);
        return () => ipcRenderer.removeListener(EVENT.APP_OPEN_FILES, handler);
      },
    },
  };
};
