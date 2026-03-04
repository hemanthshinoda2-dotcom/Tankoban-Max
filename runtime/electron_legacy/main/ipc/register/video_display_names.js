// IPC: Video display names domain (RENAME-VIDEO)

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  ipcMain.handle(CHANNEL.VIDEO_DISPLAY_NAMES_GET_ALL, (e, ...args) => domains.videoDisplayNames.getAll(ctx, e, ...args));
  ipcMain.handle(CHANNEL.VIDEO_DISPLAY_NAMES_SAVE, (e, ...args) => domains.videoDisplayNames.save(ctx, e, ...args));
  ipcMain.handle(CHANNEL.VIDEO_DISPLAY_NAMES_CLEAR, (e, ...args) => domains.videoDisplayNames.clear(ctx, e, ...args));
};
