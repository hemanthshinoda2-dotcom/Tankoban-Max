// IPC registration for web session domain.

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  var d = domains.webSessionDomain;
  ipcMain.handle(CHANNEL.WEB_SESSION_GET, function (e) { return d.get(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_SESSION_SAVE, function (e, payload) { return d.save(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_SESSION_CLEAR, function (e) { return d.clear(ctx, e); });
};
