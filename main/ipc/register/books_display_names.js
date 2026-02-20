// IPC: Books display names domain (RENAME-BOOK)

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  ipcMain.handle(CHANNEL.BOOKS_DISPLAY_NAMES_GET_ALL, (e, ...args) => domains.booksDisplayNames.getAll(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_DISPLAY_NAMES_SAVE, (e, ...args) => domains.booksDisplayNames.save(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_DISPLAY_NAMES_CLEAR, (e, ...args) => domains.booksDisplayNames.clear(ctx, e, ...args));
};
