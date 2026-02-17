// IPC: Files domain

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  ipcMain.handle(CHANNEL.FILE_READ, async (e, ...args) => domains.filesDomain.read(ctx, e, ...args));
};
