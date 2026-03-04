// Preload namespace: window
module.exports = function({ ipcRenderer, CHANNEL, EVENT }) {
  return {
    window: {
      isFullscreen: () => ipcRenderer.invoke(CHANNEL.WINDOW_IS_FULLSCREEN),
      isMaximized: () => ipcRenderer.invoke(CHANNEL.WINDOW_IS_MAXIMIZED),
      toggleFullscreen: () => ipcRenderer.invoke(CHANNEL.WINDOW_TOGGLE_FULLSCREEN),
      toggleMaximize: () => ipcRenderer.invoke(CHANNEL.WINDOW_TOGGLE_MAXIMIZE),
      setFullscreen: (v) => ipcRenderer.invoke(CHANNEL.WINDOW_SET_FULLSCREEN, v),
      isAlwaysOnTop: () => ipcRenderer.invoke(CHANNEL.WINDOW_IS_ALWAYS_ON_TOP),
      toggleAlwaysOnTop: () => ipcRenderer.invoke(CHANNEL.WINDOW_TOGGLE_ALWAYS_ON_TOP),
      takeScreenshot: () => ipcRenderer.invoke(CHANNEL.WINDOW_TAKE_SCREENSHOT),
      openSubtitleDialog: () => ipcRenderer.invoke(CHANNEL.WINDOW_OPEN_SUBTITLE_DIALOG),
      minimize: () => ipcRenderer.invoke(CHANNEL.WINDOW_MINIMIZE),
      close: () => ipcRenderer.invoke(CHANNEL.WINDOW_CLOSE),
      hide: () => ipcRenderer.invoke(CHANNEL.WINDOW_HIDE),
      show: () => ipcRenderer.invoke(CHANNEL.WINDOW_SHOW),
      openBookInNewWindow: (bookId) => ipcRenderer.invoke(CHANNEL.WINDOW_OPEN_BOOK_IN_NEW_WINDOW, bookId),
      openVideoShell: (payload) => ipcRenderer.invoke(CHANNEL.WINDOW_OPEN_VIDEO_SHELL, payload),
    },
  };
};
