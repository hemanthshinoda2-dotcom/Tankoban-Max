// IPC: Holy Grail domain

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  ipcMain.handle(CHANNEL.HG_PROBE, (e, ...args) => domains.holyGrailDomain.probe(ctx, e, ...args));
  ipcMain.handle(CHANNEL.HG_INIT, (e, ...args) => domains.holyGrailDomain.initGpu(ctx, e, ...args));
  ipcMain.handle(CHANNEL.HG_RESIZE, (e, ...args) => domains.holyGrailDomain.resizeSurface(ctx, e, ...args));
  ipcMain.handle(CHANNEL.HG_LOAD, (e, ...args) => domains.holyGrailDomain.loadFile(ctx, e, ...args));
  ipcMain.handle(CHANNEL.HG_START_FRAME_LOOP, (e, ...args) => domains.holyGrailDomain.startFrameLoop(ctx, e, ...args));
  ipcMain.handle(CHANNEL.HG_STOP_FRAME_LOOP, (e, ...args) => domains.holyGrailDomain.stopFrameLoop(ctx, e, ...args));
  ipcMain.handle(CHANNEL.HG_COMMAND, (e, ...args) => domains.holyGrailDomain.command(ctx, e, ...args));
  ipcMain.handle(CHANNEL.HG_GET_PROPERTY, (e, ...args) => domains.holyGrailDomain.getProperty(ctx, e, ...args));
  ipcMain.handle(CHANNEL.HG_SET_PROPERTY, (e, ...args) => domains.holyGrailDomain.setProperty(ctx, e, ...args));
  ipcMain.handle(CHANNEL.HG_GET_STATE, (e, ...args) => domains.holyGrailDomain.getState(ctx, e, ...args));
  ipcMain.handle(CHANNEL.HG_GET_TRACK_LIST, (e, ...args) => domains.holyGrailDomain.getTrackList(ctx, e, ...args));
  ipcMain.handle(CHANNEL.HG_OBSERVE_PROPERTY, (e, ...args) => domains.holyGrailDomain.observeProperty(ctx, e, ...args));
  ipcMain.handle(CHANNEL.HG_DESTROY, (e, ...args) => domains.holyGrailDomain.destroy(ctx, e, ...args));
  ipcMain.handle(CHANNEL.HG_SET_PRESENTATION_ACTIVE, (e, ...args) => domains.holyGrailDomain.setPresentationActive(ctx, e, ...args));
  ipcMain.handle(CHANNEL.HG_GET_DIAGNOSTICS, (e, ...args) => domains.holyGrailDomain.getDiagnostics(ctx, e, ...args));
  ipcMain.handle(CHANNEL.HG_SET_DIAGNOSTICS_ENABLED, (e, ...args) => domains.holyGrailDomain.setDiagnosticsEnabled(ctx, e, ...args));
  ipcMain.handle(CHANNEL.HG_RESET_DIAGNOSTICS, (e, ...args) => domains.holyGrailDomain.resetDiagnostics(ctx, e, ...args));
};

