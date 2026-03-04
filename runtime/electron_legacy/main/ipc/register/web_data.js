// IPC registration for web browsing data management.

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  var d = domains.webDataDomain;
  ipcMain.handle(CHANNEL.WEB_CLEAR_BROWSING_DATA, function (e, payload) { return d.clear(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_BROWSING_DATA_USAGE, function (e) { return d.usage(ctx, e); });
};
