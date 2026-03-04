// IPC: Books bookmarks domain (WAVE3)

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  ipcMain.handle(CHANNEL.BOOKS_BOOKMARKS_GET, (e, ...args) => domains.booksBookmarks.get(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_BOOKMARKS_SAVE, (e, ...args) => domains.booksBookmarks.save(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_BOOKMARKS_DELETE, (e, ...args) => domains.booksBookmarks.delete(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_BOOKMARKS_CLEAR, (e, ...args) => domains.booksBookmarks.clear(ctx, e, ...args));
};
