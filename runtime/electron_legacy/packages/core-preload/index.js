'use strict';

function createFeatureFacade(api) {
  var src = api && typeof api === 'object' ? api : {};
  return {
    sources: {
      openSources: function () { return src.web && src.web.openSources ? src.web.openSources() : Promise.resolve({ ok: false }); },
      openSearch: function () { return src.web && src.web.openSourcesSearch ? src.web.openSourcesSearch() : Promise.resolve({ ok: false }); },
      openDownloads: function () { return src.web && src.web.openSourcesDownloads ? src.web.openSourcesDownloads() : Promise.resolve({ ok: false }); },
      health: function () { return src.torrentSearch && src.torrentSearch.health ? src.torrentSearch.health() : Promise.resolve({ ok: false }); },
      search: function (payload) { return src.torrentSearch && src.torrentSearch.query ? src.torrentSearch.query(payload) : Promise.resolve({ ok: false, items: [] }); },
      indexers: function () { return src.torrentSearch && src.torrentSearch.indexers ? src.torrentSearch.indexers() : Promise.resolve({ ok: false, indexers: [] }); },
      resolveMetadata: function (payload) { return src.webTorrent && src.webTorrent.resolveMetadata ? src.webTorrent.resolveMetadata(payload) : Promise.resolve({ ok: false }); },
      startConfigured: function (payload) { return src.webTorrent && src.webTorrent.startConfigured ? src.webTorrent.startConfigured(payload) : Promise.resolve({ ok: false }); },
      cancelResolve: function (payload) { return src.webTorrent && src.webTorrent.cancelResolve ? src.webTorrent.cancelResolve(payload) : Promise.resolve({ ok: false }); },
      startMagnet: function (payload) { return src.webTorrent && src.webTorrent.startMagnet ? src.webTorrent.startMagnet(payload) : Promise.resolve({ ok: false }); },
    },
    torrent: {
      getActive: function () { return src.webTorrent && src.webTorrent.getActive ? src.webTorrent.getActive() : Promise.resolve({ ok: false, torrents: [] }); },
      getHistory: function () { return src.webTorrent && src.webTorrent.getHistory ? src.webTorrent.getHistory() : Promise.resolve({ ok: false, torrents: [] }); },
      selectFiles: function (payload) { return src.webTorrent && src.webTorrent.selectFiles ? src.webTorrent.selectFiles(payload) : Promise.resolve({ ok: false }); },
      removeHistory: function (payload) { return src.webTorrent && src.webTorrent.removeHistory ? src.webTorrent.removeHistory(payload) : Promise.resolve({ ok: false }); },
      remove: function (payload) { return src.webTorrent && src.webTorrent.remove ? src.webTorrent.remove(payload) : Promise.resolve({ ok: false }); },
      pauseAll: function () { return src.webTorrent && src.webTorrent.pauseAll ? src.webTorrent.pauseAll() : Promise.resolve({ ok: false }); },
      resumeAll: function () { return src.webTorrent && src.webTorrent.resumeAll ? src.webTorrent.resumeAll() : Promise.resolve({ ok: false }); },
      onStarted: function (cb) { if (src.webTorrent && src.webTorrent.onStarted) src.webTorrent.onStarted(cb); },
      onMetadata: function (cb) { if (src.webTorrent && src.webTorrent.onMetadata) src.webTorrent.onMetadata(cb); },
      onProgress: function (cb) { if (src.webTorrent && src.webTorrent.onProgress) src.webTorrent.onProgress(cb); },
      onCompleted: function (cb) { if (src.webTorrent && src.webTorrent.onCompleted) src.webTorrent.onCompleted(cb); },
      onMagnetDetected: function (cb) { if (src.webTorrent && src.webTorrent.onMagnetDetected) src.webTorrent.onMagnetDetected(cb); },
    },
    video: {
      getState: function () { return src.video && src.video.getState ? src.video.getState() : Promise.resolve({ ok: false }); },
      getPlayerPreference: function () { return src.videoSettings && src.videoSettings.get ? src.videoSettings.get() : Promise.resolve({}); },
      setPlayerPreference: function (payload) { return src.videoSettings && src.videoSettings.save ? src.videoSettings.save(payload) : Promise.resolve({ ok: false }); },
    },
    browser: {
      getSettings: function () { return src.webBrowserSettings && src.webBrowserSettings.get ? src.webBrowserSettings.get() : Promise.resolve({ ok: false }); },
      saveSettings: function (payload) { return src.webBrowserSettings && src.webBrowserSettings.save ? src.webBrowserSettings.save(payload) : Promise.resolve({ ok: false }); },
    },
    books: {
      getState: function () { return src.books && src.books.getState ? src.books.getState() : Promise.resolve({}); },
      scan: function (payload) { return src.books && src.books.scan ? src.books.scan(payload) : Promise.resolve({ ok: false }); },
      cancelScan: function () { return src.books && src.books.cancelScan ? src.books.cancelScan() : Promise.resolve({ ok: false }); },
      addRootFolder: function () { return src.books && src.books.addRootFolder ? src.books.addRootFolder() : Promise.resolve({ ok: false }); },
      addSeriesFolder: function () { return src.books && src.books.addSeriesFolder ? src.books.addSeriesFolder() : Promise.resolve({ ok: false }); },
      addFiles: function () { return src.books && src.books.addFiles ? src.books.addFiles() : Promise.resolve({ ok: false }); },
      openFileDialog: function () { return src.books && src.books.openFileDialog ? src.books.openFileDialog() : Promise.resolve({ ok: false }); },
      booksProgressGetAll: function () { return src.booksProgress && src.booksProgress.getAll ? src.booksProgress.getAll() : Promise.resolve({}); },
      booksProgressGet: function (bookId) { return src.booksProgress && src.booksProgress.get ? src.booksProgress.get(bookId) : Promise.resolve(null); },
      booksProgressSave: function (bookId, payload) { return src.booksProgress && src.booksProgress.save ? src.booksProgress.save(bookId, payload) : Promise.resolve({ ok: false }); },
      booksProgressClear: function (bookId) { return src.booksProgress && src.booksProgress.clear ? src.booksProgress.clear(bookId) : Promise.resolve({ ok: false }); },
      booksProgressClearAll: function () { return src.booksProgress && src.booksProgress.clearAll ? src.booksProgress.clearAll() : Promise.resolve({ ok: false }); },
      booksUiGet: function () { return src.booksUi && src.booksUi.get ? src.booksUi.get() : Promise.resolve({}); },
      booksUiSave: function (payload) { return src.booksUi && src.booksUi.save ? src.booksUi.save(payload) : Promise.resolve({ ok: false }); },
      booksDisplayNamesGetAll: function () { return src.booksDisplayNames && src.booksDisplayNames.getAll ? src.booksDisplayNames.getAll() : Promise.resolve({}); },
      booksDisplayNamesSave: function (id, val) { return src.booksDisplayNames && src.booksDisplayNames.save ? src.booksDisplayNames.save(id, val) : Promise.resolve({ ok: false }); },
      booksDisplayNamesClear: function (id) { return src.booksDisplayNames && src.booksDisplayNames.clear ? src.booksDisplayNames.clear(id) : Promise.resolve({ ok: false }); },
      saveTtsProgress: function (id, payload) {
        if (src.booksTtsProgress && src.booksTtsProgress.save) return src.booksTtsProgress.save(id, payload);
        if (typeof src.saveBooksTtsProgress === 'function') return src.saveBooksTtsProgress(id, payload);
        return Promise.resolve({ ok: false });
      },
      getTtsProgress: function (id) {
        if (src.booksTtsProgress && src.booksTtsProgress.get) return src.booksTtsProgress.get(id);
        if (typeof src.getBooksTtsProgress === 'function') return src.getBooksTtsProgress(id);
        return Promise.resolve(null);
      },
      getAllTtsProgress: function () {
        if (src.booksTtsProgress && src.booksTtsProgress.getAll) return src.booksTtsProgress.getAll();
        if (typeof src.getAllBooksTtsProgress === 'function') return src.getAllBooksTtsProgress();
        return Promise.resolve({});
      },
      clearTtsProgress: function (id) {
        if (src.booksTtsProgress && src.booksTtsProgress.clear) return src.booksTtsProgress.clear(id);
        if (typeof src.clearBooksTtsProgress === 'function') return src.clearBooksTtsProgress(id);
        return Promise.resolve({ ok: false });
      },
      api: {
        books: src.books || {},
        booksProgress: src.booksProgress || {},
        booksUi: src.booksUi || {},
        booksDisplayNames: src.booksDisplayNames || {},
        booksBookmarks: src.booksBookmarks || {},
        booksAnnotations: src.booksAnnotations || {},
        booksSettings: src.booksSettings || {},
        booksTtsEdge: src.booksTtsEdge || {},
        audiobooks: src.audiobooks || {},
        thumbs: src.thumbs || {},
        files: src.files || {},
        shell: src.shell || {},
        clipboard: src.clipboard || {},
        clearBooksTtsProgress: typeof src.clearBooksTtsProgress === 'function' ? src.clearBooksTtsProgress : null,
        getBooksTtsProgress: typeof src.getBooksTtsProgress === 'function' ? src.getBooksTtsProgress : null,
        getAllBooksTtsProgress: typeof src.getAllBooksTtsProgress === 'function' ? src.getAllBooksTtsProgress : null,
        saveBooksTtsProgress: typeof src.saveBooksTtsProgress === 'function' ? src.saveBooksTtsProgress : null,
      },
    },
    comics: {
      getProgress: function (bookId) { return src.progress && src.progress.get ? src.progress.get(bookId) : Promise.resolve(null); },
      saveProgress: function (bookId, payload) { return src.progress && src.progress.save ? src.progress.save(bookId, payload) : Promise.resolve({ ok: false }); },
      cbzOpen: function (filePath) { return src.archives && src.archives.cbzOpen ? src.archives.cbzOpen(filePath) : Promise.resolve({}); },
      cbzReadEntry: function (sid, idx) { return src.archives && src.archives.cbzReadEntry ? src.archives.cbzReadEntry(sid, idx) : Promise.resolve(null); },
      cbzClose: function (sid) { return src.archives && src.archives.cbzClose ? src.archives.cbzClose(sid) : Promise.resolve({ ok: false }); },
      cbrOpen: function (filePath) { return src.archives && src.archives.cbrOpen ? src.archives.cbrOpen(filePath) : Promise.resolve({}); },
      cbrReadEntry: function (sid, idx) { return src.archives && src.archives.cbrReadEntry ? src.archives.cbrReadEntry(sid, idx) : Promise.resolve(null); },
      cbrClose: function (sid) { return src.archives && src.archives.cbrClose ? src.archives.cbrClose(sid) : Promise.resolve({ ok: false }); },
      api: {
        progress: src.progress || {},
        archives: src.archives || {},
      },
    },
  };
}

module.exports = {
  name: 'core-preload',
  ownership: 'Preload bridge composition and namespace exposure.',
  current: {
    entry: 'preload/index.js',
    namespaces: 'preload/namespaces',
    legacyAliases: 'preload/namespaces/_legacy.js',
  },
  createFeatureFacade: createFeatureFacade,
};
