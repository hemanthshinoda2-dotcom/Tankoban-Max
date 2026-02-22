const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('PlayerBridge', {
  getLaunchArgs: function () {
    return ipcRenderer.invoke('get-launch-args');
  },
  openFileDialog: function () {
    return ipcRenderer.invoke('open-file-dialog');
  },
  minimize: function () {
    ipcRenderer.send('minimize-window');
  },
  toggleFullscreen: function () {
    ipcRenderer.send('toggle-fullscreen');
  },
  quit: function () {
    ipcRenderer.send('quit-app');
  },
  setTitle: function (title) {
    ipcRenderer.send('set-title', title);
  },
  listFolderVideos: function (folderPath) {
    return ipcRenderer.invoke('list-folder-videos', folderPath);
  },
  onFullscreenChange: function (callback) {
    ipcRenderer.on('fullscreen-changed', function (_event, isFullscreen) {
      callback(isFullscreen);
    });
  },
  loadSettings: function () {
    return ipcRenderer.invoke('load-player-settings');
  },
  saveSettings: function (settings) {
    return ipcRenderer.invoke('save-player-settings', settings);
  },
  saveScreenshot: function (dataUrl, suggestedName) {
    return ipcRenderer.invoke('save-screenshot', dataUrl, suggestedName);
  },
});
