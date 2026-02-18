// IPC: Books Edge TTS bridge (FIX-R08)

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  ipcMain.handle(CHANNEL.BOOKS_TTS_EDGE_PROBE, (e, ...args) => domains.booksTtsEdgeDomain.probe(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_TTS_EDGE_GET_VOICES, (e, ...args) => domains.booksTtsEdgeDomain.getVoices(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_TTS_EDGE_SYNTH, (e, ...args) => domains.booksTtsEdgeDomain.synth(ctx, e, ...args));
  ipcMain.handle(CHANNEL.BOOKS_TTS_EDGE_WARMUP, (e, ...args) => domains.booksTtsEdgeDomain.warmup(ctx, e, ...args)); // FIX-TTS04
  ipcMain.handle(CHANNEL.BOOKS_TTS_EDGE_RESET_INSTANCE, (e, ...args) => domains.booksTtsEdgeDomain.resetInstance(ctx, e, ...args)); // FIX-TTS06
};
