// Preload namespaces: webSources, webTabs
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
    },

    webTabs: {
      create: (opts) => ipcRenderer.invoke(CHANNEL.WEB_TAB_CREATE, opts),
      close: (opts) => ipcRenderer.invoke(CHANNEL.WEB_TAB_CLOSE, opts),
      activate: (opts) => ipcRenderer.invoke(CHANNEL.WEB_TAB_ACTIVATE, opts),
      navigate: (opts) => ipcRenderer.invoke(CHANNEL.WEB_TAB_NAVIGATE, opts),
      setBounds: (opts) => ipcRenderer.invoke(CHANNEL.WEB_TAB_BOUNDS, opts),
      hideAll: () => ipcRenderer.invoke(CHANNEL.WEB_TAB_HIDE_ALL),
      query: (opts) => ipcRenderer.invoke(CHANNEL.WEB_TAB_QUERY, opts),
      splitBounds: (opts) => ipcRenderer.invoke(CHANNEL.WEB_TAB_SPLIT_BOUNDS, opts),
      onTitleUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_TAB_TITLE_UPDATED, (_evt, data) => cb(data));
      },
      onUrlUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_TAB_URL_UPDATED, (_evt, data) => cb(data));
      },
      onLoading: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_TAB_LOADING, (_evt, data) => cb(data));
      },
      onNavState: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.WEB_TAB_NAV_STATE, (_evt, data) => cb(data));
      },
    },
  };
};
