// IPC: Books TTS Progress domain (LISTEN_P4)

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  ipcMain.handle(CHANNEL.BOOKS_TTS_PROGRESS_GET_ALL, (e, ...args) => domains.booksTtsProgress.getAll(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_TTS_PROGRESS_GET,     (e, ...args) => domains.booksTtsProgress.get(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_TTS_PROGRESS_SAVE,    (e, ...args) => domains.booksTtsProgress.save(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_TTS_PROGRESS_CLEAR,   (e, ...args) => domains.booksTtsProgress.clear(ctx, e, ...args));
};
