// IPC: Audiobook progress domain (FEAT-AUDIOBOOK)

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  ipcMain.handle(CHANNEL.AUDIOBOOK_PROGRESS_GET_ALL, (e, ...args) => domains.audiobookProgress.getAll(ctx, e, ...args));
  ipcMain.handle(CHANNEL.AUDIOBOOK_PROGRESS_GET, (e, ...args) => domains.audiobookProgress.get(ctx, e, ...args));
  ipcMain.handle(CHANNEL.AUDIOBOOK_PROGRESS_SAVE, (e, ...args) => domains.audiobookProgress.save(ctx, e, ...args));
  ipcMain.handle(CHANNEL.AUDIOBOOK_PROGRESS_CLEAR, (e, ...args) => domains.audiobookProgress.clear(ctx, e, ...args));
};
