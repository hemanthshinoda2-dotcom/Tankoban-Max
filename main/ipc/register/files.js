// IPC: Files domain

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  ipcMain.handle(CHANNEL.FILE_READ, async (e, ...args) => domains.filesDomain.read(ctx, e, ...args));
  ipcMain.handle(CHANNEL.FILE_LIST_FOLDER_VIDEOS, async (e, ...args) => domains.filesDomain.listFolderVideos(ctx, e, ...args));
};
