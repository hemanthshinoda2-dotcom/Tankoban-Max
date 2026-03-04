// IPC: Books reader settings domain

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  ipcMain.handle(CHANNEL.BOOKS_SETTINGS_GET, (e, ...args) => domains.booksSettings.get(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_SETTINGS_SAVE, (e, ...args) => domains.booksSettings.save(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_SETTINGS_CLEAR, (e, ...args) => domains.booksSettings.clear(ctx, e, ...args));
};
