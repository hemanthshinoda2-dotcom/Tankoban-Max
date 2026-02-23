// Preload namespaces: webSources, webHistory, webBrowserSettings, webTorrent
module.exports = function({ ipcRenderer, CHANNEL, EVENT }) {
  return {
    webSources: {
      get: () => ipcRenderer.invoke(CHANNEL.WEB_SOURCES_GET),
      add: (payload) => ipcRenderer.invoke(CHANNEL.WEB_SOURCES_ADD, payload),
      remove: (id) => ipcRenderer.invoke(CHANNEL.WEB_SOURCES_REMOVE, id),
      update: (payload) => ipcRenderer.invoke(CHANNEL.WEB_SOURCES_UPDATE, payload),
      routeDownload: (payload) => ipcRenderer.invoke(CHANNEL.WEB_DOWNLOAD_ROUTE, payload),
      getDestinations: () => ipcRenderer.invoke(CHANNEL.WEB_DOWNLOAD_DESTINATIONS),
      downloadFromUrl: (payload) => ipcRenderer.invoke(CHANNEL.WEB_DOWNLOAD_DIRECT_URL, payload),
      getDownloadHistory: () => ipcRenderer.invoke(CHANNEL.WEB_DOWNLOAD_HISTORY_GET),
      clearDownloadHistory: () => ipcRenderer.invoke(CHANNEL.WEB_DOWNLOAD_HISTORY_CLEAR),
      removeDownloadHistory: (payload) => ipcRenderer.invoke(CHANNEL.WEB_DOWNLOAD_HISTORY_REMOVE, payload),
      pauseDownload: (payload) => ipcRenderer.invoke(CHANNEL.WEB_DOWNLOAD_PAUSE, payload),
      resumeDownload: (payload) => ipcRenderer.invoke(CHANNEL.WEB_DOWNLOAD_RESUME, payload),
      cancelDownload: (payload) => ipcRenderer.invoke(CHANNEL.WEB_DOWNLOAD_CANCEL, payload),
      pickDestinationFolder: (payload) => ipcRenderer.invoke(CHANNEL.WEB_DOWNLOAD_PICK_FOLDER, payload),
      listDestinationFolders: (payload) => ipcRenderer.invoke(CHANNEL.WEB_DOWNLOAD_PICKER_LIST_FOLDERS, payload),
      resolveDestinationPicker: (payload) => ipcRenderer.invoke(CHANNEL.WEB_DOWNLOAD_PICKER_RESOLVE, payload),
      pickSaveFolder: (payload) => ipcRenderer.invoke(CHANNEL.WEB_PICK_SAVE_FOLDER, payload),
      onUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_SOURCES_UPDATED, (_evt, data) => cb(data));
      },
      onDownloadStarted: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_DOWNLOAD_STARTED, (_evt, data) => cb(data));
      },
      onDownloadProgress: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_DOWNLOAD_PROGRESS, (_evt, data) => cb(data));
      },
      onDownloadCompleted: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_DOWNLOAD_COMPLETED, (_evt, data) => cb(data));
      },
      onDownloadsUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_DOWNLOADS_UPDATED, (_evt, data) => cb(data));
      },
      onPopupOpen: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_POPUP_OPEN, (_evt, data) => cb(data));
      },
      onDestinationPickerRequest: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_DOWNLOAD_PICKER_REQUEST, (_evt, data) => cb(data));
      },
    },

    webBrowserSettings: {
      get: () => ipcRenderer.invoke(CHANNEL.WEB_BROWSER_SETTINGS_GET),
      save: (payload) => ipcRenderer.invoke(CHANNEL.WEB_BROWSER_SETTINGS_SAVE, payload),
    },

    webHistory: {
      list: (payload) => ipcRenderer.invoke(CHANNEL.WEB_HISTORY_LIST, payload),
      add: (payload) => ipcRenderer.invoke(CHANNEL.WEB_HISTORY_ADD, payload),
      clear: (payload) => ipcRenderer.invoke(CHANNEL.WEB_HISTORY_CLEAR, payload),
      remove: (payload) => ipcRenderer.invoke(CHANNEL.WEB_HISTORY_REMOVE, payload),
      onUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_HISTORY_UPDATED, (_evt, data) => cb(data));
      },
    },

    webSession: {
      get: () => ipcRenderer.invoke(CHANNEL.WEB_SESSION_GET),
      save: (payload) => ipcRenderer.invoke(CHANNEL.WEB_SESSION_SAVE, payload),
      clear: () => ipcRenderer.invoke(CHANNEL.WEB_SESSION_CLEAR),
      onUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_SESSION_UPDATED, (_evt, data) => cb(data));
      },
    },

    webBookmarks: {
      list: () => ipcRenderer.invoke(CHANNEL.WEB_BOOKMARKS_LIST),
      add: (payload) => ipcRenderer.invoke(CHANNEL.WEB_BOOKMARKS_ADD, payload),
      update: (payload) => ipcRenderer.invoke(CHANNEL.WEB_BOOKMARKS_UPDATE, payload),
      remove: (payload) => ipcRenderer.invoke(CHANNEL.WEB_BOOKMARKS_REMOVE, payload),
      toggle: (payload) => ipcRenderer.invoke(CHANNEL.WEB_BOOKMARKS_TOGGLE, payload),
      onUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_BOOKMARKS_UPDATED, (_evt, data) => cb(data));
      },
    },

    webData: {
      clear: (payload) => ipcRenderer.invoke(CHANNEL.WEB_CLEAR_BROWSING_DATA, payload),
      usage: () => ipcRenderer.invoke(CHANNEL.WEB_BROWSING_DATA_USAGE),
    },

    webPermissions: {
      list: () => ipcRenderer.invoke(CHANNEL.WEB_PERMISSIONS_LIST),
      set: (payload) => ipcRenderer.invoke(CHANNEL.WEB_PERMISSIONS_SET, payload),
      reset: (payload) => ipcRenderer.invoke(CHANNEL.WEB_PERMISSIONS_RESET, payload),
      onUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_PERMISSIONS_UPDATED, (_evt, data) => cb(data));
      },
    },

    webAdblock: {
      get: () => ipcRenderer.invoke(CHANNEL.WEB_ADBLOCK_GET),
      setEnabled: (payload) => ipcRenderer.invoke(CHANNEL.WEB_ADBLOCK_SET_ENABLED, payload),
      updateLists: () => ipcRenderer.invoke(CHANNEL.WEB_ADBLOCK_UPDATE_LISTS),
      stats: () => ipcRenderer.invoke(CHANNEL.WEB_ADBLOCK_STATS),
      onUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_ADBLOCK_UPDATED, (_evt, data) => cb(data));
      },
    },

    webFind: {
      inPage: (payload) => ipcRenderer.invoke(CHANNEL.WEB_FIND_IN_PAGE, payload),
      onResult: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_FIND_RESULT, (_evt, data) => cb(data));
      },
    },

    webTorrent: {
      startMagnet: (payload) => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_START_MAGNET, payload),
      startTorrentUrl: (payload) => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_START_TORRENT_URL, payload),
      pause: (payload) => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_PAUSE, payload),
      resume: (payload) => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_RESUME, payload),
      cancel: (payload) => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_CANCEL, payload),
      getActive: () => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_GET_ACTIVE),
      getHistory: () => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_GET_HISTORY),
      clearHistory: () => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_CLEAR_HISTORY),
      removeHistory: (payload) => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_REMOVE_HISTORY, payload),
      selectFiles: (payload) => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_SELECT_FILES, payload),
      setDestination: (payload) => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_SET_DESTINATION, payload),
      streamFile: (payload) => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_STREAM_FILE, payload),
      onStarted: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_TORRENT_STARTED, (_evt, data) => cb(data));
      },
      onProgress: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_TORRENT_PROGRESS, (_evt, data) => cb(data));
      },
      onCompleted: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_TORRENT_COMPLETED, (_evt, data) => cb(data));
      },
      onUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_TORRENTS_UPDATED, (_evt, data) => cb(data));
      },
      onMetadata: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_TORRENT_METADATA, (_evt, data) => cb(data));
      },
      onStreamReady: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_TORRENT_STREAM_READY, (_evt, data) => cb(data));
      },
    },
  };
};
