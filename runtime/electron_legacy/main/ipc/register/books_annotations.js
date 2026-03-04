// IPC: Books annotations domain (BUILD_ANNOT)

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  ipcMain.handle(CHANNEL.BOOKS_ANNOTATIONS_GET, (e, ...args) => domains.booksAnnotations.get(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_ANNOTATIONS_SAVE, (e, ...args) => domains.booksAnnotations.save(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_ANNOTATIONS_DELETE, (e, ...args) => domains.booksAnnotations.delete(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_ANNOTATIONS_CLEAR, (e, ...args) => domains.booksAnnotations.clear(ctx, e, ...args));
};
