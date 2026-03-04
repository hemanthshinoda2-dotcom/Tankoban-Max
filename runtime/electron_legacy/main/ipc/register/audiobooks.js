// IPC: Audiobook library domain (FEAT-AUDIOBOOK)

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  ipcMain.handle(CHANNEL.AUDIOBOOK_GET_STATE, (e, ...args) => domains.audiobooksDomain.getState(ctx, e, ...args));
  ipcMain.handle(CHANNEL.AUDIOBOOK_SCAN, (e, ...args) => domains.audiobooksDomain.scan(ctx, e, ...args));
  ipcMain.handle(CHANNEL.AUDIOBOOK_ADD_ROOT_FOLDER, (e, ...args) => domains.audiobooksDomain.addRootFolder(ctx, e, ...args));
  ipcMain.handle(CHANNEL.AUDIOBOOK_ADD_FOLDER, (e, ...args) => domains.audiobooksDomain.addFolder(ctx, e, ...args));
  ipcMain.handle(CHANNEL.AUDIOBOOK_REMOVE_ROOT_FOLDER, (e, ...args) => domains.audiobooksDomain.removeRootFolder(ctx, e, ...args));
};
