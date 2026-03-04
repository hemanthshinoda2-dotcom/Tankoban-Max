// Preload namespace: seriesSettings
module.exports = function({ ipcRenderer, CHANNEL, EVENT }) {
  return {
    seriesSettings: {
      get: (seriesId) => ipcRenderer.invoke(CHANNEL.SERIES_SETTINGS_GET, seriesId),
      save: (seriesId, settings) => ipcRenderer.invoke(CHANNEL.SERIES_SETTINGS_SAVE, seriesId, settings),
      clear: (seriesId) => ipcRenderer.invoke(CHANNEL.SERIES_SETTINGS_CLEAR, seriesId),
    },
  };
};
