// Preload namespaces: books, booksTtsEdge, booksOpds
module.exports = function({ ipcRenderer, CHANNEL, EVENT }) {
  return {
    books: {
      getState: () => ipcRenderer.invoke(CHANNEL.BOOKS_GET_STATE),

      onUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.BOOKS_UPDATED, (_evt, state) => cb(state));
      },

      onScanStatus: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.BOOKS_SCAN_STATUS, (_evt, s) => cb(s));
      },

      scan: (opts) => ipcRenderer.invoke(CHANNEL.BOOKS_SCAN, opts),
      cancelScan: () => ipcRenderer.invoke(CHANNEL.BOOKS_CANCEL_SCAN),
      setScanIgnore: (patterns) => ipcRenderer.invoke(CHANNEL.BOOKS_SET_SCAN_IGNORE, patterns),

      addRootFolder: () => ipcRenderer.invoke(CHANNEL.BOOKS_ADD_ROOT_FOLDER),
      removeRootFolder: (rootPath) => ipcRenderer.invoke(CHANNEL.BOOKS_REMOVE_ROOT_FOLDER, rootPath),
      addSeriesFolder: () => ipcRenderer.invoke(CHANNEL.BOOKS_ADD_SERIES_FOLDER),
      removeSeriesFolder: (folderPath) => ipcRenderer.invoke(CHANNEL.BOOKS_REMOVE_SERIES_FOLDER, folderPath),
      addFiles: () => ipcRenderer.invoke(CHANNEL.BOOKS_ADD_FILES),
      removeFile: (filePath) => ipcRenderer.invoke(CHANNEL.BOOKS_REMOVE_FILE, filePath),
      openFileDialog: () => ipcRenderer.invoke(CHANNEL.BOOKS_OPEN_FILE_DIALOG),
      bookFromPath: (filePath) => ipcRenderer.invoke(CHANNEL.BOOKS_BOOK_FROM_PATH, filePath),
    },

    booksTtsEdge: {
      probe: (payload) => ipcRenderer.invoke(CHANNEL.BOOKS_TTS_EDGE_PROBE, payload),
      getVoices: (opts) => ipcRenderer.invoke(CHANNEL.BOOKS_TTS_EDGE_GET_VOICES, opts),
      synth: (payload) => ipcRenderer.invoke(CHANNEL.BOOKS_TTS_EDGE_SYNTH, payload),
      warmup: (payload) => ipcRenderer.invoke(CHANNEL.BOOKS_TTS_EDGE_WARMUP, payload),
      resetInstance: () => ipcRenderer.invoke(CHANNEL.BOOKS_TTS_EDGE_RESET_INSTANCE),
      cacheClear: () => ipcRenderer.invoke(CHANNEL.BOOKS_TTS_EDGE_CACHE_CLEAR),
      cacheInfo: () => ipcRenderer.invoke(CHANNEL.BOOKS_TTS_EDGE_CACHE_INFO),
    },

    booksOpds: {
      getFeeds: function () { return ipcRenderer.invoke(CHANNEL.BOOKS_OPDS_GET_FEEDS); },
      addFeed: function (payload) { return ipcRenderer.invoke(CHANNEL.BOOKS_OPDS_ADD_FEED, payload); },
      updateFeed: function (payload) { return ipcRenderer.invoke(CHANNEL.BOOKS_OPDS_UPDATE_FEED, payload); },
      removeFeed: function (payload) { return ipcRenderer.invoke(CHANNEL.BOOKS_OPDS_REMOVE_FEED, payload); },
      fetchCatalog: function (payload) { return ipcRenderer.invoke(CHANNEL.BOOKS_OPDS_FETCH_CATALOG, payload); },
      onFeedsUpdated: function (cb) {
        if (typeof cb !== 'function') return function () {};
        var h = function (_event, data) { try { cb(data); } catch {} };
        ipcRenderer.on(EVENT.BOOKS_OPDS_FEEDS_UPDATED, h);
        return function () { try { ipcRenderer.removeListener(EVENT.BOOKS_OPDS_FEEDS_UPDATED, h); } catch {} };
      },
    },
  };
};
