// IPC: Audiobook chapter pairing domain (FEAT-AUDIOBOOK)

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  ipcMain.handle(CHANNEL.AUDIOBOOK_PAIRING_GET, (e, ...args) => domains.audiobookPairing.get(ctx, e, ...args));
  ipcMain.handle(CHANNEL.AUDIOBOOK_PAIRING_SAVE, (e, ...args) => domains.audiobookPairing.save(ctx, e, ...args));
  ipcMain.handle(CHANNEL.AUDIOBOOK_PAIRING_DELETE, (e, ...args) => domains.audiobookPairing.remove(ctx, e, ...args));
  ipcMain.handle(CHANNEL.AUDIOBOOK_PAIRING_GET_ALL, (e, ...args) => domains.audiobookPairing.getAll(ctx, e, ...args));
};
