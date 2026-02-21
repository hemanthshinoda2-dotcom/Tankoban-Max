// Preload namespaces: booksProgress, booksTtsProgress, booksBookmarks,
//   booksAnnotations, booksDisplayNames, booksSettings, booksUi
module.exports = function({ ipcRenderer, CHANNEL, EVENT }) {
  return {
    booksProgress: {
      getAll: () => ipcRenderer.invoke(CHANNEL.BOOKS_PROGRESS_GET_ALL),
      get: (bookId) => ipcRenderer.invoke(CHANNEL.BOOKS_PROGRESS_GET, bookId),
      save: (bookId, progress) => ipcRenderer.invoke(CHANNEL.BOOKS_PROGRESS_SAVE, bookId, progress),
      clear: (bookId) => ipcRenderer.invoke(CHANNEL.BOOKS_PROGRESS_CLEAR, bookId),
      clearAll: () => ipcRenderer.invoke(CHANNEL.BOOKS_PROGRESS_CLEAR_ALL),
    },

    booksTtsProgress: {
      getAll: () => ipcRenderer.invoke(CHANNEL.BOOKS_TTS_PROGRESS_GET_ALL),
      get: (bookId) => ipcRenderer.invoke(CHANNEL.BOOKS_TTS_PROGRESS_GET, bookId),
      save: (bookId, entry) => ipcRenderer.invoke(CHANNEL.BOOKS_TTS_PROGRESS_SAVE, bookId, entry),
      clear: (bookId) => ipcRenderer.invoke(CHANNEL.BOOKS_TTS_PROGRESS_CLEAR, bookId),
    },

    booksBookmarks: {
      get: (bookId) => ipcRenderer.invoke(CHANNEL.BOOKS_BOOKMARKS_GET, bookId),
      save: (bookId, bookmark) => ipcRenderer.invoke(CHANNEL.BOOKS_BOOKMARKS_SAVE, bookId, bookmark),
      delete: (bookId, bookmarkId) => ipcRenderer.invoke(CHANNEL.BOOKS_BOOKMARKS_DELETE, bookId, bookmarkId),
      clear: (bookId) => ipcRenderer.invoke(CHANNEL.BOOKS_BOOKMARKS_CLEAR, bookId),
    },

    booksAnnotations: {
      get: (bookId) => ipcRenderer.invoke(CHANNEL.BOOKS_ANNOTATIONS_GET, bookId),
      save: (bookId, annotation) => ipcRenderer.invoke(CHANNEL.BOOKS_ANNOTATIONS_SAVE, bookId, annotation),
      delete: (bookId, annotationId) => ipcRenderer.invoke(CHANNEL.BOOKS_ANNOTATIONS_DELETE, bookId, annotationId),
      clear: (bookId) => ipcRenderer.invoke(CHANNEL.BOOKS_ANNOTATIONS_CLEAR, bookId),
    },

    booksDisplayNames: {
      getAll: () => ipcRenderer.invoke(CHANNEL.BOOKS_DISPLAY_NAMES_GET_ALL),
      save: (bookId, name) => ipcRenderer.invoke(CHANNEL.BOOKS_DISPLAY_NAMES_SAVE, bookId, name),
      clear: (bookId) => ipcRenderer.invoke(CHANNEL.BOOKS_DISPLAY_NAMES_CLEAR, bookId),
    },

    booksSettings: {
      get: () => ipcRenderer.invoke(CHANNEL.BOOKS_SETTINGS_GET),
      save: (settings) => ipcRenderer.invoke(CHANNEL.BOOKS_SETTINGS_SAVE, settings),
      clear: () => ipcRenderer.invoke(CHANNEL.BOOKS_SETTINGS_CLEAR),
    },

    booksUi: {
      get: () => ipcRenderer.invoke(CHANNEL.BOOKS_UI_GET),
      save: (ui) => ipcRenderer.invoke(CHANNEL.BOOKS_UI_SAVE, ui),
      clear: () => ipcRenderer.invoke(CHANNEL.BOOKS_UI_CLEAR),
    },
  };
};
