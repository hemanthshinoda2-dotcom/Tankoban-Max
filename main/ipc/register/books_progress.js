// IPC: Books progress domain

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  ipcMain.handle(CHANNEL.BOOKS_PROGRESS_GET_ALL, (e, ...args) => domains.booksProgress.getAll(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_PROGRESS_GET, (e, ...args) => domains.booksProgress.get(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_PROGRESS_SAVE, (e, ...args) => domains.booksProgress.save(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_PROGRESS_CLEAR, (e, ...args) => domains.booksProgress.clear(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_PROGRESS_CLEAR_ALL, (e, ...args) => domains.booksProgress.clearAll(ctx, e, ...args));
};
