// IPC: Books UI state domain

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  ipcMain.handle(CHANNEL.BOOKS_UI_GET, (e, ...args) => domains.booksUi.get(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_UI_SAVE, (e, ...args) => domains.booksUi.save(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_UI_CLEAR, (e, ...args) => domains.booksUi.clear(ctx, e, ...args));
};
