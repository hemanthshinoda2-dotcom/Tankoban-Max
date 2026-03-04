// Preload namespaces: video, videoProgress, videoSettings,
//   videoDisplayNames, videoUi, videoPoster
module.exports = function({ ipcRenderer, CHANNEL, EVENT }) {
  return {
    video: {
      getState: (opts) => ipcRenderer.invoke(CHANNEL.VIDEO_GET_STATE, opts),

      onUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.VIDEO_UPDATED, (_evt, state) => cb(state));
      },

      onShellPlay: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.VIDEO_SHELL_PLAY, (_evt, payload) => cb(payload));
      },

      onScanStatus: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.VIDEO_SCAN_STATUS, (_evt, s) => cb(s));
      },

      scan: (opts) => ipcRenderer.invoke(CHANNEL.VIDEO_SCAN, opts),
      scanShow: (showPath) => ipcRenderer.invoke(CHANNEL.VIDEO_SCAN_SHOW, showPath),
      generateShowThumbnail: (showId, opts) => ipcRenderer.invoke(CHANNEL.VIDEO_GENERATE_SHOW_THUMBNAIL, showId, opts),
      cancelScan: () => ipcRenderer.invoke(CHANNEL.VIDEO_CANCEL_SCAN),
      addFolder: () => ipcRenderer.invoke(CHANNEL.VIDEO_ADD_FOLDER),
      addShowFolder: () => ipcRenderer.invoke(CHANNEL.VIDEO_ADD_SHOW_FOLDER),
      addShowFolderPath: (folderPath) => ipcRenderer.invoke(CHANNEL.VIDEO_ADD_SHOW_FOLDER_PATH, folderPath),
      removeFolder: (folderPath) => ipcRenderer.invoke(CHANNEL.VIDEO_REMOVE_FOLDER, folderPath),
      removeStreamableFolder: (payload) => ipcRenderer.invoke(CHANNEL.VIDEO_REMOVE_STREAMABLE_FOLDER, payload),
      hideShow: (showId) => ipcRenderer.invoke(CHANNEL.VIDEO_HIDE_SHOW, showId),
      openFileDialog: () => ipcRenderer.invoke(CHANNEL.VIDEO_OPEN_FILE_DIALOG),
      openSubtitleFileDialog: () => ipcRenderer.invoke(CHANNEL.VIDEO_OPEN_SUBTITLE_FILE_DIALOG),
      addFiles: () => ipcRenderer.invoke(CHANNEL.VIDEO_ADD_FILES),
      removeFile: (filePath) => ipcRenderer.invoke(CHANNEL.VIDEO_REMOVE_FILE, filePath),
      restoreAllHiddenShows: () => ipcRenderer.invoke(CHANNEL.VIDEO_RESTORE_ALL_HIDDEN_SHOWS),
      restoreHiddenShowsForRoot: (rootId) => ipcRenderer.invoke(CHANNEL.VIDEO_RESTORE_HIDDEN_SHOWS_FOR_ROOT, rootId),
      getEpisodesForShow: (showId) => ipcRenderer.invoke(CHANNEL.VIDEO_GET_EPISODES_FOR_SHOW, showId),
      getEpisodesForRoot: (rootId) => ipcRenderer.invoke(CHANNEL.VIDEO_GET_EPISODES_FOR_ROOT, rootId),
      getEpisodesByIds: (ids) => ipcRenderer.invoke(CHANNEL.VIDEO_GET_EPISODES_BY_IDS, ids),
    },

    videoProgress: {
      getAll: () => ipcRenderer.invoke(CHANNEL.VIDEO_PROGRESS_GET_ALL),
      get: (videoId) => ipcRenderer.invoke(CHANNEL.VIDEO_PROGRESS_GET, videoId),
      save: (videoId, progress) => ipcRenderer.invoke(CHANNEL.VIDEO_PROGRESS_SAVE, videoId, progress),
      clear: (videoId) => ipcRenderer.invoke(CHANNEL.VIDEO_PROGRESS_CLEAR, videoId),
      clearAll: () => ipcRenderer.invoke(CHANNEL.VIDEO_PROGRESS_CLEAR_ALL),
      onUpdated: (cb) => {
        if (typeof cb !== 'function') return;
        ipcRenderer.on(EVENT.VIDEO_PROGRESS_UPDATED, (_evt, payload) => cb(payload));
      },
    },

    videoSettings: {
      get: () => ipcRenderer.invoke(CHANNEL.VIDEO_SETTINGS_GET),
      save: (settings) => ipcRenderer.invoke(CHANNEL.VIDEO_SETTINGS_SAVE, settings),
      clear: () => ipcRenderer.invoke(CHANNEL.VIDEO_SETTINGS_CLEAR),
    },

    videoDisplayNames: {
      getAll: () => ipcRenderer.invoke(CHANNEL.VIDEO_DISPLAY_NAMES_GET_ALL),
      save: (showId, name) => ipcRenderer.invoke(CHANNEL.VIDEO_DISPLAY_NAMES_SAVE, showId, name),
      clear: (showId) => ipcRenderer.invoke(CHANNEL.VIDEO_DISPLAY_NAMES_CLEAR, showId),
    },

    videoUi: {
      getState: () => ipcRenderer.invoke(CHANNEL.VIDEO_UI_GET),
      saveState: (ui) => ipcRenderer.invoke(CHANNEL.VIDEO_UI_SAVE, ui),
      clearState: () => ipcRenderer.invoke(CHANNEL.VIDEO_UI_CLEAR),
    },

    videoPoster: {
      get: (showId) => ipcRenderer.invoke(CHANNEL.VIDEO_POSTER_GET, showId),
      has: (showId) => ipcRenderer.invoke(CHANNEL.VIDEO_POSTER_HAS, showId),
      save: (showId, dataUrl) => ipcRenderer.invoke(CHANNEL.VIDEO_POSTER_SAVE, showId, dataUrl),
      delete: (showId) => ipcRenderer.invoke(CHANNEL.VIDEO_POSTER_DELETE, showId),
      paste: (showId) => ipcRenderer.invoke(CHANNEL.VIDEO_POSTER_PASTE, showId),
    },
  };
};
