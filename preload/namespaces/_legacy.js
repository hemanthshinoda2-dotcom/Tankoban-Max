// Legacy alias layer — 100% backward compatibility
// Each alias delegates to the corresponding api namespace method.
module.exports = function({ api, ipcRenderer, CHANNEL }) {
  return {
    // window
    isFullscreen: (...args) => api.window.isFullscreen(...args),
    isMaximized: (...args) => api.window.isMaximized(...args),
    toggleFullscreen: (...args) => api.window.toggleFullscreen(...args),
    toggleMaximize: (...args) => api.window.toggleMaximize(...args),
    setFullscreen: (...args) => api.window.setFullscreen(...args),
    isAlwaysOnTop: (...args) => api.window.isAlwaysOnTop(...args),
    toggleAlwaysOnTop: (...args) => api.window.toggleAlwaysOnTop(...args),
    takeScreenshot: (...args) => api.window.takeScreenshot(...args),
    openSubtitleDialog: (...args) => api.window.openSubtitleDialog(...args),
    minimize: (...args) => api.window.minimize(...args),
    close: (...args) => api.window.close(...args),
    openBookInNewWindow: (...args) => api.window.openBookInNewWindow(...args),
    openVideoShell: (...args) => api.window.openVideoShell(...args),

    // shell
    revealPath: (...args) => api.shell.revealPath(...args),

    // library
    getLibraryState: (...args) => api.library.getState(...args),
    onLibraryUpdated: (...args) => api.library.onUpdated(...args),
    onLibraryScanStatus: (...args) => api.library.onScanStatus(...args),
    scanLibrary: (...args) => api.library.scan(...args),
    cancelLibraryScan: (...args) => api.library.cancelScan(...args),
    setLibraryScanIgnore: (...args) => api.library.setScanIgnore(...args),
    addRootFolder: (...args) => api.library.addRootFolder(...args),
    addSeriesFolder: (...args) => api.library.addSeriesFolder(...args),
    removeSeriesFolder: (...args) => api.library.removeSeriesFolder(...args),
    removeRootFolder: (...args) => api.library.removeRootFolder(...args),
    unignoreSeries: (...args) => api.library.unignoreSeries(...args),
    clearIgnoredSeries: (...args) => api.library.clearIgnoredSeries(...args),
    openComicFileDialog: (...args) => api.library.openComicFileDialog(...args),
    bookFromPath: (...args) => api.library.bookFromPath(...args),
    onAppOpenFiles: (...args) => api.library.onAppOpenFiles(...args),

    // books
    getBooksState: (...args) => api.books.getState(...args),
    onBooksUpdated: (...args) => api.books.onUpdated(...args),
    onBooksScanStatus: (...args) => api.books.onScanStatus(...args),
    scanBooksLibrary: (...args) => api.books.scan(...args),
    cancelBooksScan: (...args) => api.books.cancelScan(...args),
    addBooksRootFolder: (...args) => api.books.addRootFolder(...args),
    removeBooksRootFolder: (...args) => api.books.removeRootFolder(...args),
    addBooksSeriesFolder: (...args) => api.books.addSeriesFolder(...args),
    removeBooksSeriesFolder: (...args) => api.books.removeSeriesFolder(...args),
    addBookFiles: (...args) => api.books.addFiles(...args),
    removeBookFile: (...args) => api.books.removeFile(...args),
    openBookFileDialog: (...args) => api.books.openFileDialog(...args),
    booksBookFromPath: (...args) => api.books.bookFromPath(...args),
    booksTtsEdgeProbe: (...args) => api.booksTtsEdge.probe(...args),
    booksTtsEdgeGetVoices: (...args) => api.booksTtsEdge.getVoices(...args),
    booksTtsEdgeSynth: (...args) => api.booksTtsEdge.synth(...args),
    clearTtsAudioCache: (...args) => api.booksTtsEdge.cacheClear(...args),
    getTtsAudioCacheInfo: (...args) => api.booksTtsEdge.cacheInfo(...args),

    // video
    getVideoState: (...args) => api.video.getState(...args),
    onVideoUpdated: (...args) => api.video.onUpdated(...args),
    onVideoShellPlay: (...args) => api.video.onShellPlay(...args),
    onVideoScanStatus: (...args) => api.video.onScanStatus(...args),
    scanVideoLibrary: (...args) => api.video.scan(...args),
    cancelVideoScan: (...args) => api.video.cancelScan(...args),
    addVideoFolder: (...args) => api.video.addFolder(...args),
    removeVideoFolder: (...args) => api.video.removeFolder(...args),
    hideVideoShow: (...args) => api.video.hideShow(...args),
    openVideoFileDialog: (...args) => api.video.openFileDialog(...args),
    openSubtitleFileDialog: (...args) => api.video.openSubtitleFileDialog(...args),
    getEpisodesForShow: (...args) => api.video.getEpisodesForShow(...args),
    getEpisodesForRoot: (...args) => api.video.getEpisodesForRoot(...args),
    generateVideoShowThumbnail: (...args) => api.video.generateShowThumbnail(...args),

    // thumbs
    hasThumb: (...args) => api.thumbs.has(...args),
    getThumb: (...args) => api.thumbs.get(...args),
    saveThumb: (...args) => api.thumbs.save(...args),
    deleteThumb: (...args) => api.thumbs.delete(...args),
    hasPageThumb: (...args) => api.thumbs.hasPage(...args),
    getPageThumb: (...args) => api.thumbs.getPage(...args),
    savePageThumb: (...args) => api.thumbs.savePage(...args),

    // archives
    cbzOpen: (...args) => api.archives.cbzOpen(...args),
    cbzReadEntry: (...args) => api.archives.cbzReadEntry(...args),
    cbzClose: (...args) => api.archives.cbzClose(...args),
    cbrOpen: (...args) => api.archives.cbrOpen(...args),
    cbrReadEntry: (...args) => api.archives.cbrReadEntry(...args),
    cbrClose: (...args) => api.archives.cbrClose(...args),

    // export
    exportSaveEntry: (...args) => api.export.saveEntry(...args),
    exportCopyEntry: (...args) => api.export.copyEntry(...args),

    // files
    readFile: (...args) => api.files.read(...args),

    // clipboard
    copyText: (...args) => api.clipboard.copyText(...args),

    // progress
    getAllProgress: (...args) => api.progress.getAll(...args),
    getProgress: (...args) => api.progress.get(...args),
    saveProgress: (...args) => api.progress.save(...args),
    clearProgress: (...args) => api.progress.clear(...args),
    clearAllProgress: (...args) => api.progress.clearAll(...args),

    // booksProgress
    getAllBooksProgress: (...args) => api.booksProgress.getAll(...args),
    getBooksProgress: (...args) => api.booksProgress.get(...args),
    saveBooksProgress: (...args) => api.booksProgress.save(...args),
    clearBooksProgress: (...args) => api.booksProgress.clear(...args),
    clearAllBooksProgress: (...args) => api.booksProgress.clearAll(...args),

    // booksTtsProgress
    getAllBooksTtsProgress: (...args) => api.booksTtsProgress.getAll(...args),
    getBooksTtsProgress: (...args) => api.booksTtsProgress.get(...args),
    saveBooksTtsProgress: (...args) => api.booksTtsProgress.save(...args),
    clearBooksTtsProgress: (...args) => api.booksTtsProgress.clear(...args),

    // videoProgress
    getAllVideoProgress: (...args) => api.videoProgress.getAll(...args),
    getVideoProgress: (...args) => api.videoProgress.get(...args),
    saveVideoProgress: (...args) => api.videoProgress.save(...args),
    clearVideoProgress: (...args) => api.videoProgress.clear(...args),
    clearAllVideoProgress: (...args) => api.videoProgress.clearAll(...args),

    // videoSettings
    getVideoSettings: (...args) => api.videoSettings.get(...args),
    saveVideoSettings: (...args) => api.videoSettings.save(...args),
    clearVideoSettings: (...args) => api.videoSettings.clear(...args),

    // booksSettings
    getBooksSettings: (...args) => api.booksSettings.get(...args),
    saveBooksSettings: (...args) => api.booksSettings.save(...args),
    clearBooksSettings: (...args) => api.booksSettings.clear(...args),

    // videoUi
    getVideoUiState: (...args) => api.videoUi.getState(...args),
    saveVideoUiState: (...args) => api.videoUi.saveState(...args),
    clearVideoUiState: (...args) => api.videoUi.clearState(...args),

    // booksUi
    getBooksUiState: (...args) => api.booksUi.get(...args),
    saveBooksUiState: (...args) => api.booksUi.save(...args),
    clearBooksUiState: (...args) => api.booksUi.clear(...args),

    // videoPoster
    getVideoPoster: (...args) => api.videoPoster.get(...args),
    hasVideoPoster: (...args) => api.videoPoster.has(...args),
    saveVideoPoster: (...args) => api.videoPoster.save(...args),
    deleteVideoPoster: (...args) => api.videoPoster.delete(...args),
    pasteVideoPoster: (...args) => api.videoPoster.paste(...args),

    // seriesSettings
    getSeriesSettings: (...args) => api.seriesSettings.get(...args),
    saveSeriesSettings: (...args) => api.seriesSettings.save(...args),
    clearSeriesSettings: (...args) => api.seriesSettings.clear(...args),

    // BUILD 88: Health check (uses ipcRenderer directly — no api.health namespace)
    ping: () => ipcRenderer.invoke(CHANNEL.HEALTH_PING),
  };
};
