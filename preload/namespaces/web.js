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
      resolvePrompt: (payload) => ipcRenderer.invoke(CHANNEL.WEB_PERMISSIONS_PROMPT_RESOLVE, payload),
      onUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_PERMISSIONS_UPDATED, (_evt, data) => cb(data));
      },
      onPrompt: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_PERMISSION_PROMPT, (_evt, data) => cb(data));
      },
    },

    webUserscripts: {
      get: () => ipcRenderer.invoke(CHANNEL.WEB_USERSCRIPTS_GET),
      setEnabled: (payload) => ipcRenderer.invoke(CHANNEL.WEB_USERSCRIPTS_SET_ENABLED, payload),
      upsert: (payload) => ipcRenderer.invoke(CHANNEL.WEB_USERSCRIPTS_UPSERT, payload),
      remove: (payload) => ipcRenderer.invoke(CHANNEL.WEB_USERSCRIPTS_REMOVE, payload),
      setRuleEnabled: (payload) => ipcRenderer.invoke(CHANNEL.WEB_USERSCRIPTS_SET_RULE_ENABLED, payload),
      onUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_USERSCRIPTS_UPDATED, (_evt, data) => cb(data));
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
      addToVideoLibrary: (payload) => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_ADD_TO_VIDEO_LIBRARY, payload),
      // FEAT-BROWSER: New torrent capabilities from Aspect browser
      remove: (payload) => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_REMOVE, payload),
      pauseAll: () => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_PAUSE_ALL),
      resumeAll: () => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_RESUME_ALL),
      getPeers: (payload) => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_GET_PEERS, payload),
      getDhtNodes: () => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_GET_DHT_NODES),
      selectSaveFolder: () => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_SELECT_SAVE_FOLDER),
      resolveMetadata: (payload) => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_RESOLVE_METADATA, payload),
      startConfigured: (payload) => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_START_CONFIGURED, payload),
      cancelResolve: (payload) => ipcRenderer.invoke(CHANNEL.WEB_TORRENT_CANCEL_RESOLVE, payload),
      openFolder: (payload) => ipcRenderer.send(CHANNEL.WEB_TORRENT_OPEN_FOLDER, payload),
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
      onMagnetDetected: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_MAGNET_DETECTED, (_evt, data) => cb(data));
      },
      onTorrentFileDetected: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_TORRENT_FILE_DETECTED, (_evt, data) => cb(data));
      },
    },

    // FEAT-TOR: Tor proxy
    torProxy: {
      start: () => ipcRenderer.invoke(CHANNEL.TOR_PROXY_START),
      stop: () => ipcRenderer.invoke(CHANNEL.TOR_PROXY_STOP),
      getStatus: () => ipcRenderer.invoke(CHANNEL.TOR_PROXY_GET_STATUS),
      onStatusChanged: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.TOR_PROXY_STATUS_CHANGED, (_evt, data) => cb(data));
      },
    },

    // FEAT-BROWSER: Search history / omnibox suggestions
    webSearch: {
      suggest: (input) => ipcRenderer.invoke(CHANNEL.WEB_SEARCH_SUGGEST, input),
      add: (query) => ipcRenderer.send(CHANNEL.WEB_SEARCH_ADD, query),
    },

    // FEAT-BROWSER: Browser utility actions
    webBrowserActions: {
      ctxAction: (payload) => ipcRenderer.send(CHANNEL.WEB_CTX_ACTION, payload),
      printPdf: (payload) => ipcRenderer.invoke(CHANNEL.WEB_PRINT_PDF, payload),
      capturePage: (payload) => ipcRenderer.invoke(CHANNEL.WEB_CAPTURE_PAGE, payload),
      downloadOpenFile: (payload) => ipcRenderer.send(CHANNEL.WEB_DOWNLOAD_OPEN_FILE, payload),
      downloadShowInFolder: (payload) => ipcRenderer.send(CHANNEL.WEB_DOWNLOAD_SHOW_IN_FOLDER, payload),
      onContextMenu: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_CTX_MENU, (_evt, data) => cb(data));
      },
      onCreateTab: (cb) => {
        if (typeof cb !== 'function') return;
        var lastKey = '';
        var lastAt = 0;
        var forward = (_evt, data) => {
          var d = (data && typeof data === 'object') ? data : {};
          var key = String(d.url || '') + '|' + String(d.disposition || '');
          var now = Date.now();
          if (key && key === lastKey && (now - lastAt) < 80) return;
          lastKey = key;
          lastAt = now;
          cb(d);
        };
        ipcRenderer.on(EVENT.WEB_CREATE_TAB, forward);
        // Backward compatibility: main may still emit WEB_POPUP_OPEN.
        ipcRenderer.on(EVENT.WEB_POPUP_OPEN, forward);
      },
    },
  };
};
