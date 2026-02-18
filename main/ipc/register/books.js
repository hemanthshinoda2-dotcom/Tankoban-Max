// IPC: Books library domain

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  ipcMain.handle(CHANNEL.BOOKS_GET_STATE, (e, ...args) => domains.booksDomain.getState(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_SCAN, (e, ...args) => domains.booksDomain.scan(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_CANCEL_SCAN, (e, ...args) => domains.booksDomain.cancelScan(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_SET_SCAN_IGNORE, (e, ...args) => domains.booksDomain.setScanIgnore(ctx, e, ...args));

  ipcMain.handle(CHANNEL.BOOKS_ADD_ROOT_FOLDER, (e, ...args) => domains.booksDomain.addRootFolder(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_REMOVE_ROOT_FOLDER, (e, ...args) => domains.booksDomain.removeRootFolder(ctx, e, ...args));

  ipcMain.handle(CHANNEL.BOOKS_ADD_SERIES_FOLDER, (e, ...args) => domains.booksDomain.addSeriesFolder(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_REMOVE_SERIES_FOLDER, (e, ...args) => domains.booksDomain.removeSeriesFolder(ctx, e, ...args));

  ipcMain.handle(CHANNEL.BOOKS_ADD_FILES, (e, ...args) => domains.booksDomain.addFiles(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_REMOVE_FILE, (e, ...args) => domains.booksDomain.removeFile(ctx, e, ...args));

  ipcMain.handle(CHANNEL.BOOKS_OPEN_FILE_DIALOG, (e, ...args) => domains.booksDomain.openFileDialog(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_BOOK_FROM_PATH, (e, ...args) => domains.booksDomain.bookFromPath(ctx, e, ...args));
};
