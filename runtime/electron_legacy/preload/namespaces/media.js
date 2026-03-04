// Preload namespaces: thumbs, archives, export, files, clipboard
module.exports = function({ ipcRenderer, CHANNEL, EVENT }) {
  return {
    thumbs: {
      has: (bookId) => ipcRenderer.invoke(CHANNEL.THUMBS_HAS, bookId),
      get: (bookId) => ipcRenderer.invoke(CHANNEL.THUMBS_GET, bookId),
      save: (bookId, dataUrl) => ipcRenderer.invoke(CHANNEL.THUMBS_SAVE, bookId, dataUrl),
      delete: (bookId) => ipcRenderer.invoke(CHANNEL.THUMBS_DELETE, bookId),
      hasPage: (bookId, pageIndex) => ipcRenderer.invoke(CHANNEL.PAGE_THUMBS_HAS, bookId, pageIndex),
      getPage: (bookId, pageIndex) => ipcRenderer.invoke(CHANNEL.PAGE_THUMBS_GET, bookId, pageIndex),
      savePage: (bookId, pageIndex, dataUrl) => ipcRenderer.invoke(CHANNEL.PAGE_THUMBS_SAVE, bookId, pageIndex, dataUrl),
    },

    archives: {
      cbzOpen: (filePath) => ipcRenderer.invoke(CHANNEL.CBZ_OPEN, filePath),
      cbzReadEntry: (sessionId, entryIndex) => ipcRenderer.invoke(CHANNEL.CBZ_READ_ENTRY, sessionId, entryIndex),
      cbzClose: (sessionId) => ipcRenderer.invoke(CHANNEL.CBZ_CLOSE, sessionId),
      cbrOpen: (filePath) => ipcRenderer.invoke(CHANNEL.CBR_OPEN, filePath),
      cbrReadEntry: (sessionId, entryIndex) => ipcRenderer.invoke(CHANNEL.CBR_READ_ENTRY, sessionId, entryIndex),
      cbrClose: (sessionId) => ipcRenderer.invoke(CHANNEL.CBR_CLOSE, sessionId),
    },

    export: {
      saveEntry: (payload) => ipcRenderer.invoke(CHANNEL.EXPORT_SAVE_ENTRY, payload),
      copyEntry: (payload) => ipcRenderer.invoke(CHANNEL.EXPORT_COPY_ENTRY, payload),
    },

    files: {
      read: (path) => ipcRenderer.invoke(CHANNEL.FILE_READ, path),
      listFolderVideos: (folderPath) => ipcRenderer.invoke(CHANNEL.FILE_LIST_FOLDER_VIDEOS, folderPath),
    },

    clipboard: {
      copyText: (text) => ipcRenderer.invoke(CHANNEL.CLIPBOARD_WRITE_TEXT, text),
    },
  };
};
